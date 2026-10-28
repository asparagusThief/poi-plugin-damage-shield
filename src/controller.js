'use strict'

const { runInGameFrames } = require('./game-shield')
const settingPath = 'plugin.damage-shield.shieldEnabled'

class ShieldController {
  constructor({ getStore, config, clock = globalThis }) {
    this.getStore = getStore
    this.config = config
    this.clock = clock
    this.owner = `damage-shield-${Date.now()}-${Math.random().toString(36).slice(2)}`
    this.enabled = config.get(settingPath, true)
    this.running = false
    this.view = null
    this.pending = null
    this.listeners = new Set()
    this.snapshot = { message: '等待游戏画面', frames: [], enabled: this.enabled }
    this.onLoaded = () => this.refresh()
  }

  subscribe(listener) {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  publish(update) {
    this.snapshot = { ...this.snapshot, ...update, enabled: this.enabled }
    for (const listener of this.listeners) listener(this.snapshot)
  }

  start() {
    if (this.running) return
    this.running = true
    this.refresh()
    this.timer = this.clock.setInterval(() => this.refresh(), 1000)
  }

  bindView(view) {
    if (this.view === view) return
    const previous = this.view
    this.unbindView()
    if (previous && typeof previous.executeJavaScript === 'function') {
      Promise.resolve(previous.executeJavaScript(this.script('dispose'))).catch(() => {})
    }
    this.view = view
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

  script(command) {
    return `(${runInGameFrames.toString()})(${JSON.stringify(command)},${JSON.stringify({
      owner: this.owner, enabled: this.enabled,
    })})`
  }

  async refresh(command = 'sync') {
    if (!this.running) return
    // Commands wait for an ongoing poll; polls never pile up behind a slow
    // webview. Re-read the ref because poi can move the game to another window.
    if (this.pending) {
      if (command === 'sync') return this.pending
      await this.pending
      if (!this.running) return
      return this.refresh(command)
    }
    let view
    try {
      view = this.getStore('layout.webview.ref')
      this.bindView(view)
    } catch (error) {
      this.publish({ message: `等待游戏画面：${error.message || error}`, frames: [] })
      return
    }
    if (!view || typeof view.executeJavaScript !== 'function') {
      this.publish({ message: '等待游戏画面', frames: [] })
      return
    }
    const task = (async () => {
      try {
        const frames = await view.executeJavaScript(this.script(command))
        if (!this.running || view !== this.view) return
        const ready = frames.filter(frame => frame.hooks > 0)
        const error = frames.find(frame => frame.error)
        let message = '等待游戏加载'
        if (error) message = `检测异常：${error.error}`
        else if (ready.length) {
          message = ready.some(frame => frame.covered) ? '正在遮挡' :
            ready.some(frame => frame.animationCount > 0) ? '自动遮挡运行中' :
            ready.some(frame => frame.renderCount > 0) ? '自动遮挡已就绪' :
              '正在连接游戏画面'
        } else if (frames.length) message = '暂时无法识别游戏画面，请反馈版本信息'
        this.publish({ message, frames })
      } catch (error) {
        if (this.running) this.publish({ message: `等待游戏画面：${error.message || error}`, frames: [] })
      }
    })()
    this.pending = task
    try { await task } finally { if (this.pending === task) this.pending = null }
  }

  async setEnabled(value) {
    this.enabled = Boolean(value)
    this.config.set(settingPath, this.enabled)
    this.publish({})
    await this.refresh('sync-now')
  }

  async test() {
    if (!this.enabled) await this.setEnabled(true)
    await this.refresh('test')
  }

  async stop() {
    this.running = false
    this.clock.clearInterval(this.timer)
    const view = this.view
    const pending = this.pending
    this.unbindView()
    if (pending) await pending
    if (view) {
      try { await view.executeJavaScript(this.script('dispose')) } catch (_) {}
    }
    this.publish({ message: '插件已停止', frames: [] })
    this.listeners.clear()
  }
}

module.exports = { ShieldController }
