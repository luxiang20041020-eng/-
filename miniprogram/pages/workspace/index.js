const businessApi = require('../../utils/business-api')

function decorateTodayClass(item) {
  const timeParts = String(item.timeRange || '').split(' - ')
  return Object.assign({}, item, {
    timeStart: timeParts[0] || '--:--',
    timeEnd: timeParts[1] || '--:--',
  })
}

function decorateWorkspacePageData(pageData) {
  const safeData = pageData || {}
  return Object.assign({}, safeData, {
    todayClasses: (safeData.todayClasses || []).map(decorateTodayClass),
  })
}

Page({
  data: {
    runtime: {},
    pageData: {},
    hasPermission: false,
    pageLoading: false,
    avatarText: '',
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
        pageData: decorateWorkspacePageData(pageData),
        hasPermission: runtime.role === 'coach',
        avatarText: runtime.userProfile.nickname ? runtime.userProfile.nickname.slice(0, 1) : '教',
      })
    } catch (error) {
      this.setData({
        runtime,
        pageData: decorateWorkspacePageData(app.getWorkspacePageData()),
        hasPermission: runtime.role === 'coach',
        avatarText: runtime.userProfile.nickname ? runtime.userProfile.nickname.slice(0, 1) : '教',
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
