const defaults = ['拳台训练区', '力量与体能区', '沙袋训练区'].map((title, i) => ({ url: '/images/gym-interior-' + (i + 1) + '.jpg', title, defaultTitle: true }))
function normalizeGallery(gallery) {
  return (Array.isArray(gallery) ? gallery : defaults).map((item, i) => typeof item === 'string'
    ? { url: '/images/gym-interior-' + (i + 1) + '.jpg', title: item, defaultTitle: true }
    : { url: item.url, title: item.title || '', defaultTitle: Boolean(item.defaultTitle) })
}
module.exports = { normalizeGallery, defaultGallery: () => normalizeGallery(defaults) }
