function callBusinessCore(action, payload) {
  return wx.cloud.callFunction({
    name: 'businessCore',
    data: {
      action,
      payload,
    },
  })
}

function unwrapResult(response) {
  const result = response && response.result ? response.result : response
  if (!result || !result.success) {
    throw new Error(result && result.message ? result.message : '业务云函数调用失败')
  }
  return result.data
}

async function bootstrapCollections() {
  const response = await callBusinessCore('bootstrap')
  return unwrapResult(response)
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

async function getAdminDashboardData(payload) {
  const response = await callBusinessCore('getAdminDashboardData', payload)
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

module.exports = {
  bootstrapCollections,
  getHomeViewData,
  getBookingViewData,
  getProfileViewData,
  getWorkspaceViewData,
  getAdminDashboardData,
  getCoachClassViewData,
  getCoachScheduleViewData,
  distributeAsset,
  createBooking,
  cancelBooking,
  writeOffBooking,
  createCoachSchedule,
}
