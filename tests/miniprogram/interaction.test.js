const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { test } = require('node:test')
const root = path.resolve(__dirname, '../../miniprogram')

test('排期周历跨年、过滤类型和当天课程按时间排序', () => {
  const calendar = require('../../miniprogram/utils/schedule-calendar')
  const plans = [
    { id: 'late', fullDate: '2027-01-01', startTime: '19:00', type: 'group', status: '已发布' },
    { id: 'early', fullDate: '2027-01-01', startTime: '10:00', type: 'private', status: '已发布' },
    { id: 'cancelled', fullDate: '2027-01-01', startTime: '12:00', type: 'group', status: '已取消' },
  ]
  const view = calendar.calendar(plans, '2027-01-01')
  assert.equal(view.days[0].key, '2026-12-28')
  assert.equal(view.days[6].key, '2027-01-03')
  assert.equal(view.weekCount, 2)
  assert.deepEqual(view.dayPlans.map((p) => p.id), ['early', 'cancelled', 'late'])
  assert.equal(calendar.calendar(plans, '2027-01-01', 'private').dayPlans.length, 1)
})

test('重复排期检测后续周冲突，首尾相接和已取消课程不冲突', () => {
  const calendar = require('../../miniprogram/utils/schedule-calendar')
  const plans = [
    { id: 'next', fullDate: '2027-01-08', startTime: '19:30', endTime: '20:30', status: '已发布' },
    { id: 'adjacent', fullDate: '2027-01-01', startTime: '18:00', endTime: '19:00', status: '已发布' },
    { id: 'cancelled', fullDate: '2027-01-01', startTime: '19:00', endTime: '20:00', status: '已取消' },
  ]
  assert.equal(calendar.conflicts(plans, '2027-01-01', '19:00', '20:00', false).length, 0)
  assert.deepEqual(calendar.conflicts(plans, '2027-01-01', '19:00', '20:00', true).map((p) => p.id), ['next'])
  assert.deepEqual(calendar.repeatDates('2027-01-22', true), ['2027-01-22', '2027-01-29', '2027-02-05', '2027-02-12'])
})

test('排期选日与表单联动，重复发布包含实际日期和自定义人数', async () => {
  let payload
  const { page, app, calls } = harness('pages/workspace/schedule/index.js', { createCoachSchedule: async (value) => { payload = value; return {} } })
  app.getRuntimeSnapshotAsync = async () => ({ isAuthenticated: true, userProfile: { id: 'coach' } })
  page.syncPageData = async () => {}
  page.data.pageData = { stores: [{ id: 'gaoxin', name: '高新店' }], plans: [] }
  page.data.storeId = 'gaoxin'
  page.onSelectDay({ currentTarget: { dataset: { date: '2099-01-22' } } })
  page.onOpenEditor()
  assert.equal(page.data.fullDate, '2099-01-22')
  page.data.title = '基础训练'
  page.data.capacity = '12'
  page.data.filterType = 'private'
  page.onRepeatWeeklyChange({ detail: { value: true } })
  await Promise.all([page.onSubmit(), page.onSubmit()])
  assert.equal(payload.maxCapacity, 12)
  assert.equal(payload.repeatWeekly, true)
  assert.match(calls.modals[0].content, /2099-02-12/)
  assert.equal(calls.modals.length, 1)
  assert.equal(page.data.editorOpen, false)
  assert.equal(page.data.filterType, 'all')
})

test('排期冲突或非法人数不会发起发布，提交中无法改动草稿', async () => {
  let writes = 0
  const { page } = harness('pages/workspace/schedule/index.js', { createCoachSchedule: async () => { writes += 1 } })
  page.data.pageData = { stores: [{ id: 'gaoxin', name: '高新店' }], plans: [{ id: 'slot', fullDate: '2099-01-01', startTime: '19:30', endTime: '20:30', status: '已发布' }] }
  Object.assign(page.data, { storeId: 'gaoxin', title: '训练', fullDate: '2099-01-01', capacity: '0' })
  await page.onSubmit()
  page.data.capacity = '15'
  await page.onSubmit()
  assert.equal(writes, 0)
  page.data.submitting = true
  page.onDateChange({ detail: { value: '2099-02-01' } })
  page.onCloseEditor()
  assert.equal(page.data.fullDate, '2099-01-01')
})

test('排期日期统一处理完整日期、原始时间、时区和旧时间段', () => {
  const calendar = require('../../miniprogram/utils/schedule-calendar')
  const raw = calendar.normalizePlan({ start_time: '2026/10/8 9:00:00', end_time: '2026/10/8 10:30:00' })
  assert.equal(raw.fullDate, '2026-10-08')
  assert.equal(raw.startTime, '09:00')
  assert.equal(raw.endTime, '10:30')
  const iso = calendar.normalizePlan({ start_time: '2026-10-07T17:00:00Z', end_time: '2026-10-07T18:00:00Z' })
  assert.equal(iso.fullDate, '2026-10-08')
  assert.equal(iso.startTime, '01:00')
  const legacy = calendar.normalizePlan({ dateLabel: '10/08', timeRange: '9:00 - 10:30' })
  assert.equal(legacy.fullDate, '')
  assert.equal(legacy.startTime, '09:00')
  assert.equal(calendar.fullDateKey('2026-02-30'), '')
  assert.equal(calendar.dateKey(new Date('2026-10-07T17:00:00Z')), '2026-10-08')
})

function schedulePage(api) {
  const result = harness('pages/workspace/schedule/index.js', api)
  const runtime = { isAuthenticated: true, role: 'coach', userProfile: { id: 'coach' }, currentStore: { id: 'gaoxin', name: '高新店' }, stores: [{ id: 'gaoxin', name: '高新店' }] }
  const cache = new Map()
  result.app.getRuntimeSnapshot = () => runtime
  result.app.getRuntimeSnapshotAsync = async () => runtime
  result.app.getViewCache = (key) => cache.get(key)
  result.app.setViewCache = (key, value) => cache.set(key, value)
  result.app.getScheduleManagePageData = () => ({ plans: [], stores: runtime.stores })
  return result
}

test('旧云函数月日数据通过工作台补齐当天课程，不把同月日历史课程算作今天', async () => {
  const calendar = require('../../miniprogram/utils/schedule-calendar')
  const today = calendar.dateKey(new Date())
  const { page } = schedulePage({
    getCoachScheduleViewData: async () => ({ plans: [
      { id: 'today-slot', dateLabel: today.slice(5).replace('-', '/'), timeRange: '19:00 - 20:30', type: 'group', status: '已发布' },
      { id: 'old-slot', dateLabel: today.slice(5).replace('-', '/'), timeRange: '10:00 - 11:00', type: 'group', status: '已发布' },
    ] }),
    getWorkspaceViewData: async () => ({ todayDate: today, todayClasses: [{ id: 'today-slot', bookedCount: 3, capacity: 15, timeRange: '19:00 - 20:30' }] }),
  })
  await page.syncPageData()
  assert.equal(page.data.dayPlans.length, 1)
  assert.equal(page.data.dayPlans[0].id, 'today-slot')
  assert.equal(page.data.dayPlans[0].bookedCount, 3)
  assert.equal(page.data.dayPlans[0].startTime, '19:00')
  assert.equal(page.data.weekCount, 1)
  assert.match(page.data.scheduleNotice, /日期信息不完整/)
})

test('新版排期接口直接显示当天课程，无须额外查询工作台', async () => {
  const calendar = require('../../miniprogram/utils/schedule-calendar')
  const today = calendar.dateKey(new Date())
  const { page } = schedulePage({
    getCoachScheduleViewData: async () => ({ plans: [{ id: 'today', fullDate: today, startTime: '19:00', endTime: '20:30', type: 'private' }] }),
    getWorkspaceViewData: async () => { throw new Error('不应调用兼容接口') },
  })
  await page.syncPageData()
  assert.equal(page.data.dayPlans.length, 1)
  assert.equal(page.data.scheduleNotice, '')
  assert.equal(page.data.pageError, '')
})

test('旧排期当天补齐失败时显示同步失败，离页响应不会更新日历', async () => {
  const failed = schedulePage({
    getCoachScheduleViewData: async () => ({ plans: [{ id: 'slot', dateLabel: '10/08' }] }),
    getWorkspaceViewData: async () => { throw new Error('网络失败') },
  })
  await failed.page.syncPageData()
  assert.match(failed.page.data.scheduleNotice, /同步失败/)
  let resolveWorkspace
  let started
  const waiting = new Promise((resolve) => { started = resolve })
  const stale = schedulePage({
    getCoachScheduleViewData: async () => ({ plans: [{ id: 'slot', dateLabel: '10/08' }] }),
    getWorkspaceViewData: () => { started(); return new Promise((resolve) => { resolveWorkspace = resolve }) },
  })
  const request = stale.page.syncPageData()
  await waiting
  stale.page.onHide()
  resolveWorkspace({ todayClasses: [{ id: 'slot', timeRange: '19:00 - 20:30' }] })
  await request
  assert.equal(stale.page.data.dayPlans.length, 0)
})

function harness(relative, api = {}, storage = new Map()) {
  let definition
  const calls = { modals: [], routes: [], invalidations: [], toasts: [], cloud: 0 }
  const app = { globalData: { userProfile: { id: 'user' } }, removeViewCacheByPrefix: (key) => calls.invalidations.push(key) }
  const wx = {
    showModal: (options) => { calls.modals.push(options); if (options.success) options.success({ confirm: true }) },
    showToast: (options) => calls.toasts.push(options), navigateTo: (options) => calls.routes.push(options.url), reLaunch: (options) => calls.routes.push(options.url),
    redirectTo: (options) => calls.routes.push(options.url), getStorageSync: (key) => storage.get(key) || '', setStorageSync: (key, value) => storage.set(key, value),
    removeStorageSync: (key) => storage.delete(key),
    cloud: { init() {}, callFunction: async () => { calls.cloud += 1; return { result: { success: true, data: { loggedIn: false } } } } },
  }
  const cache = new Map()
  function load(file) {
    file = path.resolve(file)
    if (!path.extname(file)) file += '.js'
    if (cache.has(file)) return cache.get(file).exports
    const module = { exports: {} }
    cache.set(file, module)
    const sandbox = { module, exports: module.exports, wx, getApp: () => app, Page: (value) => { definition = value }, App: (value) => { definition = value },
      setInterval, clearInterval, setTimeout, clearTimeout, console,
      require: (name) => name.endsWith('business-api') && relative !== 'utils/business-api.js' ? api : load(path.resolve(path.dirname(file), name)),
    }
    vm.runInNewContext(fs.readFileSync(file, 'utf8'), sandbox, { filename: file })
    return module.exports
  }
  const exported = load(path.join(root, relative))
  const page = definition ? { ...definition, data: JSON.parse(JSON.stringify(definition.data || {})), setData(patch, callback) { Object.assign(this.data, patch); if (callback) callback() } } : null
  return { page, exported, app, wx, calls, storage }
}

function manualPage(api = {}, storage = new Map()) {
  const result = harness('pages/workspace/manual/index.js', { getManualWriteOffViewData: async () => ({ members: [] }), ...api }, storage)
  const runtime = { isAuthenticated: true, role: 'admin', userProfile: { id: 'staff', nickname: '管理员' }, currentStore: { id: 'gaoxin', name: '高新店' } }
  result.app.getRuntimeSnapshotAsync = async () => runtime
  result.page.data.runtime = runtime
  result.page._storageKey = 'one.manualPending.staff'
  result.page.data.selectedMember = { id: 'student', nickname: '线下学员', phone: '13911112222' }
  result.page.data.date = '2020-01-01'
  result.page.data.time = '10:00'
  return result
}

function distributionPage(api = {}) {
  const result = harness('pages/workspace/distribute/index.js', api)
  const member = { id: 'student', nickname: '学员', phone: '13812345678', groupCount: 4, privateCount: 2, groupExpiry: '2099-12-31' }
  const pack = { id: 'pack', name: '团课套餐', type: 'group', typeLabel: '团课', lessons: 10, price: 100, validDays: 180 }
  const runtime = { isAuthenticated: true, role: 'coach', userProfile: { id: 'coach' }, currentStore: { id: 'gaoxin' } }
  result.app.getRuntimeSnapshotAsync = async () => runtime
  result.page.syncPageData = async () => {}
  Object.assign(result.page.data, { runtime, pageData: { currentStore: { id: 'gaoxin' }, members: [member], packageOptions: [pack, { ...pack, id: 'private', type: 'private' }] } })
  return result
}

test('权益派发不能跳过选择步骤，套餐过滤不清除已选套餐', () => {
  const { page, calls } = distributionPage()
  page.onStep({ currentTarget: { dataset: { step: 3 } } })
  assert.equal(page.data.step, 1)
  assert.match(calls.toasts[0].title, /学员/)
  page.onSelectMember({ currentTarget: { dataset: { memberId: 'student' } } })
  assert.equal(page.data.step, 2)
  page.onNext()
  assert.equal(page.data.step, 2)
  page.onSelectPackage({ currentTarget: { dataset: { packageId: 'pack' } } })
  page.onPackageFilter({ currentTarget: { dataset: { type: 'private' } } })
  assert.equal(page.data.visiblePackages.length, 1)
  assert.equal(page.data.selectedPackageId, 'pack')
  page.onNext()
  assert.equal(page.data.step, 3)
})

test('权益派发输入新关键词后，旧搜索响应不能覆盖新搜索', async () => {
  let resolveSearch
  let markStarted
  const started = new Promise((resolve) => { markStarted = resolve })
  const { page, app } = harness('pages/workspace/distribute/index.js', { getDistributeViewData: () => { markStarted(); return new Promise((resolve) => { resolveSearch = resolve }) } })
  const runtime = { isAuthenticated: true, role: 'coach', userProfile: { id: 'coach' }, currentStore: { id: 'gaoxin' } }
  app.getRuntimeSnapshot = () => runtime
  app.getRuntimeSnapshotAsync = async () => runtime
  app.getViewCache = () => null
  app.setViewCache = () => { throw new Error('旧查询不能写缓存') }
  app.getDistributePageData = () => ({ members: [], packageOptions: [] })
  page.data.keyword = '旧学员'
  const request = page.syncPageData()
  await started
  page.onKeywordInput({ detail: { value: '新学员' } })
  resolveSearch({ members: [{ id: 'old', nickname: '旧学员' }], packageOptions: [] })
  await request
  assert.equal(page.data.keyword, '新学员')
  assert.equal(page.data.pageData.members.length, 0)
  page.onUnload()
})

test('权益派发核对有效期合并，过期课时不计入预计余额', () => {
  const { page } = distributionPage()
  page.onSelectMember({ currentTarget: { dataset: { memberId: 'student' } } })
  page.onSelectPackage({ currentTarget: { dataset: { packageId: 'pack' } } })
  page.onExpiryDateChange({ detail: { value: '2099-01-01' } })
  assert.equal(page.data.preview.expiry, '2099-12-31')
  assert.equal(page.data.preview.after, 14)
  page.data.selectedMember.groupExpiry = '2020-01-01'
  page.refreshPreview()
  assert.equal(page.data.preview.before, 0)
  assert.equal(page.data.preview.after, 10)
})

test('权益派发提交冻结表单并阻止重复点击，成功回执采用云端有效期', async () => {
  let writes = 0
  let resolveWrite
  const { page, calls } = distributionPage({ distributeAsset: () => { writes += 1; return new Promise((resolve) => { resolveWrite = resolve }) } })
  page.onSelectMember({ currentTarget: { dataset: { memberId: 'student' } } })
  page.onSelectPackage({ currentTarget: { dataset: { packageId: 'pack' } } })
  const request = page.onSubmit()
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve()
  page.onAmountInput({ detail: { value: '999' } })
  page.onSelectMember({ currentTarget: { dataset: { memberId: 'other' } } })
  await page.onSubmit()
  assert.equal(page.data.amount, '100')
  assert.equal(page.data.selectedMemberId, 'student')
  assert.equal(writes, 1)
  resolveWrite({ expiryDate: '2099-12-31' })
  await request
  assert.equal(page.data.receipt.expiry, '2099-12-31')
  assert.equal(page.data.receipt.amount, '100.00')
  assert.equal(page.data.selectedMemberId, '')
  assert.equal(calls.invalidations.length, 3)
})

test('权益派发校验金额精度及赠课，失败保留草稿且不展示成功回执', async () => {
  let writes = 0
  const { page } = distributionPage({ distributeAsset: async () => { writes += 1; throw new Error('派发失败') } })
  page.onSelectMember({ currentTarget: { dataset: { memberId: 'student' } } })
  page.onSelectPackage({ currentTarget: { dataset: { packageId: 'pack' } } })
  page.onAmountInput({ detail: { value: '1.001' } })
  await page.onSubmit()
  assert.equal(writes, 0)
  page.onPaymentSelect({ currentTarget: { dataset: { value: '赠课' } } })
  assert.equal(page.data.amount, '0')
  page.onAmountInput({ detail: { value: '10' } })
  await page.onSubmit()
  assert.equal(writes, 0)
  page.onAmountInput({ detail: { value: '0' } })
  await page.onSubmit()
  assert.equal(writes, 1)
  assert.equal(page.data.selectedMemberId, 'student')
  assert.equal(page.data.receipt, null)
  assert.equal(page.data.submitting, false)
})

test('人工核销重复点击只提交一次，成功清除待处理请求并刷新相关缓存', async () => {
  let submits = 0
  const { page, storage, calls } = manualPage({ manualWriteOff: async () => { submits += 1; return { message: '已扣减 1 课时' } } })
  page.syncPageData = async () => {}
  await Promise.all([page.onSubmit(), page.onSubmit()])
  assert.equal(submits, 1)
  assert.match(calls.modals[0].content, /扣减 1/)
  assert.equal(storage.size, 0)
  assert.equal(page.data.selectedMember, null)
  assert.equal(calls.invalidations.length, 4)
})

test('人工核销网络中断后重新进页复用原请求，冻结参数避免重复扣课', async () => {
  const storage = new Map()
  let firstPayload
  const first = manualPage({ manualWriteOff: async (payload) => { firstPayload = payload; throw Object.assign(new Error('网络中断'), { code: 'NETWORK_ERROR' }) } }, storage)
  await first.page.onSubmit()
  assert.equal(first.page.data.pendingRetry, true)
  first.page.onTypeChange({ currentTarget: { dataset: { type: 2 } } })
  assert.equal(first.page.data.classType, 1)
  let secondPayload
  const second = manualPage({ manualWriteOff: async (payload) => { secondPayload = payload; return { message: '原请求已核销' } } }, storage)
  await second.page.syncPageData()
  assert.equal(second.page.data.pendingRetry, true)
  await second.page.onSubmit()
  assert.equal(secondPayload.requestId, firstPayload.requestId)
  assert.equal(second.calls.modals.length, 0)
  assert.equal(storage.size, 0)
})

test('人工核销业务失败保留选择并允许修正，取消确认不发扣课请求', async () => {
  let submits = 0
  const result = manualPage({ manualWriteOff: async () => { submits += 1; throw Object.assign(new Error('余额不足'), { code: 'MANUAL_WRITEOFF_ERROR' }) } })
  await result.page.onSubmit()
  assert.equal(result.storage.size, 0)
  assert.equal(result.page.data.pendingRetry, false)
  assert.equal(result.page.data.selectedMember.id, 'student')
  result.wx.showModal = (options) => options.success({ confirm: false })
  await result.page.onSubmit()
  assert.equal(submits, 1)
  assert.equal(result.page.data.submitting, false)
})

test('管理员同时显示工作台和看板，课程名单提供线下学员核销入口', () => {
  const { page: app } = harness('app.js')
  app.onLaunch()
  app.applyCloudSession({ loggedIn: true, userProfile: { id: 'admin', role: 'admin' } })
  const paths = app.getTabItems().map((tab) => tab.path)
  assert.ok(paths.includes('/pages/workspace/index'))
  assert.ok(paths.includes('/pages/admin/index'))
  const { page, calls } = harness('pages/workspace/class/index.js')
  page.data.classId = 'slot'
  page.onManualWriteOff()
  assert.equal(calls.routes[0], '/pages/workspace/manual/index?classId=slot')
})

function loggedProfile(api = {}, storage = new Map()) {
  const { page: realApp } = harness('app.js', {}, storage)
  realApp.onLaunch()
  realApp.applyCloudSession({ loggedIn: true, userProfile: { id: 'old-user', nickname: '会员', role: 'admin' } })
  realApp.setViewCache('profile:old-user', { privateCount: 5 })
  const result = harness('pages/profile/index.js', api, storage)
  Object.assign(result.app, realApp)
  result.page.selectComponent = () => ({ syncTabs() {} })
  result.page.data.runtime = result.app.getRuntimeSnapshot()
  result.page.data.pageData = { assets: { privateCount: 5 }, myBookings: [{ id: 'old-booking' }] }
  result.page.data.maskedPhone = '138****5678'
  result.page.data.qrCodeImageSrc = '/old-qr.png'
  return result
}

function bookingData(page) {
  page.data.runtime = { isAuthenticated: true }
  page.data.pageData = { assets: { groupCount: 2 }, schedules: [{ id: 'slot', title: '基础训练', type: 'group', typeLabel: '团体训练', dateLabel: '09/30', timeRange: '19:00 - 20:30', venue: '高新店' }] }
}

test('预约云端失败显示失败，不生成本地成功或清除缓存', async () => {
  const { page, app, calls } = harness('pages/booking/index.js', { createBooking: async () => { throw new Error('权益不足') } })
  bookingData(page)
  app.createBooking = () => { throw new Error('不应使用本地预约') }
  await page.onBook({ currentTarget: { dataset: { scheduleId: 'slot' } } })
  assert.equal(calls.modals.at(-1).title, '预约未完成')
  assert.equal(calls.invalidations.length, 0)
  assert.equal(page.data.bookingId, '')
  assert.equal(page._isBooking, false)
})

test('重复点击预约只提交一次云请求，确认内容包含扣课与时间', async () => {
  let submitCount = 0
  const { page, calls } = harness('pages/booking/index.js', { createBooking: async () => { submitCount += 1; return { message: '预约成功' } } })
  bookingData(page)
  page.syncPageData = async () => {}
  const event = { currentTarget: { dataset: { scheduleId: 'slot' } } }
  await Promise.all([page.onBook(event), page.onBook(event)])
  assert.equal(submitCount, 1)
  assert.match(calls.modals[0].content, /19:00 - 20:30/)
  assert.match(calls.modals[0].content, /扣除 1 次/)
  assert.equal(calls.invalidations.length, 2)
})

test('游客从专属场次跳转登录时保留预约类型', async () => {
  const { page, calls } = harness('pages/booking/index.js')
  page.data.runtime = { isAuthenticated: false }
  page.data.filters.type = 'private'
  await page.onBook({ currentTarget: { dataset: {} } })
  assert.equal(calls.routes[0], '/pages/login/index?returnTo=booking&type=private')
})

test('首页团体与专属入口有明确不同目的地', () => {
  const { page, calls } = harness('pages/home/index.js')
  page.goBooking({ currentTarget: { dataset: { type: 'private' } } })
  page.goBooking({ currentTarget: { dataset: { type: 'group' } } })
  assert.deepEqual(calls.routes, ['/pages/booking/index?type=private', '/pages/booking/index?type=group'])
})

test('取消预约失败保留当前记录，并释放提交状态', async () => {
  const { page, app, calls } = harness('pages/profile/index.js', { cancelBooking: async () => { throw new Error('已临近开课') } })
  page.data.pageData = { myBookings: [{ id: 'booking', title: '训练', dateLabel: '09/30', timeRange: '19:00 - 20:30', canCancel: true }] }
  app.cancelBooking = () => { throw new Error('不应使用本地退课') }
  await page.onCancelBooking({ currentTarget: { dataset: { bookingId: 'booking' } } })
  assert.equal(calls.modals.at(-1).title, '取消未完成')
  assert.equal(page.data.pageData.myBookings.length, 1)
  assert.equal(page.data.cancellingBookingId, '')
})

test('身份码未展开或未登录时不生成二维码', async () => {
  let qrCalls = 0
  const { page } = harness('pages/profile/index.js', { getIdentityQrCode: async () => { qrCalls += 1 } })
  page.data.runtime = { isAuthenticated: true }
  await page.refreshDynamicCode()
  page.data.identityExpanded = true
  page.data.runtime.isAuthenticated = false
  await page.refreshDynamicCode()
  assert.equal(qrCalls, 0)
})

test('读请求合并，写请求保留独立提交', async () => {
  const { exported, calls } = harness('utils/business-api.js')
  await Promise.all([exported.getCurrentUserSession(), exported.getCurrentUserSession()])
  assert.equal(calls.cloud, 1)
  await Promise.all([exported.createBooking({ scheduleId: 'a' }), exported.createBooking({ scheduleId: 'a' })])
  assert.equal(calls.cloud, 3)
})

test('退出后迟到的登录态响应不会重新恢复旧账号', async () => {
  let resolveSession
  const { page } = harness('app.js', { getCurrentUserSession: () => new Promise((resolve) => { resolveSession = resolve }) })
  page.onLaunch()
  const pending = page.refreshUserSession({ force: true })
  page.resetGuestSession()
  page.globalData.sessionDismissed = true
  resolveSession({ loggedIn: true, userProfile: { id: 'old-user', nickname: '旧账号', role: 'admin' } })
  await pending
  assert.equal(page.globalData.isAuthenticated, false)
  assert.equal(page.globalData.userProfile.id, '')
})

test('退出成功只提交一次，并立即清空身份、余额、二维码和管理缓存', async () => {
  let writes = 0
  const { page, app, calls } = loggedProfile({ logout: async () => { writes += 1 } })
  app.globalData.myBookings = [{ id: 'booking' }]
  app.globalData.members = [{ id: 'member' }]
  await Promise.all([page.onLogout(), page.onLogout()])
  assert.equal(writes, 1)
  assert.equal(calls.modals.length, 1)
  assert.equal(app.globalData.isAuthenticated, false)
  assert.equal(app.globalData.sessionDismissed, true)
  assert.equal(app.globalData.myBookings.length, 0)
  assert.equal(app.globalData.members.length, 0)
  assert.equal(Object.keys(app.globalData.viewCache).length, 0)
  assert.equal(app.globalData.assets.privateCount, 0)
  assert.equal(page.data.runtime.isAuthenticated, false)
  assert.equal(Object.keys(page.data.pageData).length, 0)
  assert.equal(page.data.qrCodeImageSrc, '')
  assert.equal(page.data.maskedPhone, '')
  assert.equal(page.data.loggingOut, false)
  assert.deepEqual(calls.routes, ['/pages/home/index'])
})

test('取消退出或云端退出失败保留原账号，并允许重试', async () => {
  let writes = 0
  const { page, app, wx, calls } = loggedProfile({ logout: async () => { writes += 1; throw new Error('退出未完成，请重试') } })
  wx.showModal = (options) => options.success({ confirm: false })
  await page.onLogout()
  assert.equal(writes, 0)
  assert.equal(app.globalData.isAuthenticated, true)
  wx.showModal = (options) => options.success({ confirm: true })
  await page.onLogout()
  assert.equal(writes, 1)
  assert.equal(app.globalData.isAuthenticated, true)
  assert.equal(app.globalData.sessionDismissed, false)
  assert.equal(page.data.runtime.isAuthenticated, true)
  assert.equal(page.data.pageData.myBookings.length, 1)
  assert.equal(page.data.loggingOut, false)
  assert.equal(calls.routes.length, 0)
  assert.equal(calls.toasts.at(-1).title, '退出未完成，请重试')
})

test('退出后重启不会自动恢复，重新手机号登录后可正常刷新', async () => {
  let reads = 0
  const storage = new Map()
  const { app, page } = loggedProfile({ logout: async () => {} }, storage)
  await page.onLogout()
  const { page: restarted } = harness('app.js', { getCurrentUserSession: async () => {
    reads += 1
    return { loggedIn: true, userProfile: { id: 'new-user', nickname: '新会员', role: 'client' } }
  } }, storage)
  restarted.onLaunch()
  await restarted.getRuntimeSnapshotAsync({ force: true })
  assert.equal(restarted.globalData.isAuthenticated, false)
  assert.equal(reads, 0)
  restarted.applyCloudSession({ loggedIn: true, userProfile: { id: 'new-user', nickname: '新会员', role: 'client' } })
  await restarted.getRuntimeSnapshotAsync({ force: true })
  assert.equal(reads, 1)
  assert.equal(restarted.globalData.isAuthenticated, true)
  assert.equal(restarted.globalData.sessionDismissed, false)
  assert.equal(app.globalData.isAuthenticated, false)
})

test('退出后迟到的个人中心查询不会重新显示资料或写回旧缓存', async () => {
  let resolveRead, signalRead
  const started = new Promise((resolve) => { signalRead = resolve })
  const { page, app } = loggedProfile({
    getProfileViewData: () => { signalRead(); return new Promise((resolve) => { resolveRead = resolve }) },
    logout: async () => {},
  })
  app.getRuntimeSnapshotAsync = async () => app.getRuntimeSnapshot()
  const sync = page.syncPageData()
  await started
  await page.onLogout()
  resolveRead({ assets: { privateCount: 99 }, myBookings: [{ id: 'old' }] })
  await sync
  assert.equal(page.data.runtime.isAuthenticated, false)
  assert.equal(Object.keys(page.data.pageData).length, 0)
  assert.equal(Object.keys(app.globalData.viewCache).length, 0)
  assert.equal(page.data.pageBusy, false)
})

test('退出后页面跳转失败仍保持游客状态并清空资料', async () => {
  const { page, app, wx, calls } = loggedProfile({ logout: async () => {} })
  wx.reLaunch = (options) => options.fail()
  await page.onLogout()
  assert.equal(app.globalData.isAuthenticated, false)
  assert.equal(page.data.runtime.isAuthenticated, false)
  assert.equal(Object.keys(page.data.pageData).length, 0)
  assert.equal(calls.toasts.at(-1).title, '已退出登录，请返回首页')
})

test('已有资料保存请求时不能同时退出并接收旧登录态', async () => {
  let writes = 0
  const { page, app, calls } = loggedProfile({ logout: async () => { writes += 1 } })
  page.data.nicknameSubmitting = true
  await page.onLogout()
  assert.equal(writes, 0)
  assert.equal(app.globalData.isAuthenticated, true)
  assert.equal(calls.toasts.at(-1).title, '请等待当前操作完成后退出')
})

test('迟到的退出响应不会清除随后建立的新登录', async () => {
  let resolveLogout, signalLogout
  const started = new Promise((resolve) => { signalLogout = resolve })
  const { page, app, calls } = loggedProfile({ logout: () => { signalLogout(); return new Promise((resolve) => { resolveLogout = resolve }) } })
  const pending = page.onLogout()
  await started
  app.applyCloudSession({ loggedIn: true, userProfile: { id: 'new-user', nickname: '新会员', role: 'client' } })
  resolveLogout()
  await pending
  assert.equal(app.globalData.userProfile.id, 'new-user')
  assert.equal(app.globalData.isAuthenticated, true)
  assert.equal(calls.routes.length, 0)
})

test('退出确认或请求期间不能再发起取消预约', async () => {
  let writes = 0
  const { page } = loggedProfile({ cancelBooking: async () => { writes += 1 } })
  page.data.loggingOut = true
  page.data.pageData.myBookings = [{ id: 'booking', title: '训练', canCancel: true }]
  page.syncPageData = async () => {}
  await page.onCancelBooking({ currentTarget: { dataset: { bookingId: 'booking' } } })
  assert.equal(writes, 0)
})

test('退出请求期间手机号登录被阻止，退出失败释放锁后可重新登录', async () => {
  let writes = 0
  const { app: realApp } = loggedProfile()
  const { page, app, calls } = harness('pages/login/index.js', { loginWithPhone: async () => {
    writes += 1
    return { loggedIn: true, userProfile: { id: 'new-user', role: 'client' } }
  } })
  Object.assign(app, realApp)
  const request = app.beginLogout('old-user')
  await page.onGetPhoneNumber({ detail: { code: 'phone-code' } })
  assert.equal(writes, 0)
  assert.equal(calls.toasts.at(-1).title, '正在退出登录，请稍后再登录')
  app.endLogout(request)
  await page.onGetPhoneNumber({ detail: { code: 'phone-code' } })
  assert.equal(writes, 1)
  assert.equal(app.globalData.userProfile.id, 'new-user')
})

test('退出之前发出的手机号登录响应不能在退出后恢复账号', async () => {
  let resolveLogin, signalLogin
  const started = new Promise((resolve) => { signalLogin = resolve })
  const { app: realApp } = loggedProfile()
  const { page, app, calls } = harness('pages/login/index.js', { loginWithPhone: () => {
    signalLogin()
    return new Promise((resolve) => { resolveLogin = resolve })
  } })
  Object.assign(app, realApp)
  const login = page.onGetPhoneNumber({ detail: { code: 'phone-code' } })
  await started
  const request = app.beginLogout('old-user')
  app.completeLogout(request)
  app.endLogout(request)
  resolveLogin({ loggedIn: true, userProfile: { id: 'old-user', role: 'admin' } })
  await login
  assert.equal(app.globalData.isAuthenticated, false)
  assert.equal(app.globalData.sessionDismissed, true)
  assert.equal(calls.routes.length, 0)
  assert.equal(page.data.submitting, false)
})

test('身份切换后不复用旧读请求，旧请求完成也不能清除新请求的合并记录', async () => {
  const { exported, wx } = harness('utils/business-api.js')
  const resolvers = []
  wx.cloud.callFunction = () => new Promise((resolve) => resolvers.push(resolve))
  const old = exported.getCurrentUserSession()
  exported.clearPendingReads()
  const current = exported.getCurrentUserSession()
  assert.equal(resolvers.length, 2)
  resolvers[0]({ result: { success: true, data: { loggedIn: false } } })
  await old
  const joined = exported.getCurrentUserSession()
  assert.equal(resolvers.length, 2)
  resolvers[1]({ result: { success: true, data: { loggedIn: true } } })
  await Promise.all([current, joined])
})

test('旧登录态刷新完成不会清除退出失败后发起的新刷新', async () => {
  const resolvers = []
  const { page: app } = harness('app.js', { getCurrentUserSession: () => new Promise((resolve) => resolvers.push(resolve)) })
  app.onLaunch()
  app.applyCloudSession({ loggedIn: true, userProfile: { id: 'old-user', role: 'admin' } })
  const old = app.refreshUserSession({ force: true })
  const request = app.beginLogout('old-user')
  await app.refreshUserSession({ force: true })
  assert.equal(resolvers.length, 1)
  app.endLogout(request)
  const current = app.refreshUserSession({ force: true })
  resolvers[0]({ loggedIn: true, userProfile: { id: 'stale-user', role: 'client' } })
  await old
  const joined = app.refreshUserSession({ force: true })
  assert.equal(resolvers.length, 2)
  assert.equal(app.globalData.userProfile.id, 'old-user')
  resolvers[1]({ loggedIn: true, userProfile: { id: 'current-user', role: 'client' } })
  await Promise.all([current, joined])
  assert.equal(app.globalData.userProfile.id, 'current-user')
})

test('全部业务页面模板绑定的事件均存在', () => {
  const config = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8'))
  for (const name of config.pages) {
    const { page } = harness(name + '.js')
    const wxml = fs.readFileSync(path.join(root, name + '.wxml'), 'utf8')
    for (const match of wxml.matchAll(/(?:bind|catch)[a-z]+="([a-zA-Z][\w]*)"/g)) {
      assert.equal(typeof page[match[1]], 'function', name + ': ' + match[1])
    }
  }
})

test('派发权益登录态读取失败时释放按钮，不写入权益', async () => {
  let writes = 0
  const { page, app } = harness('pages/workspace/distribute/index.js', { distributeAsset: async () => { writes += 1 } })
  app.getRuntimeSnapshotAsync = async () => { throw new Error('连接失败') }
  Object.assign(page.data, {
    selectedMemberId: 'member', selectedMember: { id: 'member', nickname: '学员' },
    selectedPackageId: 'pack', selectedPackage: { id: 'pack', name: '团课', lessons: 10, typeLabel: '团课' },
    expiryDate: '2099-01-01', amount: '100',
  })
  await page.onSubmit()
  assert.equal(writes, 0)
  assert.equal(page.data.submitting, false)
})

test('排课使用日期和时间选择器，拒绝反向时间段', async () => {
  let writes = 0
  const { page } = harness('pages/workspace/schedule/index.js', { createCoachSchedule: async () => { writes += 1 } })
  page.data.pageData = { stores: [{ id: 'store', name: '高新店' }] }
  page.data.storeId = 'store'
  page.data.title = '基础训练'
  page.onDateChange({ detail: { value: '2026-10-05' } })
  page.onTimeChange({ currentTarget: { dataset: { field: 'endTime' } }, detail: { value: '18:00' } })
  assert.equal(page.data.fullDate, '2026-10-05')
  assert.equal(page.data.weekLabel, '周一')
  assert.equal(page.data.timeRange, '19:00 - 18:00')
  await page.onSubmit()
  assert.equal(writes, 0)
  assert.equal(page.data.submitting, false)
})

test('缺席操作需要确认，拒绝确认不会核销或留下忙碌状态', async () => {
  let writes = 0
  const { page, wx } = harness('pages/workspace/class/index.js', { writeOffBooking: async () => { writes += 1 } })
  wx.showModal = (options) => options.success({ confirm: false })
  await page.onUpdateStatus({ currentTarget: { dataset: { bookingId: 'booking', status: '已缺席' } } })
  assert.equal(writes, 0)
  assert.equal(page.data.submittingBookingId, '')
})

test('空数据首次启动可读取预约占位数据，不依赖旧演示日期', () => {
  const { page: app } = harness('app.js')
  app.onLaunch()
  const data = app.getBookingPageData({ type: 'group', dateKey: '2026-09-30' })
  assert.equal(data.schedules.length, 0)
  assert.equal(data.dates.length, 0)
  assert.equal(data.assets.groupCount, 0)
  assert.equal(data.filters.dateKey, '2026-09-30')
  assert.equal(typeof app.createBooking, 'undefined')
  assert.equal(typeof app.submitDistribution, 'undefined')
})

test('全部数据页面在空缓存首次进入时可完成云端同步', async () => {
  const pages = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8')).pages.filter((name) => !name.includes('/login/'))
  for (const name of pages) {
    let reads = 0
    const { page: realApp } = harness('app.js')
    realApp.onLaunch()
    realApp.applyCloudSession({ loggedIn: true, userProfile: { id: 'admin', nickname: '管理员', role: 'admin' } })
    realApp.getRuntimeSnapshotAsync = async function () { return this.getRuntimeSnapshot() }
    const response = { currentStore: realApp.getCurrentStore(), stores: realApp.globalData.stores, schedules: [], plans: [], users: [], packages: [], myBookings: [], todayClasses: [], members: [], packageOptions: [], classInfo: { id: 'class' }, roster: [] }
    const api = new Proxy({}, { get: () => async () => { reads += 1; return response } })
    const { page, app } = harness(name + '.js', api)
    Object.assign(app, realApp)
    page.selectComponent = () => null
    await page.syncPageData()
    assert.equal(page.data.pageError, '', name + ' 首次同步失败')
    assert.equal(reads, 1, name + ' 应到达真实云请求')
    assert.equal(page.data.pageBusy, false)
  }
})
