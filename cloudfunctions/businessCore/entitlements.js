const { businessDate } = require('./request-policy')
function unlimitedAt(asset, day = businessDate()) {
  return Boolean(asset && !asset.is_deleted && asset.unlimited_expiry_date && asset.unlimited_expiry_date >= day && (!asset.unlimited_start_date || day >= asset.unlimited_start_date))
}
function chargeFor(asset, day = businessDate()) {
  if (!asset || asset.is_deleted) throw new Error('尚未获得此类型课时，请联系场馆购课')
  if (unlimitedAt(asset, day)) return { charge_mode: 'unlimited', charged_count: 0, unlimited_grant_id: asset.last_unlimited_distribution_id || '', entitlement_start_date: asset.unlimited_start_date || '', entitlement_expiry_date: asset.unlimited_expiry_date }
  if (asset.expiry_date && asset.expiry_date < day) throw new Error('权益在训练日期已到期，请联系场馆续课')
  if (Number(asset.balance || 0) < 1) throw new Error('该类型课时已用完，请联系场馆续课')
  return { charge_mode: 'count', charged_count: 1, entitlement_expiry_date: asset.expiry_date || '' }
}
function refundCount(booking) { return booking.charge_mode === 'unlimited' ? 0 : booking.charged_count === 0 ? 0 : 1 }
module.exports = { unlimitedAt, chargeFor, refundCount }
