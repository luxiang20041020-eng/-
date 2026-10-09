const { getUserMessage } = require('../../../utils/user-feedback')
const { t } = require('../../../utils/i18n')
const withPageState = require('../../../utils/page-state')
const businessApi = require('../../../utils/business-api')
const { confirmAction, showFeedback, reLaunch } = require('../../../utils/interaction')

function addDays(days) {
  const date = new Date()
  date.setDate(date.getDate() + days)
  return date.getFullYear() + '-' + String(date.getMonth()+1).padStart(2,'0') + '-' + String(date.getDate()).padStart(2,'0')
}

// 日期选择器的最小可选日期（今天）
function todayStr() {
  return addDays(0)
}

function buildDistributeCacheKey(runtime, keyword) {
  const storeId = runtime && runtime.currentStore && runtime.currentStore.id ? runtime.currentStore.id : 'default'
  const userId = runtime && runtime.userProfile ? runtime.userProfile.id : 'guest'
  return 'workspace:distribute:' + userId + ':' + storeId + ':' + String(keyword || '').trim()
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

Page(withPageState({
  data: {
    runtime: {},
    submitting: false,
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
    step: 1,
    packageType: 'all',
    visiblePackages: [],
    paymentOptions: ['微信转账', '支付宝', '现金', '银行卡', '赠课', '其他'],
    preview: {},
    receipt: null,
    searching: false,
  },

  onShow() {
    this.setData({ minExpiryDate: todayStr() })
    this.syncPageData()
  },

  onHide() {
    if (this._keywordTimer) clearTimeout(this._keywordTimer)
  },

  onUnload() {
    if (this._keywordTimer) clearTimeout(this._keywordTimer)
  },

  async syncPageData() {
    const app = getApp()
    const initialRuntime = app.getRuntimeSnapshot()
    this.hydratePageData(initialRuntime)
    const requestId = (this._syncRequestId || 0) + 1
    this._syncRequestId = requestId

    let runtime
    try {
      runtime = await app.getRuntimeSnapshotAsync()
    } catch (error) {
      if (this._syncRequestId === requestId) this.setData({ searching: false })
      throw error
    }
    if (this._syncRequestId !== requestId) {
      return
    }
    if (!runtime.isAuthenticated) {
      reLaunch({ url: '/pages/login/index' })
      return
    }
    if (!['coach', 'admin'].includes(runtime.role)) {
      showFeedback({
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
        searching: false,
      })
      this.refreshPreview()
    } catch (error) {
      if (this._syncRequestId !== requestId) {
        return
      }
      this.setData({ pageError: getUserMessage(error, "加载失败，请重试") })
      this.setData({
        runtime,
        pageData: normalizePageData(app.getViewCache(buildDistributeCacheKey(runtime, this.data.keyword)) || app.getDistributePageData(this.data.keyword), runtime.currentStore),
        searching: false,
      })
      this.refreshPreview()
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
    this.refreshPreview()
    return Boolean(cachedPageData)
  },

  refreshPreview() {
    const member = this.data.selectedMember
    const pack = this.data.selectedPackage
    const previousCount = member && pack ? Number(pack.type === 'group' ? member.groupCount : member.privateCount) || 0 : 0
    const previousExpiry = member && pack ? (pack.type === 'group' ? member.groupExpiry : member.privateExpiry) : ''
    const currentCount = previousExpiry && previousExpiry < todayStr() ? 0 : previousCount
    this.setData({
      visiblePackages: (this.data.pageData.packageOptions || []).filter((item) => this.data.packageType === 'all' || item.type === this.data.packageType),
      preview: {
        before: currentCount,
        after: currentCount + (pack ? pack.lessons : 0),
        expiry: previousExpiry && previousExpiry > this.data.expiryDate ? previousExpiry : this.data.expiryDate,
        amount: Number.isFinite(Number(this.data.amount)) ? Number(this.data.amount).toFixed(2) : '—',
      },
    })
  },
  onPackageFilter(event) {
    if (this.data.submitting) return
    this.setData({ packageType: event.currentTarget.dataset.type })
    this.refreshPreview()
  },
  onStep(event) {
    if (this.data.submitting) return
    const step = Number(event.currentTarget.dataset.step)
    if (step >= 2 && !this.data.selectedMember) return showFeedback({ title: '请先选择学员', icon: 'none' })
    if (step >= 3 && !this.data.selectedPackage) return showFeedback({ title: '请先选择套餐', icon: 'none' })
    this.setData({ step })
  },
  onNext() { this.onStep({ currentTarget: { dataset: { step: this.data.step + 1 } } }) },
  onBack() { this.onStep({ currentTarget: { dataset: { step: this.data.step - 1 } } }) },
  onPaymentSelect(event) {
    if (this.data.submitting) return
    const payType = event.currentTarget.dataset.value
    this.setData({ payType, amount: payType === '赠课' ? '0' : this.data.amount })
    this.refreshPreview()
  },
  onContinueDistribute() { this.setData({ receipt: null, step: 1 }); this.syncPageData() },

  onKeywordInput(event) {
    if (this.data.submitting) return
    this._syncRequestId = (this._syncRequestId || 0) + 1
    this.setData({ keyword: event.detail.value, searching: Boolean(event.detail.value.trim()), pageData: Object.assign({}, this.data.pageData, { members: [] }) })
    if (this._keywordTimer) clearTimeout(this._keywordTimer)
    this._keywordTimer = setTimeout(() => {
      this._keywordTimer = null
      this.syncPageData()
    }, 350)
  },

  onSelectMember(event) {
    if (this.data.submitting || this.data.searching) return
    const memberId = event.currentTarget.dataset.memberId
    const selectedMember = (this.data.pageData.members || []).find((item) => item.id === memberId)
    if (!selectedMember) return
    if (this._keywordTimer) clearTimeout(this._keywordTimer)
    this._syncRequestId = (this._syncRequestId || 0) + 1
    this.setData({
      selectedMemberId: memberId,
      selectedMember: selectedMember || null,
      keyword: '',
      step: 2,
    })
    this.refreshPreview()
  },

  onSelectPackage(event) {
    if (this.data.submitting) return
    const packageId = event.currentTarget.dataset.packageId
    const targetPackage = (this.data.pageData.packageOptions || []).find((item) => item.id === packageId)
    if (!targetPackage) return
    this.setData({
      selectedPackageId: packageId,
      selectedPackage: targetPackage || null,
      amount: targetPackage ? String(targetPackage.price) : this.data.amount,
      expiryDate: targetPackage && targetPackage.validDays ? addDays(targetPackage.validDays) : this.data.expiryDate,
    })
    this.refreshPreview()
  },

  onExpiryDateChange(event) {
    if (this.data.submitting) return
    this.setData({ expiryDate: event.detail.value })
    this.refreshPreview()
  },

  onAmountInput(event) {
    if (this.data.submitting) return
    this.setData({ amount: event.detail.value })
    this.refreshPreview()
  },

  onPayTypeInput(event) {
    if (this.data.submitting) return
    this.setData({ payType: event.detail.value })
  },

  onRemarkInput(event) {
    if (this.data.submitting) return
    this.setData({ remark: event.detail.value })
  },

  async onSubmit() {
    if (this.data.submitting || this.data.pageError || this.data.pageBusy) return
    if (!this.data.selectedMemberId || !this.data.selectedPackageId) {
      showFeedback({ title: '请先选择学员和套餐', icon: 'none' })
      return
    }
    if (!this.data.expiryDate) {
      showFeedback({ title: '请设置课时到期日期', icon: 'none' })
      return
    }
    if (this.data.expiryDate < todayStr()) {
      showFeedback({ title: '到期日期不能早于今天', icon: 'none' })
      return
    }
    if (!/^\d+(\.\d{1,2})?$/.test(String(this.data.amount).trim())) {
      showFeedback({ title: '请输入有效实收金额，赠课可填 0', icon: 'none' })
      return
    }
    if (!this.data.payType.trim() || (this.data.payType === '赠课' && Number(this.data.amount) !== 0)) {
      showFeedback({ title: '赠课金额须为 0，请核对收款方式', icon: 'none' }); return
    }

    const member = this.data.selectedMember || (this.data.pageData.members || []).find((item) => item.id === this.data.selectedMemberId)
    const targetPackage = this.data.selectedPackage || (this.data.pageData.packageOptions || []).find((item) => item.id === this.data.selectedPackageId)
    if (!member || !targetPackage) {
      showFeedback({ title: '派发对象无效', icon: 'none' })
      return
    }

    const app = getApp()
    this.refreshPreview()
    const preview = Object.assign({}, this.data.preview)
    const snapshot = { memberId: member.id || this.data.selectedMemberId, packageId: targetPackage.id || this.data.selectedPackageId, expiryDate: this.data.expiryDate, amount: Number(this.data.amount), payType: this.data.payType, remark: this.data.remark, storeId: this.data.pageData.currentStore && this.data.pageData.currentStore.id }
    this.setData({ submitting: true })
    try {
        const confirmed = await confirmAction({ title: '确认派发', contentParts: [member.nickname + ' · ' + member.phone + '\n' + targetPackage.name + '\n', { text: '增加 {0} 节{1}，预计余额 {2} 节', values: [targetPackage.lessons, t(targetPackage.typeLabel), preview.after] }, '\n', { text: '到账有效期 {0}', values: [preview.expiry] }, '\n', { text: '实收 ¥{0} · {1}', values: [preview.amount, t(snapshot.payType)] }] })
        if (!confirmed) return
        const runtime = await app.getRuntimeSnapshotAsync({ force: true })
        if (!runtime.isAuthenticated) {
          reLaunch({ url: '/pages/login/index' })
          return
        }
        const localPayload = snapshot
        let result = null

        try {
          const cloudResult = await businessApi.distributeAsset({
            userId: localPayload.memberId,
            storeId: snapshot.storeId || runtime.currentStore.id,
            packageId: localPayload.packageId,
            expiryDate: localPayload.expiryDate,
            operatorId: runtime.userProfile.id,
            offlineAmount: localPayload.amount,
            payType: localPayload.payType,
            remark: localPayload.remark,
          })
          result = {
            ok: true,
            expiry: cloudResult && cloudResult.expiryDate || preview.expiry,
            message: '已为' + member.nickname + '派发 ' + targetPackage.lessons + ' 节' + targetPackage.typeLabel,
          }
        } catch (error) {
          result = { ok: false, message: getUserMessage(error, "派发失败，请重试") }
        }

        showFeedback({ title: result.message, messageParts: result.ok ? [{ text: '已为{0}派发{1}', values: [member.nickname, targetPackage.lessons + ' ' + t('节') + ' ' + t(targetPackage.typeLabel)] }] : null, icon: result.ok ? 'success' : 'none' })
        if (result.ok) {
          app.removeViewCacheByPrefix('workspace:')
          app.removeViewCacheByPrefix('admin:dashboard:')
          app.removeViewCacheByPrefix('admin:users')
          app.removeViewCacheByPrefix('profile:' + localPayload.memberId)
          this.setData({
            receipt: { name: member.nickname, phone: member.phone, packageName: targetPackage.name, lessons: targetPackage.lessons, typeLabel: targetPackage.typeLabel, amount: preview.amount, expiry: result.expiry, payType: snapshot.payType },
            selectedMemberId: '',
            selectedMember: null,
            selectedPackageId: '',
            selectedPackage: null,
            expiryDate: '',
            amount: '',
            payType: '微信转账',
            remark: '',
            step: 1,
          })
          this.syncPageData()
        }
    } catch (error) {
      showFeedback({ title: getUserMessage(error, '派发失败，请重试'), icon: 'none' })
    } finally {
      this.setData({ submitting: false })
    }
  },
}))
