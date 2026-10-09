const { getLanguage, subscribe, t } = require('./i18n')
const titles = {
  'pages/home/index': 'ONE泰拳格斗馆', 'pages/login/index': '登录',
  'pages/booking/index': '预约大厅', 'pages/profile/index': '我的', 'pages/points/index': '我的积分',
  'pages/workspace/index': '训练工作台', 'pages/workspace/distribute/index': '权益派发',
  'pages/workspace/class/index': '到场核销', 'pages/workspace/manual/index': '人工核销',
  'pages/workspace/schedule/index': '排期管理', 'pages/admin/index': '数据看板',
  'pages/admin/users/index': '人员权限', 'pages/admin/packages/index': '套餐管理', 'pages/admin/stores/index': '门店管理',
}
function applyLanguage(page, navigation) {
  page.setData({ language: getLanguage() })
  if (navigation && wx.setNavigationBarTitle && titles[page.route]) wx.setNavigationBarTitle({ title: t(titles[page.route]) })
  const tabbar = page.selectComponent && page.selectComponent('#tabbar')
  if (tabbar && tabbar.syncTabs) tabbar.syncTabs()
}
module.exports = function withI18n(definition) {
  const onLoad = definition.onLoad, onShow = definition.onShow, onUnload = definition.onUnload
  return Object.assign({}, definition, {
    data: Object.assign({ language: getLanguage() }, definition.data),
    onLoad(...args) {
      this._stopLocale = subscribe(() => applyLanguage(this, false))
      applyLanguage(this, true)
      if (onLoad) return onLoad.apply(this, args)
    },
    onShow(...args) { applyLanguage(this, true); if (onShow) return onShow.apply(this, args) },
    onLanguageChange() { applyLanguage(this, true) },
    onUnload(...args) { if (this._stopLocale) this._stopLocale(); if (onUnload) return onUnload.apply(this, args) },
  })
}
