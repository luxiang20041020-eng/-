const { test } = require('node:test')
const assert = require('node:assert/strict')
const { createDatabase, loadFunction, login } = require('./helpers')
const { businessDate } = require('../request-policy')
const date = n => businessDate(Date.now() + n * 86400000)
async function fixture() {
  const state = createDatabase(), context = { OPENID: 'client', ENV: 'test-env' }, main = loadFunction(state, {}, context)
  const session = await login(main, '13812345678'), id = session.data.userProfile.id
  const users = state.collections.get('app_user'), assets = state.collections.get('user_asset'), schedules = state.collections.get('biz_class_schedule')
  users.get(id).role = 1
  users.set('coach', { _id: 'coach', real_name: '预约教练', role: 2, status: 1, home_store_id: 'gaoxin', is_deleted: false })
  users.set('admin', { _id: 'admin', real_name: '管理员', role: 3, status: 1, openid: 'admin', is_deleted: false })
  for (const type of [1, 2]) assets.set(id + '_' + type, { _id: id + '_' + type, user_id: id, asset_type: type, balance: 5, total_earned: 5, expiry_date: date(30), is_deleted: false })
  const call = (action, payload) => main({ action, payload })
  const payload = { storeId: 'gaoxin', coachId: 'coach', date: date(1), start: '10:15', end: '11:45', requestId: 'test_private_request_001' }
  function slot(key, fields = {}) { state.collections.get('biz_class_schedule').set(key, { _id: key, store_id: 'gaoxin', coach_id: 'coach', class_type: 1, title: '团课', start_time: date(1) + ' 14:00:00', end_time: date(1) + ' 15:00:00', max_capacity: 15, booked_count: 0, status: 1, is_deleted: false, ...fields }) }
  async function grant(type = 'private', usageMode = 'unlimited', expiryDate = date(7)) {
    context.OPENID = 'admin'
    const pkg = await call('createPackage', { name: '限期套餐', type, usageMode, lessons: usageMode === 'count' ? 3 : 0, price: 100, status: 1, validDays: 7 })
    assert.equal(pkg.success, true)
    const result = await call('distributeAsset', { userId: id, storeId: 'gaoxin', packageId: pkg.data.packageInfo.id, expiryDate, offlineAmount: 100, payType: '现金' })
    assert.equal(result.success, true)
    context.OPENID = 'client'
    return [...state.collections.get('user_asset_log').values()].filter(l => l.user_id === id && l.operate_type === 1).at(-1)
  }
  return { state, context, id, get assets() { return state.collections.get('user_asset') }, get schedules() { return state.collections.get('biz_class_schedule') }, get users() { return state.collections.get('app_user') }, call, payload, slot, grant }
}
test('客户无预先发布私教课也能自选90分钟预约，自动进入教练名单，重试不重复扣课', async () => {
  const f = await fixture(), result = await f.call('createPrivateBooking', f.payload)
  assert.equal(result.success, true); assert.equal(f.assets.get(f.id + '_2').balance, 4)
  const schedule = f.schedules.get(result.data.scheduleId)
  assert.equal(schedule.direct_private, true); assert.equal(schedule.start_time, date(1) + ' 10:15:00'); assert.equal(schedule.end_time, date(1) + ' 11:45:00')
  assert.equal((await f.call('createPrivateBooking', f.payload)).data.repeated, true); assert.equal(f.assets.get(f.id + '_2').balance, 4)
  assert.equal((await f.call('createPrivateBooking', { ...f.payload, end: '12:00' })).success, false)
  f.context.OPENID = 'admin'
  const roster = await f.call('getCoachClassViewData', { classId: schedule._id }); assert.equal(roster.data.roster[0].userId, f.id)
})
test('教练跨门店时间冲突、停用身份、客户冲突、非法日期和逆序时间都拒绝预约', async () => {
  const f = await fixture()
  for (const change of [{ start: '11:00', end: '10:00' }, { start: '25:00' }, { date: '2026-02-30' }, { date: date(8) }]) assert.equal((await f.call('createPrivateBooking', { ...f.payload, ...change })).success, false)
  f.slot('conflict', { store_id: 'jingkai', start_time: date(1) + ' 10:00:00', end_time: date(1) + ' 11:00:00' })
  assert.equal((await f.call('createPrivateBooking', f.payload)).success, false)
  f.schedules.get('conflict').status = 4; f.users.get('coach').status = 0
  assert.equal((await f.call('createPrivateBooking', f.payload)).success, false)
  f.users.get('coach').status = 1
  f.slot('own', { coach_id: 'other', start_time: date(1) + ' 11:00:00', end_time: date(1) + ' 12:00:00' })
  f.state.collections.get('biz_booking').set('own', { _id: 'own', user_id: f.id, schedule_id: 'own', status: 1, is_deleted: false })
  assert.equal((await f.call('createPrivateBooking', f.payload)).success, false); assert.equal(f.assets.get(f.id + '_2').balance, 5)
})
test('专属取消释放教练时段，退还次数，可重新预约；其他客户不能复用专属场次', async () => {
  const f = await fixture(), result = await f.call('createPrivateBooking', f.payload)
  assert.equal((await f.call('createBooking', { scheduleId: result.data.scheduleId })).success, false)
  assert.equal((await f.call('cancelBooking', { bookingId: result.data.bookingId })).success, true)
  assert.equal(f.schedules.get(result.data.scheduleId).status, 4); assert.equal(f.assets.get(f.id + '_2').balance, 5)
  assert.equal((await f.call('createPrivateBooking', { ...f.payload, requestId: 'test_private_request_002' })).success, true)
})
test('无限次套餐与次数余额并存，专属预约及取消不改变原余额', async () => {
  const f = await fixture(); const log = await f.grant()
  assert.equal(log.usage_mode, 'unlimited'); assert.equal(log.amount, 0); assert.equal(f.assets.get(f.id + '_2').balance, 5)
  const result = await f.call('createPrivateBooking', f.payload)
  assert.equal(result.success, true); assert.equal(f.assets.get(f.id + '_2').balance, 5)
  assert.equal(f.state.collections.get('biz_booking').get(result.data.bookingId).charged_count, 0)
  await f.call('cancelBooking', { bookingId: result.data.bookingId }); assert.equal(f.assets.get(f.id + '_2').balance, 5)
})
test('期限按训练日判断，到期后回退有效次数权益，次数不足拒绝预约', async () => {
  const f = await fixture(); await f.grant('private', 'unlimited', date(0))
  const result = await f.call('createPrivateBooking', f.payload)
  assert.equal(result.success, true); assert.equal(f.assets.get(f.id + '_2').balance, 4)
  await f.call('cancelBooking', { bookingId: result.data.bookingId })
  f.assets.get(f.id + '_2').balance = 0
  assert.equal((await f.call('createPrivateBooking', { ...f.payload, requestId: 'test_private_request_003' })).success, false)
})
test('团课无限次允许零次余额预约，管理员取消不虚增余额', async () => {
  const f = await fixture(); await f.grant('group'); f.assets.get(f.id + '_1').balance = 0; f.slot('group')
  const result = await f.call('createBooking', { scheduleId: 'group' }); assert.equal(result.success, true)
  f.context.OPENID = 'admin'; const view = (await f.call('getScheduleAdjustmentData', { classId: 'group' })).data
  assert.equal((await f.call('cancelCoachSchedule', { classId: 'group', version: view.schedule.version, reason: '停课' })).success, true)
  assert.equal(f.assets.get(f.id + '_1').balance, 0)
})
test('无限次人工核销和纠错只处理训练状态，不增加次数；生效前训练不能使用新期限', async () => {
  const f = await fixture(); await f.grant(); f.assets.get(f.id + '_2').balance = 0
  f.context.OPENID = 'admin'
  const trainingTime = businessDate() + ' 00:01:00'
  const result = await f.call('manualWriteOff', { userId: f.id, storeId: 'gaoxin', classType: 2, trainingTime, requestId: 'manual_unlimited_001', remark: '实际训练' })
  assert.equal(result.success, true); assert.equal(result.data.unlimited, true)
  const repeated = await f.call('manualWriteOff', { userId: f.id, storeId: 'gaoxin', classType: 2, trainingTime, requestId: 'manual_unlimited_001', remark: '实际训练' })
  assert.equal(repeated.data.unlimited, true); assert.equal(repeated.data.repeated, true)
  assert.equal((await f.call('reverseOperation', { kind: 'writeoff', id: result.data.bookingId, version: 1, reason: '误核销' })).success, true)
  assert.equal(f.assets.get(f.id + '_2').balance, 0)
  assert.equal((await f.call('manualWriteOff', { userId: f.id, storeId: 'gaoxin', classType: 2, trainingTime: date(-1) + ' 12:00:00', requestId: 'manual_unlimited_002', remark: '昨日' })).success, false)
})
test('未使用无限次派发可撤销有效期，次数不变；已使用后拒绝直接撤销并保留原因', async () => {
  const f = await fixture(), log = await f.grant()
  f.context.OPENID = 'admin'
  assert.equal((await f.call('reverseOperation', { kind: 'distribution', id: log._id, version: 0, reason: '误派发' })).success, true)
  assert.equal(f.assets.get(f.id + '_2').unlimited_expiry_date, ''); assert.equal(f.assets.get(f.id + '_2').balance, 5)
  const second = await f.grant(); await f.call('createPrivateBooking', f.payload); f.context.OPENID = 'admin'
  assert.equal((await f.call('reverseOperation', { kind: 'distribution', id: second._id, version: 0, reason: '误派发' })).success, false)
})
test('客户详情和跟进列表展示无限次，不误报为课时不足；报表仍统计实收', async () => {
  const f = await fixture(); await f.grant('group'); f.assets.get(f.id + '_1').balance = 0; f.context.OPENID = 'admin'
  const assets = (await f.call('getAdminUserAssets', { targetUserId: f.id })).data
  assert.equal(assets.balances[0].unlimited, true)
  const followup = (await f.call('getCustomerFollowUpData', { storeId: 'gaoxin', filter: 'all' })).data
  assert.equal(followup.customers.find(c => c.id === f.id).types[0].low, false)
  const report = (await f.call('getBusinessReportData', { storeId: 'gaoxin', startDate: date(0), endDate: date(0) })).data
  assert.equal(report.summary.incomeText, '100.00'); assert.equal(report.payments[0].unlimited, true)
})

test('预约调整不能跨原权益期限，次数预约在后来购买无限次后仍按实际扣款退回', async () => {
  const f = await fixture(); await f.grant('group', 'unlimited', date(2)); f.slot('group')
  assert.equal((await f.call('createBooking', { scheduleId: 'group' })).success, true)
  f.context.OPENID = 'admin'; const detail = (await f.call('getScheduleAdjustmentData', { classId: 'group' })).data
  const result = await f.call('updateCoachSchedule', { classId: 'group', version: detail.schedule.version, reason: '调课', title: '团课', coachId: 'coach', startTime: date(3) + ' 14:00:00', endTime: date(3) + ' 15:00:00', capacity: 15 })
  assert.equal(result.success, false)
  f.context.OPENID = 'client'; const booked = await f.call('createPrivateBooking', f.payload)
  assert.equal(f.assets.get(f.id + '_2').balance, 4); await f.grant()
  await f.call('cancelBooking', { bookingId: booked.data.bookingId }); assert.equal(f.assets.get(f.id + '_2').balance, 5)
})
