const { LANGUAGES, getLanguage, setLanguage, subscribe } = require('../../utils/i18n')
const { showFeedback } = require('../../utils/interaction')
Component({
  data: { language: 'zh', options: LANGUAGES.map(item => item.name), index: 0 },
  lifetimes: {
    attached() { this.syncLanguage(); this._stopLocale = subscribe(() => this.syncLanguage()) },
    detached() { if (this._stopLocale) this._stopLocale() },
  },
  pageLifetimes: { show() { this.syncLanguage() } },
  methods: {
    syncLanguage() { const language = getLanguage(); this.setData({ language, index: LANGUAGES.findIndex(item => item.code === language) }) },
    onSelect(event) {
      const selected = LANGUAGES[Number(event.detail.value)]
      if (!selected || selected.code === getLanguage()) return
      try { setLanguage(selected.code); this.triggerEvent('change', { language: selected.code }) }
      catch (_) { showFeedback({ title: '语言设置未能保存，请清理手机存储空间后重试', icon: 'none' }) }
    },
  },
})
