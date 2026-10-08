const assert = require('node:assert/strict')
const { test } = require('node:test')
const { createDatabase, loadFunction, login } = require('./helpers')

async function fixture(role = 2) {
  const state = createDatabase()
  const context = { OPENID: 'staff-openid', ENV: 'test-env' }
  const main = loadFunction(state, {}, context)
  const staff = (await login(main, '13812345678')).data.userProfile.id
  state.collections.get('app_user').get(staff).role = role
  state.collections.get('app_user').set('student', { _id: 'student', real_name: '线下学员', phone: '13911112222', role: 1, status: 1, is_deleted: false, openid: 'student-openid', home_store_id: 'gaoxin' })
  state.collections.get('user_asset').set('student_1', { _id: 'student_1', user_id: 'student', asset_type: 1, balance: 3, is_deleted: false })
  const format = (offset) => new Date(Date.now() + offset + 8 * 3600000).toISOString().slice(0, 19).replace('T', ' ')
  state.collections.get('biz_class_schedule').set('slot', { _id: 'slot', store_id: 'gaoxin', coach_id: staff, title: '团课', class_type: 1,
    start_time: format(-3600000), end_time: format(3600000), max_capacity: 15, booked_count: 0, status: 1, is_deleted: false })
  const payload = { userId: 'student', storeId: 'gaoxin', classType: 1, trainingTime: format(-3600000), requestId: 'manual_request_123456', remark: '电话预约' }
  return { state, main, staff, context, payload, format }
}

test('独立人工核销扣一次课时并形成到场与审计记录，重试和新请求均不能重复扣课', async () => {
  const { state, main, staff, payload, context } = await fixture(3)
  const first = await main({ action: 'manualWriteOff', payload: { ...payload, operatorId: 'forged' } })
  assert.equal(first.success, true)
  assert.equal(first.data.deducted, true)
  assert.equal(state.collections.get('user_asset').get('student_1').balance, 2)
  const booking = state.collections.get('biz_booking').get(first.data.bookingId)
  assert.equal(booking.status, 2)
  assert.equal(booking.writeoff_operator_id, staff)
  assert.equal(booking.source, 'manual')
  assert.equal((await main({ action: 'manualWriteOff', payload })).data.repeated, true)
  assert.equal((await main({ action: 'manualWriteOff', payload: { ...payload, requestId: 'manual_other_123456' } })).success, false)
  assert.equal(state.collections.get('user_asset').get('student_1').balance, 2)
  const dashboard = await main({ action: 'getAdminDashboardData', payload: { storeId: 'gaoxin' } })
  assert.equal(dashboard.data.auditOverview.writeOffCount, 1)
  assert.equal(dashboard.data.manualWriteOffLogs.length, 1)
  const workspace = await main({ action: 'getWorkspaceViewData', payload: { storeId: 'gaoxin' } })
  assert.equal(workspace.data.todayClasses.some((item) => item.id.startsWith('manual_class_')), false)
  context.OPENID = 'student-openid'
  const profile = await main({ action: 'getProfileViewData' })
  assert.equal(profile.data.trainingStats.totalLessons, 1)
  assert.equal(profile.data.myBookings[0].status, '已完成')
})

test('本场未预约学员可补核销，已有预约不再次扣课，已处理记录拒绝重复核销', async () => {
  for (const reserved of [false, true]) {
    const { state, main, payload } = await fixture()
    if (reserved) {
      state.collections.get('biz_booking').set('reserved', { _id: 'reserved', schedule_id: 'slot', user_id: 'student', status: 1, is_deleted: false })
      state.collections.get('biz_class_schedule').get('slot').booked_count = 1
      state.collections.get('user_asset').get('student_1').balance = 0
    }
    const request = { ...payload, classId: 'slot' }
    const result = await main({ action: 'manualWriteOff', payload: request })
    assert.equal(result.success, true)
    assert.equal(result.data.deducted, !reserved)
    assert.equal(state.collections.get('user_asset').get('student_1').balance, reserved ? 0 : 2)
    assert.equal(state.collections.get('biz_class_schedule').get('slot').booked_count, 1)
    const roster = await main({ action: 'getCoachClassViewData', payload: { classId: 'slot' } })
    assert.equal(roster.data.classInfo.checkedCount, 1)
    assert.equal((await main({ action: 'manualWriteOff', payload: { ...request, requestId: 'manual_again_123456' } })).success, false)
    assert.equal(state.collections.get('biz_booking').size, 1)
  }
})

test('余额不足、过期、停用学员、停用门店、未来时间与他人场次均不扣课', async () => {
  for (const mode of ['balance', 'expiry', 'member', 'store', 'future', 'foreign', 'full', 'cancelled']) {
    const { state, main, payload, format } = await fixture()
    if (mode === 'balance') state.collections.get('user_asset').get('student_1').balance = 0
    if (mode === 'expiry') state.collections.get('user_asset').get('student_1').expiry_date = '2000-01-01'
    if (mode === 'member') state.collections.get('app_user').get('student').status = 0
    if (mode === 'store') state.collections.get('biz_store').get('gaoxin').status = 0
    if (mode === 'future') payload.trainingTime = format(3600000)
    if (['foreign', 'full', 'cancelled'].includes(mode)) payload.classId = 'slot'
    if (mode === 'foreign') state.collections.get('biz_class_schedule').get('slot').coach_id = 'other'
    if (mode === 'full') state.collections.get('biz_class_schedule').get('slot').booked_count = 15
    if (mode === 'cancelled') state.collections.get('biz_class_schedule').get('slot').status = 4
    const balance = state.collections.get('user_asset').get('student_1').balance
    assert.equal((await main({ action: 'manualWriteOff', payload })).success, false, mode)
    assert.equal(state.collections.get('user_asset').get('student_1').balance, balance)
    assert.equal(state.collections.get('biz_booking').size, 0)
  }
})

test('事务审计写入失败回滚扣课与到场，可用原请求重试', async () => {
  const { state, main, payload } = await fixture()
  const original = state.db.collection
  state.db.collection = (name) => {
    const collection = original(name)
    if (name === 'user_asset_log') {
      const doc = collection.doc
      collection.doc = (id) => ({ ...doc(id), set: async () => { throw new Error('audit failed') } })
    }
    return collection
  }
  assert.equal((await main({ action: 'manualWriteOff', payload })).success, false)
  assert.equal(state.collections.get('user_asset').get('student_1').balance, 3)
  assert.equal(state.collections.get('biz_booking').size, 0)
  state.db.collection = original
  assert.equal((await main({ action: 'manualWriteOff', payload })).success, true)
})

test('客户无人工核销权限，工作人员搜索候选，不能读取其他教练的场次', async () => {
  const { state, main, payload } = await fixture(1)
  for (const action of ['manualWriteOff', 'getManualWriteOffViewData']) assert.equal((await main({ action, payload })).code, 'FORBIDDEN')
  const staff = [...state.collections.get('app_user').values()].find((user) => user.openid === 'staff-openid')
  staff.role = 2
  assert.equal((await main({ action: 'getManualWriteOffViewData', payload: { keyword: '' } })).data.members.length, 0)
  const found = await main({ action: 'getManualWriteOffViewData', payload: { keyword: '1391111' } })
  assert.equal(found.data.members[0].id, 'student')
  assert.equal(found.data.members[0].groupCount, 3)
  state.collections.get('biz_class_schedule').get('slot').coach_id = 'other'
  assert.equal((await main({ action: 'getManualWriteOffViewData', payload: { classId: 'slot' } })).code, 'FORBIDDEN')
})

test('管理员可为自己排课，并作为教练出现在预约筛选', async () => {
  const { main, staff, format } = await fixture(3)
  const result = await main({ action: 'createCoachSchedule', payload: { title: '管理员执教', storeId: 'gaoxin', classType: 2, maxCapacity: 1,
    startTime: format(5 * 3600000), endTime: format(6 * 3600000) } })
  assert.equal(result.success, true)
  const view = await main({ action: 'getBookingViewData', payload: { storeId: 'gaoxin', filters: { type: 'private', coachId: staff } } })
  assert.equal(view.success, true)
  assert.equal(view.data.coaches.some((item) => item.id === staff), true)
  assert.equal(view.data.schedules[0].title, '管理员执教')
})

test('私教人工核销只扣私教课时，相同请求不能换学员或课程类型', async () => {
  const { state, main, payload } = await fixture()
  state.collections.get('user_asset').set('student_2', { _id: 'student_2', user_id: 'student', asset_type: 2, balance: 2, is_deleted: false })
  payload.classType = 2
  assert.equal((await main({ action: 'manualWriteOff', payload })).success, true)
  assert.equal(state.collections.get('user_asset').get('student_1').balance, 3)
  assert.equal(state.collections.get('user_asset').get('student_2').balance, 1)
  assert.equal((await main({ action: 'manualWriteOff', payload: { ...payload, classType: 1 } })).success, false)
  assert.equal(state.collections.get('user_asset').get('student_1').balance, 3)
})
