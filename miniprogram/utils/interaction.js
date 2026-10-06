function confirmAction(options) {
  return new Promise((resolve) => wx.showModal(Object.assign({
    confirmColor: '#c7452d', cancelText: '再想想',
    success: (result) => resolve(Boolean(result.confirm)), fail: () => resolve(false),
  }, options)))
}

module.exports = { confirmAction }
