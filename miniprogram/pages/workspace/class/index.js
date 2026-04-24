const businessApi = require('../../../utils/business-api')

Page({
  data: {
    runtime: {},
    pageData: {},
    classId: '',
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

    try {
      await businessApi.writeOffBooking({
        bookingId,
        operatorId: 'coach_li',
        status: status === '已核销' ? 2 : 5,
      })
      result = app.updateCheckinStatus(this.data.pageData.classInfo.id, bookingId, status)
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
      this.syncPageData()
    }
  },
})
