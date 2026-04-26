const businessApi = require('../../utils/business-api')

function decorateProfilePageData(pageData) {
  const safeData = pageData || {}
  return Object.assign({}, safeData, {
    myBookings: (safeData.myBookings || []).map((item) => {
      const rawDateText = String(item.dateLabel || '')
      const dateText = rawDateText.split(' ')[0] || rawDateText
      const dateParts = dateText.split('/')
      return Object.assign({}, item, {
        dateText,
        dateDay: dateParts[1] || dateText,
      })
    }),
  })
}

Page({
  data: {
    runtime: {},
    pageData: {},
    dynamicCode: '',
    avatarText: '',
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

  async syncPageData() {
    const app = getApp()
    const runtime = await app.getRuntimeSnapshotAsync({ force: true })
    if (!runtime.isAuthenticated) {
      wx.reLaunch({ url: '/pages/login/index' })
      return
    }
    try {
      const pageData = await businessApi.getProfileViewData({
        userId: app.globalData.userProfile.id,
      })
      this.setData({
        runtime,
        pageData: decorateProfilePageData(pageData),
        avatarText: runtime.userProfile.nickname ? runtime.userProfile.nickname.slice(0, 1) : '人',
      })
    } catch (error) {
      this.setData({
        runtime,
        pageData: decorateProfilePageData(app.getProfilePageData()),
        avatarText: runtime.userProfile.nickname ? runtime.userProfile.nickname.slice(0, 1) : '人',
      })
    }
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
    const userIdSuffix = (this.data.runtime.userProfile && this.data.runtime.userProfile.id
      ? this.data.runtime.userProfile.id
      : 'guest').toUpperCase()
    this.setData({
      dynamicCode: 'TK-' + this.data.runtime.role + '-' + minuteKey + '-' + userIdSuffix,
    })
  },

  onSwitchRole(event) {
    const app = getApp()
    if (app.globalData.isAuthenticated) {
      return
    }
    const { role, label } = event.currentTarget.dataset
    app.switchRole(role)
    wx.showToast({
      title: '已切换为' + label,
      icon: 'none',
    })
    this.syncPageData()
  },

  async onCancelBooking(event) {
    const app = getApp()
    const bookingId = event.currentTarget.dataset.bookingId
    let result = null

    try {
      await businessApi.cancelBooking({
        bookingId,
        operatorId: app.globalData.userProfile.id,
        remark: '小程序取消预约',
      })
      result = app.applyCloudCancelSuccess(bookingId)
    } catch (error) {
      result = app.cancelBooking(bookingId)
      if (result.ok) {
        result.message = result.message + '（当前使用本地演示数据）'
      } else if (error && error.message) {
        result.message = result.message + '；云端返回：' + error.message
      }
    }

    wx.showToast({
      title: result.message,
      icon: result.ok ? 'success' : 'none',
    })
    this.syncPageData()
  },
})
