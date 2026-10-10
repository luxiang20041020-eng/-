const { getUserMessage, transportError } = require('./user-feedback')
const pendingReads = new Map()

function callBusinessCore(action, payload) {
  const isRead = action.indexOf('get') === 0
  const key = action + ':' + JSON.stringify(payload || {})
  if (isRead && pendingReads.has(key)) return pendingReads.get(key)
  const request = wx.cloud.callFunction({
    name: 'businessCore',
    data: {
      action,
      payload,
    },
  }).then((response) => {
    const result = response && response.result ? response.result : response
    if (!result || typeof result.success !== 'boolean' || (result.success && (!result.data || typeof result.data !== 'object'))) {
      throw new Error('服务未返回完整操作结果，请刷新记录后核对')
    }
    return response
  }).catch((error) => {
    throw transportError(error, action)
  })
  if (isRead) {
    pendingReads.set(key, request)
    const clear = () => { if (pendingReads.get(key) === request) pendingReads.delete(key) }
    request.then(clear, clear)
  }
  return request
}

function unwrapResult(response) {
  const result = response && response.result ? response.result : response
  if (!result || !result.success) {
    const message = getUserMessage(result, '服务未返回操作结果，请刷新记录后核对')
    throw Object.assign(new Error(message), { code: result && result.code || 'BUSINESS_ERROR' })
  }
  return result.data
}

async function bootstrapCollections() {
  const response = await callBusinessCore('bootstrap')
  return unwrapResult(response)
}

async function getCurrentUserSession() {
  const response = await callBusinessCore('getCurrentUserSession')
  return unwrapResult(response)
}

async function getIdentityQrCode(payload) {
  const response = await callBusinessCore('getIdentityQrCode', payload)
  return unwrapResult(response)
}

async function loginWithPhone(payload) {
  const response = await callBusinessCore('loginWithPhone', payload)
  return unwrapResult(response)
}

async function logout() {
  return unwrapResult(await callBusinessCore('logout'))
}

async function getHomeViewData(payload) {
  const response = await callBusinessCore('getHomeViewData', payload)
  return unwrapResult(response)
}

async function getBookingViewData(payload) {
  const response = await callBusinessCore('getBookingViewData', payload)
  return unwrapResult(response)
}

async function getProfileViewData(payload) {
  const response = await callBusinessCore('getProfileViewData', payload)
  return unwrapResult(response)
}

async function getWorkspaceViewData(payload) {
  const response = await callBusinessCore('getWorkspaceViewData', payload)
  return unwrapResult(response)
}

async function getDistributeViewData(payload) {
  const response = await callBusinessCore('getDistributeViewData', payload)
  return unwrapResult(response)
}

async function getAdminDashboardData(payload) {
  const response = await callBusinessCore('getAdminDashboardData', payload)
  return unwrapResult(response)
}

async function getAdminUserManageData(payload) {
  const response = await callBusinessCore('getAdminUserManageData', payload)
  return unwrapResult(response)
}

async function getAdminPackageManageData(payload) {
  const response = await callBusinessCore('getAdminPackageManageData', payload)
  return unwrapResult(response)
}

async function getAdminStoreManageData(payload) {
  const response = await callBusinessCore('getAdminStoreManageData', payload)
  return unwrapResult(response)
}

async function createPackage(payload) {
  const response = await callBusinessCore('createPackage', payload)
  return unwrapResult(response)
}

async function createStore(payload) {
  const response = await callBusinessCore('createStore', payload)
  return unwrapResult(response)
}

async function updateStore(payload) {
  const response = await callBusinessCore('updateStore', payload)
  return unwrapResult(response)
}

async function updateStoreStatus(payload) {
  const response = await callBusinessCore('updateStoreStatus', payload)
  return unwrapResult(response)
}

async function getCoachClassViewData(payload) {
  const response = await callBusinessCore('getCoachClassViewData', payload)
  return unwrapResult(response)
}

async function getCoachScheduleViewData(payload) {
  const response = await callBusinessCore('getCoachScheduleViewData', payload)
  return unwrapResult(response)
}

async function distributeAsset(payload) {
  const response = await callBusinessCore('distributeAsset', payload)
  return unwrapResult(response)
}

async function createPrivateBooking(payload) { return unwrapResult(await callBusinessCore('createPrivateBooking', payload)) }

async function createBooking(payload) {
  const response = await callBusinessCore('createBooking', payload)
  return unwrapResult(response)
}

async function cancelBooking(payload) {
  const response = await callBusinessCore('cancelBooking', payload)
  return unwrapResult(response)
}

async function writeOffBooking(payload) {
  const response = await callBusinessCore('writeOffBooking', payload)
  return unwrapResult(response)
}

async function createCoachSchedule(payload) {
  const response = await callBusinessCore('createCoachSchedule', payload)
  return unwrapResult(response)
}

async function updateUserRole(payload) {
  const response = await callBusinessCore('updateUserRole', payload)
  return unwrapResult(response)
}

async function updateUserProfile(payload) {
  const response = await callBusinessCore('updateUserProfile', payload)
  return unwrapResult(response)
}

async function updatePackageStatus(payload) {
  const response = await callBusinessCore('updatePackageStatus', payload)
  return unwrapResult(response)
}

module.exports = {
  updateStoreGallery: async payload => unwrapResult(await callBusinessCore('updateStoreGallery', payload)),
  getCoachProfile: async payload => unwrapResult(await callBusinessCore('getCoachProfile', payload)),
  getOwnCoachProfile: async payload => unwrapResult(await callBusinessCore('getOwnCoachProfile', payload)),
  getMediaUploadData: async payload => unwrapResult(await callBusinessCore('getMediaUploadData', payload)),
  updateUserAvatar: async payload => unwrapResult(await callBusinessCore('updateUserAvatar', payload)),
  updateCoachProfile: async payload => unwrapResult(await callBusinessCore('updateCoachProfile', payload)),

  getCustomerFollowUpData: async payload => unwrapResult(await callBusinessCore('getCustomerFollowUpData', payload)),
  getBusinessReportData: async payload => unwrapResult(await callBusinessCore('getBusinessReportData', payload)),
  getScheduleAdjustmentData: async payload => unwrapResult(await callBusinessCore('getScheduleAdjustmentData', payload)),
  updateCoachSchedule: async payload => unwrapResult(await callBusinessCore('updateCoachSchedule', payload)),
  cancelCoachSchedule: async payload => unwrapResult(await callBusinessCore('cancelCoachSchedule', payload)),
  getCorrectionRecords: async payload => unwrapResult(await callBusinessCore('getCorrectionRecords', payload)),
  reverseOperation: async payload => unwrapResult(await callBusinessCore('reverseOperation', payload)),
  getPointsViewData: async () => unwrapResult(await callBusinessCore('getPointsViewData')),
  bindInviteCode: async (payload) => unwrapResult(await callBusinessCore('bindInviteCode', payload)),
  clearPendingReads: () => pendingReads.clear(),
  getManualWriteOffViewData: async (payload) => unwrapResult(await callBusinessCore('getManualWriteOffViewData', payload)),
  manualWriteOff: async (payload) => unwrapResult(await callBusinessCore('manualWriteOff', payload)),
  logout,
  bootstrapCollections,
  getCurrentUserSession,
  getIdentityQrCode,
  loginWithPhone,
  getHomeViewData,
  getBookingViewData,
  getProfileViewData,
  getWorkspaceViewData,
  getDistributeViewData,
  getAdminDashboardData,
  getAdminUserManageData,
  getAdminUserAssets: async (payload) => unwrapResult(await callBusinessCore('getAdminUserAssets', payload)),
  getAdminPackageManageData,
  getAdminStoreManageData,
  createUser: async (payload) => unwrapResult(await callBusinessCore('createUser', payload)),
  createPackage,
  createStore,
  updateStore,
  updateStoreStatus,
  getCoachClassViewData,
  getCoachScheduleViewData,
  distributeAsset,
  createBooking, createPrivateBooking,
  cancelBooking,
  writeOffBooking,
  createCoachSchedule,
  updateUserRole,
  updateUserProfile,
  updatePackageStatus,
}
