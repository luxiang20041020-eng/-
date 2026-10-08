const withPageState = require('../../../utils/page-state')
const businessApi = require('../../../utils/business-api')
const { confirmAction } = require('../../../utils/interaction')
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
  },

  onShow() {
    this.syncPageData()
  },

  async syncPageData() {
    const app = getApp()
    const initialRuntime = app.getRuntimeSnapshot()
    if (!initialRuntime.isAuthenticated || initialRuntime.role !== 'admin') this.setData({ hasPermission: false, pageData: normalizePageData(), visibleUsers: [], roleEditorUser: null })
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
      this.setData({ pageError: error.message || "加载失败，请重试" })
      this.setData({
        runtime,
        hasPermission: true,
        loading: false,
      })
      if (!(this.data.pageData.users || []).length) {
        wx.showToast({
          title: error.message || '读取人员列表失败',
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

  onChangeRole(event) {
    if (this.data.submittingUserId || this.data.pageBusy || this.data.pageError || !this.data.hasPermission) {
      return
    }

    const userId = event.currentTarget.dataset.userId
    const targetUser = (this.data.pageData.users || []).find((item) => item.id === userId)
    if (!targetUser) {
      return
    }
    if (targetUser.id === this.data.pageData.currentUserId) {
      wx.showToast({
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
      if (!await confirmAction({ title: '确认变更权限', content: targetUser.name + ' · ' + (targetUser.phone || '未绑定手机号') + '\n' + targetUser.roleLabel + ' → ' + selectedRole.label + '\n' + selectedRole.description + (Number(targetUser.status) === 0 ? '\n账号仍为停用状态，本次仅变更身份。' : '') })) return
      const result = await businessApi.updateUserRole({
        targetUserId: targetUser.id,
        nextRole: selectedRole.value,
      })
      const updatedUser = result && result.user || Object.assign({}, targetUser, { role: selectedRole.value, roleLabel: selectedRole.label, roleKey: { 1: 'client', 2: 'coach', 3: 'admin' }[selectedRole.value] })
      this.setData({ pageData: Object.assign({}, this.data.pageData, { users: this.data.pageData.users.map((user) => user.id === targetUser.id ? updatedUser : user) }), roleEditorUser: null })
      this.refreshVisibleUsers()
      wx.showToast({
        title: '身份权限已更新',
        icon: 'success',
      })
      const app = getApp()
      app.removeViewCacheByPrefix('admin:')
      app.removeViewCacheByPrefix('workspace:')
      app.removeViewCacheByPrefix('profile:')
      await this.syncPageData()
    } catch (error) {
      wx.showToast({
        title: error.message || '更新权限失败',
        icon: 'none',
      })
    } finally {
      this.setData({ submittingUserId: '' })
    }
  },
}))
