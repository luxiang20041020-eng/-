const { showModal } = require('../../utils/interaction')
const { showFeedback, navigateTo, reLaunch, setClipboardData, showActionSheet } = require('../../utils/interaction')
const { getUserMessage } = require('../../utils/user-feedback')
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
      reLaunch({ url: '/pages/login/index' })
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
      this.setData({ pageError: getUserMessage(error, "加载失败，请重试") })
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
    if (!rows.length) { showFeedback({ title: '暂无记录可复制', icon: 'none' }); return }
    setClipboardData({ data: '日期\t操作人\t学员\t套餐\t实收金额\t收款方式\t备注\n' + rows.join('\n'), success: () => showFeedback({ title: '已复制，可粘贴到表格', icon: 'none' }) })
  },

  onOpenOperations() { navigateTo({ url: '/pages/workspace/index' }) },

  onOpenStorePicker() {
    const stores = this.data.runtime.stores || []
    if (!stores.length) { showFeedback({ title: '暂无可选门店，请先启用门店', icon: 'none' }); return }
    showActionSheet({ itemList: stores.map((item) => item.name), success: (result) => {
      if (stores[result.tapIndex]) { getApp().switchStore(stores[result.tapIndex].id); this.syncPageData() }
    } })
  },

  onToggleAuditLogs() {
    this.setData({
      auditLogsExpanded: !this.data.auditLogsExpanded,
    })
  },

  onOpenUserManage() {
    navigateTo({
      url: '/pages/admin/users/index',
    })
  },

  onOpenPackageManage() {
    navigateTo({
      url: '/pages/admin/packages/index',
    })
  },

  onOpenStoreManage() {
    navigateTo({
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
      if (!result || !(result.inspectResults || []).length || result.inspectResults.some((item) => !item.ok)) throw new Error('场馆资料暂时无法使用，请联系场馆处理')
      showModal({
        title: '服务检查完成',
        content: '门店、套餐、人员和训练记录已可以正常读取。可以继续录入客户、派发权益和安排训练。',
        showCancel: false,
      })
    } catch (error) {
      showFeedback({
        title: getUserMessage(error, '场馆服务检查未完成，请稍后重试'),
        icon: 'none',
      })
    } finally {
      this.setData({ bootstrapLoading: false })
    }
  },
}))
