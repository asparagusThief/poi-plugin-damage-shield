'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { namespace, translate, overlayStrings } = require('../src/i18n')
const { languages, bundles, createI18n } = require('./helpers/locales')
const meta = require('../package.json').poiPlugin

test('all five poi locales contain the same complete translations and interpolation variables', () => {
  const english = bundles['en-US']
  const keys = Object.keys(english).sort()
  for (const language of languages) {
    assert.deepEqual(Object.keys(bundles[language]).sort(), keys, language)
    for (const key of keys) {
      assert.equal(typeof bundles[language][key], 'string', `${language}: ${key}`)
      assert.ok(bundles[language][key].trim(), `${language}: ${key}`)
      const variables = text => Array.from(text.matchAll(/\{\{(.*?)\}\}/g), match => match[1]).sort()
      assert.deepEqual(variables(bundles[language][key]), variables(english[key]), `${language}: ${key}`)
    }
  }
})

test('poi namespace translates plugin metadata, counts and error details in every supported language', () => {
  for (const language of languages) {
    const i18n = createI18n(language)
    const t = i18n.getFixedT(null, namespace)
    assert.equal(i18n.t(`${namespace}:${meta.name}`), bundles[language][meta.name])
    assert.equal(i18n.t(`${namespace}:${meta.description}`), bundles[language][meta.description])
    assert.ok(translate(t, 'recognizedCount', { count: 23 }).includes('23'))
    assert.ok(translate(t, 'detectionError', { error: 'renderer unavailable' }).includes('renderer unavailable'))
    assert.equal(overlayStrings(i18n).overlayText, bundles[language].overlayText)
  }
})

test('English defaults remain readable when poi uses an unsupported locale', () => {
  const i18n = createI18n('fr-FR')
  const t = i18n.getFixedT(null, namespace)
  assert.equal(translate(t, 'ready'), 'Automatic shielding is ready')
  assert.equal(translate(t, 'recognizedCount', { count: 0 }), 'Damage animations detected this session: 0.')
  assert.equal(overlayStrings(i18n).overlayText, 'Animation playing')
})
