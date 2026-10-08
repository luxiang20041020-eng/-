const { getUserMessage } = require('../../../utils/user-feedback')
const withPageState = require('../../../utils/page-state')
const businessApi = require('../../../utils/business-api')
const { confirmAction, showFeedback, navigateTo, reLaunch } = require('../../../utils/interaction')

function buildClassCacheKey(classId) {
  return 'workspace:class:' + (classId || 'selected')
}

function emptyClass(classId) {
  return { classInfo: { id: classId || '', title: '训练名单', bookedCount: 0, checkedCount: 0, absentCount: 0 }, roster: [] }
}

Page(withPageState({
  data: {
    runtime: {},
    pageData: {},
    classId: '',
    submittingBookingId: '',
  },

  onLoad(options) {
    this.setData({
      classId: options.classId || '',
    })
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
      const classId = this.data.classId || app.globalData.selectedCoachClassId
      const pageData = await businessApi.getCoachClassViewData({
        classId,
      })
      if (this._syncRequestId !== requestId) {
        return
      }
      app.setViewCache(buildClassCacheKey(classId), pageData)
      this.setData({
        runtime,
        pageData,
      })
    } catch (error) {
      if (this._syncRequestId !== requestId) {
        return
      }
      this.setData({ pageError: getUserMessage(error, "加载失败，请重试") })
      this.setData({
        runtime,
        pageData: this.data.pageData.classInfo ? this.data.pageData : emptyClass(this.data.classId),
      })
    }
  },

  hydratePageData(runtime) {
    const app = getApp()
    if (!runtime || !runtime.isAuthenticated) {
      return false
    }
    const classId = this.data.classId || app.globalData.selectedCoachClassId
    const cachedPageData = app.getViewCache(buildClassCacheKey(classId))
    this.setData({
      runtime,
      pageData: cachedPageData || emptyClass(classId),
    })
    return Boolean(cachedPageData)
  },

  async onUpdateStatus(event) {
    if (this.data.submittingBookingId || this.data.pageBusy || this.data.pageError) return
    const { bookingId, status } = event.currentTarget.dataset
    const app = getApp()
    let result = null
    this.setData({ submittingBookingId: bookingId })

    try {
      if (status !== '已核销') {
        const member = (this.data.pageData.roster || []).find((item) => item.bookingId === bookingId)
        const confirmed = await confirmAction({ title: '确认记录缺席', content: (member && member.nickname || '该学员') + '将被标记为缺席，已扣课时不会自动返还。' })
        if (!confirmed) return
      }
      const runtime = await app.getRuntimeSnapshotAsync({ force: true })
      if (!runtime.isAuthenticated) {
        reLaunch({ url: '/pages/login/index' })
        return
      }
      await businessApi.writeOffBooking({
        bookingId,
        operatorId: runtime.userProfile.id,
        status: status === '已核销' ? 2 : 5,
      })
      result = { ok: true, message: status === '已核销' ? '到场已确认' : '缺席已记录' }
    } catch (error) {
      result = { ok: false, message: getUserMessage(error, "核销失败，请重试") }
    } finally {
      this.setData({ submittingBookingId: '' })
    }

    showFeedback({ title: result.message, icon: result.ok ? 'success' : 'none' })
    if (result.ok) {
      this.applyLocalRosterStatus(bookingId, status)
      app.removeViewCacheByPrefix('workspace:')
      app.removeViewCacheByPrefix('profile:')
      app.removeViewCacheByPrefix('admin:dashboard:')
      app.removeViewCacheByPrefix('admin:users')
      this.syncPageData()
    }
  },

  onManualWriteOff() {
    const classId = this.data.classId || this.data.pageData.classInfo.id
    if (classId) navigateTo({ url: '/pages/workspace/manual/index?classId=' + encodeURIComponent(classId) })
  },

  applyLocalRosterStatus(bookingId, nextStatus) {
    const roster = (this.data.pageData.roster || []).map((item) => {
      if (item.bookingId !== bookingId) {
        return item
      }
      return Object.assign({}, item, {
        status: nextStatus,
      })
    })

    const classInfo = Object.assign({}, this.data.pageData.classInfo || {})
    classInfo.checkedCount = roster.filter((item) => item.status === '已核销').length
    classInfo.absentCount = roster.filter((item) => item.status === '已缺席').length
    classInfo.bookedCount = roster.filter((item) => item.status !== '已取消' && item.status !== '教练取消').length

    this.setData({
      pageData: Object.assign({}, this.data.pageData, {
        roster,
        classInfo,
      }),
    })
  },
}))
