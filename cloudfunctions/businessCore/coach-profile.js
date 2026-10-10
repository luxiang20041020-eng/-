const crypto = require('crypto')

const mediaPrefix = userId => 'profile-media/' + crypto.createHash('sha256').update(userId).digest('hex').slice(0, 32) + '/'
function profileView(user) {
  return {
    id: user._id, name: user.real_name || '教练', avatarUrl: user.avatar_url || '',
    title: user.coach_title || '', levelLabel: user.level_label || '', bio: user.bio || '',
    specialties: Array.isArray(user.specialties) ? user.specialties : [],
    honors: Array.isArray(user.coach_honors) ? user.coach_honors : [],
    photos: Array.isArray(user.coach_photos) ? user.coach_photos : [],
    version: Number(user.coach_profile_version || 0),
  }
}
function invalid(message) { throw Object.assign(new Error(message), { code: 'INVALID_COACH_PROFILE' }) }
function text(value, max, label) {
  if (typeof value !== 'string' || value.trim().length > max) invalid(label)
  return value.trim()
}
function lines(value, maxItems, maxLength, label) {
  if (!Array.isArray(value) || value.length > maxItems) invalid(label)
  return [...new Set(value.map(item => text(item, maxLength, label)).filter(Boolean))]
}
function validateFile(fileId, userId, env) {
  if (typeof fileId !== 'string' || !fileId.startsWith('cloud://') || fileId.length > 500) invalid('请重新上传本人的图片')
  const slash = fileId.indexOf('/', 8), host = fileId.slice(8, slash), filePath = fileId.slice(slash + 1)
  if (slash < 0 || !env || !(host === env || host.startsWith(env + '.')) || !filePath.startsWith(mediaPrefix(userId))) invalid('请重新上传本人的图片')
  if (!/^[a-zA-Z0-9_-]+\.(jpg|jpeg|png|webp)$/.test(filePath.slice(mediaPrefix(userId).length))) invalid('请上传 JPG、PNG 或 WebP 图片')
  return fileId
}

module.exports = function createCoachProfiles({ db, collections: C, cloud, getDocById, runBusinessTransaction, buildSuccess, buildFail, buildUserSession }) {
  async function ownUser(event, transaction = db) {
    const user = (await getDocById(C.USER, event.operator._id, transaction)).data
    if (!user || user.is_deleted || Number(user.status) !== 1 || user.openid !== cloud.getWXContext().OPENID) throw Object.assign(new Error('登录状态已变化，请重新登录'), { code: 'LOGIN_REQUIRED' })
    return user
  }
  function staff(user) { if (![2, 3].includes(Number(user.role))) throw Object.assign(new Error('只有教练或管理员可以编辑教练介绍'), { code: 'FORBIDDEN' }) }
  async function checkFiles(files) {
    if (!files.length) return
    const result = await cloud.getTempFileURL({ fileList: files })
    if (!result.fileList || result.fileList.length !== files.length || result.fileList.some(file => file.status !== 0 || !file.tempFileURL)) invalid('图片上传未完成或已失效，请重新上传')
  }
  const api = {
    async getCoachProfile(event) {
      const id = String((event.payload || {}).coachId || '')
      const user = id ? (await getDocById(C.USER, id)).data : null
      if (!user || user.is_deleted || Number(user.status) !== 1 || ![2, 3].includes(Number(user.role))) return buildFail('教练暂不可预约，请返回重新选择', 'COACH_PROFILE_UNAVAILABLE')
      return buildSuccess({ coach: profileView(user) })
    },
    async getOwnCoachProfile(event) {
      const user = await ownUser(event); staff(user)
      return buildSuccess({ coach: profileView(user), avatarVersion: Number(user.avatar_version || 0) })
    },
    async getMediaUploadData(event) {
      const user = await ownUser(event)
      return buildSuccess({ prefix: mediaPrefix(user._id), userId: user._id, avatarVersion: Number(user.avatar_version || 0) })
    },
    async updateUserAvatar(event) {
      const payload = event.payload || {}, fileId = validateFile(payload.avatarUrl, event.operator._id, cloud.getWXContext().ENV)
      await checkFiles([fileId])
      const user = await runBusinessTransaction(async tx => {
        const current = await ownUser(event, tx)
        if (current.avatar_url === fileId) return current
        if (payload.version !== Number(current.avatar_version || 0)) invalid('头像已在其他页面更新，请刷新后重试')
        const patch = { avatar_url: fileId, avatar_version: Number(current.avatar_version || 0) + 1, updated_at: db.serverDate() }
        await tx.collection(C.USER).doc(current._id).update({ data: patch })
        return { ...current, ...patch }
      })
      return buildSuccess({ ...(await buildUserSession(user)), message: '头像已更新' })
    },
    async updateCoachProfile(event) {
      const payload = event.payload || {}
      const patch = {
        coach_title: text(payload.title, 60, '教练头衔不能超过60个字符'),
        level_label: text(payload.levelLabel, 60, '资历不能超过60个字符'),
        bio: text(payload.bio, 2000, '个人介绍不能超过2000个字符'),
        specialties: lines(payload.specialties, 10, 40, '最多10项擅长，每项不超过40个字符'),
        coach_honors: lines(payload.honors, 10, 200, '最多10项荣誉，每项不超过200个字符'),
        coach_photos: lines(payload.photos, 6, 500, '最多上传6张照片'),
      }
      const original = await ownUser(event); staff(original)
      for (const file of patch.coach_photos) validateFile(file, original._id, cloud.getWXContext().ENV)
      await checkFiles(patch.coach_photos)
      const user = await runBusinessTransaction(async tx => {
        const current = await ownUser(event, tx); staff(current)
        // 同一完整草稿重试不重复更新版本。
        if (Object.keys(patch).every(key => JSON.stringify(current[key] || (Array.isArray(patch[key]) ? [] : '')) === JSON.stringify(patch[key]))) return current
        if (payload.version !== Number(current.coach_profile_version || 0)) invalid('教练资料已更新，请重新读取后再编辑')
        const updated = { ...patch, coach_profile_version: Number(current.coach_profile_version || 0) + 1, updated_at: db.serverDate() }
        await tx.collection(C.USER).doc(current._id).update({ data: updated })
        return { ...current, ...updated }
      })
      return buildSuccess({ coach: profileView(user), message: '教练资料已保存' })
    },
  }
  return Object.fromEntries(Object.entries(api).map(([name, handler]) => [name, async event => {
    try { return await handler(event) } catch (error) {
      return buildFail(error.code ? error.message : (name.startsWith('get') ? '教练资料暂时无法读取，请稍后重试' : '资料保存未完成，请刷新后核对'), error.code || 'COACH_PROFILE_ERROR')
    }
  }]))
}
module.exports.mediaPrefix = mediaPrefix
module.exports.validateFile = validateFile
