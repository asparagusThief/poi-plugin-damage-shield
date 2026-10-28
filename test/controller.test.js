'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const vm = require('node:vm')
const { ShieldController } = require('../src/controller')

function fixture() {
  let current = null, tick
  const values = new Map()
  const config = { get: (key, fallback) => values.has(key) ? values.get(key) : fallback,
    set: (key, value) => values.set(key, value) }
  const clock = { setInterval: fn => { tick = fn; return 7 }, clearInterval: id => { assert.equal(id, 7); tick = null } }
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
  return { controller, view, values, setView: value => { current = value }, tick: () => tick && tick() }
}

test('waits for a game, injects after its webview appears, and reports actual renderer readiness', async () => {
  const f = fixture()
  f.controller.start()
  assert.equal(f.controller.snapshot.message, '等待游戏画面')
  f.setView(f.view)
  await f.tick()
  assert.match(f.controller.snapshot.message, /自动遮挡已就绪/)
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
  assert.equal(f.controller.snapshot.message, '插件已停止')
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
