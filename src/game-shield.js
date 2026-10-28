'use strict'

// Serialized into the game's MAIN world. Keep this function self-contained:
// no require(), Node privileges, references to host variables or network I/O.
function runInGameFrames(command, options) {
  const slot = '__poiDamageShieldV1'
  const results = []
  const visited = new Set()

  function visit(win) {
    if (!win || visited.has(win)) return
    visited.add(win)
    try {
      if (command === 'dispose') {
        if (win[slot] && win[slot].owner === options.owner) win[slot].dispose()
      } else {
        const pixi = win.PIXI
        if (pixi && pixi.Graphics && win.document.querySelector('canvas')) {
          if (win[slot] && win[slot].owner !== options.owner) win[slot].dispose()
          if (!win[slot]) install(win, pixi)
          const state = win[slot]
          state.enabled = options.enabled !== false
          if (command === 'test') state.testUntil = Date.now() + 3000
          if (command === 'cancel-test') state.testUntil = 0
          if (!state.enabled) state.hide()
          results.push(state.status())
        }
      }
    } catch (error) {
      results.push({ error: String(error && error.message || error) })
    }
    // poi 12.0.1 disables web security for this webview, as its own canvas
    // capture does. If a frame is inaccessible, leave it alone and retry later.
    try {
      for (let i = 0; i < win.frames.length; i++) visit(win.frames[i])
    } catch (_) {}
  }

  function install(win, pixi) {
    const doc = win.document
    const patches = []
    const graphics = new Set()
    const masks = new WeakMap()
    const episodes = new WeakMap()
    let overlay = null
    let disposed = false
    const state = {
      owner: options.owner,
      enabled: options.enabled !== false,
      testUntil: 0,
      renderCount: 0,
      animationCount: 0,
      covered: false,
      error: null,
      hide() {
        state.covered = false
        if (overlay) overlay.style.display = 'none'
      },
      status() {
        return {
          pixiVersion: String(pixi.VERSION || 'unknown'),
          hooks: patches.length,
          renderCount: state.renderCount,
          animationCount: state.animationCount,
          covered: state.covered,
          testing: state.testUntil > Date.now(),
          error: state.error,
        }
      },
      dispose() {
        if (disposed) return
        disposed = true
        state.hide()
        if (overlay) overlay.remove()
        for (const patch of patches) {
          // A later plugin may have wrapped our function. Its closure then
          // remains a no-op, without replacing that plugin's renderer hook.
          if (patch.proto.render === patch.wrapper) {
            if (patch.own) Object.defineProperty(patch.proto, 'render', patch.own)
            else delete patch.proto.render
          }
        }
        for (const graphic of graphics) graphic.destroy()
        graphics.clear()
        if (win[slot] === state) delete win[slot]
      },
    }

    function show() {
      if (!overlay) {
        overlay = doc.createElement('div')
        overlay.id = 'poi-damage-shield-overlay'
        overlay.setAttribute('role', 'status')
        overlay.textContent = '动画播放中'
        Object.assign(overlay.style, {
          position: 'fixed', inset: '0', zIndex: '2147483647',
          background: '#101215', color: '#e0e3e8', display: 'none',
          alignItems: 'center', justifyContent: 'center',
          font: '16px sans-serif', pointerEvents: 'auto',
        })
        ;(doc.body || doc.documentElement).appendChild(overlay)
      }
      overlay.style.display = 'flex'
      state.covered = true
    }

    function isDamageView(node) {
      // Verified against the 6.3.6.0 TaskDamageCutin and TaskEnemyDamageCutin
      // views. Names of minified classes and numeric webpack modules vary.
      const frame = node._frame
      const words = node._mozi_layer
      if (!frame || !node._ships || !node._bg || !words ||
          !words._mozi1 || !words._mozi2 || !words._break) return false
      const texture = frame.texture
      if (!texture) return false
      const cache = pixi.utils && pixi.utils.TextureCache
      if (cache && cache.battle_cutin_damage_100 === texture) return true
      return Array.isArray(texture.textureCacheIds) &&
        texture.textureCacheIds.includes('battle_cutin_damage_100')
    }

    function isWhiteFade(node, renderer) {
      // TaskDamageCutin removes the art at the midpoint of a white fade, then
      // removes this AreaBox when the task finishes. Follow that actual object
      // rather than guessing the remaining fade duration with a timer.
      if (!node || !Array.isArray(node.graphicsData)) return false
      const resolution = renderer.resolution || 1
      const width = renderer.screen ? renderer.screen.width : renderer.width / resolution
      const height = renderer.screen ? renderer.screen.height : renderer.height / resolution
      return node.graphicsData.some(data => data.fillColor === 0xffffff && data.fillAlpha === 1 &&
        data.shape && data.shape.x === 0 && data.shape.y === 0 &&
        data.shape.width >= width && data.shape.height >= height)
    }

    function isAttached(node, root) {
      for (let current = node; current; current = current.parent) {
        if (current.visible === false || current.renderable === false) return false
        if (current === root) return true
      }
      return false
    }

    function containsDamageView(root, renderer) {
      let tracked = episodes.get(renderer)
      if (!tracked) { tracked = new Map(); episodes.set(renderer, tracked) }
      const active = new Set()
      const pending = [root]
      while (pending.length) {
        const node = pending.pop()
        if (!node || node.visible === false || node.renderable === false || node.alpha === 0) continue
        if (isDamageView(node)) {
          active.add(node)
          if (!tracked.has(node)) {
            tracked.set(node, { layer: node.parent, tails: new Set() })
            state.animationCount++
          }
        }
        if (Array.isArray(node.children)) {
          for (let i = node.children.length - 1; i >= 0; i--) pending.push(node.children[i])
        }
      }
      let covered = active.size > 0
      for (const [view, record] of tracked) {
        if (record.layer && Array.isArray(record.layer.children)) {
          for (const sibling of record.layer.children) {
            if (isWhiteFade(sibling, renderer)) record.tails.add(sibling)
          }
        }
        const fading = Array.from(record.tails).some(tail => isAttached(tail, root))
        if (fading) covered = true
        if (!active.has(view) && !fading) tracked.delete(view)
      }
      return covered
    }

    function maskFor(renderer) {
      let entry = masks.get(renderer)
      const resolution = renderer.resolution || 1
      const width = renderer.screen ? renderer.screen.width : renderer.width / resolution
      const height = renderer.screen ? renderer.screen.height : renderer.height / resolution
      if (!(width > 0 && height > 0)) throw new Error('无法确定游戏画布尺寸')
      if (!entry) {
        entry = { graphic: new pixi.Graphics(), width: 0, height: 0 }
        masks.set(renderer, entry)
        graphics.add(entry.graphic)
      }
      if (entry.width !== width || entry.height !== height) {
        entry.graphic.clear()
        entry.graphic.beginFill(0x101215, 1)
        entry.graphic.drawRect(0, 0, width, height)
        entry.graphic.endFill()
        entry.width = width
        entry.height = height
      }
      return entry.graphic
    }

    const prototypes = new Set()
    for (const name of ['WebGLRenderer', 'CanvasRenderer', 'Renderer']) {
      const proto = pixi[name] && pixi[name].prototype
      if (proto && typeof proto.render === 'function') prototypes.add(proto)
    }
    for (const proto of prototypes) {
      const original = proto.render
      const own = Object.getOwnPropertyDescriptor(proto, 'render')
      function wrappedRender(root, renderTexture) {
        // Leave texture preparation and other offscreen renders untouched.
        if (disposed || renderTexture || !this.view || this.view.ownerDocument !== doc) {
          return original.apply(this, arguments)
        }
        state.renderCount++
        let cover = false
        try {
          const active = containsDamageView(root, this)
          cover = state.enabled && (active || state.testUntil > Date.now())
          if (cover) show()
          else state.hide()
          state.error = null
        } catch (error) {
          state.error = String(error && error.message || error)
          // Preserve a current shield on a detection error until a healthy
          // rendered frame can establish that the animation has ended.
          cover = state.enabled && state.covered
        }
        // Normal rendering still updates transforms and interaction state.
        // The second draw overwrites the canvas BEFORE this JS task finishes,
        // so captured canvas frames are covered as well as the visible page.
        try {
          return original.apply(this, arguments)
        } finally {
          if (cover) {
            try {
              original.call(this, maskFor(this), null, true)
            } catch (error) {
              state.error = '画布遮挡失败：' + String(error && error.message || error)
            }
          }
        }
      }
      proto.render = wrappedRender
      patches.push({ proto, original, wrapper: wrappedRender, own })
    }
    win[slot] = state
  }

  visit(window)
  return results
}

module.exports = { runInGameFrames }
