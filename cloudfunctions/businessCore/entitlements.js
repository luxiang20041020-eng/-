const { businessDate } = require('./request-policy')
function unlimitedAt(asset, day = businessDate()) {
  return Boolean(asset && !asset.is_deleted && asset.unlimited_expiry_date && asset.unlimited_expiry_date >= day && (!asset.unlimited_start_date || day >= asset.unlimited_start_date))
}
function chargeFor(asset, day = businessDate()) {
  if (!asset || asset.is_deleted) throw new Error('尚未获得此类型课时，请联系场馆购课')
  if (unlimitedAt(asset, day)) return { charge_mode: 'unlimited', charged_count: 0, unlimited_grant_id: asset.last_unlimited_distribution_id || '', entitlement_start_date: asset.unlimited_start_date || '', entitlement_expiry_date: asset.unlimited_expiry_date }
  if (asset.expiry_date && asset.expiry_date < day) throw new Error('权益在训练日期已到期，请联系场馆续课')
  if (!Number.isSafeInteger(Number(asset.balance || 0)) || Number(asset.balance || 0) < 0) throw new Error('课时余额异常，请联系场馆核对')
  if (Number(asset.balance || 0) < 1) throw new Error('该类型课时已用完，请联系场馆续课')
  return { charge_mode: 'count', charged_count: 1, count_generation: asset.count_generation || '', entitlement_expiry_date: asset.expiry_date || '' }
}
function refundCount(booking) { return booking.charge_mode === 'unlimited' ? 0 : booking.charged_count === 0 ? 0 : 1 }
function refundPlan(booking, asset) {
  const count = refundCount(booking)
  // 过期续费会开启新余额批次；旧预约退款保留为过期课时，不能混入新套餐。
  const expired = count && ((asset.count_generation || '') !== (booking.count_generation || '') || (booking.entitlement_expiry_date && booking.entitlement_expiry_date < businessDate() && (!asset.expiry_date || asset.expiry_date >= businessDate())))
  return { count, balance: expired ? 0 : count, expired: expired ? count : 0 }
}
module.exports = { unlimitedAt, chargeFor, refundCount, refundPlan }
