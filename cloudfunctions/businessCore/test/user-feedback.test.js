const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { test } = require('node:test')
const { getUserMessage, transportError } = require('../user-feedback')
const { createDatabase, loadFunction, login, failCollectionReads } = require('./helpers')

test('提示区分超时、权限、资料未准备、授权过期和并发冲突，不暴露内部字段', () => {
  const cases = [
    ['读取人员失败：document.get:fail network timeout', 'ADMIN_USER_MANAGE_VIEW_ERROR', /请求超时/],
    ['数据库自动初始化失败：permission denied', 'DATABASE_INIT_ERROR', /暂未获准/],
    ['collection app_user does not exist', 'CREATE_USER_ERROR', /资料尚未准备/],
    ['phonenumber.getPhoneNumber:fail invalid code 40029', 'LOGIN_WITH_PHONE_ERROR', /授权已过期/],
    ['DATABASE_TRANSACTION_CONFLICT', 'CREATE_USER_ERROR', /其他人员正在更新/],
    ['cloud.callFunction:fail FunctionName parameter could not be found', '', /功能尚未启用/],
    ['TypeError: Cannot read properties of undefined', 'ADMIN_USER_ASSETS_ERROR', /客户套餐余额暂时无法读取/],
    ['targetUserId 不能为空', 'INVALID_UPDATE_USER_ROLE_PAYLOAD', /请选择人员/],
    ['document.get:fail document with _id u_secret does not exist', 'CREATE_USER_ERROR', /相关记录已不存在/],
  ]
  for (const [raw, code, expected] of cases) {
    const message = getUserMessage(raw, '操作未完成，请稍后重试', code)
    assert.match(message, expected)
    assert.doesNotMatch(message, /数据库|collection|document|_id|TypeError|undefined|targetUserId|SDK|cloud\./i)
  }
  assert.equal(getUserMessage('预约失败：权益已到期，请联系场馆续课', '', 'CREATE_BOOKING_ERROR'), '权益已到期，请联系场馆续课')
  assert.equal(getUserMessage('当前时段已满员', '', 'CREATE_BOOKING_ERROR'), '当前时段已满员')
})

test('读取超时和写入结果未确认分别提示，录入和核销可用原请求重试', () => {
  const read = transportError({ errMsg: 'cloud.callFunction:fail timeout' }, 'getAdminUserAssets')
  assert.equal(read.code, 'REQUEST_TIMEOUT')
  assert.equal(read.outcomeUnknown, false)
  assert.doesNotMatch(read.message, /结果尚未确认/)
  const write = transportError({ errMsg: 'cloud.callFunction:fail timeout' }, 'distributeAsset')
  assert.equal(write.outcomeUnknown, true)
  assert.match(write.message, /刷新记录核对，勿重复提交/)
  assert.match(transportError({ errMsg: 'network disconnected' }, 'manualWriteOff').message, /原请求重试核对/)
  const unavailable = transportError({ errMsg: 'Environment not found' }, 'createUser')
  assert.equal(unavailable.code, 'SERVICE_UNAVAILABLE')
  assert.equal(unavailable.outcomeUnknown, false)
})

test('前后端提示源保持一致，部署包各自包含规则', () => {
  assert.equal(fs.readFileSync(path.resolve(__dirname, '../user-feedback.js'), 'utf8'), fs.readFileSync(path.resolve(__dirname, '../../../miniprogram/utils/user-feedback.js'), 'utf8'))
})

test('各业务读取接口遇到实际权限故障都返回可处理原因，保留内部错误码', async () => {
  const state = createDatabase()
  const main = loadFunction(state)
  const operator = (await login(main, '13812345678')).data.userProfile.id
  state.collections.get('app_user').get(operator).role = 3
  const cases = [
    ['getHomeViewData', { storeId: 'gaoxin' }, 'biz_package'],
    ['getBookingViewData', { storeId: 'gaoxin' }, 'biz_class_schedule'],
    ['getProfileViewData', {}, 'user_asset'],
    ['getAdminUserManageData', {}, 'user_asset'],
    ['getAdminPackageManageData', {}, 'biz_package'],
    ['getAdminStoreManageData', {}, 'biz_store'],
    ['getAdminDashboardData', { storeId: 'gaoxin' }, 'user_asset_log'],
  ]
  for (const [action, payload, target] of cases) {
    const restore = failCollectionReads(state, target, 'collection.get:fail permission denied _id internal-record')
    const result = await main({ action, payload })
    assert.equal(result.success, false, action)
    assert.ok(result.code)
    assert.match(result.message, /暂未获准读取或保存资料/, action)
    assert.doesNotMatch(result.message, /collection|permission|_id|internal-record/)
    restore()
  }
})
