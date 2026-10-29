'use strict'

const english = require('../i18n/en-US.json')
const namespace = 'damage-shield'

function translate(t, key, values = {}) {
  return t(key, { defaultValue: english[key] || key, ...values })
}

function overlayStrings(i18n) {
  const t = i18n.getFixedT(null, namespace)
  return Object.fromEntries(['overlayText', 'canvasSizeError', 'canvasOverlayErrorPrefix']
    .map(key => [key, translate(t, key)]))
}

module.exports = { namespace, translate, overlayStrings }
