const { showModal } = require('../../utils/interaction')
const { showFeedback, redirectTo, setClipboardData, openLocation } = require('../../utils/interaction')
const { getUserMessage } = require('../../utils/user-feedback')
const withPageState = require('../../utils/page-state')
const businessApi = require('../../utils/business-api')
const media = require('../../utils/profile-media')
const { normalizeGallery } = require('../../utils/store-gallery')
const storeLocation = require('../../utils/store-location')

function decorateHomePageData(pageData) {
  const safeData = pageData || {}
  return Object.assign({}, safeData, {
    galleryList: normalizeGallery(safeData.galleryList),
    heroNotice: safeData.notices && safeData.notices.length ? safeData.notices[0] : '安排下一次训练，从选择适合的场次开始。',
  })
}

function buildHomeCacheKey(runtime) {
  return 'home:' + (runtime && runtime.currentStore ? runtime.currentStore.id : 'default')
}

Page(withPageState({
  data: {
    runtime: {},
    pageData: {},
    pageLoading: false,
    pricingExpanded: false,
    storePickerVisible: false,
    storeOptions: [],
    storeDetail: null,
    locating: false,
    locationReady: false,
    locationDenied: false,
    locationError: '',
  },

  onShow() {
    this.syncPageData()
  },

  onHide() {
    this._locationRequest = (this._locationRequest || 0) + 1
    this.setData({ locating: false })
  },
  onUnload() { this._locationRequest = (this._locationRequest || 0) + 1 },

  hydratePageData(runtime) {
    const app = getApp()
    const cacheKey = buildHomeCacheKey(runtime)
    const cachedPageData = app.getViewCache(cacheKey)
    const pageData = cachedPageData || app.getHomePageData()

    this.setData({
      runtime: Object.assign({}, runtime, { stores: pageData.stores || runtime.stores }),
      pageData: decorateHomePageData(pageData),
      pageLoading: false,
    })
    this.updateStoreOptions()

    return Boolean(cachedPageData)
  },

  async syncPageData() {
    const app = getApp()
    const initialRuntime = app.getRuntimeSnapshot()
    const hadCachedData = this.hydratePageData(initialRuntime)
    const requestId = (this._syncRequestId || 0) + 1
    this._syncRequestId = requestId

    if (!hadCachedData && !(this.data.pageData && this.data.pageData.currentStore)) {
      this.setData({ pageLoading: true })
    }

    try {
      const runtime = await app.getRuntimeSnapshotAsync()
      if (this._syncRequestId !== requestId) return
      const pageData = await businessApi.getHomeViewData({
        storeId: runtime.currentStore.id,
      })
      if (this._syncRequestId !== requestId) {
        return
      }
      app.setViewCache(buildHomeCacheKey(runtime), pageData)
      this.setData({
        runtime: Object.assign({}, runtime, { stores: pageData.stores || runtime.stores }),
        pageData: decorateHomePageData(pageData),
      })
      app.globalData.stores = pageData.stores || []
      if (pageData.currentStore) app.switchStore(pageData.currentStore.id)
      this.updateStoreOptions()
      const tabbar = this.selectComponent('#tabbar')
      if (tabbar) tabbar.syncTabs()
    } catch (error) {
      if (this._syncRequestId !== requestId) {
        return
      }
      this.setData({ pageError: getUserMessage(error, "加载失败，请重试") })
      const runtime = app.getRuntimeSnapshot()
      this.setData({
        runtime,
        pageData: decorateHomePageData(app.getViewCache(buildHomeCacheKey(runtime)) || app.getHomePageData()),
      })
      this.updateStoreOptions()
    } finally {
      this.setData({ pageLoading: false })
    }
  },

  onSwitchStore(event) {
    const app = getApp()
    const { storeId } = event.currentTarget.dataset
    if (!storeId || !(this.data.runtime.stores || []).some(store => store.id === storeId)) return
    this.setData({ storePickerVisible: false, storeDetail: null })
    if (storeId === (this.data.runtime.currentStore || {}).id) {
      return
    }
    app.switchStore(storeId)
    this.syncPageData()
  },

  onOpenStorePicker() {
    this.updateStoreOptions()
    const stores = this.data.storeOptions
    if (!stores.length) {
      showFeedback({
        title: '暂无可选场地',
        icon: 'none',
      })
      return
    }

    this.setData({ storePickerVisible: true, storeDetail: null })
  },

  noop() {},

  updateStoreOptions() {
    const origin = this._storeLocation && Date.now() - this._storeLocationAt < 5 * 60000 ? this._storeLocation : null
    const cachedStores = this.data.pageData.stores || []
    const stores = (this.data.runtime.stores || cachedStores).map(store => {
      const cached = cachedStores.find(item => item.id === store.id) || {}
      const gallery = store.gallery || cached.gallery || (store.id === (this.data.pageData.currentStore || {}).id ? this.data.pageData.galleryList : [])
      return { ...cached, ...store, gallery }
    })
    const storeOptions = storeLocation.decorateStores(stores, origin)
    const detail = this.data.storeDetail && storeOptions.find(store => store.id === this.data.storeDetail.id)
    this.setData({ storeOptions, locationReady: Boolean(origin), storeDetail: detail || null })
  },

  onCloseStorePicker() { this.setData({ storePickerVisible: false, storeDetail: null }) },
  onBackToStores() { this.setData({ storeDetail: null }) },

  onViewStore(event) {
    const id = event.currentTarget.dataset.storeId || (this.data.pageData.currentStore || {}).id
    this.updateStoreOptions()
    const store = this.data.storeOptions.find(item => item.id === id)
    if (store) this.setData({ storePickerVisible: true, storeDetail: store })
  },

  async onLocateStores() {
    if (this.data.locating) return
    const request = (this._locationRequest || 0) + 1; this._locationRequest = request
    this.setData({ locating: true, locationError: '', locationDenied: false })
    try {
      const origin = await storeLocation.locate(this)
      if (request !== this._locationRequest) return
      this._storeLocation = origin; this._storeLocationAt = Date.now()
      this.updateStoreOptions()
    } catch (error) {
      if (request === this._locationRequest) this.setData({ locationError: getUserMessage(error, '暂时无法获取位置，请稍后重试；您仍可查看门店地址'), locationDenied: error.code === 'LOCATION_DENIED' })
    } finally { if (request === this._locationRequest) this.setData({ locating: false }) }
  },

  onOpenLocationSettings() {
    if (this.data.locating) return
    wx.openSetting({ success: result => { if (result.authSetting && result.authSetting['scope.userLocation']) this.onLocateStores() }, fail: () => this.setData({ locationError: '设置页面未能打开，请在微信设置中开启定位权限' }) })
  },

  onPreviewStorePhoto(event) {
    const gallery = this.data.storeDetail && this.data.storeDetail.gallery || [], urls = gallery.map(item => item.url)
    if (urls.length) return media.previewPhotos(urls, urls[Number(event.currentTarget.dataset.index) || 0])
  },

  onCopyStoreAddress() {
    const store = this.data.storeDetail || {}
    if (store.address) setClipboardData({ data: store.address, success: () => showFeedback({ title: '门店地址已复制', icon: 'success' }) })
  },

  onCallStore() {
    const phone = (this.data.storeDetail || {}).phone
    if (phone) wx.makePhoneCall({ phoneNumber: phone.replace(/[^+0-9]/g, ''), fail: error => { if (!/cancel|取消/i.test(error.errMsg || '')) showFeedback({ title: '电话未能拨出，请稍后重试', icon: 'none' }) } })
  },

  onBellTap() {
    showModal({ title: '训练小贴士', content: (this.data.pageData.notices || []).join('\n\n') || '欢迎到馆了解适合自己的训练计划。', showCancel: false, confirmText: '知道了' })
  },

  onTogglePricing() {
    this.setData({
      pricingExpanded: !this.data.pricingExpanded,
    })
  },

  goBooking(event) {
    const type = event && event.currentTarget.dataset.type || 'group'
    redirectTo({ url: '/pages/booking/index?type=' + type })
  },

  goMySchedule() {
    redirectTo({ url: '/pages/profile/index?section=bookings' })
  },

  goIdentityQr() {
    redirectTo({ url: '/pages/profile/index?section=identity' })
  },

  onPreviewGallery(event) {
    const urls = (this.data.pageData.galleryList || []).map(item => item.url)
    if (urls.length) return media.previewPhotos(urls, urls[Number(event.currentTarget.dataset.index) || 0])
  },

  onOpenLocation() {
    const store = this.data.storeDetail || this.data.pageData.currentStore || {}, coordinates = storeLocation.point(store)
    if (coordinates) {
      openLocation({ ...coordinates, name: store.name, address: store.address, scale: 16 })
    } else if (store.address) {
      setClipboardData({ data: store.address, success: () => showFeedback({ title: '门店地址已复制', icon: 'success' }) })
    } else {
      showFeedback({ title: '门店尚未填写地址，请联系场馆', icon: 'none' })
    }
  },
}))
