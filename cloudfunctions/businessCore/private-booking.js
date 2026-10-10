const crypto = require('crypto')
const { businessDate, parseBusinessTime } = require('./request-policy')
const { chargeFor } = require('./entitlements')
const hash = value => crypto.createHash('sha256').update(value).digest('hex')
function intervalFor(date, start, end) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '') || businessDate(date + ' 00:00:00') !== date) throw new Error('请选择有效的预约日期')
  if (![start, end].every(value => /^([01]\d|2[0-3]):[0-5]\d$/.test(value || ''))) throw new Error('请选择有效的开始和结束时间')
  const startTime = date + ' ' + start + ':00', endTime = date + ' ' + end + ':00'
  if (end <= start || parseBusinessTime(startTime) <= Date.now()) throw new Error('请选择未来时间，结束时间须晚于开始时间')
  return { startTime, endTime }
}
module.exports = function createPrivateBooking({ db, collections: C, getDocById, listAllCollection: list, runBusinessTransaction, lockReservationTimeline, buildSuccess, buildFail }) {
  const doc = async (c, id, tx = db) => (await getDocById(c, id, tx)).data
  async function create(event) {
    const p = event.payload
    try {
      if (!p.storeId || !p.coachId || !/^[\w-]{10,100}$/.test(p.requestId || '')) throw new Error('请先选择教练和预约时间')
      const bookingId = 'private_booking_' + hash(event.operator._id + ':' + p.requestId)
      const fingerprint = JSON.stringify([p.storeId, p.coachId, p.date, p.start, p.end])
      const result = await runBusinessTransaction(async tx => {
        const previous = await doc(C.BOOKING, bookingId, tx)
        if (previous) {
          if (previous.request_fingerprint !== fingerprint) throw new Error('待确认预约参数已变化，请核对原预约')
          return { bookingId, repeated: true, status: Number(previous.status) }
        }
        await lockReservationTimeline(tx)
        const store = await doc(C.STORE, p.storeId, tx), coach = await doc(C.USER, p.coachId, tx), client = await doc(C.USER, event.operator._id, tx)
        if (!store || store.is_deleted || Number(store.status) !== 1) throw new Error('门店已暂停营业，请选择其他门店')
        if (!coach || coach.is_deleted || Number(coach.status) !== 1 || ![2, 3].includes(Number(coach.role))) throw new Error('教练已停用或身份已变化，请重新选择')
        if (!client || client.is_deleted || Number(client.status) !== 1) throw new Error('账号已停用，请联系场馆管理员')
        if (p.date < businessDate() || p.date > businessDate(Date.now() + 6 * 86400000)) throw new Error('专属预约仅支持未来七天，请重新选择日期')
        const schedules = await list(C.CLASS_SCHEDULE, { is_deleted: false })
        const slot = intervalFor(p.date, p.start, p.end)
        if (schedules.some(s => s.coach_id === coach._id && !s.manual_only && Number(s.status) !== 4 && !(s.direct_private && Number(s.booked_count) === 0) && parseBusinessTime(s.start_time) < parseBusinessTime(slot.endTime) && parseBusinessTime(s.end_time) > parseBusinessTime(slot.startTime))) throw new Error('教练在该时间已有训练，请选择其他时间')
        const bookings = await list(C.BOOKING, { user_id: client._id, is_deleted: false })
        const ids = new Set(bookings.filter(b => [1, 2, 5].includes(Number(b.status))).map(b => b.schedule_id))
        if (schedules.some(s => ids.has(s._id) && Number(s.status) !== 4 && parseBusinessTime(s.start_time) < parseBusinessTime(slot.endTime) && parseBusinessTime(s.end_time) > parseBusinessTime(slot.startTime))) throw new Error('你在该时间已有训练预约，请选择其他时间')
        const assetId = client._id + '_2', asset = await doc(C.USER_ASSET, assetId, tx), charge = chargeFor(asset, p.date)
        await tx.collection(C.USER_ASSET).doc(assetId).update({ data: { ...(charge.charged_count ? { balance: db.command.inc(-1) } : { unlimited_usage_version: db.command.inc(1) }), updated_at: db.serverDate() } })
        // 所有排课写入共享教练文档，所有客户预约共享客户文档，冲突重试后重新核对。
        await tx.collection(C.USER).doc(coach._id).update({ data: { schedule_revision: db.command.inc(1) } })
        await tx.collection(C.USER).doc(client._id).update({ data: { booking_revision: db.command.inc(1) } })
        const scheduleId = 'private_class_' + hash(bookingId)
        await tx.collection(C.CLASS_SCHEDULE).doc(scheduleId).set({ data: { store_id: store._id, store_name: store.name, coach_id: coach._id, class_type: 2, title: '专属训练预约', start_time: slot.startTime, end_time: slot.endTime, max_capacity: 1, booked_count: 1, status: 2, direct_private: true, created_by: client._id, booking_revision: 1, created_at: db.serverDate(), updated_at: db.serverDate(), is_deleted: false } })
        await tx.collection(C.BOOKING).doc(bookingId).set({ data: { schedule_id: scheduleId, user_id: client._id, status: 1, ...charge, request_fingerprint: fingerprint, source: 'private_direct', writeoff_time: null, created_at: db.serverDate(), updated_at: db.serverDate(), is_deleted: false } })
        await tx.collection(C.USER_ASSET_LOG).doc('private_log_' + hash(bookingId)).set({ data: { user_id: client._id, asset_type: 2, operate_type: 2, amount: -charge.charged_count, ...charge, operator_id: client._id, store_id: store._id, ref_biz_id: scheduleId, booking_id: bookingId, remark: '客户直接预约专属训练', created_at: db.serverDate(), updated_at: db.serverDate(), is_deleted: false } })
        return { bookingId, scheduleId, chargeMode: charge.charge_mode }
      })
      return buildSuccess({ ...result, message: [3, 4].includes(result.status) ? '原预约已取消，请查看我的预约记录' : '专属训练预约成功，请与教练私下确认训练安排' })
    } catch (e) { return buildFail(e.message, 'CREATE_PRIVATE_BOOKING_ERROR') }
  }
  return { createPrivateBooking: create }
}
