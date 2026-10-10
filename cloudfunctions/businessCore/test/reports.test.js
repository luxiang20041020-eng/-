const { test } = require('node:test')
const assert = require('node:assert/strict')
const { createDatabase, loadFunction, login, failCollectionReads } = require('./helpers')
const { businessDate } = require('../request-policy')
const DAY = 86400000
const date = days => businessDate(Date.now() + days * DAY)
const time = (days, clock = '12:00:00') => date(days) + ' ' + clock

async function fixture(role = 3) {
  const state = createDatabase(), main = loadFunction(state), session = await login(main, '13812345678')
  const operator = session.data.userProfile.id
  state.collections.get('app_user').get(operator).role = role
  const call = (action, payload = {}) => main({ action, payload })
  function customer(id, fields = {}) { state.collections.get('app_user').set(id, { _id: id, role: 1, status: 1, home_store_id: 'gaoxin', real_name: id, phone: '13900000000', created_at: time(-60), is_deleted: false, ...fields }) }
  function asset(id, type = 1, fields = {}) { state.collections.get('user_asset').set(id + '_' + type, { _id: id + '_' + type, user_id: id, asset_type: type, balance: 5, total_earned: 10, expiry_date: date(100), is_deleted: false, ...fields }) }
  function payment(id, fields = {}) { state.collections.get('user_asset_log').set(id, { _id: id, user_id: 'c1', operator_id: operator, store_id: 'gaoxin', asset_type: 1, amount: 10, operate_type: 1, offline_amount: '100.00', created_at: time(-1), is_deleted: false, ...fields }) }
  function schedule(id, fields = {}) { state.collections.get('biz_class_schedule').set(id, { _id: id, coach_id: operator, store_id: 'gaoxin', class_type: 1, title: '课程', start_time: time(-1, '10:00:00'), end_time: time(-1, '11:30:00'), status: 1, is_deleted: false, ...fields }) }
  function booking(id, fields = {}) { state.collections.get('biz_booking').set(id, { _id: id, user_id: 'c1', schedule_id: 's1', status: 2, writeoff_time: time(0), is_deleted: false, ...fields }) }
  return { state, operator, call, customer, asset, payment, schedule, booking }
}
test('跟进及经营报表只允许管理员读取，伪造操作人不能绕过权限', async () => {
  const f = await fixture(1)
  for (const action of ['getCustomerFollowUpData', 'getBusinessReportData']) assert.equal((await f.call(action, { operatorId: 'admin', storeId: 'gaoxin' })).code, 'FORBIDDEN')
})
test('跟进区分7天到期、已购课剩余2次、新客户及超过30天未到店，排除其他门店和停用账号', async () => {
  const f = await fixture()
  f.customer('soon'); f.asset('soon', 1, { expiry_date: date(7) })
  f.customer('low'); f.asset('low', 1, { balance: 2 })
  f.customer('new', { created_at: time(0) })
  f.customer('expired'); f.asset('expired', 1, { expiry_date: date(-1), balance: 20 })
  f.customer('other', { home_store_id: 'jingkai' }); f.asset('other', 1, { balance: 1 })
  f.customer('disabled', { status: 0 }); f.asset('disabled', 1, { balance: 1 })
  f.customer('revoked-grant'); f.asset('revoked-grant', 1, { total_earned: 0, balance: 0 })
  const result = await f.call('getCustomerFollowUpData', { storeId: 'gaoxin', filter: 'all' })
  assert.equal(result.success, true)
  const rows = new Map(result.data.customers.map(c => [c.id, c]))
  assert.equal(rows.get('soon').expiring, true); assert.equal(rows.get('low').low, true)
  assert.equal(rows.get('new').inactive, false); assert.equal(rows.get('new').low, false)
  assert.equal(rows.get('expired').expiring, false); assert.equal(rows.get('expired').types[0].balance, 0)
  assert.equal(rows.get('revoked-grant').low, false)
  assert.equal(rows.has('other'), false); assert.equal(rows.has('disabled'), false)
  assert.equal((await f.call('getCustomerFollowUpData', { storeId: 'gaoxin', filter: 'low' })).data.customers.length, 1)
})
test('最近到店跨门店取实际训练日期，撤销和未来到场不消除长期未到店标记', async () => {
  const f = await fixture(); f.customer('c1'); f.asset('c1')
  f.schedule('s1', { store_id: 'jingkai', start_time: time(-1) }); f.booking('b1', { writeoff_time: time(-40) })
  let result = (await f.call('getCustomerFollowUpData', { storeId: 'gaoxin', filter: 'all' })).data.customers[0]
  assert.equal(result.lastVisit, date(-1)); assert.equal(result.inactive, false)
  f.state.collections.get('biz_booking').get('b1').status = 4
  f.schedule('future', { start_time: time(2) }); f.booking('future-b', { schedule_id: 'future' })
  result = (await f.call('getCustomerFollowUpData', { storeId: 'gaoxin', filter: 'all' })).data.customers[0]
  assert.equal(result.lastVisit, ''); assert.equal(result.inactive, true)
})
test('跟进支持自定义阈值与姓名手机号查询，客户超过100条时不漏读', async () => {
  const f = await fixture()
  for (let n = 0; n < 121; n++) { f.customer('c' + n); f.asset('c' + n, 1, { expiry_date: date(10), balance: 3 }) }
  assert.equal((await f.call('getCustomerFollowUpData', { storeId: 'gaoxin', filter: 'expiring', expiryDays: 14 })).data.total, 121)
  assert.equal((await f.call('getCustomerFollowUpData', { storeId: 'gaoxin', filter: 'low', lowBalance: 3, keyword: 'c120' })).data.total, 1)
  assert.equal((await f.call('getCustomerFollowUpData', { storeId: 'gaoxin', expiryDays: 0 })).success, false)
})
test('报表按登记日期统计实收，续费读取区间外同课种付费历史，排除赠课及撤销', async () => {
  const f = await fixture(); f.customer('c1')
  f.payment('first', { store_id: 'jingkai', created_at: time(-10) })
  f.payment('renewal', { offline_amount: '120.50' })
  f.payment('private-first', { asset_type: 2, offline_amount: '200.00' })
  f.payment('gift', { offline_amount: '0.00' })
  f.payment('reversed', { reversed: true, offline_amount: '900.00' })
  f.payment('another-store', { store_id: 'jingkai', offline_amount: '888.00' })
  const report = (await f.call('getBusinessReportData', { storeId: 'gaoxin', startDate: date(-1), endDate: date(-1) })).data
  assert.equal(report.summary.incomeText, '320.50'); assert.equal(report.summary.payments, 2)
  assert.equal(report.summary.renewals, 1); assert.equal(report.summary.renewalText, '120.50')
  assert.equal(report.summary.paidCustomers, 1)
  assert.equal(report.payments.find(p => p.id === 'private-first').purchaseLabel, '首次购课')
})
test('收款小数按分累计，跨北京时间午夜归属正确日期', async () => {
  const f = await fixture()
  f.payment('p1', { offline_amount: '0.10', created_at: date(-1) + 'T16:00:00Z' })
  f.payment('p2', { offline_amount: '0.20', created_at: time(0, '00:01:00') })
  const report = (await f.call('getBusinessReportData', { storeId: 'gaoxin', startDate: date(0), endDate: date(0) })).data
  assert.equal(report.summary.incomeText, '0.30'); assert.equal(report.summary.payments, 2)
})
test('核销按实际训练日统计，已完成排课需有到场，人工独立训练不虚增场次和时长', async () => {
  const f = await fixture()
  f.schedule('s1'); f.booking('b1'); f.booking('absent', { status: 5 }); f.booking('void', { status: 4 })
  f.schedule('manual', { manual_only: true, start_time: time(-1), end_time: time(-1) }); f.booking('manual-b', { schedule_id: 'manual', source: 'manual' })
  f.schedule('no-attendee'); f.schedule('cancelled', { status: 4 }); f.booking('cancelled-b', { schedule_id: 'cancelled' })
  const report = (await f.call('getBusinessReportData', { storeId: 'gaoxin', startDate: date(-1), endDate: date(-1) })).data
  assert.equal(report.summary.checkins, 2); assert.equal(report.summary.absences, 1); assert.equal(report.summary.taught, 1)
  const coach = report.coaches[0]
  assert.equal(coach.scheduled, 2); assert.equal(coach.cancelled, 1); assert.equal(coach.minutes, 90); assert.equal(coach.manualCheckins, 1)
  const today = (await f.call('getBusinessReportData', { storeId: 'gaoxin', startDate: date(0), endDate: date(0) })).data
  assert.equal(today.summary.checkins, 0)
})
test('缺少日期的旧付费历史不将后续购买误标为首购，且提示不完整记录', async () => {
  const f = await fixture(); f.payment('unknown', { created_at: 'invalid-date' }); f.payment('known')
  const report = (await f.call('getBusinessReportData', { storeId: 'gaoxin', startDate: date(-1), endDate: date(-1) })).data
  assert.equal(report.incompleteRecords, 1)
  assert.equal(report.payments[0].purchaseLabel, '历史顺序未确认'); assert.equal(report.summary.renewals, 0)
})
test('日期范围拒绝逆序、无效日期和超长区间，空报表保留每日零值', async () => {
  const f = await fixture()
  for (const [startDate, endDate] of [['2026-02-30', '2026-03-01'], [date(0), date(-1)], ['2024-01-01', '2026-01-01']]) assert.equal((await f.call('getBusinessReportData', { storeId: 'gaoxin', startDate, endDate })).success, false)
  const report = (await f.call('getBusinessReportData', { storeId: 'gaoxin', startDate: date(-2), endDate: date(0) })).data
  assert.equal(report.daily.length, 3); assert.equal(report.summary.incomeText, '0.00'); assert.equal(report.summary.checkins, 0)
})
test('任何资料读取失败不返回零余额或零收入假报表', async () => {
  const f = await fixture(), restore = failCollectionReads(f.state, 'user_asset_log', 'network error')
  assert.equal((await f.call('getBusinessReportData', { storeId: 'gaoxin', startDate: date(0), endDate: date(0) })).success, false)
  assert.equal((await f.call('getCustomerFollowUpData', { storeId: 'gaoxin' })).success, false)
  restore()
})

test('缺少课种的历史收款仍计实收，不猜测为私教或误判续费', async () => {
  const f = await fixture()
  f.payment('unknown-one', { asset_type: undefined }); f.payment('unknown-two', { asset_type: undefined })
  const result = await f.call('getBusinessReportData', { storeId: 'gaoxin', startDate: date(-1), endDate: date(-1) })
  assert.equal(result.data.summary.incomeText, '200.00'); assert.equal(result.data.summary.renewals, 0)
  for (const p of result.data.payments) { assert.equal(p.type, '未记录'); assert.equal(p.purchaseLabel, '历史顺序未确认') }
})
