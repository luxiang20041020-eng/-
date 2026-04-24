const businessApi = require('../../utils/business-api')

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

  async syncPageData() {
    const app = getApp()
    const runtime = app.getRuntimeSnapshot()

    try {
      const pageData = await businessApi.getBookingViewData({
        userId: app.globalData.userProfile.id,
        storeId: runtime.currentStore.id,
        filters: this.data.filters,
      })
      this.setData({
        runtime,
        pageData,
      })
    } catch (error) {
      this.setData({
        runtime,
        pageData: app.getBookingPageData(this.data.filters),
      })
    }
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

  async onBook(event) {
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
      success: async (res) => {
        if (!res.confirm) {
          return
        }

        let result = null
        try {
          const cloudResult = await businessApi.createBooking({
            userId: app.globalData.userProfile.id,
            scheduleId,
            remark: '小程序预约',
          })
          result = app.applyCloudBookingSuccess(scheduleId, {
            bookingId: cloudResult.bookingId,
          })
        } catch (error) {
          // 云端未部署或集合未初始化时，先回退到本地内存态，避免当前演示链路中断。
          result = app.createBooking(scheduleId)
          if (result.ok) {
            result.message = result.message + '（当前使用本地演示数据）'
          } else if (error && error.message) {
            result.message = result.message + '；云端返回：' + error.message
          }
        }

        wx.showToast({
          title: result.message,
          icon: result.ok ? 'success' : 'none',
        })
        this.syncPageData()
      },
    })
  },
})
