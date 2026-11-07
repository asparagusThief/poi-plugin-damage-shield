'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { namespace, translate, overlayStrings } = require('../src/i18n')
const { languages, bundles, createI18n } = require('./helpers/locales')
const pkg = require('../package.json')
const meta = pkg.poiPlugin

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

test('selecting the plugin by ID gives poi the matching header name and icon in every language', () => {
  for (const language of languages) {
    const i18n = createI18n(language)
    const previous = { packageName: 'poi-plugin-other', id: 'poi-plugin-other', name: 'Other plugin', displayIcon: 'other' }
    const plugin = { ...meta, packageName: pkg.name,
      name: i18n.t(`${meta.id}:${meta.name}`), displayIcon: meta.icon }
    // poi 12.0.1 selects tabs by plugin.id, then looks up the header by packageName.
    const selectedTab = plugin.id
    const plugins = [previous, plugin]
    const header = plugins.find(p => p.packageName === selectedTab) || plugins[0]
    assert.equal(header, plugin)
    assert.equal(header.name, bundles[language][meta.name])
    assert.equal(header.displayIcon, 'fa/shield')
    assert.equal(namespace, meta.id)
  }
})
