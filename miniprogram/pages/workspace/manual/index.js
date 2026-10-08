const { getUserMessage } = require('../../../utils/user-feedback')
const withPageState = require('../../../utils/page-state')
const businessApi = require('../../../utils/business-api')
const { confirmAction, showFeedback, reLaunch } = require('../../../utils/interaction')

function nowFields() {
  const value = new Date(Date.now() + 8 * 3600000).toISOString()
  return { date: value.slice(0, 10), time: value.slice(11, 16), maxDate: value.slice(0, 10) }
}

Page(withPageState({
  data: { runtime: {}, pageData: { members: [] }, classId: '', keyword: '', selectedMember: null,
    classType: 1, remark: '', submitting: false, pendingRetry: false, resultMessage: '', ...nowFields() },

  onLoad(options) { this.setData({ classId: options.classId || '', ...nowFields() }) },
  onShow() { this.syncPageData() },

  async syncPageData() {
    const requestId = (this._syncRequestId || 0) + 1
    this._syncRequestId = requestId
    const runtime = await getApp().getRuntimeSnapshotAsync()
    if (this._syncRequestId !== requestId) return
    if (!runtime.isAuthenticated) { reLaunch({ url: '/pages/login/index' }); return }
    if (!['coach', 'admin'].includes(runtime.role)) throw new Error('此操作需要场馆人员权限')
    this.setData({ runtime })
    this._storageKey = 'one.manualPending.' + runtime.userProfile.id
    const pending = wx.getStorageSync(this._storageKey)
    if (pending && pending.payload) {
      this._pendingPayload = pending.payload
      this.setData({ pendingRetry: true, classId: pending.payload.classId || '', selectedMember: pending.member,
        classType: pending.payload.classType, remark: pending.payload.remark,
        date: pending.payload.trainingTime.slice(0, 10), time: pending.payload.trainingTime.slice(11, 16) })
    }
    const pageData = await businessApi.getManualWriteOffViewData({ classId: this.data.classId, keyword: this.data.keyword })
    if (this._syncRequestId !== requestId) return
    this.setData({ pageData, classType: pageData.classInfo ? pageData.classInfo.classType : this.data.classType })
  },

  onInput(event) {
    if (this.data.submitting || this.data.pendingRetry) return
    const field = event.currentTarget.dataset.field
    if (['keyword', 'remark'].includes(field)) this.setData({ [field]: event.detail.value, resultMessage: '' })
  },
  onDateTimeChange(event) {
    if (this.data.submitting || this.data.pendingRetry) return
    const field = event.currentTarget.dataset.field
    if (['date', 'time'].includes(field)) this.setData({ [field]: event.detail.value })
  },
  onTypeChange(event) {
    if (this.data.submitting || this.data.pendingRetry || this.data.classId) return
    this.setData({ classType: Number(event.currentTarget.dataset.type) })
  },
  onSelectMember(event) {
    if (this.data.submitting || this.data.pendingRetry) return
    this.setData({ selectedMember: this.data.pageData.members.find((member) => member.id === event.currentTarget.dataset.id), resultMessage: '' })
  },

  async onSubmit() {
    if (this.data.submitting || this.data.pageBusy || this.data.pageError) return
    const member = this.data.selectedMember
    if (!member) { showFeedback({ title: '请先搜索并选择学员', icon: 'none' }); return }
    if (!this.data.classId && new Date(this.data.date + 'T' + this.data.time + ':00+08:00').getTime() > Date.now()) {
      showFeedback({ title: '只能核销已发生的训练', icon: 'none' }); return
    }
    this.setData({ submitting: true, resultMessage: '' })
    try {
      const runtime = await getApp().getRuntimeSnapshotAsync({ force: true })
      if (!runtime.isAuthenticated || !['coach', 'admin'].includes(runtime.role)) throw new Error('请使用场馆人员账号登录')
      if (runtime.userProfile.id !== this.data.runtime.userProfile.id) throw new Error('账号已变更，请重新进入页面')
      if (!this._pendingPayload) {
        const info = this.data.pageData.classInfo
        const typeName = this.data.classType === 1 ? '团课' : '私教课'
        const confirmed = await confirmAction({ title: '确认人工核销', content: member.nickname + ' · ' + member.phone + '\n' +
          (info ? info.title + ' · ' + info.dateLabel + ' ' + info.timeRange : runtime.currentStore.name + ' · ' + this.data.date + ' ' + this.data.time + ' · ' + typeName) + '\n' +
          (info ? '无预约将扣减 1 课时；已有待核销预约则不重复扣课。' : '将扣减 1 节' + typeName + '课时并记录到场。') })
        if (!confirmed) return
        this._pendingPayload = { userId: member.id, classId: this.data.classId, classType: this.data.classType,
          storeId: runtime.currentStore.id, trainingTime: this.data.date + ' ' + this.data.time + ':00', remark: this.data.remark.trim(),
          requestId: 'manual_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 14) }
        // 在发出扣课请求前保存；网络中断或重新进入页面时复用同一请求。
        wx.setStorageSync(this._storageKey, { payload: this._pendingPayload, member })
        this.setData({ pendingRetry: true })
      }
      const result = await businessApi.manualWriteOff(this._pendingPayload)
      wx.removeStorageSync(this._storageKey)
      this._pendingPayload = null
      this.setData({ pendingRetry: false, selectedMember: null, remark: '', resultMessage: result.message })
      for (const prefix of ['workspace:', 'profile:', 'booking:', 'admin:dashboard:', 'admin:users']) getApp().removeViewCacheByPrefix(prefix)
      showFeedback({ title: '核销成功', icon: 'success' })
      this.syncPageData().catch((error) => this.setData({ pageError: getUserMessage(error) }))
    } catch (error) {
      if (error.code && !error.outcomeUnknown && !['NETWORK_ERROR', 'REQUEST_TIMEOUT'].includes(error.code)) {
        wx.removeStorageSync(this._storageKey)
        this._pendingPayload = null
        this.setData({ pendingRetry: false })
      }
      this.setData({ resultMessage: getUserMessage(error, '核销结果未确认，请重试核对') })
      showFeedback({ title: getUserMessage(error, '核销失败，请重试'), icon: 'none' })
    } finally { this.setData({ submitting: false }) }
  },
}))
