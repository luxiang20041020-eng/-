const { getUserMessage } = require('./user-feedback')

function showFeedback(options) {
  const title = getUserMessage(options.title, '操作未完成，请稍后重试', options.code)
  // 长原因使用完整弹窗，避免短暂提示截断处理建议。
  if (title.length > 16) {
    return wx.showModal({ title: options.icon === 'success' ? '操作已完成' : '操作未完成', content: title, showCancel: false, confirmText: '知道了' })
  }
  return wx.showToast(Object.assign({}, options, { title }))
}

function confirmAction(options) {
  return new Promise((resolve) => wx.showModal(Object.assign({
    confirmColor: '#c7452d', cancelText: '再想想',
    success: (result) => resolve(Boolean(result.confirm)), fail: () => resolve(false),
  }, options)))
}

function navigate(options, method) {
  return wx[method](Object.assign({}, options, { fail(error) {
    if (options.fail) return options.fail(error)
    showFeedback({ title: getUserMessage(error, '页面暂时无法打开，请返回上一页后重试'), icon: 'none' })
  } }))
}

function nativeAction(options, method, fallback) {
  return wx[method](Object.assign({}, options, { fail(error) {
    if (options.fail) return options.fail(error)
    if (/cancel|取消/i.test(String(error && (error.errMsg || error.message) || ''))) return
    showFeedback({ title: getUserMessage(error, fallback), icon: 'none' })
  } }))
}

module.exports = { confirmAction, showFeedback,
  navigateTo: (options) => navigate(options, 'navigateTo'),
  redirectTo: (options) => navigate(options, 'redirectTo'),
  reLaunch: (options) => navigate(options, 'reLaunch'),
  showActionSheet: (options) => nativeAction(options, 'showActionSheet', '选项未能打开，请稍后重试'),
  previewImage: (options) => nativeAction(options, 'previewImage', '图片未能打开，请检查网络后重试'),
  openLocation: (options) => nativeAction(options, 'openLocation', '地图未能打开，请稍后重试'),
  setClipboardData: (options) => nativeAction(options, 'setClipboardData', '内容未能复制，请重新操作'),
}
