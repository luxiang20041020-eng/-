Page({
  data: {
    runtime: {},
    pageData: {},
    hasPermission: false,
  },

  onShow() {
    this.syncPageData()
  },

  syncPageData() {
    const app = getApp()
    const runtime = app.getRuntimeSnapshot()
    this.setData({
      runtime,
      pageData: app.getWorkspacePageData(),
      hasPermission: runtime.role === 'coach',
    })
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
