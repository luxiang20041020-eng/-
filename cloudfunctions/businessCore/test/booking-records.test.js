const { test } = require('node:test'), assert = require('node:assert/strict')
const { createDatabase, loadFunction, login } = require('./helpers')
async function fixture() {
  const state = createDatabase(), context = { OPENID: 'owner', ENV: 'test-env' }, main = loadFunction(state, {}, context)
  const session = await login(main, '13812345678'), userId = session.data.userProfile.id
  const schedules = state.collections.get('biz_class_schedule'), bookings = state.collections.get('biz_booking')
  schedules.set('records-class', { _id: 'records-class', title: '训练', class_type: 1, start_time: '2099-01-01 19:00:00', end_time: '2099-01-01 20:00:00', status: 1, is_deleted: false })
  for (let i = 0; i < 53; i++) bookings.set('records-' + String(i).padStart(3,'0'), { _id: 'records-' + String(i).padStart(3,'0'), user_id: userId, schedule_id: 'records-class', status: i % 5 + 1, is_deleted: false, created_at: new Date(2026,0,i+1) })
  bookings.set('private-other', { _id: 'private-other', user_id: 'other', status: 1, is_deleted: false, created_at: new Date(2099,0,1) })
  bookings.set('deleted', { _id: 'deleted', user_id: userId, status: 1, is_deleted: true, created_at: new Date(2099,0,1) })
  return { state, context, main, userId }
}
test('预约记录按身份隔离并按日期分页，尾页不重复或遗漏', async () => {
  const f = await fixture(), ids = []; let offset = 0, pages = 0, result
  do {
    result = await f.main({ action: 'getMyBookingRecords', payload: { userId: 'other', offset } }); assert.equal(result.success, true)
    assert.ok(result.data.records.length <= 20); ids.push(...result.data.records.map(row=>row.id)); offset=result.data.nextOffset; pages++
  } while(result.data.hasMore)
  assert.equal(pages,3); assert.equal(ids.length,53); assert.equal(new Set(ids).size,53); assert.equal(ids[0],'records-052'); assert.equal(ids.at(-1),'records-000')
  assert.equal(ids.includes('private-other'),false); assert.equal(ids.includes('deleted'),false)
  f.context.OPENID='guest'; assert.equal((await f.main({action:'getMyBookingRecords'})).code,'LOGIN_REQUIRED')
})
test('预约筛选覆盖核销、双方取消与缺席，非法筛选和页码不查询', async () => {
  const f=await fixture()
  for(const [filter,labels] of [['pending',['待到店']],['completed',['已完成']],['cancelled',['已取消','场馆取消']],['absent',['已缺席']]]) {
    const result=await f.main({action:'getMyBookingRecords',payload:{filter}}); assert.equal(result.success,true)
    assert.ok(result.data.records.length); assert.ok(result.data.records.every(row=>labels.includes(row.status)),filter)
  }
  for(const payload of [{filter:'toString'},{filter:{}},{offset:-1},{offset:'20'},{offset:1.5}])assert.equal((await f.main({action:'getMyBookingRecords',payload})).code,'INVALID_BOOKING_FILTER')
})
test('个人中心最多显示三条待到店，训练统计仍保留历史核销', async () => {
  const f=await fixture(), result=await f.main({action:'getProfileViewData',payload:{userId:f.userId}})
  assert.equal(result.success,true); assert.equal(result.data.myBookings.length,3); assert.ok(result.data.myBookings.every(row=>row.status==='待到店')); assert.equal(result.data.trainingStats.totalLessons,11)
  assert.deepEqual(Array.from(result.data.myBookings,row=>row.id),['records-050','records-045','records-040'])
  f.state.collections.get('biz_class_schedule').get('records-class').status=4
  assert.equal((await f.main({action:'getProfileViewData',payload:{userId:f.userId}})).data.myBookings.length,0)
})
