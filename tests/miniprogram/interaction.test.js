const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { test } = require('node:test')
const root = path.resolve(__dirname, '../../miniprogram')

function harness(relative, api = {}, storage = new Map()) {
  let definition
  const calls = { modals: [], routes: [], invalidations: [], toasts: [], cloud: 0 }
  const app = { globalData: { userProfile: { id: 'user' } }, removeViewCacheByPrefix: (key) => calls.invalidations.push(key) }
  const wx = {
    showModal: (options) => { calls.modals.push(options); if (options.success) options.success({ confirm: true }) },
    showToast: (options) => calls.toasts.push(options), navigateTo: (options) => calls.routes.push(options.url), reLaunch: (options) => calls.routes.push(options.url),
    redirectTo: (options) => calls.routes.push(options.url), getStorageSync: (key) => storage.get(key) || '', setStorageSync: (key, value) => storage.set(key, value),
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
      setInterval, clearInterval, console,
      require: (name) => name.endsWith('business-api') && relative !== 'utils/business-api.js' ? api : load(path.resolve(path.dirname(file), name)),
    }
    vm.runInNewContext(fs.readFileSync(file, 'utf8'), sandbox, { filename: file })
    return module.exports
  }
  const exported = load(path.join(root, relative))
  const page = definition ? { ...definition, data: JSON.parse(JSON.stringify(definition.data || {})), setData(patch, callback) { Object.assign(this.data, patch); if (callback) callback() } } : null
  return { page, exported, app, wx, calls, storage }
}

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
