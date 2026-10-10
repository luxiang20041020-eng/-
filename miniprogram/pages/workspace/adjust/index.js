const withPageState = require('../../../utils/page-state')
const api = require('../../../utils/business-api')
const { confirmAction, showFeedback, reLaunch } = require('../../../utils/interaction')
const { getUserMessage } = require('../../../utils/user-feedback')

Page(withPageState({
  data: { runtime: {}, pageData: { affected: [], coaches: [], records: [], history: [] }, mode: 'records', classId: '', storeId: '', submitting: false, reason: '', title: '', date: '', startTime: '', endTime: '', capacity: '', coachId: '', coachIndex: 0, selectedRecord: null, progress: '' },
  onLoad(options) { this.setData({ classId: options.classId || '', storeId: options.storeId || '', mode: options.classId ? 'schedule' : 'records' }) },
  onShow() { this.syncPageData() },
  async syncPageData() {
    const request = (this._syncRequestId || 0) + 1
    this._syncRequestId = request
    const runtime = await getApp().getRuntimeSnapshotAsync()
    if (request !== this._syncRequestId) return
    if (!runtime.isAuthenticated) { reLaunch({ url: '/pages/login/index' }); return }
    this.setData({ runtime })
    if (this.data.mode === 'records' && runtime.role !== 'admin') { this.setData({ pageError: '此操作需要管理员权限' }); return }
    try {
      const pageData = this.data.mode === 'schedule' ? await api.getScheduleAdjustmentData({ classId: this.data.classId }) : await api.getCorrectionRecords({ storeId: this.data.storeId || runtime.currentStore.id })
      if (request !== this._syncRequestId) return
      const s = pageData.schedule
      this.setData({ pageData, pageError: '', ...(s ? { title: s.title, date: s.start_time.slice(0, 10), startTime: s.start_time.slice(11, 16), endTime: s.end_time.slice(11, 16), capacity: String(s.max_capacity), coachId: s.coach_id, coachIndex: Math.max(0, pageData.coaches.findIndex(c => c.id === s.coach_id)), reason: s.cancelled ? s.reason : '' } : {}) })
    } catch (e) { if (request === this._syncRequestId) this.setData({ pageError: getUserMessage(e, '操作资料暂时无法读取，请刷新后重试') }) }
  },
  onInput(e) {
    if (this.data.submitting) return
    const field = e.currentTarget.dataset.field
    if (['reason', 'title', 'capacity'].includes(field)) this.setData({ [field]: e.detail.value })
  },
  onDateChange(e) { if (!this.data.submitting) this.setData({ date: e.detail.value }) },
  onTimeChange(e) { if (!this.data.submitting) this.setData({ [e.currentTarget.dataset.field]: e.detail.value }) },
  onCoachChange(e) {
    if (this.data.submitting || this.data.runtime.role !== 'admin') return
    const index = Number(e.detail.value), coach = this.data.pageData.coaches[index]
    if (coach) this.setData({ coachIndex: index, coachId: coach.id })
  },
  invalidate() {
    const app = getApp()
    for (const prefix of ['workspace:', 'booking:', 'profile:', 'admin:', 'home:']) app.removeViewCacheByPrefix(prefix)
  },
  reasonValid() {
    if (!this.data.reason.trim()) { showFeedback({ title: '请填写操作原因，最多 200 字', icon: 'none' }); return false }
    return true
  },
  async onSaveSchedule() {
    if (this.data.submitting || this.data.pageError || !this.reasonValid()) return
    if (!this.data.title.trim() || !this.data.coachId || this.data.endTime <= this.data.startTime) { showFeedback({ title: '请核对训练主题、教练和起止时间', icon: 'none' }); return }
    this.setData({ submitting: true })
    try {
      const confirmed = await confirmAction({ title: '确认修改排课', contentParts: [this.data.title + '\n' + this.data.date + ' ' + this.data.startTime + ' - ' + this.data.endTime + '\n', { text: '影响 {0} 位客户，已有预约随场次同步更新。', values: [this.data.pageData.affected.length] }, '\n' + this.data.reason.trim()] })
      if (!confirmed) return
      const result = await api.updateCoachSchedule({ classId: this.data.classId, version: this.data.pageData.schedule.version, reason: this.data.reason.trim(), title: this.data.title.trim(), coachId: this.data.coachId, startTime: this.data.date + ' ' + this.data.startTime + ':00', endTime: this.data.date + ' ' + this.data.endTime + ':00', capacity: Number(this.data.capacity) })
      this.invalidate(); showFeedback({ title: result.message, icon: 'success' }); await this.syncPageData()
    } catch (e) { showFeedback({ title: getUserMessage(e, '排课修改未完成，请刷新后核对'), icon: 'none' }) }
    finally { this.setData({ submitting: false }) }
  },
  async onCancelSchedule() {
    if (this.data.submitting || this.data.pageError || !this.reasonValid()) return
    this.setData({ submitting: true })
    try {
      const confirmed = await confirmAction({ title: '确认取消场次', contentParts: [this.data.pageData.schedule.title + '\n', { text: '将退还 {0} 位客户各 1 次课时。', values: [this.data.pageData.affected.length] }, '\n' + this.data.reason.trim()] })
      if (!confirmed) return
      let result
      do {
        result = await api.cancelCoachSchedule({ classId: this.data.classId, version: this.data.pageData.schedule.version, reason: this.data.reason.trim() })
        this.setData({ progress: result.complete ? '' : result.remaining + ' 位客户待退课' })
      } while (!result.complete)
      this.invalidate(); showFeedback({ title: result.message, icon: 'success' }); await this.syncPageData()
    } catch (e) {
      this.invalidate()
      showFeedback({ title: getUserMessage(e, '取消退课未完成，请刷新后继续退课'), icon: 'none' })
      await this.syncPageData()
    } finally { this.setData({ submitting: false, progress: '' }) }
  },
  onSelectRecord(e) {
    if (this.data.submitting) return
    const record = this.data.pageData.records.find(r => r.id === e.currentTarget.dataset.id && r.kind === e.currentTarget.dataset.kind)
    if (record && record.eligible) this.setData({ selectedRecord: { ...record, projectedBalance: record.projectedBalance === undefined ? record.kind === 'distribution' ? record.balance - record.amount : record.balance + record.amount : record.projectedBalance }, reason: '' })
  },
  onCloseRecord() { if (!this.data.submitting) this.setData({ selectedRecord: null, reason: '' }) },
  async onReverse() {
    if (this.data.submitting || !this.data.selectedRecord || !this.reasonValid()) return
    const record = this.data.selectedRecord
    this.setData({ submitting: true })
    try {
      if (!await confirmAction({ title: '确认撤销操作', contentParts: [record.userName + ' · ' + record.title + '\n', { text: record.hint }, '\n' + this.data.reason.trim()] })) return
      const result = await api.reverseOperation({ id: record.id, kind: record.kind, version: record.version, reason: this.data.reason.trim() })
      this.invalidate(); this.setData({ selectedRecord: null, reason: '' }); showFeedback({ title: result.message, icon: 'success' }); await this.syncPageData()
    } catch (e) { showFeedback({ title: getUserMessage(e, '撤销操作未完成，请刷新记录后核对'), icon: 'none' }) }
    finally { this.setData({ submitting: false }) }
  },
}))
