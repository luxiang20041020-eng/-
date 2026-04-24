const businessApi = require('../../../utils/business-api')

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
    const runtime = app.getRuntimeSnapshot()
    try {
      const pageData = await businessApi.getCoachClassViewData({
        classId: this.data.classId || app.globalData.selectedCoachClassId,
      })
      this.setData({
        runtime,
        pageData,
      })
    } catch (error) {
      this.setData({
        runtime,
        pageData: app.getClassCheckinPageData(this.data.classId),
      })
    }
  },

  async onUpdateStatus(event) {
    const { bookingId, status } = event.currentTarget.dataset
    const app = getApp()
    let result = null

    if (this.data.submittingBookingId === bookingId) {
      return
    }

    this.setData({ submittingBookingId: bookingId })

    try {
      await businessApi.writeOffBooking({
        bookingId,
        operatorId: app.globalData.userProfile.id,
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
