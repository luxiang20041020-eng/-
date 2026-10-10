const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')

function fixture(overrides = {}) {
  let definition, writes = 0, confirmations = 0
  const feedback = []
  const runtime = { isAuthenticated: true, role: 'admin', currentStore: { id: 'gaoxin' } }
  const scheduleData = { schedule: { version: 'v1', title: '课程', start_time: '2099-01-01 19:00:00', end_time: '2099-01-01 20:00:00', max_capacity: 15, coach_id: 'coach', cancelled: false }, affected: [{ id: 'b1', name: '客户' }], coaches: [{ id: 'coach', name: '教练' }] }
  const api = { getScheduleAdjustmentData: async () => scheduleData, cancelCoachSchedule: async () => { writes++; return { complete: true, remaining: 0, message: '完成' } }, reverseOperation: async () => { writes++; return { message: '已撤销' } }, ...overrides }
  const app = { getRuntimeSnapshotAsync: async () => runtime, removeViewCacheByPrefix() {} }
  vm.runInNewContext(fs.readFileSync('miniprogram/pages/workspace/adjust/index.js', 'utf8'), { Page(value) { definition = value }, getApp: () => app, require(name) {
    if (name.endsWith('page-state')) return value => value
    if (name.endsWith('business-api')) return api
    if (name.endsWith('interaction')) return { confirmAction: async () => { confirmations++; return overrides.confirmed !== false }, showFeedback: value => feedback.push(value), reLaunch() {} }
    if (name.endsWith('user-feedback')) return { getUserMessage: e => e.message }
    throw new Error(name)
  } })
  const page = { ...definition, data: { ...definition.data, pageData: scheduleData, classId: 'slot', mode: 'schedule', runtime, reason: '教练请假' }, setData(patch) { Object.assign(this.data, patch) } }
  return { page, api, runtime, feedback, count: () => ({ writes, confirmations }) }
}
test('未填写原因或未确认时不取消场次，并释放按钮状态', async () => {
  const first = fixture(); first.page.data.reason = ' '
  await first.page.onCancelSchedule(); assert.equal(first.count().writes, 0); assert.equal(first.feedback.length, 1)
  const second = fixture({ confirmed: false })
  await second.page.onCancelSchedule(); assert.equal(second.count().writes, 0); assert.equal(second.page.data.submitting, false)
})
test('取消自动完成多批退课，沿用同一确认版本和原因', async () => {
  const calls = [], f = fixture({ cancelCoachSchedule: async payload => { calls.push(payload); return { complete: calls.length === 3, remaining: 30 - calls.length * 10, message: '完成' } } })
  await f.page.onCancelSchedule()
  assert.equal(calls.length, 3); assert.equal(f.count().confirmations, 1)
  for (const payload of calls) { assert.equal(payload.version, 'v1'); assert.equal(payload.reason, '教练请假') }
  assert.equal(f.page.data.submitting, false)
})
test('退课故障显示具体原因并重新读取服务器进度，不假定已经完成', async () => {
  const f = fixture({ cancelCoachSchedule: async () => { throw new Error('网络连接中断，请刷新后继续退课') }, getScheduleAdjustmentData: async () => ({ schedule: { version: 'v2', title: '课程', start_time: '2099-01-01 19:00:00', end_time: '2099-01-01 20:00:00', max_capacity: 15, coach_id: 'coach', cancelled: true, remaining: 2, reason: '教练请假' }, affected: [], coaches: [] }) })
  await f.page.onCancelSchedule()
  assert.match(f.feedback[0].title, /网络连接中断/)
  assert.equal(f.page.data.pageData.schedule.remaining, 2)
  assert.equal(f.page.data.submitting, false)
})
test('普通预约核销纠错预览余额不增加，撤销派发预览准确扣回课时', () => {
  const f = fixture()
  f.page.data.pageData.records = [{ id: 'w', kind: 'writeoff', eligible: true, balance: 8, amount: 0 }, { id: 'g', kind: 'distribution', eligible: true, balance: 12, amount: 5 }]
  f.page.onSelectRecord({ currentTarget: { dataset: { id: 'w', kind: 'writeoff' } } }); assert.equal(f.page.data.selectedRecord.projectedBalance, 8)
  f.page.onSelectRecord({ currentTarget: { dataset: { id: 'g', kind: 'distribution' } } }); assert.equal(f.page.data.selectedRecord.projectedBalance, 7)
})
test('普通教练不能打开管理员纠错列表或更换场次教练', async () => {
  const f = fixture(); f.runtime.role = 'coach'; f.page.data.mode = 'records'
  await f.page.syncPageData(); assert.match(f.page.data.pageError, /管理员权限/)
  f.page.data.coachId = 'original'; f.page.onCoachChange({ detail: { value: 0 } }); assert.equal(f.page.data.coachId, 'original')
})
