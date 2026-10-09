const { getUserMessage } = require('./user-feedback')
const { t, f } = require('./i18n')

function formatParts(parts) {
  return parts.map(part => typeof part === 'string' ? part : f(part.text, part.values || [])).join('')
}

function localizeOptions(options) {
  const output = Object.assign({}, options)
  for (const key of ['title', 'content', 'confirmText', 'cancelText']) if (typeof output[key] === 'string' && !(key === 'content' && options.contentParts)) output[key] = t(output[key])
  if (options.contentParts) output.content = formatParts(options.contentParts)
  if (output.itemList && options.translateItems) output.itemList = output.itemList.map(item => t(item))
  delete output.contentParts
  delete output.translateItems
  return output
}

function showModal(options) { return wx.showModal(localizeOptions(options)) }

function showFeedback(options) {
  const title = options.messageParts ? formatParts(options.messageParts) : t(getUserMessage(options.title, '操作未完成，请稍后重试', options.code))
  // 长原因使用完整弹窗，避免短暂提示截断处理建议。
  if (title.length > 16) {
    return showModal({ title: options.icon === 'success' ? '操作已完成' : '操作未完成', contentParts: [title], showCancel: false, confirmText: '知道了' })
  }
  return wx.showToast(Object.assign({}, options, { title }))
}

function confirmAction(options) {
  return new Promise((resolve) => showModal(Object.assign({
    confirmColor: '#c7452d', cancelText: '再想想',
    success: (result) => resolve(Boolean(result.confirm)), fail: () => resolve(false),
  }, options)))
}

function navigate(options, method) {
  return wx[method](Object.assign({}, localizeOptions(options), { fail(error) {
    if (options.fail) return options.fail(error)
    showFeedback({ title: getUserMessage(error, '页面暂时无法打开，请返回上一页后重试'), icon: 'none' })
  } }))
}

function nativeAction(options, method, fallback) {
  return wx[method](Object.assign({}, localizeOptions(options), { fail(error) {
    if (options.fail) return options.fail(error)
    if (/cancel|取消/i.test(String(error && (error.errMsg || error.message) || ''))) return
    showFeedback({ title: getUserMessage(error, fallback), icon: 'none' })
  } }))
}

module.exports = { confirmAction, showFeedback, showModal,
  navigateTo: (options) => navigate(options, 'navigateTo'),
  redirectTo: (options) => navigate(options, 'redirectTo'),
  reLaunch: (options) => navigate(options, 'reLaunch'),
  showActionSheet: (options) => nativeAction(options, 'showActionSheet', '选项未能打开，请稍后重试'),
  previewImage: (options) => nativeAction(options, 'previewImage', '图片未能打开，请检查网络后重试'),
  openLocation: (options) => nativeAction(options, 'openLocation', '地图未能打开，请稍后重试'),
  setClipboardData: (options) => nativeAction(options, 'setClipboardData', '内容未能复制，请重新操作'),
}
