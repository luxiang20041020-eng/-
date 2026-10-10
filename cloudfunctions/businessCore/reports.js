const { parseBusinessTime, businessDate } = require('./request-policy')
const DAY = 86400000
function validDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) && businessDate(value + ' 00:00:00') === value
}
function dayNumber(value) { return parseBusinessTime(value + ' 00:00:00') / DAY }
function threshold(value, fallback, min, max) {
  const number = value === undefined ? fallback : Number(value)
  if (!Number.isInteger(number) || number < min || number > max) throw new Error('请核对跟进阈值：到期天数 1 至 90，课时 0 至 20，未到店天数 7 至 365')
  return number
}
const money = cents => (cents / 100).toFixed(2)

module.exports = function createReports({ collections: C, listAllCollection: list, buildSuccess, buildFail }) {
  async function load() {
    const [users, assets, logs, schedules, bookings, stores, packages] = await Promise.all([
      list(C.USER, { is_deleted: false }), list(C.USER_ASSET, { is_deleted: false }),
      list(C.USER_ASSET_LOG, { is_deleted: false, operate_type: 1 }), list(C.CLASS_SCHEDULE, { is_deleted: false }),
      list(C.BOOKING, { is_deleted: false }), list(C.STORE, { is_deleted: false }), list(C.PACKAGE, { is_deleted: false }),
    ])
    return { users, assets, logs, schedules, bookings, stores, packages }
  }
  function storeOf(data, storeId) {
    const store = data.stores.find(s => s._id === storeId)
    if (!store) throw new Error('请选择有效的报表门店')
    return { id: store._id, name: store.name || '门店' }
  }
  async function followup(event) {
    try {
      const p = event.payload, expiryDays = threshold(p.expiryDays, 7, 1, 90), lowBalance = threshold(p.lowBalance, 2, 0, 20), inactiveDays = threshold(p.inactiveDays, 30, 7, 365)
      const filter = p.filter || 'needs'
      if (!['needs', 'expiring', 'low', 'inactive', 'all'].includes(filter)) throw new Error('请选择有效的客户筛选条件')
      const data = await load(), store = storeOf(data, p.storeId), today = businessDate(), todayNumber = dayNumber(today)
      const slots = new Map(data.schedules.map(s => [s._id, s])), assets = new Map(data.assets.map(a => [a._id, a])), lastVisits = new Map()
      for (const b of data.bookings) {
        if (Number(b.status) !== 2) continue
        const s = slots.get(b.schedule_id)
        if (!s || Number(s.status) === 4) continue
        const time = parseBusinessTime(b.training_time || s.start_time)
        if (!Number.isFinite(time) || time > Date.now()) continue
        if (!lastVisits.has(b.user_id) || time > lastVisits.get(b.user_id)) lastVisits.set(b.user_id, time)
      }
      const associated = new Set(data.logs.filter(l => l.store_id === p.storeId && !l.reversed).map(l => l.user_id))
      const customers = data.users.filter(u => Number(u.role) === 1 && Number(u.status) === 1 && (u.home_store_id === p.storeId || (!u.home_store_id && associated.has(u._id)))).map(u => {
        let expiring = false, low = false
        const types = [1, 2].map(type => {
          const asset = assets.get(u._id + '_' + type)
          const owned = Boolean(asset && (asset.total_earned === undefined || Number(asset.total_earned) > 0 || Number(asset.balance) > 0))
          const expiry = asset && validDate(asset.expiry_date) ? asset.expiry_date : ''
          const daysLeft = expiry ? dayNumber(expiry) - todayNumber : null
          const expired = daysLeft !== null && daysLeft < 0
          const balance = Number(asset && asset.balance || 0), available = expired ? 0 : balance
          const expiresSoon = owned && balance > 0 && daysLeft !== null && daysLeft >= 0 && daysLeft <= expiryDays
          const isLow = owned && !expired && available <= lowBalance
          expiring ||= expiresSoon; low ||= isLow
          return { type, label: type === 1 ? '团课' : '私教', owned, balance: available, expiry, daysLeft, expiring: expiresSoon, low: isLow, expired }
        })
        const last = lastVisits.get(u._id), joined = businessDate(u.created_at)
        const baseline = last ? businessDate(last) : joined
        const daysInactive = baseline ? Math.max(0, todayNumber - dayNumber(baseline)) : null
        return { id: u._id, name: u.real_name || u.phone || '学员', phone: u.phone || '', types, expiring, low, inactive: daysInactive !== null && daysInactive >= inactiveDays,
          lastVisit: last ? businessDate(last) : '', joined, daysInactive, neverVisited: !last }
      })
      const counts = { all: customers.length, expiring: customers.filter(c => c.expiring).length, low: customers.filter(c => c.low).length, inactive: customers.filter(c => c.inactive).length, needs: customers.filter(c => c.expiring || c.low || c.inactive).length }
      const keyword = String(p.keyword || '').trim().toLowerCase()
      const selected = customers.filter(c => (filter === 'all' || filter === 'needs' ? filter === 'all' || c.expiring || c.low || c.inactive : c[filter]) && (!keyword || c.name.toLowerCase().includes(keyword) || c.phone.includes(keyword)))
        .sort((a, b) => Number(b.expiring) - Number(a.expiring) || Number(b.low) - Number(a.low) || Number(b.daysInactive || 0) - Number(a.daysInactive || 0) || a.id.localeCompare(b.id))
      return buildSuccess({ store, today, thresholds: { expiryDays, lowBalance, inactiveDays }, filter, keyword, counts, customers: selected, total: selected.length })
    } catch (e) { return buildFail(e.message, 'CUSTOMER_FOLLOWUP_ERROR') }
  }
  async function report(event) {
    try {
      const p = event.payload
      if (!validDate(p.startDate) || !validDate(p.endDate) || p.endDate < p.startDate || dayNumber(p.endDate) - dayNumber(p.startDate) > 365) throw new Error('请选择有效日期范围，开始日期不得晚于结束日期，最多 366 天')
      const data = await load(), store = storeOf(data, p.storeId)
      const inRange = day => day && day >= p.startDate && day <= p.endDate
      const users = new Map(data.users.map(u => [u._id, u])), packages = new Map(data.packages.map(s => [s._id, s])), slots = new Map(data.schedules.map(s => [s._id, s]))
      const daily = new Map()
      for (let time = parseBusinessTime(p.startDate + ' 00:00:00'); businessDate(time) <= p.endDate; time += DAY) {
        const date = businessDate(time)
        daily.set(date, { date, incomeCents: 0, payments: 0, renewals: 0, renewalCents: 0, checkins: 0, absences: 0, taught: 0 })
      }
      let incompleteRecords = 0
      const paid = data.logs.filter(l => !l.reversed && Number(l.offline_amount) > 0 && Number.isFinite(Number(l.offline_amount)))
        .sort((a, b) => (parseBusinessTime(a.created_at) || 0) - (parseBusinessTime(b.created_at) || 0) || String(a._id).localeCompare(String(b._id)))
      const seen = new Set(), unknownHistory = new Set(), payments = [], paidCustomers = new Set(), renewalCustomers = new Set()
      for (const l of paid) {
        const type = Number(l.asset_type || packages.get(l.ref_biz_id)?.asset_type), key = l.user_id + ':' + type, date = businessDate(l.created_at)
        if (!date) { unknownHistory.add(key); if (l.store_id === p.storeId) incompleteRecords++; continue }
        const knownType = [1, 2].includes(type)
        const renewal = knownType && seen.has(key), uncertain = !knownType || (!renewal && unknownHistory.has(key))
        if (knownType) seen.add(key)
        if (l.store_id !== p.storeId || !inRange(date)) continue
        const cents = Math.round(Number(l.offline_amount) * 100), day = daily.get(date)
        day.incomeCents += cents; day.payments++; paidCustomers.add(l.user_id)
        if (renewal) { day.renewals++; day.renewalCents += cents; renewalCustomers.add(l.user_id) }
        payments.push({ id: l._id, date, timestamp: parseBusinessTime(l.created_at), userName: users.get(l.user_id)?.real_name || '学员', userId: l.user_id, operatorName: users.get(l.operator_id)?.real_name || '场馆人员',
          packageName: l.package_name || packages.get(l.ref_biz_id)?.name || '历史套餐', type: type === 1 ? '团课' : type === 2 ? '私教' : '未记录', amountText: money(cents), lessons: Number(l.amount || 0), payType: l.pay_type || '未记录', renewal, purchaseLabel: renewal ? '续费' : uncertain ? '历史顺序未确认' : '首次购课' })
      }
      const coaches = new Map()
      function coachFor(id) {
        if (!coaches.has(id)) coaches.set(id, { id, name: users.get(id)?.real_name || '历史教练', scheduled: 0, cancelled: 0, taught: 0, checkins: 0, absences: 0, manualCheckins: 0, minutes: 0 })
        return coaches.get(id)
      }
      const attendedSlots = new Set()
      for (const b of data.bookings) {
        const s = slots.get(b.schedule_id)
        if (!s || s.store_id !== p.storeId || Number(s.status) === 4 || ![2, 5].includes(Number(b.status))) continue
        const time = parseBusinessTime(b.training_time || s.start_time), date = businessDate(time)
        if (!Number.isFinite(time)) { incompleteRecords++; continue }
        if (!inRange(date) || time > Date.now()) continue
        const coach = coachFor(s.coach_id), day = daily.get(date)
        if (Number(b.status) === 2) { coach.checkins++; day.checkins++; if (b.source === 'manual') coach.manualCheckins++; attendedSlots.add(s._id) }
        else { coach.absences++; day.absences++ }
      }
      for (const s of data.schedules) {
        if (s.store_id !== p.storeId || s.manual_only) continue
        const date = businessDate(s.start_time)
        if (!date) { incompleteRecords++; continue }
        if (!inRange(date)) continue
        const coach = coachFor(s.coach_id)
        if (Number(s.status) === 4) { coach.cancelled++; continue }
        coach.scheduled++
        const start = parseBusinessTime(s.start_time), end = parseBusinessTime(s.end_time)
        if (attendedSlots.has(s._id) && Number.isFinite(end) && end <= Date.now() && end >= start) {
          coach.taught++; daily.get(date).taught++; coach.minutes += Math.round((end - start) / 60000)
        }
      }
      const days = [...daily.values()].map(d => ({ ...d, incomeText: money(d.incomeCents), renewalText: money(d.renewalCents) }))
      const sum = field => days.reduce((total, d) => total + Number(d[field]), 0)
      const coachRows = [...coaches.values()].sort((a, b) => b.taught - a.taught || b.checkins - a.checkins || a.id.localeCompare(b.id))
      return buildSuccess({ store, startDate: p.startDate, endDate: p.endDate, generatedAt: new Date().toISOString(), incompleteRecords,
        summary: { incomeText: money(sum('incomeCents')), payments: sum('payments'), paidCustomers: paidCustomers.size, renewals: sum('renewals'), renewalText: money(sum('renewalCents')), renewalCustomers: renewalCustomers.size, checkins: sum('checkins'), absences: sum('absences'), taught: sum('taught') },
        daily: days.reverse(), coaches: coachRows, payments: payments.sort((a, b) => b.timestamp - a.timestamp) })
    } catch (e) { return buildFail(e.message, 'BUSINESS_REPORT_ERROR') }
  }
  return { getCustomerFollowUpData: followup, getBusinessReportData: report }
}
