// 前后端共用提示规则；通过 tools/sync-user-feedback.js 同步到小程序。
const CODE_MESSAGES = {
  LOGIN_REQUIRED: '请先登录后继续操作', ACCOUNT_DISABLED: '账号已停用，请联系场馆管理员',
  FORBIDDEN: '当前账号没有此操作权限，请联系场馆管理员', UNKNOWN_ACTION: '当前功能尚未启用，请更新小程序后重试',
  DATABASE_INIT_ERROR: '场馆服务尚未准备完成，请稍后重试；仍无法使用请联系场馆',
  OPENID_NOT_FOUND: '未能确认微信登录身份，请重新进入小程序后登录',
  PHONE_NUMBER_NOT_FOUND: '未获取到手机号，请重新授权登录',
  DUPLICATE_USER_PHONE: '该手机号已建档，请在人员列表查找',
  STORE_NOT_AVAILABLE: '门店已停用或不存在，请选择其他门店',
  PACKAGE_NOT_AVAILABLE: '套餐已下架或不存在，请重新选择套餐',
  USER_NOT_AVAILABLE: '客户账号已停用或不存在，请核对客户档案',
  COACH_NOT_AVAILABLE: '教练账号已停用或身份已变更，请重新选择教练',
  TARGET_USER_NOT_FOUND: '客户档案已不存在，请刷新人员列表',
  TARGET_STORE_NOT_FOUND: '门店已不存在，请刷新门店列表',
  TARGET_PACKAGE_NOT_FOUND: '套餐已不存在，请刷新套餐列表',
  CLASS_NOT_FOUND: '训练场次已不存在，请刷新场次列表',
  INVALID_HOME_VIEW_PAYLOAD: '请先选择门店', INVALID_BOOKING_VIEW_PAYLOAD: '请先选择门店',
  INVALID_PROFILE_VIEW_PAYLOAD: '请先登录后查看个人资料',
  INVALID_WORKSPACE_VIEW_PAYLOAD: '请先登录并选择门店',
  INVALID_COACH_CLASS_VIEW_PAYLOAD: '请选择要查看的训练场次',
  INVALID_COACH_SCHEDULE_VIEW_PAYLOAD: '请先选择门店',
  INVALID_IDENTITY_QR_PAYLOAD: '身份码信息已失效，请重新打开身份码',
  INVALID_PHONE_LOGIN_PAYLOAD: '手机号授权已失效，请重新授权登录',
  INVALID_DISTRIBUTION_PAYLOAD: '请选定学员和套餐，并填写收款方式及有效金额',
  INVALID_BOOKING_PAYLOAD: '请选择要预约的场次并确认登录状态',
  INVALID_UPDATE_USER_ROLE_PAYLOAD: '请选择人员及有效的身份权限',
  INVALID_UPDATE_STORE_PAYLOAD: '请选择门店并填写完整的门店资料',
  INVALID_UPDATE_STORE_STATUS_PAYLOAD: '请选择门店及营业状态',
  INVALID_UPDATE_PACKAGE_STATUS_PAYLOAD: '请选择套餐及上架状态',
  INVALID_CREATE_STORE_PAYLOAD: '请填写完整的门店资料并选择营业状态',
  INVALID_CREATE_PACKAGE_PAYLOAD: '请核对套餐名称、类型、课时、金额和上架状态',
}
const OPERATION_MESSAGES = {
  POINTS_VIEW_ERROR: '积分资料暂时无法读取，请稍后重试',
  BIND_INVITE_ERROR: '邀请码绑定未完成，请刷新积分和绑定状态后重试',
  CREATE_USER_ERROR: '用户档案未能保存，请稍后重试', LOGIN_WITH_PHONE_ERROR: '手机号登录未完成，请重新授权后重试',
  LOGOUT_ERROR: '退出登录未完成，请稍后重试', AUTH_ERROR: '未能确认登录状态，请重新登录',
  CREATE_BOOKING_ERROR: '预约未完成，请刷新预约记录后再操作',
  CANCEL_BOOKING_ERROR: '取消预约未完成，请刷新预约记录后再操作',
  DISTRIBUTE_ASSET_ERROR: '权益派发未完成，请核对学员余额和派发记录',
  WRITEOFF_BOOKING_ERROR: '到场状态未能更新，请刷新名单后重试',
  MANUAL_WRITEOFF_ERROR: '人工核销未完成，请核对训练记录后重试',
  CREATE_SCHEDULE_ERROR: '训练场次未能保存，请刷新排期后重试',
  CREATE_PACKAGE_ERROR: '套餐未能保存，请稍后重试', CREATE_STORE_ERROR: '门店未能保存，请稍后重试',
  UPDATE_STORE_ERROR: '门店资料未能更新，请刷新后重试', UPDATE_STORE_STATUS_ERROR: '门店营业状态未能更新，请刷新后重试',
  UPDATE_USER_ROLE_ERROR: '身份权限未能更新，请刷新人员列表后重试',
  UPDATE_USER_PROFILE_ERROR: '姓名未能更新，请稍后重试', UPDATE_PACKAGE_STATUS_ERROR: '套餐上架状态未能更新，请刷新后重试',
  HOME_VIEW_ERROR: '首页资料暂时无法读取，请稍后重试', BOOKING_VIEW_ERROR: '训练场次暂时无法读取，请稍后重试',
  PROFILE_VIEW_ERROR: '个人权益和预约暂时无法读取，请稍后重试', WORKSPACE_VIEW_ERROR: '工作台资料暂时无法读取，请稍后重试',
  DISTRIBUTE_VIEW_ERROR: '学员和套餐资料暂时无法读取，请稍后重试', ADMIN_VIEW_ERROR: '经营数据暂时无法读取，请稍后重试',
  ADMIN_USER_MANAGE_VIEW_ERROR: '人员列表暂时无法读取，请稍后重试', ADMIN_USER_ASSETS_ERROR: '客户套餐余额暂时无法读取，请稍后重试',
  ADMIN_PACKAGE_MANAGE_VIEW_ERROR: '套餐列表暂时无法读取，请稍后重试', ADMIN_STORE_MANAGE_VIEW_ERROR: '门店列表暂时无法读取，请稍后重试',
  COACH_CLASS_VIEW_ERROR: '训练名单暂时无法读取，请稍后重试', COACH_SCHEDULE_VIEW_ERROR: '排期暂时无法读取，请稍后重试',
  MANUAL_VIEW_ERROR: '学员或训练资料暂时无法读取，请稍后重试',
  GET_CURRENT_USER_SESSION_ERROR: '登录状态暂时无法确认，请稍后重试', GET_IDENTITY_QR_CODE_ERROR: '身份码暂时无法生成，请稍后重试',
  BOOTSTRAP_ERROR: '场馆服务检查未完成，请稍后重试',
}
const INTERNAL = /数据库|集合|文档|云函数|云环境|种子|校验失败|\b(?:database|collection|document|sdk|openid|errcode|errmsg|stack|TypeError|ReferenceError|undefined|null|Error)\b|_id|\w+(?:Id|Code|Status|Amount|Key|Type)\b|\b\w+:(?:fail|ok)\b|status\s|nextRole|INVALID_|ERROR|\bat\s+\w+\s*\(/i

function getUserMessage(error, fallback = '操作未完成，请稍后重试', explicitCode = '') {
  const code = error && typeof error === 'object' ? error.code || explicitCode : explicitCode
  const raw = String(error && typeof error === 'object' ? error.message || error.errMsg || '' : error || '').trim()
  const message = raw.replace(/^[^：:\n]{1,24}(?:失败|未保存)[:：]\s*/, '')
  // 已有业务校验保留具体原因，内部错误只转换为可理解的处理建议。
  if (/[\u3400-\u9fff]/.test(message) && !INTERNAL.test(message)) return message
  if (/setStorageSync.*fail|storage.*(?:full|quota)/i.test(raw)) return '手机暂时无法保存操作信息，请清理存储空间后重试'
  if (/page.*limit|页面.*过多/i.test(raw)) return '已打开的页面过多，请返回上一页后重试'
  if (/navigate.*fail|route.*not.*found/i.test(raw)) return '页面暂时无法打开，请返回上一页或更新小程序后重试'
  if (/auth.*deny|authorize.*fail|permission.*reject/i.test(raw)) return '未获得此操作授权，请在微信设置中检查权限后重试'
  if (/invalid.*code|code.*(?:expired|used)|40029|40163|45011/i.test(raw)) return '手机号授权已过期，请重新授权登录'
  if (/transaction.*conflict|事务冲突|WRITE_CONFLICT/i.test(raw)) return '其他人员正在更新同一记录，请刷新后重试'
  if (/timeout|timed.?out|超时/i.test(raw)) return '请求超时，请检查网络后重试'
  if (/network|econn|fetch failed|网络|断网/i.test(raw)) return '网络连接中断，请检查网络后重试'
  if (/function.*not.*(?:found|exist)|environment.*not.*(?:found|exist)/i.test(raw)) return '当前功能尚未启用，请联系场馆更新服务'
  if (/permission denied|access denied|unauthorized|授权失败/i.test(raw)) return '服务暂未获准读取或保存资料，请联系场馆处理'
  if (/collection.*(?:not.*exist|not.*found)|集合.*(?:失败|不存在)/i.test(raw)) return '场馆资料尚未准备完成，请联系场馆处理'
  if (/document.*(?:not.*exist|not.*found)/i.test(raw)) return CODE_MESSAGES[code] || '相关记录已不存在，请刷新页面后核对'
  if (/duplicate|E11000/i.test(raw)) return code === 'CREATE_USER_ERROR' ? CODE_MESSAGES.DUPLICATE_USER_PHONE : '记录已存在，请刷新查看后再操作'
  if (CODE_MESSAGES[code] || OPERATION_MESSAGES[code]) return CODE_MESSAGES[code] || OPERATION_MESSAGES[code]
  return /[\u3400-\u9fff]/.test(fallback) && !INTERNAL.test(fallback) ? fallback : '操作未完成，请稍后重试'
}

function transportError(error, action) {
  const raw = String(error && (error.errMsg || error.message) || '')
  const timeout = /timeout|timed.?out|超时/i.test(raw)
  const unavailable = /function.*not.*(?:found|exist)|environment.*not.*(?:found|exist)|permission denied|access denied/i.test(raw)
  const write = /^(bind|create|update|distribute|cancel|writeOff|manualWriteOff|logout)/.test(action)
  const outcomeUnknown = write && !unavailable
  let message = getUserMessage(error, '服务暂时无法连接，请检查网络后重试')
  if (outcomeUnknown) message += action === 'createUser' || action === 'manualWriteOff'
    ? '；结果尚未确认，请用原请求重试核对'
    : '；结果尚未确认，请先刷新记录核对，勿重复提交'
  return Object.assign(new Error(message), { code: unavailable ? 'SERVICE_UNAVAILABLE' : timeout ? 'REQUEST_TIMEOUT' : 'NETWORK_ERROR', outcomeUnknown })
}

module.exports = { getUserMessage, transportError }
