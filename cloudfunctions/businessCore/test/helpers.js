const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const source = readFileSync(path.join(__dirname, '..', 'index.js'), 'utf8')
const collectionNames = ['app_user', 'biz_store', 'biz_package', 'user_asset', 'user_asset_log', 'biz_class_schedule', 'biz_booking']

function createDatabase() {
  const collections = new Map()
  const state = { collections, createCalls: 0, phoneCalls: 0, createError: null, insertError: null, nextId: 0 }

  function getRecords(name) {
    if (!collections.has(name)) throw new Error('collection does not exist: ' + name)
    return collections.get(name)
  }

  function query(name, where = {}, offset = 0, size = Infinity) {
    function rows() {
      return [...getRecords(name).values()].filter((doc) => Object.entries(where).every(([key, value]) => doc[key] === value))
    }
    return {
      where: (nextWhere) => query(name, nextWhere),
      skip: (next) => query(name, where, next, size),
      limit: (next) => query(name, where, offset, next),
      orderBy: () => query(name, where, offset, size),
      count: async () => ({ total: rows().length }),
      get: async () => ({ data: rows().slice(offset, offset + size).map((doc) => ({ ...doc })) }),
      add: async ({ data }) => {
        if (state.insertError && state.insertError.id === data._id) throw state.insertError.error
        const records = getRecords(name)
        if (!data._id) data = { ...data, _id: 'auto_' + (++state.nextId) }
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
          const next = { ...records.get(id) }
          for (const [key, value] of Object.entries(data)) next[key] = value && value.increment !== undefined ? Number(next[key] || 0) + value.increment : value
          records.set(id, next)
          return { stats: { updated: 1 } }
        },
      }),
    }
  }

  state.db = {
    command: { inc: (increment) => ({ increment }) },
    serverDate: () => new Date(),
    createCollection: async (name) => {
      state.createCalls += 1
      if (state.createError) throw state.createError
      if (collections.has(name)) throw new Error('collection already exists')
      collections.set(name, new Map())
    },
    collection: (name) => query(name),
    runTransaction: async (callback) => {
      const snapshot = new Map([...collections].map(([key, records]) => [key, new Map([...records].map(([id, doc]) => [id, { ...doc }]))]))
      try {
        const result = await callback(state.db)
        return state.transactionEnvelope ? { result, errMsg: 'runTransaction:ok' } : result
      } catch (error) {
        collections.clear()
        for (const [key, records] of snapshot) collections.set(key, records)
        throw error
      }
    },
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
      if (name === 'wx-server-sdk') return cloud
      if (name === 'crypto') return require('node:crypto')
      if (name === './request-policy') return require('../request-policy')
      throw new Error(name)
    },
  }
  vm.runInNewContext(source, sandbox, { filename: 'businessCore/index.js' })
  return sandbox.exports.main
}

const login = (main, phone, payload = {}) => main({ action: 'loginWithPhone', payload: { phoneCode: phone, ...payload } })


module.exports = { createDatabase, loadFunction, login, collectionNames }
