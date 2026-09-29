const businessApi = require('../../utils/business-api')

const WEEKDAY_LABELS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

function pad2(value) {
  return String(value).padStart(2, '0')
}

function getDateKey(date) {
  return pad2(date.getMonth() + 1) + '-' + pad2(date.getDate())
}

function buildNextSevenDays() {
  const today = new Date()
  const dates = []
  for (let index = 0; index < 7; index += 1) {
    const current = new Date(today)
    current.setDate(today.getDate() + index)
    dates.push({
      key: getDateKey(current),
      label: index === 0 ? pad2(current.getMonth() + 1) + '/' + pad2(current.getDate()) + ' 今日' : pad2(current.getMonth() + 1) + '/' + pad2(current.getDate()) + ' ' + WEEKDAY_LABELS[current.getDay()],
      displayMonthDay: pad2(current.getMonth() + 1) + '/' + pad2(current.getDate()),
      displayWeekday: index === 0 ? '今日' : WEEKDAY_LABELS[current.getDay()],
    })
  }
  return dates
}

const DEFAULT_DATE_KEY = buildNextSevenDays()[0].key

function decorateSchedule(schedule) {
  const timeParts = String(schedule.timeRange || '').split(' - ')
  const bookedCount = Number(schedule.bookedCount || 0)
  const capacity = Number(schedule.capacity || 0)
  return Object.assign({}, schedule, {
    timeStart: timeParts[0] || '--:--',
    timeEnd: timeParts[1] || '--:--',
    progressPercent: capacity > 0 ? Math.min(100, Math.round((bookedCount / capacity) * 100)) : 0,
  })
}

function normalizeCoach(coach) {
  const specialties = Array.isArray(coach.specialties) ? coach.specialties : []
  return Object.assign({}, coach, {
    title: coach.title || '场馆人员',
    specialties,
    specialtiesText: specialties.join(' / '),
    summaryText: specialties.length ? specialties.join(' / ') : (coach.bio || ''),
    avatarText: (coach.name || '教').slice(0, 1),
    searchText: [coach.name || '', coach.title || '', specialties.join(' '), coach.levelLabel || '', coach.bio || ''].join(' ').toLowerCase(),
  })
}

function decorateBookingPageData(pageData, filters, coachKeyword) {
  const safeData = pageData || {}
  const normalizedCoaches = (safeData.coaches || []).map(normalizeCoach)
  const selectedCoach = normalizedCoaches.find((item) => item.id === (filters && filters.coachId))
  const keyword = String(coachKeyword || '').trim().toLowerCase()
  const filteredCoachOptions = normalizedCoaches.filter((item) => !keyword || item.searchText.includes(keyword))
  return Object.assign({}, safeData, {
    filters: Object.assign({}, safeData.filters, filters || {}),
    coaches: normalizedCoaches,
    filteredCoachOptions,
    selectedCoachName: selectedCoach ? selectedCoach.name : '全部人员',
    selectedCoachTitle: selectedCoach ? selectedCoach.title : '全部人员',
    resultCount: (safeData.schedules || []).length,
    dates: buildNextSevenDays(),
    schedules: (safeData.schedules || []).map(decorateSchedule),
  })
}

function buildBookingCacheKey(runtime, filters) {
  const safeRuntime = runtime || {}
  const safeFilters = filters || {}
  const userId = safeRuntime.userProfile && safeRuntime.userProfile.id ? safeRuntime.userProfile.id : 'guest'
  const storeId = safeRuntime.currentStore && safeRuntime.currentStore.id ? safeRuntime.currentStore.id : 'default'
  return [
    'booking',
    userId,
    storeId,
    safeFilters.type || 'group',
    safeFilters.coachId || 'all',
    safeFilters.dateKey || DEFAULT_DATE_KEY,
  ].join(':')
}

Page({
  data: {
    runtime: {},
    pageData: {},
    filters: {
      type: 'group',
      coachId: 'all',
      dateKey: DEFAULT_DATE_KEY,
    },
    coachPickerVisible: false,
    coachKeyword: '',
  },

  onShow() {
    this.syncPageData()
  },

  hydratePageData(runtime) {
    const app = getApp()
    const cacheKey = buildBookingCacheKey(runtime, this.data.filters)
    const cachedPageData = app.getViewCache(cacheKey)
    const pageData = cachedPageData || app.getBookingPageData(this.data.filters)

    this.setData({
      runtime,
      pageData: decorateBookingPageData(pageData, this.data.filters, this.data.coachKeyword),
    })

    return Boolean(cachedPageData)
  },

  async syncPageData() {
    const app = getApp()
    const initialRuntime = app.getRuntimeSnapshot()
    this.hydratePageData(initialRuntime)
    const requestId = (this._syncRequestId || 0) + 1
    this._syncRequestId = requestId

    try {
      const runtime = await app.getRuntimeSnapshotAsync()
      const pageData = await businessApi.getBookingViewData({
        userId: app.globalData.userProfile.id,
        storeId: runtime.currentStore.id,
        filters: this.data.filters,
      })
      if (this._syncRequestId !== requestId) {
        return
      }
      app.setViewCache(buildBookingCacheKey(runtime, this.data.filters), pageData)
      this.setData({
        runtime,
        pageData: decorateBookingPageData(pageData, this.data.filters, this.data.coachKeyword),
      })
    } catch (error) {
      if (this._syncRequestId !== requestId) {
        return
      }
      const runtime = app.getRuntimeSnapshot()
      this.setData({
        runtime,
        pageData: decorateBookingPageData(app.getBookingPageData(this.data.filters), this.data.filters, this.data.coachKeyword),
      })
    }
  },

  onTypeChange(event) {
    this.setData({
      filters: Object.assign({}, this.data.filters, {
        type: event.currentTarget.dataset.type,
      }),
    }, () => {
      this.syncPageData()
    })
  },

  onOpenCoachPicker() {
    this.setData({
      coachPickerVisible: true,
    })
  },

  onCloseCoachPicker() {
    this.setData({
      coachPickerVisible: false,
      coachKeyword: '',
      pageData: decorateBookingPageData(this.data.pageData, this.data.filters, ''),
    })
  },

  onCoachKeywordInput(event) {
    const nextKeyword = event.detail.value
    this.setData({
      coachKeyword: nextKeyword,
      pageData: decorateBookingPageData(this.data.pageData, this.data.filters, nextKeyword),
    })
  },

  onCoachChange(event) {
    this.setData({
      filters: Object.assign({}, this.data.filters, {
        coachId: event.currentTarget.dataset.coachId,
      }),
      coachPickerVisible: false,
      coachKeyword: '',
    }, () => {
      this.syncPageData()
    })
  },

  onDateChange(event) {
    this.setData({
      filters: Object.assign({}, this.data.filters, {
        dateKey: event.currentTarget.dataset.dateKey,
      }),
    }, () => {
      this.syncPageData()
    })
  },

  async onBook(event) {
    if (this._isBooking) return
    const app = getApp()
    const runtime = await app.getRuntimeSnapshotAsync({ force: true })
    if (!runtime.isAuthenticated) {
      wx.showModal({
        title: '请先登录',
        content: '预约需要登录，是否前往登录？',
        confirmText: '去登录',
        success: (res) => {
          if (res.confirm) {
            wx.navigateTo({ url: '/pages/login/index' })
          }
        },
      })
      return
    }
    const { scheduleId, title } = event.currentTarget.dataset
    const schedule = this.data.pageData.schedules.find((item) => item.id === scheduleId)
    if (!schedule || schedule.isBooked || schedule.isFull) {
      return
    }

    const assetText = schedule.type === 'group' ? this.data.pageData.assets.groupCount : this.data.pageData.assets.privateCount
    wx.showModal({
      title: '确认预约',
      content: '当前剩余权益 ' + assetText + ' 次，确认预约《' + title + '》吗？',
      success: async (res) => {
        if (!res.confirm) return
        if (this._isBooking) return
        this._isBooking = true

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
        } finally {
          this._isBooking = false
        }

        wx.showToast({
          title: result.message,
          icon: result.ok ? 'success' : 'none',
        })
        if (result.ok) {
          const userId = app.globalData.userProfile.id || 'guest'
          app.removeViewCacheByPrefix('booking:' + userId + ':')
          app.removeViewCacheByPrefix('profile:' + userId)
        }
        this.syncPageData()
      },
    })
  },
})
