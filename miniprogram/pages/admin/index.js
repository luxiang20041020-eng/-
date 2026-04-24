const businessApi = require('../../utils/business-api')

Page({
  data: {
    runtime: {},
    pageData: {},
    hasPermission: false,
    bootstrapLoading: false,
  },

  onShow() {
    this.syncPageData()
  },

  syncPageData() {
    const app = getApp()
    const runtime = app.getRuntimeSnapshot()
    this.setData({
      runtime,
      pageData: app.getAdminPageData(),
      hasPermission: runtime.role === 'admin',
    })
  },

  onExport() {
    wx.showToast({
      title: '导出能力将在 P2 对接云函数',
      icon: 'none',
    })
  },

  async onBootstrap() {
    if (this.data.bootstrapLoading) {
      return
    }

    this.setData({ bootstrapLoading: true })
    try {
      const result = await businessApi.bootstrapCollections()
      wx.showModal({
        title: '初始化完成',
        content: '集合初始化成功：' + Object.keys(result.collections).join('、'),
        showCancel: false,
      })
    } catch (error) {
      wx.showToast({
        title: error.message || '初始化失败',
        icon: 'none',
      })
    } finally {
      this.setData({ bootstrapLoading: false })
    }
  },
})
