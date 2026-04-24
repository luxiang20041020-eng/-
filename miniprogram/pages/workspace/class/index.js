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

  syncPageData() {
    const app = getApp()
    this.setData({
      runtime: app.getRuntimeSnapshot(),
      pageData: app.getClassCheckinPageData(this.data.classId),
    })
  },

  onUpdateStatus(event) {
    const { bookingId, status } = event.currentTarget.dataset
    const app = getApp()
    const result = app.updateCheckinStatus(this.data.pageData.classInfo.id, bookingId, status)
    wx.showToast({ title: result.message, icon: result.ok ? 'success' : 'none' })
    if (result.ok) {
      this.syncPageData()
    }
  },
})
