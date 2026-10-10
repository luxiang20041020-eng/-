const { test } = require('node:test'), assert = require('node:assert/strict')
const { createDatabase, loadFunction, login } = require('./helpers')
async function fixture() {
  const state = createDatabase(), context = { OPENID: 'owner', ENV: 'test-env' }, main = loadFunction(state, {}, context)
  const session = await login(main, '13812345678'); state.collections.get('app_user').get(session.data.userProfile.id).role = 3
  const form = { name: '新训练馆', address: '训练街123号', status: 1, longitude: -73.9857, latitude: 40.7484, introduction: '  多语言客户的泰拳训练空间\n二层入口  ', businessHours: 'Mon–Sun 10:00–22:00', phone: '+1 (212) 123-4567', arrivalTips: '地铁出口步行5分钟' }
  return { state, context, main, form }
}
test('管理员保存门店介绍与位置，游客首页可查看营业时间、指引和实景', async () => {
  const f = await fixture(), created = await f.main({ action: 'createStore', payload: f.form })
  assert.equal(created.success, true); assert.equal(created.data.storeInfo.introduction, f.form.introduction.trim())
  const id = created.data.storeInfo.id; f.context.OPENID = 'guest'
  const home = await f.main({ action: 'getHomeViewData', payload: { storeId: id } })
  assert.equal(home.success, true); assert.equal(home.data.currentStore.latitude, 40.7484)
  const venue = home.data.stores.find(store => store.id === id)
  for (const field of ['businessHours', 'phone', 'arrivalTips']) assert.equal(venue[field], f.form[field])
  assert.equal(venue.gallery.length, 3); assert.equal('gallery_updated_by' in venue, false)
  assert.equal((await f.main({ action: 'updateStore', payload: { ...f.form, targetStoreId: id } })).code, 'LOGIN_REQUIRED')
})
test('旧客户端修改基本资料保留介绍，新客户端可明确清空可选信息', async () => {
  const f = await fixture(), created = await f.main({ action: 'createStore', payload: f.form }), id = created.data.storeInfo.id
  const legacy = { name: '更新训练馆', address: '新地址', longitude: '', latitude: '', targetStoreId: id }
  assert.equal((await f.main({ action: 'updateStore', payload: legacy })).success, true)
  let row = f.state.collections.get('biz_store').get(id); assert.equal(row.introduction, f.form.introduction.trim()); assert.equal(row.business_hours, f.form.businessHours)
  row.phone = '旧电话号码'
  const cleared = await f.main({ action: 'updateStore', payload: { ...legacy, introduction: '', businessHours: '', phone: '', arrivalTips: '' } })
  assert.equal(cleared.success, true); assert.equal(cleared.data.storeInfo.phone, ''); assert.equal(cleared.data.storeInfo.introduction, '')
})
test('介绍、联系电话及成对坐标校验失败不写入门店', async () => {
  const f = await fixture(), before = f.state.collections.get('biz_store').size
  for (const patch of [{ introduction: '长'.repeat(1201) }, { businessHours: '长'.repeat(121) }, { arrivalTips: '长'.repeat(301) }, { phone: '错误电话' }, { phone: '+++' }, { longitude: '', latitude: 34 }, { latitude: 91 }, { introduction: {} }]) {
    const result = await f.main({ action: 'createStore', payload: { ...f.form, ...patch } })
    assert.equal(result.success, false); assert.doesNotMatch(result.message, /database|document|_id/)
  }
  assert.equal(f.state.collections.get('biz_store').size, before)
})
