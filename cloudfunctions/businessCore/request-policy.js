const PUBLIC_ACTIONS = new Set(['getCurrentUserSession', 'loginWithPhone', 'getHomeViewData', 'getBookingViewData', 'logout'])
const ADMIN_ACTIONS = new Set(['bootstrap', 'getAdminDashboardData', 'getAdminUserManageData', 'getAdminUserAssets', 'getAdminPackageManageData', 'getAdminStoreManageData', 'createUser', 'createPackage', 'createStore', 'updateStore', 'updateStoreStatus', 'updateUserRole', 'updatePackageStatus'])
const STAFF_ACTIONS = new Set(['getWorkspaceViewData', 'getDistributeViewData', 'getCoachClassViewData', 'getCoachScheduleViewData', 'getManualWriteOffViewData', 'manualWriteOff', 'distributeAsset', 'writeOffBooking', 'createCoachSchedule'])
const MEMBER_ACTIONS = new Set(['getIdentityQrCode', 'getProfileViewData', 'updateUserProfile', 'createBooking', 'cancelBooking'])

function reject(message, code) {
  throw Object.assign(new Error(message), { code })
}

function authorizeRequest(event, user) {
  const action = event.action
  if (![PUBLIC_ACTIONS, ADMIN_ACTIONS, STAFF_ACTIONS, MEMBER_ACTIONS].some((actions) => actions.has(action))) {
    reject('暂不支持此操作', 'UNKNOWN_ACTION')
  }
  if (!PUBLIC_ACTIONS.has(action) && !user) reject('请先登录后继续', 'LOGIN_REQUIRED')
  if (ADMIN_ACTIONS.has(action) && Number(user.role) !== 3) reject('此操作需要管理员权限', 'FORBIDDEN')
  if (STAFF_ACTIONS.has(action) && ![2, 3].includes(Number(user.role))) reject('此操作需要场馆人员权限', 'FORBIDDEN')
  const payload = { ...(event.payload || {}) }
  // 用户身份只从微信上下文匹配，忽略客户端传入的操作人和个人数据归属。
  if (['getBookingViewData', 'getProfileViewData', 'createBooking'].includes(action)) payload.userId = user ? user._id : ''
  if (user) payload.operatorId = user._id
  if (['getWorkspaceViewData', 'getCoachScheduleViewData', 'createCoachSchedule'].includes(action)) {
    payload.coachId = Number(user.role) === 3 ? (payload.coachId || user._id) : user._id
  }
  return { ...event, payload, operator: user }
}

function parseBusinessTime(value) {
  if (!value) return NaN
  if (value instanceof Date || typeof value === 'number') return new Date(value).getTime()
  const source = String(value)
  const normalized = source.replace(' ', 'T')
  return new Date(/(Z|[+-]\d{2}:?\d{2})$/i.test(normalized) ? normalized : normalized + '+08:00').getTime()
}

function businessDate(value = Date.now()) {
  const time = parseBusinessTime(value)
  return Number.isFinite(time) ? new Date(time + 8 * 3600000).toISOString().slice(0, 10) : ''
}

function canCancel(startTime, now = Date.now()) {
  return parseBusinessTime(startTime) - now > 2 * 3600000
}

module.exports = { PUBLIC_ACTIONS, authorizeRequest, parseBusinessTime, businessDate, canCancel }
