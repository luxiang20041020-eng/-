const businessApi = require('../../../utils/business-api')

function normalizePageData(pageData) {
  const safeData = pageData || {}
  return {
    currentUserId: safeData.currentUserId || '',
    roleOptions: safeData.roleOptions || [],
    users: safeData.users || [],
  }
}

function buildVisibleUsers(users, keyword) {
  const searchText = String(keyword || '').trim().toLowerCase()
  const safeUsers = users || []
  return safeUsers
    .filter((item) => {
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
    }))
}

Page({
  data: {
    runtime: {},
    pageData: normalizePageData(),
    visibleUsers: [],
    keyword: '',
    hasPermission: false,
    loading: false,
    submittingUserId: '',
  },

  onShow() {
    this.syncPageData()
  },

  async syncPageData() {
    const app = getApp()
    const runtime = await app.getRuntimeSnapshotAsync({ force: true })
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
      loading: true,
    })

    try {
      const pageData = normalizePageData(await businessApi.getAdminUserManageData())
      this.setData({
        runtime,
        hasPermission: true,
        pageData,
        visibleUsers: buildVisibleUsers(pageData.users, this.data.keyword),
        loading: false,
      })
    } catch (error) {
      this.setData({
        runtime,
        hasPermission: true,
        loading: false,
        pageData: normalizePageData({
          currentUserId: runtime.userProfile ? runtime.userProfile.id : '',
        }),
        visibleUsers: [],
      })
      wx.showToast({
        title: error.message || '读取人员列表失败',
        icon: 'none',
      })
    }
  },

  onKeywordInput(event) {
    const keyword = event.detail.value || ''
    this.setData({
      keyword,
      visibleUsers: buildVisibleUsers(this.data.pageData.users, keyword),
    })
  },

  onClearKeyword() {
    this.setData({
      keyword: '',
      visibleUsers: buildVisibleUsers(this.data.pageData.users, ''),
    })
  },

  onChangeRole(event) {
    if (this.data.submittingUserId) {
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

    const nextRoleOptions = (this.data.pageData.roleOptions || []).filter((item) => Number(item.value) !== Number(targetUser.role))
    if (!nextRoleOptions.length) {
      wx.showToast({
        title: '暂无可切换角色',
        icon: 'none',
      })
      return
    }

    wx.showActionSheet({
      itemList: nextRoleOptions.map((item) => item.label),
      success: (res) => {
        const selectedRole = nextRoleOptions[res.tapIndex]
        if (!selectedRole) {
          return
        }
        this.submitRoleChange(targetUser, selectedRole)
      },
    })
  },

  async submitRoleChange(targetUser, selectedRole) {
    this.setData({ submittingUserId: targetUser.id })
    try {
      await businessApi.updateUserRole({
        targetUserId: targetUser.id,
        nextRole: selectedRole.value,
      })
      wx.showToast({
        title: '身份权限已更新',
        icon: 'success',
      })
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
})
