const withPageState = require('../../utils/page-state')
const api = require('../../utils/business-api')
const { getUserMessage } = require('../../utils/user-feedback')
const { navigateTo, confirmAction, showFeedback } = require('../../utils/interaction')
Page(withPageState({
  data: { runtime: {}, records: [], filter: 'all', filters: [{ value: 'all', label: '全部' }, { value: 'pending', label: '待到店' }, { value: 'completed', label: '已完成' }, { value: 'cancelled', label: '已取消' }, { value: 'absent', label: '已缺席' }], nextOffset: 0, hasMore: false, loadingMore: false, moreError: '', cancellingBookingId: '' },
  onShow() { this.syncPageData() },
  onHide() { this._recordsRequest = (this._recordsRequest || 0) + 1 },
  onUnload() { this._recordsRequest = (this._recordsRequest || 0) + 1 },
  async syncPageData() {
    const request = (this._recordsRequest || 0) + 1; this._recordsRequest = request
    this.setData({ records: [], nextOffset: 0, hasMore: false, loadingMore: false, moreError: '' })
    const runtime = await getApp().getRuntimeSnapshotAsync()
    if (request !== this._recordsRequest) return
    this.setData({ runtime })
    if (!runtime.isAuthenticated) return
    const result = await api.getMyBookingRecords({ filter: this.data.filter, offset: 0 })
    if (request === this._recordsRequest) this.setData({ records: result.records, nextOffset: result.nextOffset, hasMore: result.hasMore })
  },
  onFilter(event) {
    const filter = event.currentTarget.dataset.filter
    if (!this.data.filters.some(item => item.value === filter) || filter === this.data.filter || this.data.cancellingBookingId) return
    this.setData({ filter }); this.syncPageData()
  },
  onReachBottom() { this.onLoadMore() },
  async onLoadMore() {
    if (!this.data.hasMore || this.data.pageBusy || this.data.pageError || this.data.loadingMore || this.data.cancellingBookingId) return
    const request = this._recordsRequest
    this.setData({ loadingMore: true, moreError: '' })
    try {
      const result = await api.getMyBookingRecords({ filter: this.data.filter, offset: this.data.nextOffset })
      if (request !== this._recordsRequest) return
      const seen = new Set(this.data.records.map(item => item.id))
      this.setData({ records: this.data.records.concat(result.records.filter(item => !seen.has(item.id))), nextOffset: result.nextOffset, hasMore: result.hasMore })
    } catch (error) { if (request === this._recordsRequest) this.setData({ moreError: getUserMessage(error, '预约记录暂时无法读取，请稍后重试') }) }
    finally { if (request === this._recordsRequest) this.setData({ loadingMore: false }) }
  },
  goLogin() { navigateTo({ url: '/pages/login/index?returnTo=profile' }) },
  async onCancel(event) {
    if (this.data.cancellingBookingId || this.data.loadingMore || this.data.pageBusy || this.data.pageError) return
    const booking = this.data.records.find(item => item.id === event.currentTarget.dataset.id)
    if (!booking || !booking.canCancel) return
    const request = this._recordsRequest
    this.setData({ cancellingBookingId: booking.id })
    try {
      if (!await confirmAction({ title: '取消这次训练？', contentParts: [booking.title, '\n' + booking.fullDate + ' ' + booking.timeRange], confirmText: '确认取消' })) return
      if (request !== this._recordsRequest) return
      const result = await api.cancelBooking({ bookingId: booking.id })
      const app = getApp(); app.removeViewCacheByPrefix('booking:'); app.removeViewCacheByPrefix('profile:')
      if (request !== this._recordsRequest) return
      showFeedback({ title: result.message || '已取消，权益已退回', icon: 'success' })
      await this.syncPageData()
    } catch (error) { showFeedback({ title: getUserMessage(error, '取消未完成'), icon: 'none' }) }
    finally { this.setData({ cancellingBookingId: '' }) }
  },
}))
