Page({
  data: {
    runtime: {},
    pageData: {},
    filters: {
      type: 'group',
      coachId: 'all',
      dateKey: '04-24',
    },
  },

  onShow() {
    this.syncPageData()
  },

  syncPageData() {
    const app = getApp()
    this.setData({
      runtime: app.getRuntimeSnapshot(),
      pageData: app.getBookingPageData(this.data.filters),
    })
  },

  onSwitchStore(event) {
    const app = getApp()
    app.switchStore(event.currentTarget.dataset.storeId)
    this.syncPageData()
  },

  onTypeChange(event) {
    this.setData({
      filters: Object.assign({}, this.data.filters, {
        type: event.currentTarget.dataset.type,
      }),
    })
    this.syncPageData()
  },

  onCoachChange(event) {
    this.setData({
      filters: Object.assign({}, this.data.filters, {
        coachId: event.currentTarget.dataset.coachId,
      }),
    })
    this.syncPageData()
  },

  onDateChange(event) {
    this.setData({
      filters: Object.assign({}, this.data.filters, {
        dateKey: event.currentTarget.dataset.dateKey,
      }),
    })
    this.syncPageData()
  },

  onBook(event) {
    const app = getApp()
    const { scheduleId, title } = event.currentTarget.dataset
    const schedule = this.data.pageData.schedules.find((item) => item.id === scheduleId)
    if (!schedule || schedule.isBooked || schedule.isFull) {
      return
    }

    const assetText = schedule.type === 'group' ? this.data.pageData.assets.groupCount : this.data.pageData.assets.privateCount
    wx.showModal({
      title: '确认预约',
      content: '当前剩余课时 ' + assetText + ' 节，确认预约《' + title + '》吗？',
      success: (res) => {
        if (!res.confirm) {
          return
        }

        const result = app.createBooking(scheduleId)
        wx.showToast({
          title: result.message,
          icon: result.ok ? 'success' : 'none',
        })
        this.syncPageData()
      },
    })
  },
})
