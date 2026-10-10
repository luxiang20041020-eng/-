const { showFeedback } = require('../../utils/interaction')
Component({
  properties: { language: { type: String, value: 'zh' } },
  data: { visible: false, contractName: '' },
  lifetimes: { detached() { this.finish(false) } },
  methods: {
    authorize(settings) {
      return new Promise((resolve, reject) => {
        this._resolve = resolve; this._reject = reject
        this.setData({ visible: true, contractName: settings.privacyContractName || '用户隐私保护协议' })
      })
    },
    finish(agreed) {
      const resolve = this._resolve, reject = this._reject
      this._resolve = this._reject = null
      if (agreed && resolve) resolve()
      if (!agreed && reject) reject(new Error('cancel'))
    },
    onAgree(event) {
      if (event.detail && event.detail.errMsg && !/ok$/.test(event.detail.errMsg)) return showFeedback({ title: '隐私授权未完成，请重试', icon: 'none' })
      this.setData({ visible: false }); this.finish(true)
    },
    onCancel() { this.setData({ visible: false }); this.finish(false) },
    onOpenContract() {
      if (!wx.openPrivacyContract) return showFeedback({ title: '当前版本暂不支持查看协议', icon: 'none' })
      wx.openPrivacyContract({ fail: () => showFeedback({ title: '协议打开失败，请稍后重试', icon: 'none' }) })
    },
  },
})
