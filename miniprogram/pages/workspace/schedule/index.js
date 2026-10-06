const withPageState = require('../../../utils/page-state')
const businessApi = require('../../../utils/business-api')
const { confirmAction } = require('../../../utils/interaction')

const WEEKDAY_OPTIONS = [
  { value: 1, label: '周一' },
  { value: 2, label: '周二' },
  { value: 3, label: '周三' },
  { value: 4, label: '周四' },
  { value: 5, label: '周五' },
  { value: 6, label: '周六' },
  { value: 0, label: '周日' },
]

function pad2(value) {
  return String(value).padStart(2, '0')
}

function getNextDateByWeekday(weekDay) {
  const today = new Date()
  const currentWeekDay = today.getDay()
  let diff = weekDay - currentWeekDay
  if (diff < 0) {
    diff += 7
  }
  const targetDate = new Date(today)
  targetDate.setDate(today.getDate() + diff)
  return {
    monthDay: pad2(targetDate.getMonth() + 1) + '/' + pad2(targetDate.getDate()),
    fullDate: targetDate.getFullYear() + '-' + pad2(targetDate.getMonth() + 1) + '-' + pad2(targetDate.getDate()),
  }
}

function mapRuntimeStoreToOption(store) {
  return {
    id: store.id,
    name: store.name,
    address: store.address,
  }
}

function normalizeSchedulePageData(pageData, runtime) {
  const safeData = pageData || {}
  const fallbackStores = (runtime && runtime.stores ? runtime.stores : []).map(mapRuntimeStoreToOption)
  return Object.assign({}, safeData, {
    stores: safeData.stores && safeData.stores.length ? safeData.stores : fallbackStores,
    plans: safeData.plans || [],
  })
}

function getStoreSelection(pageData, fallbackStoreId) {
  const stores = pageData.stores || []
  if (stores.some((item) => item.id === fallbackStoreId)) {
    const selectedStore = stores.find((item) => item.id === fallbackStoreId)
    return {
      storeId: fallbackStoreId,
      selectedStoreName: selectedStore ? selectedStore.name : '',
      selectedStoreAddress: selectedStore ? selectedStore.address : '',
    }
  }
  if (stores[0]) {
    return {
      storeId: stores[0].id,
      selectedStoreName: stores[0].name,
      selectedStoreAddress: stores[0].address,
    }
  }
  return {
    storeId: fallbackStoreId || '',
    selectedStoreName: pageData.currentStore ? pageData.currentStore.name : '',
    selectedStoreAddress: pageData.currentStore ? pageData.currentStore.address : '',
  }
}

function buildScheduleCacheKey(runtime, storeId) {
  const userId = runtime && runtime.userProfile && runtime.userProfile.id ? runtime.userProfile.id : 'guest'
  return 'workspace:schedule:' + userId + ':' + (storeId || 'default')
}

Page(withPageState({
  data: {
    runtime: {},
    submitting: false,
    pageData: {},
    weekDay: 1,
    weekLabel: '周一',
    dateLabel: getNextDateByWeekday(1).monthDay,
    fullDate: getNextDateByWeekday(1).fullDate,
    timeRange: '19:00 - 20:30',
    startTime: '19:00',
    endTime: '20:30',
    minDate: getNextDateByWeekday(new Date().getDay()).fullDate,
    title: '',
    type: 'group',
    storeId: '',
    selectedStoreName: '',
    selectedStoreAddress: '',
    repeatWeekly: false,
    weekOptions: WEEKDAY_OPTIONS,
  },

  onShow() {
    this.syncPageData()
  },

  async syncPageData(selectedStoreId) {
    const app = getApp()
    const initialRuntime = app.getRuntimeSnapshot()
    const initialStoreId = selectedStoreId || this.data.storeId || (initialRuntime.currentStore && initialRuntime.currentStore.id)
    this.hydratePageData(initialRuntime, initialStoreId)
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
    const targetStoreId = selectedStoreId || this.data.storeId || runtime.currentStore.id
    this.hydratePageData(runtime, targetStoreId)
    try {
      const pageData = normalizeSchedulePageData(await businessApi.getCoachScheduleViewData({
        storeId: targetStoreId,
        coachId: runtime.userProfile.id,
      }), runtime)
      if (this._syncRequestId !== requestId) {
        return
      }
      const selection = getStoreSelection(pageData, targetStoreId)
      app.setViewCache(buildScheduleCacheKey(runtime, targetStoreId), pageData)
      this.setData({
        runtime,
        pageData,
        storeId: selection.storeId,
        selectedStoreName: selection.selectedStoreName,
        selectedStoreAddress: selection.selectedStoreAddress,
      })
    } catch (error) {
      if (this._syncRequestId !== requestId) {
        return
      }
      this.setData({ pageError: error.message || "加载失败，请重试" })
      const localPageData = normalizeSchedulePageData(app.getScheduleManagePageData(targetStoreId), runtime)
      const selection = getStoreSelection(localPageData, targetStoreId)
      this.setData({
        runtime,
        pageData: localPageData,
        storeId: selection.storeId,
        selectedStoreName: selection.selectedStoreName,
        selectedStoreAddress: selection.selectedStoreAddress,
      })
    }
  },

  hydratePageData(runtime, storeId) {
    const app = getApp()
    if (!runtime || !runtime.isAuthenticated) {
      return false
    }
    const targetStoreId = storeId || (runtime.currentStore && runtime.currentStore.id)
    const cachedPageData = app.getViewCache(buildScheduleCacheKey(runtime, targetStoreId))
    const pageData = normalizeSchedulePageData(cachedPageData || app.getScheduleManagePageData(targetStoreId), runtime)
    const selection = getStoreSelection(pageData, targetStoreId)
    this.setData({
      runtime,
      pageData,
      storeId: selection.storeId,
      selectedStoreName: selection.selectedStoreName,
      selectedStoreAddress: selection.selectedStoreAddress,
    })
    return Boolean(cachedPageData)
  },

  onInput(event) {
    const { field } = event.currentTarget.dataset
    this.setData({ [field]: event.detail.value })
  },

  onTypeChange(event) {
    this.setData({ type: event.currentTarget.dataset.type })
  },

  onDateChange(event) {
    const fullDate = event.detail.value
    const date = new Date(fullDate + 'T12:00:00+08:00')
    const weekDay = date.getDay()
    const option = WEEKDAY_OPTIONS.find((item) => item.value === weekDay)
    this.setData({ fullDate, dateLabel: fullDate.slice(5).replace('-', '/'), weekDay, weekLabel: option.label })
  },

  onTimeChange(event) {
    const field = event.currentTarget.dataset.field
    if (!['startTime', 'endTime'].includes(field)) return
    this.setData({ [field]: event.detail.value })
    this.setData({ timeRange: this.data.startTime + ' - ' + this.data.endTime })
  },

  onWeekChange(event) {
    const weekDay = Number(event.currentTarget.dataset.weekDay)
    const nextDate = getNextDateByWeekday(weekDay)
    const option = WEEKDAY_OPTIONS.find((item) => item.value === weekDay)
    this.setData({
      weekDay,
      weekLabel: option ? option.label : '周一',
      dateLabel: nextDate.monthDay,
      fullDate: nextDate.fullDate,
    })
  },

  onStoreFieldTap() {
    const stores = this.data.pageData.stores || []
    if (!stores.length) {
      wx.showToast({ title: '暂无可选门店', icon: 'none' })
      return
    }

    wx.showActionSheet({
      itemList: stores.map((item) => item.name),
      success: (res) => {
        const selectedStore = stores[res.tapIndex]
        if (!selectedStore) {
          return
        }
        this.setData({
          storeId: selectedStore.id,
          selectedStoreName: selectedStore.name,
          selectedStoreAddress: selectedStore.address,
        })
        this.syncPageData(selectedStore.id)
      },
    })
  },

  onRepeatWeeklyChange(event) {
    this.setData({
      repeatWeekly: event.detail.value,
    })
  },

  async onSubmit() {
    if (this.data.submitting || this.data.pageError || this.data.pageBusy) return
    const selectedStore = (this.data.pageData.stores || []).find((item) => item.id === this.data.storeId)
      || this.data.pageData.currentStore

    if (!this.data.title.trim() || !selectedStore || !selectedStore.id) {
      wx.showToast({ title: '请补全训练主题并选择门店', icon: 'none' })
      return
    }

    if (this.data.endTime <= this.data.startTime) {
      wx.showToast({ title: '结束时间须晚于开始时间', icon: 'none' })
      return
    }
    const app = getApp()
    this.setData({ submitting: true })
    let result = null

    try {
      const confirmed = await confirmAction({ title: '确认发布排课', content: this.data.title.trim() + '\n' + selectedStore.name + ' · ' + this.data.fullDate + '\n' + this.data.timeRange + (this.data.repeatWeekly ? '\n将连续发布 4 周的场次。' : '\n发布后学员即可预约。') })
      if (!confirmed) return
      const runtime = await app.getRuntimeSnapshotAsync({ force: true })
      if (!runtime.isAuthenticated) {
        wx.reLaunch({ url: '/pages/login/index' })
        return
      }
      const cloudResult = await businessApi.createCoachSchedule({
        storeId: selectedStore.id,
        storeName: selectedStore.name,
        coachId: runtime.userProfile.id,
        classType: this.data.type === 'group' ? 1 : 2,
        title: this.data.title.trim(),
        startTime: this.data.fullDate + ' ' + this.data.startTime + ':00',
        endTime: this.data.fullDate + ' ' + this.data.endTime + ':00',
        maxCapacity: this.data.type === 'group' ? 15 : 1,
        weekDay: this.data.weekDay,
        repeatWeekly: this.data.repeatWeekly,
      })
      result = { ok: true, message: cloudResult.message || '排课已发布' }
    } catch (error) {
      result = { ok: false, message: error.message || "排课未保存，请重试" }
    } finally {
      this.setData({ submitting: false })
    }

    wx.showToast({ title: result.message, icon: result.ok ? 'success' : 'none' })
    if (result.ok) {
      app.removeViewCacheByPrefix('workspace:')
      app.removeViewCacheByPrefix('booking:')
      this.setData({
        title: '',
      })
      this.syncPageData(selectedStore.id)
    }
  },
}))
