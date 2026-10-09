const { getUserMessage } = require('../../../utils/user-feedback')
const withPageState = require('../../../utils/page-state')
const businessApi = require('../../../utils/business-api')
const { confirmAction, showFeedback, reLaunch } = require('../../../utils/interaction')
const ROLE_OPTIONS = [
  { value: 1, label: '客户', description: '浏览训练、预约课程、查看个人权益与记录。' },
  { value: 2, label: '教练', description: '包含客户功能，可排期、核销课程及派发学员权益。' },
  { value: 3, label: '管理员', description: '包含教练功能，可管理人员权限、套餐和门店，查看运营数据。' },
]

function normalizePageData(pageData) {
  const safeData = pageData || {}
  return {
    currentUserId: safeData.currentUserId || '',
    roleOptions: ROLE_OPTIONS,
    users: safeData.users || [],
    stores: safeData.stores || [],
  }
}

function buildVisibleUsers(users, keyword, roleFilter = 'all', statusFilter = 'all') {
  const searchText = String(keyword || '').trim().toLowerCase()
  const safeUsers = users || []
  return safeUsers
    .filter((item) => {
      if (roleFilter !== 'all' && Number(item.role) !== Number(roleFilter)) return false
      if (statusFilter !== 'all' && Number(item.status) !== Number(statusFilter)) return false
      if (!searchText) {
        return true
      }
      return [
        item.name,
        item.phone,
        item.roleLabel,
        item.homeStoreName,
      ].some((field) => String(field || '').toLowerCase().includes(searchText))
    })
    .map((item) => Object.assign({}, item, {
      avatarText: item.name ? String(item.name).slice(0, 1) : '人',
      permissionSummary: (ROLE_OPTIONS.find((role) => role.value === Number(item.role)) || {}).description || '权限待确认',
    }))
}

const ADMIN_USERS_CACHE_KEY = 'admin:users'

Page(withPageState({
  data: {
    runtime: {},
    pageData: normalizePageData(),
    visibleUsers: [],
    keyword: '',
    hasPermission: false,
    loading: false,
    submittingUserId: '',
    roleFilter: 'all', statusFilter: 'all',
    roleCounts: { all: 0, client: 0, coach: 0, admin: 0 },
    roleEditorUser: null, nextRole: 0, selectedRole: null,
    showCreatePopup: false, creatingUser: false, createError: '',
    createForm: { name: '', phone: '', storeId: '' },
    createStoreIndex: 0, createStoreName: '', createRequestId: '',
    assetsUser: null, assetsDetail: null, assetsLoading: false, assetsError: '',
  },

  onShow() {
    this.syncPageData()
  },
  onHide() { this.onCloseAssets() },
  onUnload() { this.onCloseAssets() },

  async syncPageData() {
    const app = getApp()
    const initialRuntime = app.getRuntimeSnapshot()
    if (!initialRuntime.isAuthenticated || initialRuntime.role !== 'admin') {
      this.onCloseAssets()
      this.setData({ hasPermission: false, pageData: normalizePageData(), visibleUsers: [], roleEditorUser: null, showCreatePopup: false })
    }
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

    const hasPermission = runtime.role === 'admin'
    if (!hasPermission) {
      this.onCloseAssets()
      this.setData({
        runtime,
        hasPermission: false,
        showCreatePopup: false,
        loading: false,
        pageData: normalizePageData({
          currentUserId: runtime.userProfile ? runtime.userProfile.id : '',
        }),
        visibleUsers: [],
      })
      return
    }

    this.setData({
      runtime,
      hasPermission: true,
      loading: !hadCachedData && !(this.data.pageData.users || []).length,
    })

    try {
      const pageData = normalizePageData(await businessApi.getAdminUserManageData())
      if (this._syncRequestId !== requestId) {
        return
      }
      app.setViewCache(ADMIN_USERS_CACHE_KEY + ':' + runtime.userProfile.id, pageData)
      this.setData({
        runtime,
        hasPermission: true,
        pageData,
        visibleUsers: buildVisibleUsers(pageData.users, this.data.keyword, this.data.roleFilter, this.data.statusFilter),
        loading: false,
      })
      this.refreshVisibleUsers()
    } catch (error) {
      if (this._syncRequestId !== requestId) {
        return
      }
      this.setData({ pageError: getUserMessage(error, "加载失败，请重试") })
      this.setData({
        runtime,
        hasPermission: true,
        loading: false,
      })
      if (!(this.data.pageData.users || []).length) {
        showFeedback({
          title: getUserMessage(error, '读取人员列表失败'),
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
    const cachedPageData = app.getViewCache(ADMIN_USERS_CACHE_KEY + ':' + runtime.userProfile.id)
    if (!cachedPageData) {
      return false
    }
    const pageData = normalizePageData(cachedPageData)
    this.setData({
      runtime,
      hasPermission: true,
      pageData,
      visibleUsers: buildVisibleUsers(pageData.users, this.data.keyword, this.data.roleFilter, this.data.statusFilter),
      loading: false,
    })
    this.refreshVisibleUsers()
    return true
  },

  refreshVisibleUsers(patch = {}) {
    const state = Object.assign({}, this.data, patch)
    const users = state.pageData.users || []
    this.setData(Object.assign({}, patch, {
      visibleUsers: buildVisibleUsers(users, state.keyword, state.roleFilter, state.statusFilter),
      roleCounts: { all: users.length, client: users.filter((u) => Number(u.role) === 1).length, coach: users.filter((u) => Number(u.role) === 2).length, admin: users.filter((u) => Number(u.role) === 3).length },
    }))
  },
  onRoleFilter(event) { this.refreshVisibleUsers({ roleFilter: event.currentTarget.dataset.value }) },
  onStatusFilter(event) { this.refreshVisibleUsers({ statusFilter: event.currentTarget.dataset.value }) },
  onResetFilters() { this.refreshVisibleUsers({ keyword: '', roleFilter: 'all', statusFilter: 'all' }) },

  onKeywordInput(event) {
    const keyword = event.detail.value || ''
    this.refreshVisibleUsers({ keyword })
  },

  onClearKeyword() {
    this.refreshVisibleUsers({ keyword: '' })
  },

  onViewAssets(event) {
    if (!this.data.hasPermission || this.data.creatingUser || this.data.submittingUserId || this.data.showCreatePopup) return
    const user = this.data.pageData.users.find((item) => item.id === event.currentTarget.dataset.userId)
    if (!user || Number(user.role) !== 1) return
    this.setData({ assetsUser: user, assetsDetail: null, assetsError: '', roleEditorUser: null })
    return this.loadCustomerAssets()
  },
  async loadCustomerAssets() {
    if (!this.data.assetsUser || !this.data.hasPermission) return
    const userId = this.data.assetsUser.id
    const requestId = (this._assetsRequestId || 0) + 1
    this._assetsRequestId = requestId
    this.setData({ assetsLoading: true, assetsError: '', assetsDetail: null })
    try {
      const detail = await businessApi.getAdminUserAssets({ targetUserId: userId })
      if (this._assetsRequestId !== requestId || !this.data.hasPermission || !this.data.assetsUser || this.data.assetsUser.id !== userId) return
      if (!detail || !detail.user || detail.user.id !== userId || !Array.isArray(detail.balances) || !Array.isArray(detail.records)) throw new Error('未获取到完整的客户套餐信息，请重试')
      this.setData({ assetsDetail: detail, assetsUser: detail.user })
      const summary = {}
      detail.balances.forEach((balance) => { summary[balance.type + 'Count'] = balance.available; summary[balance.type + 'Expiry'] = balance.expiry })
      this.setData({ pageData: Object.assign({}, this.data.pageData, { users: this.data.pageData.users.map((user) => user.id === userId ? Object.assign({}, user, { assets: summary }) : user) }) })
      this.refreshVisibleUsers()
      getApp().removeViewCacheByPrefix('admin:users')
    } catch (error) {
      if (this._assetsRequestId === requestId) this.setData({ assetsError: getUserMessage(error, '客户套餐余额暂时无法读取，请重试') })
    } finally {
      if (this._assetsRequestId === requestId) this.setData({ assetsLoading: false })
    }
  },
  onRefreshAssets() { if (!this.data.assetsLoading) return this.loadCustomerAssets() },
  onCloseAssets() {
    this._assetsRequestId = (this._assetsRequestId || 0) + 1
    this.setData({ assetsUser: null, assetsDetail: null, assetsLoading: false, assetsError: '' })
  },

  onOpenCreate() {
    if (!this.data.hasPermission || this.data.pageBusy || this.data.pageError || this.data.creatingUser || this.data.submittingUserId) return
    const stores = this.data.pageData.stores
    if (!stores.length) {
      showFeedback({ title: '请先在门店管理中启用门店', icon: 'none' })
      return
    }
    const currentStoreId = (this.data.runtime.currentStore || {}).id
    const index = Math.max(0, stores.findIndex((store) => store.id === currentStoreId))
    this.onCloseAssets()
    this.setData({
      showCreatePopup: true, roleEditorUser: null, createError: '',
      createForm: { name: '', phone: '', storeId: stores[index].id },
      createStoreIndex: index, createStoreName: stores[index].name,
      createRequestId: this.newCreateRequestId(),
    })
  },
  newCreateRequestId() { return 'create_user_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10) },
  onCloseCreatePopup() { if (!this.data.creatingUser) this.setData({ showCreatePopup: false, createError: '' }) },
  onCreateInput(event) {
    if (this.data.creatingUser) return
    const field = event.currentTarget.dataset.field
    if (!['name', 'phone'].includes(field)) return
    this.setData({ createForm: Object.assign({}, this.data.createForm, { [field]: event.detail.value || '' }), createError: '', createRequestId: this.newCreateRequestId() })
  },
  onCreateStoreChange(event) {
    if (this.data.creatingUser) return
    const index = Number(event.detail.value)
    const store = this.data.pageData.stores[index]
    if (store) this.setData({ createForm: Object.assign({}, this.data.createForm, { storeId: store.id }), createStoreIndex: index, createStoreName: store.name, createError: '', createRequestId: this.newCreateRequestId() })
  },
  async onCreateUser() {
    if (!this.data.hasPermission || !this.data.showCreatePopup || this.data.creatingUser || this.data.submittingUserId || this.data.pageBusy || this.data.pageError) return
    const form = this.data.createForm
    const name = String(form.name || '').replace(/\s+/g, ' ').trim()
    const phone = String(form.phone || '').trim()
    let error = ''
    if (!name || name.length > 20) error = '请填写20字以内的姓名'
    else if (!/^1[3-9]\d{9}$/.test(phone)) error = '请填写有效的11位手机号'
    else if (!this.data.pageData.stores.some((store) => store.id === form.storeId)) error = '请选择可用门店'
    if (error) { this.setData({ createError: error }); return }
    this.setData({ creatingUser: true, createError: '' })
    try {
      const result = await businessApi.createUser({ name, phone, storeId: form.storeId, requestId: this.data.createRequestId })
      if (!result || !result.user || !result.user.id) throw new Error('未获取到用户档案，请重试')
      const user = result.user
      this.setData({
        pageData: Object.assign({}, this.data.pageData, { users: [user, ...this.data.pageData.users.filter((item) => item.id !== user.id)] }),
        showCreatePopup: false, createForm: { name: '', phone: '', storeId: '' }, createRequestId: '',
      })
      this.refreshVisibleUsers({ keyword: user.phone, roleFilter: 'all', statusFilter: 'all' })
      const app = getApp()
      app.removeViewCacheByPrefix('admin:')
      app.removeViewCacheByPrefix('workspace:')
      showFeedback({ title: '用户已录入', icon: 'success' })
      // 写入已经完成，列表刷新失败时由页面反馈处理，不将建档显示为失败。
      await this.syncPageData()
    } catch (error) {
      this.setData({ createError: getUserMessage(error, '录入失败，请重试') })
    } finally {
      this.setData({ creatingUser: false })
    }
  },

  onChangeRole(event) {
    if (this.data.assetsUser || this.data.creatingUser || this.data.showCreatePopup || this.data.submittingUserId || this.data.pageBusy || this.data.pageError || !this.data.hasPermission) {
      return
    }

    const userId = event.currentTarget.dataset.userId
    const targetUser = (this.data.pageData.users || []).find((item) => item.id === userId)
    if (!targetUser) {
      return
    }
    if (targetUser.id === this.data.pageData.currentUserId) {
      showFeedback({
        title: '当前登录管理员不可在此页改权',
        icon: 'none',
      })
      return
    }

    const selectedRole = ROLE_OPTIONS.find((role) => role.value === Number(targetUser.role))
    this.setData({ roleEditorUser: targetUser, nextRole: Number(targetUser.role), selectedRole })
  },

  onChooseRole(event) {
    if (this.data.submittingUserId) return
    const selectedRole = ROLE_OPTIONS.find((role) => role.value === Number(event.currentTarget.dataset.value))
    if (selectedRole) this.setData({ nextRole: selectedRole.value, selectedRole })
  },
  onCloseRoleEditor() { if (!this.data.submittingUserId) this.setData({ roleEditorUser: null }) },
  onConfirmRole() {
    if (this.data.roleEditorUser && this.data.selectedRole) return this.submitRoleChange(this.data.roleEditorUser, this.data.selectedRole)
  },

  async submitRoleChange(targetUser, selectedRole) {
    if (this.data.submittingUserId || !this.data.hasPermission || this.data.pageError || this.data.pageBusy || targetUser.id === this.data.pageData.currentUserId || Number(targetUser.role) === Number(selectedRole.value)) return
    this.setData({ submittingUserId: targetUser.id })
    try {
      if (!await confirmAction({ title: '确认变更权限', contentParts: [targetUser.name + ' · ' + (targetUser.phone || '') + '\n', { text: targetUser.roleLabel }, ' → ', { text: selectedRole.label }, '\n', { text: selectedRole.description }, Number(targetUser.status) === 0 ? '\n' : '', Number(targetUser.status) === 0 ? { text: '账号仍为停用状态，本次仅变更身份。' } : ''] })) return
      const result = await businessApi.updateUserRole({
        targetUserId: targetUser.id,
        nextRole: selectedRole.value,
      })
      const updatedUser = result && result.user || Object.assign({}, targetUser, { role: selectedRole.value, roleLabel: selectedRole.label, roleKey: { 1: 'client', 2: 'coach', 3: 'admin' }[selectedRole.value] })
      this.setData({ pageData: Object.assign({}, this.data.pageData, { users: this.data.pageData.users.map((user) => user.id === targetUser.id ? updatedUser : user) }), roleEditorUser: null })
      this.refreshVisibleUsers()
      showFeedback({
        title: '身份权限已更新',
        icon: 'success',
      })
      const app = getApp()
      app.removeViewCacheByPrefix('admin:')
      app.removeViewCacheByPrefix('workspace:')
      app.removeViewCacheByPrefix('profile:')
      await this.syncPageData()
    } catch (error) {
      showFeedback({
        title: getUserMessage(error, '更新权限失败'),
        icon: 'none',
      })
    } finally {
      this.setData({ submittingUserId: '' })
    }
  },
}))
