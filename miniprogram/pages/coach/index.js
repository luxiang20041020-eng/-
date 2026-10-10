const withPageState = require('../../utils/page-state')
const businessApi = require('../../utils/business-api')
const { navigateTo, showFeedback } = require('../../utils/interaction')
const { previewPhotos } = require('../../utils/profile-media')

Page(withPageState({
  data: { coachId: '', coach: null, avatarText: '', unavailable: false },
  onLoad(options) { this.setData({ coachId: options.coachId || '' }) },
  onShow() { this.syncPageData() },
  async syncPageData() {
    const request = (this._syncRequestId || 0) + 1; this._syncRequestId = request
    this.setData({ unavailable: false })
    try {
      const result = await businessApi.getCoachProfile({ coachId: this.data.coachId })
      if (request === this._syncRequestId) this.setData({ coach: result.coach, avatarText: result.coach.name.slice(0, 1) })
    } catch (error) {
      if (request === this._syncRequestId && error.code === 'COACH_PROFILE_UNAVAILABLE') this.setData({ coach: null, unavailable: true })
      throw error
    }
  },
  onPreviewPhoto(event) {
    if (!this.data.coach) return
    return previewPhotos(this.data.coach.photos, event.currentTarget.dataset.url)
  },
  onChooseCoach() {
    if (this.data.pageBusy || this.data.pageError || !this.data.coach || this.data.unavailable) return
    const pages = getCurrentPages(), previous = pages[pages.length - 2]
    if (previous && previous.route === 'pages/booking/index') {
      if (previous.data.privatePending || previous.data.privateSubmitting) return showFeedback({ title: '请先核对原预约，再选择教练', icon: 'none' })
      previous.setData({ filters: Object.assign({}, previous.data.filters, { type: 'private', coachId: this.data.coachId }) })
      wx.navigateBack({ fail: () => showFeedback({ title: '页面暂时无法打开，请返回上一页后重试', icon: 'none' }) })
    } else navigateTo({ url: '/pages/booking/index?type=private&coachId=' + encodeURIComponent(this.data.coachId) })
  },
}))
