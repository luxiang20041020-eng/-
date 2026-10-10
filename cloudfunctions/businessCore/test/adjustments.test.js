const { test } = require('node:test')
const assert = require('node:assert/strict')
const { createDatabase, loadFunction, login } = require('./helpers')

async function fixture(role = 3) {
  const state = createDatabase(), context = { OPENID: 'operator', ENV: 'test-env' }, main = loadFunction(state, {}, context)
  const session = await login(main, '13812345678'), userId = session.data.userProfile.id
  state.collections.get('app_user').get(userId).role = role
  const format = hours => new Date(Date.now() + hours * 3600000 + 8 * 3600000).toISOString().slice(0, 19).replace('T', ' ')
  state.collections.get('biz_class_schedule').set('slot', { _id: 'slot', store_id: 'gaoxin', store_name: '门店', coach_id: userId, title: '测试训练', class_type: 1, start_time: format(24), end_time: format(25), max_capacity: 100, booked_count: 0, status: 1, is_deleted: false })
  state.collections.get('user_asset').set(userId + '_1', { _id: userId + '_1', user_id: userId, asset_type: 1, balance: 5, total_earned: 5, expiry_date: '2099-01-01', is_deleted: false })
  const call = (action, payload = {}) => main({ action, payload })
  const detail = () => call('getScheduleAdjustmentData', { classId: 'slot' })
  return { state, context, userId, call, detail, format }
}
test('管理员可管理门店全部教练排课，普通教练不能借全部筛选查看别人的课', async () => {
  const f = await fixture()
  const s = f.state.collections.get('biz_class_schedule').get('slot')
  f.state.collections.get('biz_class_schedule').set('other', { ...s, _id: 'other', coach_id: 'other-coach' })
  assert.equal((await f.call('getCoachScheduleViewData', { storeId: 'gaoxin', allCoaches: true })).data.plans.length, 2)
  f.state.collections.get('app_user').get(f.userId).role = 2
  assert.equal((await f.call('getCoachScheduleViewData', { storeId: 'gaoxin', allCoaches: true })).data.plans.length, 1)
})
test('客户不能修改或取消排课，教练不能撤销派发与核销', async () => {
  const f = await fixture(1)
  for (const action of ['getScheduleAdjustmentData', 'updateCoachSchedule', 'cancelCoachSchedule', 'getCorrectionRecords', 'reverseOperation']) assert.equal((await f.call(action)).code, 'FORBIDDEN')
  f.state.collections.get('app_user').get(f.userId).role = 2
  assert.equal((await f.call('reverseOperation')).code, 'FORBIDDEN')
})
test('排课修改展示客户且保存原因和前后快照，重复请求不重复修改', async () => {
  const f = await fixture()
  const booked = await f.call('createBooking', { scheduleId: 'slot' })
  const detail = (await f.detail()).data
  assert.equal(detail.affected.length, 1)
  const payload = { classId: 'slot', version: detail.schedule.version, reason: '时间调整', title: '新课程', coachId: f.userId, startTime: f.format(26), endTime: f.format(27), capacity: 10 }
  assert.equal((await f.call('updateCoachSchedule', payload)).success, true)
  assert.equal((await f.call('updateCoachSchedule', payload)).data.repeated, true)
  assert.equal(f.state.collections.get('user_asset').get(f.userId + '_1').balance, 4)
  assert.equal(f.state.collections.get('biz_booking').get(booked.data.bookingId).status, 1)
  const audit = [...f.state.collections.get('user_asset_log').values()].find(l => l.operate_type === 7)
  assert.equal(audit.reason, '时间调整'); assert.equal(audit.before_schedule.title, '测试训练'); assert.equal(audit.after_schedule.title, '新课程')
  assert.equal(audit.operator_id, f.userId)
})
test('预约名单变化阻止旧确认提交，更换教练检查身份和时间冲突', async () => {
  const f = await fixture(), old = (await f.detail()).data.schedule
  await f.call('createBooking', { scheduleId: 'slot' })
  const payload = { classId: 'slot', version: old.version, reason: '调整', title: '课程', coachId: f.userId, startTime: f.format(26), endTime: f.format(27), capacity: 10 }
  assert.match((await f.call('updateCoachSchedule', payload)).message, /已变化/)
  payload.version = (await f.detail()).data.schedule.version
  f.state.collections.get('app_user').set('coach2', { _id: 'coach2', role: 2, status: 1, is_deleted: false })
  f.state.collections.get('biz_class_schedule').set('collision', { ...f.state.collections.get('biz_class_schedule').get('slot'), _id: 'collision', coach_id: 'coach2', start_time: payload.startTime, end_time: payload.endTime })
  payload.coachId = 'coach2'
  assert.match((await f.call('updateCoachSchedule', payload)).message, /重叠/)
  f.state.collections.get('biz_class_schedule').delete('collision')
  assert.equal((await f.call('updateCoachSchedule', payload)).success, true)
  assert.equal(f.state.collections.get('biz_class_schedule').get('slot').coach_id, 'coach2')
})
test('取消超过一批的预约可继续退课且重试不重复退款，取消后不能预约或核销', async () => {
  const f = await fixture(), bookings = f.state.collections.get('biz_booking'), assets = f.state.collections.get('user_asset')
  for (let n = 0; n < 23; n++) {
    bookings.set('b' + n, { _id: 'b' + n, schedule_id: 'slot', user_id: 'u' + n, status: 1, is_deleted: false })
    assets.set('u' + n + '_1', { _id: 'u' + n + '_1', user_id: 'u' + n, asset_type: 1, balance: 0, is_deleted: false })
  }
  f.state.collections.get('biz_class_schedule').get('slot').booked_count = 23
  const p = { classId: 'slot', version: (await f.detail()).data.schedule.version, reason: '教练临时请假' }
  const first = await f.call('cancelCoachSchedule', p)
  assert.equal(first.data.remaining, 13); assert.equal(first.data.complete, false)
  assert.equal((await f.call('createBooking', { scheduleId: 'slot' })).success, false)
  assert.equal((await f.call('writeOffBooking', { bookingId: 'b22', status: 2 })).success, false)
  assert.equal((await f.call('cancelCoachSchedule', p)).data.remaining, 3)
  assert.equal((await f.call('cancelCoachSchedule', p)).data.complete, true)
  assert.equal((await f.call('cancelCoachSchedule', p)).data.complete, true)
  for (let n = 0; n < 23; n++) { assert.equal(f.state.collections.get('user_asset').get('u' + n + '_1').balance, 1); assert.equal(f.state.collections.get('biz_booking').get('b' + n).status, 4) }
  assert.equal([...f.state.collections.get('user_asset_log').values()].filter(l => l.operate_type === 4).length, 23)
})
test('退课中途失败回滚本批并保留进度，恢复后可继续', async () => {
  const f = await fixture(), booking = await f.call('createBooking', { scheduleId: 'slot' })
  f.state.collections.get('user_asset').delete(f.userId + '_1')
  const p = { classId: 'slot', version: (await f.detail()).data.schedule.version, reason: '场馆关闭' }
  assert.equal((await f.call('cancelCoachSchedule', p)).success, false)
  assert.equal(f.state.collections.get('biz_class_schedule').get('slot').cancel_pending_ids.length, 1)
  assert.equal(f.state.collections.get('biz_booking').get(booking.data.bookingId).status, 1)
  f.state.collections.get('user_asset').set(f.userId + '_1', { _id: f.userId + '_1', balance: 4, is_deleted: false })
  assert.equal((await f.call('cancelCoachSchedule', p)).data.complete, true)
  assert.equal(f.state.collections.get('user_asset').get(f.userId + '_1').balance, 5)
})
test('撤销预约到场或缺席只恢复待核销，不额外退款；旧请求不能撤销后来再次核销', async () => {
  const f = await fixture(), booked = await f.call('createBooking', { scheduleId: 'slot' })
  await f.call('writeOffBooking', { bookingId: booked.data.bookingId, status: 5 })
  const p = { id: booked.data.bookingId, kind: 'writeoff', version: 1, reason: '误点缺席' }
  assert.equal((await f.call('reverseOperation', p)).success, true)
  assert.equal(f.state.collections.get('user_asset').get(f.userId + '_1').balance, 4)
  assert.equal(f.state.collections.get('biz_booking').get(p.id).status, 1)
  await f.call('writeOffBooking', { bookingId: p.id, status: 2 })
  assert.equal((await f.call('reverseOperation', p)).data.repeated, true)
  assert.equal(f.state.collections.get('biz_booking').get(p.id).status, 2)
  assert.equal((await f.call('reverseOperation', { ...p, version: 2 })).success, true)
})
test('撤销人工核销退回一次课时，保留原记录和余额审计', async () => {
  const f = await fixture(), result = await f.call('manualWriteOff', { userId: f.userId, storeId: 'gaoxin', classType: 1, trainingTime: f.format(-1), requestId: 'manual_request_12345678' })
  assert.equal(result.success, true)
  const p = { id: result.data.bookingId, kind: 'writeoff', version: 1, reason: '录错训练时间' }
  assert.equal((await f.call('reverseOperation', p)).success, true)
  assert.equal((await f.call('reverseOperation', p)).data.repeated, true)
  assert.equal(f.state.collections.get('user_asset').get(f.userId + '_1').balance, 5)
  assert.equal(f.state.collections.get('biz_booking').get(p.id).status, 4)
  const audit = [...f.state.collections.get('user_asset_log').values()].find(l => l.operate_type === 6)
  assert.equal(audit.before_balance, 4); assert.equal(audit.after_balance, 5); assert.equal(audit.reason, p.reason)
})
async function distribute(f) {
  const pack = [...f.state.collections.get('biz_package').values()].find(p => p.asset_type === 1)
  const result = await f.call('distributeAsset', { userId: f.userId, packageId: pack._id, storeId: 'gaoxin', payType: '现金', offlineAmount: 100, expiryDate: '2099-01-01' })
  assert.equal(result.success, true)
  const log = [...f.state.collections.get('user_asset_log').values()].filter(l => l.operate_type === 1).at(-1)
  return log
}
test('撤销派发扣回课时及累计派发，保存余额和原因，重复提交不再扣款', async () => {
  const f = await fixture(), log = await distribute(f)
  const p = { id: log._id, kind: 'distribution', version: 0, reason: '选错套餐' }
  assert.equal(log.before_asset.balance, 5)
  assert.equal((await f.call('reverseOperation', p)).success, true)
  assert.equal((await f.call('reverseOperation', p)).data.repeated, true)
  const a = f.state.collections.get('user_asset').get(f.userId + '_1')
  assert.equal(a.balance, 5); assert.equal(a.total_earned, 5)
  assert.equal(f.state.collections.get('user_asset_log').get(log._id).reversed, true)
})
test('余额不足和原因缺失拒绝撤销，续课清空过期余额可准确恢复原快照', async () => {
  const f = await fixture(), log = await distribute(f)
  const p = { id: log._id, kind: 'distribution', version: 0, reason: '选错客户' }
  assert.equal((await f.call('reverseOperation', { ...p, reason: '' })).success, false)
  f.state.collections.get('user_asset').get(f.userId + '_1').balance = 0
  assert.match((await f.call('reverseOperation', p)).message, /不足/)
  const g = await fixture()
  g.state.collections.get('user_asset').get(g.userId + '_1').expiry_date = '2000-01-01'
  const renewed = await distribute(g)
  assert.equal((await g.call('reverseOperation', { ...p, id: renewed._id })).success, true)
  const restored = g.state.collections.get('user_asset').get(g.userId + '_1')
  assert.equal(restored.balance, 5); assert.equal(restored.expiry_date, '2000-01-01')
})
test('新操作使用实际 CloudBase 事务可用的单文档接口，且每批少于100次操作', async () => {
  const f = await fixture(), nativeRun = f.state.db.runTransaction
  assert.equal((await f.call('createBooking', { scheduleId: 'slot' })).success, true)
  for (let n = 0; n < 12; n++) {
    f.state.collections.get('biz_booking').set('batch_b' + n, { _id: 'batch_b' + n, schedule_id: 'slot', user_id: 'batch_u' + n, status: 1, is_deleted: false })
    f.state.collections.get('user_asset').set('batch_u' + n + '_1', { _id: 'batch_u' + n + '_1', balance: 0, is_deleted: false })
  }
  f.state.collections.get('biz_class_schedule').get('slot').booked_count = 13
  f.state.db.runTransaction = async callback => nativeRun(async db => {
    let operations = 0
    const result = await callback({ collection(name) { return { doc(id) {
      const ref = db.collection(name).doc(id)
      return Object.fromEntries(['get', 'set', 'update'].map(method => [method, async args => { assert.ok(++operations <= 100); return ref[method](args) }]))
    } } } })
    return result
  })
  const detail = (await f.detail()).data.schedule
  const first = await f.call('cancelCoachSchedule', { classId: 'slot', version: detail.version, reason: '停课' })
  assert.equal(first.success, true); assert.equal(first.data.remaining, 3)
  assert.equal((await f.call('cancelCoachSchedule', { classId: 'slot', version: detail.version, reason: '停课' })).data.complete, true)
})

test('已有核销的场次拒绝修改及取消，纠正后仍按人数校验', async () => {
  const f = await fixture(), booked = await f.call('createBooking', { scheduleId: 'slot' })
  await f.call('writeOffBooking', { bookingId: booked.data.bookingId, status: 2 })
  let s = (await f.detail()).data.schedule
  const p = { classId: 'slot', version: s.version, reason: '调整', title: '课程', coachId: f.userId, startTime: f.format(26), endTime: f.format(27), capacity: 10 }
  assert.match((await f.call('updateCoachSchedule', p)).message, /已有核销/)
  assert.match((await f.call('cancelCoachSchedule', p)).message, /已有核销/)
  await f.call('reverseOperation', { id: booked.data.bookingId, kind: 'writeoff', version: 1, reason: '误核销' })
  s = (await f.detail()).data.schedule
  assert.equal((await f.call('updateCoachSchedule', { ...p, version: s.version, capacity: 1 })).success, true)
})

test('后续派发延长有效期时，拒绝先撤销更早的派发；旧流水明确提示不可自动撤销', async () => {
  const f = await fixture()
  f.state.collections.get('user_asset').get(f.userId + '_1').expiry_date = '2098-01-01'
  const first = await distribute(f), second = await distribute(f)
  assert.match((await f.call('reverseOperation', { id: first._id, kind: 'distribution', version: 0, reason: '误派发' })).message, /较新的派发/)
  assert.equal((await f.call('reverseOperation', { id: second._id, kind: 'distribution', version: 0, reason: '误派发' })).success, true)
  assert.equal((await f.call('reverseOperation', { id: first._id, kind: 'distribution', version: 0, reason: '误派发' })).success, true)
  f.state.collections.get('user_asset_log').set('old', { _id: 'old', operate_type: 1, amount: 10, user_id: f.userId, asset_type: 1, store_id: 'gaoxin', is_deleted: false })
  assert.match((await f.call('reverseOperation', { id: 'old', kind: 'distribution', version: 0, reason: '错误' })).message, /旧记录缺少/)
  const records = (await f.call('getCorrectionRecords', { storeId: 'gaoxin' })).data.records
  assert.equal(records.find(r => r.id === 'old').eligible, false)
})

test('纠错审计写入失败时余额和原记录一同回滚，不产生无审计撤销', async () => {
  const f = await fixture(), log = await distribute(f), before = f.state.collections.get('user_asset').get(f.userId + '_1').balance
  const original = f.state.db.collection
  f.state.db.collection = name => {
    const collection = original(name)
    if (name !== 'user_asset_log') return collection
    return { ...collection, doc(id) {
      const reference = collection.doc(id)
      return { ...reference, set: async args => {
        if (id.startsWith('adjust_')) throw new Error('network unavailable')
        return reference.set(args)
      } }
    } }
  }
  const result = await f.call('reverseOperation', { id: log._id, kind: 'distribution', version: 0, reason: '误派发' })
  assert.equal(result.success, false)
  assert.equal(f.state.collections.get('user_asset').get(f.userId + '_1').balance, before)
  assert.equal(Boolean(f.state.collections.get('user_asset_log').get(log._id).reversed), false)
})
