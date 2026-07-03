const businessApi = require('../../utils/business-api')

function buildAdminDashboardCacheKey(runtime) {
  const storeId = runtime && runtime.currentStore && runtime.currentStore.id ? runtime.currentStore.id : 'default'
  return 'admin:dashboard:' + storeId
}

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
    const initialRuntime = app.getRuntimeSnapshot()
    this.hydratePageData(initialRuntime)
    const requestId = (this._syncRequestId || 0) + 1
    this._syncRequestId = requestId

    const runtime = await app.getRuntimeSnapshotAsync()
    if (this._syncRequestId !== requestId) {
      return
    }
    if (!runtime.isAuthenticated) {
      wx.reLaunch({ url: '/pages/login/index' })
      return
    }
    this.hydratePageData(runtime)
    try {
      const pageData = await businessApi.getAdminDashboardData({
        storeId: runtime.currentStore.id,
      })
      if (this._syncRequestId !== requestId) {
        return
      }
      app.setViewCache(buildAdminDashboardCacheKey(runtime), pageData)
      this.setData({
        runtime,
        pageData,
        hasPermission: runtime.role === 'admin',
      })
    } catch (error) {
      if (this._syncRequestId !== requestId) {
        return
      }
      this.setData({
        runtime,
        pageData: app.getAdminPageData(),
        hasPermission: runtime.role === 'admin',
      })
    }
  },

  hydratePageData(runtime) {
    const app = getApp()
    if (!runtime || !runtime.isAuthenticated) {
      return false
    }

    const cachedPageData = app.getViewCache(buildAdminDashboardCacheKey(runtime))
    this.setData({
      runtime,
      pageData: cachedPageData || app.getAdminPageData(),
      hasPermission: runtime.role === 'admin',
    })

    return Boolean(cachedPageData)
  },

  onExport() {
    wx.showToast({
      title: '导出能力将在 P2 对接云函数',
      icon: 'none',
    })
  },

  onOpenUserManage() {
    wx.navigateTo({
      url: '/pages/admin/users/index',
    })
  },

  onOpenPackageManage() {
    wx.navigateTo({
      url: '/pages/admin/packages/index',
    })
  },

  async onBootstrap() {
    if (this.data.bootstrapLoading) {
      return
    }

    this.setData({ bootstrapLoading: true })
    try {
      const result = await businessApi.bootstrapCollections()
      const app = getApp()
      app.removeViewCacheByPrefix('admin:')
      app.removeViewCacheByPrefix('home:')
      app.removeViewCacheByPrefix('booking:')
      app.removeViewCacheByPrefix('workspace:')
      const createSummary = (result.createResults || []).map((item) => {
        if (item.status === 'created') {
          return item.collectionName + '（新建）'
        }
        if (item.status === 'exists') {
          return item.collectionName + '（已存在）'
        }
        return item.collectionName
      })
      const seededCollectionNames = (result.seedResults || []).filter((item) => item.seeded).map((item) => item.collectionName)
      const inspectSummary = (result.inspectResults || []).map((item) => {
        return item.collectionName + '：' + (item.ok ? ('可访问，记录数 ' + item.total) : ('校验失败 ' + (item.error || '未知错误')))
      })
      wx.showModal({
        title: '初始化完成',
        content:
          '当前云环境：' + (result.envId || '未知') +
          '\n集合结果：' + createSummary.join('、') +
          '\n已写入种子：' + (seededCollectionNames.length ? seededCollectionNames.join('、') : '无新增种子') +
          '\n校验结果：' + inspectSummary.join('；'),
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
