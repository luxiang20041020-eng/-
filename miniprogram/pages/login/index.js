const businessApi = require('../../utils/business-api')

Page({
  data: {
    checkingSession: true,
    submitting: false,
    loginError: '',
  },

  onShow() {
    this.tryRestoreSession()
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
    if (this.data.submitting) {
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
