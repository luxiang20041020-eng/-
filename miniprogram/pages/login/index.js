const businessApi = require('../../utils/business-api')

Page({
  data: {
    checkingSession: true,
    submitting: false,
    loginError: '',
    needPrivacyAuthorization: false,
    privacyContractName: '用户隐私保护协议',
  },

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
      wx.showToast({
        title: '当前微信版本暂不支持查看协议',
        icon: 'none',
      })
      return
    }

    wx.openPrivacyContract({
      fail: () => {
        wx.showToast({
          title: '协议打开失败，请稍后重试',
          icon: 'none',
        })
      },
    })
  },

  onAgreePrivacyAuthorization(event) {
    console.log('agreePrivacyAuthorization detail:', event.detail)
    this.setData({
      needPrivacyAuthorization: false,
      loginError: '',
    })
  },

  onRejectPrivacyAuthorization() {
    wx.showToast({
      title: '同意隐私协议后才能使用手机号登录',
      icon: 'none',
    })
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
        wx.reLaunch({ url: '/pages/home/index' })
        return
      }
    } catch (error) {
      this.setData({
        loginError: error && error.message ? error.message : '',
      })
    } finally {
      this.setData({ checkingSession: false })
    }
  },

  async onGetPhoneNumber(event) {
    console.log('getPhoneNumber detail:', event.detail)

    if (this.data.submitting) {
      return
    }

    if (this.data.needPrivacyAuthorization) {
      wx.showToast({
        title: '请先同意用户隐私保护协议',
        icon: 'none',
      })
      return
    }

    const detail = event.detail || {}
    if (!detail.code) {
      wx.showToast({
        title: detail.errMsg && detail.errMsg.includes('fail') ? '你已取消手机号授权' : '未获取到手机号授权码',
        icon: 'none',
      })
      return
    }

    this.setData({
      submitting: true,
      loginError: '',
    })

    try {
      const sessionData = await businessApi.loginWithPhone({
        phoneCode: detail.code,
      })
      getApp().applyCloudSession(sessionData)
      wx.showToast({
        title: '登录成功',
        icon: 'success',
      })
      wx.reLaunch({ url: '/pages/home/index' })
    } catch (error) {
      this.setData({
        loginError: error && error.message ? error.message : '登录失败，请稍后重试',
      })
      wx.showToast({
        title: this.data.loginError,
        icon: 'none',
      })
    } finally {
      this.setData({ submitting: false })
    }
  },
})
