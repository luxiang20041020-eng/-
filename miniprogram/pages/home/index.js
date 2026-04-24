const businessApi = require('../../utils/business-api')

function decorateHomePageData(pageData) {
  const safeData = pageData || {}
  return Object.assign({}, safeData, {
    heroNotice: safeData.notices && safeData.notices.length ? safeData.notices[0] : '门店活动信息待发布',
    coachCount: (safeData.packages || []).length + 4,
  })
}

Page({
  data: {
    runtime: {},
    pageData: {},
    pageLoading: false,
  },

  onShow() {
    this.syncPageData()
  },

  async syncPageData() {
    const app = getApp()
    const runtime = app.getRuntimeSnapshot()
    this.setData({ pageLoading: true })
    try {
      const pageData = await businessApi.getHomeViewData({
        storeId: runtime.currentStore.id,
      })
      this.setData({
        runtime: Object.assign({}, runtime, { stores: pageData.stores || runtime.stores }),
        pageData: decorateHomePageData(pageData),
      })
    } catch (error) {
      this.setData({
        runtime,
        pageData: decorateHomePageData(app.getHomePageData()),
      })
    } finally {
      this.setData({ pageLoading: false })
    }
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
