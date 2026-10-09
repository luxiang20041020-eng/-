const { showModal } = require('../../utils/interaction')
const { getUserMessage } = require('../../utils/user-feedback')
const withPageState = require('../../utils/page-state')
const businessApi = require('../../utils/business-api')
const { confirmAction, showFeedback, navigateTo, showActionSheet } = require('../../utils/interaction')

const WEEKDAY_LABELS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

function pad2(value) {
  return String(value).padStart(2, '0')
}

function getDateKey(date) {
  return date.getFullYear() + '-' + pad2(date.getMonth() + 1) + '-' + pad2(date.getDate())
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

Page(withPageState({
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
    bookingId: '',
  },

  onLoad(options) {
    this.setData({ filters: Object.assign({}, this.data.filters, {
      type: options.type === 'private' ? 'private' : 'group', dateKey: buildNextSevenDays()[0].key,
    }) })
  },

  onShow() {
    const today = buildNextSevenDays()[0].key
    if (this.data.filters.dateKey < today) this.setData({ filters: Object.assign({}, this.data.filters, { dateKey: today }) })
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
      if (this._syncRequestId !== requestId) return
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
      this.setData({ pageError: getUserMessage(error, "加载失败，请重试") })
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

  onOpenStorePicker() {
    const stores = this.data.runtime.stores || []
    showActionSheet({ itemList: stores.map((item) => item.name), success: (result) => {
      if (stores[result.tapIndex]) { getApp().switchStore(stores[result.tapIndex].id); this.syncPageData() }
    } })
  },

  onResetFilters() {
    this.setData({ filters: { type: this.data.filters.type, coachId: 'all', dateKey: buildNextSevenDays()[0].key } }, () => this.syncPageData())
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
    if (this._isBooking || this.data.pageBusy || this.data.pageError) return
    const app = getApp()
    if (!this.data.runtime.isAuthenticated) {
      navigateTo({ url: '/pages/login/index?returnTo=booking&type=' + this.data.filters.type })
      return
    }
    const scheduleId = event.currentTarget.dataset.scheduleId
    const schedule = (this.data.pageData.schedules || []).find((item) => item.id === scheduleId)
    if (!schedule || schedule.isBooked || schedule.isFull) return
    const balance = schedule.type === 'group' ? this.data.pageData.assets.groupCount : this.data.pageData.assets.privateCount
    if (Number(balance) < 1) {
      showModal({ title: '训练权益不足', content: '此场次需要 1 次' + schedule.typeLabel + '权益。请到馆购买或联系场馆人员补充权益。', showCancel: false, confirmText: '知道了' })
      return
    }
    this._isBooking = true
    try {
      const confirmed = await confirmAction({ title: '确认这次训练', confirmText: '确认预约',
        contentParts: [schedule.title, '\n' + schedule.dateLabel + ' ' + schedule.timeRange + '\n' + schedule.venue + '\n', { text: '将扣除 1 次权益，剩余 {0} 次。开课前 2 小时可取消。', values: [Number(balance) - 1] }] })
      if (!confirmed) return
      this.setData({ bookingId: scheduleId })
      const result = await businessApi.createBooking({ scheduleId, remark: '小程序预约' })
      app.removeViewCacheByPrefix('booking:')
      app.removeViewCacheByPrefix('profile:')
      showFeedback({ title: result.message || '预约成功', icon: 'success' })
      await this.syncPageData()
    } catch (error) {
      showModal({ title: '预约未完成', content: getUserMessage(error), showCancel: false, confirmText: '知道了' })
    } finally {
      this._isBooking = false
      this.setData({ bookingId: '' })
    }
  },
}))
