const {test}=require('node:test'),assert=require('node:assert/strict')
const {createDatabase,loadFunction,login}=require('./helpers')
const {enableOptimisticTransactions}=require('./optimistic-transactions')
const {businessDate}=require('../request-policy')
const {chargeFor,refundPlan}=require('../entitlements')
async function fixture(parallel=false){
  const state=createDatabase(),context={OPENID:'customer',ENV:'test-env'},main=loadFunction(state,{},context)
  const session=await login(main,'13812345678'),id=session.data.userProfile.id
  const users=state.collections.get('app_user'),slots=state.collections.get('biz_class_schedule'),assets=state.collections.get('user_asset')
  users.set('safety-coach',{_id:'safety-coach',role:2,status:1,is_deleted:false})
  users.get(id).role=3
  const format=h=>new Date(Date.now()+(h+8)*3600000).toISOString().slice(0,19).replace('T',' ')
  const slot=(key,start=48,end=49,capacity=1,coach='safety-coach')=>slots.set(key,{_id:key,store_id:'gaoxin',coach_id:coach,title:key,class_type:1,start_time:format(start),end_time:format(end),max_capacity:capacity,booked_count:0,status:1,is_deleted:false})
  slot('safety-one');assets.set(id+'_1',{_id:id+'_1',user_id:id,asset_type:1,balance:10,expiry_date:'2099-01-01',is_deleted:false})
  assets.set(id+'_2',{_id:id+'_2',user_id:id,asset_type:2,balance:10,expiry_date:'2099-01-01',is_deleted:false})
  if(parallel)enableOptimisticTransactions(state)
  const call=(action,payload={})=>main({action,payload})
  const as=(userId,action,payload)=>main({action,payload:{...payload,userId}})
  return {state,context,main,id,users,slots,assets,format,slot,call,as}
}
test('已预约客户调课到另一位教练的重叠训练必须失败，首尾相接可成功',async()=>{
  const f=await fixture();f.slot('safety-two',52,53);await f.call('createBooking',{scheduleId:'safety-one'});await f.call('createBooking',{scheduleId:'safety-two'})
  const detail=(await f.call('getScheduleAdjustmentData',{classId:'safety-one'})).data
  const p={classId:'safety-one',version:detail.schedule.version,coachId:'safety-coach',title:'调整',startTime:f.format(52),endTime:f.format(53),capacity:1,reason:'调整时间'}
  // 另一场由其他教练负责，确保失败来自客户冲突而非教练冲突。
  f.slots.get('safety-two').coach_id='another-coach'
  const failed=await f.call('updateCoachSchedule',p);assert.equal(failed.success,false);assert.match(failed.message,/客户.*重叠/)
  assert.equal(f.slots.get('safety-one').start_time,f.format(48));assert.equal(f.assets.get(f.id+'_1').balance,8)
  assert.equal((await f.call('updateCoachSchedule',{...p,startTime:f.format(53),endTime:f.format(54)})).success,true)
})
test('最后一个名额并发预约只成功一人，失败方不扣课',async()=>{
  const f=await fixture(true),operator=f.users.get(f.id)
  // 固定微信身份，同一客户并发预约最后一个名额也必须仅扣一次。
  const results=await Promise.all([f.call('createBooking',{scheduleId:'safety-one'}),f.call('createBooking',{scheduleId:'safety-one'})])
  assert.equal(results.filter(r=>r.success).length,1);assert.equal(f.assets.get(f.id+'_1').balance,9);assert.equal(f.slots.get('safety-one').booked_count,1);assert.ok(f.state.conflicts)
  assert.equal([...f.state.collections.get('biz_booking').values()].filter(b=>b.user_id===operator._id&&b.schedule_id==='safety-one').length,1)
})
test('同一客户并发预约不同教练的重叠课程，只有一笔扣课和预约',async()=>{
  const f=await fixture(true);f.slot('safety-two',48,49,1,'another-coach')
  const results=await Promise.all([f.call('createBooking',{scheduleId:'safety-one'}),f.call('createBooking',{scheduleId:'safety-two'})])
  assert.equal(results.filter(r=>r.success).length,1);assert.equal(f.assets.get(f.id+'_1').balance,9);assert.equal(f.slots.get('safety-one').booked_count+f.slots.get('safety-two').booked_count,1)
})
test('并发重复取消只返还一次并释放名额，重新预约满员状态正确',async()=>{
  const f=await fixture(true),booking=await f.call('createBooking',{scheduleId:'safety-one'})
  const results=await Promise.all([f.call('cancelBooking',{bookingId:booking.data.bookingId}),f.call('cancelBooking',{bookingId:booking.data.bookingId})])
  assert.equal(results.filter(r=>r.success).length,1);assert.equal(f.assets.get(f.id+'_1').balance,10);assert.equal(f.slots.get('safety-one').booked_count,0);assert.equal(f.slots.get('safety-one').status,1)
  assert.equal((await f.call('createBooking',{scheduleId:'safety-one'})).success,true);assert.equal(f.assets.get(f.id+'_1').balance,9);assert.equal(f.slots.get('safety-one').status,2)
})
test('并发调课与另一场预约不能共同造成客户重叠',async()=>{
  const f=await fixture(true);f.slot('safety-two',52,53,1,'another-coach');await f.call('createBooking',{scheduleId:'safety-one'})
  const detail=(await f.call('getScheduleAdjustmentData',{classId:'safety-one'})).data
  const results=await Promise.all([f.call('createBooking',{scheduleId:'safety-two'}),f.call('updateCoachSchedule',{classId:'safety-one',version:detail.schedule.version,coachId:'safety-coach',title:'调整',startTime:f.format(52),endTime:f.format(53),capacity:1,reason:'调整时间'})])
  assert.equal(results.filter(r=>r.success).length,1)
})
test('异常场次时间、容量和余额不得绕过满员或冲突检查',async()=>{
  for(const patch of [{end_time:''},{end_time:'2000-01-01 00:00:00'},{max_capacity:null},{max_capacity:'invalid'},{booked_count:'invalid'},{booked_count:-1},{class_type:7}]){
    const f=await fixture();Object.assign(f.slots.get('safety-one'),patch);assert.equal((await f.call('createBooking',{scheduleId:'safety-one'})).success,false);assert.equal(f.assets.get(f.id+'_1').balance,10)
  }
  for(const balance of ['invalid',-1,1.5,Infinity])assert.throws(()=>chargeFor({balance,is_deleted:false}),/余额异常/)
})
test('次数和无限次的到期当天可用，翌日失效，退款不改变有效期或无限次余额',()=>{
  const today=businessDate();assert.equal(chargeFor({balance:1,expiry_date:today},today).charged_count,1)
  assert.throws(()=>chargeFor({balance:1,expiry_date:'2000-01-01'},today),/到期/)
  assert.equal(chargeFor({balance:0,unlimited_start_date:today,unlimited_expiry_date:today},today).charged_count,0)
  assert.throws(()=>chargeFor({balance:0,unlimited_start_date:'2099-01-01',unlimited_expiry_date:'2099-02-01'},today),/用完/)
  assert.equal(refundPlan({charge_mode:'unlimited'},{balance:0}).balance,0)
  assert.equal(refundPlan({charged_count:1,count_generation:'old'},{count_generation:'new',expiry_date:'2099-01-01'}).expired,1)
})
test('旧人工核销纠错在过期续费后不增加新套餐余额，保留过期返还记录且不重复返还',async()=>{
  const f=await fixture();const trainingTime=businessDate()+' 00:01:00'
  const written=await f.call('manualWriteOff',{userId:f.id,storeId:'gaoxin',classType:1,trainingTime,requestId:'safety_manual_000001',remark:'实际训练'})
  assert.equal(written.success,true);const asset=f.assets.get(f.id+'_1');asset.expiry_date='2000-01-01'
  const grant=await f.call('distributeAsset',{userId:f.id,storeId:'gaoxin',packageId:'pkg_group_half_year',expiryDate:'2099-01-01',offlineAmount:100,payType:'现金'})
  assert.equal(grant.success,true);const balance=f.assets.get(f.id+'_1').balance
  const p={kind:'writeoff',id:written.data.bookingId,version:1,reason:'误核销'}
  const corrected=await f.call('reverseOperation',p);assert.equal(corrected.success,true);assert.equal(corrected.data.expiredRefund,1);assert.equal(f.assets.get(f.id+'_1').balance,balance);assert.equal(f.assets.get(f.id+'_1').expired_refund_count,1)
  await f.call('reverseOperation',p);assert.equal(f.assets.get(f.id+'_1').expired_refund_count,1)
})
test('不同客户同时抢最后一个名额，失败客户余额保持不变',async()=>{
  const f=await fixture(true),otherContext={OPENID:'second-customer',ENV:'test-env'},otherMain=loadFunction(f.state,{},otherContext)
  const other=(await login(otherMain,'13812345679')).data.userProfile.id
  f.assets.set(other+'_1',{_id:other+'_1',user_id:other,asset_type:1,balance:10,is_deleted:false})
  const results=await Promise.all([f.call('createBooking',{scheduleId:'safety-one'}),otherMain({action:'createBooking',payload:{scheduleId:'safety-one'}})])
  assert.equal(results.filter(r=>r.success).length,1);assert.equal(f.slots.get('safety-one').booked_count,1)
  for(const [index,id]of [f.id,other].entries())assert.equal(f.assets.get(id+'_1').balance,results[index].success?9:10)
})
test('客户同时预约团课和专属训练，跨课时类型也不能出现时间重叠',async()=>{
  const f=await fixture(true),date=businessDate(Date.now()+2*86400000),slot=f.slots.get('safety-one')
  slot.start_time=date+' 10:00:00';slot.end_time=date+' 11:00:00';slot.coach_id='another-coach'
  const results=await Promise.all([f.call('createBooking',{scheduleId:'safety-one'}),f.call('createPrivateBooking',{storeId:'gaoxin',coachId:'safety-coach',date,start:'10:00',end:'11:00',requestId:'safety_private_001'})])
  assert.equal(results.filter(r=>r.success).length,1);assert.equal(f.assets.get(f.id+'_1').balance+f.assets.get(f.id+'_2').balance,19)
})
test('不同客户并发预约同一教练的专属时段，只创建一场且只扣一人课时',async()=>{
  const f=await fixture(true),otherMain=loadFunction(f.state,{}, {OPENID:'private-second',ENV:'test-env'})
  const other=(await login(otherMain,'13812345679')).data.userProfile.id
  f.assets.set(other+'_2',{_id:other+'_2',user_id:other,asset_type:2,balance:10,is_deleted:false})
  const payload={storeId:'gaoxin',coachId:'safety-coach',date:businessDate(Date.now()+2*86400000),start:'10:00',end:'11:00',requestId:'safety_private_race_001'}
  const results=await Promise.all([f.call('createPrivateBooking',payload),otherMain({action:'createPrivateBooking',payload})])
  assert.equal(results.filter(r=>r.success).length,1);assert.equal(f.assets.get(f.id+'_2').balance+f.assets.get(other+'_2').balance,19)
  assert.equal([...f.slots.values()].filter(s=>s.direct_private).length,1)
})
test('专属预约同一请求并发重试只扣一次，重复成功指向同一记录',async()=>{
  const f=await fixture(true),p={storeId:'gaoxin',coachId:'safety-coach',date:businessDate(Date.now()+2*86400000),start:'10:00',end:'11:00',requestId:'safety_private_repeat_001'}
  const results=await Promise.all([f.call('createPrivateBooking',p),f.call('createPrivateBooking',p)])
  assert.ok(results.every(r=>r.success));assert.equal(results[0].data.bookingId,results[1].data.bookingId);assert.equal(f.assets.get(f.id+'_2').balance,9)
})
