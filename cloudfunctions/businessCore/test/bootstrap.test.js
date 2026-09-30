const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { test } = require('node:test')

const source = readFileSync(path.join(__dirname, '..', 'index.js'), 'utf8')
const collectionNames = ['app_user', 'biz_store', 'biz_package', 'user_asset', 'user_asset_log', 'biz_class_schedule', 'biz_booking']

function createDatabase() {
  const collections = new Map()
  const state = { collections, createCalls: 0, phoneCalls: 0, createError: null, insertError: null }

  function getRecords(name) {
    if (!collections.has(name)) throw new Error('collection does not exist: ' + name)
    return collections.get(name)
  }

  function query(name, where = {}) {
    function rows() {
      return [...getRecords(name).values()].filter((doc) => Object.entries(where).every(([key, value]) => doc[key] === value))
    }
    return {
      where: (nextWhere) => query(name, nextWhere),
      count: async () => ({ total: rows().length }),
      get: async () => ({ data: rows().map((doc) => ({ ...doc })) }),
      add: async ({ data }) => {
        if (state.insertError && state.insertError.id === data._id) throw state.insertError.error
        const records = getRecords(name)
        if (records.has(data._id)) throw new Error('E11000 duplicate key: ' + data._id)
        records.set(data._id, { ...data })
        return { _id: data._id }
      },
      doc: (id) => ({
        get: async () => ({ data: getRecords(name).get(id) }),
        set: async ({ data }) => {
          getRecords(name).set(id, { ...data, _id: id })
          return { _id: id }
        },
        update: async ({ data }) => {
          const records = getRecords(name)
          if (!records.has(id)) throw new Error('document does not exist')
          records.set(id, { ...records.get(id), ...data })
          return { stats: { updated: 1 } }
        },
      }),
    }
  }

  state.db = {
    command: {},
    serverDate: () => 'server-date',
    createCollection: async (name) => {
      state.createCalls += 1
      if (state.createError) throw state.createError
      if (collections.has(name)) throw new Error('collection already exists')
      collections.set(name, new Map())
    },
    collection: (name) => query(name),
  }
  return state
}

function loadFunction(state, env = {}, context = { OPENID: 'real-openid', ENV: 'test-env' }) {
  const cloud = {
    DYNAMIC_CURRENT_ENV: 'test-env',
    init() {},
    database: () => state.db,
    getWXContext: () => context,
    openapi: {
      phonenumber: {
        getPhoneNumber: async ({ code }) => {
          state.phoneCalls += 1
          return { phone_info: { purePhoneNumber: code } }
        },
      },
    },
  }
  const sandbox = {
    exports: {},
    process: { env },
    require(name) {
      assert.equal(name, 'wx-server-sdk')
      return cloud
    },
  }
  vm.runInNewContext(source, sandbox, { filename: 'businessCore/index.js' })
  return sandbox.exports.main
}

const login = (main, phone, payload = {}) => main({ action: 'loginWithPhone', payload: { phoneCode: phone, ...payload } })

test('空数据库在未登录查询之前创建全部集合，仅写入基础配置', async () => {
  const state = createDatabase()
  const result = await loadFunction(state)({ action: 'getCurrentUserSession' })
  assert.equal(result.success, true)
  assert.equal(result.data.loggedIn, false)
  assert.deepEqual([...state.collections.keys()].sort(), collectionNames.slice().sort())
  assert.equal(state.collections.get('biz_store').size, 2)
  assert.equal(state.collections.get('biz_package').size, 3)
  for (const name of collectionNames.filter((name) => !['biz_store', 'biz_package'].includes(name))) {
    assert.equal(state.collections.get(name).size, 0)
  }
})

test('首次调用即可登录客户，客户端角色和手机号不能指定管理员', async () => {
  const state = createDatabase()
  const main = loadFunction(state, { ADMIN_PHONE_NUMBERS: '13812345678' })
  const result = await login(main, '13912345678', { role: 3, phone: '13812345678' })
  assert.equal(result.success, true)
  assert.equal(result.data.role, 'client')
  assert.equal(result.data.userProfile.phone, '13912345678')
  assert.equal(result.data.userProfile.homeStoreId, 'gaoxin')
  assert.equal(state.collections.get('app_user').size, 1)
  assert.equal((await main({ action: 'getCurrentUserSession' })).data.loggedIn, true)
})

test('云端配置的真实手机号可在空环境创建首位管理员', async () => {
  const state = createDatabase()
  const main = loadFunction(state, { ADMIN_PHONE_NUMBERS: '13912345678, 13812345678' })
  const result = await login(main, '13812345678')
  assert.equal(result.success, true)
  assert.equal(result.data.role, 'admin')
  const check = await main({ action: 'bootstrap' })
  assert.equal(check.success, true)
  assert.equal(check.data.inspectResults.length, 7)
  assert.equal(state.collections.get('app_user').size, 1)
  assert.equal(state.collections.get('user_asset').size, 0)
})

test('已注册用户通过配置升级为管理员，已有管理员不因配置缺失降权', async () => {
  const state = createDatabase()
  await loadFunction(state)({ action: 'getCurrentUserSession' })
  state.collections.get('app_user').set('existing', {
    _id: 'existing', phone: '13812345678', openid: 'old-openid', role: 1,
    real_name: '店主', home_store_id: 'gaoxin', status: 1, is_deleted: false,
  })
  const result = await login(loadFunction(state, { ADMIN_PHONE_NUMBERS: '13812345678' }), '13812345678')
  assert.equal(result.data.role, 'admin')
  assert.equal(result.data.userProfile.id, 'existing')
  assert.equal(state.collections.get('app_user').get('existing').openid, 'real-openid')
  assert.equal((await login(loadFunction(state), '13812345678')).data.role, 'admin')
})

test('bootstrap 需要真实管理员，客户端和云端演示开关都不能绕过鉴权', async () => {
  const state = createDatabase()
  const main = loadFunction(state, { ENABLE_DEMO_SEEDS: 'true' })
  assert.equal((await main({ action: 'bootstrap', payload: { role: 3 } })).success, false)
  await login(main, '13912345678')
  const result = await main({ action: 'bootstrap' })
  assert.equal(result.success, false)
  assert.match(result.message, /没有管理员权限/)
  assert.equal(state.collections.get('app_user').has('admin_001'), false)
})

test('演示数据仅在显式云端开关开启且管理员调用时写入', async () => {
  const state = createDatabase()
  const main = loadFunction(state, { ADMIN_PHONE_NUMBERS: '13812345678', ENABLE_DEMO_SEEDS: 'true' })
  await login(main, '13812345678')
  assert.equal(state.collections.get('app_user').has('admin_001'), false)
  assert.equal((await main({ action: 'bootstrap' })).success, true)
  assert.equal(state.collections.get('app_user').has('admin_001'), true)
  assert.ok(state.collections.get('user_asset').size > 0)
  assert.ok(state.collections.get('biz_booking').size > 0)
})

test('真实建集合错误不能被泛化错误码吞掉，失败后可重试', async () => {
  const state = createDatabase()
  state.createError = Object.assign(new Error('resource system error: permission denied'), { errCode: -501001 })
  const main = loadFunction(state)
  const failure = await login(main, '13812345678')
  assert.equal(failure.success, false)
  assert.equal(failure.code, 'DATABASE_INIT_ERROR')
  assert.match(failure.message, /permission denied/)
  assert.equal(state.phoneCalls, 0)
  assert.equal(state.collections.size, 0)
  state.createError = null
  assert.equal((await login(main, '13812345678')).success, true)
})

test('种子部分写入失败后重试补齐，已存在记录不被覆盖', async () => {
  const state = createDatabase()
  state.insertError = { id: 'pkg_group_half_year', error: new Error('temporary insert failure') }
  const main = loadFunction(state)
  assert.equal((await main({ action: 'getCurrentUserSession' })).code, 'DATABASE_INIT_ERROR')
  const records = state.collections.get('biz_package')
  records.get('pkg_private_30').display_price = 8888
  state.insertError = null
  assert.equal((await main({ action: 'getCurrentUserSession' })).success, true)
  assert.equal(records.size, 3)
  assert.equal(records.get('pkg_private_30').display_price, 8888)
  const calls = state.createCalls
  await main({ action: 'getCurrentUserSession' })
  assert.equal(state.createCalls, calls)
  await loadFunction(state)({ action: 'getCurrentUserSession' })
  assert.equal(records.get('pkg_private_30').display_price, 8888)
})

test('同一热实例并发请求共享一次初始化', async () => {
  const state = createDatabase()
  const main = loadFunction(state)
  const results = await Promise.all(Array.from({ length: 5 }, () => main({ action: 'getCurrentUserSession' })))
  assert.ok(results.every((result) => result.success))
  assert.equal(state.createCalls, 7)
})

test('不同冷实例并发启动允许集合和固定种子 ID 冲突', async () => {
  const state = createDatabase()
  const results = await Promise.all([
    loadFunction(state)({ action: 'getCurrentUserSession' }),
    loadFunction(state)({ action: 'getCurrentUserSession' }),
  ])
  assert.ok(results.every((result) => result.success))
  assert.equal(state.collections.get('biz_store').size, 2)
  assert.equal(state.collections.get('biz_package').size, 3)
})

test('没有 OPENID 时也可准备集合，但不能创建登录用户', async () => {
  const state = createDatabase()
  const main = loadFunction(state, {}, { ENV: 'test-env' })
  assert.equal((await main({ action: 'getCurrentUserSession' })).data.loggedIn, false)
  assert.equal((await login(main, '13812345678')).code, 'OPENID_NOT_FOUND')
  assert.equal(state.collections.get('app_user').size, 0)
})
