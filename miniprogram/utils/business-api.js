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
  distributeAsset,
  createBooking,
  cancelBooking,
  writeOffBooking,
  createCoachSchedule,
}
