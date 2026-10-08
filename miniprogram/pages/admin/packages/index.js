const withPageState = require('../../../utils/page-state')
const businessApi = require('../../../utils/business-api')
const { confirmAction } = require('../../../utils/interaction')

function formatPrice(price) {
  return Number(price || 0).toFixed(2)
}

function buildDefaultCreateForm() {
  return {
    name: '',
    type: 'private',
    lessons: '',
    price: '',
    status: 0,
    validDays: '365',
  }
}

function normalizePageData(pageData) {
  const safeData = pageData || {}
  return {
    stats: Object.assign({
      total: 0,
      activeCount: 0,
      inactiveCount: 0,
    }, safeData.stats || {}),
    packages: (safeData.packages || []).map((item) => Object.assign({}, item, { validDays: Number(item.validDays || (item.type === 'group' ? 180 : 365)) })),
  }
}

function buildVisiblePackages(packages, filters) {
  const safePackages = packages || []
  const query = String(filters.keyword || '').trim().toLowerCase()
  const statusFilter = filters.statusFilter || 'all'
  const typeFilter = filters.typeFilter || 'all'

  return safePackages
    .filter((item) => {
      if (statusFilter === 'active' && Number(item.status) !== 1) {
        return false
      }
      if (statusFilter === 'inactive' && Number(item.status) === 1) {
        return false
      }
      if (typeFilter !== 'all' && item.type !== typeFilter) {
        return false
      }
      if (!query) {
        return true
      }
      return [
        item.name,
        item.typeLabel,
        item.statusLabel,
      ].some((field) => String(field || '').toLowerCase().includes(query))
    })
    .map((item) => Object.assign({}, item, {
      priceText: formatPrice(item.price),
      actionText: Number(item.status) === 1 ? '下架套餐' : '重新上架',
      actionMode: Number(item.status) === 1 ? 'off' : 'on',
    }))
}

const ADMIN_PACKAGES_CACHE_KEY = 'admin:packages'

Page(withPageState({
  data: {
    runtime: {},
    pageData: normalizePageData(),
    visiblePackages: [],
    hasPermission: false,
    loading: false,
    submittingPackageId: '',
    creatingPackage: false,
    keyword: '',
    statusFilter: 'all',
    typeFilter: 'all',
    filtersExpanded: false,
    showCreatePopup: false,
    createForm: buildDefaultCreateForm(),
  },

  onShow() {
    this.syncPageData()
  },

  async syncPageData() {
    const app = getApp()
    const initialRuntime = app.getRuntimeSnapshot()
    if (!initialRuntime.isAuthenticated || initialRuntime.role !== 'admin') this.setData({ hasPermission: false, pageData: normalizePageData(), visiblePackages: [], showCreatePopup: false })
    const hadCachedData = this.hydratePageData(initialRuntime)
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

    const hasPermission = runtime.role === 'admin'
    if (!hasPermission) {
      this.setData({
        runtime,
        hasPermission: false,
        loading: false,
        pageData: normalizePageData(),
        visiblePackages: [],
      })
      return
    }

    this.setData({
      runtime,
      hasPermission: true,
      loading: !hadCachedData && !(this.data.pageData.packages || []).length,
    })

    try {
      const pageData = normalizePageData(await businessApi.getAdminPackageManageData())
      if (this._syncRequestId !== requestId) {
        return
      }
      app.setViewCache(ADMIN_PACKAGES_CACHE_KEY + ':' + runtime.userProfile.id, pageData)
      this.setData({
        runtime,
        hasPermission: true,
        pageData,
        visiblePackages: buildVisiblePackages(pageData.packages, this.data),
        loading: false,
      })
    } catch (error) {
      if (this._syncRequestId !== requestId) {
        return
      }
      this.setData({ pageError: error.message || "加载失败，请重试" })
      this.setData({
        runtime,
        hasPermission: true,
        loading: false,
      })
      if (!(this.data.pageData.packages || []).length) {
        wx.showToast({
          title: error.message || '读取套餐列表失败',
          icon: 'none',
        })
      }
    }
  },

  hydratePageData(runtime) {
    const app = getApp()
    if (!runtime || !runtime.isAuthenticated || runtime.role !== 'admin') {
      return false
    }
    const cachedPageData = app.getViewCache(ADMIN_PACKAGES_CACHE_KEY + ':' + runtime.userProfile.id)
    if (!cachedPageData) {
      return false
    }
    const pageData = normalizePageData(cachedPageData)
    this.setData({
      runtime,
      hasPermission: true,
      pageData,
      visiblePackages: buildVisiblePackages(pageData.packages, this.data),
      loading: false,
    })
    return true
  },

  refreshVisiblePackages(patch = {}) {
    const nextState = Object.assign({}, this.data, patch)
    this.setData(Object.assign({}, patch, {
      visiblePackages: buildVisiblePackages(nextState.pageData.packages, nextState),
    }))
  },

  onKeywordInput(event) {
    this.refreshVisiblePackages({
      keyword: event.detail.value || '',
    })
  },

  onClearKeyword() {
    this.refreshVisiblePackages({
      keyword: '',
    })
  },
  onResetFilters() { this.refreshVisiblePackages({ keyword: '', statusFilter: 'all', typeFilter: 'all' }) },

  onStatusFilterChange(event) {
    this.refreshVisiblePackages({
      statusFilter: event.currentTarget.dataset.value,
    })
  },

  onTypeFilterChange(event) {
    this.refreshVisiblePackages({
      typeFilter: event.currentTarget.dataset.value,
    })
  },

  onToggleFilters() {
    this.setData({
      filtersExpanded: !this.data.filtersExpanded,
    })
  },

  noop() {},

  onOpenCreatePopup() {
    if (!this.data.hasPermission || this.data.submittingPackageId || this.data.creatingPackage || this.data.pageError || this.data.pageBusy) return
    this.setData({
      showCreatePopup: true,
      createForm: buildDefaultCreateForm(),
    })
  },

  onCloseCreatePopup() {
    if (this.data.creatingPackage) {
      return
    }
    this.setData({
      showCreatePopup: false,
      createForm: buildDefaultCreateForm(),
    })
  },

  onCreateFieldInput(event) {
    if (this.data.creatingPackage) return
    const field = event.currentTarget.dataset.field
    if (!['name', 'lessons', 'price', 'validDays'].includes(field)) {
      return
    }
    this.setData({
      createForm: Object.assign({}, this.data.createForm, { [field]: event.detail.value }),
    })
  },

  onCreateTypeChange(event) {
    if (this.data.creatingPackage) return
    const type = event.currentTarget.dataset.value
    if (!['group', 'private'].includes(type)) return
    this.setData({
      createForm: Object.assign({}, this.data.createForm, { type, validDays: type === 'group' ? '180' : '365' }),
    })
  },

  onCreateStatusChange(event) {
    if (this.data.creatingPackage) return
    this.setData({
      createForm: Object.assign({}, this.data.createForm, { status: event.detail.value ? 1 : 0 }),
    })
  },

  async onTogglePackageStatus(event) {
    if (this.data.submittingPackageId || this.data.creatingPackage || !this.data.hasPermission || this.data.pageError || this.data.pageBusy) {
      return
    }

    const packageId = event.currentTarget.dataset.packageId
    const targetPackage = (this.data.pageData.packages || []).find((item) => item.id === packageId)
    if (!targetPackage) {
      return
    }

    const isActive = Number(targetPackage.status) === 1
    return this.submitPackageStatus(targetPackage, isActive ? 0 : 1)
  },

  async submitPackageStatus(targetPackage, nextStatus) {
    if (this.data.submittingPackageId || this.data.creatingPackage || !this.data.hasPermission || this.data.pageError || this.data.pageBusy) return
    this.setData({ submittingPackageId: targetPackage.id })
    try {
      if (!await confirmAction({ title: nextStatus === 1 ? '确认上架套餐' : '确认下架套餐', content: targetPackage.name + '\n' + targetPackage.lessons + ' 节 · ¥' + formatPrice(targetPackage.price) + '\n' + (nextStatus === 1 ? '上架后展示在首页价目表，可用于权益派发。' : '下架后停止展示与新派发，学员已获得的课时仍可使用。') })) return
      const result = await businessApi.updatePackageStatus({
        targetPackageId: targetPackage.id,
        nextStatus,
      })
      const updatedPackage = result && result.packageInfo || Object.assign({}, targetPackage, { status: nextStatus, statusLabel: nextStatus === 1 ? '已上架' : '已下架' })
      const packages = this.data.pageData.packages.map((item) => item.id === targetPackage.id ? updatedPackage : item)
      this.setData({ pageData: normalizePageData({ packages, stats: { total: packages.length, activeCount: packages.filter((p) => Number(p.status) === 1).length, inactiveCount: packages.filter((p) => Number(p.status) !== 1).length } }) })
      this.refreshVisiblePackages()
      wx.showToast({
        title: nextStatus === 1 ? '套餐已上架' : '套餐已下架',
        icon: 'success',
      })
      const app = getApp()
      app.removeViewCacheByPrefix('admin:')
      app.removeViewCacheByPrefix('home:')
      app.removeViewCacheByPrefix('workspace:distribute:')
      await this.syncPageData()
    } catch (error) {
      wx.showToast({
        title: error.message || '更新套餐状态失败',
        icon: 'none',
      })
    } finally {
      this.setData({ submittingPackageId: '' })
    }
  },

  async onSubmitCreatePackage() {
    if (this.data.creatingPackage || this.data.submittingPackageId || !this.data.hasPermission || this.data.pageError || this.data.pageBusy) {
      return
    }

    const form = this.data.createForm || buildDefaultCreateForm()
    const name = String(form.name || '').trim()
    const lessons = Number(form.lessons)
    const price = Number(form.price)
    const validDays = Number(form.validDays)

    if (!name || name.length > 60) {
      wx.showToast({
        title: '套餐名称须为 1 至 60 个字',
        icon: 'none',
      })
      return
    }
    if (!['group', 'private'].includes(form.type)) {
      wx.showToast({
        title: '请选择套餐类型',
        icon: 'none',
      })
      return
    }
    if (!Number.isInteger(lessons) || lessons <= 0 || lessons > 10000) {
      wx.showToast({
        title: '课时数须为 1 至 10000 的整数',
        icon: 'none',
      })
      return
    }
    if (!/^\d+(\.\d{1,2})?$/.test(String(form.price).trim())) {
      wx.showToast({
        title: '请填写金额，最多两位小数',
        icon: 'none',
      })
      return
    }
    if (!Number.isInteger(validDays) || validDays < 1 || validDays > 3650) {
      wx.showToast({ title: '有效期须为 1 至 3650 天', icon: 'none' }); return
    }

    this.setData({ creatingPackage: true })
    try {
      if (!await confirmAction({ title: Number(form.status) === 1 ? '创建并上架套餐' : '创建下架套餐', content: name + '\n' + lessons + ' 节 · ¥' + formatPrice(price) + '\n有效期 ' + validDays + ' 天\n' + (Number(form.status) === 1 ? '创建后立即展示并可派发。' : '创建后暂不展示，审核内容后可再上架。') })) return
      await businessApi.createPackage({
        name,
        type: form.type,
        lessons: Math.floor(lessons),
        price,
        status: Number(form.status) === 1 ? 1 : 0,
        validDays,
      })
      wx.showToast({
        title: '套餐已创建',
        icon: 'success',
      })
      const app = getApp()
      app.removeViewCacheByPrefix('admin:')
      app.removeViewCacheByPrefix('home:')
      app.removeViewCacheByPrefix('workspace:distribute:')
      this.setData({
        showCreatePopup: false,
        createForm: buildDefaultCreateForm(),
        keyword: '', statusFilter: Number(form.status) === 1 ? 'active' : 'inactive', typeFilter: 'all',
      })
      await this.syncPageData()
    } catch (error) {
      wx.showToast({
        title: error.message || '创建套餐失败',
        icon: 'none',
      })
    } finally {
      this.setData({ creatingPackage: false })
    }
  },
}))
