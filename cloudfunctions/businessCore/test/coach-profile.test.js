const { test } = require('node:test')
const assert = require('node:assert/strict')
const { createDatabase, loadFunction, login } = require('./helpers')
const { mediaPrefix } = require('../coach-profile')
async function fixture() {
  const state = createDatabase(), context = { OPENID: 'owner', ENV: 'test-env' }, main = loadFunction(state, {}, context)
  const session = await login(main, '13812345678'), id = session.data.userProfile.id
  state.collections.get('app_user').get(id).role = 2
  const call = (action, payload) => main({ action, payload })
  const file = name => 'cloud://test-env.bucket/' + mediaPrefix(id) + name + '.jpg'
  const form = { title: '泰拳教练', levelLabel: '执教十年', bio: '第一行\n第二行', specialties: ['泰拳', '体能'], honors: ['2025冠军'], photos: [file('photo_001')], version: 0 }
  return { state, context, call, id, file, form, get user() { return state.collections.get('app_user').get(id) } }
}
test('教练可保存介绍荣誉照片，客户公开查看仅返回介绍字段', async () => {
  const f = await fixture(), result = await f.call('updateCoachProfile', { ...f.form, userId: 'other', role: 3, phone: '123' })
  assert.equal(result.success, true); assert.equal(result.data.coach.version, 1)
  assert.equal(f.user.role, 2); assert.equal(f.user.phone, '13812345678'); assert.equal(f.user.bio, f.form.bio)
  f.context.OPENID = ''
  const view = await f.call('getCoachProfile', { coachId: f.id })
  assert.equal(view.success, true); assert.equal(view.data.coach.bio, f.form.bio)
  for (const field of ['phone', 'openid', 'role', 'assets', 'home_store_id']) assert.equal(field in view.data.coach, false)
  assert.deepEqual(view.data.coach.photos, f.form.photos)
})
test('个人资料权限从微信身份确定：游客拒绝、客户只能改头像、不能改教练资料', async () => {
  const f = await fixture(); f.context.OPENID = ''
  for (const action of ['updateCoachProfile', 'getOwnCoachProfile', 'getMediaUploadData', 'updateUserAvatar']) assert.equal((await f.call(action, f.form)).code, 'LOGIN_REQUIRED')
  f.context.OPENID = 'owner'; f.user.role = 1
  assert.equal((await f.call('updateCoachProfile', f.form)).code, 'FORBIDDEN')
  assert.equal((await f.call('getOwnCoachProfile')).code, 'FORBIDDEN')
  const result = await f.call('updateUserAvatar', { avatarUrl: f.file('avatar_001'), version: 0, userId: 'other' })
  assert.equal(result.success, true); assert.equal(f.user.avatar_url, f.file('avatar_001'))
  assert.equal(result.data.userProfile.avatarUrl, f.file('avatar_001'))
  assert.equal((await f.call('getCurrentUserSession')).data.userProfile.avatarUrl, f.file('avatar_001'))
})
test('文件须为本账号当前环境的图片，拒绝外链、其他用户、路径穿越和缺失图片', async () => {
  const f = await fixture()
  for (const avatarUrl of ['https://example.test/p.jpg', 'cloud://other.bucket/' + mediaPrefix(f.id) + 'p.jpg', 'cloud://test-env.bucket/' + mediaPrefix('other') + 'p.jpg', 'cloud://test-env.bucket/' + mediaPrefix(f.id) + '../p.jpg', f.file('x').replace('.jpg', '.exe')]) {
    assert.equal((await f.call('updateUserAvatar', { avatarUrl, version: 0 })).success, false)
    assert.equal((await f.call('updateCoachProfile', { ...f.form, photos: [avatarUrl] })).success, false)
  }
  f.state.fileError = true
  assert.equal((await f.call('updateUserAvatar', { avatarUrl: f.file('p'), version: 0 })).success, false)
  assert.equal((await f.call('updateCoachProfile', f.form)).success, false)
  assert.equal(f.user.avatar_url, '')
})
test('保存失败不覆盖旧资料，限制长度和照片数量，允许清空荣誉与相册', async () => {
  const f = await fixture(); await f.call('updateCoachProfile', f.form)
  const malformed = [ { title: '长'.repeat(61) }, { levelLabel: '长'.repeat(61) }, { bio: '长'.repeat(2001) }, { honors: ['长'.repeat(201)] }, { specialties: ['长'.repeat(41)] }, { photos: Array.from({ length: 7 }, (_, i) => f.file('p' + i)) } ]
  for (const item of malformed) assert.equal((await f.call('updateCoachProfile', { ...f.form, version: 1, ...item })).success, false)
  assert.equal(f.user.bio, f.form.bio)
  assert.equal((await f.call('updateCoachProfile', { ...f.form, version: 1, photos: [], honors: [], specialties: [] })).success, true)
  assert.deepEqual(f.user.coach_photos, []); assert.deepEqual(f.user.coach_honors, [])
})
test('重试同一草稿不会重复写入，旧版本不能覆盖新资料或新头像', async () => {
  const f = await fixture(); await f.call('updateCoachProfile', f.form)
  assert.equal((await f.call('updateCoachProfile', f.form)).data.coach.version, 1)
  assert.equal((await f.call('updateCoachProfile', { ...f.form, bio: '旧页面覆盖' })).success, false)
  await f.call('updateUserAvatar', { avatarUrl: f.file('avatar_1'), version: 0 })
  assert.equal((await f.call('updateUserAvatar', { avatarUrl: f.file('avatar_1'), version: 0 })).success, true)
  assert.equal((await f.call('updateUserAvatar', { avatarUrl: f.file('avatar_2'), version: 0 })).success, false)
  assert.equal(f.user.avatar_url, f.file('avatar_1'))
  assert.equal(f.user.coach_profile_version, 1)
})
test('停用、删除、改为客户的人员不能展示为可预约教练', async () => {
  const f = await fixture()
  assert.equal((await f.call('getCoachProfile', { coachId: 'missing' })).code, 'COACH_PROFILE_UNAVAILABLE')
  for (const item of [{ status: 0 }, { is_deleted: true }, { role: 1 }]) {
    Object.assign(f.user, { status: 1, is_deleted: false, role: 2 }, item)
    assert.equal((await f.call('getCoachProfile', { coachId: f.id })).code, 'COACH_PROFILE_UNAVAILABLE')
  }
})
test('教练编辑不会更改用户名或头像，预约大厅实时返回新介绍与头像', async () => {
  const f = await fixture(), name = f.user.real_name
  await f.call('updateUserAvatar', { avatarUrl: f.file('avatar'), version: 0 })
  await f.call('updateCoachProfile', { ...f.form, name: '冒名', avatarUrl: f.file('fake') })
  assert.equal(f.user.real_name, name); assert.equal(f.user.avatar_url, f.file('avatar'))
  const view = await f.call('getBookingViewData', { storeId: 'gaoxin', type: 'private', coachId: f.id })
  const coach = view.data.coaches.find(c => c.id === f.id)
  assert.equal(coach.avatarUrl, f.file('avatar')); assert.equal(coach.title, f.form.title)
  assert.equal((await f.call('getOwnCoachProfile')).data.avatarVersion, 1)
  assert.equal((await f.call('getMediaUploadData')).data.prefix, mediaPrefix(f.id))
})
test('内部读取故障只返回可理解的资料失败提示', async () => {
  const f = await fixture(), collection = f.state.db.collection
  f.state.db.collection = name => { const query = collection(name); return name === 'app_user' ? { ...query, doc: () => ({ get: async () => { throw new Error('database SDK secret stack') } }) } : query }
  const result = await f.call('getCoachProfile', { coachId: f.id })
  assert.equal(result.success, false); assert.doesNotMatch(result.message, /database|SDK|stack/)
})
