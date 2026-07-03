const businessApi = require('../../../utils/business-api')

function buildClassCacheKey(classId) {
  return 'workspace:class:' + (classId || 'selected')
}

Page({
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
      wx.reLaunch({ url: '/pages/login/index' })
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
      this.setData({
        runtime,
        pageData: app.getClassCheckinPageData(this.data.classId),
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
      pageData: cachedPageData || app.getClassCheckinPageData(this.data.classId),
    })
    return Boolean(cachedPageData)
  },

  async onUpdateStatus(event) {
    const { bookingId, status } = event.currentTarget.dataset
    const app = getApp()
    const runtime = await app.getRuntimeSnapshotAsync({ force: true })
    if (!runtime.isAuthenticated) {
      wx.reLaunch({ url: '/pages/login/index' })
      return
    }
    let result = null

    if (this.data.submittingBookingId === bookingId) {
      return
    }

    this.setData({ submittingBookingId: bookingId })

    try {
      await businessApi.writeOffBooking({
        bookingId,
        operatorId: runtime.userProfile.id,
        status: status === '已核销' ? 2 : 5,
      })
      result = app.applyCloudCheckinStatus(this.data.pageData.classInfo.id, bookingId, status)
    } catch (error) {
      result = app.updateCheckinStatus(this.data.pageData.classInfo.id, bookingId, status)
      if (result.ok) {
        result.message = result.message + '（当前使用本地演示数据）'
      } else if (error && error.message) {
        result.message = result.message + '；云端返回：' + error.message
      }
    }

    wx.showToast({ title: result.message, icon: result.ok ? 'success' : 'none' })
    if (result.ok) {
      this.applyLocalRosterStatus(bookingId, status)
      app.removeViewCacheByPrefix('workspace:')
      app.removeViewCacheByPrefix('profile:')
      app.removeViewCacheByPrefix('admin:dashboard:')
      this.syncPageData()
    }
    this.setData({ submittingBookingId: '' })
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
})
