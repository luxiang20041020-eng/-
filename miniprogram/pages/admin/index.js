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

  async syncPageData() {
    const app = getApp()
    const runtime = app.getRuntimeSnapshot()
    try {
      const pageData = await businessApi.getAdminDashboardData({
        storeId: runtime.currentStore.id,
      })
      this.setData({
        runtime,
        pageData,
        hasPermission: runtime.role === 'admin',
      })
    } catch (error) {
      this.setData({
        runtime,
        pageData: app.getAdminPageData(),
        hasPermission: runtime.role === 'admin',
      })
    }
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
      const createdCollectionNames = (result.createResults || []).map((item) => item.collectionName)
      const seededCollectionNames = (result.seedResults || []).filter((item) => item.seeded).map((item) => item.collectionName)
      wx.showModal({
        title: '初始化完成',
        content:
          '已检查集合：' + createdCollectionNames.join('、') +
          '\n已写入种子：' + (seededCollectionNames.length ? seededCollectionNames.join('、') : '无新增种子'),
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
