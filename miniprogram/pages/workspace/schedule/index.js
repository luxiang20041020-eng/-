Page({
  data: {
    runtime: {},
    pageData: {},
    weekLabel: '下周一',
    dateLabel: '04/29',
    timeRange: '19:00 - 20:30',
    title: '',
    type: 'group',
    venue: '',
  },

  onShow() {
    this.syncPageData()
  },

  syncPageData() {
    const app = getApp()
    this.setData({
      runtime: app.getRuntimeSnapshot(),
      pageData: app.getScheduleManagePageData(),
    })
  },

  onInput(event) {
    const { field } = event.currentTarget.dataset
    this.setData({ [field]: event.detail.value })
  },

  onTypeChange(event) {
    this.setData({ type: event.currentTarget.dataset.type })
  },

  onSubmit() {
    if (!this.data.title || !this.data.venue) {
      wx.showToast({ title: '请补全课程主题和场地', icon: 'none' })
      return
    }

    const app = getApp()
    const result = app.createCoachSchedule({
      weekLabel: this.data.weekLabel,
      dateLabel: this.data.dateLabel,
      timeRange: this.data.timeRange,
      title: this.data.title,
      type: this.data.type,
      venue: this.data.venue,
    })
    wx.showToast({ title: result.message, icon: result.ok ? 'success' : 'none' })
    if (result.ok) {
      this.setData({
        title: '',
        venue: '',
      })
      this.syncPageData()
    }
  },
})
