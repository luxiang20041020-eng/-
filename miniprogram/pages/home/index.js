Page({
  data: {
    runtime: {},
    pageData: {},
  },

  onShow() {
    this.syncPageData()
  },

  syncPageData() {
    const app = getApp()
    this.setData({
      runtime: app.getRuntimeSnapshot(),
      pageData: app.getHomePageData(),
    })
  },

  onSwitchStore(event) {
    const app = getApp()
    const { storeId } = event.currentTarget.dataset
    app.switchStore(storeId)
    this.syncPageData()
  },

  goBooking() {
    wx.redirectTo({ url: '/pages/booking/index' })
  },

  goProfile() {
    wx.redirectTo({ url: '/pages/profile/index' })
  },

  goRolePage() {
    const role = this.data.runtime.role
    const targetPath = role === 'coach' ? '/pages/workspace/index' : role === 'admin' ? '/pages/admin/index' : '/pages/profile/index'
    wx.redirectTo({ url: targetPath })
  },
})
