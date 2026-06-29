const businessApi = require('../../utils/business-api')

function decorateProfilePageData(pageData) {
  const safeData = pageData || {}
  return Object.assign({}, safeData, {
    myBookings: (safeData.myBookings || []).map((item) => {
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
  const safeMinuteKey = String(minuteKey || '0000').replace(/[^0-9]/g, '').slice(-4) || '0000'
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

Page({
  data: {
    runtime: {},
    pageData: {},
    dynamicCode: '',
    avatarText: '',
    qrCodeImageSrc: '',
    qrCodeLoading: false,
    qrCodeError: '',
  },

  onShow() {
    this.syncPageData()
    this.startDynamicCodeTicker()
  },

  onHide() {
    this.stopDynamicCodeTicker()
  },

  onUnload() {
    this.stopDynamicCodeTicker()
  },

  async syncPageData() {
    const app = getApp()
    const runtime = await app.getRuntimeSnapshotAsync({ force: true })
    if (!runtime.isAuthenticated) {
      this.setData({ runtime, pageData: {} })
      this.stopDynamicCodeTicker()
      return
    }
    const avatarText = runtime.userProfile.nickname ? runtime.userProfile.nickname.slice(0, 1) : '人'
    const profileTask = businessApi.getProfileViewData({
      userId: app.globalData.userProfile.id,
    }).then((pageData) => {
      this.setData({
        runtime,
        pageData: decorateProfilePageData(pageData),
        avatarText,
      })
    }).catch(() => {
      this.setData({
        runtime,
        pageData: decorateProfilePageData(app.getProfilePageData()),
        avatarText,
      })
    })
    await Promise.all([profileTask, this.refreshDynamicCode(runtime)])
    const tabbar = this.selectComponent('#tabbar')
    if (tabbar) {
      tabbar.syncTabs()
    }
  },

  startDynamicCodeTicker() {
    this.stopDynamicCodeTicker()
    // 这里用定时生成短时身份码，模拟正式环境中的 60 秒动态二维码刷新逻辑。
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
        qrCodeError: error.message || '二维码生成失败',
      })
    }
  },

  goLogin() {
    wx.navigateTo({ url: '/pages/login/index' })
  },

  onLogout() {
    wx.showModal({
      title: '退出登录',
      content: '确认退出当前账号？',
      confirmText: '退出',
      confirmColor: '#e74c3c',
      cancelText: '取消',
      success: async (res) => {
        if (!res.confirm) return
        const app = getApp()
        try {
          await wx.cloud.callFunction({ name: 'businessCore', data: { action: 'logout' } })
        } catch (_) {
          // 云端退出失败不阻断本地会话清除
        }
        app.resetGuestSession()
        wx.reLaunch({ url: '/pages/home/index' })
      },
    })
  },

  onSwitchRole(event) {
    const app = getApp()
    if (app.globalData.isAuthenticated) {
      return
    }
    const { role, label } = event.currentTarget.dataset
    app.switchRole(role)
    wx.showToast({
      title: '已切换为' + label,
      icon: 'none',
    })
    this.syncPageData()
  },

  async onCancelBooking(event) {
    const app = getApp()
    const bookingId = event.currentTarget.dataset.bookingId
    let result = null

    try {
      await businessApi.cancelBooking({
        bookingId,
        operatorId: app.globalData.userProfile.id,
        remark: '小程序取消预约',
      })
      result = app.applyCloudCancelSuccess(bookingId)
    } catch (error) {
      result = app.cancelBooking(bookingId)
      if (result.ok) {
        result.message = result.message + '（当前使用本地演示数据）'
      } else if (error && error.message) {
        result.message = result.message + '；云端返回：' + error.message
      }
    }

    wx.showToast({
      title: result.message,
      icon: result.ok ? 'success' : 'none',
    })
    this.syncPageData()
  },
})
