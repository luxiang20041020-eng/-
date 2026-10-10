const { getUserMessage } = require('../../../utils/user-feedback')
const withPageState = require('../../../utils/page-state')
const businessApi = require('../../../utils/business-api')
const { confirmAction, showFeedback, navigateTo, reLaunch, showActionSheet } = require('../../../utils/interaction')
const scheduleCalendar = require('../../../utils/schedule-calendar')

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
    plans: (safeData.plans || []).map(scheduleCalendar.normalizePlan),
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
    weekDay: new Date().getDay(),
    weekLabel: WEEKDAY_OPTIONS.find((item) => item.value === new Date().getDay()).label,
    dateLabel: pad2(new Date().getMonth() + 1) + '/' + pad2(new Date().getDate()),
    fullDate: scheduleCalendar.dateKey(new Date()),
    timeRange: '19:00 - 20:30',
    startTime: '19:00',
    endTime: '20:30',
    minDate: scheduleCalendar.dateKey(new Date()),
    title: '',
    type: 'group',
    storeId: '',
    selectedStoreName: '',
    selectedStoreAddress: '',
    repeatWeekly: false,
    selectedDate: scheduleCalendar.dateKey(new Date()),
    days: [], dayPlans: [], weekRange: '', dayHeading: '', weekCount: 0,
    filterType: 'all', editorOpen: false, capacity: '15',
    repeatDates: [], conflictPlans: [],
    scheduleNotice: '',
  },

  onShow() {
    const today = scheduleCalendar.dateKey(new Date())
    if (!this._lastToday || this.data.selectedDate === this._lastToday) this.setData({ selectedDate: today })
    this._lastToday = today
    this.setData({ minDate: today })
    this.refreshCalendar()
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
      reLaunch({ url: '/pages/login/index' })
      return
    }
    const targetStoreId = selectedStoreId || this.data.storeId || runtime.currentStore.id
    this.hydratePageData(runtime, targetStoreId)
    try {
      const pageData = normalizeSchedulePageData(await businessApi.getCoachScheduleViewData({
        storeId: targetStoreId,
        allCoaches: runtime.role === 'admin',
        coachId: runtime.userProfile.id,
      }), runtime)
      if (this._syncRequestId !== requestId) {
        return
      }
      // 旧接口仅有月/日；用服务端已确认的当天课程补齐，不能猜测年份。
      let scheduleNotice = ''
      if (pageData.plans.some((plan) => !plan.fullDate)) {
        if (businessApi.getWorkspaceViewData) {
          try {
            const workspace = await businessApi.getWorkspaceViewData({ storeId: targetStoreId, coachId: runtime.userProfile.id })
            if (this._syncRequestId !== requestId) return
            const today = scheduleCalendar.fullDateKey(workspace.todayDate) || scheduleCalendar.dateKey(new Date())
            const todayMap = new Map((workspace.todayClasses || []).map((plan) => [plan.id, plan]))
            pageData.plans = pageData.plans.map((plan) => todayMap.has(plan.id) && !plan.fullDate
              ? scheduleCalendar.normalizePlan(Object.assign({}, plan, todayMap.get(plan.id), { fullDate: today })) : plan)
          } catch (error) {
            if (this._syncRequestId !== requestId) return
            scheduleNotice = '当天课程同步失败，请下拉刷新重试。'
          }
        }
        if (!scheduleNotice && pageData.plans.some((plan) => !plan.fullDate)) scheduleNotice = '部分课程日期信息不完整，请刷新同步；当前仅显示日期已确认的课程。'
      }
      const selection = getStoreSelection(pageData, targetStoreId)
      app.setViewCache(buildScheduleCacheKey(runtime, targetStoreId), pageData)
      this.setData({
        runtime,
        pageData,
        storeId: selection.storeId,
        selectedStoreName: selection.selectedStoreName,
        selectedStoreAddress: selection.selectedStoreAddress,
        scheduleNotice,
      })
      this.refreshCalendar()
    } catch (error) {
      if (this._syncRequestId !== requestId) {
        return
      }
      this.setData({ pageError: getUserMessage(error, "加载失败，请重试") })
      const localPageData = normalizeSchedulePageData(app.getViewCache(buildScheduleCacheKey(runtime, targetStoreId)) || app.getScheduleManagePageData(targetStoreId), runtime)
      const selection = getStoreSelection(localPageData, targetStoreId)
      this.setData({
        runtime,
        pageData: localPageData,
        storeId: selection.storeId,
        selectedStoreName: selection.selectedStoreName,
        selectedStoreAddress: selection.selectedStoreAddress,
      })
      this.refreshCalendar()
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
      scheduleNotice: pageData.plans.some((plan) => !plan.fullDate) ? '课程日期信息正在同步，请稍候。' : '',
    })
    this.refreshCalendar()
    return Boolean(cachedPageData)
  },

  refreshCalendar() {
    const plans = this.data.pageData.plans || []
    this.setData(Object.assign(scheduleCalendar.calendar(plans, this.data.selectedDate, this.data.filterType), {
      repeatDates: scheduleCalendar.repeatDates(this.data.fullDate, this.data.repeatWeekly),
      conflictPlans: scheduleCalendar.conflicts(plans.filter(plan => !plan.coachId || plan.coachId === this.data.runtime.userProfile?.id), this.data.fullDate, this.data.startTime, this.data.endTime, this.data.repeatWeekly),
    }))
  },
  onSelectDay(event) {
    this.setData({ selectedDate: event.currentTarget.dataset.date })
    this.refreshCalendar()
  },
  onCalendarDateChange(event) {
    this.setData({ selectedDate: event.detail.value })
    this.refreshCalendar()
  },
  onShiftWeek(event) {
    this.setData({ selectedDate: scheduleCalendar.shiftDate(this.data.selectedDate, Number(event.currentTarget.dataset.days)) })
    this.refreshCalendar()
  },
  onToday() {
    this.setData({ selectedDate: scheduleCalendar.dateKey(new Date()) })
    this.refreshCalendar()
  },
  onFilter(event) {
    this.setData({ filterType: event.currentTarget.dataset.type })
    this.refreshCalendar()
  },
  onOpenEditor() {
    if (this.data.submitting || this.data.pageBusy || this.data.pageError) return
    const fullDate = this.data.selectedDate < this.data.minDate ? this.data.minDate : this.data.selectedDate
    this.onDateChange({ detail: { value: fullDate } })
    this.setData({ editorOpen: true })
  },
  onCloseEditor() { if (!this.data.submitting) this.setData({ editorOpen: false }) },
  onAdjustClass(event) { navigateTo({ url: '/pages/workspace/adjust/index?classId=' + encodeURIComponent(event.currentTarget.dataset.id) }) },
  onOpenClass(event) {
    navigateTo({ url: '/pages/workspace/class/index?classId=' + encodeURIComponent(event.currentTarget.dataset.id) })
  },

  onInput(event) {
    if (this.data.submitting) return
    const { field } = event.currentTarget.dataset
    if (!['title', 'capacity'].includes(field)) return
    this.setData({ [field]: event.detail.value })
  },

  onTypeChange(event) {
    if (this.data.submitting) return
    const type = event.currentTarget.dataset.type
    this.setData({ type, capacity: type === 'group' ? '15' : '1' })
  },

  onDateChange(event) {
    if (this.data.submitting) return
    const fullDate = event.detail.value
    const weekDay = scheduleCalendar.parseDate(fullDate).getUTCDay()
    const option = WEEKDAY_OPTIONS.find((item) => item.value === weekDay)
    this.setData({ fullDate, dateLabel: fullDate.slice(5).replace('-', '/'), weekDay, weekLabel: option.label })
    this.refreshCalendar()
  },

  onTimeChange(event) {
    if (this.data.submitting) return
    const field = event.currentTarget.dataset.field
    if (!['startTime', 'endTime'].includes(field)) return
    this.setData({ [field]: event.detail.value })
    this.setData({ timeRange: this.data.startTime + ' - ' + this.data.endTime })
    this.refreshCalendar()
  },

  onStoreFieldTap() {
    if (this.data.submitting || this.data.editorOpen) return
    const stores = this.data.pageData.stores || []
    if (!stores.length) {
      showFeedback({ title: '暂无可选门店', icon: 'none' })
      return
    }

    showActionSheet({
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
    if (this.data.submitting) return
    this.setData({
      repeatWeekly: event.detail.value,
    })
    this.refreshCalendar()
  },

  async onSubmit() {
    if (this.data.submitting || this.data.pageError || this.data.pageBusy) return
    const selectedStore = (this.data.pageData.stores || []).find((item) => item.id === this.data.storeId)
      || this.data.pageData.currentStore

    if (!this.data.title.trim() || !selectedStore || !selectedStore.id) {
      showFeedback({ title: '请补全训练主题并选择门店', icon: 'none' })
      return
    }

    if (this.data.endTime <= this.data.startTime) {
      showFeedback({ title: '结束时间须晚于开始时间', icon: 'none' })
      return
    }
    if (new Date(this.data.fullDate + 'T' + this.data.startTime + ':00+08:00').getTime() <= Date.now()) {
      showFeedback({ title: '请选择未来的训练时间', icon: 'none' }); return
    }
    const capacity = this.data.type === 'private' ? 1 : Number(this.data.capacity)
    if (!Number.isInteger(capacity) || capacity < 1 || capacity > 100) {
      showFeedback({ title: '人数应为 1 至 100 的整数', icon: 'none' }); return
    }
    this.refreshCalendar()
    if (this.data.conflictPlans.length) {
      showFeedback({ title: '与已有课程重叠，请调整时间', icon: 'none' }); return
    }
    const app = getApp()
    this.setData({ submitting: true })
    let result = null

    try {
      const confirmed = await confirmAction({ title: '确认发布排课', contentParts: [this.data.title.trim(), '\n' + selectedStore.name + ' · ', { text: '{0} 人', values: [capacity] }, '\n' + this.data.timeRange + '\n' + this.data.repeatDates.join('、') + '\n', { text: '发布后学员即可预约。' }] })
      if (!confirmed) return
      const runtime = await app.getRuntimeSnapshotAsync({ force: true })
      if (!runtime.isAuthenticated) {
        reLaunch({ url: '/pages/login/index' })
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
        maxCapacity: capacity,
        weekDay: this.data.weekDay,
        repeatWeekly: this.data.repeatWeekly,
      })
      result = { ok: true, message: cloudResult.message || '排课已发布' }
    } catch (error) {
      result = { ok: false, message: getUserMessage(error, "排课未保存，请重试") }
    } finally {
      this.setData({ submitting: false })
    }

    showFeedback({ title: result.message, icon: result.ok ? 'success' : 'none' })
    if (result.ok) {
      app.removeViewCacheByPrefix('workspace:')
      app.removeViewCacheByPrefix('booking:')
      this.setData({
        title: '',
        editorOpen: false,
        selectedDate: this.data.fullDate,
        filterType: 'all',
      })
      this.syncPageData(selectedStore.id)
    }
  },
}))
