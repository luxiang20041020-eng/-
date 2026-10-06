const withPageState = require('../../../utils/page-state')
const businessApi = require('../../../utils/business-api')

const ADMIN_STORES_CACHE_KEY = 'admin:stores'

function buildDefaultStoreForm() {
  return {
    name: '',
    address: '',
    longitude: '',
    latitude: '',
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
    stores: safeData.stores || [],
  }
}

Page(withPageState({
  data: {
    runtime: {},
    pageData: normalizePageData(),
    hasPermission: false,
    loading: false,
    submitting: false,
    showStorePopup: false,
    editingStoreId: '',
    storeForm: buildDefaultStoreForm(),
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
    if (runtime.role !== 'admin') {
      this.setData({
        runtime,
        hasPermission: false,
        loading: false,
        pageData: normalizePageData(),
      })
      return
    }

    this.setData({
      runtime,
      hasPermission: true,
      loading: !hadCachedData && !this.data.pageData.stores.length,
    })

    try {
      const pageData = normalizePageData(await businessApi.getAdminStoreManageData())
      if (this._syncRequestId !== requestId) {
        return
      }
      app.setViewCache(ADMIN_STORES_CACHE_KEY, pageData)
      this.setData({
        runtime,
        hasPermission: true,
        pageData,
        loading: false,
      })
    } catch (error) {
      if (this._syncRequestId !== requestId) {
        return
      }
      this.setData({ pageError: error.message || "加载失败，请重试" })
      this.setData({ loading: false })
      if (!this.data.pageData.stores.length) {
        wx.showToast({
          title: error.message || '读取门店列表失败',
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
    const cachedPageData = app.getViewCache(ADMIN_STORES_CACHE_KEY)
    if (!cachedPageData) {
      return false
    }
    this.setData({
      runtime,
      hasPermission: true,
      pageData: normalizePageData(cachedPageData),
      loading: false,
    })
    return true
  },

  noop() {},

  onOpenCreatePopup() {
    this.setData({
      showStorePopup: true,
      editingStoreId: '',
      storeForm: buildDefaultStoreForm(),
    })
  },

  onOpenEditPopup(event) {
    const storeId = event.currentTarget.dataset.storeId
    const targetStore = this.data.pageData.stores.find((item) => item.id === storeId)
    if (!targetStore) {
      return
    }
    this.setData({
      showStorePopup: true,
      editingStoreId: storeId,
      storeForm: {
        name: targetStore.name || '',
        address: targetStore.address || '',
        longitude: targetStore.longitude === '' ? '' : String(targetStore.longitude),
        latitude: targetStore.latitude === '' ? '' : String(targetStore.latitude),
        status: targetStore.status,
      },
    })
  },

  onCloseStorePopup() {
    if (this.data.submitting) {
      return
    }
    this.setData({
      showStorePopup: false,
      editingStoreId: '',
      storeForm: buildDefaultStoreForm(),
    })
  },

  onStoreFieldInput(event) {
    const field = event.currentTarget.dataset.field
    if (!field) {
      return
    }
    this.setData({
      ['storeForm.' + field]: event.detail.value,
    })
  },

  onCreateStatusChange(event) {
    this.setData({
      'storeForm.status': event.detail.value ? 1 : 0,
    })
  },

  validateStoreForm() {
    const form = this.data.storeForm || buildDefaultStoreForm()
    const name = String(form.name || '').replace(/\s+/g, ' ').trim()
    const address = String(form.address || '').replace(/\s+/g, ' ').trim()
    const longitudeText = String(form.longitude || '').trim()
    const latitudeText = String(form.latitude || '').trim()
    const longitude = longitudeText ? Number(longitudeText) : null
    const latitude = latitudeText ? Number(latitudeText) : null

    if (!name) {
      return { error: '请输入门店名称' }
    }
    if (!address) {
      return { error: '请输入门店地址' }
    }
    if (longitudeText && (!Number.isFinite(longitude) || longitude < -180 || longitude > 180)) {
      return { error: '经度范围为 -180 到 180' }
    }
    if (latitudeText && (!Number.isFinite(latitude) || latitude < -90 || latitude > 90)) {
      return { error: '纬度范围为 -90 到 90' }
    }

    return {
      name,
      address,
      longitude,
      latitude,
      status: Number(form.status) === 1 ? 1 : 0,
    }
  },

  async onSubmitStore() {
    if (this.data.submitting) {
      return
    }
    const payload = this.validateStoreForm()
    if (payload.error) {
      wx.showToast({ title: payload.error, icon: 'none' })
      return
    }

    this.setData({ submitting: true })
    try {
      if (this.data.editingStoreId) {
        await businessApi.updateStore(Object.assign({}, payload, {
          targetStoreId: this.data.editingStoreId,
        }))
      } else {
        await businessApi.createStore(payload)
      }
      wx.showToast({
        title: this.data.editingStoreId ? '门店资料已更新' : '门店已创建',
        icon: 'success',
      })
      this.setData({
        showStorePopup: false,
        editingStoreId: '',
        storeForm: buildDefaultStoreForm(),
      })
      await this.refreshStoreState()
    } catch (error) {
      wx.showToast({
        title: error.message || '保存门店失败',
        icon: 'none',
      })
    } finally {
      this.setData({ submitting: false })
    }
  },

  onToggleStoreStatus(event) {
    if (this.data.submitting) {
      return
    }
    const storeId = event.currentTarget.dataset.storeId
    const targetStore = this.data.pageData.stores.find((item) => item.id === storeId)
    if (!targetStore) {
      return
    }
    const nextStatus = targetStore.status === 1 ? 0 : 1
    wx.showModal({
      title: nextStatus === 1 ? '确认恢复营业' : '确认停用门店',
      content: nextStatus === 1
        ? '恢复后，该门店会重新出现在首页门店选择中。'
        : '停用后，该门店将不再出现在首页和预约入口，历史人员与排课数据会保留。',
      success: (res) => {
        if (res.confirm) {
          this.submitStoreStatus(targetStore, nextStatus)
        }
      },
    })
  },

  async submitStoreStatus(targetStore, nextStatus) {
    if (this.data.submitting) return
    this.setData({ submitting: true })
    try {
      await businessApi.updateStoreStatus({
        targetStoreId: targetStore.id,
        nextStatus,
      })
      wx.showToast({
        title: nextStatus === 1 ? '门店已恢复营业' : '门店已停用',
        icon: 'success',
      })
      await this.refreshStoreState()
    } catch (error) {
      wx.showToast({
        title: error.message || '更新门店状态失败',
        icon: 'none',
      })
    } finally {
      this.setData({ submitting: false })
    }
  },

  async refreshStoreState() {
    const app = getApp()
    app.removeViewCacheByPrefix('admin:')
    app.removeViewCacheByPrefix('home:')
    app.removeViewCacheByPrefix('booking:')
    app.removeViewCacheByPrefix('workspace:')
    app.removeViewCacheByPrefix('profile:')
    await app.getRuntimeSnapshotAsync({ force: true })
    await this.syncPageData()
  },
}))
