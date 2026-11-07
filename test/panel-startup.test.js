'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const { ShieldController } = require('../src/controller')
const { namespace, ...localization } = require('../src/i18n')
const { createI18n } = require('./helpers/locales')
const source = fs.readFileSync(require.resolve('../index'), 'utf8')

function panelFixture(language = 'zh-CN', initialConfig = []) {
  let state, initialized = false, mounted = false, connected = false, covered = false, finishInjection, cleanup
  const i18n = createI18n(language)
  const languageListeners = new Set()
  for (const method of ['on', 'off']) {
    const original = i18n[method].bind(i18n)
    i18n[method] = (name, fn) => {
      if (name === 'languageChanged') languageListeners[method === 'on' ? 'add' : 'delete'](fn)
      return original(name, fn)
    }
  }
  const effects = [], timers = new Set(), calls = [], controllers = []
  const listeners = new Map(), subscriptions = new Set(), values = new Map(initialConfig)
  const handlers = new Map()
  const result = () => [{ hooks: 2, renderCount: 1, animationCount: covered ? 1 : 0, covered }]
  const window = {
    addEventListener(name, fn) {
      if (!listeners.has(name)) listeners.set(name, new Set())
      listeners.get(name).add(fn)
    },
    removeEventListener(name, fn) { listeners.get(name)?.delete(fn) },
  }
  const view = {
    addEventListener(name, fn) { handlers.set(name, fn) },
    removeEventListener(name) { handlers.delete(name) },
    executeJavaScript(script) {
      calls.push(script)
      if (script.includes(')("dispose",')) return Promise.resolve([])
      if (connected) return Promise.resolve(result())
      return new Promise(resolve => { finishInjection = resolve })
    },
  }
  const React = {
    useState(initial) {
      if (!initialized) { state = initial; initialized = true }
      return [state, value => { state = value }]
    },
    useEffect(effect) { if (!mounted) { effects.push(effect); mounted = true } },
    createElement: (type, props, ...children) => ({ type, props: props || {}, children }),
  }
  class Controlled extends ShieldController {
    constructor(options) {
      super({ ...options, clock: {
        setInterval(fn) { timers.add(fn); return fn },
        clearInterval(fn) { timers.delete(fn) },
      } })
      controllers.push(this)
    }
  }
  const context = vm.createContext({ exports: {}, console, window, require(name) {
    if (name === 'react') return React
    if (name === 'react-i18next') return { useTranslation: () => ({ t: i18n.getFixedT(null, namespace) }) }
    if (name === './src/i18n') return { namespace, ...localization }
    if (name === './src/controller') return { ShieldController: Controlled }
    if (name === 'views/create-store') return { getStore: () => view, store: {
      subscribe(fn) { subscriptions.add(fn); return () => subscriptions.delete(fn) },
    } }
    if (name === 'views/env') return { config: {
      get: (key, fallback) => values.has(key) ? values.get(key) : fallback,
      set: (key, value) => values.set(key, value),
    } }
    if (name === 'views/env-parts/i18next') return { default: i18n }
    throw new Error(`Unexpected import: ${name}`)
  } })
  vm.runInContext(source, context)
  return {
    plugin: context.exports, timers, calls, i18n, controllers, listeners, subscriptions, handlers, values, languageListeners,
    render: () => context.exports.reactClass(),
    mount: () => { for (const effect of effects.splice(0)) cleanup = effect() },
    unmount: () => { if (cleanup) cleanup(); cleanup = null; mounted = false; initialized = false },
    finish: () => { connected = true; finishInjection(result()) },
    setCovered: value => { covered = value },
    tick: () => Promise.all(Array.from(timers, fn => fn())),
    dispatch: (name, event = {}) => { for (const fn of listeners.get(name) || []) fn(event) },
  }
}

function testButton(panel) {
  return panel.children.find(child => child && child.type === 'div').children[0]
}

test('the panel shows loading and disables its test button while the first injection is pending', async () => {
  const f = panelFixture()
  f.plugin.pluginDidLoad()
  let panel = f.render()
  f.mount()
  panel = f.render()
  assert.match(panel.children.find(child => child.props && child.props.role === 'status').children[0], /^等待游戏/)
  assert.equal(testButton(panel).props.disabled, true)
  assert.match(testButton(panel).props.title, /加载完成/)
  assert.equal(f.calls.length, 1)
  assert.equal(f.timers.size, 1)
  f.finish()
  await new Promise(setImmediate)
  panel = f.render()
  assert.equal(testButton(panel).props.disabled, false)
  assert.equal(panel.children.find(child => child.props && child.props.role === 'status').children[0], '自动遮挡已就绪')
  f.plugin.pluginWillUnload()
  assert.equal(f.timers.size, 0)
})

test('mounting the panel before the poi lifecycle callback still starts exactly one controller', async () => {
  const f = panelFixture()
  f.render()
  f.mount()
  assert.equal(f.calls.length, 1)
  f.plugin.pluginDidLoad()
  assert.equal(f.calls.length, 1)
  assert.equal(f.timers.size, 1)
  f.finish()
  await new Promise(setImmediate)
  f.plugin.pluginWillUnload()
})

test('changing poi language translates an existing waiting status without needing a game response', async () => {
  const f = panelFixture()
  f.plugin.pluginDidLoad()
  f.render(); f.mount()
  assert.match(f.render().children[2].children[0], /^等待游戏/)
  await f.i18n.changeLanguage('ja-JP')
  const panel = f.render()
  assert.equal(panel.children[0].children[0], '中破・大破演出マスク')
  assert.equal(panel.children[2].children[0], 'ゲームの読み込みを待機中')
  assert.equal(testButton(panel).children[0], 'マスクをテスト（3秒）')
  assert.equal(testButton(panel).props.disabled, true)
  f.finish()
  await new Promise(setImmediate)
  assert.equal(f.render().children[2].children[0], '自動マスクの準備完了')
  assert.ok(f.calls.at(-1).includes('演出再生中'))
  f.plugin.pluginWillUnload()
})

test('changing poi language immediately sends localized overlay text to the connected game', async () => {
  const f = panelFixture('en-US')
  f.plugin.pluginDidLoad()
  f.render(); f.mount(); f.finish()
  await new Promise(setImmediate)
  await f.i18n.changeLanguage('ko-KR')
  await new Promise(setImmediate)
  const panel = f.render()
  assert.equal(panel.children[0].children[0], '중파·대파 연출 가리기')
  assert.equal(panel.children[2].children[0], '자동 가리기 준비 완료')
  assert.ok(f.calls.at(-1).includes('연출 재생 중'))
  f.plugin.pluginWillUnload()
})

test('cancelling poi exit keeps automatic shielding active without an open panel', async () => {
  const f = panelFixture()
  f.plugin.pluginDidLoad()
  f.finish()
  await new Promise(setImmediate)
  f.dispatch('beforeunload', { defaultPrevented: true, returnValue: false })
  assert.equal(f.timers.size, 1)
  assert.equal(f.handlers.size, 2)
  assert.equal(f.subscriptions.size, 1)
  assert.equal(f.languageListeners.size, 1)
  f.setCovered(true)
  await f.tick()
  assert.equal(f.controllers[0].snapshot.messageKey, 'covering')
  assert.equal(f.calls.some(script => script.includes(')("dispose",')), false)
  assert.equal(f.controllers.length, 1)
  f.plugin.pluginWillUnload()
})

test('closing and reopening the plugin panel keeps the same controller and game hooks', async () => {
  const f = panelFixture()
  f.render(); f.mount(); f.finish()
  await new Promise(setImmediate)
  const owner = f.controllers[0].owner
  f.unmount()
  f.setCovered(true)
  await f.tick()
  assert.equal(f.controllers[0].snapshot.messageKey, 'covering')
  assert.equal(f.timers.size, 1)
  assert.equal(f.calls.some(script => script.includes(')("dispose",')), false)
  f.render(); f.mount()
  assert.equal(f.render().children[2].children[0], '正在遮挡游戏画面')
  assert.equal(f.controllers.length, 1)
  assert.equal(f.controllers[0].owner, owner)
  assert.equal(f.languageListeners.size, 1)
  f.plugin.pluginWillUnload()
})

test('actual main-window unload cleans up and an explicit reload starts one fresh controller', async () => {
  const f = panelFixture()
  f.plugin.pluginDidLoad(); f.finish()
  await new Promise(setImmediate)
  const owner = f.controllers[0].owner
  f.dispatch('unload')
  await new Promise(setImmediate)
  assert.equal(f.timers.size, 0)
  assert.equal(f.handlers.size, 0)
  assert.equal(f.subscriptions.size, 0)
  assert.equal(f.languageListeners.size, 0)
  assert.equal(f.listeners.get('unload').size, 0)
  assert.ok(f.calls.at(-1).includes(')("dispose",'))
  f.plugin.pluginDidLoad(); f.plugin.pluginDidLoad()
  await new Promise(setImmediate)
  assert.equal(f.controllers.length, 2)
  assert.notEqual(f.controllers[1].owner, owner)
  assert.equal(f.timers.size, 1)
  assert.equal(f.listeners.get('unload').size, 1)
  assert.equal(f.languageListeners.size, 1)
  f.plugin.pluginWillUnload(); f.plugin.pluginWillUnload()
  await new Promise(setImmediate)
  assert.equal(f.timers.size, 0)
  assert.equal(f.listeners.get('unload').size, 0)
})

test('the corrected poi ID preserves window preferences and the saved shielding setting', async () => {
  const bounds = { width: 720, height: 600 }
  const pin = { x: 10, y: 20 }
  const f = panelFixture('zh-CN', [
    ['poi.plugin.windowmode.damage-shield', true],
    ['poi.plugin.windowmode.poi-plugin-damage-shield', false],
    ['poi.plugin.pin.damage-shield', pin],
    ['poi.plugin.favorite.damage-shield', false],
    ['plugin.damage-shield.bounds', bounds],
    ['plugin.damage-shield.shieldEnabled', false],
  ])
  f.plugin.pluginDidLoad(); f.finish()
  await new Promise(setImmediate)
  assert.equal(f.values.get('poi.plugin.windowmode.poi-plugin-damage-shield'), false)
  assert.equal(f.values.get('poi.plugin.pin.poi-plugin-damage-shield'), pin)
  assert.equal(f.values.get('poi.plugin.favorite.poi-plugin-damage-shield'), false)
  assert.equal(f.values.get('plugin.poi-plugin-damage-shield.bounds'), bounds)
  assert.equal(f.controllers[0].enabled, false)
  assert.equal(f.render().children[2].children[0], '自动遮挡已暂停')
  f.plugin.pluginWillUnload()
})

test('unloading during a pending injection still disposes the game hooks after it resolves', async () => {
  const f = panelFixture('ja-JP')
  f.plugin.pluginDidLoad()
  assert.equal(f.calls.length, 1)
  f.plugin.pluginWillUnload()
  assert.equal(f.timers.size, 0)
  assert.equal(f.languageListeners.size, 0)
  f.finish()
  await new Promise(setImmediate)
  assert.equal(f.calls.length, 2)
  assert.ok(f.calls[1].includes(')("dispose",'))
  assert.ok(f.calls[1].includes('演出再生中'))
})
