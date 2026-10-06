const { ROLE_LIST, STORE_LIST, GALLERY_LIST, COACH_QUICK_ACTIONS } = require('./utils/app-config')
const businessApi = require('./utils/business-api')

const AUTH_REFRESH_INTERVAL = 60000
const VIEW_CACHE_TTL = 5 * 60 * 1000
const SELECTED_STORE_STORAGE_KEY = 'selectedStoreId'
const SESSION_DISMISSED_STORAGE_KEY = 'one.sessionDismissed'

function getSelectedStoreStorageKey(userId) {
  return userId ? SELECTED_STORE_STORAGE_KEY + ':' + userId : SELECTED_STORE_STORAGE_KEY
}

function deepClone(data) {
  return JSON.parse(JSON.stringify(data))
}

function formatMoney(amount) {
  return Number(amount || 0).toFixed(2)
}

function getRoleMeta(role) {
  return ROLE_LIST.find((item) => item.value === role) || ROLE_LIST[0]
}

function buildGuestUserProfile() {
  return {
    id: '',
    nickname: '未登录用户',
    phone: '',
    levelText: '请先完成手机号登录',
    homeStoreId: STORE_LIST[0] ? STORE_LIST[0].id : '',
    role: 'client',
  }
}

function normalizeCloudUserProfile(profile) {
  if (!profile) {
    return null
  }
  return {
    id: profile.id || '',
    nickname: profile.nickname || '未命名用户',
    phone: profile.phone || '',
    levelText: profile.levelText || '综合格斗会员',
    homeStoreId: profile.homeStoreId || (STORE_LIST[0] ? STORE_LIST[0].id : ''),
    role: profile.role || 'client',
  }
}

function getAssetLabelByType(type) {
  return type === 'group' ? '团体' : '专属'
}

function buildClassSummary(schedule, roster) {
  const safeRoster = roster || []
  const checkedCount = safeRoster.filter((item) => item.status === '已核销').length
  const absentCount = safeRoster.filter((item) => item.status === '已缺席').length
  return Object.assign({}, schedule, {
    checkedCount,
    absentCount,
  })
}

App({
  onLaunch() {
    const storedStoreId = wx.getStorageSync(SELECTED_STORE_STORAGE_KEY)
    const initialStoreId = STORE_LIST.some((item) => item.id === storedStoreId)
      ? storedStoreId
      : STORE_LIST[0].id
    this.globalData = {
      env: 'cloud1-d2g8aw97349a6c619',
      role: 'client',
      selectedStoreId: initialStoreId,
      selectedCoachClassId: '',
      stores: deepClone(STORE_LIST),
      userProfile: buildGuestUserProfile(),
      isAuthenticated: false,
      sessionDismissed: Boolean(wx.getStorageSync(SESSION_DISMISSED_STORAGE_KEY)),
      authMode: 'cloud',
      lastAuthSyncAt: 0,
      viewCache: {},
      members: [],
      packageOptions: [],
      banners: [],
      packages: [],
      galleryList: deepClone(GALLERY_LIST),
      coaches: [],
      bookingDates: [],
      schedules: [],
      myBookings: [],
      classRosterMap: {},
      coachScheduleBoard: [],
      assets: { privateCount: 0, groupCount: 0, privateExpiry: '', groupExpiry: '' },
      todayClasses: [],
      coachQuickActions: deepClone(COACH_QUICK_ACTIONS),
      auditOverview: { addedPrivateLessons: 0, addedGroupLessons: 0, incomeAmount: 0, writeOffCount: 0 },
      auditLogs: [],
      trainingStats: { monthLessons: 0, streakDays: 0, totalLessons: 0 },
    }

    if (wx.cloud && this.globalData.env) {
      wx.cloud.init({
        env: this.globalData.env,
        traceUser: true,
      })
    }
  },

  getCurrentStore() {
    return this.globalData.stores.find((item) => item.id === this.globalData.selectedStoreId) || this.globalData.stores[0] || { id: '', name: '暂无营业门店', address: '' }
  },

  getMemberById(memberId) {
    return this.globalData.members.find((item) => item.id === memberId)
  },

  getCurrentUserMember() {
    return this.getMemberById(this.globalData.userProfile.id)
  },

  syncCurrentUserAssetsFromMember() {
    const currentUser = this.getCurrentUserMember()
    if (!currentUser) {
      this.globalData.assets.privateCount = 0
      this.globalData.assets.groupCount = 0
      this.globalData.assets.privateExpiry = ''
      this.globalData.assets.groupExpiry = ''
      return
    }

    this.globalData.assets.privateCount = currentUser.privateCount
    this.globalData.assets.groupCount = currentUser.groupCount
    this.globalData.assets.privateExpiry = currentUser.privateExpiry || ''
    this.globalData.assets.groupExpiry = currentUser.groupExpiry || ''
  },

  getTabItems() {
    const role = this.globalData.role
    const baseTabs = [
      { key: 'home', label: '首页', path: '/pages/home/index' },
      { key: 'booking', label: '预约', path: '/pages/booking/index' },
    ]

    if (role === 'coach') {
      baseTabs.push({ key: 'workspace', label: '工作台', path: '/pages/workspace/index' })
    }

    if (role === 'admin') {
      baseTabs.push({ key: 'admin', label: '看板', path: '/pages/admin/index' })
    }

    baseTabs.push({ key: 'profile', label: '我的', path: '/pages/profile/index' })
    return baseTabs
  },

  getRuntimeSnapshot() {
    const currentStore = this.getCurrentStore()
    const roleMeta = getRoleMeta(this.globalData.role)

    return {
      role: this.globalData.role,
      roleLabel: roleMeta.label,
      currentStore,
      stores: deepClone(this.globalData.stores),
      assets: deepClone(this.globalData.assets),
      userProfile: deepClone(this.globalData.userProfile),
      tabItems: this.getTabItems(),
      roleList: this.globalData.isAuthenticated ? [deepClone(roleMeta)] : deepClone(ROLE_LIST),
      allowRoleSwitch: false,
      isAuthenticated: this.globalData.isAuthenticated,
      authMode: this.globalData.authMode,
    }
  },

  switchStore(storeId) {
    const targetStore = this.globalData.stores.find((item) => item.id === storeId)
    if (!targetStore) {
      return this.getRuntimeSnapshot()
    }
    this.globalData.selectedStoreId = targetStore.id
    wx.setStorageSync(SELECTED_STORE_STORAGE_KEY, targetStore.id)
    const userId = this.globalData.userProfile && this.globalData.userProfile.id
    if (userId) {
      wx.setStorageSync(getSelectedStoreStorageKey(userId), targetStore.id)
    }
    return this.getRuntimeSnapshot()
  },

  applyCloudSession(sessionData) {
    this._authVersion = (this._authVersion || 0) + 1
    const normalizedProfile = normalizeCloudUserProfile(sessionData && sessionData.userProfile)
    const normalizedStores = sessionData && sessionData.stores && sessionData.stores.length
      ? deepClone(sessionData.stores)
      : this.globalData.stores
    const previousUserId = this.globalData.userProfile ? this.globalData.userProfile.id : ''
    const currentUserId = normalizedProfile ? normalizedProfile.id : ''

    this.globalData.stores = normalizedStores

    if (!normalizedProfile) {
      this.resetGuestSession()
      return this.getRuntimeSnapshot()
    }

    this.globalData.sessionDismissed = false
    wx.setStorageSync(SESSION_DISMISSED_STORAGE_KEY, false)
    this.globalData.isAuthenticated = true
    this.globalData.authMode = 'cloud'
    this.globalData.role = normalizedProfile.role || 'client'
    this.globalData.userProfile = normalizedProfile
    const sessionStoreId = sessionData && sessionData.currentStore ? sessionData.currentStore.id : ''
    const savedUserStoreId = currentUserId ? wx.getStorageSync(getSelectedStoreStorageKey(currentUserId)) : ''
    const shouldKeepSelectedStore = previousUserId && previousUserId === currentUserId
    const candidateStoreId = shouldKeepSelectedStore
      ? (this.globalData.selectedStoreId || normalizedProfile.homeStoreId || sessionStoreId)
      : (savedUserStoreId || normalizedProfile.homeStoreId || sessionStoreId || this.globalData.selectedStoreId)
    const hasCandidateStore = normalizedStores.some((item) => item.id === candidateStoreId)

    this.globalData.selectedStoreId = hasCandidateStore
      ? candidateStoreId
      : (normalizedStores[0] ? normalizedStores[0].id : '')
    if (this.globalData.selectedStoreId) {
      wx.setStorageSync(SELECTED_STORE_STORAGE_KEY, this.globalData.selectedStoreId)
      wx.setStorageSync(getSelectedStoreStorageKey(currentUserId), this.globalData.selectedStoreId)
    }
    this.globalData.lastAuthSyncAt = Date.now()
    this.syncCurrentUserAssetsFromMember()
    return this.getRuntimeSnapshot()
  },

  resetGuestSession() {
    this._authVersion = (this._authVersion || 0) + 1
    const previousStoreId = this.globalData.selectedStoreId
    const guestStores = this.globalData.stores && this.globalData.stores.length
      ? this.globalData.stores
      : STORE_LIST
    const hasPreviousStore = guestStores.some((item) => item.id === previousStoreId)
    this.globalData.isAuthenticated = false
    this.globalData.authMode = 'cloud'
    this.globalData.role = 'client'
    this.globalData.userProfile = buildGuestUserProfile()
    this.globalData.selectedStoreId = hasPreviousStore
      ? previousStoreId
      : (guestStores[0] ? guestStores[0].id : '')
    this.globalData.lastAuthSyncAt = Date.now()
    this.globalData.viewCache = {}
    this.syncCurrentUserAssetsFromMember()
    return this.getRuntimeSnapshot()
  },

  completeLogout() {
    this.resetGuestSession()
    this.globalData.sessionDismissed = true
    wx.setStorageSync(SESSION_DISMISSED_STORAGE_KEY, true)
    this.globalData.selectedCoachClassId = ''
    this.globalData.members = []
    this.globalData.myBookings = []
    this.globalData.classRosterMap = {}
    this.globalData.coachScheduleBoard = []
    this.globalData.todayClasses = []
    this.globalData.auditLogs = []
    this.globalData.auditOverview = { addedPrivateLessons: 0, addedGroupLessons: 0, incomeAmount: 0, writeOffCount: 0 }
    this.globalData.trainingStats = { monthLessons: 0, streakDays: 0, totalLessons: 0 }
    this.globalData.assets = { privateCount: 0, groupCount: 0, privateExpiry: '', groupExpiry: '' }
    return this.getRuntimeSnapshot()
  },

  applyUserProfileUpdate(profilePatch) {
    const patch = profilePatch || {}
    const currentUserId = this.globalData.userProfile ? this.globalData.userProfile.id : ''
    const nextNickname = String(patch.nickname || '').trim()

    if (!currentUserId || !nextNickname) {
      return this.getRuntimeSnapshot()
    }

    this.globalData.userProfile = Object.assign({}, this.globalData.userProfile, {
      nickname: nextNickname,
    })

    const currentMember = this.getMemberById(currentUserId)
    if (currentMember) {
      currentMember.nickname = nextNickname
    }

    this.globalData.myBookings.forEach((item) => {
      if (item.userId === currentUserId) {
        item.userName = nextNickname
      }
    })

    Object.keys(this.globalData.classRosterMap || {}).forEach((classId) => {
      const roster = this.globalData.classRosterMap[classId] || []
      roster.forEach((item) => {
        if (item.userId === currentUserId) {
          item.userName = nextNickname
        }
      })
    })

    this.removeViewCacheByPrefix('profile:' + currentUserId)
    this.removeViewCacheByPrefix('booking:' + currentUserId + ':')
    this.removeViewCacheByPrefix('workspace:')
    return this.getRuntimeSnapshot()
  },

  async refreshUserSession(options = {}) {
    if (this.globalData.sessionDismissed) return false
    const force = Boolean(options.force)
    if (this._authRefreshingPromise) {
      return this._authRefreshingPromise
    }
    if (!force && this.globalData.lastAuthSyncAt && Date.now() - this.globalData.lastAuthSyncAt < AUTH_REFRESH_INTERVAL) {
      return this.globalData.isAuthenticated
    }

    this._authRefreshingPromise = (async () => {
      const authVersion = this._authVersion || 0
      try {
        const sessionData = await businessApi.getCurrentUserSession()
        if ((this._authVersion || 0) !== authVersion) return this.globalData.isAuthenticated
        if (sessionData && sessionData.loggedIn && sessionData.userProfile) {
          this.applyCloudSession(sessionData)
          return true
        }
        this.resetGuestSession()
        return false
      } catch (error) {
        return this.globalData.isAuthenticated
      } finally {
        this._authRefreshingPromise = null
      }
    })()

    return this._authRefreshingPromise
  },

  async getRuntimeSnapshotAsync(options = {}) {
    await this.refreshUserSession(options)
    return this.getRuntimeSnapshot()
  },

  getViewCache(cacheKey, options = {}) {
    if (!cacheKey) {
      return null
    }
    const maxAge = typeof options.maxAge === 'number' ? options.maxAge : VIEW_CACHE_TTL
    const cacheItem = this.globalData.viewCache[cacheKey]
    if (!cacheItem || Date.now() - cacheItem.updatedAt > maxAge) {
      return null
    }
    return deepClone(cacheItem.data)
  },

  setViewCache(cacheKey, data) {
    if (!cacheKey) {
      return
    }
    this.globalData.viewCache[cacheKey] = {
      updatedAt: Date.now(),
      data: deepClone(data),
    }
  },

  removeViewCache(cacheKey) {
    if (cacheKey) {
      delete this.globalData.viewCache[cacheKey]
    }
  },

  removeViewCacheByPrefix(prefix) {
    if (!prefix) {
      return
    }
    Object.keys(this.globalData.viewCache).forEach((cacheKey) => {
      if (cacheKey.indexOf(prefix) === 0) {
        delete this.globalData.viewCache[cacheKey]
      }
    })
  },

  getHomePageData() {
    return {
      notices: deepClone(this.globalData.banners),
      currentStore: this.getCurrentStore(),
      packages: deepClone(this.globalData.packages),
      galleryList: deepClone(this.globalData.galleryList),
    }
  },

  getBookingPageData(filters) {
    const state = this.getRuntimeSnapshot()
    const currentUserId = this.globalData.userProfile.id
    const query = Object.assign(
      {
        type: 'group',
        coachId: 'all',
        dateKey: (this.globalData.bookingDates[0] || {}).key || '',
      },
      filters || {}
    )

    const scheduleList = this.globalData.schedules.filter((item) => {
      if (item.storeId !== state.currentStore.id) {
        return false
      }
      if (query.type && item.type !== query.type) {
        return false
      }
      if (query.coachId !== 'all' && item.coachId !== query.coachId) {
        return false
      }
      if (query.dateKey && item.dateKey !== query.dateKey) {
        return false
      }
      return item.status !== '已取消'
    }).map((item) => {
      const isBooked = this.globalData.myBookings.some(
        (booking) => booking.userId === currentUserId && booking.scheduleId === item.id && booking.status === '待到店'
      )
      return Object.assign({}, item, {
        typeLabel: getAssetLabelByType(item.type),
        progressText: item.bookedCount + '/' + item.capacity + ' 人',
        isFull: item.bookedCount >= item.capacity,
        isBooked,
      })
    })

    return {
      filters: query,
      coaches: deepClone(this.globalData.coaches),
      dates: deepClone(this.globalData.bookingDates),
      schedules: scheduleList,
      assets: deepClone(this.globalData.assets),
      currentStore: state.currentStore,
    }
  },

  getProfilePageData() {
    const currentUserId = this.globalData.userProfile.id
    return {
      myBookings: deepClone(this.globalData.myBookings.filter((item) => item.userId === currentUserId)),
      trainingStats: deepClone(this.globalData.trainingStats),
      currentStore: this.getCurrentStore(),
      assets: deepClone(this.globalData.assets),
    }
  },

  getWorkspacePageData() {
    const todayClasses = this.globalData.todayClasses.map((item) => {
      const roster = this.globalData.classRosterMap[item.id] || []
      return buildClassSummary(item, roster)
    })

    return {
      quickActions: deepClone(this.globalData.coachQuickActions),
      todayClasses,
      currentStore: this.getCurrentStore(),
    }
  },

  getDistributePageData(keyword) {
    const searchText = (keyword || '').trim()
    const members = this.globalData.members.filter((item) => {
      if (!searchText) {
        return true
      }
      return item.nickname.includes(searchText) || item.phone.includes(searchText)
    })

    return {
      members: deepClone(members),
      packageOptions: deepClone(this.globalData.packageOptions),
      currentStore: this.getCurrentStore(),
    }
  },

  getScheduleManagePageData(storeId) {
    const targetStoreId = storeId || this.globalData.selectedStoreId
    const currentStore = this.globalData.stores.find((item) => item.id === targetStoreId) || this.getCurrentStore()
    return {
      plans: deepClone(this.globalData.coachScheduleBoard.filter((item) => !item.storeId || item.storeId === targetStoreId)),
      currentStore: deepClone(currentStore),
      stores: deepClone(this.globalData.stores),
    }
  },

  getAdminPageData() {
    return {
      auditOverview: Object.assign({}, this.globalData.auditOverview, {
        incomeText: '￥' + formatMoney(this.globalData.auditOverview.incomeAmount),
      }),
      auditLogs: deepClone(this.globalData.auditLogs),
      currentStore: this.getCurrentStore(),
    }
  },
})
