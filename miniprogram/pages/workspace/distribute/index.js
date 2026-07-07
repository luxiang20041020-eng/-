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

function normalizeMember(member) {
  const nickname = member.nickname || member.realName || member.real_name || member.name || member.phone || '未命名学员'
  return Object.assign({}, member, {
    id: member.id || member._id || member.userId || '',
    nickname,
    avatarText: String(nickname).slice(0, 1),
    phone: member.phone || '',
    privateCount: Number(member.privateCount || 0),
    groupCount: Number(member.groupCount || 0),
    privateExpiry: member.privateExpiry || '',
    groupExpiry: member.groupExpiry || '',
  })
}

function normalizePackage(packageOption) {
  const type = packageOption.type || (Number(packageOption.asset_type) === 1 ? 'group' : 'private')
  return Object.assign({}, packageOption, {
    id: packageOption.id || packageOption._id || packageOption.packageId || '',
    name: packageOption.name || '未命名套餐',
    type,
    typeLabel: type === 'group' ? '团课' : '私教',
    lessons: Number(packageOption.lessons || packageOption.course_count || 0),
    price: Number(packageOption.price || packageOption.display_price || 0),
    validDays: Number(packageOption.validDays || packageOption.valid_days || (type === 'group' ? 180 : 365)),
  })
}

function normalizePageData(pageData, fallbackStore) {
  const safeData = pageData || {}
  return Object.assign({}, safeData, {
    currentStore: safeData.currentStore || fallbackStore || {},
    members: (safeData.members || []).map(normalizeMember).filter((item) => item.id),
    packageOptions: (safeData.packageOptions || []).map(normalizePackage).filter((item) => item.id),
  })
}

Page({
  data: {
    runtime: {},
    pageData: {},
    keyword: '',
    selectedMemberId: '',
    selectedMember: null,
    selectedPackageId: '',
    selectedPackage: null,
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
      const normalizedPageData = normalizePageData(pageData, runtime.currentStore)
      app.setViewCache(buildDistributeCacheKey(runtime, this.data.keyword), normalizedPageData)
      this.setData({
        runtime,
        pageData: normalizedPageData,
      })
    } catch (error) {
      if (this._syncRequestId !== requestId) {
        return
      }
      this.setData({
        runtime,
        pageData: normalizePageData(app.getDistributePageData(this.data.keyword), runtime.currentStore),
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
      pageData: normalizePageData(cachedPageData || app.getDistributePageData(this.data.keyword), runtime.currentStore),
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
    const memberId = event.currentTarget.dataset.memberId
    const selectedMember = (this.data.pageData.members || []).find((item) => item.id === memberId)
    this.setData({
      selectedMemberId: memberId,
      selectedMember: selectedMember || null,
      keyword: '',
    })
  },

  onSelectPackage(event) {
    const packageId = event.currentTarget.dataset.packageId
    const targetPackage = (this.data.pageData.packageOptions || []).find((item) => item.id === packageId)
    this.setData({
      selectedPackageId: packageId,
      selectedPackage: targetPackage || null,
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

    const member = this.data.selectedMember || (this.data.pageData.members || []).find((item) => item.id === this.data.selectedMemberId)
    const targetPackage = this.data.selectedPackage || (this.data.pageData.packageOptions || []).find((item) => item.id === this.data.selectedPackageId)
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
          memberSnapshot: member,
          packageSnapshot: targetPackage,
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
          result = {
            ok: true,
            message: '已为' + member.nickname + '派发 ' + targetPackage.lessons + ' 节' + targetPackage.typeLabel,
          }
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
            selectedMember: null,
            selectedPackageId: '',
            selectedPackage: null,
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
