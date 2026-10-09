const { translate, format } = require('./i18n-text')
const STORAGE_KEY = 'one.language'
const LANGUAGES = [
  { code: 'zh', name: '简体中文' }, { code: 'en', name: 'English' },
  { code: 'fr', name: 'Français' }, { code: 'th', name: 'ไทย' },
  { code: 'de', name: 'Deutsch' }, { code: 'ja', name: '日本語' },
  { code: 'hi', name: 'हिन्दी' },
]
let language = ''
const listeners = new Set()
function supported(value) {
  const code = String(value || '').toLowerCase().split(/[-_]/)[0]
  return LANGUAGES.some(item => item.code === code) ? code : 'zh'
}
function getLanguage() {
  if (typeof wx === 'undefined') return 'zh'
  if (language) return language
  let stored = ''
  let system = ''
  try { stored = wx.getStorageSync(STORAGE_KEY) } catch (_) {}
  try { system = wx.getAppBaseInfo ? wx.getAppBaseInfo().language : wx.getSystemInfoSync ? wx.getSystemInfoSync().language : '' } catch (_) {}
  language = supported(stored || system)
  return language
}
function setLanguage(code) {
  const next = supported(code)
  // 先保存，保存失败时不切换到无法持久化的语言。
  wx.setStorageSync(STORAGE_KEY, next)
  language = next
  for (const listener of listeners) listener(next)
  return next
}
function subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener) }
module.exports = { LANGUAGES, getLanguage, setLanguage, subscribe,
  t: (text, code) => translate(text, code || getLanguage()),
  f: (text, values, code) => format(text, values, code || getLanguage()),
}
