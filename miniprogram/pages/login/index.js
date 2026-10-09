const { showFeedback, reLaunch } = require('../../utils/interaction')
const { getUserMessage } = require('../../utils/user-feedback')
const businessApi = require('../../utils/business-api')
const withI18n = require('../../utils/with-i18n')

Page(withI18n({
  data: {
    checkingSession: true,
    submitting: false,
    loginError: '',
    needPrivacyAuthorization: false,
    privacyContractName: '用户隐私保护协议',
  },

  onLoad(options) {
    const destinations = { booking: '/pages/booking/index?type=' + (options.type === 'private' ? 'private' : 'group'), profile: '/pages/profile/index' }
    this.returnUrl = destinations[options.returnTo] || '/pages/home/index'
  },

  goBrowse() { reLaunch({ url: '/pages/home/index' }) },

  onShow() {
    this.checkPrivacyAuthorization()
    this.tryRestoreSession()
  },

  checkPrivacyAuthorization() {
    if (!wx.getPrivacySetting) {
      return
    }

    wx.getPrivacySetting({
      success: (res) => {
        this.setData({
          needPrivacyAuthorization: Boolean(res.needAuthorization),
          privacyContractName: res.privacyContractName || '用户隐私保护协议',
        })
      },
    })
  },

  onOpenPrivacyContract() {
    if (!wx.openPrivacyContract) {
      showFeedback({
        title: '当前版本暂不支持查看协议',
        icon: 'none',
      })
      return
    }

    wx.openPrivacyContract({
      fail: () => {
        showFeedback({
          title: '协议打开失败，请稍后重试',
          icon: 'none',
        })
      },
    })
  },

  onAgreePrivacyAuthorization(event) {
    this.setData({
      needPrivacyAuthorization: false,
      loginError: '',
    })
  },

  onRejectPrivacyAuthorization() {
    this.goBrowse()
  },

  async tryRestoreSession() {
    const app = getApp()
    this.setData({
      checkingSession: true,
      loginError: '',
    })

    try {
      const runtime = await app.getRuntimeSnapshotAsync({ force: true })
      if (runtime.isAuthenticated) {
        reLaunch({ url: this.returnUrl || '/pages/home/index' })
        return
      }
    } catch (error) {
      this.setData({
        loginError: getUserMessage(error, ''),
      })
    } finally {
      this.setData({ checkingSession: false })
    }
  },

  async onGetPhoneNumber(event) {
    const app = getApp()
    if (app.isLogoutInProgress && app.isLogoutInProgress()) {
      showFeedback({ title: '正在退出登录，请稍后再登录', icon: 'none' })
      return
    }

    if (this.data.submitting) {
      return
    }

    if (this.data.needPrivacyAuthorization) {
      showFeedback({
        title: '请先同意用户隐私保护协议',
        icon: 'none',
      })
      return
    }

    const detail = event.detail || {}
    if (!detail.code) {
      showFeedback({
        title: /deny|cancel|拒绝|取消/i.test(detail.errMsg || '') ? '你已取消手机号授权' : getUserMessage(detail.errMsg, '未能获取手机号，请重新授权登录'),
        icon: 'none',
      })
      return
    }

    this.setData({
      submitting: true,
      loginError: '',
    })

    try {
      const authVersion = app._authVersion || 0
      const sessionData = await businessApi.loginWithPhone({
        phoneCode: detail.code,
      })
      if ((app._authVersion || 0) !== authVersion || (app.isLogoutInProgress && app.isLogoutInProgress())) return
      app.applyCloudSession(sessionData)
      showFeedback({
        title: '登录成功',
        icon: 'success',
      })
      reLaunch({ url: this.returnUrl || '/pages/home/index' })
    } catch (error) {
      this.setData({
        loginError: getUserMessage(error, '登录失败，请稍后重试'),
      })
      showFeedback({
        title: this.data.loginError,
        icon: 'none',
      })
    } finally {
      this.setData({ submitting: false })
    }
  },
}))
