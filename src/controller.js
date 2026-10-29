'use strict'

const { runInGameFrames } = require('./game-shield')
const settingPath = 'plugin.damage-shield.shieldEnabled'

class ShieldController {
  constructor({ getStore, config, store, clock = globalThis }) {
    this.getStore = getStore
    this.config = config
    this.store = store
    this.clock = clock
    this.owner = `damage-shield-${Date.now()}-${Math.random().toString(36).slice(2)}`
    this.epoch = 0
    this.enabled = config.get(settingPath, true)
    this.running = false
    this.view = null
    this.pending = null
    this.targets = new Map()
    this.listeners = new Set()
    this.snapshot = { message: '等待游戏画面', frames: [], enabled: this.enabled, canTest: false }
    this.onLoaded = () => this.refresh()
  }

  subscribe(listener) {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  publish(update) {
    const wasReady = this.snapshot.canTest
    this.snapshot = { ...this.snapshot, ...update, enabled: this.enabled }
    for (const listener of this.listeners) listener(this.snapshot)
    if (wasReady !== this.snapshot.canTest) this.schedulePolling()
  }

  schedulePolling() {
    if (!this.running) return
    if (this.timer != null) this.clock.clearInterval(this.timer)
    this.timer = this.clock.setInterval(() => this.refresh(), this.snapshot.canTest ? 1000 : 250)
  }

  start() {
    if (this.running) return
    this.running = true
    // Publish before any Electron IPC can wait for page loading.
    this.publish({ message: '等待游戏画面', canTest: false })
    this.schedulePolling()
    if (this.store && typeof this.store.subscribe === 'function') {
      this.unsubscribeStore = this.store.subscribe(() => {
        try {
          if (this.getStore('layout.webview.ref') !== this.view) this.refresh()
        } catch (_) {}
      })
    }
    this.refresh()
  }

  script(command, owner, singleFrame = false) {
    return `(${runInGameFrames.toString()})(${JSON.stringify(command)},${JSON.stringify({
      owner, enabled: this.enabled, singleFrame,
    })})`
  }

  retire(entry) {
    // Clean up after an old IPC finishes too. Ownership is scoped to the
    // connection, so delayed cleanup cannot remove a newer connection's hooks.
    const dispose = () => {
      try { return Promise.resolve(entry.execute(this.script('dispose', entry.owner, entry.singleFrame))).catch(() => {}) }
      catch (_) { return Promise.resolve() }
    }
    return entry.pending ? entry.pending.then(dispose, dispose) : dispose()
  }

  bindView(view) {
    if (this.view === view) return
    this.unbindView()
    for (const entry of this.targets.values()) this.retire(entry)
    this.targets.clear()
    this.epoch++
    this.view = view
    this.publish({ message: '等待游戏画面', frames: [], canTest: false })
    if (view && view.addEventListener) {
      view.addEventListener('dom-ready', this.onLoaded)
      view.addEventListener('did-frame-finish-load', this.onLoaded)
    }
  }

  unbindView() {
    if (this.view && this.view.removeEventListener) {
      this.view.removeEventListener('dom-ready', this.onLoaded)
      this.view.removeEventListener('did-frame-finish-load', this.onLoaded)
    }
    this.view = null
  }

  getTargets(view) {
    // WebContents.executeJavaScript (used by <webview>) waits for the WHOLE
    // page to stop loading. WebFrameMain executes in each already-live frame,
    // so a slow DMM resource does not hold the game detector hostage.
    try {
      const contents = typeof view.getWebContents === 'function' && view.getWebContents()
      const root = contents && contents.mainFrame
      if (root) {
        const frames = root.framesInSubtree || [root]
        return Array.from(frames).filter(frame => !frame.detached && typeof frame.executeJavaScript === 'function')
          .map(frame => ({ key: frame, execute: script => frame.executeJavaScript(script), singleFrame: true }))
      }
    } catch (_) {}
    return typeof view.executeJavaScript === 'function' ?
      [{ key: view, execute: script => view.executeJavaScript(script), singleFrame: false }] : []
  }

  publishFrames() {
    const frames = Array.from(this.targets.values()).flatMap(entry => entry.frames)
    const ready = frames.filter(frame => frame.hooks > 0)
    const canTest = ready.some(frame => frame.renderCount > 0)
    const error = ready.find(frame => frame.error) || (!ready.length && frames.find(frame => frame.error))
    let message = this.view ? '等待游戏加载' : '等待游戏画面'
    if (error) message = `检测异常：${error.error}`
    else if (ready.length) {
      message = ready.some(frame => frame.covered) ? '正在遮挡' :
        ready.some(frame => frame.animationCount > 0) ? '自动遮挡运行中' :
        canTest ? '自动遮挡已就绪' : '正在连接游戏画面'
    } else if (frames.some(frame => frame.hooks === 0)) {
      message = '暂时无法识别游戏画面，请反馈版本信息'
    }
    this.publish({ message, frames, canTest })
  }

  runTarget(entry, command) {
    if (entry.pending) {
      // Keep at most one call in flight in each frame. Other game frames can
      // progress independently, even when an advertisement frame is stalled.
      if (command !== 'sync') entry.queued = command
      return entry.pending
    }
    const current = () => this.running && this.targets.get(entry.key) === entry
    const task = (async () => {
      try {
        const frames = await entry.execute(this.script(command, entry.owner, entry.singleFrame))
        if (!current()) return
        entry.frames = Array.isArray(frames) ? frames : []
        // Publish each frame as it responds, without waiting for unrelated ones.
        this.publishFrames()
      } catch (_) {
        if (current()) { entry.frames = []; this.publishFrames() }
      }
    })()
    entry.pending = task
    task.then(() => {
      entry.pending = null
      if (entry.queued && current()) {
        const queued = entry.queued
        entry.queued = null
        this.runTarget(entry, queued)
      }
    })
    return task
  }

  refresh(command = 'sync') {
    if (!this.running) return Promise.resolve()
    let descriptors
    try {
      const view = this.getStore('layout.webview.ref')
      this.bindView(view)
      descriptors = view ? this.getTargets(view) : []
    } catch (error) {
      this.publish({ message: `等待游戏画面：${error.message || error}`, canTest: false })
      return Promise.resolve()
    }
    const present = new Set(descriptors.map(target => target.key))
    let changed = false
    for (const [key, entry] of this.targets) {
      if (!present.has(key)) { this.targets.delete(key); this.retire(entry); changed = true }
    }
    for (const descriptor of descriptors) {
      if (!this.targets.has(descriptor.key)) {
        this.targets.set(descriptor.key, { ...descriptor, frames: [], pending: null,
          owner: `${this.owner}-${this.epoch}` })
        changed = true
      }
    }
    if (!descriptors.length) {
      this.publish({ message: '等待游戏画面', frames: [], canTest: false })
    } else if (changed) this.publishFrames()
    const jobs = []
    for (const entry of this.targets.values()) {
      // A manual test is meaningful only in the game frames we have connected.
      if (command === 'test' && !entry.frames.some(frame => frame.hooks > 0 && frame.renderCount > 0)) continue
      // Do not accumulate Promise.all waiters for a permanently stalled frame
      // on every polling tick. Its original request will publish on completion.
      if (command === 'sync' && entry.pending) continue
      jobs.push(this.runTarget(entry, command))
    }
    const task = Promise.all(jobs)
    this.pending = task
    task.then(() => { if (this.pending === task) this.pending = null })
    return task
  }

  setEnabled(value) {
    this.enabled = Boolean(value)
    this.config.set(settingPath, this.enabled)
    this.publish({})
    this.refresh('sync-now')
  }

  async test() {
    if (!this.snapshot.canTest) {
      this.publish({ message: '游戏画面正在加载，暂时无法测试黑幕' })
      this.refresh()
      return false
    }
    if (!this.enabled) this.setEnabled(true)
    await this.refresh('test')
    return true
  }

  async stop() {
    this.running = false
    if (this.timer != null) this.clock.clearInterval(this.timer)
    if (this.unsubscribeStore) this.unsubscribeStore()
    this.unbindView()
    const cleanups = Array.from(this.targets.values(), entry => this.retire(entry))
    this.targets.clear()
    this.publish({ message: '插件已停止', frames: [], canTest: false })
    this.listeners.clear()
    await Promise.all(cleanups)
  }
}

module.exports = { ShieldController }
