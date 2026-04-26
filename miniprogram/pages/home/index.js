const businessApi = require('../../utils/business-api')

function decorateHomePageData(pageData) {
  const safeData = pageData || {}
  const coachCount = (safeData.packages || []).length + 4
  return Object.assign({}, safeData, {
    heroNotice: safeData.notices && safeData.notices.length ? safeData.notices[0] : '门店活动信息待发布',
    coachCount,
    coachCountText: String(coachCount).padStart(2, '0'),
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
    const runtime = await app.getRuntimeSnapshotAsync({ force: true })
    if (!runtime.isAuthenticated) {
      wx.reLaunch({ url: '/pages/login/index' })
      return
    }
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
    if (!storeId || storeId === this.data.runtime.currentStore.id) {
      return
    }
    app.switchStore(storeId)
    this.syncPageData()
  },

  onOpenStorePicker() {
    const stores = this.data.runtime.stores || []
    if (!stores.length) {
      wx.showToast({
        title: '暂无可选场地',
        icon: 'none',
      })
      return
    }

    wx.showActionSheet({
      itemList: stores.map((item) => item.name),
      success: (res) => {
        const targetStore = stores[res.tapIndex]
        if (!targetStore) {
          return
        }
        this.onSwitchStore({
          currentTarget: {
            dataset: {
              storeId: targetStore.id,
            },
          },
        })
      },
    })
  },

  onBellTap() {
    wx.showToast({
      title: '消息中心稍后开放',
      icon: 'none',
    })
  },

  goBooking() {
    wx.redirectTo({ url: '/pages/booking/index' })
  },

  goMySchedule() {
    wx.redirectTo({ url: '/pages/profile/index' })
  },

  goIdentityQr() {
    wx.redirectTo({ url: '/pages/profile/index' })
  },
})
