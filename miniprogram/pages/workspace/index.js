const businessApi = require('../../utils/business-api')

Page({
  data: {
    runtime: {},
    pageData: {},
    hasPermission: false,
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
      const pageData = await businessApi.getWorkspaceViewData({
        storeId: runtime.currentStore.id,
        coachId: runtime.userProfile.id,
      })
      this.setData({
        runtime,
        pageData,
        hasPermission: runtime.role === 'coach',
      })
    } catch (error) {
      this.setData({
        runtime,
        pageData: app.getWorkspacePageData(),
        hasPermission: runtime.role === 'coach',
      })
    } finally {
      this.setData({ pageLoading: false })
    }
  },

  onTapAction(event) {
    const { actionId } = event.currentTarget.dataset
    const routeMap = {
      distribute: '/pages/workspace/distribute/index',
      class: '/pages/workspace/class/index',
      schedule: '/pages/workspace/schedule/index',
    }
    const targetPath = routeMap[actionId]
    if (!targetPath) {
      return
    }

    wx.navigateTo({ url: targetPath })
  },

  goClassDetail(event) {
    const { classId } = event.currentTarget.dataset
    wx.navigateTo({
      url: '/pages/workspace/class/index?classId=' + classId,
    })
  },
})
