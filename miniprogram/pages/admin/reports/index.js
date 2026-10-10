const withPageState = require('../../../utils/page-state')
const api = require('../../../utils/business-api')
const { getUserMessage } = require('../../../utils/user-feedback')
const { showFeedback, reLaunch, setClipboardData } = require('../../../utils/interaction')
const exporting = require('../../../utils/report-export')
const { dateKey, shiftDate } = require('../../../utils/schedule-calendar')
const today = () => dateKey(new Date())

Page(withPageState({
  data: { runtime: {}, mode: 'followup', storeId: '', storeIndex: 0, filter: 'needs', keyword: '', expiryDays: '7', lowBalance: '2', inactiveDays: '30', settingsOpen: false,
    startDate: today().slice(0, 7) + '-01', endDate: today(), followup: null, report: null, followupDirty: false, reportDirty: false, visibleCustomers: [], visiblePayments: [], customerLimit: 30, paymentLimit: 30, exporting: false },
  onShow() { this.syncPageData() },
  async syncPageData() {
    const request = (this._syncRequestId || 0) + 1
    this._syncRequestId = request
    const runtime = await getApp().getRuntimeSnapshotAsync()
    if (request !== this._syncRequestId) return
    if (!runtime.isAuthenticated) { reLaunch({ url: '/pages/login/index' }); return }
    this.setData({ runtime })
    if (runtime.role !== 'admin') { this.setData({ pageError: '此操作需要管理员权限' }); return }
    const storeId = this.data.storeId || runtime.currentStore.id
    this.setData({ storeId, storeIndex: Math.max(0, runtime.stores.findIndex(s => s.id === storeId)) })
    try {
      if (this.data.mode === 'followup') {
        const numeric = field => String(this.data[field]).trim() === '' ? NaN : Number(this.data[field])
        if (!['expiryDays', 'lowBalance', 'inactiveDays'].every(field => Number.isFinite(numeric(field)))) throw new Error('请核对跟进阈值：到期天数 1 至 90，课时 0 至 20，未到店天数 7 至 365')
        const criteria = () => JSON.stringify([this.data.filter, this.data.keyword, this.data.expiryDays, this.data.lowBalance, this.data.inactiveDays])
        const queried = criteria()
        const followup = await api.getCustomerFollowUpData({ storeId, filter: this.data.filter, keyword: this.data.keyword, expiryDays: numeric('expiryDays'), lowBalance: numeric('lowBalance'), inactiveDays: numeric('inactiveDays') })
        if (request !== this._syncRequestId) return
        this.setData({ followup, followupDirty: queried !== criteria(), visibleCustomers: followup.customers.slice(0, this.data.customerLimit), pageError: '' })
      } else {
        const startDate = this.data.startDate, endDate = this.data.endDate
        const report = await api.getBusinessReportData({ storeId, startDate, endDate })
        if (request !== this._syncRequestId) return
        this.setData({ report, reportDirty: startDate !== this.data.startDate || endDate !== this.data.endDate, visiblePayments: report.payments.slice(0, this.data.paymentLimit), pageError: '' })
      }
    } catch (e) { if (request === this._syncRequestId) this.setData({ pageError: getUserMessage(e, '跟进与报表资料暂时无法读取，请稍后重试') }) }
  },
  onMode(e) { if (this.data.exporting) return; const mode = e.currentTarget.dataset.mode; if (!['followup', 'report'].includes(mode)) return; this.setData({ mode }); this.syncPageData() },
  onStore(e) {
    if (this.data.exporting) return
    const index = Number(e.detail.value), store = this.data.runtime.stores[index]
    if (!store) return
    this.setData({ storeId: store.id, storeIndex: index, followup: null, report: null, visibleCustomers: [], visiblePayments: [], customerLimit: 30, paymentLimit: 30 })
    this.syncPageData()
  },
  onFilter(e) { if (this.data.exporting) return; this.setData({ filter: e.currentTarget.dataset.filter, customerLimit: 30 }); this.syncPageData() },
  onInput(e) {
    if (this.data.exporting) return
    const field = e.currentTarget.dataset.field
    if (['keyword', 'expiryDays', 'lowBalance', 'inactiveDays'].includes(field)) this.setData({ [field]: e.detail.value, followupDirty: true })
  },
  onSettings() { this.setData({ settingsOpen: !this.data.settingsOpen }) },
  onDateChange(e) {
    if (this.data.exporting) return
    const field = e.currentTarget.dataset.field
    if (['startDate', 'endDate'].includes(field)) this.setData({ [field]: e.detail.value, reportDirty: true })
  },
  onPreset(e) {
    if (this.data.exporting) return
    const day = today(), preset = e.currentTarget.dataset.preset
    this.setData({ startDate: preset === 'today' ? day : preset === 'month' ? day.slice(0, 7) + '-01' : shiftDate(day, -29), endDate: day })
    this.syncPageData()
  },
  onQuery() { if (!this.data.exporting) this.syncPageData() },
  onMoreCustomers() { const limit = this.data.customerLimit + 30; this.setData({ customerLimit: limit, visibleCustomers: this.data.followup.customers.slice(0, limit) }) },
  onMorePayments() { const limit = this.data.paymentLimit + 30; this.setData({ paymentLimit: limit, visiblePayments: this.data.report.payments.slice(0, limit) }) },
  onCopyPhone(e) { const phone = e.currentTarget.dataset.phone; if (phone) setClipboardData({ data: phone, success: () => showFeedback({ title: '手机号已复制', icon: 'success' }) }) },
  rowsForExport() {
    if (this.data.pageBusy || this.data.pageError || this.data.runtime.role !== 'admin') return null
    if (this.data.mode === 'followup') {
      if (!this.data.followup || this.data.followupDirty) { showFeedback({ title: '筛选条件已变化，请查询后再导出', icon: 'none' }); return null }
      return exporting.followupRows(this.data.followup)
    }
    if (!this.data.report || this.data.reportDirty) { showFeedback({ title: '日期条件已变化，请查询后再导出', icon: 'none' }); return null }
    return exporting.reportRows(this.data.report)
  },
  async onExport() {
    if (this.data.exporting) return
    const rows = this.rowsForExport()
    if (!rows) return
    this.setData({ exporting: true })
    try { await exporting.exportCsv(rows, this.data.mode) }
    catch (e) {
      const raw = String(e.errMsg || e.message || '')
      if (!/cancel|取消/i.test(raw)) showFeedback({ title: /storage.*(?:limit|quota|full)/i.test(raw) ? '手机文件空间不足，请清理后重试' : getUserMessage(e, '报表导出未完成，请复制表格或稍后重试'), icon: 'none' })
    } finally { this.setData({ exporting: false }) }
  },
  onCopyTable() {
    if (this.data.exporting) return
    const rows = this.rowsForExport()
    if (rows) setClipboardData({ data: exporting.tabText(rows), success: () => showFeedback({ title: '已复制，可粘贴到表格', icon: 'success' }) })
  },
}))
