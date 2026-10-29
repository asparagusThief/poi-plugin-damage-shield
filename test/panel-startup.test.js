'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const { ShieldController } = require('../src/controller')
const { namespace, ...localization } = require('../src/i18n')
const { createI18n } = require('./helpers/locales')
const source = fs.readFileSync(require.resolve('../index'), 'utf8')

function panelFixture(language = 'zh-CN') {
  let state, initialized = false, mounted = false, connected = false, finishInjection
  const i18n = createI18n(language)
  const effects = [], timers = new Set(), calls = []
  const view = {
    addEventListener() {}, removeEventListener() {},
    executeJavaScript(script) {
      calls.push(script)
      if (script.includes(')("dispose",')) return Promise.resolve([])
      if (connected) return Promise.resolve([{ hooks: 2, renderCount: 1, animationCount: 0 }])
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
    }
  }
  const context = vm.createContext({ exports: {}, console, require(name) {
    if (name === 'react') return React
    if (name === 'react-i18next') return { useTranslation: () => ({ t: i18n.getFixedT(null, namespace) }) }
    if (name === './src/i18n') return { namespace, ...localization }
    if (name === './src/controller') return { ShieldController: Controlled }
    if (name === 'views/create-store') return { getStore: () => view }
    if (name === 'views/env') return { config: { get: () => true, set() {} } }
    if (name === 'views/env-parts/i18next') return { default: i18n }
    throw new Error(`Unexpected import: ${name}`)
  } })
  vm.runInContext(source, context)
  return {
    plugin: context.exports, timers, calls, i18n,
    render: () => context.exports.reactClass(),
    mount: () => { for (const effect of effects) effect() },
    finish: () => { connected = true; finishInjection([{ hooks: 2, renderCount: 1, animationCount: 0 }]) },
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
