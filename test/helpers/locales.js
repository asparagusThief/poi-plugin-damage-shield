'use strict'

const { createInstance } = require('i18next')
const { namespace } = require('../../src/i18n')
const languages = ['zh-CN', 'zh-TW', 'ja-JP', 'en-US', 'ko-KR']
const bundles = Object.fromEntries(languages.map(language => [language, require(`../../i18n/${language}.json`)]))

function createI18n(language = 'zh-CN') {
  const i18n = createInstance()
  i18n.init({
    lng: language, fallbackLng: false, initAsync: false,
    ns: [namespace], defaultNS: namespace, nsSeparator: ':', interpolation: { escapeValue: false },
    resources: Object.fromEntries(languages.map(locale => [locale, { [namespace]: bundles[locale] }])),
  })
  return i18n
}

module.exports = { languages, bundles, createI18n }
