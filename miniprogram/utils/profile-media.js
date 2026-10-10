const businessApi = require('./business-api')
const { previewImage, showFeedback } = require('./interaction')

const call = (api, options) => new Promise((resolve, reject) => api(Object.assign({}, options, { success: resolve, fail: reject })))
const cancelled = error => /cancel|取消/i.test(String(error && (error.errMsg || error.message) || ''))
async function sameUser(userId) {
  const runtime = await getApp().getRuntimeSnapshotAsync({ force: true })
  if (!runtime.isAuthenticated || runtime.userProfile.id !== userId) throw new Error('登录状态已变化，请重新操作')
  return runtime
}
async function choosePhotos(count = 1) {
  if (wx.getPrivacySetting) {
    let settings
    try { settings = await call(options => wx.getPrivacySetting(options), {}) } catch (_) { throw new Error('隐私授权状态无法确认，请稍后重试') }
    if (settings.needAuthorization) {
      const pages = getCurrentPages(), page = pages[pages.length - 1]
      const privacy = page && page.selectComponent && page.selectComponent('#mediaPrivacy')
      if (!privacy) throw new Error('隐私授权未完成，请重试')
      try { await privacy.authorize(settings) } catch (error) { if (cancelled(error)) return []; throw error }
    }
  }
  try {
    if (wx.chooseMedia) {
      const result = await call(options => wx.chooseMedia(options), { count, mediaType: ['image'], sourceType: ['album', 'camera'], sizeType: ['compressed'] })
      return result.tempFiles.map(file => file.tempFilePath)
    }
    const result = await call(options => wx.chooseImage(options), { count, sourceType: ['album', 'camera'], sizeType: ['compressed'] })
    return result.tempFilePaths
  } catch (error) {
    if (cancelled(error)) return []
    throw new Error('无法选择照片，请在微信设置中允许访问相册或相机')
  }
}
async function uploadPhoto(filePath, userId, kind = 'photo') {
  await sameUser(userId)
  let info
  try { info = await call(options => wx.getImageInfo(options), { src: filePath }) } catch (_) { throw new Error('无法读取照片，请重新选择图片') }
  const extension = { jpeg: 'jpg', jpg: 'jpg', png: 'png', webp: 'webp' }[String(info.type).toLowerCase()]
  if (!extension) throw new Error('请上传 JPG、PNG 或 WebP 图片')
  let uploadPath = filePath
  if (wx.compressImage) {
    const scale = Math.min(1, (kind === 'avatar' ? 800 : 1600) / Math.max(info.width, info.height))
    try {
      const compressed = await call(options => wx.compressImage(options), { src: filePath, quality: 70, compressedWidth: Math.max(1, Math.round(info.width * scale)), compressedHeight: Math.max(1, Math.round(info.height * scale)) })
      uploadPath = compressed.tempFilePath
    } catch (_) { /* 压缩不可用时，仅允许体积合格的原图。 */ }
  }
  const fs = wx.getFileSystemManager()
  let size
  try { size = (await call(options => fs.getFileInfo(options), { filePath: uploadPath })).size } catch (_) { throw new Error('无法读取照片，请重新选择图片') }
  if (size > 2 * 1024 * 1024) throw new Error('照片压缩后仍超过2MB，请选择较小的图片')
  const context = await businessApi.getMediaUploadData()
  if (context.userId !== userId) throw new Error('登录状态已变化，请重新操作')
  const filename = kind + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 12) + '.' + extension
  try {
    const result = await wx.cloud.uploadFile({ cloudPath: context.prefix + filename, filePath: uploadPath })
    if (!result.fileID) throw new Error('empty upload')
    return { fileId: result.fileID, version: context.avatarVersion }
  } catch (error) {
    const message = String(error && (error.errMsg || error.message) || '')
    if (/permission|denied|权限/i.test(message)) throw new Error('照片上传未获授权，请联系场馆检查图片上传权限')
    throw new Error('照片上传失败，请检查网络后重试')
  }
}
async function updateAvatar(userId) {
  const paths = await choosePhotos(1)
  if (!paths.length) return null
  const upload = await uploadPhoto(paths[0], userId, 'avatar')
  await sameUser(userId)
  const result = await businessApi.updateUserAvatar({ avatarUrl: upload.fileId, version: upload.version })
  await sameUser(userId)
  getApp().applyCloudSession(result)
  getApp().removeViewCacheByPrefix('booking:')
  getApp().removeViewCacheByPrefix('profile:')
  return result
}
async function previewPhotos(urls, current) {
  if (!urls || !urls.length) return
  try {
    const cloudFiles = urls.filter(url => url.startsWith('cloud://'))
    const result = cloudFiles.length ? await wx.cloud.getTempFileURL({ fileList: cloudFiles }) : { fileList: [] }
    const map = {}
    for (const file of result.fileList || []) if (file.status === 0 && file.tempFileURL) map[file.fileID] = file.tempFileURL
    if (cloudFiles.some(file => !map[file])) throw new Error('photo unavailable')
    previewImage({ urls: urls.map(url => map[url] || url), current: map[current] || current })
  } catch (_) { showFeedback({ title: '照片暂时无法打开，请检查网络后重试', icon: 'none' }) }
}
module.exports = { choosePhotos, uploadPhoto, updateAvatar, sameUser, cancelled, previewPhotos }
