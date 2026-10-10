const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
function exportFixture(wx = {}) {
  const context = { wx, module: { exports: {} }, require: () => ({ t: value => value }) }
  vm.runInNewContext(fs.readFileSync('miniprogram/utils/report-export.js', 'utf8'), context)
  return context.module.exports
}
function pageFixture(overrides = {}) {
  let definition
  const feedback = [], copied = [], exports = []
  const runtime = { isAuthenticated: true, role: 'admin', currentStore: { id: 's' }, stores: [{ id: 's' }] }
  const customers = Array.from({ length: 75 }, (_, n) => ({ id: 'u' + n, name: '姓名' + n, phone: '0012345678', types: [{ balance: 2, expiry: '2026-12-01' }, { balance: 0, expiry: '' }] }))
  const followup = { store: { name: '门店' }, today: '2026-10-10', thresholds: { expiryDays: 7, lowBalance: 2, inactiveDays: 30 }, customers }
  const exporter = { ...exportFixture(), exportCsv: async rows => { exports.push(rows) }, ...overrides.exporter }
  const api = { getCustomerFollowUpData: async () => followup, getBusinessReportData: async () => ({ payments: [] }), ...overrides.api }
  vm.runInNewContext(fs.readFileSync('miniprogram/pages/admin/reports/index.js', 'utf8'), { Page: value => { definition = value }, getApp: () => ({ getRuntimeSnapshotAsync: async () => runtime }), require(name) {
    if (name.endsWith('page-state')) return v => v
    if (name.endsWith('business-api')) return api
    if (name.endsWith('user-feedback')) return { getUserMessage: (e, fallback) => e.message || fallback }
    if (name.endsWith('interaction')) return { reLaunch() {}, showFeedback: v => feedback.push(v), setClipboardData: v => { copied.push(v.data); v.success() } }
    if (name.endsWith('report-export')) return exporter
    if (name.endsWith('schedule-calendar')) return { dateKey: () => '2026-10-10', shiftDate: () => '2026-09-11' }
    throw Error(name)
  } })
  const page = { ...definition, data: { ...definition.data, runtime, followup, visibleCustomers: customers.slice(0, 30) }, setData(patch) { Object.assign(this.data, patch) } }
  return { page, runtime, feedback, copied, exports, followup }
}
test('CSV uses BOM, escaped quotes and newlines, preserves phone zeros and neutralizes spreadsheet formulas', () => {
  const e = exportFixture(), output = e.csv([['姓名', '0012345678', '=1+1', ' @SUM(A1)', 'a"b\nc', -3]])
  assert.ok(output.startsWith('\ufeff')); assert.ok(output.endsWith('\r\n'))
  assert.ok(output.includes('"\'0012345678"')); assert.ok(output.includes('"\'=1+1"')); assert.ok(output.includes('"a""b\nc"')); assert.ok(output.includes('"-3"'))
  assert.equal(e.tabText([['=CMD()', 'a\tb\nc']]), "'=CMD()\ta b c")
})
test('export writes the complete UTF8 file before opening the file picker; cancellation rejects', async () => {
  const calls = [], e = exportFixture({ env: { USER_DATA_PATH: '/local' }, getFileSystemManager: () => ({ writeFile(o) { calls.push(['write', o]); o.success() } }), shareFileMessage(o) { calls.push(['share', o]); o.fail({ errMsg: 'shareFileMessage:fail cancel' }) } })
  await assert.rejects(e.exportCsv([['客户']], 'followup'), error => /cancel/.test(error.errMsg))
  assert.equal(calls[0][1].encoding, 'utf8'); assert.equal(calls[1][1].filePath, '/local/ONE-customer-followup.csv')
})
test('unsupported file export and storage failures have a copy-table fallback', async () => {
  await assert.rejects(exportFixture().exportCsv([], 'report'), /复制表格/)
  await assert.rejects(exportFixture({ env: { USER_DATA_PATH: '/local' }, getFileSystemManager: () => ({ writeFile(o) { o.success() } }) }).exportCsv([], 'report'), /更新微信/)
  const f = pageFixture({ exporter: { exportCsv: async () => { throw { errMsg: 'storage quota full' } } } })
  await f.page.onExport(); assert.match(f.feedback[0].title, /空间不足/); assert.equal(f.page.data.exporting, false)
})
test('full result is exported beyond the 30 visible customers and clipboard export matches', async () => {
  const f = pageFixture(); await f.page.onExport()
  assert.equal(f.exports[0].filter(row => /^姓名\d/.test(row[0])).length, 75)
  f.page.onCopyTable(); assert.ok(f.copied[0].includes('姓名74'))
})
test('changed filters, changed dates, errors and non-admin roles cannot export stale data', async () => {
  const f = pageFixture(); f.page.data.followupDirty = true; await f.page.onExport(); assert.equal(f.exports.length, 0)
  f.page.data.followupDirty = false; f.page.data.pageError = '失败'; await f.page.onExport(); assert.equal(f.exports.length, 0)
  f.page.data.pageError = ''; f.runtime.role = 'coach'; await f.page.onExport(); assert.equal(f.exports.length, 0)
  f.runtime.role = 'admin'; f.page.data.mode = 'report'; f.page.data.report = {}; f.page.data.reportDirty = true; await f.page.onExport(); assert.equal(f.exports.length, 0)
})
test('latest store request wins when older request finishes later', async () => {
  let finish
  const f = pageFixture({ api: { getCustomerFollowUpData: p => p.storeId === 's' ? new Promise(resolve => { finish = resolve }) : Promise.resolve({ customers: [], store: { name: '新门店' } }) } })
  const first = f.page.syncPageData(); await new Promise(resolve => setImmediate(resolve))
  f.page.data.storeId = 'new'; await f.page.syncPageData(); finish(f.followup); await first
  assert.equal(f.page.data.followup.store.name, '新门店')
})
test('empty thresholds fail validation, failed query keeps export disabled, cancelled export stays quiet', async () => {
  const f = pageFixture(); f.page.data.lowBalance = ''; await f.page.syncPageData(); assert.match(f.page.data.pageError, /跟进阈值/)
  const cancelled = pageFixture({ exporter: { exportCsv: async () => { throw { errMsg: 'share:fail cancel' } } } }); await cancelled.page.onExport()
  assert.equal(cancelled.feedback.length, 0); assert.equal(cancelled.page.data.exporting, false)
})

test('every exported header uses selected language rather than array index', () => {
  const context = { module: { exports: {} }, require: () => ({ t: (value, language = 'en') => require('../../miniprogram/utils/i18n-text').translate(value, language) }) }
  vm.runInNewContext(fs.readFileSync('miniprogram/utils/report-export.js', 'utf8'), context)
  const f = pageFixture(), rows = context.module.exports.followupRows(f.followup)
  assert.equal(rows[0][0], 'Customer follow-up'); assert.equal(rows[0][2], 'Report date')
  assert.equal(rows[5][2], 'Group lesson balance')
})

test('editing filters during a pending query does not enable exporting the old result', async () => {
  let finish
  const f = pageFixture({ api: { getCustomerFollowUpData: () => new Promise(resolve => { finish = resolve }) } })
  const query = f.page.syncPageData(); await new Promise(resolve => setImmediate(resolve))
  f.page.onInput({ currentTarget: { dataset: { field: 'keyword' } }, detail: { value: '新条件' } })
  finish(f.followup); await query
  assert.equal(f.page.data.followupDirty, true); await f.page.onExport(); assert.equal(f.exports.length, 0)
})
