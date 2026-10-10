const call = (method, options) => new Promise((resolve, reject) => {
  if (typeof wx[method] !== 'function') return reject(new Error('当前微信版本暂不支持定位，请更新微信后重试'))
  wx[method]({ ...options, success: resolve, fail: reject })
})
function coordinate(value, max) {
  if (!['string', 'number'].includes(typeof value) || String(value).trim() === '') return null
  const number = Number(value)
  return Number.isFinite(number) && Math.abs(number) <= max ? number : null
}
function point(value) {
  if (!value) return null
  const latitude = coordinate(value.latitude, 90), longitude = coordinate(value.longitude, 180)
  return latitude === null || longitude === null ? null : { latitude, longitude }
}
function distanceMeters(origin, destination) {
  const a = point(origin), b = point(destination)
  if (!a || !b) return null
  const rad = value => value * Math.PI / 180
  const h = Math.sin(rad(b.latitude - a.latitude) / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(rad(b.longitude - a.longitude) / 2) ** 2
  return 6371000 * 2 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, h))))
}
function decorateStores(stores, origin) {
  return (stores || []).map(store => {
    const coordinates = point(store), distance = distanceMeters(origin, coordinates)
    const gallery = Array.isArray(store.gallery) ? store.gallery : []
    return { ...store, gallery, coverUrl: gallery[0] ? gallery[0].url : '', hasCoordinates: Boolean(coordinates), coordinates,
      mapCircles: coordinates ? [{ ...coordinates, radius: 20, color: '#c7452d', fillColor: '#c7452d66', strokeWidth: 2 }] : [],
      distanceMeters: distance, hasDistance: distance !== null, distanceUnit: distance !== null && distance < 1000 ? 'm' : 'km',
      distanceValue: distance === null ? '' : distance < 1000 ? String(Math.round(distance)) : (distance / 1000).toFixed(1) }
  }).sort((a, b) => origin ? (a.distanceMeters === null ? Infinity : a.distanceMeters) - (b.distanceMeters === null ? Infinity : b.distanceMeters) : 0)
}
async function ensurePrivacy(page) {
  if (!wx.getPrivacySetting) return
  let settings
  try { settings = await call('getPrivacySetting', {}) } catch (_) { throw new Error('隐私授权状态无法确认，请稍后重试') }
  if (settings.needAuthorization) {
    const privacy = page.selectComponent('#mediaPrivacy')
    if (!privacy) throw new Error('隐私授权未完成，请重试')
    await privacy.authorize(settings)
  }
}
function locationError(error) {
  const raw = String(error && (error.errMsg || error.message) || '')
  if (/cancel|取消/i.test(raw)) return Object.assign(new Error('已取消定位，您仍可查看门店地址'), { code: 'LOCATION_CANCELLED' })
  if (/隐私授权状态无法确认|隐私授权未完成/.test(raw)) return new Error(raw)
  if (/privacy agreement|not.*declared|requiredPrivateInfos|api.*permission|api.*not.*available/i.test(raw)) return new Error('距离功能暂未开通，您仍可查看门店地址')
  if (/system.*permission|location service|gps|定位服务|位置服务/i.test(raw)) return new Error('手机定位服务未开启，请在系统设置中开启后重试')
  if (/auth.*deny|auth.*denied|permission|授权|权限/i.test(raw)) return Object.assign(new Error('定位权限未开启，可在设置中开启后查看距离'), { code: 'LOCATION_DENIED' })
  if (/timeout|超时/i.test(raw)) return new Error('定位超时，请到信号良好的位置重试')
  if (/[\u3400-\u9fff]/.test(raw) && !/fail|error|sdk|系统错误/i.test(raw)) return new Error(raw)
  return new Error('暂时无法获取位置，请稍后重试；您仍可查看门店地址')
}
async function locate(page) {
  try {
    await ensurePrivacy(page)
    const result = await call('getLocation', { type: 'gcj02' }), coordinates = point(result)
    if (!coordinates) throw new Error('定位结果不完整，请重试')
    return coordinates
  } catch (error) { throw locationError(error) }
}
async function pickLocation(page) {
  try { await ensurePrivacy(page); return await call('chooseLocation', {}) } catch (error) { throw locationError(error) }
}
module.exports = { point, distanceMeters, decorateStores, locate, pickLocation }
