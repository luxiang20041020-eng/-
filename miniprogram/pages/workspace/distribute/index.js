const businessApi = require('../../../utils/business-api')

function addDays(days) {
  const date = new Date()
  date.setDate(date.getDate() + days)
  return date.toISOString().slice(0, 10)
}

// 日期选择器的最小可选日期（今天）
function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

function buildDistributeCacheKey(runtime, keyword) {
  const storeId = runtime && runtime.currentStore && runtime.currentStore.id ? runtime.currentStore.id : 'default'
  return 'workspace:distribute:' + storeId + ':' + String(keyword || '').trim()
}

Page({
  data: {
    runtime: {},
    pageData: {},
    keyword: '',
    selectedMemberId: '',
    selectedPackageId: '',
    expiryDate: '',
    amount: '',
    payType: '微信转账',
    remark: '',
    minExpiryDate: todayStr(),
  },

  onShow() {
    this.syncPageData()
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
      wx.reLaunch({ url: '/pages/login/index' })
      return
    }
    if (!['coach', 'admin'].includes(runtime.role)) {
      wx.showToast({
        title: '当前身份没有派课权限',
        icon: 'none',
      })
      return
    }
    this.hydratePageData(runtime)
    try {
      const pageData = await businessApi.getDistributeViewData({
        storeId: runtime.currentStore.id,
        keyword: this.data.keyword,
      })
      if (this._syncRequestId !== requestId) {
        return
      }
      app.setViewCache(buildDistributeCacheKey(runtime, this.data.keyword), pageData)
      this.setData({
        runtime,
        pageData,
      })
    } catch (error) {
      if (this._syncRequestId !== requestId) {
        return
      }
      this.setData({
        runtime,
        pageData: app.getDistributePageData(this.data.keyword),
      })
    }
  },

  hydratePageData(runtime) {
    const app = getApp()
    if (!runtime || !runtime.isAuthenticated || !['coach', 'admin'].includes(runtime.role)) {
      return false
    }
    const cachedPageData = app.getViewCache(buildDistributeCacheKey(runtime, this.data.keyword))
    this.setData({
      runtime,
      pageData: cachedPageData || app.getDistributePageData(this.data.keyword),
    })
    return Boolean(cachedPageData)
  },

  onKeywordInput(event) {
    this.setData({ keyword: event.detail.value })
    if (this._keywordTimer) clearTimeout(this._keywordTimer)
    this._keywordTimer = setTimeout(() => {
      this._keywordTimer = null
      this.syncPageData()
    }, 350)
  },

  onSelectMember(event) {
    this.setData({ selectedMemberId: event.currentTarget.dataset.memberId })
  },

  onSelectPackage(event) {
    const packageId = event.currentTarget.dataset.packageId
    const targetPackage = (this.data.pageData.packageOptions || []).find((item) => item.id === packageId)
    this.setData({
      selectedPackageId: packageId,
      amount: targetPackage ? String(targetPackage.price) : this.data.amount,
      expiryDate: targetPackage && targetPackage.validDays ? addDays(targetPackage.validDays) : this.data.expiryDate,
    })
  },

  onExpiryDateChange(event) {
    this.setData({ expiryDate: event.detail.value })
  },

  onAmountInput(event) {
    this.setData({ amount: event.detail.value })
  },

  onPayTypeInput(event) {
    this.setData({ payType: event.detail.value })
  },

  onRemarkInput(event) {
    this.setData({ remark: event.detail.value })
  },

  onSubmit() {
    if (!this.data.selectedMemberId || !this.data.selectedPackageId) {
      wx.showToast({ title: '请先选择学员和套餐', icon: 'none' })
      return
    }
    if (!this.data.expiryDate) {
      wx.showToast({ title: '请设置课时到期日期', icon: 'none' })
      return
    }
    if (this.data.expiryDate < todayStr()) {
      wx.showToast({ title: '到期日期不能早于今天', icon: 'none' })
      return
    }
    if (Number(this.data.amount) < 0) {
      wx.showToast({ title: '实收金额不能小于 0', icon: 'none' })
      return
    }

    const member = this.data.pageData.members.find((item) => item.id === this.data.selectedMemberId)
    const targetPackage = this.data.pageData.packageOptions.find((item) => item.id === this.data.selectedPackageId)
    if (!member || !targetPackage) {
      wx.showToast({ title: '派发对象无效', icon: 'none' })
      return
    }

    wx.showModal({
      title: '确认派发',
      content: '即将为 ' + member.nickname + ' 派发【' + targetPackage.name + '】并记录审计流水，是否确认？',
      success: async (res) => {
        if (!res.confirm) {
          return
        }

        const app = getApp()
        const runtime = await app.getRuntimeSnapshotAsync({ force: true })
        if (!runtime.isAuthenticated) {
          wx.reLaunch({ url: '/pages/login/index' })
          return
        }
        const localPayload = {
          memberId: this.data.selectedMemberId,
          packageId: this.data.selectedPackageId,
          expiryDate: this.data.expiryDate,
          amount: Number(this.data.amount || 0),
          payType: this.data.payType || '微信转账',
          remark: this.data.remark,
        }
        let result = null

        try {
          await businessApi.distributeAsset({
            userId: localPayload.memberId,
            packageId: localPayload.packageId,
            expiryDate: localPayload.expiryDate,
            operatorId: runtime.userProfile.id,
            offlineAmount: localPayload.amount,
            payType: localPayload.payType,
            remark: localPayload.remark,
          })
          result = app.submitDistribution(localPayload)
        } catch (error) {
          // 云端未部署或初始化未完成时，先走本地态，保证工作台链路可持续验收。
          result = app.submitDistribution(localPayload)
          if (result.ok) {
            result.message = result.message + '（当前使用本地演示数据）'
          } else if (error && error.message) {
            result.message = result.message + '；云端返回：' + error.message
          }
        }

        wx.showToast({ title: result.message, icon: result.ok ? 'success' : 'none' })
        if (result.ok) {
          app.removeViewCacheByPrefix('workspace:')
          app.removeViewCacheByPrefix('admin:dashboard:')
          app.removeViewCacheByPrefix('profile:' + localPayload.memberId)
          this.setData({
            selectedMemberId: '',
            selectedPackageId: '',
            expiryDate: '',
            amount: '',
            payType: '微信转账',
            remark: '',
          })
          this.syncPageData()
        }
      },
    })
  },
})
