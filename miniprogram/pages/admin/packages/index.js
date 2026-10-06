const withPageState = require('../../../utils/page-state')
const businessApi = require('../../../utils/business-api')

function formatPrice(price) {
  return Number(price || 0).toFixed(2)
}

function buildDefaultCreateForm() {
  return {
    name: '',
    type: 'private',
    lessons: '',
    price: '',
    status: 1,
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
    packages: safeData.packages || [],
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
      app.setViewCache(ADMIN_PACKAGES_CACHE_KEY, pageData)
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
    const cachedPageData = app.getViewCache(ADMIN_PACKAGES_CACHE_KEY)
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
    const field = event.currentTarget.dataset.field
    if (!field) {
      return
    }
    this.setData({
      ['createForm.' + field]: event.detail.value,
    })
  },

  onCreateTypeChange(event) {
    this.setData({
      'createForm.type': event.currentTarget.dataset.value,
    })
  },

  onCreateStatusChange(event) {
    this.setData({
      'createForm.status': event.detail.value ? 1 : 0,
    })
  },

  onTogglePackageStatus(event) {
    if (this.data.submittingPackageId || this.data.creatingPackage) {
      return
    }

    const packageId = event.currentTarget.dataset.packageId
    const targetPackage = (this.data.pageData.packages || []).find((item) => item.id === packageId)
    if (!targetPackage) {
      return
    }

    const isActive = Number(targetPackage.status) === 1
    wx.showModal({
      title: isActive ? '确认下架套餐' : '确认重新上架',
      content: isActive
        ? '下架后，首页价目表和派课入口将不再展示该套餐。'
        : '上架后，该套餐会重新出现在首页价目表和派课入口中。',
      success: (res) => {
        if (!res.confirm) {
          return
        }
        this.submitPackageStatus(targetPackage, isActive ? 0 : 1)
      },
    })
  },

  async submitPackageStatus(targetPackage, nextStatus) {
    if (this.data.submittingPackageId || this.data.creatingPackage) return
    this.setData({ submittingPackageId: targetPackage.id })
    try {
      await businessApi.updatePackageStatus({
        targetPackageId: targetPackage.id,
        nextStatus,
      })
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
    if (this.data.creatingPackage) {
      return
    }

    const form = this.data.createForm || buildDefaultCreateForm()
    const name = String(form.name || '').trim()
    const lessons = Number(form.lessons)
    const price = Number(form.price)

    if (!name) {
      wx.showToast({
        title: '请输入套餐名称',
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
    if (!Number.isInteger(lessons) || lessons <= 0) {
      wx.showToast({
        title: '课时数须为正整数',
        icon: 'none',
      })
      return
    }
    if (!Number.isFinite(price) || price < 0) {
      wx.showToast({
        title: '展示价不能小于 0',
        icon: 'none',
      })
      return
    }

    this.setData({ creatingPackage: true })
    try {
      await businessApi.createPackage({
        name,
        type: form.type,
        lessons: Math.floor(lessons),
        price,
        status: Number(form.status) === 1 ? 1 : 0,
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
