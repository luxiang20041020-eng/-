const { validateFile } = require('./coach-profile')
const { getUserMessage } = require('./user-feedback')
const DEFAULT_GALLERY = ['拳台训练区', '力量与体能区', '沙袋训练区'].map((title, i) => ({ url: '/images/gym-interior-' + (i + 1) + '.jpg', title }))
function galleryView(store) {
  const gallery = store && Array.isArray(store.home_gallery) ? store.home_gallery : DEFAULT_GALLERY
  return gallery.map(item => ({ url: item.url, title: item.title, defaultTitle: DEFAULT_GALLERY.some(photo => photo.url === item.url && photo.title === item.title) }))
}
function invalid(message) { throw Object.assign(new Error(message), { code: 'INVALID_STORE_GALLERY' }) }
module.exports = function createStoreGallery({ db, collections: C, cloud, getDocById, runBusinessTransaction, buildSuccess, buildFail }) {
  return async function updateStoreGallery(event) {
    try {
      const payload = event.payload || {}
      if (typeof payload.targetStoreId !== 'string' || !payload.targetStoreId) invalid('请选择要编辑图片的门店')
      if (!Array.isArray(payload.gallery) || payload.gallery.length > 6) invalid('每个门店最多展示6张图片')
      const gallery = payload.gallery.map(item => {
        if (!item || typeof item.url !== 'string' || item.url.length > 500 || typeof item.title !== 'string' || item.title.trim().length > 40) invalid('图片说明最多40个字符，请检查图片和说明')
        if (!DEFAULT_GALLERY.some(photo => photo.url === item.url) && !item.url.startsWith('cloud://')) invalid('请使用上传的图片或默认场馆图片')
        return { url: item.url, title: item.title.trim() }
      })
      if (new Set(gallery.map(item => item.url)).size !== gallery.length) invalid('同一张图片不能重复添加')
      const files = gallery.map(item => item.url).filter(url => url.startsWith('cloud://'))
      if (files.length) {
        const result = await cloud.getTempFileURL({ fileList: files })
        if (!result.fileList || result.fileList.length !== files.length || result.fileList.some(file => file.status !== 0 || !file.tempFileURL)) invalid('图片上传未完成或已失效，请重新上传')
      }
      const store = await runBusinessTransaction(async tx => {
        const operator = (await getDocById(C.USER, event.operator._id, tx)).data
        if (!operator || operator.is_deleted || Number(operator.status) !== 1 || operator.openid !== cloud.getWXContext().OPENID) throw Object.assign(new Error('登录状态已变化，请重新登录'), { code: 'LOGIN_REQUIRED' })
        if (Number(operator.role) !== 3) throw Object.assign(new Error('只有管理员可以更换门店图片'), { code: 'FORBIDDEN' })
        const current = (await getDocById(C.STORE, payload.targetStoreId, tx)).data
        if (!current || current.is_deleted) throw Object.assign(new Error('门店已不存在，请刷新门店列表'), { code: 'TARGET_STORE_NOT_FOUND' })
        // 保留其他管理员已保存到本门店的照片，新照片必须属于当前账号。
        const retained = new Set(galleryView(current).map(item => item.url))
        for (const file of files) if (!retained.has(file)) {
          try { validateFile(file, operator._id, cloud.getWXContext().ENV) } catch (_) { invalid('请重新上传当前账号选择的门店图片') }
        }
        if (Array.isArray(current.home_gallery) && JSON.stringify(current.home_gallery) === JSON.stringify(gallery)) return current
        if (payload.version !== Number(current.gallery_version || 0)) invalid('门店图片已被其他管理员更新，请重新打开图片管理')
        const patch = { home_gallery: gallery, gallery_version: Number(current.gallery_version || 0) + 1, gallery_updated_by: operator._id, updated_at: db.serverDate() }
        await tx.collection(C.STORE).doc(current._id).update({ data: patch })
        return { ...current, ...patch }
      })
      return buildSuccess({ gallery: galleryView(store), version: Number(store.gallery_version || 0), message: '门店图片已保存' })
    } catch (error) {
      return buildFail(error.code ? error.message : getUserMessage(error, '门店图片保存未完成，请稍后重试'), error.code || 'STORE_GALLERY_ERROR')
    }
  }
}
module.exports.galleryView = galleryView
