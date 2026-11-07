'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const vm = require('node:vm')
const { ShieldController, defaultColor } = require('../src/controller')

function fixture(initialConfig = []) {
  let current = null, tick, time = 0
  const values = new Map(initialConfig)
  const config = { get: (key, fallback) => values.has(key) ? values.get(key) : fallback,
    set: (key, value) => values.set(key, value) }
  const clock = { now: () => time, setInterval: fn => { tick = fn; return 7 }, clearInterval: id => { assert.equal(id, 7); tick = null } }
  const controller = new ShieldController({ config, clock, getStore: () => current })
  const view = {
    calls: [], handlers: new Map(),
    addEventListener(event, fn) { this.handlers.set(event, fn) },
    removeEventListener(event) { this.handlers.delete(event) },
    async executeJavaScript(script) {
      this.calls.push(script)
      assert.doesNotThrow(() => new vm.Script(script))
      return [{ hooks: 2, renderCount: 60, animationCount: 0, covered: false }]
    },
  }
  return { controller, view, values, setView: value => { current = value }, advance: ms => { time += ms }, tick: () => tick && tick() }
}

test('waits for a game, injects after its webview appears, and reports actual renderer readiness', async () => {
  const f = fixture()
  f.controller.start()
  assert.equal(f.controller.snapshot.messageKey, 'waitingForGame')
  f.setView(f.view)
  await f.tick()
  assert.equal(f.controller.snapshot.messageKey, 'ready')
  assert.equal(f.view.handlers.size, 2)
  await f.controller.setEnabled(false)
  assert.equal(f.values.get('plugin.damage-shield.shieldEnabled'), false)
  assert.match(f.view.calls.at(-1), /"enabled":false/)
  await f.controller.stop()
  assert.equal(f.view.handlers.size, 0)
  assert.match(f.view.calls.at(-1), /\)\("dispose",/)
})

test('slow injections do not pile up and stop waits for pending work before cleanup', async () => {
  const f = fixture()
  f.setView(f.view)
  let resolve
  f.view.executeJavaScript = script => {
    f.view.calls.push(script)
    if (script.includes(')("dispose",')) return Promise.resolve([])
    return new Promise(done => { resolve = done })
  }
  f.controller.start()
  f.tick(); f.tick()
  assert.equal(f.view.calls.length, 1)
  const stopping = f.controller.stop()
  assert.equal(f.view.calls.length, 1)
  resolve([])
  await stopping
  assert.equal(f.view.calls.length, 2)
  assert.equal(f.controller.snapshot.messageKey, 'stopped')
})

test('a new webview replaces event listeners and disposes the previous game hook', async () => {
  const f = fixture()
  f.setView(f.view)
  f.controller.start()
  await f.controller.pending
  const replacement = { ...f.view, calls: [], handlers: new Map() }
  f.setView(replacement)
  await f.tick()
  assert.equal(f.view.handlers.size, 0)
  assert.match(f.view.calls.at(-1), /\)\("dispose",/)
  assert.equal(replacement.handlers.size, 2)
  await f.controller.stop()
})

test('startup publishes loading immediately, before a webview injection can resolve', async () => {
  const f = fixture()
  f.setView(f.view)
  const updates = []
  f.controller.subscribe(status => updates.push(status))
  let resolve
  f.view.executeJavaScript = script => {
    f.view.calls.push(script)
    return script.includes(')("dispose",') ? Promise.resolve([]) : new Promise(done => { resolve = done })
  }
  f.controller.start()
  assert.ok(updates.length > 0)
  assert.equal(updates[0].messageKey, 'waitingForGame')
  assert.equal(updates[0].canTest, false)
  assert.equal(await f.controller.test(), false)
  assert.equal(f.controller.snapshot.messageKey, 'testUnavailable')
  assert.equal(f.view.calls.length, 1)
  resolve([{ hooks: 2, renderCount: 1, animationCount: 0 }])
  await new Promise(setImmediate)
  assert.equal(f.controller.snapshot.canTest, true)
  await f.controller.stop()
})

test('live game frames connect and accept tests while the whole page and an advertisement are still loading', async () => {
  const f = fixture()
  let finishRoot, finishAd
  const root = { calls: [], executeJavaScript(script) {
    this.calls.push(script)
    return script.includes(')("dispose",') ? Promise.resolve([]) : new Promise(resolve => { finishRoot = resolve })
  } }
  const ad = { calls: [], executeJavaScript(script) {
    this.calls.push(script)
    return script.includes(')("dispose",') ? Promise.resolve([]) : new Promise(resolve => { finishAd = resolve })
  } }
  const game = { calls: [], async executeJavaScript(script) {
    this.calls.push(script)
    return [{ hooks: 2, renderCount: 10, animationCount: 0, covered: false }]
  } }
  root.framesInSubtree = [root, ad, game]
  f.view.getWebContents = () => ({ mainFrame: root })
  f.view.executeJavaScript = () => { throw new Error('whole-page API must not be used') }
  f.setView(f.view)
  f.controller.start()
  await new Promise(setImmediate)
  assert.equal(f.controller.snapshot.canTest, true)
  assert.equal(f.controller.snapshot.frames.length, 1)
  assert.match(game.calls[0], /"singleFrame":true/)
  await f.tick(); await f.tick()
  assert.equal(root.calls.length, 1)
  assert.equal(ad.calls.length, 1)
  assert.equal(await f.controller.test(), true)
  assert.ok(game.calls.some(script => script.includes(')("test",')))
  const stopping = f.controller.stop()
  finishRoot([]); finishAd([])
  await stopping
})

test('a stalled old webview cannot block a replacement or overwrite its newer status', async () => {
  const f = fixture()
  let finishOld
  f.view.executeJavaScript = script => {
    f.view.calls.push(script)
    return script.includes(')("dispose",') ? Promise.resolve([]) : new Promise(resolve => { finishOld = resolve })
  }
  f.setView(f.view)
  f.controller.start()
  const replacement = {
    calls: [], addEventListener() {}, removeEventListener() {},
    async executeJavaScript(script) {
      this.calls.push(script)
      return [{ hooks: 2, renderCount: 5, animationCount: 0, covered: false }]
    },
  }
  f.setView(replacement)
  await f.tick()
  assert.equal(f.controller.snapshot.messageKey, 'ready')
  finishOld([{ hooks: 2, renderCount: 50, animationCount: 20, covered: true }])
  await new Promise(setImmediate)
  assert.equal(f.controller.snapshot.messageKey, 'ready')
  const oldOwner = f.view.calls[0].match(/"owner":"([^"]+)"/)[1]
  const newOwner = replacement.calls[0].match(/"owner":"([^"]+)"/)[1]
  assert.notEqual(oldOwner, newOwner)
  assert.match(f.view.calls.at(-1), /\)\("dispose",/)
  assert.ok(f.view.calls.at(-1).includes(oldOwner))
  await f.controller.stop()
})

test('store ref changes connect immediately and polling slows only after a rendered game frame', async () => {
  let view = null, notify, timer, unsubscribed = false
  const delays = []
  const controller = new ShieldController({
    getStore: () => view,
    config: { get: () => true, set() {} },
    store: { subscribe(callback) { notify = callback; return () => { unsubscribed = true } } },
    clock: { setInterval(fn, delay) { timer = fn; delays.push(delay); return 1 }, clearInterval() { timer = null } },
  })
  controller.start()
  assert.equal(delays.at(-1), 250)
  let hasRendered = false
  view = { calls: [], async executeJavaScript(script) {
    this.calls.push(script)
    return [{ hooks: 2, renderCount: hasRendered ? 1 : 0 }]
  } }
  notify()
  assert.equal(view.calls.length, 1)
  await controller.pending
  assert.equal(controller.snapshot.canTest, false)
  assert.equal(delays.at(-1), 250)
  hasRendered = true
  await timer()
  assert.equal(controller.snapshot.canTest, true)
  assert.equal(delays.at(-1), 1000)
  await controller.stop()
  assert.equal(unsubscribed, true)
})

test('a stalled game connection stops reporting ready and recovers when it responds', async () => {
  const f = fixture()
  f.setView(f.view); f.controller.start()
  await f.controller.pending
  let finish
  f.view.executeJavaScript = script => {
    f.view.calls.push(script)
    return script.includes(')("dispose",') ? Promise.resolve([]) : new Promise(resolve => { finish = resolve })
  }
  const pending = f.tick()
  const callCount = f.view.calls.length
  f.advance(10001)
  await f.tick(); await f.tick()
  assert.equal(f.controller.snapshot.messageKey, 'connectionTimeout')
  assert.equal(f.controller.snapshot.canTest, false)
  assert.equal(f.view.calls.length, callCount)
  finish([{ hooks: 2, renderCount: 65, animationCount: 0, covered: false }])
  await pending
  assert.equal(f.controller.snapshot.messageKey, 'ready')
  assert.equal(f.controller.snapshot.canTest, true)
  await f.controller.stop()
})

test('a stalled unrelated frame does not mark a responding game as disconnected', async () => {
  const f = fixture()
  let finishAd
  const ad = { executeJavaScript: script => script.includes(')("dispose",') ? Promise.resolve([]) : new Promise(resolve => { finishAd = resolve }) }
  const game = { executeJavaScript: async () => [{ hooks: 2, renderCount: 20, covered: false }] }
  f.view.getWebContents = () => ({ mainFrame: { framesInSubtree: [ad, game] } })
  f.setView(f.view); f.controller.start()
  await new Promise(setImmediate)
  f.advance(20000)
  const polling = f.tick()
  await new Promise(setImmediate)
  assert.equal(f.controller.snapshot.messageKey, 'ready')
  assert.equal(f.controller.snapshot.canTest, true)
  finishAd([])
  await polling
  await f.controller.stop()
})

test('connection exceptions are visible and the next successful poll clears them', async () => {
  const f = fixture()
  f.view.executeJavaScript = () => { throw new Error('Frame was detached') }
  f.setView(f.view); f.controller.start()
  await f.controller.pending
  assert.equal(f.controller.snapshot.messageKey, 'detectionError')
  assert.match(f.controller.snapshot.messageParams.error, /Frame was detached/)
  assert.equal(f.controller.snapshot.canTest, false)
  f.view.executeJavaScript = async () => [{ hooks: 2, renderCount: 5 }]
  await f.tick()
  assert.equal(f.controller.snapshot.messageKey, 'ready')
  await f.controller.stop()
})

test('reconnecting the same native frame gives delayed cleanup a distinct owner', async () => {
  const f = fixture()
  let finishOld
  const calls = []
  const game = { executeJavaScript(script) {
    calls.push(script)
    if (script.includes(')("dispose",')) return Promise.resolve([])
    if (calls.length === 1) return new Promise(resolve => { finishOld = resolve })
    return Promise.resolve([{ hooks: 2, renderCount: 5 }])
  } }
  const root = { framesInSubtree: [game] }
  f.view.getWebContents = () => ({ mainFrame: root })
  f.setView(f.view); f.controller.start()
  root.framesInSubtree = []
  await f.tick()
  root.framesInSubtree = [game]
  await f.tick()
  const owner = script => script.match(/"owner":"([^"]+)"/)[1]
  assert.notEqual(owner(calls[0]), owner(calls[1]))
  finishOld([])
  await new Promise(setImmediate)
  assert.equal(owner(calls[2]), owner(calls[0]))
  assert.equal(f.controller.snapshot.messageKey, 'ready')
  await f.controller.stop()
})

test('loads the saved color, applies changes to the game and retains them after reopening', async () => {
  const key = 'plugin.damage-shield.shieldColor'
  const f = fixture([[key, '#ABCDEF']])
  f.setView(f.view); f.controller.start()
  await f.controller.pending
  assert.equal(f.controller.snapshot.color, '#abcdef')
  assert.match(f.view.calls.at(-1), /"color":"#abcdef"/)
  f.controller.setColor('#346699')
  await f.controller.pending
  assert.equal(f.values.get(key), '#346699')
  assert.match(f.view.calls.at(-1), /"color":"#346699"/)
  const reopened = new ShieldController({ getStore: () => null,
    config: { get: (name, fallback) => f.values.has(name) ? f.values.get(name) : fallback } })
  assert.equal(reopened.snapshot.color, '#346699')
  f.controller.setColor(defaultColor)
  await f.controller.pending
  assert.equal(f.values.get(key), defaultColor)
  assert.equal(f.controller.snapshot.color, defaultColor)
  await f.controller.stop()
})

test('changing color while paused preserves the pause and invalid saved colors fall back safely', async () => {
  const f = fixture([['plugin.damage-shield.shieldColor', 'rgba(0,0,0,0)']])
  assert.equal(f.controller.color, defaultColor)
  f.setView(f.view); f.controller.start()
  await f.controller.pending
  f.controller.setEnabled(false)
  await f.controller.pending
  f.controller.setColor('#ffffff')
  await f.controller.pending
  assert.equal(f.controller.snapshot.enabled, false)
  assert.equal(f.controller.snapshot.color, '#ffffff')
  assert.match(f.view.calls.at(-1), /"enabled":false,"color":"#ffffff"/)
  await f.controller.stop()
})

test('the most recent color selected during startup reaches the game after its pending connection', async () => {
  const f = fixture()
  let finish
  f.view.executeJavaScript = script => {
    f.view.calls.push(script)
    if (f.view.calls.length === 1) return new Promise(resolve => { finish = resolve })
    return Promise.resolve([{ hooks: 2, renderCount: 1 }])
  }
  f.setView(f.view); f.controller.start()
  f.controller.setColor('#112233')
  f.controller.setColor('#fedcba')
  assert.equal(f.view.calls.length, 1)
  assert.equal(f.controller.snapshot.color, '#fedcba')
  finish([{ hooks: 2, renderCount: 1 }])
  await new Promise(setImmediate)
  assert.equal(f.view.calls.length, 2)
  assert.match(f.view.calls[1], /"color":"#fedcba"/)
  await f.controller.stop()
})
