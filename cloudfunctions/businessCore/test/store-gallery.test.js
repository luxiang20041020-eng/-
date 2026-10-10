const { test } = require('node:test')
const assert = require('node:assert/strict')
const { createDatabase, loadFunction, login } = require('./helpers')
const { mediaPrefix } = require('../coach-profile')
async function fixture() {
  const state = createDatabase(), context = { OPENID: 'owner', ENV: 'test-env' }, main = loadFunction(state, {}, context)
  const result = await login(main, '13812345678'), id = result.data.userProfile.id
  state.collections.get('app_user').get(id).role = 3
  const stores = [...state.collections.get('biz_store').values()]
  const file = (name, user = id) => 'cloud://test-env.bucket/' + mediaPrefix(user) + name + '.jpg'
  const call = (action, payload) => main({ action, payload })
  const save = (gallery, version = 0, targetStoreId = stores[0]._id) => call('updateStoreGallery', { gallery, version, targetStoreId })
  return { state, context, main, call, save, file, id, stores, get user() { return state.collections.get('app_user').get(id) } }
}
test('门店实景独立保存，首页跟随门店切换，默认和空相册区分', async () => {
  const f = await fixture()
  const before = await f.call('getHomeViewData', { storeId: f.stores[0]._id })
  assert.equal(before.data.galleryList.length, 3); assert.equal(before.data.galleryList[0].defaultTitle, true)
  const gallery = [{ url: f.file('store_1'), title: '  新拳台  ' }]
  const saved = await f.save(gallery)
  assert.equal(saved.success, true); assert.equal(saved.data.version, 1)
  const home = await f.call('getHomeViewData', { storeId: f.stores[0]._id })
  assert.equal(home.data.galleryList[0].url, gallery[0].url); assert.equal(home.data.galleryList[0].title, '新拳台'); assert.equal(home.data.galleryList[0].defaultTitle, false)
  const other = await f.call('getHomeViewData', { storeId: f.stores[1]._id }); assert.equal(other.data.galleryList.length, 3)
  const manage = await f.call('getAdminStoreManageData'); const store = manage.data.stores.find(store => store.id === f.stores[0]._id)
  assert.equal(store.galleryVersion, 1); assert.equal(store.gallery[0].url, gallery[0].url)
  assert.equal((await f.save([], 1)).success, true)
  assert.equal((await f.call('getHomeViewData', { storeId: f.stores[0]._id })).data.galleryList.length, 0)
})
test('权限依据登录身份，不能由客户或游客更换实景照片', async () => {
  const f = await fixture(); f.user.role = 1
  assert.equal((await f.save([])).code, 'FORBIDDEN')
  f.context.OPENID = ''; assert.equal((await f.save([])).code, 'LOGIN_REQUIRED')
  assert.equal(f.state.collections.get('biz_store').get(f.stores[0]._id).home_gallery, undefined)
})
test('拒绝外链、其他账号的新照片、错误环境、默认图片穿越、失效照片及超长草稿', async () => {
  const f = await fixture()
  for (const url of ['https://example.test/photo.jpg', f.file('foreign', 'other'), f.file('p').replace('test-env.bucket', 'other-env.bucket'), '/images/../app.js', f.file('p').replace('.jpg', '.exe')]) assert.equal((await f.save([{ url, title: '' }])).success, false, url)
  for (const gallery of [[{ url: f.file('p'), title: '长'.repeat(41) }], Array.from({ length: 7 }, (_, i) => ({ url: f.file('p' + i), title: '' })), [{ url: f.file('p'), title: '' }, { url: f.file('p'), title: '' }]]) assert.equal((await f.save(gallery)).success, false)
  f.state.fileError = true; const fail = await f.save([{ url: f.file('p'), title: '' }]); assert.match(fail.message, /已失效/)
  assert.equal(f.state.collections.get('biz_store').get(f.stores[0]._id).home_gallery, undefined)
})
test('保存重试幂等，旧版本不能覆盖新相册，缺失门店返回具体原因', async () => {
  const f = await fixture(), gallery = [{ url: f.file('p'), title: '拳台' }]
  assert.equal((await f.save(gallery)).data.version, 1)
  assert.equal((await f.save(gallery)).data.version, 1)
  assert.match((await f.save([{ url: f.file('q'), title: '' }])).message, /其他管理员/)
  assert.equal((await f.save([], 0, 'missing')).code, 'TARGET_STORE_NOT_FOUND')
  assert.equal(f.state.collections.get('biz_store').get(f.stores[0]._id).home_gallery[0].url, gallery[0].url)
})
test('另一管理员可保留本门店已发布照片，但不能复用其他门店的他人文件', async () => {
  const f = await fixture(); await f.save([{ url: f.file('owner_photo'), title: '拳台' }])
  f.context.OPENID = 'second'; const second = await login(f.main, '13912345678'); const secondId = second.data.userProfile.id
  f.state.collections.get('app_user').get(secondId).role = 3
  const retained = await f.save([{ url: f.file('owner_photo'), title: '更新说明' }, { url: f.file('second_photo', secondId), title: '' }], 1)
  assert.equal(retained.success, true)
  const foreign = await f.save([{ url: f.file('owner_photo'), title: '' }], 0, f.stores[1]._id)
  assert.equal(foreign.success, false)
})
