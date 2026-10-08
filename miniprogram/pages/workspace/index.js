const withPageState = require('../../utils/page-state')
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

function buildWorkspaceCacheKey(runtime) {
  const userId = runtime && runtime.userProfile && runtime.userProfile.id ? runtime.userProfile.id : 'guest'
  const storeId = runtime && runtime.currentStore && runtime.currentStore.id ? runtime.currentStore.id : 'default'
  return 'workspace:' + userId + ':' + storeId
}

Page(withPageState({
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
    const initialRuntime = app.getRuntimeSnapshot()
    const hadCachedData = this.hydratePageData(initialRuntime)
    const requestId = (this._syncRequestId || 0) + 1
    this._syncRequestId = requestId

    if (!hadCachedData && !(this.data.pageData && this.data.pageData.todayClasses)) {
      this.setData({ pageLoading: true })
    }

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
      const pageData = await businessApi.getWorkspaceViewData({
        storeId: runtime.currentStore.id,
        coachId: runtime.userProfile.id,
      })
      if (this._syncRequestId !== requestId) {
        return
      }
      app.setViewCache(buildWorkspaceCacheKey(runtime), pageData)
      this.setData({
        runtime,
        pageData: decorateWorkspacePageData(pageData),
        hasPermission: ['coach', 'admin'].includes(runtime.role),
        avatarText: runtime.userProfile.nickname ? runtime.userProfile.nickname.slice(0, 1) : '教',
      })
    } catch (error) {
      if (this._syncRequestId !== requestId) {
        return
      }
      this.setData({ pageError: error.message || "加载失败，请重试" })
      this.setData({
        runtime,
        pageData: decorateWorkspacePageData(app.getWorkspacePageData()),
        hasPermission: ['coach', 'admin'].includes(runtime.role),
        avatarText: runtime.userProfile.nickname ? runtime.userProfile.nickname.slice(0, 1) : '教',
      })
    } finally {
      this.setData({ pageLoading: false })
    }
  },

  hydratePageData(runtime) {
    const app = getApp()
    if (!runtime || !runtime.isAuthenticated) {
      return false
    }

    const cachedPageData = app.getViewCache(buildWorkspaceCacheKey(runtime))
    const pageData = cachedPageData || app.getWorkspacePageData()
    this.setData({
      runtime,
      pageData: decorateWorkspacePageData(pageData),
      hasPermission: ['coach', 'admin'].includes(runtime.role),
      avatarText: runtime.userProfile.nickname ? runtime.userProfile.nickname.slice(0, 1) : '教',
      pageLoading: false,
    })

    return Boolean(cachedPageData)
  },

  onTapAction(event) {
    const { actionId } = event.currentTarget.dataset
    if (actionId === 'class') {
      const next = (this.data.pageData.todayClasses || []).find((item) => item.bookedCount > item.checkedCount + item.absentCount)
      if (next) this.goClassDetail({ currentTarget: { dataset: { classId: next.id } } })
      else wx.showToast({ title: '今日没有待核销的场次', icon: 'none' })
      return
    }
    const routeMap = {
      manual: '/pages/workspace/manual/index',
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
}))
