const withPageState = require('../../../utils/page-state')
const businessApi = require('../../../utils/business-api')
const media = require('../../../utils/profile-media')
const { showFeedback, confirmAction } = require('../../../utils/interaction')
const { getUserMessage } = require('../../../utils/user-feedback')

function draft(coach) {
  return { title: coach.title, levelLabel: coach.levelLabel, bio: coach.bio, specialties: coach.specialties.join('\n'), honors: coach.honors.join('\n'), photos: coach.photos.slice() }
}
const split = value => String(value || '').split('\n').map(v => v.trim()).filter(Boolean)
Page(withPageState({
  data: { runtime: {}, canEdit: false, ready: false, coach: null, draft: { title: '', levelLabel: '', bio: '', specialties: '', honors: '', photos: [] }, dirty: false, saving: false, uploading: false, formError: '', avatarText: '', editSection: 'basic' },
  onShow() { if (!this.data.ready) this.syncPageData() },
  async syncPageData() {
    if (this.data.saving || this.data.uploading) return
    if (this.data.dirty && !await confirmAction({ title: '重新读取教练资料？', content: '重新读取会丢弃尚未保存的修改。', confirmText: '重新读取' })) return
    const request = (this._syncRequestId || 0) + 1; this._syncRequestId = request
    const runtime = await getApp().getRuntimeSnapshotAsync({ force: true })
    if (request !== this._syncRequestId) return
    const canEdit = runtime.isAuthenticated && ['coach', 'admin'].includes(runtime.role)
    this.setData({ runtime, canEdit, ready: false, coach: null })
    if (!canEdit) return
    const result = await businessApi.getOwnCoachProfile()
    if (request !== this._syncRequestId) return
    this.setData({ ready: true, coach: result.coach, draft: draft(result.coach), dirty: false, formError: '', avatarText: result.coach.name.slice(0, 1) })
  },
  onInput(event) {
    if (!this.data.ready || this.data.saving || this.data.uploading) return
    const field = event.currentTarget.dataset.field
    if (!['title', 'levelLabel', 'bio', 'specialties', 'honors'].includes(field)) return
    this.setData({ draft: Object.assign({}, this.data.draft, { [field]: event.detail.value }), dirty: true, formError: '' })
    this.updateLeaveAlert()
  },
  onEditSection(event) {
    const section = event.currentTarget.dataset.section
    if (['basic', 'intro', 'photos'].includes(section)) this.setData({ editSection: section })
  },
  updateLeaveAlert() {
    if (this.data.dirty && wx.enableAlertBeforeUnload) wx.enableAlertBeforeUnload({ message: require('../../../utils/i18n').t('资料尚未保存，离开将丢失修改') })
    else if (wx.disableAlertBeforeUnload) wx.disableAlertBeforeUnload()
  },
  async onUploadAvatar() {
    if (!this.data.ready || this.data.saving || this.data.uploading) return
    this.setData({ uploading: true, formError: '' })
    try {
      const result = await media.updateAvatar(this.data.runtime.userProfile.id)
      if (result) { this.setData({ coach: Object.assign({}, this.data.coach, { avatarUrl: result.userProfile.avatarUrl }), runtime: getApp().getRuntimeSnapshot() }); showFeedback({ title: '头像已更新', icon: 'success' }) }
    } catch (error) { this.setData({ formError: getUserMessage(error, '头像上传未完成，请重试') }) }
    finally { this.setData({ uploading: false }) }
  },
  async onAddPhotos() {
    if (!this.data.ready || this.data.saving || this.data.uploading || this.data.draft.photos.length >= 6) return
    const userId = this.data.runtime.userProfile.id
    this.setData({ uploading: true, formError: '' })
    try {
      const paths = await media.choosePhotos(6 - this.data.draft.photos.length)
      for (const path of paths) {
        const result = await media.uploadPhoto(path, userId)
        await media.sameUser(userId)
        this.setData({ draft: Object.assign({}, this.data.draft, { photos: this.data.draft.photos.concat(result.fileId) }), dirty: true })
        this.updateLeaveAlert()
      }
    } catch (error) { this.setData({ formError: getUserMessage(error, '照片上传未完成，请重试') }) }
    finally { this.setData({ uploading: false }) }
  },
  onRemovePhoto(event) {
    if (this.data.saving || this.data.uploading) return
    this.setData({ draft: Object.assign({}, this.data.draft, { photos: this.data.draft.photos.filter(url => url !== event.currentTarget.dataset.url) }), dirty: true })
    this.updateLeaveAlert()
  },
  onPreviewPhoto(event) { return media.previewPhotos(this.data.draft.photos, event.currentTarget.dataset.url) },
  async onSave() {
    if (!this.data.ready || !this.data.canEdit || this.data.saving || this.data.uploading || this.data.pageBusy || this.data.pageError) return
    const form = this.data.draft, specialties = split(form.specialties), honors = split(form.honors)
    if (specialties.length > 10 || specialties.some(v => v.length > 40)) return this.setData({ formError: '最多10项擅长，每项不超过40个字符' })
    if (honors.length > 10 || honors.some(v => v.length > 200)) return this.setData({ formError: '最多10项荣誉，每项不超过200个字符' })
    this.setData({ saving: true, formError: '' })
    try {
      await media.sameUser(this.data.runtime.userProfile.id)
      const result = await businessApi.updateCoachProfile({ ...form, specialties, honors, version: this.data.coach.version })
      this.setData({ coach: result.coach, draft: draft(result.coach), dirty: false })
      this.updateLeaveAlert()
      getApp().removeViewCacheByPrefix('booking:')
      getApp().removeViewCacheByPrefix('profile:')
      if (getApp().globalData) getApp().globalData.lastAuthSyncAt = 0
      showFeedback({ title: '教练资料已保存', icon: 'success' })
    } catch (error) { this.setData({ formError: getUserMessage(error, '资料保存未完成，请刷新后核对') }) }
    finally { this.setData({ saving: false }) }
  },
  onUnload() { if (wx.disableAlertBeforeUnload) wx.disableAlertBeforeUnload() },
}))
