const businessApi = require('../../../utils/business-api')

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

Page({
  data: {
    runtime: {},
    pageData: {},
    weekDay: 1,
    weekLabel: '周一',
    dateLabel: getNextDateByWeekday(1).monthDay,
    fullDate: getNextDateByWeekday(1).fullDate,
    timeRange: '19:00 - 20:30',
    title: '',
    type: 'group',
    storeId: '',
    selectedStoreName: '',
    selectedStoreAddress: '',
    repeatWeekly: true,
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
    const app = getApp()
    const runtime = await app.getRuntimeSnapshotAsync({ force: true })
    if (!runtime.isAuthenticated) {
      wx.reLaunch({ url: '/pages/login/index' })
      return
    }
    const selectedStore = (this.data.pageData.stores || []).find((item) => item.id === this.data.storeId)
      || this.data.pageData.currentStore

    if (!this.data.title || !selectedStore || !selectedStore.id) {
      wx.showToast({ title: '请补全课程主题并选择门店', icon: 'none' })
      return
    }

    const localPayload = {
      storeId: selectedStore.id,
      storeName: selectedStore.name,
      weekLabel: this.data.weekLabel,
      dateLabel: this.data.dateLabel,
      timeRange: this.data.timeRange,
      title: this.data.title,
      type: this.data.type,
      venue: selectedStore.name,
      repeatWeekly: this.data.repeatWeekly,
    }
    let result = null

    try {
      const cloudResult = await businessApi.createCoachSchedule({
        storeId: selectedStore.id,
        storeName: selectedStore.name,
        coachId: runtime.userProfile.id,
        classType: this.data.type === 'group' ? 1 : 2,
        title: this.data.title,
        startTime: this.data.fullDate + ' ' + this.data.timeRange.split(' - ')[0] + ':00',
        endTime: this.data.fullDate + ' ' + this.data.timeRange.split(' - ')[1] + ':00',
        maxCapacity: this.data.type === 'group' ? 15 : 1,
        weekDay: this.data.weekDay,
        repeatWeekly: this.data.repeatWeekly,
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
      app.removeViewCacheByPrefix('workspace:')
      app.removeViewCacheByPrefix('booking:')
      this.setData({
        title: '',
      })
      this.syncPageData(selectedStore.id)
    }
  },
})
