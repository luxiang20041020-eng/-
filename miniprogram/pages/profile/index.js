Page({
  data: {
    runtime: {},
    pageData: {},
    dynamicCode: '',
  },

  onShow() {
    this.syncPageData()
    this.startDynamicCodeTicker()
  },

  onHide() {
    this.stopDynamicCodeTicker()
  },

  onUnload() {
    this.stopDynamicCodeTicker()
  },

  syncPageData() {
    const app = getApp()
    this.setData({
      runtime: app.getRuntimeSnapshot(),
      pageData: app.getProfilePageData(),
    })
    this.refreshDynamicCode()
    const tabbar = this.selectComponent('#tabbar')
    if (tabbar) {
      tabbar.syncTabs()
    }
  },

  startDynamicCodeTicker() {
    this.stopDynamicCodeTicker()
    // 这里用定时生成短时身份码，模拟正式环境中的 60 秒动态二维码刷新逻辑。
    this.codeTimer = setInterval(() => {
      this.refreshDynamicCode()
    }, 60000)
  },

  stopDynamicCodeTicker() {
    if (this.codeTimer) {
      clearInterval(this.codeTimer)
      this.codeTimer = null
    }
  },

  refreshDynamicCode() {
    const now = new Date()
    const minuteKey = [now.getHours(), now.getMinutes()].map((item) => String(item).padStart(2, '0')).join('')
    this.setData({
      dynamicCode: 'TK-' + this.data.runtime.role + '-' + minuteKey + '-U1001',
    })
  },

  onSwitchRole(event) {
    const app = getApp()
    const { role, label } = event.currentTarget.dataset
    app.switchRole(role)
    wx.showToast({
      title: '已切换为' + label,
      icon: 'none',
    })
    this.syncPageData()
  },

  onCancelBooking(event) {
    const app = getApp()
    const result = app.cancelBooking(event.currentTarget.dataset.bookingId)
    wx.showToast({
      title: result.message,
      icon: result.ok ? 'success' : 'none',
    })
    this.syncPageData()
  },
})
