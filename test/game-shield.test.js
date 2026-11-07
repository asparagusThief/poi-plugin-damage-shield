'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const vm = require('node:vm')
const { runInGameFrames } = require('../src/game-shield')

function environment() {
  const elements = []
  const doc = {
    querySelector: selector => selector === 'canvas' ? {} : null,
    createElement: () => ({ style: {}, isConnected: false, setAttribute() {}, remove() { this.removed = true; this.isConnected = false } }),
    body: { appendChild: el => { el.isConnected = true; elements.push(el) } },
  }
  class Container {
    constructor() { this.children = []; this.visible = true; this.renderable = true; this.alpha = 1 }
    addChild(...nodes) { this.children.push(...nodes); for (const node of nodes) node.parent = this }
    removeChild(node) { this.children = this.children.filter(child => child !== node); node.parent = null }
  }
  class Graphics extends Container {
    clear() { return this }
    beginFill(color, alpha) { this.color = color; this.opacity = alpha; return this }
    drawRect(x, y, width, height) { this.rectangle = { x, y, width, height }; return this }
    endFill() { return this }
    destroy() { this.destroyed = true }
  }
  class Renderer {
    constructor() {
      this.view = { ownerDocument: doc }
      this.width = 2400; this.height = 1440; this.resolution = 2
      this.draws = []
    }
    render(root, renderTexture) {
      this.draws.push({ root, renderTexture })
      if (this.onDraw) this.onDraw(root, renderTexture)
      return 'render-return-value'
    }
  }
  const texture = { textureCacheIds: ['battle_cutin_damage_100'] }
  const pixi = { VERSION: '4.8.9', Container, Graphics, WebGLRenderer: Renderer,
    utils: { TextureCache: { battle_cutin_damage_100: texture } } }
  const win = { document: doc, PIXI: pixi, frames: [] }
  const context = vm.createContext({ window: win, Date })
  function run(command = 'sync', options = {}) {
    return vm.runInContext(`(${runInGameFrames.toString()})(${JSON.stringify(command)},${JSON.stringify({ owner: 'test-owner', enabled: true, ...options })})`, context)
  }
  function damageView() {
    const node = new Container()
    node._frame = { texture }; node._bg = {}; node._ships = {}
    node._mozi_layer = { _mozi1: {}, _mozi2: {}, _break: {} }
    return node
  }
  return { doc, elements, Container, Graphics, Renderer, win, pixi, run, damageView }
}

test('covers the first rendered damage frame, keeps normal game rendering and restores immediately', () => {
  const env = environment()
  env.run()
  const renderer = new env.Renderer()
  const stage = new env.Container()
  assert.equal(renderer.render(stage), 'render-return-value')
  assert.equal(renderer.draws.length, 1)
  const animation = env.damageView()
  stage.addChild(animation)
  renderer.render(stage)
  assert.equal(renderer.draws.length, 3)
  assert.equal(renderer.draws[1].root, stage)
  const mask = renderer.draws[2].root
  assert.ok(mask instanceof env.Graphics)
  assert.deepEqual(mask.rectangle, { x: 0, y: 0, width: 1200, height: 720 })
  assert.equal(mask.opacity, 1)
  assert.equal(env.elements[0].style.display, 'flex')
  renderer.render(stage)
  assert.equal(env.run()[0].animationCount, 1)
  stage.removeChild(animation)
  renderer.render(stage)
  assert.equal(renderer.draws.at(-1).root, stage)
  assert.equal(env.elements[0].style.display, 'none')
  stage.addChild(env.damageView())
  renderer.render(stage)
  assert.equal(env.run()[0].animationCount, 2)
})

test('does not treat normal art, damaged ship textures, invisible or detached views as cutins', () => {
  const env = environment()
  env.run()
  const renderer = new env.Renderer()
  const stage = new env.Container()
  const normal = env.damageView()
  normal._frame.texture = { textureCacheIds: ['ship_full_dmg'] }
  stage.addChild(normal)
  const invisible = env.damageView()
  invisible.visible = false
  stage.addChild(invisible)
  const parent = new env.Container()
  parent.alpha = 0
  parent.addChild(env.damageView())
  stage.addChild(parent)
  env.damageView() // A constructed but detached animation is not on screen.
  renderer.render(stage)
  assert.equal(renderer.draws.length, 1)
  assert.equal(env.run()[0].animationCount, 0)
})

test('supports cache identity without texture ids and covers until the last simultaneous view is removed', () => {
  const env = environment()
  env.pixi.utils.TextureCache.battle_cutin_damage_100.textureCacheIds = undefined
  env.run()
  const stage = new env.Container()
  const first = env.damageView(), second = env.damageView()
  stage.addChild(first, second)
  const renderer = new env.Renderer()
  renderer.render(stage)
  stage.removeChild(first)
  renderer.render(stage)
  assert.equal(env.run()[0].covered, true)
  stage.removeChild(second)
  renderer.render(stage)
  assert.equal(env.run()[0].covered, false)
})

test('keeps coverage through the actual closing white fade, without a fixed timeout', () => {
  const env = environment()
  env.run()
  const renderer = new env.Renderer(), stage = new env.Container(), layer = new env.Container()
  const animation = env.damageView()
  layer.addChild(animation); stage.addChild(layer)
  renderer.render(stage)
  const fade = new env.Graphics()
  fade.graphicsData = [{ fillColor: 0xffffff, fillAlpha: 1,
    shape: { x: 0, y: 0, width: 1200, height: 720 } }]
  fade.alpha = 0
  layer.addChild(fade)
  // The art can disappear between rendered frames; the already known layer
  // still identifies the ending transition, including its alpha-zero frame.
  layer.removeChild(animation)
  renderer.render(stage)
  assert.equal(env.run()[0].covered, true)
  fade.alpha = 0.1
  renderer.render(stage)
  assert.equal(env.run()[0].covered, true)
  layer.removeChild(fade)
  renderer.render(stage)
  assert.equal(env.run()[0].covered, false)
})

test('never overwrites offscreen render textures; adapts the opaque mask to resized canvases', () => {
  const env = environment()
  env.run()
  const renderer = new env.Renderer()
  const stage = new env.Container()
  stage.addChild(env.damageView())
  const renderTexture = {}
  renderer.render(stage, renderTexture)
  assert.equal(renderer.draws.length, 1)
  assert.equal(env.run()[0].renderCount, 0)
  renderer.render(stage)
  renderer.screen = { width: 800, height: 480 }
  renderer.render(stage)
  assert.deepEqual(renderer.draws.at(-1).root.rectangle, { x: 0, y: 0, width: 800, height: 480 })
})

test('test mode expires and disabling overrides both automatic and test coverage', () => {
  const env = environment()
  env.run('test')
  const renderer = new env.Renderer(), stage = new env.Container()
  renderer.render(stage)
  assert.equal(env.run()[0].covered, true)
  env.win.__poiDamageShieldV1.testUntil = Date.now() - 1
  renderer.render(stage)
  assert.equal(env.run()[0].covered, false)
  stage.addChild(env.damageView())
  env.run('sync', { enabled: false })
  renderer.draws.length = 0
  renderer.render(stage)
  assert.equal(renderer.draws.length, 1)
})

test('installation is idempotent, owner-scoped cleanup restores the renderer, and other hooks survive', () => {
  const env = environment()
  const original = env.Renderer.prototype.render
  env.run()
  const installed = env.Renderer.prototype.render
  env.run()
  assert.equal(env.Renderer.prototype.render, installed)
  env.run('dispose', { owner: 'stale-owner' })
  assert.equal(env.Renderer.prototype.render, installed)
  env.run('dispose')
  assert.equal(env.Renderer.prototype.render, original)
  assert.equal(env.win.__poiDamageShieldV1, undefined)
  env.run()
  const wrapper = env.Renderer.prototype.render
  function laterHook() { return wrapper.apply(this, arguments) }
  env.Renderer.prototype.render = laterHook
  env.run('dispose')
  assert.equal(env.Renderer.prototype.render, laterHook)
  const renderer = new env.Renderer(), stage = new env.Container()
  stage.addChild(env.damageView())
  renderer.render(stage)
  assert.equal(renderer.draws.length, 1)
})

test('discovers a game nested inside login frames and tolerates an inaccessible unrelated frame', () => {
  const env = environment()
  const blocked = new Proxy({}, { get() { throw new Error('cross-origin frame') } })
  const parent = { document: { querySelector: () => null }, frames: [blocked, env.win] }
  const context = vm.createContext({ window: parent, Date })
  const result = vm.runInContext(`(${runInGameFrames.toString()})('sync',{owner:'nested',enabled:true})`, context)
  assert.equal(result.filter(frame => frame.hooks > 0).length, 1)
  assert.equal(env.win.__poiDamageShieldV1.owner, 'nested')
})

test('a detection error cannot interrupt game rendering or remove an existing shield', () => {
  const env = environment()
  env.run()
  const stage = new env.Container(), renderer = new env.Renderer()
  stage.addChild(env.damageView())
  renderer.render(stage)
  const broken = new env.Container()
  Object.defineProperty(broken, '_frame', { get() { throw new Error('changed game object') } })
  stage.children = [broken]
  renderer.render(stage)
  assert.equal(env.run()[0].covered, true)
  assert.match(env.run()[0].error, /changed game object/)
  stage.children = []
  renderer.render(stage)
  assert.equal(env.run()[0].covered, false)
})

test('installs the renderer hook before the game canvas exists', () => {
  const env = environment()
  env.doc.querySelector = () => null
  const status = env.run()[0]
  assert.ok(status.hooks > 0)
  assert.equal(status.renderCount, 0)
  const renderer = new env.Renderer(), stage = new env.Container()
  stage.addChild(env.damageView())
  renderer.render(stage)
  assert.equal(env.run()[0].covered, true)
})

test('native frame mode does not traverse and double-count sibling or child game frames', () => {
  const env = environment()
  const parent = { frames: [env.win] }
  const context = vm.createContext({ window: parent, Date })
  const results = vm.runInContext(`(${runInGameFrames.toString()})('sync',{owner:'native',singleFrame:true})`, context)
  assert.equal(results.length, 0)
  assert.equal(env.win.__poiDamageShieldV1, undefined)
  assert.equal(env.run('sync', { owner: 'native', singleFrame: true }).length, 1)
})

test('an active overlay changes language without reinstalling hooks or interrupting coverage', () => {
  const env = environment()
  env.run('sync', { strings: { overlayText: '动画播放中' } })
  const renderer = new env.Renderer(), stage = new env.Container()
  stage.addChild(env.damageView())
  renderer.render(stage)
  const hook = env.Renderer.prototype.render
  const overlay = env.elements[0]
  assert.equal(overlay.textContent, '动画播放中')
  env.run('sync', { strings: { overlayText: '演出再生中' } })
  assert.equal(overlay.textContent, '演出再生中')
  assert.equal(overlay.style.display, 'flex')
  assert.equal(env.Renderer.prototype.render, hook)
  renderer.render(stage)
  assert.equal(env.run()[0].animationCount, 1)
  assert.equal(env.run()[0].covered, true)
})

test('canvas failure diagnostics use the current localized labels', () => {
  const env = environment()
  env.run('sync', { strings: {
    canvasSizeError: 'ゲームのキャンバスサイズを取得できません',
    canvasOverlayErrorPrefix: 'キャンバスのマスクに失敗しました：',
  } })
  const renderer = new env.Renderer(), stage = new env.Container()
  stage.addChild(env.damageView())
  renderer.width = 0
  renderer.render(stage)
  assert.equal(env.run()[0].error, 'キャンバスのマスクに失敗しました：ゲームのキャンバスサイズを取得できません')
})

test('repairs a renderer hook overwritten after the plugin was already ready', () => {
  const env = environment(), original = env.Renderer.prototype.render
  env.run()
  const renderer = new env.Renderer(), stage = new env.Container()
  renderer.render(stage)
  env.Renderer.prototype.render = original
  env.run('test')
  renderer.draws.length = 0
  renderer.render(stage)
  assert.equal(renderer.draws.length, 2)
  assert.equal(env.run()[0].covered, true)
  assert.equal(env.elements[0].style.display, 'flex')
})

test('discovers renderer constructors that become available after PIXI', () => {
  const env = environment()
  delete env.pixi.WebGLRenderer
  assert.equal(env.run()[0].hooks, 0)
  env.pixi.WebGLRenderer = env.Renderer
  assert.ok(env.run('test')[0].hooks > 0)
  const renderer = new env.Renderer()
  renderer.render(new env.Container())
  assert.equal(renderer.draws.length, 2)
})

test('reconnects when a running page replaces its PIXI engine', () => {
  const env = environment(), original = env.Renderer.prototype.render
  env.run()
  const oldRenderer = new env.Renderer()
  oldRenderer.render(new env.Container())
  class NewRenderer extends env.Renderer {}
  NewRenderer.prototype.render = original
  env.win.PIXI = { ...env.pixi, WebGLRenderer: NewRenderer }
  env.run('test')
  const renderer = new NewRenderer()
  renderer.render(new env.Container())
  assert.equal(renderer.draws.length, 2)
  assert.equal(env.run()[0].covered, true)
})

test('repairing around a later plugin wrapper does not duplicate draws or hide an active shield', () => {
  const env = environment()
  env.run()
  const firstHook = env.Renderer.prototype.render
  function laterHook() { return firstHook.apply(this, arguments) }
  env.Renderer.prototype.render = laterHook
  env.run()
  const renderer = new env.Renderer(), stage = new env.Container()
  stage.addChild(env.damageView())
  renderer.render(stage)
  const status = env.run()[0]
  assert.equal(renderer.draws.length, 2)
  assert.equal(status.renderCount, 1)
  assert.equal(status.animationCount, 1)
  assert.equal(status.covered, true)
  env.run('dispose')
  assert.equal(env.Renderer.prototype.render, laterHook)
  renderer.draws.length = 0
  renderer.render(stage)
  assert.equal(renderer.draws.length, 1)
})

test('repairs an existing renderer instance whose render method is replaced', () => {
  const env = environment(), original = env.Renderer.prototype.render
  env.run()
  const renderer = new env.Renderer(), stage = new env.Container()
  renderer.render(stage)
  renderer.render = original
  env.run('test')
  renderer.draws.length = 0
  renderer.render(stage)
  assert.equal(renderer.draws.length, 2)
  assert.equal(env.run()[0].covered, true)
  env.run('dispose')
  assert.equal(renderer.render, original)
})

test('reattaches an overlay removed by the game page while an animation is playing', () => {
  const env = environment()
  env.run()
  const renderer = new env.Renderer(), stage = new env.Container()
  stage.addChild(env.damageView())
  renderer.render(stage)
  const overlay = env.elements[0]
  overlay.remove()
  renderer.render(stage)
  assert.equal(overlay.isConnected, true)
  assert.equal(overlay.style.display, 'flex')
  assert.equal(renderer.draws.at(-1).root.opacity, 1)
})

test('applies a chosen color to both output layers and updates it during an active damage animation', () => {
  const env = environment()
  env.run('sync', { color: '#FFFFFF' })
  const renderer = new env.Renderer(), stage = new env.Container()
  stage.addChild(env.damageView())
  renderer.render(stage)
  const mask = renderer.draws.at(-1).root
  const overlay = env.elements[0]
  const hook = env.Renderer.prototype.render
  assert.equal(mask.color, 0xffffff)
  assert.equal(mask.opacity, 1)
  assert.equal(overlay.style.background, '#ffffff')
  assert.equal(overlay.style.color, '#000000')
  env.run('sync', { color: '#123456' })
  assert.equal(overlay.style.background, '#123456')
  assert.equal(overlay.style.color, '#ffffff')
  assert.equal(overlay.style.display, 'flex')
  renderer.render(stage)
  assert.equal(renderer.draws.at(-1).root, mask)
  assert.equal(mask.color, 0x123456)
  assert.equal(mask.opacity, 1)
  assert.equal(env.Renderer.prototype.render, hook)
  assert.equal(env.run()[0].animationCount, 1)
  assert.equal(env.run()[0].color, '#123456')
})

test('manual previews and resized masks use the selected fully opaque color including pure black', () => {
  for (const color of ['#0044ff', '#000000']) {
    const env = environment()
    env.run('test', { color })
    const renderer = new env.Renderer(), stage = new env.Container()
    renderer.render(stage)
    renderer.screen = { width: 800, height: 480 }
    renderer.render(stage)
    const mask = renderer.draws.at(-1).root
    assert.equal(mask.color, parseInt(color.slice(1), 16))
    assert.equal(mask.opacity, 1)
    assert.deepEqual(mask.rectangle, { x: 0, y: 0, width: 800, height: 480 })
    assert.equal(env.elements[0].style.background, color)
    assert.equal(env.run()[0].covered, true)
  }
})

test('invalid or transparent color values cannot make the game overlay transparent', () => {
  for (const color of ['transparent', 'rgba(0,0,0,0)', '#ffffff00', 'invalid', null]) {
    const env = environment()
    env.run('test', { color })
    const renderer = new env.Renderer()
    renderer.render(new env.Container())
    assert.equal(renderer.draws.at(-1).root.color, 0x101215)
    assert.equal(renderer.draws.at(-1).root.opacity, 1)
    assert.equal(env.elements[0].style.background, '#101215')
  }
})
