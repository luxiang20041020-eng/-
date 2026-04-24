const {
  ROLE_LIST,
  STORE_LIST,
  ROLE_USER_MAP,
  USER_PROFILE,
  MEMBER_LIST,
  ASSET_PACKAGE_OPTIONS,
  BANNERS,
  PRICE_PACKAGES,
  GALLERY_LIST,
  COACH_LIST,
  BOOKING_DATES,
  SCHEDULE_LIST,
  MY_BOOKINGS,
  CLASS_ROSTER_MAP,
  COACH_SCHEDULE_BOARD,
  INITIAL_ASSETS,
  TODAY_CLASSES,
  COACH_QUICK_ACTIONS,
  AUDIT_OVERVIEW,
  AUDIT_LOGS,
  TRAINING_STATS,
} = require('./utils/mock-data')

function deepClone(data) {
  return JSON.parse(JSON.stringify(data))
}

function formatMoney(amount) {
  return Number(amount || 0).toFixed(2)
}

function getRoleMeta(role) {
  return ROLE_LIST.find((item) => item.value === role) || ROLE_LIST[0]
}

function getRoleUserProfile(role) {
  return deepClone(ROLE_USER_MAP[role] || USER_PROFILE)
}

function getAssetKeyByType(type) {
  return type === 'group' ? 'groupCount' : 'privateCount'
}

function getAssetLabelByType(type) {
  return type === 'group' ? '团课' : '私教'
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
    this.globalData = {
      env: 'cloud1-5g4kw3ux8649ea3e',
      role: 'client',
      selectedStoreId: STORE_LIST[0].id,
      selectedCoachClassId: TODAY_CLASSES[0].id,
      stores: deepClone(STORE_LIST),
      userProfile: getRoleUserProfile('client'),
      members: deepClone(MEMBER_LIST),
      packageOptions: deepClone(ASSET_PACKAGE_OPTIONS),
      banners: deepClone(BANNERS),
      packages: deepClone(PRICE_PACKAGES),
      galleryList: deepClone(GALLERY_LIST),
      coaches: deepClone(COACH_LIST),
      bookingDates: deepClone(BOOKING_DATES),
      schedules: deepClone(SCHEDULE_LIST),
      myBookings: deepClone(MY_BOOKINGS),
      classRosterMap: deepClone(CLASS_ROSTER_MAP),
      coachScheduleBoard: deepClone(COACH_SCHEDULE_BOARD),
      assets: deepClone(INITIAL_ASSETS),
      todayClasses: deepClone(TODAY_CLASSES),
      coachQuickActions: deepClone(COACH_QUICK_ACTIONS),
      auditOverview: deepClone(AUDIT_OVERVIEW),
      auditLogs: deepClone(AUDIT_LOGS),
      trainingStats: deepClone(TRAINING_STATS),
    }

    if (wx.cloud && this.globalData.env) {
      wx.cloud.init({
        env: this.globalData.env,
        traceUser: true,
      })
    }
  },

  getCurrentStore() {
    return this.globalData.stores.find((item) => item.id === this.globalData.selectedStoreId) || this.globalData.stores[0]
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
      return
    }

    this.globalData.assets.privateCount = currentUser.privateCount
    this.globalData.assets.groupCount = currentUser.groupCount
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
      roleList: deepClone(ROLE_LIST),
    }
  },

  switchRole(role) {
    const roleMeta = getRoleMeta(role)
    const nextProfile = getRoleUserProfile(roleMeta.value)
    this.globalData.role = roleMeta.value
    this.globalData.userProfile = nextProfile
    if (nextProfile.homeStoreId) {
      this.globalData.selectedStoreId = nextProfile.homeStoreId
    }
    this.syncCurrentUserAssetsFromMember()
    return this.getRuntimeSnapshot()
  },

  switchStore(storeId) {
    this.globalData.selectedStoreId = storeId
    return this.getRuntimeSnapshot()
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
        dateKey: this.globalData.bookingDates[0].key,
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
        (booking) => booking.userId === currentUserId && booking.scheduleId === item.id && booking.status === '待上课'
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

  createBooking(scheduleId, options = {}) {
    const targetSchedule = this.globalData.schedules.find((item) => item.id === scheduleId)
    if (!targetSchedule) {
      return { ok: false, message: '课程不存在' }
    }

    const assetKey = getAssetKeyByType(targetSchedule.type)
    const assetLabel = getAssetLabelByType(targetSchedule.type)
    const hasBooking = this.globalData.myBookings.some((item) => item.scheduleId === scheduleId && item.status === '待上课')

    if (hasBooking) {
      return { ok: false, message: '该课程已预约，无需重复提交' }
    }

    if (this.globalData.assets[assetKey] <= 0) {
      return { ok: false, message: assetLabel + '课时不足，无法预约' }
    }

    if (targetSchedule.bookedCount >= targetSchedule.capacity) {
      return { ok: false, message: '课程已满员，请选择其他时间段' }
    }

    // 这里用内存态模拟生产环境中的“扣课 + 占位”原子事务，后续接云函数时应替换为服务端事务。
    targetSchedule.bookedCount += 1
    this.globalData.assets[assetKey] -= 1
    const currentUser = this.getCurrentUserMember()
    if (currentUser) {
      currentUser[assetKey] = this.globalData.assets[assetKey]
    }

    const bookingRecord = {
      id: options.bookingId || ('booking_' + Date.now()),
      scheduleId: targetSchedule.id,
      userId: this.globalData.userProfile.id,
      userName: this.globalData.userProfile.nickname,
      title: targetSchedule.title,
      type: targetSchedule.type,
      dateLabel: targetSchedule.dateLabel,
      timeRange: targetSchedule.timeRange,
      status: '待上课',
    }
    this.globalData.myBookings.unshift(bookingRecord)

    if (!this.globalData.classRosterMap[targetSchedule.id]) {
      this.globalData.classRosterMap[targetSchedule.id] = []
    }
    this.globalData.classRosterMap[targetSchedule.id].push({
      bookingId: bookingRecord.id,
      userId: bookingRecord.userId,
      userName: bookingRecord.userName,
      phone: this.globalData.userProfile.phone,
      status: '待核销',
    })

    return { ok: true, message: '预约成功，已扣减 1 节' + assetLabel }
  },

  applyCloudBookingSuccess(scheduleId, options = {}) {
    const targetSchedule = this.globalData.schedules.find((item) => item.id === scheduleId)
    if (!targetSchedule) {
      return { ok: true, message: '预约成功' }
    }

    const assetKey = getAssetKeyByType(targetSchedule.type)
    const assetLabel = getAssetLabelByType(targetSchedule.type)
    const userId = this.globalData.userProfile.id
    const existingBooking = this.globalData.myBookings.find(
      (item) => item.userId === userId && item.scheduleId === scheduleId && item.status === '待上课'
    )
    const bookingId = options.bookingId || (existingBooking ? existingBooking.id : ('booking_' + Date.now()))

    if (!existingBooking) {
      const bookingRecord = {
        id: bookingId,
        scheduleId: targetSchedule.id,
        userId,
        userName: this.globalData.userProfile.nickname,
        title: targetSchedule.title,
        type: targetSchedule.type,
        dateLabel: targetSchedule.dateLabel,
        timeRange: targetSchedule.timeRange,
        status: '待上课',
      }
      this.globalData.myBookings.unshift(bookingRecord)
    }

    if (!this.globalData.classRosterMap[targetSchedule.id]) {
      this.globalData.classRosterMap[targetSchedule.id] = []
    }
    const existsInRoster = this.globalData.classRosterMap[targetSchedule.id].some((item) => item.bookingId === bookingId)
    if (!existsInRoster) {
      this.globalData.classRosterMap[targetSchedule.id].push({
        bookingId,
        userId,
        userName: this.globalData.userProfile.nickname,
        phone: this.globalData.userProfile.phone,
        status: '待核销',
      })
    }

    const currentUser = this.getCurrentUserMember()
    const shouldDecreaseAsset = !existingBooking && this.globalData.assets[assetKey] > 0
    if (shouldDecreaseAsset) {
      this.globalData.assets[assetKey] -= 1
      if (currentUser) {
        currentUser[assetKey] = this.globalData.assets[assetKey]
      }
    }

    if (!existingBooking && targetSchedule.bookedCount < targetSchedule.capacity) {
      targetSchedule.bookedCount += 1
    }

    return { ok: true, message: '预约成功，已扣减 1 节' + assetLabel }
  },

  cancelBooking(bookingId) {
    const booking = this.globalData.myBookings.find((item) => item.id === bookingId)
    if (!booking || booking.status !== '待上课') {
      return { ok: false, message: '当前预约状态不可取消' }
    }

    const schedule = this.globalData.schedules.find((item) => item.id === booking.scheduleId)
    const assetKey = getAssetKeyByType(booking.type)
    const assetLabel = getAssetLabelByType(booking.type)

    booking.status = '已取消'
    this.globalData.assets[assetKey] += 1
    const currentUser = this.getCurrentUserMember()
    if (currentUser) {
      currentUser[assetKey] = this.globalData.assets[assetKey]
    }

    if (schedule && schedule.bookedCount > 0) {
      schedule.bookedCount -= 1
    }

    const roster = this.globalData.classRosterMap[booking.scheduleId] || []
    const targetRoster = roster.find((item) => item.bookingId === bookingId)
    if (targetRoster) {
      targetRoster.status = '已取消'
    }

    return { ok: true, message: '取消成功，已退回 1 节' + assetLabel }
  },

  applyCloudCancelSuccess(bookingId) {
    const booking = this.globalData.myBookings.find((item) => item.id === bookingId)
    if (!booking) {
      return { ok: true, message: '取消成功' }
    }

    if (booking.status === '已取消') {
      return { ok: true, message: '取消成功' }
    }

    const schedule = this.globalData.schedules.find((item) => item.id === booking.scheduleId)
    const assetKey = getAssetKeyByType(booking.type)
    const assetLabel = getAssetLabelByType(booking.type)
    booking.status = '已取消'
    this.globalData.assets[assetKey] += 1

    const currentUser = this.getCurrentUserMember()
    if (currentUser) {
      currentUser[assetKey] = this.globalData.assets[assetKey]
    }

    if (schedule && schedule.bookedCount > 0) {
      schedule.bookedCount -= 1
    }

    const roster = this.globalData.classRosterMap[booking.scheduleId] || []
    const targetRoster = roster.find((item) => item.bookingId === bookingId)
    if (targetRoster) {
      targetRoster.status = '已取消'
    }

    return { ok: true, message: '取消成功，已退回 1 节' + assetLabel }
  },

  getProfilePageData() {
    const currentUserId = this.globalData.userProfile.id
    return {
      myBookings: deepClone(this.globalData.myBookings.filter((item) => item.userId === currentUserId)),
      trainingStats: deepClone(this.globalData.trainingStats),
      currentStore: this.getCurrentStore(),
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

  submitDistribution(payload) {
    const member = this.getMemberById(payload.memberId)
    const packageOption = this.globalData.packageOptions.find((item) => item.id === payload.packageId)
    if (!member || !packageOption) {
      return { ok: false, message: '学员或套餐不存在' }
    }

    const assetKey = getAssetKeyByType(packageOption.type)
    member[assetKey] += Number(packageOption.lessons)

    if (member.id === this.globalData.userProfile.id) {
      this.globalData.assets[assetKey] = member[assetKey]
    }

    if (packageOption.type === 'private') {
      this.globalData.auditOverview.addedPrivateLessons += Number(packageOption.lessons)
    } else {
      this.globalData.auditOverview.addedGroupLessons += Number(packageOption.lessons)
    }
    this.globalData.auditOverview.incomeAmount += Number(payload.amount)

    // 派课必须留审计日志，后续接云数据库时这里会落到独立流水集合。
    this.globalData.auditLogs.unshift({
      id: 'log_' + Date.now(),
      operatorName: '李教练',
      packageName: packageOption.name,
      targetName: member.nickname,
      amount: Number(payload.amount),
      payType: payload.payType,
      remark: payload.remark || '线下录入',
      time: new Date().toTimeString().slice(0, 8),
    })

    return {
      ok: true,
      message: '已为' + member.nickname + '派发 ' + packageOption.lessons + ' 节' + getAssetLabelByType(packageOption.type),
    }
  },

  getClassCheckinPageData(classId) {
    const targetClassId = classId || this.globalData.selectedCoachClassId
    this.globalData.selectedCoachClassId = targetClassId
    const schedule = this.globalData.schedules.find((item) => item.id === targetClassId)
    const roster = this.globalData.classRosterMap[targetClassId] || []

    return {
      classInfo: buildClassSummary(schedule || this.globalData.todayClasses[0], roster),
      roster: deepClone(roster),
      currentStore: this.getCurrentStore(),
    }
  },

  updateCheckinStatus(classId, bookingId, nextStatus) {
    const roster = this.globalData.classRosterMap[classId] || []
    const target = roster.find((item) => item.bookingId === bookingId)
    if (!target) {
      return { ok: false, message: '名单记录不存在' }
    }

    if (target.status === nextStatus) {
      return { ok: false, message: '当前状态无需重复操作' }
    }

    target.status = nextStatus

    const myBooking = this.globalData.myBookings.find((item) => item.id === bookingId)
    if (myBooking) {
      myBooking.status = nextStatus === '已核销' ? '已完成' : '已缺席'
    }

    if (nextStatus === '已核销') {
      this.globalData.auditOverview.writeOffCount += 1
    }

    return { ok: true, message: nextStatus === '已核销' ? '核销完成' : '已标记缺席' }
  },

  applyCloudCheckinStatus(classId, bookingId, nextStatus) {
    const roster = this.globalData.classRosterMap[classId] || []
    const target = roster.find((item) => item.bookingId === bookingId)
    if (target) {
      target.status = nextStatus
    }

    const myBooking = this.globalData.myBookings.find((item) => item.id === bookingId)
    if (myBooking) {
      myBooking.status = nextStatus === '已核销' ? '已完成' : '已缺席'
    }

    if (nextStatus === '已核销') {
      this.globalData.auditOverview.writeOffCount += 1
    }

    return { ok: true, message: nextStatus === '已核销' ? '核销完成' : '已标记缺席' }
  },

  getScheduleManagePageData() {
    return {
      plans: deepClone(this.globalData.coachScheduleBoard),
      currentStore: this.getCurrentStore(),
    }
  },

  createCoachSchedule(payload) {
    const plan = {
      id: payload.planId || ('plan_' + Date.now()),
      weekLabel: payload.weekLabel,
      dateLabel: payload.dateLabel,
      timeRange: payload.timeRange,
      title: payload.title,
      type: payload.type,
      venue: payload.venue,
      status: '已发布',
    }
    this.globalData.coachScheduleBoard.unshift(plan)

    return { ok: true, message: '排课已新增，可继续补充云端落库' }
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
