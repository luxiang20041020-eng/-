const withPageState = require('../../utils/page-state')
const businessApi = require('../../utils/business-api')
const { navigateTo, setClipboardData, showFeedback } = require('../../utils/interaction')

Page(withPageState({
  data: { runtime: {}, pageData: null },
  onShow() { this.syncPageData() },
  async syncPageData() {
    const request = (this._syncRequestId || 0) + 1
    this._syncRequestId = request
    const runtime = await getApp().getRuntimeSnapshotAsync()
    if (request !== this._syncRequestId) return
    this.setData({ runtime, pageData: null })
    if (!runtime.isAuthenticated) return
    const pageData = await businessApi.getPointsViewData()
    if (request === this._syncRequestId) this.setData({ pageData })
  },
  goLogin() { navigateTo({ url: '/pages/login/index?returnTo=profile' }) },
  onCopyInviteCode() {
    if (!this.data.pageData || this.data.pageBusy || this.data.pageError) return
    setClipboardData({ data: this.data.pageData.inviteCode, success: () => showFeedback({ title: '邀请码已复制', icon: 'success' }) })
  },
}))
