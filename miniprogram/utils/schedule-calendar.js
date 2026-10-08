const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
function dateKey(date) {
  return new Date(date.getTime() + 8 * 3600000).toISOString().slice(0, 10)
}
function fullDateKey(value) {
  if (/[T ].*(?:Z|[+-]\d{2}:?\d{2})$/i.test(String(value || ''))) {
    const instant = new Date(value)
    return Number.isNaN(instant.getTime()) ? '' : dateKey(instant)
  }
  const match = String(value || '').trim().match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:$|[ T])/)
  if (!match) return ''
  const key = match[1] + '-' + match[2].padStart(2, '0') + '-' + match[3].padStart(2, '0')
  const date = new Date(key + 'T12:00:00Z')
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === key ? key : ''
}
function clock(value) {
  if (/[T ].*(?:Z|[+-]\d{2}:?\d{2})$/i.test(String(value || ''))) {
    const instant = new Date(value)
    return Number.isNaN(instant.getTime()) ? '' : new Date(instant.getTime() + 8 * 3600000).toISOString().slice(11, 16)
  }
  const match = String(value || '').trim().match(/(?:^|[ T])(\d{1,2}):(\d{2})/)
  return match ? match[1].padStart(2, '0') + ':' + match[2] : ''
}
function normalizePlan(plan) {
  const fullDate = [plan.fullDate, plan.start_time, plan.startTime, plan.dateKey, plan.dateLabel].map(fullDateKey).find(Boolean) || ''
  const times = String(plan.timeRange || '').split(/\s*[-–—~]\s*/)
  const startTime = clock(plan.startTime || plan.start_time || times[0])
  const endTime = clock(plan.endTime || plan.end_time || times[1])
  return Object.assign({}, plan, { fullDate, startTime, endTime })
}
function parseDate(key) { return new Date(key + 'T12:00:00Z') }
function shiftDate(key, days) {
  const date = parseDate(key)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}
function repeatDates(key, repeat) { return Array.from({ length: repeat ? 4 : 1 }, (_, i) => shiftDate(key, i * 7)) }
function calendar(plans, selected, type = 'all') {
  const date = parseDate(selected)
  const monday = shiftDate(selected, -((date.getUTCDay() + 6) % 7))
  const active = plans.filter((plan) => plan.status !== '已取消' && (type === 'all' || plan.type === type))
  const days = Array.from({ length: 7 }, (_, i) => {
    const key = shiftDate(monday, i)
    return { key, day: Number(key.slice(8)), label: weekdays[parseDate(key).getUTCDay()], count: active.filter((p) => p.fullDate === key).length }
  })
  const dayPlans = plans.filter((p) => p.fullDate === selected && (type === 'all' || p.type === type))
    .sort((a, b) => String(a.startTime).localeCompare(String(b.startTime)))
  return { days, dayPlans, weekRange: monday.slice(5).replace('-', '/') + ' — ' + days[6].key.slice(5).replace('-', '/'), dayHeading: selected + ' · ' + weekdays[date.getUTCDay()], weekCount: days.reduce((sum, day) => sum + day.count, 0) }
}
function conflicts(plans, date, start, end, repeat) {
  return repeatDates(date, repeat).flatMap((key) => plans.filter((p) => p.status !== '已取消' && p.fullDate === key && p.startTime < end && p.endTime > start))
}
module.exports = { dateKey, fullDateKey, normalizePlan, parseDate, shiftDate, repeatDates, calendar, conflicts }
