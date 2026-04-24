const businessApi = require('../../../utils/business-api')

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

  async syncPageData() {
    const app = getApp()
    const runtime = app.getRuntimeSnapshot()
    try {
      const pageData = await businessApi.getCoachScheduleViewData({
        storeId: runtime.currentStore.id,
        coachId: 'coach_li',
      })
      this.setData({
        runtime,
        pageData,
      })
    } catch (error) {
      this.setData({
        runtime,
        pageData: app.getScheduleManagePageData(),
      })
    }
  },

  onInput(event) {
    const { field } = event.currentTarget.dataset
    this.setData({ [field]: event.detail.value })
  },

  onTypeChange(event) {
    this.setData({ type: event.currentTarget.dataset.type })
  },

  async onSubmit() {
    if (!this.data.title || !this.data.venue) {
      wx.showToast({ title: '请补全课程主题和场地', icon: 'none' })
      return
    }

    const app = getApp()
    const localPayload = {
      weekLabel: this.data.weekLabel,
      dateLabel: this.data.dateLabel,
      timeRange: this.data.timeRange,
      title: this.data.title,
      type: this.data.type,
      venue: this.data.venue,
    }
    let result = null

    try {
      const cloudResult = await businessApi.createCoachSchedule({
        storeId: app.globalData.selectedStoreId,
        coachId: 'coach_li',
        classType: this.data.type === 'group' ? 1 : 2,
        title: this.data.title,
        startTime: '2026-' + this.data.dateLabel.replace('/', '-') + ' ' + this.data.timeRange.split(' - ')[0] + ':00',
        endTime: '2026-' + this.data.dateLabel.replace('/', '-') + ' ' + this.data.timeRange.split(' - ')[1] + ':00',
        maxCapacity: this.data.type === 'group' ? 15 : 1,
        venue: this.data.venue,
      })
      result = app.createCoachSchedule(Object.assign({}, localPayload, { planId: cloudResult.scheduleId }))
    } catch (error) {
      result = app.createCoachSchedule(localPayload)
      if (result.ok) {
        result.message = result.message + '（当前使用本地演示数据）'
      } else if (error && error.message) {
        result.message = result.message + '；云端返回：' + error.message
      }
    }

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
