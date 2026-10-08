const assert = require('node:assert/strict')
const { test } = require('node:test')
const { createDatabase, loadFunction, login } = require('./helpers')

async function fixture(role = 3) {
  const state = createDatabase()
  const context = { OPENID: 'admin-openid', ENV: 'test-env' }
  const main = loadFunction(state, {}, context)
  const operatorId = (await login(main, '13812345678')).data.userProfile.id
  state.collections.get('app_user').get(operatorId).role = role
  const payload = { name: '线下学员', phone: '13911112222', storeId: 'jingkai', requestId: 'create_user_request_001' }
  return { state, context, main, operatorId, payload }
}

test('录入仅限真实管理员，客户端伪造身份无效', async () => {
  for (const role of [1, 2, 3]) {
    const { state, context, main, payload } = await fixture(role)
    if (role === 3) context.OPENID = 'guest-openid'
    const result = await main({ action: 'createUser', payload: { ...payload, role: 3, operatorId: 'fake' } })
    assert.equal(result.code, role === 3 ? 'LOGIN_REQUIRED' : 'FORBIDDEN')
    assert.equal(state.collections.get('app_user').size, 1)
  }
})

test('手动建档仅创建客户且不绑定微信身份，返回可用门店和真实创建人', async () => {
  const { state, main, payload, operatorId } = await fixture()
  state.collections.get('biz_store').get('gaoxin').status = 0
  const list = await main({ action: 'getAdminUserManageData' })
  assert.deepEqual(Array.from(list.data.stores, store => store.id), ['jingkai'])
  const result = await main({ action: 'createUser', payload: { ...payload, name: '  张   同学  ', role: 3, openid: 'forged', operatorId: 'fake', status: 0 } })
  assert.equal(result.success, true)
  const user = state.collections.get('app_user').get(result.data.user.id)
  assert.equal(user.real_name, '张 同学')
  assert.equal(user.role, 1)
  assert.equal(user.status, 1)
  assert.equal(user.openid, '')
  assert.equal(user.home_store_id, 'jingkai')
  assert.equal(user.created_by, operatorId)
  assert.equal(user.source, 'manual')
  assert.equal(result.data.user.homeStoreName, '经开实战店')
  assert.equal(state.collections.get('user_asset').size, 0)
})

test('姓名、手机号、请求号及门店校验失败不创建档案', async () => {
  const { state, main, payload } = await fixture()
  for (const patch of [{ name: '  ' }, { name: '名'.repeat(21) }, { phone: '12345678901' }, { phone: '1391111222' }, { phone: '13911112222x' }, { storeId: '' }, { requestId: '' }, { storeId: 'missing' }]) {
    assert.equal((await main({ action: 'createUser', payload: { ...payload, ...patch } })).success, false)
  }
  const store = state.collections.get('biz_store').get('jingkai')
  for (const patch of [{ status: 0 }, { status: 1, is_deleted: true }]) {
    Object.assign(store, patch)
    assert.equal((await main({ action: 'createUser', payload })).code, 'STORE_NOT_AVAILABLE')
  }
  assert.equal(state.collections.get('app_user').size, 1)
})

test('重复请求返回原档案，不同请求及已有手机号不会覆盖资料', async () => {
  const { state, main, payload } = await fixture()
  const created = await main({ action: 'createUser', payload })
  const user = state.collections.get('app_user').get(created.data.user.id)
  const before = { ...user }
  const repeated = await main({ action: 'createUser', payload })
  assert.equal(repeated.success, true)
  assert.equal(repeated.data.repeated, true)
  assert.equal(repeated.data.user.id, created.data.user.id)
  for (const patch of [{ requestId: 'create_user_request_002' }, { name: '另一个名字' }, { storeId: 'gaoxin' }]) {
    assert.equal((await main({ action: 'createUser', payload: { ...payload, ...patch } })).code, 'DUPLICATE_USER_PHONE')
    assert.deepEqual(state.collections.get('app_user').get(user._id), before)
  }
  for (const patch of [{ status: 0 }, { is_deleted: true }]) {
    Object.assign(user, patch)
    assert.equal((await main({ action: 'createUser', payload: { ...payload, requestId: 'create_user_request_003' } })).code, 'DUPLICATE_USER_PHONE')
  }
  state.collections.get('app_user').set('legacy-id', { _id: 'legacy-id', phone: '13711112222', real_name: '历史档案', role: 2, status: 0, is_deleted: false })
  assert.equal((await main({ action: 'createUser', payload: { ...payload, phone: '13711112222' } })).code, 'DUPLICATE_USER_PHONE')
  assert.equal(state.collections.get('app_user').get('legacy-id').real_name, '历史档案')
})

test('离线档案可先派课和核销，手机号登录后保留原姓名、门店与权益', async () => {
  const { state, context, main, payload } = await fixture()
  const created = await main({ action: 'createUser', payload })
  const userId = created.data.user.id
  const members = await main({ action: 'getManualWriteOffViewData', payload: { keyword: payload.phone } })
  assert.equal(members.data.members[0].id, userId)
  assert.equal((await main({ action: 'distributeAsset', payload: { userId, packageId: 'pkg_private_trial', storeId: 'jingkai', offlineAmount: 99, payType: '微信转账', expiryDate: '2099-12-31' } })).success, true)
  const trainingTime = new Date(Date.now() - 3600000 + 8 * 3600000).toISOString().slice(0, 19).replace('T', ' ')
  assert.equal((await main({ action: 'manualWriteOff', payload: { userId, storeId: 'jingkai', classType: 2, trainingTime, requestId: 'manual_new_user_001' } })).success, true)
  context.OPENID = 'student-openid'
  const session = await login(main, payload.phone, { realName: '不应覆盖', storeId: 'gaoxin' })
  assert.equal(session.success, true)
  assert.equal(session.data.userProfile.id, userId)
  assert.equal(session.data.userProfile.nickname, payload.name)
  assert.equal(session.data.userProfile.homeStoreId, 'jingkai')
  assert.equal(state.collections.get('app_user').size, 2)
  assert.equal(state.collections.get('user_asset').get(userId + '_2').balance, 0)
  const profile = await main({ action: 'getProfileViewData' })
  assert.equal(profile.data.trainingStats.totalLessons, 1)
})

test('并发录入在事务内重读固定用户ID，后一个请求拒绝覆盖', async () => {
  const { state, main, payload } = await fixture()
  const transact = state.db.runTransaction
  let queue = Promise.resolve()
  // 按数据库事务串行化契约模拟两个同时通过事务外手机号查重的请求。
  state.db.runTransaction = callback => {
    const request = queue.then(() => transact(callback))
    queue = request.catch(() => {})
    return request
  }
  const results = await Promise.all([
    main({ action: 'createUser', payload }),
    main({ action: 'createUser', payload: { ...payload, name: '重复录入', requestId: 'create_user_request_002' } }),
  ])
  assert.equal(results.filter(result => result.success).length, 1)
  assert.equal(results.find(result => !result.success).code, 'DUPLICATE_USER_PHONE')
  assert.equal(state.collections.get('app_user').size, 2)
  assert.equal(state.collections.get('app_user').get(results[0].data.user.id).real_name, payload.name)
})

test('手机号登录查重后并发录入的档案仍被保留，事务包装返回也兼容', async () => {
  const { state, main, payload } = await fixture()
  state.transactionEnvelope = true
  const studentMain = loadFunction(state, {}, { OPENID: 'student-openid', ENV: 'test-env' })
  await studentMain({ action: 'getCurrentUserSession' })
  const transact = state.db.runTransaction
  let created
  state.db.runTransaction = async callback => {
    state.db.runTransaction = transact
    created = await main({ action: 'createUser', payload })
    return transact(callback)
  }
  const session = await login(studentMain, payload.phone, { realName: '登录占位名字', storeId: 'gaoxin' })
  assert.equal(created.success, true)
  assert.equal(session.success, true)
  assert.equal(session.data.userProfile.id, created.data.user.id)
  assert.equal(session.data.userProfile.nickname, payload.name)
  assert.equal(session.data.userProfile.homeStoreId, 'jingkai')
  assert.equal(state.collections.get('app_user').size, 2)
})

test('写入异常回滚且可重试，事务中管理员权限被撤销时不写入', async () => {
  const { state, main, payload, operatorId } = await fixture()
  const collection = state.db.collection
  state.db.collection = name => {
    const result = collection(name)
    if (name === 'app_user') {
      const doc = result.doc
      result.doc = id => ({ ...doc(id), set: async () => { throw new Error('临时写入失败') } })
    }
    return result
  }
  assert.equal((await main({ action: 'createUser', payload })).code, 'CREATE_USER_ERROR')
  assert.equal(state.collections.get('app_user').size, 1)
  state.db.collection = collection
  const transact = state.db.runTransaction
  state.db.runTransaction = async callback => {
    state.collections.get('app_user').get(operatorId).role = 1
    return transact(callback)
  }
  assert.equal((await main({ action: 'createUser', payload })).code, 'FORBIDDEN')
  assert.equal(state.collections.get('app_user').size, 1)
  state.db.runTransaction = transact
  state.collections.get('app_user').get(operatorId).role = 3
  assert.equal((await main({ action: 'createUser', payload })).success, true)
})

test('文档读取的网络、权限、集合缺失或事务冲突不会被当作新用户覆盖写入', async () => {
  for (const message of [
    'document.get:fail network timeout',
    'document.get:fail permission denied',
    'document.get:fail collection app_user does not exist',
    'DATABASE_TRANSACTION_CONFLICT',
  ]) {
    const { state, main, payload, operatorId } = await fixture()
    const created = await main({ action: 'createUser', payload })
    const userId = created.data.user.id
    const before = { ...state.collections.get('app_user').get(userId) }
    const collection = state.db.collection
    state.db.collection = name => {
      const result = collection(name)
      if (name === 'app_user') {
        const doc = result.doc
        result.doc = id => id === operatorId ? doc(id) : { ...doc(id), get: async () => { throw Object.assign(new Error(message), { errMsg: message }) } }
      }
      return result
    }
    const create = await main({ action: 'createUser', payload })
    assert.equal(create.success, false, message)
    assert.notEqual(create.message, message)
    assert.match(create.message, /超时|获准|资料尚未准备|正在更新/)
    assert.doesNotMatch(create.message, /document|collection|DATABASE|app_user/)
    const session = await login(main, payload.phone)
    assert.equal(session.success, false, message)
    assert.deepEqual(state.collections.get('app_user').get(userId), before)
    assert.equal(state.collections.get('app_user').size, 2)
  }
})

test('首次派课只允许文档缺失，余额读取故障不会覆写余额或新增审计', async () => {
  const { state, main, payload } = await fixture()
  const created = await main({ action: 'createUser', payload })
  const userId = created.data.user.id
  const distribution = { userId, packageId: 'pkg_private_trial', storeId: 'jingkai', offlineAmount: 99, payType: '微信转账', expiryDate: '2099-12-31' }
  assert.equal((await main({ action: 'distributeAsset', payload: distribution })).success, true)
  const before = { ...state.collections.get('user_asset').get(userId + '_2') }
  const logs = state.collections.get('user_asset_log').size
  const collection = state.db.collection
  state.db.collection = name => {
    const result = collection(name)
    if (name === 'user_asset') {
      const doc = result.doc
      result.doc = id => ({ ...doc(id), get: async () => { throw new Error('document.get:fail network timeout') } })
    }
    return result
  }
  assert.equal((await main({ action: 'distributeAsset', payload: distribution })).success, false)
  assert.deepEqual(state.collections.get('user_asset').get(userId + '_2'), before)
  assert.equal(state.collections.get('user_asset_log').size, logs)
})
