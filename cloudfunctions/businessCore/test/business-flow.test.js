const assert = require('node:assert/strict')
const { test } = require('node:test')
const { createDatabase, loadFunction, login } = require('./helpers')
const { businessDate, parseBusinessTime, canCancel } = require('../request-policy')

test('排期管理返回完整日历日期、时段与预约人数，排除人工核销场次', async () => {
  const { state, main, id } = await fixture(3)
  const schedule = state.collections.get('biz_class_schedule').get('slot')
  state.collections.get('biz_class_schedule').set('manual', { ...schedule, _id: 'manual', manual_only: true })
  const result = await main({ action: 'getCoachScheduleViewData', payload: { storeId: 'gaoxin', coachId: id } })
  assert.equal(result.success, true)
  assert.equal(result.data.plans.length, 1)
  const plan = result.data.plans[0]
  assert.equal(plan.fullDate, schedule.start_time.slice(0, 10))
  assert.equal(plan.startTime, schedule.start_time.slice(11, 16))
  assert.equal(plan.endTime, schedule.end_time.slice(11, 16))
  assert.equal(plan.capacity, 15)
  assert.equal(plan.bookedCount, 0)
})

async function fixture(role = 1) {
  const state = createDatabase()
  const context = { OPENID: 'real-openid', ENV: 'test-env' }
  const main = loadFunction(state, {}, context)
  const session = await login(main, '13812345678')
  const id = session.data.userProfile.id
  state.collections.get('app_user').get(id).role = role
  const format = (offset) => new Date(Date.now() + offset + 8 * 3600000).toISOString().slice(0, 19).replace('T', ' ')
  state.collections.get('biz_class_schedule').set('slot', {
    _id: 'slot', store_id: 'gaoxin', coach_id: id, title: '基础训练', class_type: 1,
    start_time: format(5 * 3600000), end_time: format(6 * 3600000),
    max_capacity: 15, booked_count: 0, status: 1, is_deleted: false,
  })
  state.collections.get('user_asset').set(id + '_1', {
    _id: id + '_1', user_id: id, asset_type: 1, balance: 3, is_deleted: false,
  })
  return { state, main, id, context, format }
}

test('日期按北京时间计算，跨午夜与 2 小时取消边界一致', () => {
  assert.equal(businessDate('2026-09-29T17:00:00Z'), '2026-09-30')
  assert.equal(parseBusinessTime('2026-09-30 10:00:00'), Date.parse('2026-09-30T02:00:00Z'))
  const now = Date.parse('2026-09-30T00:00:00Z')
  assert.equal(canCancel('2026-09-30 10:00:00', now), false)
  assert.equal(canCancel('2026-09-30 10:00:01', now), true)
})

test('游客可浏览场次，伪造用户 ID 不能获取余额或预约记录', async () => {
  const { state, main, context } = await fixture()
  context.OPENID = 'guest-openid'
  const result = await main({ action: 'getBookingViewData', payload: { userId: [...state.collections.get('app_user').keys()][0], storeId: 'gaoxin', filters: { type: 'group', coachId: 'all', dateKey: businessDate(Date.now() + 5 * 3600000) } } })
  assert.equal(result.success, true)
  assert.equal(result.data.schedules.length, 1)
  assert.equal(result.data.assets.groupCount, 0)
  assert.equal((await main({ action: 'getProfileViewData', payload: { userId: 'victim' } })).code, 'LOGIN_REQUIRED')
})

test('客户不能通过伪造操作人进入派课、排课或核销流程', async () => {
  const { main } = await fixture()
  for (const action of ['distributeAsset', 'writeOffBooking', 'createCoachSchedule', 'getAdminDashboardData']) {
    assert.equal((await main({ action, payload: { operatorId: 'admin_001', coachId: 'admin_001' } })).code, 'FORBIDDEN')
  }
})

test('预约扣 1 次权益，重复预约不重复扣款，取消只退回一次', async () => {
  const { state, main, id } = await fixture()
  const assetId = id + '_1'
  const result = await main({ action: 'createBooking', payload: { userId: 'victim', scheduleId: 'slot', clientBookingId: 'overwrite-target' } })
  assert.equal(result.success, true)
  assert.equal(state.collections.get('user_asset').get(assetId).balance, 2)
  assert.equal(state.collections.get('biz_booking').get(result.data.bookingId).user_id, id)
  assert.notEqual(result.data.bookingId, 'overwrite-target')
  assert.equal((await main({ action: 'createBooking', payload: { scheduleId: 'slot' } })).success, false)
  assert.equal(state.collections.get('user_asset').get(assetId).balance, 2)
  assert.equal((await main({ action: 'cancelBooking', payload: { bookingId: result.data.bookingId, operatorId: 'victim' } })).success, true)
  assert.equal(state.collections.get('user_asset').get(assetId).balance, 3)
  assert.equal((await main({ action: 'cancelBooking', payload: { bookingId: result.data.bookingId } })).success, false)
  assert.equal(state.collections.get('user_asset').get(assetId).balance, 3)
})

test('兼容 SDK 包装的事务返回值，预约 ID 与退款结果仍正确', async () => {
  const { state, main, id } = await fixture()
  state.transactionEnvelope = true
  const result = await main({ action: 'createBooking', payload: { scheduleId: 'slot' } })
  assert.equal(result.success, true)
  assert.equal(typeof result.data.bookingId, 'string')
  const cancelled = await main({ action: 'cancelBooking', payload: { bookingId: result.data.bookingId } })
  assert.equal(cancelled.success, true)
  assert.equal(cancelled.data.assetDocId, id + '_1')
  assert.equal(cancelled.data.nextBookedCount, 0)
})

test('停用门店的旧场次不可继续预约，不扣除权益', async () => {
  const { state, main, id } = await fixture()
  state.collections.get('biz_store').get('gaoxin').status = 0
  const result = await main({ action: 'createBooking', payload: { scheduleId: 'slot' } })
  assert.equal(result.success, false)
  assert.match(result.message, /暂停营业/)
  assert.equal(state.collections.get('user_asset').get(id + '_1').balance, 3)
})

test('取消校验归属与临近开课时间，校验失败不改变余额', async () => {
  const { state, main, id, format } = await fixture()
  const result = await main({ action: 'createBooking', payload: { scheduleId: 'slot' } })
  const record = state.collections.get('biz_booking').get(result.data.bookingId)
  record.user_id = 'other-user'
  assert.match((await main({ action: 'cancelBooking', payload: { bookingId: record._id } })).message, /自己的预约/)
  state.collections.get('biz_booking').get(record._id).user_id = id
  state.collections.get('biz_class_schedule').get('slot').start_time = format(3600000)
  assert.match((await main({ action: 'cancelBooking', payload: { bookingId: record._id } })).message, /2 小时/)
  assert.equal(state.collections.get('user_asset').get(id + '_1').balance, 2)
})

test('过期权益、满员和已开始场次不能预约', async () => {
  for (const mode of ['expiry', 'full', 'past']) {
    const { state, main, id, format } = await fixture()
    if (mode === 'expiry') state.collections.get('user_asset').get(id + '_1').expiry_date = '2020-01-01'
    if (mode === 'full') state.collections.get('biz_class_schedule').get('slot').booked_count = 15
    if (mode === 'past') state.collections.get('biz_class_schedule').get('slot').start_time = format(-3600000)
    assert.equal((await main({ action: 'createBooking', payload: { scheduleId: 'slot' } })).success, false)
    assert.equal(state.collections.get('user_asset').get(id + '_1').balance, 3)
    assert.equal(state.collections.get('biz_booking').size, 0)
  }
})

test('核销限本场教练或管理员，重复核销不能更改结果', async () => {
  const { state, main, id } = await fixture(2)
  state.collections.get('biz_booking').set('booking', { _id: 'booking', schedule_id: 'slot', user_id: 'student', status: 1, is_deleted: false })
  state.collections.get('biz_class_schedule').get('slot').coach_id = 'other-coach'
  assert.equal((await main({ action: 'writeOffBooking', payload: { bookingId: 'booking', status: 2 } })).success, false)
  state.collections.get('biz_class_schedule').get('slot').coach_id = id
  assert.equal((await main({ action: 'writeOffBooking', payload: { bookingId: 'booking', status: 2 } })).success, true)
  assert.equal((await main({ action: 'writeOffBooking', payload: { bookingId: 'booking', status: 5 } })).success, false)
  assert.equal(state.collections.get('biz_booking').get('booking').status, 2)
})

test('每周重复创建 4 个真实场次，重叠排课被拒绝', async () => {
  const { state, main, id, format } = await fixture(2)
  const payload = { storeId: 'gaoxin', coachId: 'forged-coach', title: '步法训练', startTime: format(24 * 3600000), endTime: format(25 * 3600000), classType: 1, maxCapacity: 12, repeatWeekly: true }
  const result = await main({ action: 'createCoachSchedule', payload })
  assert.equal(result.success, true)
  assert.equal(result.data.scheduleIds.length, 4)
  assert.equal(state.collections.get('biz_class_schedule').get(result.data.scheduleId).coach_id, id)
  assert.equal((await main({ action: 'createCoachSchedule', payload })).code, 'SCHEDULE_CONFLICT')
  assert.equal(state.collections.get('biz_class_schedule').size, 5)
})

test('派发权益保存到期日、金额和真实操作人', async () => {
  const { state, main, id } = await fixture(2)
  state.collections.get('app_user').set('student', { _id: 'student', role: 1, status: 1, is_deleted: false })
  const result = await main({ action: 'distributeAsset', payload: { userId: 'student', operatorId: 'fake', packageId: 'pkg_private_trial', expiryDate: '2099-12-31', offlineAmount: 99, payType: '微信转账' } })
  assert.equal(result.success, true)
  assert.equal(state.collections.get('user_asset').get('student_2').expiry_date, '2099-12-31')
  assert.equal([...state.collections.get('user_asset_log').values()][0].operator_id, id)
})

test('权益派发搜索返回到期日，未搜索时不返回整库学员', async () => {
  const { state, main } = await fixture(2)
  state.collections.get('app_user').set('student', { _id: 'student', real_name: '测试学员', phone: '13899999999', role: 1, status: 1, is_deleted: false })
  state.collections.get('user_asset').set('student_1', { _id: 'student_1', user_id: 'student', asset_type: 1, balance: 5, expiry_date: '2099-01-01', is_deleted: false })
  const empty = await main({ action: 'getDistributeViewData', payload: { storeId: 'gaoxin' } })
  assert.equal(empty.data.members.length, 0)
  const search = await main({ action: 'getDistributeViewData', payload: { storeId: 'gaoxin', keyword: '测试' } })
  assert.equal(search.data.members[0].groupExpiry, '2099-01-01')
  assert.equal(search.data.members[0].groupCount, 5)
})

test('续费保留有效余额和较晚到期日，过期余额不会随派发恢复', async () => {
  for (const expired of [false, true]) {
    const { state, main } = await fixture(2)
    state.collections.get('app_user').set('student', { _id: 'student', role: 1, status: 1, is_deleted: false })
    state.collections.get('user_asset').set('student_2', { _id: 'student_2', user_id: 'student', asset_type: 2, balance: 8, total_earned: 8, expiry_date: expired ? '2020-01-01' : '2099-12-31', is_deleted: false })
    const result = await main({ action: 'distributeAsset', payload: { userId: 'student', packageId: 'pkg_private_trial', expiryDate: '2099-01-01', offlineAmount: 99, payType: '现金' } })
    assert.equal(result.success, true)
    assert.equal(state.collections.get('user_asset').get('student_2').balance, expired ? 1 : 9)
    assert.equal(result.data.expiryDate, expired ? '2099-01-01' : '2099-12-31')
    assert.equal(state.collections.get('user_asset_log').size, 1)
  }
})

test('退出后无法静默恢复，停用账号不能通过登录重新启用', async () => {
  const { state, main, id } = await fixture()
  assert.equal((await main({ action: 'logout' })).success, true)
  assert.equal((await main({ action: 'getCurrentUserSession' })).data.loggedIn, false)
  state.collections.get('app_user').get(id).status = 0
  assert.equal((await login(main, '13812345678')).code, 'ACCOUNT_DISABLED')
})

test('已停用账号退出后，重新启用也不能自动恢复旧登录', async () => {
  const { state, main, id } = await fixture()
  const user = state.collections.get('app_user').get(id)
  user.status = 0
  assert.equal((await main({ action: 'logout' })).success, true)
  assert.equal(state.collections.get('app_user').get(id).openid, '')
  state.collections.get('app_user').get(id).status = 1
  assert.equal((await main({ action: 'getCurrentUserSession' })).data.loggedIn, false)
})

test('退出清除当前微信身份的全部历史绑定，不影响其他微信用户', async () => {
  const { state, main, id } = await fixture()
  const users = state.collections.get('app_user')
  users.set('historical', { ...users.get(id), _id: 'historical', phone: '13912345678' })
  users.set('other-user', { ...users.get(id), _id: 'other-user', openid: 'other-openid' })
  assert.equal((await main({ action: 'logout', payload: { userId: 'other-user', openid: 'other-openid' } })).success, true)
  assert.equal((await main({ action: 'getCurrentUserSession' })).data.loggedIn, false)
  assert.equal(users.get('other-user').openid, 'other-openid')
  assert.equal((await main({ action: 'logout' })).success, true)
})

test('退出清理部分失败会回滚全部绑定，重试后可正常退出', async () => {
  const { state, main, id } = await fixture()
  state.collections.get('app_user').set('historical', { ...state.collections.get('app_user').get(id), _id: 'historical' })
  const originalCollection = state.db.collection
  state.db.collection = (name) => {
    const collection = originalCollection(name)
    const originalDoc = collection.doc
    collection.doc = (docId) => {
      const doc = originalDoc(docId)
      if (name === 'app_user' && docId === 'historical') doc.update = async () => { throw new Error('临时写入失败') }
      return doc
    }
    return collection
  }
  assert.equal((await main({ action: 'logout' })).code, 'LOGOUT_ERROR')
  assert.equal(state.collections.get('app_user').get(id).openid, 'real-openid')
  assert.equal(state.collections.get('app_user').get('historical').openid, 'real-openid')
  state.db.collection = originalCollection
  assert.equal((await main({ action: 'logout' })).success, true)
  assert.equal((await main({ action: 'getCurrentUserSession' })).data.loggedIn, false)
})

test('退出不会清除并发绑定到其他微信身份的账号', async () => {
  const { state, main, id } = await fixture()
  const originalTransaction = state.db.runTransaction
  state.db.runTransaction = async (callback) => {
    state.collections.get('app_user').get(id).openid = 'new-device-openid'
    return originalTransaction(callback)
  }
  assert.equal((await main({ action: 'logout' })).success, true)
  assert.equal(state.collections.get('app_user').get(id).openid, 'new-device-openid')
})

test('列表读取超过 SDK 默认上限时继续分页', async () => {
  const { state, main } = await fixture()
  for (let i = 0; i < 125; i += 1) state.collections.get('biz_package').set('pkg_' + i, { _id: 'pkg_' + i, status: 1, is_deleted: false, asset_type: 1, name: '套餐' + i })
  const result = await main({ action: 'getHomeViewData', payload: { storeId: 'gaoxin' } })
  assert.equal(result.success, true)
  assert.equal(result.data.packages.length, 128)
})
