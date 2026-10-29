'use strict'

const React = require('react')
const { useTranslation } = require('react-i18next')
const { ShieldController } = require('./src/controller')
const { namespace, translate, overlayStrings } = require('./src/i18n')
let controller = null
let poiI18n = null
let onLanguageChanged = null
const subscribers = new Set()
let latest = { messageKey: 'starting', frames: [], enabled: true, canTest: false }

exports.pluginDidLoad = function pluginDidLoad() {
  if (controller) return
  const { getStore, store } = require('views/create-store')
  const { config } = require('views/env')
  const i18nModule = require('views/env-parts/i18next')
  poiI18n = i18nModule.default || i18nModule
  controller = new ShieldController({ getStore, config, store, getStrings: () => overlayStrings(poiI18n) })
  controller.subscribe(snapshot => {
    latest = snapshot
    for (const listener of subscribers) listener(snapshot)
  })
  onLanguageChanged = () => controller && controller.refresh('sync-now')
  poiI18n.on('languageChanged', onLanguageChanged)
  controller.start()
}

exports.pluginWillUnload = function pluginWillUnload() {
  if (poiI18n && onLanguageChanged) poiI18n.off('languageChanged', onLanguageChanged)
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
    h('p', { style: { opacity: 0.8 } }, tr('previewHint')),
    h('p', { style: { opacity: 0.8 } }, tr('playbackHint')))
}
