const { showModal } = require('../../utils/interaction')
const { getUserMessage } = require('../../utils/user-feedback')
const media = require('../../utils/profile-media')
const withPageState = require('../../utils/page-state')
const businessApi = require('../../utils/business-api')
const { confirmAction, showFeedback, navigateTo, redirectTo, reLaunch } = require('../../utils/interaction')

function decorateProfilePageData(pageData) {
  const safeData = pageData || {}
  return Object.assign({}, safeData, {
    myBookings: (safeData.myBookings || []).filter(item => item.status === '待到店').slice(0, 3).map((item) => {
      const rawDateText = String(item.dateLabel || '')
      const dateText = rawDateText.split(' ')[0] || rawDateText
      const dateParts = dateText.split('/')
      return Object.assign({}, item, {
        dateText,
        dateDay: dateParts[1] || dateText,
      })
    }),
  })
}

function buildMinuteKey(date = new Date()) {
  return [date.getHours(), date.getMinutes()].map((item) => String(item).padStart(2, '0')).join('')
}

function buildIdentityQrFilePath(userId, minuteKey) {
  const safeUserId = String(userId || 'guest').replace(/[^0-9a-zA-Z_-]/g, '') || 'guest'
  const safeMinuteKey = Number(minuteKey || 0) % 2
  return wx.env.USER_DATA_PATH + '/identity-qr-' + safeUserId + '-' + safeMinuteKey + '.png'
}

function writeBase64ImageFile(filePath, imageBase64) {
  const fileSystemManager = wx.getFileSystemManager()
  return new Promise((resolve, reject) => {
    fileSystemManager.writeFile({
      filePath,
      data: imageBase64,
      encoding: 'base64',
      success: resolve,
      fail: reject,
    })
  })
}

function buildProfileCacheKey(runtime) {
  const userId = runtime && runtime.userProfile && runtime.userProfile.id ? runtime.userProfile.id : 'guest'
  return 'profile:' + userId
}

Page(withPageState({
  data: {
    runtime: {},
    pageData: {},
    dynamicCode: '',
    avatarText: '', avatarUploading: false,
    qrCodeImageSrc: '',
    qrCodeLoading: false,
    qrCodeError: '',
    showNicknameEditor: false,
    nicknameDraft: '',
    nicknameSubmitting: false,
    nicknameError: '',
    identityExpanded: false,
    cancellingBookingId: '',
    loggingOut: false,
    inviteExpanded: false,
    inviteDraft: '',
    inviteSubmitting: false,
    inviteLoading: false,
    inviteError: '',
    inviteStateReady: false,
    inviteBound: false,
    inviteBoundCode: '',
  },

  onLoad(options) {
    this.targetSection = options.section
    this.setData({ identityExpanded: options.section === 'identity' })
  },

  onShow() {
    this.syncPageData()
    this.startDynamicCodeTicker()
    if (this.data.inviteExpanded) this.loadInviteState()
  },

  onHide() {
    this._inviteRequest = (this._inviteRequest || 0) + 1
    this.setData({ inviteLoading: false, inviteStateReady: false })
    this.qrRequestId = (this.qrRequestId || 0) + 1
    this.setData({ qrCodeLoading: false, qrCodeImageSrc: '' })
    this.stopDynamicCodeTicker()
  },

  onUnload() {
    this._inviteRequest = (this._inviteRequest || 0) + 1
    this.qrRequestId = (this.qrRequestId || 0) + 1
    this.stopDynamicCodeTicker()
  },

  async syncPageData() {
    const app = getApp()
    const initialRuntime = app.getRuntimeSnapshot()
    this.hydratePageData(initialRuntime)
    const requestId = (this._syncRequestId || 0) + 1
    this._syncRequestId = requestId

    const runtime = await app.getRuntimeSnapshotAsync()
    if (this._syncRequestId !== requestId) {
      return
    }
    if (!runtime.isAuthenticated) {
      this.setData({ runtime, pageData: {} })
      this.stopDynamicCodeTicker()
      return
    }
    const avatarText = runtime.userProfile.nickname ? runtime.userProfile.nickname.slice(0, 1) : '人'

    this.hydratePageData(runtime)
    this.refreshDynamicCode(runtime)

    try {
      const pageData = await businessApi.getProfileViewData({
        userId: app.globalData.userProfile.id,
      })
      if (this._syncRequestId !== requestId) {
        return
      }
      app.setViewCache(buildProfileCacheKey(runtime), pageData)
      this.setData({
        runtime,
        pageData: decorateProfilePageData(pageData),
        avatarText,
      })
    } catch (error) {
      if (this._syncRequestId !== requestId) {
        return
      }
      this.setData({ pageError: getUserMessage(error, "加载失败，请重试") })
      this.setData({
        runtime,
        pageData: decorateProfilePageData(app.getProfilePageData()),
        avatarText,
      })
    }

    const tabbar = this.selectComponent('#tabbar')
    if (tabbar) {
      tabbar.syncTabs()
    }
    if (this.targetSection) {
      const selector = this.targetSection === 'identity' ? '#identity-section' : '#bookings-section'
      wx.pageScrollTo({ selector, duration: 250 })
      this.targetSection = ''
    }
  },

  hydratePageData(runtime) {
    const app = getApp()
    if (!runtime || !runtime.isAuthenticated) {
      this.setData({
        runtime: runtime || {},
      })
      return false
    }

    const cacheKey = buildProfileCacheKey(runtime)
    const cachedPageData = app.getViewCache(cacheKey)
    const pageData = cachedPageData || app.getProfilePageData()
    const avatarText = runtime.userProfile.nickname ? runtime.userProfile.nickname.slice(0, 1) : '人'
    const phone = String(runtime.userProfile.phone || '')

    this.setData({
      runtime,
      pageData: decorateProfilePageData(pageData),
      avatarText,
      maskedPhone: phone ? phone.slice(0, 3) + '****' + phone.slice(-4) : '未绑定',
    })

    return Boolean(cachedPageData)
  },

  startDynamicCodeTicker() {
    this.stopDynamicCodeTicker()
    // 仅在身份区展开时刷新云端生成的展示二维码。
    this.codeTimer = setInterval(() => {
      this.refreshDynamicCode()
    }, 60000)
  },

  stopDynamicCodeTicker() {
    if (this.codeTimer) {
      clearInterval(this.codeTimer)
      this.codeTimer = null
    }
  },

  async refreshDynamicCode(runtimeOverride) {
    const runtime = runtimeOverride || this.data.runtime || {}
    if (!runtime.isAuthenticated || !this.data.identityExpanded || this.data.qrCodeLoading) return
    const now = new Date()
    const minuteKey = buildMinuteKey(now)
    const userIdSuffix = (runtime.userProfile && runtime.userProfile.id
      ? runtime.userProfile.id
      : 'guest').toUpperCase()
    const dynamicCode = 'TK-' + (runtime.role || 'client') + '-' + minuteKey + '-' + userIdSuffix
    const requestId = (this.qrRequestId || 0) + 1
    this.qrRequestId = requestId

    this.setData({
      dynamicCode,
      qrCodeImageSrc: '',
      qrCodeLoading: true,
      qrCodeError: '',
    })

    try {
      const qrData = await businessApi.getIdentityQrCode({
        minuteKey,
      })
      const filePath = buildIdentityQrFilePath(runtime.userProfile && runtime.userProfile.id, minuteKey)
      await writeBase64ImageFile(filePath, qrData.imageBase64)
      if (this.qrRequestId !== requestId) {
        return
      }
      this.setData({
        qrCodeImageSrc: filePath,
        qrCodeLoading: false,
        qrCodeError: '',
      })
    } catch (error) {
      if (this.qrRequestId !== requestId) {
        return
      }
      this.setData({
        qrCodeLoading: false,
        qrCodeError: getUserMessage(error, '二维码生成失败'),
      })
    }
  },

  goLogin() {
    navigateTo({ url: '/pages/login/index?returnTo=profile' })
  },

  goPoints() { navigateTo({ url: '/pages/points/index' }) },

  async onToggleInvite() {
    if (this.data.inviteSubmitting) return
    const expanded = !this.data.inviteExpanded
    this.setData({ inviteExpanded: expanded })
    if (expanded) await this.loadInviteState()
  },

  async loadInviteState() {
    const request = (this._inviteRequest || 0) + 1
    this._inviteRequest = request
    this.setData({ inviteLoading: true, inviteStateReady: false, inviteError: '' })
    try {
      const result = await businessApi.getPointsViewData()
      if (request !== this._inviteRequest) return
      this.setData({ inviteBound: result.bound, inviteBoundCode: result.boundCode, inviteStateReady: true })
    } catch (error) {
      if (request === this._inviteRequest) this.setData({ inviteError: getUserMessage(error, '邀请码状态读取失败，请重试') })
    } finally {
      if (request === this._inviteRequest) this.setData({ inviteLoading: false })
    }
  },

  onInviteInput(event) {
    if (!this.data.inviteSubmitting) this.setData({ inviteDraft: event.detail.value.toUpperCase(), inviteError: '' })
  },

  async onBindInvite() {
    if (this.data.inviteSubmitting || !this.data.inviteStateReady || this.data.inviteBound || this.data.loggingOut) return
    const inviteCode = String(this.data.inviteDraft || '').trim().toUpperCase()
    if (!/^ON[0-9A-F]{12}$/.test(inviteCode)) {
      this.setData({ inviteError: '请填写好友分享的14位邀请码，以ON开头' })
      return
    }
    const request = this._inviteRequest
    this.setData({ inviteSubmitting: true, inviteError: '' })
    try {
      const result = await businessApi.bindInviteCode({ inviteCode })
      if (request !== this._inviteRequest) return
      this.setData({ inviteBound: true, inviteBoundCode: inviteCode, inviteDraft: '' })
      showFeedback({ title: result.message, icon: 'success' })
    } catch (error) {
      if (request === this._inviteRequest) this.setData({ inviteError: getUserMessage(error, '绑定失败，请核对邀请码后重试') })
    } finally { this.setData({ inviteSubmitting: false }) }
  },

  onToggleIdentity() {
    this.setData({ identityExpanded: !this.data.identityExpanded }, () => {
      if (this.data.identityExpanded) this.refreshDynamicCode()
    })
  },

  onRetryQr() { this.refreshDynamicCode() },

  onShowRules() {
    showModal({ title: '预约与到店规则', content: '每次预约扣除 1 次对应训练权益。\n\n开课前超过 2 小时可取消，取消后权益自动退回。临近开课请联系场馆。\n\n权益有效期以本页显示的到期日期为准；到店后由场馆人员确认出勤。', showCancel: false, confirmText: '知道了' })
  },

  onShowTrend() { wx.pageScrollTo({ selector: '#training-stats', duration: 250 }) },
  onShowNotices() { redirectTo({ url: '/pages/home/index' }) },
  onShowHelp() { showModal({ title: '需要帮助？', contentParts: [{ text: '预约、购买权益或临时调整训练，请到当前门店咨询场馆人员。' }, '\n\n', { text: '当前门店：' }, this.data.runtime.currentStore.name || '', '\n', this.data.runtime.currentStore.address || ''], showCancel: false, confirmText: '知道了' }) },

  goCoachEditor() { navigateTo({ url: '/pages/coach/edit/index' }) },
  async onUploadAvatar() {
    if (!this.data.runtime.isAuthenticated || this.data.avatarUploading || this.data.loggingOut || this.data.nicknameSubmitting) return
    const userId = this.data.runtime.userProfile.id
    this.setData({ avatarUploading: true })
    try {
      const result = await media.updateAvatar(userId)
      if (result) {
        this.setData({ runtime: getApp().getRuntimeSnapshot() })
        showFeedback({ title: '头像已更新', icon: 'success' })
      }
    } catch (error) { showFeedback({ title: getUserMessage(error, '头像上传未完成，请重试'), icon: 'none' }) }
    finally { this.setData({ avatarUploading: false }) }
  },

  openNicknameEditor() {
    if (this.data.loggingOut) return
    const runtime = this.data.runtime || {}
    const userProfile = runtime.userProfile || {}
    this.setData({
      showNicknameEditor: true,
      nicknameDraft: userProfile.nickname || '',
      nicknameError: '',
    })
  },

  closeNicknameEditor() {
    if (this.data.nicknameSubmitting) {
      return
    }
    this.setData({
      showNicknameEditor: false,
      nicknameDraft: '',
      nicknameError: '',
    })
  },

  onNicknameInput(event) {
    this.setData({
      nicknameDraft: event.detail.value,
      nicknameError: '',
    })
  },

  async submitNicknameChange() {
    if (this.data.nicknameSubmitting || this.data.loggingOut || this.data.avatarUploading) {
      return
    }

    const app = getApp()
    const currentNickname = this.data.runtime && this.data.runtime.userProfile
      ? this.data.runtime.userProfile.nickname
      : ''
    const nextNickname = String(this.data.nicknameDraft || '').replace(/\s+/g, ' ').trim()

    if (!nextNickname) {
      this.setData({ nicknameError: '请输入用户名' })
      return
    }
    if (nextNickname.length > 20) {
      this.setData({ nicknameError: '用户名不能超过 20 个字符' })
      return
    }
    if (nextNickname === currentNickname) {
      this.setData({
        showNicknameEditor: false,
        nicknameDraft: '',
        nicknameError: '',
      })
      showFeedback({
        title: '用户名未变化',
        icon: 'none',
      })
      return
    }

    this.setData({
      nicknameSubmitting: true,
      nicknameError: '',
    })

    try {
      const sessionData = await businessApi.updateUserProfile({
        nickname: nextNickname,
      })
      if (sessionData && sessionData.userProfile) {
        app.applyCloudSession(sessionData)
      }
      const runtime = app.applyUserProfileUpdate({
        nickname: nextNickname,
      })
      this.setData({
        runtime,
        avatarText: nextNickname.slice(0, 1),
        showNicknameEditor: false,
        nicknameDraft: '',
      })
      showFeedback({
        title: '用户名已更新',
        icon: 'success',
      })
      this.syncPageData()
    } catch (error) {
      const message = getUserMessage(error, '用户名更新失败')
      this.setData({
        nicknameError: message,
      })
      showFeedback({
        title: message,
        icon: 'none',
      })
    } finally {
      this.setData({ nicknameSubmitting: false })
    }
  },

  async onLogout() {
    if (this.data.loggingOut) return
    const app = getApp()
    if (app.isLogoutInProgress()) return
    if (this.data.avatarUploading || this.data.nicknameSubmitting || this.data.cancellingBookingId || this.data.inviteSubmitting) {
      showFeedback({ title: '请等待当前操作完成后退出', icon: 'none' })
      return
    }
    this.setData({ loggingOut: true })
    const userId = app.globalData.userProfile.id
    let logoutRequest
    try {
      if (!await confirmAction({ title: '退出登录', content: '退出后仍可浏览门店和训练场次。', confirmText: '退出登录' })) return
      logoutRequest = app.beginLogout(userId)
      if (!logoutRequest) {
        showFeedback({ title: '登录状态已变化，请重新操作', icon: 'none' })
        return
      }
      await businessApi.logout()
      const runtime = app.completeLogout(logoutRequest)
      if (!runtime) return
      // 页面跳转前先使旧查询失效并清空展示数据，跳转失败也保持游客状态。
      this._syncRequestId = (this._syncRequestId || 0) + 1
      this._pageRequest = (this._pageRequest || 0) + 1
      this.stopDynamicCodeTicker()
      this.qrRequestId = (this.qrRequestId || 0) + 1
      this.setData({ runtime, pageData: {}, maskedPhone: '', avatarText: '', dynamicCode: '', qrCodeImageSrc: '', qrCodeLoading: false, qrCodeError: '', identityExpanded: false, showNicknameEditor: false, nicknameDraft: '', pageBusy: false, pageError: '' })
      const tabbar = this.selectComponent('#tabbar')
      if (tabbar) tabbar.syncTabs()
      reLaunch({ url: '/pages/home/index', fail: () => showFeedback({ title: '已退出登录，请返回首页', icon: 'none' }) })
    } catch (error) {
      showFeedback({ title: getUserMessage(error, '退出失败，请重试'), icon: 'none' })
    } finally {
      if (logoutRequest) app.endLogout(logoutRequest)
      this.setData({ loggingOut: false })
    }
  },

  async onCancelBooking(event) {
    if (this.data.cancellingBookingId || this.data.loggingOut) return
    const bookingId = event.currentTarget.dataset.bookingId
    const booking = (this.data.pageData.myBookings || []).find((item) => item.id === bookingId)
    if (!booking || !booking.canCancel) return
    this.setData({ cancellingBookingId: bookingId })
    try {
      if (!await confirmAction({ title: '取消这次训练？', contentParts: [booking.title, '\n' + booking.dateLabel + ' ' + booking.timeRange + '\n', { text: '取消后将退回 1 次训练权益。' }], confirmText: '确认取消' })) return
      const result = await businessApi.cancelBooking({ bookingId })
      const app = getApp()
      app.removeViewCacheByPrefix('booking:')
      app.removeViewCacheByPrefix('profile:')
      showFeedback({ title: result.message || '已取消，权益已退回', icon: 'success' })
      await this.syncPageData()
    } catch (error) {
      showModal({ title: '取消未完成', content: getUserMessage(error), showCancel: false, confirmText: '知道了' })
    } finally { this.setData({ cancellingBookingId: '' }) }
  },
}))
