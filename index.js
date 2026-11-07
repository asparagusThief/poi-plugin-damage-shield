'use strict'

const React = require('react')
const { useTranslation } = require('react-i18next')
const { ShieldController, defaultColor } = require('./src/controller')
const { namespace, translate, overlayStrings } = require('./src/i18n')
let controller = null
let poiI18n = null
let onLanguageChanged = null
const subscribers = new Set()
let latest = { messageKey: 'starting', frames: [], enabled: true, color: defaultColor, canTest: false }

function migratePoiPreferences(config) {
  const keys = ['poi.plugin.windowmode', 'poi.plugin.pin', 'poi.plugin.favorite']
    .map(prefix => [`${prefix}.damage-shield`, `${prefix}.${namespace}`])
  keys.push(['plugin.damage-shield.bounds', `plugin.${namespace}.bounds`])
  for (const [oldKey, newKey] of keys) {
    const value = config.get(oldKey)
    if (value !== undefined && config.get(newKey) === undefined) config.set(newKey, value)
  }
}

exports.pluginDidLoad = function pluginDidLoad() {
  if (controller) return
  const { getStore, store } = require('views/create-store')
  const { config } = require('views/env')
  migratePoiPreferences(config)
  const i18nModule = require('views/env-parts/i18next')
  const i18n = i18nModule.default || i18nModule
  poiI18n = i18n
  controller = new ShieldController({ getStore, config, store, getStrings: () => overlayStrings(i18n) })
  controller.subscribe(snapshot => {
    latest = snapshot
    for (const listener of subscribers) listener(snapshot)
  })
  onLanguageChanged = () => controller && controller.refresh('sync-now')
  poiI18n.on('languageChanged', onLanguageChanged)
  // poi can cancel beforeunload to show its exit confirmation. Keep shielding
  // until the host really unloads or explicitly disables the plugin.
  if (typeof window !== 'undefined') window.addEventListener('unload', exports.pluginWillUnload)
  controller.start()
}

exports.pluginWillUnload = function pluginWillUnload() {
  if (typeof window !== 'undefined') window.removeEventListener('unload', exports.pluginWillUnload)
  if (poiI18n && onLanguageChanged) poiI18n.off('languageChanged', onLanguageChanged)
  poiI18n = null
  onLanguageChanged = null
  if (controller) controller.stop().catch(error => console.error('[damage-shield]', error))
  controller = null
}

exports.reactClass = function DamageShieldPanel() {
  const { t } = useTranslation(namespace, { useSuspense: false })
  const tr = (key, values) => translate(t, key, values)
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
  const color = status.color || defaultColor
  const count = status.frames.reduce((sum, frame) => sum + (frame.animationCount || 0), 0)
  return h('div', { style: { padding: 16, maxWidth: 600, lineHeight: 1.7 } },
    h('h3', { style: { marginTop: 0 } }, tr('Damage Animation Shield')),
    h('p', null, tr('description')),
    h('p', { role: 'status' }, status.enabled ? tr(status.messageKey, status.messageParams) : tr('paused')),
    h('p', null, tr('recognizedCount', { count })),
    h('div', { style: { display: 'flex', gap: 8, flexWrap: 'wrap' } },
      h('button', { className: 'bp6-button', disabled: !status.canTest,
        title: tr(status.canTest ? 'testReadyTitle' : 'testLoadingTitle'),
        onClick: () => controller && controller.test() }, tr('testButton')),
      h('button', { className: 'bp6-button', onClick: () => controller && controller.setEnabled(!status.enabled) },
        tr(status.enabled ? 'pauseButton' : 'enableButton'))),
    h('div', { style: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 14 } },
      h('label', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
        tr('shieldColorLabel'),
        h('input', { type: 'color', value: color, 'aria-label': tr('shieldColorLabel'),
          onChange: event => controller && controller.setColor(event.target.value),
          style: { width: 44, height: 30, padding: 2, cursor: 'pointer' } })),
      h('code', null, color.toUpperCase()),
      h('button', { className: 'bp6-button', disabled: color === defaultColor,
        onClick: () => controller && controller.setColor(defaultColor) }, tr('resetColorButton'))),
    h('p', { style: { opacity: 0.8, marginTop: 6 } }, tr('colorHint')),
    h('p', { style: { opacity: 0.8 } }, tr('previewHint')),
    h('p', { style: { opacity: 0.8 } }, tr('playbackHint')))
}
