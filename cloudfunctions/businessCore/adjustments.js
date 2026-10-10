const crypto = require('crypto')
const { parseBusinessTime, businessDate } = require('./request-policy')
const { refundCount } = require('./entitlements')

module.exports = function createAdjustments({ db, collections: C, getDocById, listAllCollection, runBusinessTransaction, buildSuccess, buildFail }) {
  const doc = async (name, id, database = db) => (await getDocById(name, id, database)).data
  const id = value => crypto.createHash('sha256').update(value).digest('hex')
  const auditId = value => 'adjust_' + id(value)
  const stamp = () => db.serverDate()
  const active = rows => rows.filter(row => !row.is_deleted && ![3, 4].includes(Number(row.status)))
  const snapshot = s => ({ coach_id: s.coach_id, title: s.title, start_time: s.start_time, end_time: s.end_time, max_capacity: Number(s.max_capacity), status: Number(s.status), booked_count: Number(s.booked_count || 0) })
  const version = s => id(JSON.stringify([snapshot(s), Number(s.booking_revision || 0), Number(s.change_revision || 0), Number(s.writeoff_revision || 0)]))
  const assetSnapshot = a => ({ unlimited_start_date: a && a.unlimited_start_date || '', unlimited_expiry_date: a && a.unlimited_expiry_date || '', unlimited_usage_version: Number(a && a.unlimited_usage_version || 0), balance: Number(a && a.balance || 0), total_earned: Number(a && a.total_earned || 0), expiry_date: a && a.expiry_date || '', is_deleted: Boolean(a && a.is_deleted), exists: Boolean(a) })
  const reasonOf = payload => {
    const reason = String(payload.reason || '').trim()
    if (!reason || reason.length > 200) throw new Error('请填写操作原因，最多 200 字')
    return reason
  }
  function assertSchedule(s, operator) {
    if (!s || s.is_deleted || s.manual_only) throw new Error('训练场次已不存在，请刷新排期')
    if (Number(operator.role) !== 3 && s.coach_id !== operator._id) throw new Error('只能调整自己负责的场次')
  }
  async function roster(s) { return active(await listAllCollection(C.BOOKING, { schedule_id: s._id, is_deleted: false })) }
  async function view(event) {
    try {
      const s = await doc(C.CLASS_SCHEDULE, event.payload.classId)
      assertSchedule(s, event.operator)
      const [rows, users, history] = await Promise.all([roster(s), listAllCollection(C.USER, { is_deleted: false }), listAllCollection(C.USER_ASSET_LOG, { ref_biz_id: s._id, operate_type: 7, is_deleted: false })])
      const people = new Map(users.map(u => [u._id, u]))
      return buildSuccess({ schedule: { id: s._id, ...snapshot(s), storeName: s.store_name || s.venue || '', classType: s.class_type, version: version(s), reason: s.cancel_reason || '', remaining: (s.cancel_pending_ids || []).length, cancelled: Number(s.status) === 4 },
        coaches: users.filter(u => [2, 3].includes(Number(u.role)) && Number(u.status) === 1).map(u => ({ id: u._id, name: u.real_name || u.phone || '场馆人员' })),
        affected: rows.map(b => ({ id: b._id, name: people.get(b.user_id)?.real_name || '学员', phone: people.get(b.user_id)?.phone || '', status: Number(b.status) === 1 ? '待核销' : Number(b.status) === 2 ? '已核销' : '已缺席' })),
        history: history.sort((a, b) => parseBusinessTime(b.created_at) - parseBusinessTime(a.created_at)).slice(0, 20).map(l => ({ id: l._id, reason: l.reason, operatorName: people.get(l.operator_id)?.real_name || '场馆人员', beforeCoachName: people.get(l.before_schedule?.coach_id)?.real_name || '场馆人员', afterCoachName: people.get(l.after_schedule?.coach_id)?.real_name || '场馆人员', before: l.before_schedule, after: l.after_schedule, time: businessDate(l.created_at) })) })
    } catch (e) { return buildFail(e.message, 'SCHEDULE_ADJUST_VIEW_ERROR') }
  }
  async function update(event) {
    const p = event.payload
    try {
      const reason = reasonOf(p)
      const start = parseBusinessTime(p.startTime), end = parseBusinessTime(p.endTime), capacity = Number(p.capacity)
      if (!p.title || String(p.title).trim().length > 60) throw new Error('请填写训练主题，最多 60 字')
      if (!Number.isFinite(start) || !Number.isFinite(end) || start <= Date.now() || end <= start) throw new Error('请选择未来的训练时间，结束时间应晚于开始时间')
      if (!Number.isInteger(capacity) || capacity < 1 || capacity > 100) throw new Error('预约人数应为 1 至 100 的整数')
      const result = await runBusinessTransaction(async tx => {
        const s = await doc(C.CLASS_SCHEDULE, p.classId, tx)
        assertSchedule(s, event.operator)
        const receipt = await doc(C.USER_ASSET_LOG, auditId('schedule:' + s._id + ':' + p.version), tx)
        if (receipt) {
          if (receipt.reason !== reason || receipt.after_schedule.coach_id !== p.coachId || receipt.after_schedule.start_time !== p.startTime || receipt.after_schedule.end_time !== p.endTime || receipt.after_schedule.title !== String(p.title).trim() || receipt.after_schedule.max_capacity !== capacity) throw new Error('这次请求已用于其他调整，请刷新后重试')
          return { repeated: true }
        }
        if (version(s) !== p.version) throw new Error('排课或预约名单已变化，请刷新并重新核对')
        if (Number(s.status) === 4 || parseBusinessTime(s.start_time) <= Date.now()) throw new Error('已开始或已取消的场次不能修改')
        if (Number(s.class_type) === 2 && capacity !== 1) throw new Error('私教场次人数必须为 1')
        if (Number(event.operator.role) !== 3 && p.coachId !== s.coach_id) throw new Error('更换教练需要管理员权限')
        const coach = await doc(C.USER, p.coachId, tx)
        if (!coach || coach.is_deleted || Number(coach.status) !== 1 || ![2, 3].includes(Number(coach.role))) throw new Error('请选择可排课的场馆人员')
        const rows = await roster(s)
        if (rows.some(b => Number(b.status) !== 1)) throw new Error('场次已有核销或缺席记录，请先纠正到场状态')
        if (capacity < rows.length) throw new Error('人数上限不能小于当前预约人数')
        const newDay = businessDate(p.startTime)
        if (rows.some(b => (b.entitlement_start_date && newDay < b.entitlement_start_date) || (b.entitlement_expiry_date && newDay > b.entitlement_expiry_date))) throw new Error('调整后的训练日期超出客户预约权益期限，请先核对套餐')
        const other = await listAllCollection(C.CLASS_SCHEDULE, { coach_id: p.coachId, is_deleted: false })
        if (other.some(o => o._id !== s._id && !o.manual_only && Number(o.status) !== 4 && parseBusinessTime(o.start_time) < end && parseBusinessTime(o.end_time) > start)) throw new Error('与该教练已有排课时间重叠，请调整时间')
        await tx.collection(C.USER).doc(p.coachId).update({ data: { schedule_revision: db.command.inc(1) } })
        if (s.coach_id !== p.coachId) { await doc(C.USER, s.coach_id, tx); await tx.collection(C.USER).doc(s.coach_id).update({ data: { schedule_revision: db.command.inc(1) } }) }
        const after = { ...snapshot(s), title: String(p.title).trim(), coach_id: p.coachId, start_time: p.startTime, end_time: p.endTime, max_capacity: capacity, status: rows.length >= capacity ? 2 : 1, booked_count: rows.length }
        await tx.collection(C.CLASS_SCHEDULE).doc(s._id).update({ data: { ...after, change_reason: reason, change_revision: db.command.inc(1), updated_at: stamp() } })
        await tx.collection(C.USER_ASSET_LOG).doc(auditId('schedule:' + s._id + ':' + p.version)).set({ data: { operate_type: 7, operator_id: event.operator._id, store_id: s.store_id, ref_biz_id: s._id, reason, before_schedule: snapshot(s), after_schedule: after, affected_user_ids: rows.map(b => b.user_id), created_at: stamp(), is_deleted: false } })
        return { affectedCount: rows.length }
      })
      return buildSuccess({ ...result, message: '排课已修改，已有预约已同步更新' })
    } catch (e) { return buildFail(e.message, 'UPDATE_SCHEDULE_ERROR') }
  }
  async function cancel(event) {
    const p = event.payload
    try {
      const reason = reasonOf(p)
      await runBusinessTransaction(async tx => {
        const s = await doc(C.CLASS_SCHEDULE, p.classId, tx)
        assertSchedule(s, event.operator)
        if (Number(s.status) === 4) return
        if (version(s) !== p.version) throw new Error('排课或预约名单已变化，请刷新并重新核对')
        if (parseBusinessTime(s.start_time) <= Date.now()) throw new Error('已开始的场次不能取消，请先核对训练记录')
        const rows = await roster(s)
        if (rows.some(b => Number(b.status) !== 1)) throw new Error('场次已有核销或缺席记录，请先纠正到场状态')
        await tx.collection(C.CLASS_SCHEDULE).doc(s._id).update({ data: { status: 4, cancel_reason: reason, cancel_operator_id: event.operator._id, cancel_pending_ids: rows.map(b => b._id), cancel_total: rows.length, cancel_time: stamp(), change_revision: db.command.inc(1), updated_at: stamp() } })
        await tx.collection(C.USER_ASSET_LOG).doc(auditId('cancel:' + s._id)).set({ data: { operate_type: 7, operator_id: event.operator._id, store_id: s.store_id, ref_biz_id: s._id, reason, before_schedule: snapshot(s), after_schedule: { ...snapshot(s), status: 4 }, affected_user_ids: rows.map(b => b.user_id), created_at: stamp(), is_deleted: false } })
      })
      // 每批最多 10 人，保持在云数据库 100 次事务操作限制以内；进度保存在场次中。
      const result = await runBusinessTransaction(async tx => {
        const s = await doc(C.CLASS_SCHEDULE, p.classId, tx)
        const pending = s.cancel_pending_ids || []
        for (const bookingId of pending.slice(0, 10)) {
          const b = await doc(C.BOOKING, bookingId, tx)
          if (!b || Number(b.status) !== 1) throw new Error('退课名单状态异常，请联系管理员核对')
          const assetId = b.user_id + '_' + Number(s.class_type)
          const a = await doc(C.USER_ASSET, assetId, tx)
          if (!a || a.is_deleted) throw new Error('客户权益记录不可用，退课未完成，请联系管理员')
          const refund = refundCount(b), after = Number(a.balance || 0) + refund
          await tx.collection(C.USER_ASSET).doc(assetId).update({ data: { balance: after, updated_at: stamp() } })
          await tx.collection(C.BOOKING).doc(b._id).update({ data: { status: 4, cancel_reason: s.cancel_reason, updated_at: stamp() } })
          await tx.collection(C.USER_ASSET_LOG).doc(auditId('refund:' + b._id)).set({ data: { operate_type: 4, user_id: b.user_id, asset_type: Number(s.class_type), amount: refund, charge_mode: b.charge_mode || 'count', before_balance: Number(a.balance || 0), after_balance: after, operator_id: s.cancel_operator_id, ref_biz_id: s._id, booking_id: b._id, store_id: s.store_id, reason: s.cancel_reason, remark: '场馆取消退课', created_at: stamp(), is_deleted: false } })
        }
        const remaining = pending.slice(10)
        await tx.collection(C.CLASS_SCHEDULE).doc(s._id).update({ data: { cancel_pending_ids: remaining, booked_count: remaining.length, booking_revision: db.command.inc(1), updated_at: stamp() } })
        return { remaining: remaining.length, total: Number(s.cancel_total || 0), complete: remaining.length === 0 }
      })
      return buildSuccess({ ...result, message: result.complete ? '场次已取消，预约课时已全部退回' : '场次已取消，正在继续退课' })
    } catch (e) { return buildFail(e.message, 'CANCEL_SCHEDULE_ERROR') }
  }
  async function records(event) {
    try {
      const storeId = event.payload.storeId
      if (!storeId) throw new Error('请先选择门店')
      const [logs, bookings, schedules, users, assets] = await Promise.all([listAllCollection(C.USER_ASSET_LOG, { store_id: storeId, is_deleted: false }), listAllCollection(C.BOOKING, { is_deleted: false }), listAllCollection(C.CLASS_SCHEDULE, { store_id: storeId, is_deleted: false }), listAllCollection(C.USER, { is_deleted: false }), listAllCollection(C.USER_ASSET, { is_deleted: false })])
      const people = new Map(users.map(u => [u._id, u])), slots = new Map(schedules.map(s => [s._id, s])), balances = new Map(assets.map(a => [a._id, a]))
      const distribution = logs.filter(l => Number(l.operate_type) === 1).map(l => ({ id: l._id, kind: 'distribution', title: l.package_name || '历史套餐', unlimited: l.usage_mode === 'unlimited', userName: people.get(l.user_id)?.real_name || '学员', operatorName: people.get(l.operator_id)?.real_name || '场馆人员', time: businessDate(l.created_at), amount: Number(l.amount), balance: Number(balances.get(l.user_id + '_' + l.asset_type)?.balance || 0), version: 0, projectedBalance: l.balance_reset ? l.before_asset?.balance : Number(balances.get(l.user_id + '_' + l.asset_type)?.balance || 0) - Number(l.amount), reversed: Boolean(l.reversed), eligible: !l.reversed && Boolean(l.before_asset && l.after_asset), hint: l.reversed ? '已撤销' : l.usage_mode === 'unlimited' ? '撤销将恢复原无限次有效期，次数余额保持不变' : !l.before_asset ? '旧记录缺少余额快照，无法自动撤销' : '撤销将扣回本次派发的课时，线下款项需另行核对' }))
      const writeoffs = bookings.filter(b => slots.has(b.schedule_id) && [2, 5].includes(Number(b.status))).map(b => ({ id: b._id, kind: 'writeoff', title: slots.get(b.schedule_id).title, userName: people.get(b.user_id)?.real_name || '学员', operatorName: people.get(b.writeoff_operator_id)?.real_name || '场馆人员', time: businessDate(b.writeoff_time), version: Number(b.writeoff_version || 0), amount: b.source === 'manual' ? refundCount(b) : 0, balance: Number(balances.get(b.user_id + '_' + slots.get(b.schedule_id).class_type)?.balance || 0), eligible: Number(slots.get(b.schedule_id).status) !== 4, hint: b.source === 'manual' ? (refundCount(b) ? '撤销人工核销，退回 1 课时并作废训练记录' : '作废人工训练记录，无限次权益保持不变') : '恢复待核销状态，不重复退课' }))
      return buildSuccess({ records: [...distribution, ...writeoffs].sort((a, b) => String(b.time).localeCompare(String(a.time))).slice(0, 100), history: logs.filter(l => Number(l.operate_type) === 6).sort((a, b) => parseBusinessTime(b.created_at) - parseBusinessTime(a.created_at)).slice(0, 30).map(l => ({ id: l._id, title: l.correction_kind === 'distribution' ? '撤销派发' : '撤销核销', userName: people.get(l.user_id)?.real_name || '学员', operatorName: people.get(l.operator_id)?.real_name || '管理员', reason: l.reason, beforeBalance: l.before_balance, afterBalance: l.after_balance, time: businessDate(l.created_at) })) })
    } catch (e) { return buildFail(e.message, 'CORRECTION_VIEW_ERROR') }
  }
  async function reverse(event) {
    const p = event.payload
    try {
      const reason = reasonOf(p)
      if (!['distribution', 'writeoff'].includes(p.kind) || !p.id || !Number.isInteger(p.version) || p.version < 0) throw new Error('请选择有效的纠错记录')
      const result = await runBusinessTransaction(async tx => {
        const receiptId = auditId('reverse:' + p.kind + ':' + p.id + ':' + p.version)
        const receipt = await doc(C.USER_ASSET_LOG, receiptId, tx)
        if (receipt) return { repeated: true, beforeBalance: receipt.before_balance, afterBalance: receipt.after_balance }
        let target, s, userId, assetType, delta, beforeStatus, afterStatus
        if (p.kind === 'distribution') {
          target = await doc(C.USER_ASSET_LOG, p.id, tx)
          if (!target || target.is_deleted || Number(target.operate_type) !== 1) throw new Error('派发记录已不存在，请刷新')
          if (target.reversed) throw new Error('该派发已经撤销，请刷新记录')
          if (!target.before_asset || !target.after_asset) throw new Error('旧记录缺少余额快照，无法自动撤销')
          userId = target.user_id; assetType = Number(target.asset_type); delta = -Number(target.amount)
        } else {
          target = await doc(C.BOOKING, p.id, tx)
          if (!target || target.is_deleted || ![2, 5].includes(Number(target.status)) || Number(target.writeoff_version || 0) !== p.version) throw new Error('到场状态已变化，请刷新后重新核对')
          s = await doc(C.CLASS_SCHEDULE, target.schedule_id, tx)
          if (!s || Number(s.status) === 4) throw new Error('场次已取消，不能再撤销核销')
          userId = target.user_id; assetType = Number(s.class_type); delta = target.source === 'manual' ? refundCount(target) : 0
          beforeStatus = Number(target.status); afterStatus = target.source === 'manual' ? 4 : 1
        }
        const assetId = userId + '_' + assetType, a = await doc(C.USER_ASSET, assetId, tx)
        if (!a || a.is_deleted) throw new Error('客户权益记录不可用，请先核对客户档案')
        const beforeBalance = Number(a.balance || 0)
        let afterBalance = beforeBalance + delta, expiry = a.expiry_date || '', earned = Number(a.total_earned || 0), deleted = Boolean(a.is_deleted), unlimitedExpiry = a.unlimited_expiry_date || ''
        if (afterBalance < 0) throw new Error('当前课时不足以撤销本次派发，请先核对已使用课时')
        if (p.kind === 'distribution') {
          const old = target.before_asset, granted = target.after_asset
          if (target.usage_mode === 'unlimited') {
            if (a.last_unlimited_distribution_id !== target._id) throw new Error('请先撤销较新的无限次派发记录')
            if (Number(a.unlimited_usage_version || 0) !== Number(granted.unlimited_usage_version || 0)) throw new Error('无限次权益已用于预约或核销，请先核对训练记录')
            unlimitedExpiry = old.unlimited_expiry_date || ''
          }
          if (target.balance_reset) {
            if (a.last_distribution_id !== target._id || beforeBalance !== granted.balance) throw new Error('本次续课已有后续使用或派发，不能直接撤销')
            afterBalance = old.balance
            deleted = Boolean(old.is_deleted)
          }
          if (old.expiry_date !== granted.expiry_date) {
            if (a.last_distribution_id !== target._id) throw new Error('后续派发已改变有效期，请先撤销较新的派发记录')
            expiry = old.expiry_date
          }
          earned = Math.max(0, earned - Number(target.amount))
          await tx.collection(C.USER_ASSET_LOG).doc(target._id).update({ data: { reversed: true, reversal_id: receiptId, reversal_reason: reason, reversed_by: event.operator._id, reversed_at: stamp() } })
        } else {
          if (target.last_manual_receipt_id) {
            const manualReceipt = await doc(C.USER_ASSET_LOG, target.last_manual_receipt_id, tx)
            if (manualReceipt && Number(manualReceipt.writeoff_version) === Number(target.writeoff_version)) await tx.collection(C.USER_ASSET_LOG).doc(manualReceipt._id).update({ data: { reversed: true, reversal_id: receiptId, reversed_by: event.operator._id, reversal_reason: reason, reversed_at: stamp() } })
          }
          await tx.collection(C.BOOKING).doc(target._id).update({ data: { status: afterStatus, writeoff_time: null, writeoff_operator_id: '', reversal_reason: reason, last_reversal_id: receiptId, updated_at: stamp() } })
          const removed = target.source === 'manual' ? 1 : 0
          await tx.collection(C.CLASS_SCHEDULE).doc(s._id).update({ data: { booked_count: Math.max(0, Number(s.booked_count || 0) - removed), booking_revision: db.command.inc(1), status: s.manual_only ? 4 : removed && Number(s.status) === 2 ? 1 : s.status, updated_at: stamp() } })
        }
        await tx.collection(C.USER_ASSET).doc(assetId).update({ data: { balance: afterBalance, expiry_date: expiry, unlimited_expiry_date: unlimitedExpiry, total_earned: earned, is_deleted: deleted, ...(p.kind === 'distribution' && target.usage_mode === 'unlimited' ? { unlimited_start_date: target.before_asset.unlimited_start_date || '', last_unlimited_distribution_id: target.previous_unlimited_distribution_id || '' } : {}), ...(p.kind === 'distribution' && a.last_distribution_id === target._id ? { last_distribution_id: target.previous_distribution_id || '' } : {}), updated_at: stamp() } })
        await tx.collection(C.USER_ASSET_LOG).doc(receiptId).set({ data: { operate_type: 6, correction_kind: p.kind, user_id: userId, asset_type: assetType, amount: afterBalance - beforeBalance, before_balance: beforeBalance, after_balance: afterBalance, before_asset: assetSnapshot(a), after_asset: { ...assetSnapshot(a), unlimited_start_date: p.kind === 'distribution' && target.usage_mode === 'unlimited' ? target.before_asset.unlimited_start_date || '' : a.unlimited_start_date || '', unlimited_expiry_date: unlimitedExpiry, balance: afterBalance, expiry_date: expiry, total_earned: earned, is_deleted: deleted }, before_status: beforeStatus || 0, after_status: afterStatus || 0, operator_id: event.operator._id, store_id: s ? s.store_id : target.store_id, ref_biz_id: p.id, reason, created_at: stamp(), is_deleted: false } })
        return { beforeBalance, afterBalance }
      })
      return buildSuccess({ ...result, message: '操作已撤销，余额与审计记录已更新' })
    } catch (e) { return buildFail(e.message, 'REVERSE_OPERATION_ERROR') }
  }
  return { getScheduleAdjustmentData: view, updateCoachSchedule: update, cancelCoachSchedule: cancel, getCorrectionRecords: records, reverseOperation: reverse }
}
