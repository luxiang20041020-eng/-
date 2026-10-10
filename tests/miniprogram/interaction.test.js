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
    const sandbox = { module, exports: module.exports, wx, getApp: () => app, getCurrentPages: () => app.pages || [], Page: (value) => { definition = value }, App: (value) => { definition = value },
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

function privatePage(api = {}, storage) {
  const f = harness('pages/booking/index.js', api, storage)
  Object.assign(f.page.data, { runtime: { isAuthenticated: true, userProfile: { id: 'user' }, currentStore: { id: 'gaoxin', name: '门店' } }, filters: { type: 'private', coachId: 'coach', dateKey: '2099-01-01' }, pageData: { assets: {}, coaches: [{ id: 'coach', name: '教练' }] } })
  f.page.syncPageData = async () => {}
  f.app.getRuntimeSnapshotAsync = async () => f.page.data.runtime
  return f
}
test('专属自选起止时间提交给后台，未选教练或逆序时间不写入', async () => {
  const writes = [], f = privatePage({ createPrivateBooking: async p => { writes.push(p); return { message: '预约成功' } } })
  f.page.data.filters.coachId = 'all'; await f.page.onBookPrivate(); assert.equal(writes.length, 0)
  f.page.data.filters.coachId = 'coach'; f.page.data.privateEnd = '09:00'; await f.page.onBookPrivate(); assert.equal(writes.length, 0)
  f.page.data.privateStart = '10:15'; f.page.data.privateEnd = '11:45'; await f.page.onBookPrivate()
  assert.equal(writes[0].start, '10:15'); assert.equal(writes[0].end, '11:45'); assert.equal(f.page.data.privatePending, null)
})
test('网络结果未知保存原专属预约请求，重进页面复用请求核对且冻结时间输入', async () => {
  const storage = new Map(), writes = []
  const f = privatePage({ createPrivateBooking: async p => { writes.push(p); throw Object.assign(new Error('网络结果未知'), { code: 'NETWORK_ERROR' }) } }, storage)
  await f.page.onBookPrivate(); assert.ok(f.page.data.privatePending)
  f.page.onPrivateTime({ currentTarget: { dataset: { field: 'privateStart' } }, detail: { value: '12:00' } }); assert.equal(f.page.data.privateStart, '10:00')
  const second = privatePage({ createPrivateBooking: async p => { writes.push(p); return { message: '已核对' } } }, storage)
  second.page.restorePrivatePending(second.page.data.runtime); await second.page.onBookPrivate()
  assert.equal(writes[0].requestId, writes[1].requestId); assert.equal(storage.size, 0)
})
test('专属预约写入前保存请求失败时不调用后台，已确认业务失败释放原请求', async () => {
  let writes = 0
  const f = privatePage({ createPrivateBooking: async () => { writes++; throw Object.assign(new Error('教练时间冲突'), { code: 'CREATE_PRIVATE_BOOKING_ERROR' }) } })
  f.wx.setStorageSync = () => { throw new Error('保存失败') }; await f.page.onBookPrivate(); assert.equal(writes, 0)
  const second = privatePage({ createPrivateBooking: async () => { writes++; throw Object.assign(new Error('冲突'), { code: 'CREATE_PRIVATE_BOOKING_ERROR' }) } }); await second.page.onBookPrivate()
  assert.equal(writes, 1); assert.equal(second.page.data.privatePending, null); assert.equal(second.page.data.privateSubmitting, false)
})
test('创建无限次套餐无需次数，仍校验价格与有效期', async () => {
  const writes = [], f = harness('pages/admin/packages/index.js', { createPackage: async p => writes.push(p) })
  f.page.data.hasPermission = true; f.page.data.createForm = { name: '30天畅练', type: 'group', usageMode: 'unlimited', lessons: '', price: '100', validDays: '30', status: 1 }; f.page.syncPageData = async () => {}
  await f.page.onSubmitCreatePackage(); assert.equal(writes[0].usageMode, 'unlimited'); assert.equal(writes[0].lessons, 0)
  f.page.data.createForm = { name: '错误期限', type: 'private', usageMode: 'unlimited', price: '100', validDays: '0', status: 1 }; await f.page.onSubmitCreatePackage(); assert.equal(writes.length, 1)
})

test('外语确认弹窗保留录入姓名和课程名，门店选择列表保持原文', () => {
  const { exported, calls, wx } = harness('utils/interaction.js', {}, new Map([['one.language', 'en']]))
  exported.showModal({ title: '确认这次训练', contentParts: ['客户教练课程名字\n', { text: '将扣除 1 次权益，剩余 {0} 次。开课前 2 小时可取消。', values: [3] }], confirmText: '确认预约' })
  assert.equal(calls.modals[0].title, 'Confirm this session')
  assert.match(calls.modals[0].content, /^客户教练课程名字\nUses 1 credit; 3 remain/)
  assert.equal(calls.modals[0].confirmText, 'Confirm booking')
  assert.equal(calls.modals[0].contentParts, undefined)
  let menu
  wx.showActionSheet = options => { menu = options }
  exported.showActionSheet({ itemList: ['团课客户门店'] })
  assert.equal(menu.itemList[0], '团课客户门店')
})

test('邀请码从我的页面填写，提交期间冻结输入并阻止重复写入', async () => {
  const writes = []
  let finish
  const { page, calls } = harness('pages/profile/index.js', {
    getPointsViewData: async () => ({ bound: false }),
    bindInviteCode: payload => { writes.push(payload); return new Promise(resolve => { finish = resolve }) },
  })
  page.goPoints()
  assert.equal(calls.routes[0], '/pages/points/index')
  await page.onToggleInvite()
  assert.equal(page.data.inviteExpanded, true)
  page.onInviteInput({ detail: { value: 'abc' } })
  await page.onBindInvite()
  assert.equal(writes.length, 0)
  assert.match(page.data.inviteError, /14位/)
  page.onInviteInput({ detail: { value: 'on12ab34cd56ef' } })
  const pending = page.onBindInvite()
  await page.onBindInvite()
  page.onInviteInput({ detail: { value: 'ON111111111111' } })
  await page.onToggleInvite()
  assert.equal(writes.length, 1)
  assert.equal(page.data.inviteDraft, 'ON12AB34CD56EF')
  assert.equal(page.data.inviteExpanded, true)
  finish({ message: '绑定成功，双方各获100积分' })
  await pending
  assert.equal(page.data.inviteBound, true)
  assert.equal(page.data.inviteSubmitting, false)
  assert.equal(page.data.inviteDraft, '')
  await page.onBindInvite()
  assert.equal(writes.length, 1)
})

test('邀请码失败保留输入，离页后旧请求不会恢复绑定状态', async () => {
  let finish
  let fail = true
  const { page } = harness('pages/profile/index.js', {
    getPointsViewData: async () => ({ bound: false }),
    bindInviteCode: () => fail ? Promise.reject(new Error('邀请码不存在，请向好友确认')) : new Promise(resolve => { finish = resolve }),
  })
  await page.onToggleInvite()
  page.onInviteInput({ detail: { value: 'ON12AB34CD56EF' } })
  await page.onBindInvite()
  assert.equal(page.data.inviteDraft, 'ON12AB34CD56EF')
  assert.match(page.data.inviteError, /不存在/)
  fail = false
  const pending = page.onBindInvite()
  page.onHide()
  finish({ message: '绑定成功' })
  await pending
  assert.equal(page.data.inviteBound, false)
  assert.equal(page.data.inviteStateReady, false)
})

test('积分读取失败可重试，不把失败显示成零余额；离页丢弃旧余额', async () => {
  let fail = true
  let finish
  const { page, app } = harness('pages/points/index.js', {
    getPointsViewData: () => fail ? Promise.reject(new Error('网络中断，请重试')) : new Promise(resolve => { finish = resolve }),
  })
  app.getRuntimeSnapshotAsync = async () => ({ isAuthenticated: true })
  await page.syncPageData()
  assert.match(page.data.pageError, /网络/)
  assert.equal(page.data.pageData, null)
  assert.equal(page.data.pageBusy, false)
  fail = false
  const pending = page.syncPageData()
  await new Promise(setImmediate)
  page.onHide()
  finish({ balance: 100 })
  await pending
  assert.equal(page.data.pageData, null)
  const retry = page.syncPageData()
  await new Promise(setImmediate)
  finish({ balance: 100 })
  await retry
  assert.equal(page.data.pageData.balance, 100)
  assert.equal(page.data.pageError, '')
})

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

function adminManagePage(type, api = {}) {
  const result = harness('pages/admin/' + type + '/index.js', api)
  result.page.data.hasPermission = true
  result.page.syncPageData = async () => {}
  return result
}

function createUserPage(api = {}) {
  const result = adminManagePage('users', api)
  result.page.data.pageData.stores = [{ id: 'gaoxin', name: '高新店' }, { id: 'jingkai', name: '经开店' }]
  result.page.data.runtime = { currentStore: { id: 'jingkai' } }
  result.page.onOpenCreate()
  result.page.onCreateInput({ currentTarget: { dataset: { field: 'name' } }, detail: { value: '  新学员  ' } })
  result.page.onCreateInput({ currentTarget: { dataset: { field: 'phone' } }, detail: { value: '13911112222' } })
  return result
}

test('新用户录入校验姓名、手机号与门店，未授权或没有门店时不打开表单', async () => {
  let writes = 0
  const { page } = createUserPage({ createUser: async () => { writes++ } })
  for (const form of [{ name: ' ', phone: '13911112222', storeId: 'gaoxin' }, { name: '名'.repeat(21), phone: '13911112222', storeId: 'gaoxin' }, { name: '客户', phone: '12345678901', storeId: 'gaoxin' }, { name: '客户', phone: '13911112222', storeId: 'missing' }]) {
    page.data.createForm = form
    await page.onCreateUser()
    assert.ok(page.data.createError)
  }
  assert.equal(writes, 0)
  page.onCloseCreatePopup()
  page.data.hasPermission = false
  page.onOpenCreate()
  assert.equal(page.data.showCreatePopup, false)
  page.data.hasPermission = true
  page.data.pageData.stores = []
  page.onOpenCreate()
  assert.equal(page.data.showCreatePopup, false)
})

test('录入期间冻结输入和关闭，重复提交只写一次，成功立即显示用户并清理缓存', async () => {
  let resolve
  const writes = []
  const { page, calls } = createUserPage({ createUser: payload => { writes.push(payload); return new Promise(done => { resolve = done }) } })
  assert.equal(page.data.createStoreName, '经开店')
  page.data.keyword = '旧筛选'
  page.data.roleFilter = '3'
  page.data.statusFilter = '0'
  const pending = page.onCreateUser()
  await page.onCreateUser()
  page.onCreateInput({ currentTarget: { dataset: { field: 'phone' } }, detail: { value: '13700000000' } })
  page.onCreateStoreChange({ detail: { value: 0 } })
  page.onCloseCreatePopup()
  assert.equal(page.data.showCreatePopup, true)
  assert.equal(page.data.createForm.phone, '13911112222')
  assert.equal(page.data.createForm.storeId, 'jingkai')
  assert.equal(writes.length, 1)
  assert.equal(writes[0].name, '新学员')
  assert.match(writes[0].requestId, /^[a-zA-Z0-9_-]{16,80}$/)
  resolve({ user: { id: 'created-user', name: '新学员', phone: '13911112222', role: 1, status: 1 } })
  await pending
  assert.equal(page.data.showCreatePopup, false)
  assert.equal(page.data.creatingUser, false)
  assert.equal(page.data.visibleUsers[0].id, 'created-user')
  assert.equal(page.data.roleCounts.client, 1)
  assert.equal(page.data.roleFilter, 'all')
  assert.equal(page.data.statusFilter, 'all')
  assert.deepEqual(calls.invalidations, ['admin:', 'workspace:'])
  assert.equal(calls.toasts[0].title, '用户已录入')
})

test('网络或号码重复失败保留录入草稿，重试复用请求号，编辑后更换请求号', async () => {
  const writes = []
  const { page } = createUserPage({ createUser: async payload => { writes.push(payload); throw new Error(writes.length === 1 ? '网络失败' : '该手机号已建档') } })
  const requestId = page.data.createRequestId
  await page.onCreateUser()
  assert.equal(page.data.showCreatePopup, true)
  assert.equal(page.data.creatingUser, false)
  assert.equal(page.data.createForm.phone, '13911112222')
  assert.equal(page.data.pageData.users.length, 0)
  assert.match(page.data.createError, /网络失败/)
  await page.onCreateUser()
  assert.equal(writes[1].requestId, requestId)
  assert.match(page.data.createError, /已建档/)
  page.onCreateInput({ currentTarget: { dataset: { field: 'phone' } }, detail: { value: '13711112222' } })
  assert.notEqual(page.data.createRequestId, requestId)
  assert.equal(page.data.createError, '')
})

test('人员管理组合筛选身份、状态与关键词，角色统计不随筛选丢失', () => {
  const { page } = adminManagePage('users')
  page.data.pageData.users = [
    { id: 'a', name: '管理员', role: 3, status: 1 },
    { id: 'b', name: '李教练', phone: '13912345678', homeStoreName: '高新店', role: 2, status: 1 },
    { id: 'c', name: '停用教练', role: 2, status: 0 },
  ]
  page.onRoleFilter({ currentTarget: { dataset: { value: '2' } } })
  page.onStatusFilter({ currentTarget: { dataset: { value: '1' } } })
  page.onKeywordInput({ detail: { value: '高新' } })
  assert.equal(page.data.visibleUsers.length, 1)
  assert.equal(page.data.roleCounts.coach, 2)
  assert.match(page.data.visibleUsers[0].permissionSummary, /核销/)
  page.onResetFilters()
  assert.equal(page.data.visibleUsers.length, 3)
})

function customerDetail(id, available = 8) {
  return { user: { id, name: id, phone: '13911112222', role: 1, status: 1 },
    balances: [{ type: 'group', available, expiry: '2099-12-31' }, { type: 'private', available: 0, expiry: '' }], records: [], note: '同类型套餐的课时合并使用' }
}

test('客户余额读取显示加载状态，成功更新列表摘要，不读取非客户', async () => {
  let resolve
  const calls = []
  const { page } = adminManagePage('users', { getAdminUserAssets: payload => { calls.push(payload); return new Promise(done => { resolve = done }) } })
  page.data.pageData.users = [{ id: 'customer', role: 1 }, { id: 'coach', role: 2 }]
  page.onViewAssets({ currentTarget: { dataset: { userId: 'coach' } } })
  assert.equal(calls.length, 0)
  const pending = page.onViewAssets({ currentTarget: { dataset: { userId: 'customer' } } })
  assert.equal(page.data.assetsLoading, true)
  assert.equal(page.data.assetsDetail, null)
  page.onRefreshAssets()
  assert.equal(calls.length, 1)
  resolve(customerDetail('customer'))
  await pending
  assert.equal(page.data.assetsLoading, false)
  assert.equal(page.data.assetsDetail.balances[0].available, 8)
  assert.equal(page.data.pageData.users[0].assets.groupCount, 8)
})

test('客户余额切换、关闭或离页后，迟到响应不能覆盖新客户或重新打开面板', async () => {
  const pending = {}
  const { page } = adminManagePage('users', { getAdminUserAssets: payload => new Promise(resolve => { pending[payload.targetUserId] = resolve }) })
  page.data.pageData.users = [{ id: 'a', role: 1 }, { id: 'b', role: 1 }]
  const first = page.onViewAssets({ currentTarget: { dataset: { userId: 'a' } } })
  const second = page.onViewAssets({ currentTarget: { dataset: { userId: 'b' } } })
  pending.b(customerDetail('b', 12))
  await second
  pending.a(customerDetail('a', 99))
  await first
  assert.equal(page.data.assetsUser.id, 'b')
  assert.equal(page.data.assetsDetail.balances[0].available, 12)
  const late = page.onRefreshAssets()
  page.onHide()
  pending.b(customerDetail('b', 15))
  await late
  assert.equal(page.data.assetsUser, null)
  assert.equal(page.data.assetsDetail, null)
  assert.equal(page.data.assetsLoading, false)
})

test('客户余额失败展示安全原因并可重试，不用旧数据或零余额充当成功', async () => {
  let fail = true
  const { page } = adminManagePage('users', { getAdminUserAssets: async () => { if (fail) throw new Error('document.get:fail network timeout _id internal'); return customerDetail('customer', 0) } })
  page.data.pageData.users = [{ id: 'customer', role: 1 }]
  await page.onViewAssets({ currentTarget: { dataset: { userId: 'customer' } } })
  assert.match(page.data.assetsError, /请求超时/)
  assert.equal(page.data.assetsDetail, null)
  assert.equal(page.data.assetsLoading, false)
  fail = false
  await page.onRefreshAssets()
  assert.equal(page.data.assetsError, '')
  assert.equal(page.data.assetsDetail.balances[0].available, 0)
})

test('业务API防御旧服务内部错误，超时保留未确认写入状态，异常成功响应不能报成功', async () => {
  const { exported, wx } = harness('utils/business-api.js')
  wx.cloud.callFunction = async () => ({ result: { success: false, code: 'CREATE_USER_ERROR', message: 'document.get:fail document with _id u_secret does not exist' } })
  await assert.rejects(exported.createUser({}), error => /记录已不存在/.test(error.message) && !/_id|document/.test(error.message))
  wx.cloud.callFunction = async () => { throw { errMsg: 'cloud.callFunction:fail timeout' } }
  await assert.rejects(exported.distributeAsset({}), error => error.code === 'REQUEST_TIMEOUT' && error.outcomeUnknown && /勿重复提交/.test(error.message))
  wx.cloud.callFunction = async () => ({ result: { success: true } })
  await assert.rejects(exported.createUser({}), error => /未返回完整操作结果/.test(error.message) && error.outcomeUnknown)
})

test('原生操作取消安静返回，复制失败及操作授权失败显示具体反馈', () => {
  const { exported, wx, calls } = harness('utils/interaction.js')
  wx.showActionSheet = (options) => options.fail({ errMsg: 'showActionSheet:fail cancel' })
  exported.showActionSheet({ itemList: ['门店'] })
  assert.equal(calls.toasts.length + calls.modals.length, 0)
  wx.setClipboardData = (options) => options.fail({ errMsg: 'setClipboardData:fail system error' })
  exported.setClipboardData({ data: '客户训练记录' })
  assert.match(calls.toasts.at(-1).title, /内容未能复制/)
  wx.openLocation = (options) => options.fail({ errMsg: 'openLocation:fail auth deny' })
  exported.openLocation({ latitude: 34, longitude: 108 })
  assert.match(calls.modals.at(-1).content, /未获得此操作授权/)
})

test('长操作原因完整展示，跳转失败显示业务反馈', () => {
  const { exported, calls, wx } = harness('utils/interaction.js')
  exported.showFeedback({ title: '该类型可用课时不足或已过期，请先派发权益', icon: 'none' })
  assert.match(calls.modals[0].content, /请先派发权益/)
  assert.equal(calls.toasts.length, 0)
  wx.navigateTo = options => options.fail({ errMsg: 'navigateTo:fail page limit exceeded' })
  exported.navigateTo({ url: '/pages/admin/users/index' })
  assert.match(calls.modals.at(-1).content, /页面过多/)
})

test('人工核销超时保留原请求和冻结参数，避免未确认结果被当作业务失败清除', async () => {
  const storage = new Map()
  const { page } = manualPage({ manualWriteOff: async () => { throw Object.assign(new Error('请求超时，结果尚未确认'), { code: 'REQUEST_TIMEOUT', outcomeUnknown: true }) } }, storage)
  await page.onSubmit()
  assert.equal(page.data.submitting, false)
  assert.equal(page.data.pendingRetry, true)
  assert.ok(page._pendingPayload)
  assert.ok(storage.get('one.manualPending.staff'))
})

test('服务检查显示业务结果，隐藏集合、云环境和记录数等内部信息', async () => {
  const { page, calls } = harness('pages/admin/index.js', { bootstrapCollections: async () => ({ envId: 'internal-env', createResults: [{ collectionName: 'app_user' }], inspectResults: [{ collectionName: 'app_user', ok: true, total: 42 }] }) })
  await page.onBootstrap()
  assert.equal(page.data.bootstrapLoading, false)
  assert.equal(calls.modals.at(-1).title, '服务检查完成')
  assert.doesNotMatch(calls.modals.at(-1).content, /app_user|internal-env|数据库|集合|42/)
})

test('人员改权保护当前管理员，取消确认保留权限与编辑面板', async () => {
  let writes = 0
  const { page, wx, calls } = adminManagePage('users', { updateUserRole: async () => { writes += 1 } })
  const current = { id: 'self', name: '管理员', role: 3, roleLabel: '管理员', status: 1 }
  const target = { id: 'target', name: '教练', phone: '13812345678', role: 2, roleLabel: '教练', status: 1 }
  Object.assign(page.data.pageData, { currentUserId: 'self', users: [current, target] })
  page.onChangeRole({ currentTarget: { dataset: { userId: 'self' } } })
  assert.equal(page.data.roleEditorUser, null)
  page.onChangeRole({ currentTarget: { dataset: { userId: 'target' } } })
  page.onChooseRole({ currentTarget: { dataset: { value: 3 } } })
  wx.showModal = (options) => { calls.modals.push(options); options.success({ confirm: false }) }
  await page.onConfirmRole()
  assert.equal(writes, 0)
  assert.equal(page.data.roleEditorUser.id, 'target')
  assert.match(calls.modals[0].content, /13812345678/)
  assert.match(calls.modals[0].content, /管理人员权限/)
  assert.equal(page.data.submittingUserId, '')
})

test('人员改权确认期间锁定角色，成功后立即刷新卡片和人数', async () => {
  let resolveWrite
  let startWrite
  const started = new Promise((resolve) => { startWrite = resolve })
  let writes = 0
  const { page } = adminManagePage('users', { updateUserRole: () => { writes += 1; startWrite(); return new Promise((resolve) => { resolveWrite = resolve }) } })
  page.data.pageData.currentUserId = 'self'
  page.data.pageData.users = [{ id: 'target', name: '学员', role: 1, roleLabel: '客户', status: 1 }]
  page.onChangeRole({ currentTarget: { dataset: { userId: 'target' } } })
  page.onChooseRole({ currentTarget: { dataset: { value: 2 } } })
  const request = page.onConfirmRole()
  await started
  page.onChooseRole({ currentTarget: { dataset: { value: 3 } } })
  await page.onConfirmRole()
  assert.equal(page.data.nextRole, 2)
  assert.equal(writes, 1)
  resolveWrite({ user: { id: 'target', name: '学员', role: 2, roleLabel: '教练', status: 1 } })
  await request
  assert.equal(page.data.visibleUsers[0].role, 2)
  assert.equal(page.data.roleCounts.coach, 1)
  assert.equal(page.data.roleEditorUser, null)
})

test('套餐上下架确认期间阻止重复提交，失败保留状态，成功即时更新筛选统计', async () => {
  let writes = 0
  const { page, wx, calls } = adminManagePage('packages', { updatePackageStatus: async () => { writes += 1; throw new Error('保存失败') } })
  page.data.pageData.packages = [{ id: 'pack', name: '私教卡', type: 'private', status: 1, statusLabel: '已上架', lessons: 12, price: 2400 }]
  await Promise.all([page.onTogglePackageStatus({ currentTarget: { dataset: { packageId: 'pack' } } }), page.onTogglePackageStatus({ currentTarget: { dataset: { packageId: 'pack' } } })])
  assert.equal(writes, 1)
  assert.equal(page.data.pageData.packages[0].status, 1)
  assert.equal(page.data.submittingPackageId, '')
  assert.match(calls.modals[0].content, /已获得的课时仍可使用/)
  wx.showModal = (options) => options.success({ confirm: false })
  await page.onTogglePackageStatus({ currentTarget: { dataset: { packageId: 'pack' } } })
  assert.equal(writes, 1)
  const success = adminManagePage('packages', { updatePackageStatus: async () => ({ packageInfo: { id: 'pack', name: '私教卡', type: 'private', status: 0, lessons: 12, price: 2400, validDays: 90 } }) })
  success.page.data.pageData.packages = page.data.pageData.packages
  await success.page.onTogglePackageStatus({ currentTarget: { dataset: { packageId: 'pack' } } })
  assert.equal(success.page.data.pageData.stats.inactiveCount, 1)
  assert.equal(success.page.data.visiblePackages[0].actionText, '重新上架')
  assert.equal(success.page.data.visiblePackages[0].validDays, 90)
})

test('套餐创建配置有效期，拒绝空金额和非法天数，提交期间冻结草稿', async () => {
  let payload
  let resolveWrite
  let startWrite
  const started = new Promise((resolve) => { startWrite = resolve })
  const { page } = adminManagePage('packages', { createPackage: (value) => { payload = value; startWrite(); return new Promise((resolve) => { resolveWrite = resolve }) } })
  page.onOpenCreatePopup()
  assert.equal(page.data.createForm.status, 0)
  page.onCreateTypeChange({ currentTarget: { dataset: { value: 'group' } } })
  assert.equal(page.data.createForm.validDays, '180')
  Object.assign(page.data.createForm, { name: '团课卡', lessons: '10', price: '', validDays: '90' })
  await page.onSubmitCreatePackage()
  assert.equal(payload, undefined)
  page.data.createForm.price = '100.00'
  page.data.createForm.validDays = '0'
  await page.onSubmitCreatePackage()
  assert.equal(payload, undefined)
  page.data.createForm.validDays = '90'
  const request = page.onSubmitCreatePackage()
  await started
  page.onCreateFieldInput({ currentTarget: { dataset: { field: 'name' } }, detail: { value: '另一个套餐' } })
  page.onCloseCreatePopup()
  assert.equal(page.data.createForm.name, '团课卡')
  assert.equal(page.data.showCreatePopup, true)
  assert.equal(payload.validDays, 90)
  assert.equal(payload.status, 0)
  resolveWrite({})
  await request
  assert.equal(page.data.showCreatePopup, false)
  assert.equal(page.data.statusFilter, 'inactive')
})

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
  assert.equal(calls.invalidations.length, 4)
  assert.ok(calls.invalidations.includes('admin:users'))
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
  assert.equal(calls.invalidations.length, 5)
  assert.ok(calls.invalidations.includes('admin:users'))
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
    const response = { coach: { id: 'admin', name: '管理员', title: '', levelLabel: '', bio: '', honors: [], photos: [], specialties: [], version: 0 }, currentStore: realApp.getCurrentStore(), stores: realApp.globalData.stores, schedules: [], plans: [], users: [], customers: [], payments: [], packages: [], myBookings: [], todayClasses: [], members: [], packageOptions: [], classInfo: { id: 'class' }, roster: [] }
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


test('登录态刷新失败保留原账号并释放读取锁，可在恢复后重试', async () => {
  let attempts = 0
  const { page: app } = harness('app.js', { getCurrentUserSession: async () => {
    if (++attempts === 1) throw new Error('请求超时，请检查网络后重试')
    return { loggedIn: true, userProfile: { id: 'customer', nickname: '客户', role: 'client' } }
  } })
  app.onLaunch()
  app.applyCloudSession({ loggedIn: true, userProfile: { id: 'customer', role: 'client' } })
  await assert.rejects(app.refreshUserSession({ force: true }), /请求超时/)
  assert.equal(app.globalData.isAuthenticated, true)
  assert.equal(app.globalData.userProfile.id, 'customer')
  assert.equal(app._authRefreshingPromise, null)
  assert.equal(await app.refreshUserSession({ force: true }), true)
  assert.equal(attempts, 2)
})

test('门店已保存后的刷新故障说明两个结果，不将保存误报为失败', async () => {
  const { page, app } = harness('pages/admin/stores/index.js')
  app.getRuntimeSnapshotAsync = async () => { throw new Error('document.get:fail network timeout') }
  await page.refreshStoreState()
  assert.match(page.data.pageError, /门店变更已保存，但刷新未完成/)
  assert.match(page.data.pageError, /请求超时/)
  assert.doesNotMatch(page.data.pageError, /document|数据库/)
  app.getRuntimeSnapshotAsync = async () => ({ isAuthenticated: true })
  page.syncPageData = async () => page.setData({ pageError: '请求超时，请检查网络后重试' })
  await page.refreshStoreState()
  assert.match(page.data.pageError, /^门店变更已保存，但刷新未完成：请求超时/)
})

function coachEditor(api = {}) {
  const f = harness('pages/coach/edit/index.js', api)
  f.page.data.runtime = { isAuthenticated: true, role: 'coach', userProfile: { id: 'user' } }
  f.page.data.canEdit = true; f.page.data.ready = true
  f.page.data.coach = { id: 'user', name: '李教练', avatarUrl: '', title: '', levelLabel: '', bio: '', specialties: [], honors: [], photos: [], version: 0 }
  f.app.getRuntimeSnapshotAsync = async () => f.page.data.runtime
  f.app.getRuntimeSnapshot = () => f.page.data.runtime
  f.app.applyCloudSession = result => { f.page.data.runtime.userProfile = result.userProfile }
  return f
}

test('大量教练首页最多三行，选择面板分批显示且可搜索后重置', async () => {
  const coaches = Array.from({ length: 85 }, (_, i) => ({ id: 'coach' + i, name: '教练' + i, title: i === 70 ? '专项拳击' : '泰拳教练', specialties: [], bio: '' }))
  const f = harness('pages/booking/index.js', { getBookingViewData: async () => ({ coaches, schedules: [], assets: {}, privateBusyTimes: [] }) })
  const runtime = { isAuthenticated: true, userProfile: { id: 'user' }, currentStore: { id: 'store' } }
  f.app.getRuntimeSnapshot = () => runtime; f.app.getRuntimeSnapshotAsync = async () => runtime
  f.app.getViewCache = () => null; f.app.setViewCache = () => {}; f.app.getBookingPageData = () => ({})
  f.page.data.filters.type = 'private'
  f.page.data.filters.coachId = 'all'
  await f.page.syncPageData()
  assert.equal(f.page.data.pageData.privateCoachPreview.length, 3)
  assert.equal(f.page.data.pageData.selectedCoach, null)
  f.page.onOpenCoachPicker(); assert.equal(f.page.data.pageData.visibleCoachOptions.length, 20)
  f.page.onCoachListLower(); assert.equal(f.page.data.pageData.visibleCoachOptions.length, 40)
  f.page.onCoachKeywordInput({ detail: { value: '专项拳击' } })
  assert.equal(f.page.data.pageData.visibleCoachOptions.length, 1); assert.equal(f.page.data.pageData.visibleCoachOptions[0].id, 'coach70')
  assert.equal(f.page.data.coachOptionsLimit, 20); assert.equal(f.page.data.pageData.hasMoreCoachOptions, false)
  f.page.onCoachChange({ currentTarget: { dataset: { coachId: 'coach70' } } }); await f.page.syncPageData()
  assert.equal(f.page.data.pageData.selectedCoach.id, 'coach70'); assert.equal(f.page.data.coachPickerVisible, false)
  f.page.data.privatePending = { requestId: 'pending' }; f.page.onCoachChange({ currentTarget: { dataset: { coachId: 'coach1' } } }); f.page.onOpenCoachPicker()
  assert.equal(f.page.data.filters.coachId, 'coach70'); assert.equal(f.page.data.coachPickerVisible, false)
})

test('选择面板的教练介绍与团课筛选正确分流，打开介绍时收起面板', () => {
  const f = privatePage(); f.page.data.coachPickerVisible = true
  f.page.onCoachOptionTap({ currentTarget: { dataset: { coachId: 'coach2' } } })
  assert.equal(f.calls.routes[0], '/pages/coach/index?coachId=coach2'); assert.equal(f.page.data.coachPickerVisible, false)
  f.page.data.filters.type = 'group'; f.page.onCoachOptionTap({ currentTarget: { dataset: { coachId: 'coach3' } } })
  assert.equal(f.page.data.filters.coachId, 'coach3'); assert.equal(f.calls.routes.length, 1)
})

test('资料分区切换保留所有草稿和未保存状态', () => {
  const f = coachEditor()
  f.page.onInput({ currentTarget: { dataset: { field: 'title' } }, detail: { value: '泰拳教练' } })
  f.page.onEditSection({ currentTarget: { dataset: { section: 'intro' } } })
  f.page.onInput({ currentTarget: { dataset: { field: 'bio' } }, detail: { value: '训练介绍' } })
  f.page.data.draft.photos = ['photo']
  f.page.onEditSection({ currentTarget: { dataset: { section: 'photos' } } })
  f.page.onEditSection({ currentTarget: { dataset: { section: 'basic' } } })
  assert.equal(f.page.data.draft.title, '泰拳教练'); assert.equal(f.page.data.draft.bio, '训练介绍'); assert.equal(f.page.data.draft.photos[0], 'photo'); assert.equal(f.page.data.dirty, true)
})
function photoAPIs(f, options = {}) {
  f.wx.chooseMedia = o => o.success({ tempFiles: [{ tempFilePath: '/photo.jpg' }] })
  f.wx.getImageInfo = o => o.success({ type: options.type || 'jpeg', width: 2400, height: 1200 })
  f.wx.compressImage = o => { f.calls.compressed = o; o.success({ tempFilePath: '/small.jpg' }) }
  f.wx.getFileSystemManager = () => ({ getFileInfo: o => o.success({ size: options.size || 10000 }) })
  f.wx.cloud.uploadFile = async o => { f.calls.upload = o; return { fileID: 'cloud://test.bucket/' + o.cloudPath } }
}

test('点击教练卡片打开介绍，直接选择按钮仍选择教练和刷新时段', () => {
  const f = privatePage(); f.page.onOpenCoachProfile({ currentTarget: { dataset: { coachId: '教练 A' } } })
  assert.equal(f.calls.routes[0], '/pages/coach/index?coachId=' + encodeURIComponent('教练 A'))
  f.page.onCoachChange({ currentTarget: { dataset: { coachId: 'coach2' } } }); assert.equal(f.page.data.filters.coachId, 'coach2')
  const wxml = fs.readFileSync(path.join(root, 'pages/booking/index.wxml'), 'utf8')
  assert.match(wxml, /bindtap="onOpenCoachProfile"/); assert.match(wxml, /catchtap="onCoachChange"/)
})
test('介绍页选择教练返回预约并保留日期，原预约待核对时不覆盖选择', () => {
  const f = harness('pages/coach/index.js'); f.page.data.coachId = 'coach2'; f.page.data.coach = { id: 'coach2' }
  const previous = { route: 'pages/booking/index', data: { filters: { dateKey: '2099-01-01', type: 'group' } }, setData(patch) { Object.assign(this.data, patch) } }
  f.app.pages = [previous, f.page]; let backs = 0; f.wx.navigateBack = () => backs++
  f.page.onChooseCoach(); assert.equal(previous.data.filters.coachId, 'coach2'); assert.equal(previous.data.filters.dateKey, '2099-01-01'); assert.equal(backs, 1)
  previous.data.privatePending = {}; f.page.onChooseCoach(); assert.equal(backs, 1)
  f.page.data.pageError = '读取失败'; f.app.pages = []; f.page.onChooseCoach(); assert.equal(f.calls.routes.length, 0)
})
test('外部打开介绍页可携带教练进入专属预约，入口参数不丢失', () => {
  const f = harness('pages/coach/index.js'); f.page.data.coachId = 'coach'; f.page.data.coach = { id: 'coach' }; f.page.onChooseCoach()
  assert.equal(f.calls.routes[0], '/pages/booking/index?type=private&coachId=coach')
  const booking = privatePage(); booking.page.onLoad({ type: 'private', coachId: 'coach2' }); assert.equal(booking.page.data.filters.coachId, 'coach2')
})
test('教练表单按行整理擅长荣誉，保存失败保留草稿，成功更新版本', async () => {
  let writes = 0, payload, fail = true
  const f = coachEditor({ updateCoachProfile: async value => { writes++; payload = value; if (fail) throw new Error('资料保存未完成'); return { coach: { ...f.page.data.coach, ...value, version: 1 } } } })
  f.page.onInput({ currentTarget: { dataset: { field: 'honors' } }, detail: { value: '冠军\n\n认证' } })
  await f.page.onSave(); assert.equal(f.page.data.dirty, true); assert.equal(f.page.data.draft.honors, '冠军\n\n认证'); assert.equal(f.page.data.saving, false)
  fail = false; await f.page.onSave(); assert.deepEqual(Array.from(payload.honors), ['冠军', '认证']); assert.equal(f.page.data.coach.version, 1); assert.equal(f.page.data.dirty, false); assert.equal(writes, 2)
})
test('荣誉数量限制和切换账号阻止保存，提交中不能更改或移除照片', async () => {
  let writes = 0; const f = coachEditor({ updateCoachProfile: async () => { writes++ } })
  f.page.data.draft.honors = Array(11).fill('奖项').join('\n'); await f.page.onSave(); assert.equal(writes, 0)
  f.page.data.draft.honors = ''; f.app.getRuntimeSnapshotAsync = async () => ({ isAuthenticated: true, userProfile: { id: 'other' } }); await f.page.onSave(); assert.equal(writes, 0)
  f.page.data.saving = true; f.page.data.draft.photos = ['photo']; f.page.onRemovePhoto({ currentTarget: { dataset: { url: 'photo' } } }); assert.equal(f.page.data.draft.photos.length, 1)
})
test('离页后的旧读取不覆盖表单，客户和游客没有教练编辑权限', async () => {
  let resolve; const f = coachEditor({ getOwnCoachProfile: () => new Promise(r => { resolve = r }) })
  const read = f.page.syncPageData(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve()
  f.page.onHide(); resolve({ coach: { ...f.page.data.coach, name: '旧结果' } }); await read; assert.equal(f.page.data.ready, false)
  f.app.getRuntimeSnapshotAsync = async () => ({ isAuthenticated: true, role: 'client', userProfile: { id: 'user' } }); await f.page.syncPageData(); assert.equal(f.page.data.canEdit, false)
})
test('照片先压缩后上传、只用服务端目录；头像成功后更新会话与预约缓存', async () => {
  let saved; const f = coachEditor({ getMediaUploadData: async () => ({ prefix: 'profile-media/owner/', userId: 'user', avatarVersion: 3 }), updateUserAvatar: async p => { saved = p; return { userProfile: { id: 'user', avatarUrl: p.avatarUrl } } } })
  photoAPIs(f); await f.page.onUploadAvatar()
  assert.equal(f.calls.compressed.compressedWidth, 800); assert.equal(f.calls.compressed.compressedHeight, 400)
  assert.equal(f.calls.upload.filePath, '/small.jpg'); assert.match(f.calls.upload.cloudPath, /^profile-media\/owner\/avatar_/)
  assert.equal(saved.version, 3); assert.equal(f.page.data.coach.avatarUrl, saved.avatarUrl); assert.ok(f.calls.invalidations.includes('booking:'))
})
test('取消选择不报错，照片过大、权限或网络失败不更新头像', async () => {
  let writes = 0; const api = { getMediaUploadData: async () => ({ prefix: 'profile-media/owner/', userId: 'user', avatarVersion: 0 }), updateUserAvatar: async () => { writes++ } }
  const f = coachEditor(api); photoAPIs(f)
  f.wx.chooseMedia = o => o.fail({ errMsg: 'chooseMedia:fail cancel' }); await f.page.onUploadAvatar(); assert.equal(f.page.data.formError, '')
  photoAPIs(f, { size: 3 * 1024 * 1024 }); await f.page.onUploadAvatar(); assert.match(f.page.data.formError, /2MB/); assert.equal(writes, 0)
  photoAPIs(f); f.wx.cloud.uploadFile = async () => { throw new Error('permission denied SDK') }; await f.page.onUploadAvatar(); assert.match(f.page.data.formError, /授权/); assert.doesNotMatch(f.page.data.formError, /SDK/); assert.equal(writes, 0)
})
test('多张照片部分失败保留成功图片草稿，上限6张，移除只影响草稿', async () => {
  const f = coachEditor({ getMediaUploadData: async () => ({ prefix: 'profile-media/owner/', userId: 'user' }) }); photoAPIs(f)
  f.wx.chooseMedia = o => o.success({ tempFiles: [{ tempFilePath: '/p1.jpg' }, { tempFilePath: '/p2.jpg' }] })
  let uploads = 0; f.wx.cloud.uploadFile = async () => { if (++uploads === 2) throw new Error('network'); return { fileID: 'cloud://test/photo.jpg' } }
  await f.page.onAddPhotos(); assert.equal(f.page.data.draft.photos.length, 1); assert.equal(f.page.data.dirty, true); assert.match(f.page.data.formError, /网络/)
  f.page.onRemovePhoto({ currentTarget: { dataset: { url: 'cloud://test/photo.jpg' } } }); assert.equal(f.page.data.draft.photos.length, 0)
  f.page.data.draft.photos = Array(6).fill('photo'); await f.page.onAddPhotos(); assert.equal(uploads, 2)
})

test('照片上传隐私授权拒绝时不打开相册，同意后继续上传', async () => {
  const f = coachEditor({ getMediaUploadData: async () => ({ prefix: 'profile-media/owner/', userId: 'user' }) }); photoAPIs(f)
  f.wx.getPrivacySetting = o => o.success({ needAuthorization: true, privacyContractName: '微信协议原名' })
  f.app.pages = [f.page]; let allows = false, settings, chooses = 0
  f.page.selectComponent = () => ({ authorize: async value => { settings = value; if (!allows) throw new Error('cancel') } })
  f.wx.chooseMedia = o => { chooses++; o.success({ tempFiles: [{ tempFilePath: '/p.jpg' }] }) }
  await f.page.onAddPhotos(); assert.equal(chooses, 0); assert.equal(f.page.data.formError, '')
  allows = true; await f.page.onAddPhotos(); assert.equal(chooses, 1); assert.equal(settings.privacyContractName, '微信协议原名'); assert.equal(f.page.data.draft.photos.length, 1)
})
test('相册大图使用云文件临时地址，读取失败只显示具体图片响应', async () => {
  const f = harness('pages/coach/index.js'); f.page.data.coach = { photos: ['cloud://env/photo.jpg'] }
  f.wx.cloud.getTempFileURL = async () => ({ fileList: [{ fileID: 'cloud://env/photo.jpg', status: 0, tempFileURL: 'https://photo.test/image.jpg' }] })
  let preview; f.wx.previewImage = o => { preview = o }
  await f.page.onPreviewPhoto({ currentTarget: { dataset: { url: 'cloud://env/photo.jpg' } } }); assert.equal(preview.current, 'https://photo.test/image.jpg')
  f.wx.cloud.getTempFileURL = async () => { throw new Error('database SDK fail') }
  await f.page.onPreviewPhoto({ currentTarget: { dataset: { url: 'cloud://env/photo.jpg' } } }); assert.doesNotMatch(f.calls.modals.at(-1).content, /SDK|database/)
})
