const { showModal } = require('../../utils/interaction')
const { showFeedback, redirectTo, setClipboardData, openLocation, showActionSheet } = require('../../utils/interaction')
const { getUserMessage } = require('../../utils/user-feedback')
const withPageState = require('../../utils/page-state')
const businessApi = require('../../utils/business-api')
const media = require('../../utils/profile-media')
const { normalizeGallery } = require('../../utils/store-gallery')

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
  },

  onShow() {
    this.syncPageData()
  },

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
    } finally {
      this.setData({ pageLoading: false })
    }
  },

  onSwitchStore(event) {
    const app = getApp()
    const { storeId } = event.currentTarget.dataset
    if (!storeId || storeId === this.data.runtime.currentStore.id) {
      return
    }
    app.switchStore(storeId)
    this.syncPageData()
  },

  onOpenStorePicker() {
    const stores = this.data.runtime.stores || []
    if (!stores.length) {
      showFeedback({
        title: '暂无可选场地',
        icon: 'none',
      })
      return
    }

    showActionSheet({
      itemList: stores.map((item) => item.name),
      success: (res) => {
        const targetStore = stores[res.tapIndex]
        if (!targetStore) {
          return
        }
        this.onSwitchStore({
          currentTarget: {
            dataset: {
              storeId: targetStore.id,
            },
          },
        })
      },
    })
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
    const store = this.data.pageData.currentStore || {}
    if (Number.isFinite(store.latitude) && Number.isFinite(store.longitude)) {
      openLocation({ latitude: store.latitude, longitude: store.longitude, name: store.name, address: store.address, scale: 16 })
    } else if (store.address) {
      setClipboardData({ data: store.address, success: () => showFeedback({ title: '门店地址已复制', icon: 'success' }) })
    } else {
      showFeedback({ title: '门店尚未填写地址，请联系场馆', icon: 'none' })
    }
  },
}))
