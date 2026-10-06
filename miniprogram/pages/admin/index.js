const withPageState = require('../../utils/page-state')
const businessApi = require('../../utils/business-api')

function buildAdminDashboardCacheKey(runtime) {
  const storeId = runtime && runtime.currentStore && runtime.currentStore.id ? runtime.currentStore.id : 'default'
  return 'admin:dashboard:' + storeId
}

Page(withPageState({
  data: {
    runtime: {},
    pageData: {},
    hasPermission: false,
    bootstrapLoading: false,
    auditLogsExpanded: false,
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
      this.setData({ pageError: error.message || "加载失败，请重试" })
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
    const rows = (this.data.pageData.auditLogs || []).map((item) => [item.time, item.operatorName, item.targetName, item.packageName, item.amount, item.payType, item.remark].map((value) => String(value || '').replace(/[\t\r\n]/g, ' ')).join('\t'))
    if (!rows.length) { wx.showToast({ title: '暂无记录可复制', icon: 'none' }); return }
    wx.setClipboardData({ data: '日期\t操作人\t学员\t套餐\t实收金额\t收款方式\t备注\n' + rows.join('\n'), success: () => wx.showToast({ title: '已复制，可粘贴到表格', icon: 'none' }) })
  },

  onOpenOperations() { wx.navigateTo({ url: '/pages/workspace/index' }) },

  onOpenStorePicker() {
    const stores = this.data.runtime.stores || []
    wx.showActionSheet({ itemList: stores.map((item) => item.name), success: (result) => {
      if (stores[result.tapIndex]) { getApp().switchStore(stores[result.tapIndex].id); this.syncPageData() }
    } })
  },

  onToggleAuditLogs() {
    this.setData({
      auditLogsExpanded: !this.data.auditLogsExpanded,
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

  onOpenStoreManage() {
    wx.navigateTo({
      url: '/pages/admin/stores/index',
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
        title: '数据库检查完成',
        content:
          '当前云环境：' + (result.envId || '未知') +
          '\n集合结果：' + createSummary.join('、') +
          '\n已写入种子：' + (seededCollectionNames.length ? seededCollectionNames.join('、') : '无新增种子') +
          '\n校验结果：' + inspectSummary.join('；'),
        showCancel: false,
      })
    } catch (error) {
      wx.showToast({
        title: error.message || '数据库检查失败',
        icon: 'none',
      })
    } finally {
      this.setData({ bootstrapLoading: false })
    }
  },
}))
