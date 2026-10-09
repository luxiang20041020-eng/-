const { getUserMessage } = require('./user-feedback')
const withI18n = require('./with-i18n')
// 所有业务页共享加载、失败重试、下拉刷新与离页请求失效处理。
function withPageState(definition) {
  const sync = definition.syncPageData
  const unload = definition.onUnload
  const hide = definition.onHide
  return withI18n(Object.assign({}, definition, {
    data: Object.assign({ pageBusy: false, pageError: '' }, definition.data),
    async syncPageData(...args) {
      const request = (this._pageRequest || 0) + 1
      this._pageRequest = request
      this.setData({ pageBusy: true, pageError: '' })
      try {
        await sync.apply(this, args)
      } catch (error) {
        if (this._pageRequest === request) this.setData({ pageError: getUserMessage(error, '加载失败，请重试') })
      } finally {
        if (this._pageRequest === request) this.setData({ pageBusy: false })
      }
    },
    onRetry() { this.syncPageData() },
    async onPullDownRefresh() {
      try { await this.syncPageData() } finally { wx.stopPullDownRefresh() }
    },
    onHide() {
      this._syncRequestId = (this._syncRequestId || 0) + 1
      this._pageRequest = (this._pageRequest || 0) + 1
      if (hide) hide.call(this)
    },
    onUnload() {
      this._syncRequestId = (this._syncRequestId || 0) + 1
      this._pageRequest = (this._pageRequest || 0) + 1
      if (unload) unload.call(this)
    },
  }))
}

module.exports = withPageState
