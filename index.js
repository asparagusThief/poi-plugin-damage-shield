'use strict'

const React = require('react')
const { ShieldController } = require('./src/controller')
let controller = null
const subscribers = new Set()
let latest = { message: '正在启动插件', frames: [], enabled: true, canTest: false }

exports.pluginDidLoad = function pluginDidLoad() {
  if (controller) return
  const { getStore, store } = require('views/create-store')
  const { config } = require('views/env')
  controller = new ShieldController({ getStore, config, store })
  controller.subscribe(snapshot => {
    latest = snapshot
    for (const listener of subscribers) listener(snapshot)
  })
  controller.start()
}

exports.pluginWillUnload = function pluginWillUnload() {
  if (controller) controller.stop().catch(error => console.error('[damage-shield]', error))
  controller = null
}

exports.reactClass = function DamageShieldPanel() {
  const [status, setStatus] = React.useState(latest)
  React.useEffect(() => {
    subscribers.add(setStatus)
    // Opening the panel also ensures initialization if poi mounts it before
    // the lifecycle callback; pluginDidLoad is idempotent.
    exports.pluginDidLoad()
    setStatus(latest)
    return () => subscribers.delete(setStatus)
  }, [])
  const h = React.createElement
  const count = status.frames.reduce((sum, frame) => sum + (frame.animationCount || 0), 0)
  return h('div', { style: { padding: 16, maxWidth: 600, lineHeight: 1.7 } },
    h('h3', { style: { marginTop: 0 } }, '破损动画遮挡'),
    h('p', null, '舰船中破／大破立绘动画播放期间遮挡整个游戏画面，播放结束后自动恢复。'),
    h('p', { role: 'status' }, status.enabled ? status.message : '自动遮挡已暂停'),
    h('p', null, `本次游戏加载已识别 ${count} 次破损动画。`),
    h('div', { style: { display: 'flex', gap: 8, flexWrap: 'wrap' } },
      h('button', { className: 'bp6-button', disabled: !status.canTest,
        title: status.canTest ? '预览 3 秒遮挡效果' : '游戏画面加载完成后即可测试',
        onClick: () => controller && controller.test() }, '测试黑幕（3 秒）'),
      h('button', { className: 'bp6-button', onClick: () => controller && controller.setEnabled(!status.enabled) },
        status.enabled ? '暂停自动遮挡' : '启用自动遮挡')),
    h('p', { style: { opacity: 0.8 } }, '可使用“测试黑幕”预览 3 秒遮挡效果。'),
    h('p', { style: { opacity: 0.8 } }, '遮挡期间，游戏动画和声音继续播放。'))
}
