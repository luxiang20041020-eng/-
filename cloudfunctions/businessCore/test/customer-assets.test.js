const assert = require('node:assert/strict')
const { test } = require('node:test')
const { createDatabase, loadFunction, login, failCollectionReads } = require('./helpers')
const { businessDate } = require('../request-policy')

async function fixture() {
  const state = createDatabase()
  const context = { OPENID: 'admin-openid', ENV: 'test-env' }
  const main = loadFunction(state, {}, context)
  const operator = (await login(main, '13812345678')).data.userProfile.id
  state.collections.get('app_user').get(operator).role = 3
  state.collections.get('app_user').set('student', { _id: 'student', real_name: '客户甲', phone: '13911112222', role: 1, status: 1, home_store_id: 'gaoxin', openid: 'student-openid', is_deleted: false })
  return { state, main, context, operator }
}

test('客户套餐详情仅管理员可读，伪造角色和操作人不能访问', async () => {
  const { state, context, main, operator } = await fixture()
  for (const role of [1, 2]) {
    state.collections.get('app_user').get(operator).role = role
    assert.equal((await main({ action: 'getAdminUserAssets', payload: { targetUserId: 'student', role: 3, operatorId: 'fake' } })).code, 'FORBIDDEN')
  }
  context.OPENID = 'guest'
  assert.equal((await main({ action: 'getAdminUserAssets', payload: { targetUserId: 'student' } })).code, 'LOGIN_REQUIRED')
})

test('列表和详情余额一致，过期课时不算可用，当天到期仍有效', async () => {
  const { state, main } = await fixture()
  state.collections.get('user_asset').set('student_1', { _id: 'student_1', user_id: 'student', asset_type: 1, balance: 8, expiry_date: businessDate(), is_deleted: false })
  state.collections.get('user_asset').set('student_2', { _id: 'student_2', user_id: 'student', asset_type: 2, balance: 4, expiry_date: '2000-01-01', is_deleted: false })
  const list = await main({ action: 'getAdminUserManageData' })
  const summary = list.data.users.find(user => user.id === 'student').assets
  assert.equal(summary.groupCount, 8)
  assert.equal(summary.privateCount, 0)
  const result = await main({ action: 'getAdminUserAssets', payload: { targetUserId: 'student' } })
  assert.equal(result.success, true)
  assert.equal(result.data.balances[0].available, 8)
  assert.equal(result.data.balances[0].statusLabel, '可用')
  assert.equal(result.data.balances[1].available, 0)
  assert.equal(result.data.balances[1].recordedBalance, 4)
  assert.equal(result.data.balances[1].expired, true)
  assert.equal(result.data.balances[1].statusLabel, '已过期')
})

test('未购课、无期限、用完和停用客户可区分，删除档案不能查看', async () => {
  const { state, main } = await fixture()
  let result = await main({ action: 'getAdminUserAssets', payload: { targetUserId: 'student' } })
  assert.ok(result.data.balances.every(balance => balance.statusLabel === '未购课' && balance.available === 0))
  state.collections.get('user_asset').set('student_1', { _id: 'student_1', user_id: 'student', asset_type: 1, balance: 0, is_deleted: false })
  state.collections.get('user_asset').set('deleted', { _id: 'deleted', user_id: 'student', asset_type: 2, balance: 100, is_deleted: true })
  state.collections.get('app_user').get('student').status = 0
  result = await main({ action: 'getAdminUserAssets', payload: { targetUserId: 'student' } })
  assert.equal(result.data.user.status, 0)
  assert.equal(result.data.balances[0].statusLabel, '已用完')
  assert.equal(result.data.balances[0].expiryLabel, '无到期限制')
  assert.equal(result.data.balances[1].statusLabel, '未购课')
  state.collections.get('app_user').get('student').is_deleted = true
  assert.equal((await main({ action: 'getAdminUserAssets', payload: { targetUserId: 'student' } })).code, 'TARGET_USER_NOT_FOUND')
  assert.equal((await main({ action: 'getAdminUserAssets', payload: { targetUserId: 'missing' } })).code, 'TARGET_USER_NOT_FOUND')
  assert.equal((await main({ action: 'getAdminUserAssets' })).code, 'INVALID_USER_ASSETS_PAYLOAD')
})

test('同类型套餐合并余额，派发记录保留原名称和到期日，排除其他客户与扣课流水', async () => {
  const { state, main } = await fixture()
  const payload = { userId: 'student', packageId: 'pkg_private_trial', storeId: 'gaoxin', offlineAmount: 99, payType: '微信转账', expiryDate: '2099-01-01' }
  assert.equal((await main({ action: 'distributeAsset', payload })).success, true)
  assert.equal((await main({ action: 'distributeAsset', payload: { ...payload, packageId: 'pkg_private_30', expiryDate: '2099-12-31' } })).success, true)
  state.collections.get('biz_package').get('pkg_private_trial').name = '改名后的套餐'
  state.collections.get('biz_package').get('pkg_private_30').is_deleted = true
  state.collections.get('user_asset_log').set('other', { _id: 'other', user_id: 'other-user', operate_type: 1, amount: 999, is_deleted: false })
  state.collections.get('user_asset_log').set('deduction', { _id: 'deduction', user_id: 'student', operate_type: 2, amount: -1, is_deleted: false })
  const result = await main({ action: 'getAdminUserAssets', payload: { targetUserId: 'student' } })
  assert.equal(result.data.balances[1].available, 31)
  assert.equal(result.data.balances[1].expiry, '2099-12-31')
  assert.equal(result.data.records.length, 2)
  assert.equal(result.data.records.find(record => record.lessons === 1).packageName, '新人体验权益')
  assert.equal(result.data.records.find(record => record.lessons === 1).expiry, '2099-01-01')
  assert.equal(result.data.records.find(record => record.lessons === 30).packageName, '30次专属权益')
  assert.match(result.data.note, /合并使用/)
})

test('客户预约扣课后管理端读取最新余额，取消后同步恢复', async () => {
  const { state, main, context, operator } = await fixture()
  state.collections.get('user_asset').set('student_1', { _id: 'student_1', user_id: 'student', asset_type: 1, balance: 3, is_deleted: false })
  const format = offset => new Date(Date.now() + offset + 8 * 3600000).toISOString().slice(0, 19).replace('T', ' ')
  state.collections.get('biz_class_schedule').set('slot', { _id: 'slot', store_id: 'gaoxin', coach_id: operator, class_type: 1, start_time: format(5 * 3600000), end_time: format(6 * 3600000), booked_count: 0, max_capacity: 15, status: 1, is_deleted: false })
  context.OPENID = 'student-openid'
  const booking = await main({ action: 'createBooking', payload: { scheduleId: 'slot' } })
  assert.equal(booking.success, true)
  context.OPENID = 'admin-openid'
  assert.equal((await main({ action: 'getAdminUserAssets', payload: { targetUserId: 'student' } })).data.balances[0].available, 2)
  context.OPENID = 'student-openid'
  assert.equal((await main({ action: 'cancelBooking', payload: { bookingId: booking.data.bookingId } })).success, true)
  context.OPENID = 'admin-openid'
  assert.equal((await main({ action: 'getAdminUserAssets', payload: { targetUserId: 'student' } })).data.balances[0].available, 3)
})

test('余额读取故障返回具体错误，不能伪装成零课时成功', async () => {
  const { state, main } = await fixture()
  failCollectionReads(state, 'user_asset', 'collection.get:fail network timeout')
  const result = await main({ action: 'getAdminUserAssets', payload: { targetUserId: 'student' } })
  assert.equal(result.success, false)
  assert.match(result.message, /请求超时/)
  assert.equal(result.data, undefined)
  assert.doesNotMatch(result.message, /collection|数据库|user_asset/)
})
