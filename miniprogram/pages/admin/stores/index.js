const { showModal } = require('../../../utils/interaction')
const { showFeedback, reLaunch } = require('../../../utils/interaction')
const { getUserMessage } = require('../../../utils/user-feedback')
const withPageState = require('../../../utils/page-state')
const businessApi = require('../../../utils/business-api')
const media = require('../../../utils/profile-media')
const { normalizeGallery, defaultGallery } = require('../../../utils/store-gallery')

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
    showGalleryPopup: false,
    galleryStoreId: '',
    galleryStoreName: '',
    galleryDraft: [],
    galleryVersion: 0,
    galleryBusy: false,
    galleryError: '',
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
      reLaunch({ url: '/pages/login/index' })
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
      this.setData({ pageError: getUserMessage(error, "加载失败，请重试") })
      this.setData({ loading: false })
      if (!this.data.pageData.stores.length) {
        showFeedback({
          title: getUserMessage(error, '读取门店列表失败'),
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

  onOpenGallery(event) {
    if (this.data.submitting || this.data.galleryBusy) return
    const store = this.data.pageData.stores.find(item => item.id === event.currentTarget.dataset.storeId)
    if (!store) return
    this._galleryUserId = this.data.runtime.userProfile && this.data.runtime.userProfile.id
    this.setData({ showGalleryPopup: true, galleryStoreId: store.id, galleryStoreName: store.name, galleryDraft: normalizeGallery(store.gallery), galleryVersion: Number(store.galleryVersion || 0), galleryError: '' })
  },

  onCloseGallery() {
    if (this.data.galleryBusy) return
    this.setData({ showGalleryPopup: false, galleryStoreId: '', galleryDraft: [], galleryError: '' })
  },

  onGalleryTitleInput(event) {
    if (this.data.galleryBusy) return
    const index = Number(event.currentTarget.dataset.index)
    if (!this.data.galleryDraft[index]) return
    const galleryDraft = this.data.galleryDraft.map((item, i) => i === index ? { ...item, title: event.detail.value, defaultTitle: false } : item)
    this.setData({ galleryDraft, galleryError: '' })
  },

  onRemoveGalleryPhoto(event) {
    if (this.data.galleryBusy) return
    const index = Number(event.currentTarget.dataset.index)
    this.setData({ galleryDraft: this.data.galleryDraft.filter((_, i) => i !== index), galleryError: '' })
  },

  onResetGallery() {
    if (!this.data.galleryBusy) this.setData({ galleryDraft: defaultGallery(), galleryError: '' })
  },

  onPreviewGalleryPhoto(event) {
    const urls = this.data.galleryDraft.map(item => item.url)
    if (urls.length) return media.previewPhotos(urls, urls[Number(event.currentTarget.dataset.index) || 0])
  },

  async onChooseGalleryPhoto(event) {
    if (this.data.galleryBusy || this.data.submitting) return
    const replacing = event.currentTarget.dataset.index !== undefined
    const index = Number(event.currentTarget.dataset.index)
    if (replacing && !this.data.galleryDraft[index]) return
    if (!replacing && this.data.galleryDraft.length >= 6) return
    this.setData({ galleryBusy: true, galleryError: '' })
    try {
      await media.sameUser(this._galleryUserId)
      const paths = await media.choosePhotos(replacing ? 1 : 6 - this.data.galleryDraft.length)
      for (const filePath of paths) {
        const uploaded = await media.uploadPhoto(filePath, this._galleryUserId, 'store')
        await media.sameUser(this._galleryUserId)
        const galleryDraft = this.data.galleryDraft.slice()
        if (replacing) galleryDraft[index] = { ...galleryDraft[index], url: uploaded.fileId, defaultTitle: false }
        else if (galleryDraft.length < 6) galleryDraft.push({ url: uploaded.fileId, title: '', defaultTitle: false })
        this.setData({ galleryDraft })
        if (replacing) break
      }
    } catch (error) {
      if (!media.cancelled(error)) this.setData({ galleryError: getUserMessage(error, '图片上传未完成，请重新选择图片') })
    } finally { this.setData({ galleryBusy: false }) }
  },

  async onSaveGallery() {
    if (this.data.galleryBusy || this.data.submitting || !this.data.galleryStoreId) return
    this.setData({ galleryBusy: true, galleryError: '' })
    try {
      const runtime = await media.sameUser(this._galleryUserId)
      if (runtime.role !== 'admin') throw new Error('只有管理员可以更换门店图片')
      const result = await businessApi.updateStoreGallery({ targetStoreId: this.data.galleryStoreId, version: this.data.galleryVersion, gallery: this.data.galleryDraft.map(item => ({ url: item.url, title: item.title })) })
      const stores = this.data.pageData.stores.map(store => store.id === this.data.galleryStoreId ? { ...store, gallery: result.gallery, galleryVersion: result.version } : store)
      this.setData({ pageData: { ...this.data.pageData, stores }, showGalleryPopup: false, galleryStoreId: '', galleryDraft: [] })
      showFeedback({ title: '门店图片已保存', icon: 'success' })
      await this.refreshStoreState()
    } catch (error) {
      this.setData({ galleryError: getUserMessage(error, '门店图片保存未完成，请稍后重试') })
    } finally { this.setData({ galleryBusy: false }) }
  },

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
      showFeedback({ title: payload.error, icon: 'none' })
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
      showFeedback({
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
      showFeedback({
        title: getUserMessage(error, '保存门店失败'),
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
    showModal({
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
      showFeedback({
        title: nextStatus === 1 ? '门店已恢复营业' : '门店已停用',
        icon: 'success',
      })
      await this.refreshStoreState()
    } catch (error) {
      showFeedback({
        title: getUserMessage(error, '更新门店状态失败'),
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
    try {
      await app.getRuntimeSnapshotAsync({ force: true })
      await this.syncPageData()
      if (this.data.pageError) this.setData({ pageError: '门店变更已保存，但刷新未完成：' + this.data.pageError })
    } catch (error) {
      this.setData({ pageError: '门店变更已保存，但刷新未完成：' + getUserMessage(error, '请稍后重新读取门店资料') })
    }
  },
}))
