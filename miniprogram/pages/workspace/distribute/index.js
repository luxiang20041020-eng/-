const businessApi = require('../../../utils/business-api')

Page({
  data: {
    runtime: {},
    pageData: {},
    keyword: '',
    selectedMemberId: '',
    selectedPackageId: '',
    amount: '',
    payType: '微信转账',
    remark: '',
  },

  onShow() {
    this.syncPageData()
  },

  syncPageData() {
    const app = getApp()
    this.setData({
      runtime: app.getRuntimeSnapshot(),
      pageData: app.getDistributePageData(this.data.keyword),
    })
  },

  onKeywordInput(event) {
    this.setData({ keyword: event.detail.value })
    this.syncPageData()
  },

  onSelectMember(event) {
    this.setData({ selectedMemberId: event.currentTarget.dataset.memberId })
  },

  onSelectPackage(event) {
    const packageId = event.currentTarget.dataset.packageId
    const targetPackage = this.data.pageData.packageOptions.find((item) => item.id === packageId)
    this.setData({
      selectedPackageId: packageId,
      amount: targetPackage ? String(targetPackage.price) : this.data.amount,
    })
  },

  onAmountInput(event) {
    this.setData({ amount: event.detail.value })
  },

  onPayTypeInput(event) {
    this.setData({ payType: event.detail.value })
  },

  onRemarkInput(event) {
    this.setData({ remark: event.detail.value })
  },

  onSubmit() {
    if (!this.data.selectedMemberId || !this.data.selectedPackageId) {
      wx.showToast({ title: '请先选择学员和套餐', icon: 'none' })
      return
    }
    if (Number(this.data.amount) < 0) {
      wx.showToast({ title: '实收金额不能小于 0', icon: 'none' })
      return
    }

    const member = this.data.pageData.members.find((item) => item.id === this.data.selectedMemberId)
    const targetPackage = this.data.pageData.packageOptions.find((item) => item.id === this.data.selectedPackageId)
    if (!member || !targetPackage) {
      wx.showToast({ title: '派发对象无效', icon: 'none' })
      return
    }

    wx.showModal({
      title: '确认派发',
      content: '即将为 ' + member.nickname + ' 派发【' + targetPackage.name + '】并记录审计流水，是否确认？',
      success: async (res) => {
        if (!res.confirm) {
          return
        }

        const app = getApp()
        const localPayload = {
          memberId: this.data.selectedMemberId,
          packageId: this.data.selectedPackageId,
          amount: Number(this.data.amount || 0),
          payType: this.data.payType || '微信转账',
          remark: this.data.remark,
        }
        let result = null

        try {
          await businessApi.distributeAsset({
            userId: localPayload.memberId,
            packageId: localPayload.packageId,
            operatorId: 'coach_li',
            offlineAmount: localPayload.amount,
            payType: localPayload.payType,
            remark: localPayload.remark,
          })
          result = app.submitDistribution(localPayload)
        } catch (error) {
          // 云端未部署或初始化未完成时，先走本地态，保证工作台链路可持续验收。
          result = app.submitDistribution(localPayload)
          if (result.ok) {
            result.message = result.message + '（当前使用本地演示数据）'
          } else if (error && error.message) {
            result.message = result.message + '；云端返回：' + error.message
          }
        }

        wx.showToast({ title: result.message, icon: result.ok ? 'success' : 'none' })
        if (result.ok) {
          this.setData({
            selectedMemberId: '',
            selectedPackageId: '',
            amount: '',
            payType: '微信转账',
            remark: '',
          })
          this.syncPageData()
        }
      },
    })
  },
})
