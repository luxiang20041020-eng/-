const cloud = require('wx-server-sdk')
const crypto = require('crypto')
const { unlimitedAt, chargeFor, refundCount } = require('./entitlements')
const { getUserMessage } = require('./user-feedback')
const { PUBLIC_ACTIONS, authorizeRequest, parseBusinessTime, businessDate, canCancel } = require('./request-policy')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
})

const db = cloud.database()
const _ = db.command

const COLLECTIONS = {
  USER: 'app_user',
  STORE: 'biz_store',
  PACKAGE: 'biz_package',
  USER_ASSET: 'user_asset',
  USER_ASSET_LOG: 'user_asset_log',
  CLASS_SCHEDULE: 'biz_class_schedule',
  BOOKING: 'biz_booking',
  INVITE_CODE: 'user_invite_code',
  POINT_LOG: 'user_point_log',
}

// 同一热实例共享初始化结果；失败时清空 Promise，让下一次请求可以重试。
let databaseReadyPromise = null

const ASSET_TYPE = {
  GROUP: 1,
  PRIVATE: 2,
}

const OPERATE_TYPE = {
  COACH_DISTRIBUTE: 1,
  CLIENT_BOOK: 2,
  CLIENT_CANCEL: 3,
  SYSTEM_VOID: 4,
  MANUAL_WRITEOFF: 5,
}

const BOOKING_STATUS = {
  PENDING: 1,
  WRITTEN_OFF: 2,
  CLIENT_CANCELLED: 3,
  COACH_CANCELLED: 4,
  ABSENT: 5,
}

const SCHEDULE_STATUS = {
  OPEN: 1,
  FULL: 2,
  FINISHED: 3,
  COACH_CANCELLED: 4,
}

const WEEKDAY_LABELS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

const ROLE_VALUE_MAP = {
  1: 'client',
  2: 'coach',
  3: 'admin',
}

const ROLE_LABEL_MAP = {
  1: '客户',
  2: '场馆人员',
  3: '管理员',
}

const storeSeeds = [
  {
    _id: 'gaoxin',
    name: '高新旗舰店',
    address: '高新区唐延路 88 号',
    longitude: 108.893201,
    latitude: 34.230182,
    status: 1,
    created_at: db.serverDate(),
    updated_at: db.serverDate(),
    is_deleted: false,
  },
  {
    _id: 'jingkai',
    name: '经开实战店',
    address: '经开区凤城八路 18 号',
    longitude: 108.953201,
    latitude: 34.328182,
    status: 1,
    created_at: db.serverDate(),
    updated_at: db.serverDate(),
    is_deleted: false,
  },
]

const packageSeeds = [
  {
    _id: 'pkg_private_30',
    name: '30次专属权益',
    asset_type: ASSET_TYPE.PRIVATE,
    course_count: 30,
    display_price: 6000,
    status: 1,
    created_at: db.serverDate(),
    updated_at: db.serverDate(),
    is_deleted: false,
  },
  {
    _id: 'pkg_private_trial',
    name: '新人体验权益',
    asset_type: ASSET_TYPE.PRIVATE,
    course_count: 1,
    display_price: 99,
    status: 1,
    created_at: db.serverDate(),
    updated_at: db.serverDate(),
    is_deleted: false,
  },
  {
    _id: 'pkg_group_half_year',
    name: '半年团体权益',
    asset_type: ASSET_TYPE.GROUP,
    course_count: 48,
    display_price: 2999,
    status: 1,
    created_at: db.serverDate(),
    updated_at: db.serverDate(),
    is_deleted: false,
  },
]

const userSeeds = [
  {
    _id: 'u_1001',
    openid: 'demo_openid_client_1001',
    phone: '13800001234',
    real_name: '王小明',
    avatar_url: '',
    role: 1,
    home_store_id: 'gaoxin',
    status: 1,
    created_at: db.serverDate(),
    updated_at: db.serverDate(),
    is_deleted: false,
  },
  {
    _id: 'u_1002',
    openid: 'demo_openid_client_1002',
    phone: '13800004567',
    real_name: '张三',
    avatar_url: '',
    role: 1,
    home_store_id: 'gaoxin',
    status: 1,
    created_at: db.serverDate(),
    updated_at: db.serverDate(),
    is_deleted: false,
  },
  {
    _id: 'u_1003',
    openid: 'demo_openid_client_1003',
    phone: '13800007890',
    real_name: '李四',
    avatar_url: '',
    role: 1,
    home_store_id: 'gaoxin',
    status: 1,
    created_at: db.serverDate(),
    updated_at: db.serverDate(),
    is_deleted: false,
  },
  {
    _id: 'u_1004',
    openid: 'demo_openid_client_1004',
    phone: '13911112222',
    real_name: '赵六',
    avatar_url: '',
    role: 1,
    home_store_id: 'jingkai',
    status: 1,
    created_at: db.serverDate(),
    updated_at: db.serverDate(),
    is_deleted: false,
  },
  {
    _id: 'coach_li',
    openid: 'demo_openid_coach_2001',
    phone: '13900001234',
    real_name: '李馆员',
    avatar_url: '',
    coach_title: '场馆服务顾问',
    specialties: ['步法', '膝法', '燃脂'],
    level_label: '资深',
    bio: '熟悉馆内区域与到店流程，擅长小班时段安排。',
    role: 2,
    home_store_id: 'gaoxin',
    status: 1,
    created_at: db.serverDate(),
    updated_at: db.serverDate(),
    is_deleted: false,
  },
  {
    _id: 'coach_wang',
    openid: 'demo_openid_coach_2002',
    phone: '13900004567',
    real_name: '王馆员',
    avatar_url: '',
    coach_title: '场馆协调员',
    specialties: ['拳法', '实战', '对练'],
    level_label: '资深',
    bio: '擅长对练体系与比赛节奏建立，偏实战风格。',
    role: 2,
    home_store_id: 'gaoxin',
    status: 1,
    created_at: db.serverDate(),
    updated_at: db.serverDate(),
    is_deleted: false,
  },
  {
    _id: 'coach_zhao',
    openid: 'demo_openid_coach_2003',
    phone: '13900007890',
    real_name: '赵馆员',
    avatar_url: '',
    coach_title: '体能区顾问',
    specialties: ['减脂', '专属', '体能'],
    level_label: '核心',
    bio: '熟悉体能区与专属预约流程，适合零基础体验。',
    role: 2,
    home_store_id: 'jingkai',
    status: 1,
    created_at: db.serverDate(),
    updated_at: db.serverDate(),
    is_deleted: false,
  },
  {
    _id: 'admin_001',
    openid: 'demo_openid_admin_3001',
    phone: '13700001234',
    real_name: '管理员',
    avatar_url: '',
    role: 3,
    home_store_id: 'gaoxin',
    status: 1,
    created_at: db.serverDate(),
    updated_at: db.serverDate(),
    is_deleted: false,
  },
]

const userAssetSeeds = [
  {
    _id: buildAssetDocId('u_1001', ASSET_TYPE.PRIVATE),
    user_id: 'u_1001',
    asset_type: ASSET_TYPE.PRIVATE,
    balance: 12,
    total_earned: 12,
    created_at: db.serverDate(),
    updated_at: db.serverDate(),
    is_deleted: false,
  },
  {
    _id: buildAssetDocId('u_1001', ASSET_TYPE.GROUP),
    user_id: 'u_1001',
    asset_type: ASSET_TYPE.GROUP,
    balance: 5,
    total_earned: 5,
    created_at: db.serverDate(),
    updated_at: db.serverDate(),
    is_deleted: false,
  },
  {
    _id: buildAssetDocId('u_1002', ASSET_TYPE.PRIVATE),
    user_id: 'u_1002',
    asset_type: ASSET_TYPE.PRIVATE,
    balance: 6,
    total_earned: 6,
    created_at: db.serverDate(),
    updated_at: db.serverDate(),
    is_deleted: false,
  },
  {
    _id: buildAssetDocId('u_1002', ASSET_TYPE.GROUP),
    user_id: 'u_1002',
    asset_type: ASSET_TYPE.GROUP,
    balance: 10,
    total_earned: 10,
    created_at: db.serverDate(),
    updated_at: db.serverDate(),
    is_deleted: false,
  },
  {
    _id: buildAssetDocId('u_1003', ASSET_TYPE.PRIVATE),
    user_id: 'u_1003',
    asset_type: ASSET_TYPE.PRIVATE,
    balance: 0,
    total_earned: 0,
    created_at: db.serverDate(),
    updated_at: db.serverDate(),
    is_deleted: false,
  },
  {
    _id: buildAssetDocId('u_1003', ASSET_TYPE.GROUP),
    user_id: 'u_1003',
    asset_type: ASSET_TYPE.GROUP,
    balance: 8,
    total_earned: 8,
    created_at: db.serverDate(),
    updated_at: db.serverDate(),
    is_deleted: false,
  },
  {
    _id: buildAssetDocId('u_1004', ASSET_TYPE.PRIVATE),
    user_id: 'u_1004',
    asset_type: ASSET_TYPE.PRIVATE,
    balance: 2,
    total_earned: 2,
    created_at: db.serverDate(),
    updated_at: db.serverDate(),
    is_deleted: false,
  },
  {
    _id: buildAssetDocId('u_1004', ASSET_TYPE.GROUP),
    user_id: 'u_1004',
    asset_type: ASSET_TYPE.GROUP,
    balance: 1,
    total_earned: 1,
    created_at: db.serverDate(),
    updated_at: db.serverDate(),
    is_deleted: false,
  },
]

const scheduleSeeds = [
  {
    _id: 'class_001',
    store_id: 'gaoxin',
    store_name: '高新旗舰店',
    coach_id: 'coach_li',
    class_type: ASSET_TYPE.GROUP,
    title: '泰拳基础发力小班场',
    start_time: '2026-04-24 19:00:00',
    end_time: '2026-04-24 20:30:00',
    max_capacity: 15,
    booked_count: 12,
    status: SCHEDULE_STATUS.OPEN,
    venue: '高新旗舰店',
    created_at: db.serverDate(),
    updated_at: db.serverDate(),
    is_deleted: false,
  },
  {
    _id: 'class_002',
    store_id: 'gaoxin',
    store_name: '高新旗舰店',
    coach_id: 'coach_li',
    class_type: ASSET_TYPE.PRIVATE,
    title: '拳腿衔接专属时段',
    start_time: '2026-04-24 20:30:00',
    end_time: '2026-04-24 21:30:00',
    max_capacity: 1,
    booked_count: 0,
    status: SCHEDULE_STATUS.OPEN,
    venue: '高新旗舰店',
    created_at: db.serverDate(),
    updated_at: db.serverDate(),
    is_deleted: false,
  },
]

const bookingSeeds = [
  {
    _id: 'booking_001',
    schedule_id: 'class_001',
    user_id: 'u_1001',
    status: BOOKING_STATUS.PENDING,
    writeoff_time: null,
    created_at: db.serverDate(),
    updated_at: db.serverDate(),
    is_deleted: false,
  },
  {
    _id: 'booking_101',
    schedule_id: 'class_001',
    user_id: 'u_1002',
    status: BOOKING_STATUS.WRITTEN_OFF,
    writeoff_time: db.serverDate(),
    created_at: db.serverDate(),
    updated_at: db.serverDate(),
    is_deleted: false,
  },
  {
    _id: 'booking_102',
    schedule_id: 'class_001',
    user_id: 'u_1003',
    status: BOOKING_STATUS.PENDING,
    writeoff_time: null,
    created_at: db.serverDate(),
    updated_at: db.serverDate(),
    is_deleted: false,
  },
  {
    _id: 'booking_201',
    schedule_id: 'class_002',
    user_id: 'u_1004',
    status: BOOKING_STATUS.PENDING,
    writeoff_time: null,
    created_at: db.serverDate(),
    updated_at: db.serverDate(),
    is_deleted: false,
  },
]

const HOME_NOTICES = [
  '暑期燃脂计划开启。',
  '五一假期营业时间调整：高新店 9:00-21:00，经开店 10:00-20:00。',
  '新手友好体验时段持续开放，首次到店可申请动作评估。',
]

const { galleryView } = require('./store-gallery')

const COACH_QUICK_ACTIONS = [
  { id: 'distribute', title: '权益派发', desc: '线下收款后给学员加权益，并形成审计流水。' },
  { id: 'class', title: '到场核销', desc: '进入单节名单，扫码或手动核销到场学员。' },
  { id: 'schedule', title: '排期管理', desc: '管理近期排期并临时新增场次计划。' },
  { id: 'manual', title: '人工核销', desc: '为线下预约学员登记训练并扣减课时。' },
]

function buildSuccess(data) {
  return {
    success: true,
    data,
  }
}

async function runBusinessTransaction(callback) {
  const response = await db.runTransaction(callback)
  // 兼容 SDK 直接返回回调值和 { result, errMsg } 两种事务结果。
  return response && response.errMsg && Object.prototype.hasOwnProperty.call(response, 'result') ? response.result : response
}

function buildFail(message, code = 'BUSINESS_FAIL') {
  console.warn('business_failure', code, String(message || ''))
  return {
    success: false,
    code,
    message: getUserMessage(message, '操作未完成，请稍后重试', code),
  }
}

function buildAssetDocId(userId, assetType) {
  return userId + '_' + assetType
}

function normalizeAmount(value) {
  return Number(value || 0)
}

function mapUserRoleToPageRole(role) {
  return ROLE_VALUE_MAP[Number(role)] || 'client'
}

function mapUserRoleToLabel(role) {
  return ROLE_LABEL_MAP[Number(role)] || '客户'
}

function buildRoleOptions() {
  return [1, 2, 3].map((value) => ({
    value,
    key: mapUserRoleToPageRole(value),
    label: mapUserRoleToLabel(value),
  }))
}

function buildUserStatusLabel(status) {
  return Number(status) === 1 ? '正常' : '停用'
}

function buildPackageStatusLabel(status) {
  return Number(status) === 1 ? '已上架' : '已下架'
}

function buildStoreStatusLabel(status) {
  return Number(status) === 1 ? '营业中' : '已停用'
}

function buildIdentityQrScene(user, minuteKey) {
  const compactUserId = String(user && user._id ? user._id : 'guest').replace(/[^0-9a-zA-Z]/g, '').slice(-18) || 'guest'
  const compactMinuteKey = String(minuteKey || '').replace(/[^0-9]/g, '').slice(-4) || '0000'
  const compactRole = String(user && user.role ? Number(user.role) : 1)
  return 'u' + compactUserId + 't' + compactMinuteKey + 'r' + compactRole
}

function buildUserLevelText(user) {
  const role = mapUserRoleToPageRole(user && user.role)
  if (role === 'coach') {
    return user.coach_title || (user.level_label ? user.level_label + '场馆人员' : '场馆人员')
  }
  if (role === 'admin') {
    return '门店运营管理员'
  }
  return '综合格斗会员'
}

function buildUserProfileView(user) {
  if (!user) {
    return null
  }
  return {
    id: user._id,
    avatarUrl: user.avatar_url || '', avatarVersion: Number(user.avatar_version || 0),
    nickname: user.real_name || user.phone || '未命名用户',
    phone: user.phone || '',
    levelText: buildUserLevelText(user),
    homeStoreId: user.home_store_id || '',
    role: mapUserRoleToPageRole(user.role),
    roleLabel: mapUserRoleToLabel(user.role),
  }
}

function normalizeNickname(value) {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function buildPhoneUserId(phone) {
  return 'u_' + crypto.createHash('sha256').update(phone).digest('hex').slice(0, 24)
}

function mapClassTypeToAssetType(classType) {
  return Number(classType) === ASSET_TYPE.GROUP ? ASSET_TYPE.GROUP : ASSET_TYPE.PRIVATE
}

async function tryCreateCollection(collectionName) {
  try {
    await db.createCollection(collectionName)
    return { collectionName, created: true, status: 'created' }
  } catch (error) {
    // 不把泛化错误码或 resource system error 当作“已存在”。只有实际可访问才算成功。
    const inspection = await inspectCollection(collectionName)
    if (inspection.ok) {
      return { collectionName, created: false, status: 'exists' }
    }
    throw error
  }
}

async function inspectCollection(collectionName) {
  try {
    const countResult = await db.collection(collectionName).count()
    return {
      collectionName,
      ok: true,
      total: countResult.total,
    }
  } catch (error) {
    return {
      collectionName,
      ok: false,
      total: null,
      error: String(error && error.errMsg ? error.errMsg : error),
      errorCode: String(error && error.errCode ? error.errCode : ''),
    }
  }
}

async function seedCollectionIfEmpty(collectionName, docs) {
  if (!docs.length) {
    return { collectionName, seeded: false, total: 0, insertedCount: 0, insertedIds: [] }
  }

  const insertedIds = []
  for (const doc of docs) {
    const existsResult = await db.collection(collectionName).where({ _id: doc._id }).count()
    if (existsResult.total > 0) {
      continue
    }
    try {
      await db.collection(collectionName).add({ data: doc })
      insertedIds.push(doc._id)
    } catch (error) {
      // 多个冷实例可能同时插入固定 ID。仅忽略已确认落库的重复键错误。
      const message = String(error.errMsg || error.message || error)
      if (!/duplicate|already exists|document.*exist/i.test(message)) {
        throw error
      }
      const existing = await db.collection(collectionName).where({ _id: doc._id }).count()
      if (!existing.total) {
        throw error
      }
    }
  }

  const finalCount = await db.collection(collectionName).count()
  return {
    collectionName,
    seeded: insertedIds.length > 0,
    total: finalCount.total,
    insertedCount: insertedIds.length,
    insertedIds,
  }
}

async function getDocById(collectionName, docId, database = db) {
  try {
    return await database.collection(collectionName).doc(docId).get()
  } catch (error) {
    // 服务端 SDK 会将文档不存在抛为异常。只将这一明确情况视为空记录，
    // 集合缺失、权限、网络及事务冲突仍须向上传递，防止错误覆盖已有数据。
    const message = String(error.errMsg || error.message || error).trim()
    if (/^document\.get:fail document with _id\s+.+\s+does not exist$/i.test(message)) return { data: null }
    throw error
  }
}

async function getFirstUserByWhere(where) {
  const list = await listCollection(COLLECTIONS.USER, where)
  return list[0] || null
}

async function ensureBaseCollectionsAndSeeds({ includeDemo = false } = {}) {
  const createResults = await Promise.all(Object.values(COLLECTIONS).map(tryCreateCollection))

  const seedResults = await Promise.all([
    seedCollectionIfEmpty(COLLECTIONS.STORE, storeSeeds),
    seedCollectionIfEmpty(COLLECTIONS.PACKAGE, packageSeeds),
  ])
  // 正式启动只准备基础配置，不创建虚拟人员、余额、排课和预约。
  if (includeDemo) {
    seedResults.push(await seedCollectionIfEmpty(COLLECTIONS.USER, userSeeds))
    seedResults.push(await seedCollectionIfEmpty(COLLECTIONS.USER_ASSET, userAssetSeeds))
    seedResults.push(await seedCollectionIfEmpty(COLLECTIONS.CLASS_SCHEDULE, scheduleSeeds))
    seedResults.push(await seedCollectionIfEmpty(COLLECTIONS.BOOKING, bookingSeeds))
  }

  const inspectResults = await Promise.all(Object.values(COLLECTIONS).map(inspectCollection))

  const failedCollections = inspectResults.filter((item) => !item.ok)
  if (failedCollections.length) {
    throw new Error(
      '集合校验失败：' + failedCollections.map((item) => item.collectionName + '（' + (item.error || '未知错误') + '）').join('；')
    )
  }

  return {
    createResults,
    seedResults,
    inspectResults,
  }
}

function ensureDatabaseReady() {
  if (!databaseReadyPromise) {
    databaseReadyPromise = ensureBaseCollectionsAndSeeds().catch((error) => {
      databaseReadyPromise = null
      throw error
    })
  }
  return databaseReadyPromise
}

function isConfiguredAdminPhone(phone) {
  // 只能使用云端环境变量与微信验证的手机号，不能接受客户端指定角色。
  const adminPhones = String(process.env.ADMIN_PHONE_NUMBERS || '').split(/[,;\s]+/).filter(Boolean)
  return adminPhones.includes(phone)
}

function validateDistributionPayload(payload) {
  if (!payload.userId) {
    return '请先选择学员或确认登录状态'
  }
  if (!payload.packageId) {
    return '请先选择套餐'
  }
  if (!payload.operatorId) {
    return '请先使用场馆人员账号登录'
  }
  if (!payload.payType) {
    return '请选择收款方式'
  }
  if (normalizeAmount(payload.offlineAmount) < 0) {
    return '实收金额不能小于 0'
  }
  return ''
}

function mapAssetTypeToPageType(assetType) {
  return Number(assetType) === ASSET_TYPE.GROUP ? 'group' : 'private'
}

function mapAssetTypeToLabel(assetType) {
  return Number(assetType) === ASSET_TYPE.GROUP ? '团体' : '专属'
}

function mapBookingStatusToLabel(status) {
  switch (Number(status)) {
    case BOOKING_STATUS.PENDING:
      return '待到店'
    case BOOKING_STATUS.WRITTEN_OFF:
      return '已完成'
    case BOOKING_STATUS.CLIENT_CANCELLED:
      return '已取消'
    case BOOKING_STATUS.COACH_CANCELLED:
      return '场馆取消'
    case BOOKING_STATUS.ABSENT:
      return '已缺席'
    default:
      return '未知状态'
  }
}

function mapRosterStatusToLabel(status) {
  switch (Number(status)) {
    case BOOKING_STATUS.PENDING:
      return '待核销'
    case BOOKING_STATUS.WRITTEN_OFF:
      return '已核销'
    case BOOKING_STATUS.ABSENT:
      return '已缺席'
    case BOOKING_STATUS.CLIENT_CANCELLED:
      return '已取消'
    case BOOKING_STATUS.COACH_CANCELLED:
      return '场馆取消'
    default:
      return '未知状态'
  }
}

function formatDateKey(dateTimeString) {
  const source = String(dateTimeString || '')
  if (!source) {
    return ''
  }
  return source.slice(5, 10)
}

function formatDateLabel(dateTimeString) {
  const dateKey = formatDateKey(dateTimeString)
  return dateKey ? dateKey.replace('-', '/') : ''
}

function formatTimeText(dateTimeString) {
  const source = String(dateTimeString || '')
  if (!source) {
    return ''
  }
  return source.slice(11, 16)
}

function formatTimeRange(startTime, endTime) {
  return formatTimeText(startTime) + ' - ' + formatTimeText(endTime)
}

function getWeekdayLabelByDateTime(dateTimeString) {
  const source = String(dateTimeString || '')
  if (!source) {
    return ''
  }
  const parsedDate = new Date(source.slice(0, 10).replace(/-/g, '/'))
  if (Number.isNaN(parsedDate.getTime())) {
    return ''
  }
  return WEEKDAY_LABELS[parsedDate.getDay()]
}

async function listCollection(collectionName, where = {}) {
  return listAllCollection(collectionName, where)
}

async function listAllCollection(collectionName, where = {}, options = {}) {
  const pageSize = Math.min(Number(options.pageSize) || 100, 100)
  const max = Number(options.max) || 0
  let skip = 0
  let result = []
  let hasMore = true

  while (hasMore) {
    let query = db.collection(collectionName).where(where)
    if (options.orderByField) {
      query = query.orderBy(options.orderByField, options.orderDirection === 'asc' ? 'asc' : 'desc')
    }

    const res = await query.skip(skip).limit(pageSize).get()
    const data = res.data || []
    result = result.concat(data)
    skip += data.length
    hasMore = data.length === pageSize

    if (max > 0 && result.length >= max) {
      return result.slice(0, max)
    }
  }

  return result
}

function buildStoreView(store) {
  if (!store) {
    return null
  }
  return {
    id: store._id,
    name: store.name,
    address: store.address,
    introduction: store.introduction || '',
    businessHours: store.business_hours || '',
    phone: typeof store.contact_phone === 'string' ? store.contact_phone : store.phone || '',
    arrivalTips: store.arrival_tips || '',
    longitude: store.longitude,
    latitude: store.latitude,
  }
}

async function buildUserSession(user) {
  const stores = await listCollection(COLLECTIONS.STORE, { is_deleted: false, status: 1 })
  const userProfile = buildUserProfileView(user)
  const homeStoreId = userProfile && userProfile.homeStoreId ? userProfile.homeStoreId : (stores[0] ? stores[0]._id : '')
  const currentStore = stores.find((item) => item._id === homeStoreId) || stores[0] || null

  return {
    loggedIn: Boolean(userProfile),
    role: userProfile ? userProfile.role : 'client',
    userProfile,
    currentStore: buildStoreView(currentStore),
    stores: stores.map(buildStoreView),
  }
}

async function getCurrentAuthedUser() {
  const wxContext = cloud.getWXContext()
  if (!wxContext.OPENID) {
    return null
  }

  return getFirstUserByWhere({
    is_deleted: false,
    status: 1,
    openid: wxContext.OPENID,
  })
}

async function logoutCurrentUser() {
  const openid = cloud.getWXContext().OPENID
  if (!openid) return buildSuccess({ loggedIn: false })
  try {
    // 退出不受账号状态影响，且须清理同一微信身份的历史绑定。
    const users = await listCollection(COLLECTIONS.USER, { openid })
    if (!users.length) return buildSuccess({ loggedIn: false })
    await runBusinessTransaction(async (transaction) => {
      for (const user of users) {
        const current = (await getDocById(COLLECTIONS.USER, user._id, transaction)).data
        // 不清除并发登录时已经绑定到其他微信身份的账号。
        if (current && current.openid === openid) {
          await transaction.collection(COLLECTIONS.USER).doc(user._id).update({
            data: { openid: '', updated_at: db.serverDate() },
          })
        }
      }
    })
    return buildSuccess({ loggedIn: false })
  } catch (error) {
    return buildFail('退出未完成，请重试', 'LOGOUT_ERROR')
  }
}

async function ensureAdminOperator() {
  const currentUser = await getCurrentAuthedUser()
  if (!currentUser) {
    throw new Error('请先完成管理员登录')
  }
  if (Number(currentUser.role) !== 3) {
    throw new Error('当前账号没有管理员权限')
  }
  return currentUser
}

function buildAdminUserManageItem(user, storeMap) {
  const homeStore = user && user.home_store_id && storeMap ? storeMap.get(user.home_store_id) : null
  return {
    id: user._id,
    name: user.real_name || user.phone || '未命名用户',
    phone: user.phone || '',
    role: Number(user.role || 1),
    roleKey: mapUserRoleToPageRole(user.role),
    roleLabel: mapUserRoleToLabel(user.role),
    homeStoreId: user.home_store_id || '',
    homeStoreName: homeStore ? homeStore.name : '',
    status: Number(user.status || 0),
    statusLabel: buildUserStatusLabel(user.status),
  }
}

function buildAdminPackageManageItem(packageDoc) {
  return {
    id: packageDoc._id,
    name: packageDoc.name || '未命名套餐',
    type: mapAssetTypeToPageType(packageDoc.asset_type),
    typeLabel: mapAssetTypeToLabel(packageDoc.asset_type),
    lessons: Number(packageDoc.course_count || 0),
    unlimited: packageDoc.usage_mode === 'unlimited',
    usageMode: packageDoc.usage_mode || 'count',
    price: Number(packageDoc.display_price || 0),
    validDays: Number(packageDoc.valid_days || (Number(packageDoc.asset_type) === ASSET_TYPE.GROUP ? 180 : 365)),
    status: Number(packageDoc.status || 0),
    statusLabel: buildPackageStatusLabel(packageDoc.status),
  }
}

function buildAdminStoreManageItem(store, userCount = 0, scheduleCount = 0) {
  return {
    gallery: galleryView(store),
    galleryVersion: Number(store.gallery_version || 0),
    introduction: store.introduction || '',
    businessHours: store.business_hours || '',
    phone: typeof store.contact_phone === 'string' ? store.contact_phone : store.phone || '',
    arrivalTips: store.arrival_tips || '',
    id: store._id,
    name: store.name || '未命名门店',
    address: store.address || '',
    longitude: store.longitude === null || store.longitude === undefined ? '' : Number(store.longitude),
    latitude: store.latitude === null || store.latitude === undefined ? '' : Number(store.latitude),
    status: Number(store.status || 0),
    statusLabel: buildStoreStatusLabel(store.status),
    userCount: Number(userCount || 0),
    scheduleCount: Number(scheduleCount || 0),
  }
}

function normalizeStorePayload(payload) {
  const name = String(payload.name || '').replace(/\s+/g, ' ').trim()
  const address = String(payload.address || '').replace(/\s+/g, ' ').trim()
  const longitudeText = String(payload.longitude === null || payload.longitude === undefined ? '' : payload.longitude).trim()
  const latitudeText = String(payload.latitude === null || payload.latitude === undefined ? '' : payload.latitude).trim()
  const longitude = longitudeText ? Number(longitudeText) : null
  const latitude = latitudeText ? Number(latitudeText) : null

  if (!name) {
    return { error: '门店名称不能为空' }
  }
  if (name.length > 50) {
    return { error: '门店名称不能超过 50 个字符' }
  }
  if (!address) {
    return { error: '门店地址不能为空' }
  }
  if (address.length > 120) {
    return { error: '门店地址不能超过 120 个字符' }
  }
  if (longitudeText && (!Number.isFinite(longitude) || longitude < -180 || longitude > 180)) {
    return { error: '经度必须在 -180 到 180 之间' }
  }
  if (latitudeText && (!Number.isFinite(latitude) || latitude < -90 || latitude > 90)) {
    return { error: '纬度必须在 -90 到 90 之间' }
  }
  if (Boolean(longitudeText) !== Boolean(latitudeText)) return { error: '请同时填写经度和纬度，或使用地图选点' }
  const details = {}
  for (const [key, field, max, label] of [['introduction', 'introduction', 1200, '门店介绍最多1200个字符'], ['businessHours', 'business_hours', 120, '营业时间最多120个字符'], ['phone', 'contact_phone', 30, '联系电话最多30个字符'], ['arrivalTips', 'arrival_tips', 300, '到店指引最多300个字符']]) {
    // 旧版客户端只改基本资料时，保留已经录入的介绍。
    if (!Object.prototype.hasOwnProperty.call(payload, key)) continue
    if (typeof payload[key] !== 'string' || payload[key].trim().length > max) return { error: label }
    details[field] = payload[key].trim()
  }
  if (details.contact_phone && !/^\+?\d{3,24}$/.test(details.contact_phone.replace(/[ ().-]/g, ''))) return { error: '联系电话格式不正确，请填写可拨打的号码' }

  return {
    ...details,
    name,
    address,
    longitude,
    latitude,
  }
}

function getScheduleVenueName(schedule, storeMap) {
  if (!schedule) {
    return ''
  }
  if (schedule.store_id && storeMap && storeMap.has(schedule.store_id)) {
    return storeMap.get(schedule.store_id).name || ''
  }
  return schedule.store_name || schedule.venue_name || schedule.venue || ''
}

function buildAssetView(assetList) {
  const result = {
    privateCount: 0,
    groupCount: 0,
    privateExpiry: '',
    groupExpiry: '',
  }

  assetList.forEach((item) => {
    const prefix = Number(item.asset_type) === ASSET_TYPE.PRIVATE ? 'private' : 'group'
    result[prefix + 'Unlimited'] = unlimitedAt(item)
    result[prefix + 'UnlimitedExpiry'] = item.unlimited_expiry_date || ''
    if (Number(item.asset_type) === ASSET_TYPE.PRIVATE) {
      result.privateCount = item.expiry_date && item.expiry_date < businessDate() ? 0 : Number(item.balance || 0)
      result.privateExpiry = item.expiry_date || ''
    }
    if (Number(item.asset_type) === ASSET_TYPE.GROUP) {
      result.groupCount = item.expiry_date && item.expiry_date < businessDate() ? 0 : Number(item.balance || 0)
      result.groupExpiry = item.expiry_date || ''
    }
  })

  return result
}

async function getBookingViewData(event) {
  const payload = event.payload || {}
  if (!payload.storeId) {
    return buildFail('请先选择门店', 'INVALID_BOOKING_VIEW_PAYLOAD')
  }

  try {
    const filters = Object.assign(
      {
        type: 'group',
        coachId: 'all',
        dateKey: '',
      },
      payload.filters || {}
    )

    const [stores, coaches, schedules, bookings, assets] = await Promise.all([
      listCollection(COLLECTIONS.STORE, { is_deleted: false, status: 1 }),
      listCollection(COLLECTIONS.USER, { is_deleted: false, status: 1 }).then((users) => users.filter((user) => [2, 3].includes(Number(user.role)))),
      listAllCollection(COLLECTIONS.CLASS_SCHEDULE, { is_deleted: false, store_id: payload.storeId }),
      payload.userId ? listCollection(COLLECTIONS.BOOKING, { is_deleted: false, user_id: payload.userId }) : [],
      payload.userId ? listCollection(COLLECTIONS.USER_ASSET, { is_deleted: false, user_id: payload.userId }) : [],
    ])

    const pendingBookingIdSet = new Set(
      bookings.filter((item) => Number(item.status) === BOOKING_STATUS.PENDING).map((item) => item.schedule_id)
    )
    const storeMap = new Map(stores.map((item) => [item._id, item]))

    const visibleSchedules = schedules
      .filter((item) => !item.direct_private && !item.manual_only)
      .filter((item) => Number(item.status) !== SCHEDULE_STATUS.COACH_CANCELLED)
      .filter((item) => parseBusinessTime(item.start_time) > Date.now())
      .filter((item) => !filters.type || mapAssetTypeToPageType(item.class_type) === filters.type)
      .filter((item) => filters.coachId === 'all' || item.coach_id === filters.coachId)
      .filter((item) => !filters.dateKey || String(item.start_time).slice(0, 10) === filters.dateKey)
      .sort((left, right) => String(left.start_time).localeCompare(String(right.start_time)))
      .map((item) => ({
        id: item._id,
        storeId: item.store_id,
        dateKey: formatDateKey(item.start_time),
        dateLabel: formatDateLabel(item.start_time),
        timeRange: formatTimeRange(item.start_time, item.end_time),
        title: item.title,
        type: mapAssetTypeToPageType(item.class_type),
        typeLabel: mapAssetTypeToLabel(item.class_type),
        coachId: item.coach_id,
        coachName: coaches.find((coach) => coach._id === item.coach_id)?.real_name || item.coach_id,
        venue: getScheduleVenueName(item, storeMap),
        capacity: Number(item.max_capacity || 0),
        bookedCount: Number(item.booked_count || 0),
        progressText: Number(item.booked_count || 0) + '/' + Number(item.max_capacity || 0) + ' 人',
        isFull: Number(item.booked_count || 0) >= Number(item.max_capacity || 0),
        isBooked: pendingBookingIdSet.has(item._id),
      }))

    let privateBusyTimes = []
    if (filters.type === 'private') {
      const allSchedules = await listAllCollection(COLLECTIONS.CLASS_SCHEDULE, { is_deleted: false })
      privateBusyTimes = allSchedules.filter(s => s.coach_id === filters.coachId && !s.manual_only && Number(s.status) !== 4 && !(s.direct_private && Number(s.booked_count) === 0) && businessDate(s.start_time) === (filters.dateKey || businessDate())).map(s => ({ id: s._id, timeRange: formatTimeRange(s.start_time, s.end_time) }))
    }
    const dateMap = new Map()
    schedules.forEach((item) => {
      const key = String(item.start_time).slice(0, 10)
      if (!key || dateMap.has(key)) {
        return
      }
      dateMap.set(key, {
        key,
        label: formatDateLabel(item.start_time),
      })
    })

    return buildSuccess({
      filters,
      currentStore: buildStoreView(stores.find((item) => item._id === payload.storeId)),
      stores: stores.map(buildStoreView),
      coaches: coaches.map((item) => ({
        id: item._id, avatarUrl: item.avatar_url || '',
        name: item.real_name,
        title: item.coach_title || '',
        specialties: Array.isArray(item.specialties) ? item.specialties : [],
        levelLabel: item.level_label || '',
        bio: item.bio || '',
      })),
      dates: Array.from(dateMap.values()).sort((left, right) => left.key.localeCompare(right.key)),
      schedules: visibleSchedules, privateBusyTimes,
      assets: buildAssetView(assets),
    })
  } catch (error) {
    return buildFail('读取预约大厅失败：' + (error.errMsg || error.message || error), 'BOOKING_VIEW_ERROR')
  }
}

async function getHomeViewData(event) {
  const payload = event.payload || {}
  if (!payload.storeId) {
    return buildFail('请先选择门店', 'INVALID_HOME_VIEW_PAYLOAD')
  }

  try {
    const [stores, packages] = await Promise.all([
      listCollection(COLLECTIONS.STORE, { is_deleted: false, status: 1 }),
      listCollection(COLLECTIONS.PACKAGE, { is_deleted: false, status: 1 }),
    ])

    return buildSuccess({
      currentStore: buildStoreView(stores.find((item) => item._id === payload.storeId) || stores[0]),
      stores: stores.map(store => ({ ...buildStoreView(store), gallery: galleryView(store) })),
      notices: ['预约开课前 2 小时可免费取消，已扣权益自动退回。', '团体训练与专属训练，按自己的节奏安排。'],
      galleryList: galleryView(stores.find((item) => item._id === payload.storeId) || stores[0]),
      packages: packages.map((item) => ({
        id: item._id,
        name: item.name,
        type: mapAssetTypeToPageType(item.asset_type),
        lessons: Number(item.course_count || 0), unlimited: item.usage_mode === 'unlimited', usageMode: item.usage_mode || 'count', validDays: Number(item.valid_days || 365),
        price: Number(item.display_price || 0),
      })),
    })
  } catch (error) {
    return buildFail('读取首页失败：' + (error.errMsg || error.message || error), 'HOME_VIEW_ERROR')
  }
}

async function getProfileViewData(event) {
  const payload = event.payload || {}
  if (!payload.userId) {
    return buildFail('请先选择学员或确认登录状态', 'INVALID_PROFILE_VIEW_PAYLOAD')
  }

  try {
    const [userRes, assets, bookings, schedules] = await Promise.all([
      getDocById(COLLECTIONS.USER, payload.userId),
      listCollection(COLLECTIONS.USER_ASSET, { is_deleted: false, user_id: payload.userId }),
      listCollection(COLLECTIONS.BOOKING, { is_deleted: false, user_id: payload.userId }),
      listCollection(COLLECTIONS.CLASS_SCHEDULE, { is_deleted: false }),
    ])

    const scheduleMap = new Map(schedules.map((item) => [item._id, item]))
    const writtenOffCount = bookings.filter((item) => Number(item.status) === BOOKING_STATUS.WRITTEN_OFF).length
    const attendanceDays = new Set(bookings.filter((item) => Number(item.status) === BOOKING_STATUS.WRITTEN_OFF)
      .map((item) => businessDate(item.training_time || item.writeoff_time || schedules.find((schedule) => schedule._id === item.schedule_id)?.start_time)).filter(Boolean))
    const monthKey = businessDate().slice(0, 7)
    const monthLessons = bookings.filter((item) => Number(item.status) === BOOKING_STATUS.WRITTEN_OFF &&
      businessDate(item.training_time || item.writeoff_time || scheduleMap.get(item.schedule_id)?.start_time).slice(0, 7) === monthKey).length
    const currentStore = userRes.data ? await getDocById(COLLECTIONS.STORE, userRes.data.home_store_id) : null

    return buildSuccess({
      currentStore: buildStoreView(currentStore && currentStore.data ? currentStore.data : null),
      assets: buildAssetView(assets),
      myBookings: bookings
        .sort((left, right) => String(right.created_at || '').localeCompare(String(left.created_at || '')))
        .map((item) => {
          const schedule = scheduleMap.get(item.schedule_id)
          return {
            id: item._id,
            scheduleId: item.schedule_id,
            title: schedule ? schedule.title : item.schedule_id,
            type: schedule ? mapAssetTypeToPageType(schedule.class_type) : 'group',
            dateLabel: schedule ? formatDateLabel(schedule.start_time) : '',
            timeRange: schedule ? (schedule.manual_only ? String(schedule.start_time).slice(11, 16) : formatTimeRange(schedule.start_time, schedule.end_time)) : '',
            status: Number(schedule?.status) === SCHEDULE_STATUS.COACH_CANCELLED && Number(item.status) === BOOKING_STATUS.PENDING ? '场馆取消，退课处理中' : mapBookingStatusToLabel(item.status),
            sourceLabel: item.source === 'manual' ? '线下人工核销' : '',
            cancelReason: item.cancel_reason || schedule?.cancel_reason || '', changeReason: schedule?.change_reason || '',
            canCancel: Number(item.status) === BOOKING_STATUS.PENDING && Boolean(schedule) && Number(schedule.status) !== SCHEDULE_STATUS.COACH_CANCELLED && canCancel(schedule.start_time),
            cancelHint: schedule && !canCancel(schedule.start_time) ? '开课前 2 小时内不可取消' : '',
          }
        }),
      trainingStats: {
        monthLessons,
        streakDays: attendanceDays.size,
        totalLessons: writtenOffCount,
        nextTarget: monthLessons >= 12 ? '本月目标已完成，继续保持训练节奏。' : '本月再完成 ' + Math.max(0, 12 - monthLessons) + ' 次训练即可达到目标。',
      },
    })
  } catch (error) {
    return buildFail('读取个人中心失败：' + (error.errMsg || error.message || error), 'PROFILE_VIEW_ERROR')
  }
}

async function getWorkspaceViewData(event) {
  const payload = event.payload || {}
  if (!payload.storeId || !payload.coachId) {
    return buildFail('请先选择门店并确认教练身份', 'INVALID_WORKSPACE_VIEW_PAYLOAD')
  }

  try {
    const [schedules, bookings, storeRes] = await Promise.all([
      listCollection(COLLECTIONS.CLASS_SCHEDULE, { is_deleted: false, store_id: payload.storeId, coach_id: payload.coachId }),
      listCollection(COLLECTIONS.BOOKING, { is_deleted: false }),
      getDocById(COLLECTIONS.STORE, payload.storeId),
    ])
    const currentStore = buildStoreView(storeRes.data)

    const todayClasses = schedules
      .filter((item) => !item.manual_only)
      .filter((item) => Number(item.status) !== SCHEDULE_STATUS.COACH_CANCELLED)
      .filter((item) => businessDate(item.start_time) === businessDate())
      .sort((left, right) => String(left.start_time).localeCompare(String(right.start_time)))
      .map((item) => {
        const roster = bookings.filter((booking) => booking.schedule_id === item._id)
        return {
          id: item._id,
          title: item.title,
          timeRange: formatTimeRange(item.start_time, item.end_time),
          bookedCount: roster.filter((booking) => ![BOOKING_STATUS.CLIENT_CANCELLED, BOOKING_STATUS.COACH_CANCELLED].includes(Number(booking.status))).length,
          capacity: Number(item.max_capacity || 0),
          venue: (currentStore && currentStore.name) || item.store_name || item.venue || '',
          checkedCount: roster.filter((booking) => Number(booking.status) === BOOKING_STATUS.WRITTEN_OFF).length,
          absentCount: roster.filter((booking) => Number(booking.status) === BOOKING_STATUS.ABSENT).length,
        }
      })

    return buildSuccess({
      currentStore,
      quickActions: COACH_QUICK_ACTIONS.slice(),
      todayClasses,
      todayDate: businessDate(),
      summary: {
        bookedCount: todayClasses.reduce((total, item) => total + item.bookedCount, 0),
        pendingCount: todayClasses.reduce((total, item) => total + item.bookedCount - item.checkedCount - item.absentCount, 0),
      },
    })
  } catch (error) {
    return buildFail('读取工作台失败：' + (error.errMsg || error.message || error), 'WORKSPACE_VIEW_ERROR')
  }
}

async function getDistributeViewData(event) {
  const payload = event.payload || {}
  const keyword = String(payload.keyword || '').trim()

  try {
    const operator = await getCurrentAuthedUser()
    if (!operator) {
      return buildFail('请先完成登录', 'DISTRIBUTE_LOGIN_REQUIRED')
    }
    if (Number(operator.role) < 2) {
      return buildFail('当前账号没有派课权限', 'DISTRIBUTE_FORBIDDEN')
    }

    const [members, packages, assets, storeRes] = await Promise.all([
      keyword ? listAllCollection(COLLECTIONS.USER, { is_deleted: false, status: 1, role: 1 }, {
        orderByField: 'updated_at',
        orderDirection: 'desc',
      }) : Promise.resolve([]),
      listAllCollection(COLLECTIONS.PACKAGE, { is_deleted: false, status: 1 }, {
        orderByField: 'updated_at',
        orderDirection: 'desc',
      }),
      keyword ? listAllCollection(COLLECTIONS.USER_ASSET, { is_deleted: false }, {
        orderByField: 'updated_at',
        orderDirection: 'desc',
      }) : Promise.resolve([]),
      payload.storeId ? getDocById(COLLECTIONS.STORE, payload.storeId) : Promise.resolve({ data: null }),
    ])

    const visibleMembers = members
      .filter((item) => {
        if (!keyword) {
          return true
        }
        return [item.real_name, item.phone].some((field) => String(field || '').includes(keyword))
      })
      .sort((left, right) => String(left.real_name || left.phone || left._id).localeCompare(String(right.real_name || right.phone || right._id), 'zh-CN'))
      .slice(0, 20)
      .map((item) => {
        const assetView = buildAssetView(assets.filter((asset) => asset.user_id === item._id))
        return {
          id: item._id,
          nickname: item.real_name || item.phone || '未命名学员',
          phone: item.phone || '',
          privateCount: assetView.privateCount, privateUnlimited: assetView.privateUnlimited, privateUnlimitedExpiry: assetView.privateUnlimitedExpiry,
          groupCount: assetView.groupCount, groupUnlimited: assetView.groupUnlimited, groupUnlimitedExpiry: assetView.groupUnlimitedExpiry,
          privateExpiry: assetView.privateExpiry,
          groupExpiry: assetView.groupExpiry,
        }
      })

    const packageOptions = packages
      .slice()
      .sort((left, right) => Number(left.display_price || 0) - Number(right.display_price || 0))
      .map((item) => ({
        id: item._id,
        name: item.name,
        type: mapAssetTypeToPageType(item.asset_type),
        lessons: Number(item.course_count || 0), unlimited: item.usage_mode === 'unlimited', usageMode: item.usage_mode || 'count', validDays: Number(item.valid_days || 365),
        price: Number(item.display_price || 0),
        validDays: Number(item.valid_days || (Number(item.asset_type) === ASSET_TYPE.GROUP ? 180 : 365)),
      }))

    return buildSuccess({
      members: visibleMembers,
      packageOptions,
      currentStore: buildStoreView(storeRes.data),
    })
  } catch (error) {
    return buildFail('读取派课页面数据失败：' + (error.errMsg || error.message || error), 'DISTRIBUTE_VIEW_ERROR')
  }
}

async function getAdminDashboardData(event) {
  const payload = event.payload || {}
  try {
    await ensureAdminOperator()
    const [logs, bookings, packages, stores, users, schedules] = await Promise.all([
      listCollection(COLLECTIONS.USER_ASSET_LOG, { is_deleted: false }),
      listCollection(COLLECTIONS.BOOKING, { is_deleted: false }),
      listCollection(COLLECTIONS.PACKAGE, { is_deleted: false }),
      listCollection(COLLECTIONS.STORE, { is_deleted: false, status: 1 }),
      listCollection(COLLECTIONS.USER, { is_deleted: false }),
      listCollection(COLLECTIONS.CLASS_SCHEDULE, { is_deleted: false }),
    ])
    const store = stores.find((item) => item._id === payload.storeId) || stores[0]
    const storeId = store ? store._id : ''
    const packageMap = new Map(packages.map((item) => [item._id, item]))
    const userMap = new Map(users.map((item) => [item._id, item]))
    const scheduleMap = new Map(schedules.map((item) => [item._id, item]))
    const auditLogs = logs.filter((item) => Number(item.operate_type) === OPERATE_TYPE.COACH_DISTRIBUTE &&
      (item.store_id || userMap.get(item.operator_id)?.home_store_id) === storeId)
    const todayLogs = auditLogs.filter((item) => !item.reversed && businessDate(item.created_at) === businessDate())
    const sum = (type) => todayLogs.filter((item) => Number(item.asset_type || packageMap.get(item.ref_biz_id)?.asset_type) === type)
      .reduce((total, item) => total + Number(item.amount || 0), 0)
    const income = todayLogs.reduce((total, item) => total + Number(item.offline_amount || 0), 0)
    return buildSuccess({
      currentStore: buildStoreView(store), dateLabel: businessDate(),
      auditOverview: {
        addedPrivateLessons: sum(ASSET_TYPE.PRIVATE), addedGroupLessons: sum(ASSET_TYPE.GROUP),
        writeOffCount: bookings.filter((item) => Number(item.status) === BOOKING_STATUS.WRITTEN_OFF &&
          scheduleMap.get(item.schedule_id)?.store_id === storeId && businessDate(item.writeoff_time) === businessDate()).length,
        incomeText: '￥' + income.toFixed(2),
      },
      auditLogs: auditLogs.sort((a, b) => parseBusinessTime(b.created_at) - parseBusinessTime(a.created_at)).slice(0, 20).map((item) => ({
        id: item._id, operatorName: userMap.get(item.operator_id)?.real_name || '场馆人员',
        packageName: packageMap.get(item.ref_biz_id)?.name || '历史套餐',
        targetName: userMap.get(item.user_id)?.real_name || '学员', amount: Number(item.offline_amount || 0),
        payType: item.pay_type || '未记录', remark: item.remark || '', reversed: Boolean(item.reversed),
        time: businessDate(item.created_at),
      })),
      manualWriteOffLogs: logs.filter((item) => Number(item.operate_type) === OPERATE_TYPE.MANUAL_WRITEOFF && item.store_id === storeId)
        .sort((a, b) => parseBusinessTime(b.created_at) - parseBusinessTime(a.created_at)).slice(0, 20).map((item) => ({
          id: item._id, targetName: userMap.get(item.user_id)?.real_name || '学员',
          operatorName: userMap.get(item.operator_id)?.real_name || '场馆人员',
          title: scheduleMap.get(item.ref_biz_id)?.title || '训练', time: businessDate(item.created_at),
          trainingTime: scheduleMap.get(item.ref_biz_id)?.start_time || '',
          reversed: Boolean(item.reversed),
          deductionLabel: item.charge_mode === 'unlimited' ? '使用期限内无限次权益' : Number(item.amount) === -1 ? '扣减 1 课时' : '已有预约，未重复扣课', remark: item.remark || '',
        })),
    })
  } catch (error) {
    return buildFail('读取看板失败：' + (error.errMsg || error.message || error), 'ADMIN_VIEW_ERROR')
  }
}

async function getAdminUserManageData() {
  try {
    const operator = await ensureAdminOperator()
    const [users, stores, assets] = await Promise.all([
      listAllCollection(COLLECTIONS.USER, { is_deleted: false }, {
        orderByField: 'updated_at',
        orderDirection: 'desc',
      }),
      listAllCollection(COLLECTIONS.STORE, { is_deleted: false }, {
        orderByField: 'updated_at',
        orderDirection: 'desc',
      }),
      listAllCollection(COLLECTIONS.USER_ASSET, { is_deleted: false }),
    ])
    const storeMap = new Map(stores.map((item) => [item._id, item]))
    const assetMap = new Map()
    assets.forEach((asset) => { const list = assetMap.get(asset.user_id) || []; list.push(asset); assetMap.set(asset.user_id, list) })
    const safeUsers = users
      .slice()
      .sort((left, right) => {
        const roleDiff = Number(right.role || 0) - Number(left.role || 0)
        if (roleDiff !== 0) {
          return roleDiff
        }
        return String(left.real_name || left.phone || left._id).localeCompare(String(right.real_name || right.phone || right._id), 'zh-CN')
      })
      .map((item) => ({ ...buildAdminUserManageItem(item, storeMap), assets: buildAssetView(assetMap.get(item._id) || []) }))

    return buildSuccess({
      currentUserId: operator._id,
      roleOptions: buildRoleOptions(),
      users: safeUsers,
      stores: stores.filter((store) => Number(store.status) === 1).map(buildStoreView),
    })
  } catch (error) {
    return buildFail('读取人员权限列表失败：' + (error.errMsg || error.message || error), 'ADMIN_USER_MANAGE_VIEW_ERROR')
  }
}

async function getAdminUserAssets(event) {
  const payload = event.payload || {}
  if (!payload.targetUserId) return buildFail('请先选择要查看的客户', 'INVALID_USER_ASSETS_PAYLOAD')
  try {
    const user = (await getDocById(COLLECTIONS.USER, payload.targetUserId)).data
    if (!user || user.is_deleted) return buildFail('客户档案已不存在，请刷新人员列表', 'TARGET_USER_NOT_FOUND')
    if (Number(user.role) !== 1) return buildFail('该账号已不是客户，请刷新人员列表', 'TARGET_USER_NOT_CLIENT')
    const [assets, logs, packages, stores] = await Promise.all([
      listAllCollection(COLLECTIONS.USER_ASSET, { user_id: user._id, is_deleted: false }),
      listAllCollection(COLLECTIONS.USER_ASSET_LOG, { user_id: user._id, is_deleted: false, operate_type: OPERATE_TYPE.COACH_DISTRIBUTE }),
      listAllCollection(COLLECTIONS.PACKAGE, { is_deleted: false }),
      listAllCollection(COLLECTIONS.STORE, { is_deleted: false }),
    ])
    const packageMap = new Map(packages.map((item) => [item._id, item]))
    const summary = buildAssetView(assets)
    const balances = [ASSET_TYPE.GROUP, ASSET_TYPE.PRIVATE].map((type) => {
      const matches = assets.filter((asset) => Number(asset.asset_type) === type)
      const asset = matches[matches.length - 1]
      const expiry = asset && asset.expiry_date || ''
      const expired = Boolean(expiry && expiry < businessDate())
      const available = type === ASSET_TYPE.GROUP ? summary.groupCount : summary.privateCount
      return { type: mapAssetTypeToPageType(type), label: type === ASSET_TYPE.GROUP ? '团课' : '私教',
        unlimited: unlimitedAt(asset), unlimitedExpiry: asset && asset.unlimited_expiry_date || '', available, recordedBalance: Number(asset && asset.balance || 0), expired,
        expiry, expiryLabel: asset ? (expiry || '无到期限制') : '尚未派发',
        statusLabel: unlimitedAt(asset) ? '期限内无限次' : !asset ? '未购课' : expired ? '已过期' : available > 0 ? '可用' : '已用完' }
    })
    const records = logs.sort((a, b) => parseBusinessTime(b.created_at) - parseBusinessTime(a.created_at)).slice(0, 30).map((log) => {
      const pkg = packageMap.get(log.ref_biz_id)
      const type = Number(log.asset_type || pkg && pkg.asset_type)
      return { id: log._id, packageName: log.package_name || pkg && pkg.name || '历史套餐',
        typeLabel: type === ASSET_TYPE.GROUP ? '团课' : type === ASSET_TYPE.PRIVATE ? '私教' : '训练',
        unlimited: log.usage_mode === 'unlimited', lessons: Number(log.amount || 0), amount: Number(log.offline_amount || 0).toFixed(2),
        time: businessDate(log.created_at), expiry: log.expiry_date || '', payType: log.pay_type || '未记录' }
    })
    return buildSuccess({ user: buildAdminUserManageItem(user, new Map(stores.map((store) => [store._id, store]))), balances, records,
      note: '同类型套餐的课时合并使用，下方派发记录展示原套餐和增加课时。' })
  } catch (error) {
    return buildFail(error.errMsg || error.message, 'ADMIN_USER_ASSETS_ERROR')
  }
}

async function getAdminPackageManageData() {
  try {
    await ensureAdminOperator()
    const packages = await listAllCollection(COLLECTIONS.PACKAGE, { is_deleted: false }, {
      orderByField: 'updated_at',
      orderDirection: 'desc',
    })

    const safePackages = packages
      .slice()
      .sort((left, right) => {
        const statusDiff = Number(right.status || 0) - Number(left.status || 0)
        if (statusDiff !== 0) {
          return statusDiff
        }
        return String(left.name || left._id).localeCompare(String(right.name || right._id), 'zh-CN')
      })
      .map((item) => buildAdminPackageManageItem(item))

    return buildSuccess({
      stats: {
        total: safePackages.length,
        activeCount: safePackages.filter((item) => item.status === 1).length,
        inactiveCount: safePackages.filter((item) => item.status !== 1).length,
      },
      packages: safePackages,
    })
  } catch (error) {
    return buildFail('读取套餐管理列表失败：' + (error.errMsg || error.message || error), 'ADMIN_PACKAGE_MANAGE_VIEW_ERROR')
  }
}

async function getAdminStoreManageData() {
  try {
    await ensureAdminOperator()
    const [stores, users, schedules] = await Promise.all([
      listAllCollection(COLLECTIONS.STORE, { is_deleted: false }, {
        orderByField: 'updated_at',
        orderDirection: 'desc',
      }),
      listAllCollection(COLLECTIONS.USER, { is_deleted: false }),
      listAllCollection(COLLECTIONS.CLASS_SCHEDULE, { is_deleted: false }),
    ])
    const userCountMap = new Map()
    const scheduleCountMap = new Map()

    users.forEach((item) => {
      if (item.home_store_id) {
        userCountMap.set(item.home_store_id, (userCountMap.get(item.home_store_id) || 0) + 1)
      }
    })
    schedules.forEach((item) => {
      if (item.store_id) {
        scheduleCountMap.set(item.store_id, (scheduleCountMap.get(item.store_id) || 0) + 1)
      }
    })

    const safeStores = stores
      .slice()
      .sort((left, right) => {
        const statusDiff = Number(right.status || 0) - Number(left.status || 0)
        if (statusDiff !== 0) {
          return statusDiff
        }
        return String(left.name || left._id).localeCompare(String(right.name || right._id), 'zh-CN')
      })
      .map((item) => buildAdminStoreManageItem(
        item,
        userCountMap.get(item._id),
        scheduleCountMap.get(item._id)
      ))

    return buildSuccess({
      stats: {
        total: safeStores.length,
        activeCount: safeStores.filter((item) => item.status === 1).length,
        inactiveCount: safeStores.filter((item) => item.status !== 1).length,
      },
      stores: safeStores,
    })
  } catch (error) {
    return buildFail('读取门店管理列表失败：' + (error.errMsg || error.message || error), 'ADMIN_STORE_MANAGE_VIEW_ERROR')
  }
}

async function createStore(event) {
  const payload = event.payload || {}
  const storeData = normalizeStorePayload(payload)
  const nextStatus = Number(payload.status)

  if (storeData.error) {
    return buildFail(storeData.error, 'INVALID_CREATE_STORE_PAYLOAD')
  }
  if (![0, 1].includes(nextStatus)) {
    return buildFail('请选择有效的启用状态', 'INVALID_CREATE_STORE_PAYLOAD')
  }

  try {
    await ensureAdminOperator()
    const stores = await listAllCollection(COLLECTIONS.STORE, { is_deleted: false })
    const duplicateStore = stores.find((item) => String(item.name || '').trim().toLowerCase() === storeData.name.toLowerCase())
    if (duplicateStore) {
      return buildFail('已存在同名门店', 'STORE_NAME_DUPLICATED')
    }

    const addRes = await db.collection(COLLECTIONS.STORE).add({
      data: {
        ...storeData,
        name: storeData.name,
        address: storeData.address,
        longitude: storeData.longitude,
        latitude: storeData.latitude,
        status: nextStatus,
        created_at: db.serverDate(),
        updated_at: db.serverDate(),
        is_deleted: false,
      },
    })

    return buildSuccess({
      storeInfo: buildAdminStoreManageItem({
        ...storeData,
        _id: addRes._id,
        name: storeData.name,
        address: storeData.address,
        longitude: storeData.longitude,
        latitude: storeData.latitude,
        status: nextStatus,
      }),
    })
  } catch (error) {
    return buildFail('创建门店失败：' + (error.errMsg || error.message || error), 'CREATE_STORE_ERROR')
  }
}

async function updateStore(event) {
  const payload = event.payload || {}
  const storeData = normalizeStorePayload(payload)

  if (!payload.targetStoreId) {
    return buildFail('请选择要操作的门店', 'INVALID_UPDATE_STORE_PAYLOAD')
  }
  if (storeData.error) {
    return buildFail(storeData.error, 'INVALID_UPDATE_STORE_PAYLOAD')
  }

  try {
    await ensureAdminOperator()
    const [storeRes, stores] = await Promise.all([
      getDocById(COLLECTIONS.STORE, payload.targetStoreId),
      listAllCollection(COLLECTIONS.STORE, { is_deleted: false }),
    ])
    const targetStore = storeRes.data
    if (!targetStore || targetStore.is_deleted) {
      return buildFail('目标门店不存在', 'TARGET_STORE_NOT_FOUND')
    }
    const duplicateStore = stores.find((item) => (
      item._id !== payload.targetStoreId &&
      String(item.name || '').trim().toLowerCase() === storeData.name.toLowerCase()
    ))
    if (duplicateStore) {
      return buildFail('已存在同名门店', 'STORE_NAME_DUPLICATED')
    }

    await db.collection(COLLECTIONS.STORE).doc(payload.targetStoreId).update({
      data: {
        ...storeData,
        name: storeData.name,
        address: storeData.address,
        longitude: storeData.longitude,
        latitude: storeData.latitude,
        updated_at: db.serverDate(),
      },
    })

    return buildSuccess({
      storeInfo: buildAdminStoreManageItem(Object.assign({}, targetStore, storeData)),
    })
  } catch (error) {
    return buildFail('更新门店资料失败：' + (error.errMsg || error.message || error), 'UPDATE_STORE_ERROR')
  }
}

async function updateStoreStatus(event) {
  const payload = event.payload || {}
  const nextStatus = Number(payload.nextStatus)

  if (!payload.targetStoreId) {
    return buildFail('请选择要操作的门店', 'INVALID_UPDATE_STORE_STATUS_PAYLOAD')
  }
  if (![0, 1].includes(nextStatus)) {
    return buildFail('请选择有效的启用状态', 'INVALID_UPDATE_STORE_STATUS_PAYLOAD')
  }

  try {
    await ensureAdminOperator()
    const [storeRes, activeStores] = await Promise.all([
      getDocById(COLLECTIONS.STORE, payload.targetStoreId),
      listAllCollection(COLLECTIONS.STORE, { is_deleted: false, status: 1 }),
    ])
    const targetStore = storeRes.data
    if (!targetStore || targetStore.is_deleted) {
      return buildFail('目标门店不存在', 'TARGET_STORE_NOT_FOUND')
    }
    if (Number(targetStore.status || 0) === nextStatus) {
      return buildSuccess({
        changed: false,
        storeInfo: buildAdminStoreManageItem(targetStore),
      })
    }
    if (nextStatus === 0 && activeStores.length <= 1) {
      return buildFail('至少需要保留一家营业门店', 'LAST_ACTIVE_STORE_LOCKED')
    }

    await db.collection(COLLECTIONS.STORE).doc(payload.targetStoreId).update({
      data: {
        status: nextStatus,
        updated_at: db.serverDate(),
      },
    })

    return buildSuccess({
      changed: true,
      storeInfo: buildAdminStoreManageItem(Object.assign({}, targetStore, {
        status: nextStatus,
      })),
    })
  } catch (error) {
    return buildFail('更新门店营业状态失败：' + (error.errMsg || error.message || error), 'UPDATE_STORE_STATUS_ERROR')
  }
}

async function createUser(event) {
  const payload = event.payload || {}
  const name = normalizeNickname(payload.name)
  const phone = String(payload.phone || '').trim()
  if (!name || name.length > 20 || !/^1[3-9]\d{9}$/.test(phone) || !payload.storeId || !/^[a-zA-Z0-9_-]{16,80}$/.test(payload.requestId || '')) {
    return buildFail('请填写20字以内的姓名、11位手机号并选择门店', 'INVALID_CREATE_USER_PAYLOAD')
  }
  try {
    const operator = await ensureAdminOperator()
    const userId = buildPhoneUserId(phone)
    // 兼容历史上使用其他 ID 建立的手机号档案；新档案与手机号登录共用固定 ID。
    const existing = await getFirstUserByWhere({ phone, is_deleted: false })
    if (existing && existing._id !== userId) return buildFail('该手机号已建档，请在人员列表查找', 'DUPLICATE_USER_PHONE')
    const result = await runBusinessTransaction(async (transaction) => {
      const currentOperator = (await getDocById(COLLECTIONS.USER, operator._id, transaction)).data
      if (!currentOperator || currentOperator.is_deleted || Number(currentOperator.status) !== 1 || Number(currentOperator.role) !== 3) {
        throw Object.assign(new Error('此操作需要管理员权限'), { code: 'FORBIDDEN' })
      }
      const current = (await getDocById(COLLECTIONS.USER, userId, transaction)).data
      if (current) {
        if (!current.is_deleted && current.created_by === operator._id && current.created_request_id === payload.requestId && current.real_name === name && current.home_store_id === payload.storeId) {
          const store = (await getDocById(COLLECTIONS.STORE, current.home_store_id, transaction)).data
          return { user: buildAdminUserManageItem(current, new Map(store ? [[store._id, store]] : [])), repeated: true }
        }
        throw Object.assign(new Error('该手机号已建档，请在人员列表查找'), { code: 'DUPLICATE_USER_PHONE' })
      }
      const store = (await getDocById(COLLECTIONS.STORE, payload.storeId, transaction)).data
      if (!store || store.is_deleted || Number(store.status) !== 1) {
        throw Object.assign(new Error('门店不存在或已停用，请重新选择'), { code: 'STORE_NOT_AVAILABLE' })
      }
      const user = {
        openid: '', phone, real_name: name, avatar_url: '', role: 1,
        home_store_id: store._id, status: 1, is_deleted: false,
        source: 'manual', created_by: operator._id, created_request_id: payload.requestId,
        created_at: db.serverDate(), updated_at: db.serverDate(),
      }
      await transaction.collection(COLLECTIONS.USER).doc(userId).set({ data: user })
      return { user: buildAdminUserManageItem({ ...user, _id: userId }, new Map([[store._id, store]])), repeated: false }
    })
    return buildSuccess(result)
  } catch (error) {
    return buildFail(error.message || '录入用户失败，请重试', error.code || 'CREATE_USER_ERROR')
  }
}

async function updateUserRole(event) {
  const payload = event.payload || {}
  const nextRole = Number(payload.nextRole)

  if (!payload.targetUserId) {
    return buildFail('请选择要调整权限的人员', 'INVALID_UPDATE_USER_ROLE_PAYLOAD')
  }
  if (!ROLE_VALUE_MAP[nextRole]) {
    return buildFail('请选择有效的身份权限', 'INVALID_UPDATE_USER_ROLE_PAYLOAD')
  }

  try {
    const operator = await ensureAdminOperator()
    if (payload.targetUserId === operator._id && nextRole !== 3) {
      return buildFail('当前登录管理员不能在此页取消自己的管理员权限', 'ADMIN_SELF_ROLE_LOCKED')
    }

    const userRes = await getDocById(COLLECTIONS.USER, payload.targetUserId)
    const targetUser = userRes.data
    if (!targetUser || targetUser.is_deleted) {
      return buildFail('目标用户不存在', 'TARGET_USER_NOT_FOUND')
    }

    if (Number(targetUser.role || 1) === nextRole) {
      const stores = await listCollection(COLLECTIONS.STORE, { is_deleted: false })
      const storeMap = new Map(stores.map((item) => [item._id, item]))
      return buildSuccess({
        changed: false,
        user: buildAdminUserManageItem(targetUser, storeMap),
      })
    }

    await db.collection(COLLECTIONS.USER).doc(payload.targetUserId).update({
      data: {
        role: nextRole,
        updated_at: db.serverDate(),
      },
    })

    const updatedUser = Object.assign({}, targetUser, {
      role: nextRole,
      updated_at: new Date().toISOString(),
    })
    const stores = await listCollection(COLLECTIONS.STORE, { is_deleted: false })
    const storeMap = new Map(stores.map((item) => [item._id, item]))

    return buildSuccess({
      changed: true,
      user: buildAdminUserManageItem(updatedUser, storeMap),
    })
  } catch (error) {
    return buildFail('更新人员权限失败：' + (error.errMsg || error.message || error), 'UPDATE_USER_ROLE_ERROR')
  }
}

async function updateUserProfile(event) {
  const payload = event.payload || {}
  const nickname = normalizeNickname(payload.nickname)

  if (!nickname) {
    return buildFail('用户名不能为空', 'INVALID_UPDATE_USER_PROFILE_PAYLOAD')
  }
  if (nickname.length > 20) {
    return buildFail('用户名不能超过 20 个字符', 'INVALID_UPDATE_USER_PROFILE_PAYLOAD')
  }

  try {
    const currentUser = await getCurrentAuthedUser()
    if (!currentUser) {
      return buildFail('请先完成登录', 'UPDATE_USER_PROFILE_LOGIN_REQUIRED')
    }

    if (normalizeNickname(currentUser.real_name) === nickname) {
      return buildSuccess(Object.assign({
        changed: false,
      }, await buildUserSession(currentUser)))
    }

    await db.collection(COLLECTIONS.USER).doc(currentUser._id).update({
      data: {
        real_name: nickname,
        updated_at: db.serverDate(),
      },
    })

    const updatedUser = Object.assign({}, currentUser, {
      real_name: nickname,
      updated_at: new Date().toISOString(),
    })

    return buildSuccess(Object.assign({
      changed: true,
    }, await buildUserSession(updatedUser)))
  } catch (error) {
    return buildFail('更新用户名失败：' + (error.errMsg || error.message || error), 'UPDATE_USER_PROFILE_ERROR')
  }
}

async function createPackage(event) {
  const payload = event.payload || {}
  const packageName = String(payload.name || '').trim()
  const packageType = String(payload.type || '').trim()
  const unlimited = payload.usageMode === 'unlimited'
  const lessons = unlimited ? 0 : Number(payload.lessons)
  const price = Number(payload.price)
  const nextStatus = Number(payload.status)
  const validDays = payload.validDays === undefined ? (packageType === 'group' ? 180 : 365) : Number(payload.validDays)

  if (!packageName || packageName.length > 60) {
    return buildFail('套餐名称不能为空', 'INVALID_CREATE_PACKAGE_PAYLOAD')
  }
  if (!['group', 'private'].includes(packageType)) {
    return buildFail('请选择团课或私教套餐', 'INVALID_CREATE_PACKAGE_PAYLOAD')
  }
  if (!unlimited && (!Number.isInteger(lessons) || lessons <= 0 || lessons > 10000)) {
    return buildFail('权益次数必须大于 0', 'INVALID_CREATE_PACKAGE_PAYLOAD')
  }
  if (!Number.isFinite(price) || price < 0) {
    return buildFail('展示价不能小于 0', 'INVALID_CREATE_PACKAGE_PAYLOAD')
  }
  if (![0, 1].includes(nextStatus)) {
    return buildFail('请选择有效的启用状态', 'INVALID_CREATE_PACKAGE_PAYLOAD')
  }
  if (!Number.isInteger(validDays) || validDays < 1 || validDays > 3650) return buildFail('有效期须为 1 至 3650 天', 'INVALID_CREATE_PACKAGE_PAYLOAD')

  try {
    await ensureAdminOperator()
    const addRes = await db.collection(COLLECTIONS.PACKAGE).add({
      data: {
        name: packageName,
        asset_type: packageType === 'group' ? ASSET_TYPE.GROUP : ASSET_TYPE.PRIVATE,
        course_count: Math.floor(lessons), usage_mode: unlimited ? 'unlimited' : 'count',
        display_price: Number(price.toFixed(2)),
        valid_days: validDays,
        status: nextStatus,
        created_at: db.serverDate(),
        updated_at: db.serverDate(),
        is_deleted: false,
      },
    })

    return buildSuccess({
      packageInfo: buildAdminPackageManageItem({
        _id: addRes._id,
        name: packageName,
        asset_type: packageType === 'group' ? ASSET_TYPE.GROUP : ASSET_TYPE.PRIVATE,
        course_count: Math.floor(lessons), usage_mode: unlimited ? 'unlimited' : 'count',
        display_price: Number(price.toFixed(2)),
        status: nextStatus,
        valid_days: validDays,
      }),
    })
  } catch (error) {
    return buildFail('创建套餐失败：' + (error.errMsg || error.message || error), 'CREATE_PACKAGE_ERROR')
  }
}

async function updatePackageStatus(event) {
  const payload = event.payload || {}
  const nextStatus = Number(payload.nextStatus)

  if (!payload.targetPackageId) {
    return buildFail('请选择要操作的套餐', 'INVALID_UPDATE_PACKAGE_STATUS_PAYLOAD')
  }
  if (![0, 1].includes(nextStatus)) {
    return buildFail('请选择有效的启用状态', 'INVALID_UPDATE_PACKAGE_STATUS_PAYLOAD')
  }

  try {
    await ensureAdminOperator()
    const packageRes = await getDocById(COLLECTIONS.PACKAGE, payload.targetPackageId)
    const targetPackage = packageRes.data
    if (!targetPackage || targetPackage.is_deleted) {
      return buildFail('目标套餐不存在', 'TARGET_PACKAGE_NOT_FOUND')
    }

    if (Number(targetPackage.status || 0) === nextStatus) {
      return buildSuccess({
        changed: false,
        packageInfo: buildAdminPackageManageItem(targetPackage),
      })
    }

    await db.collection(COLLECTIONS.PACKAGE).doc(payload.targetPackageId).update({
      data: {
        status: nextStatus,
        updated_at: db.serverDate(),
      },
    })

    const updatedPackage = Object.assign({}, targetPackage, {
      status: nextStatus,
      updated_at: new Date().toISOString(),
    })

    return buildSuccess({
      changed: true,
      packageInfo: buildAdminPackageManageItem(updatedPackage),
    })
  } catch (error) {
    return buildFail('更新套餐上下架状态失败：' + (error.errMsg || error.message || error), 'UPDATE_PACKAGE_STATUS_ERROR')
  }
}

async function getCoachClassViewData(event) {
  const payload = event.payload || {}
  if (!payload.classId) {
    return buildFail('请选择训练场次', 'INVALID_COACH_CLASS_VIEW_PAYLOAD')
  }

  try {
    const [scheduleRes, bookings, users, stores] = await Promise.all([
      getDocById(COLLECTIONS.CLASS_SCHEDULE, payload.classId),
      listCollection(COLLECTIONS.BOOKING, { is_deleted: false, schedule_id: payload.classId }),
      listCollection(COLLECTIONS.USER, { is_deleted: false, status: 1 }),
      listCollection(COLLECTIONS.STORE, { is_deleted: false, status: 1 }),
    ])

    const schedule = scheduleRes.data
    if (!schedule) {
      return buildFail('排课不存在', 'CLASS_NOT_FOUND')
    }
    if (Number(event.operator.role) !== 3 && schedule.coach_id !== event.operator._id) {
      return buildFail('只能查看自己的训练名单', 'FORBIDDEN')
    }

    const userMap = new Map(users.map((item) => [item._id, item]))
    const storeMap = new Map(stores.map((item) => [item._id, item]))
    const currentStore = buildStoreView(storeMap.get(schedule.store_id))
    const visibleBookings = bookings.filter((item) => ![BOOKING_STATUS.CLIENT_CANCELLED, BOOKING_STATUS.COACH_CANCELLED].includes(Number(item.status)))

    return buildSuccess({
      currentStore,
      classInfo: {
        id: schedule._id,
        title: schedule.title,
        venue: getScheduleVenueName(schedule, storeMap),
        dateLabel: formatDateLabel(schedule.start_time),
        timeRange: formatTimeRange(schedule.start_time, schedule.end_time),
        bookedCount: visibleBookings.length,
        checkedCount: visibleBookings.filter((item) => Number(item.status) === BOOKING_STATUS.WRITTEN_OFF).length,
        absentCount: visibleBookings.filter((item) => Number(item.status) === BOOKING_STATUS.ABSENT).length,
      },
      roster: visibleBookings.map((item) => ({
        bookingId: item._id,
        userId: item.user_id,
        userName: userMap.get(item.user_id)?.real_name || item.user_id,
        phone: userMap.get(item.user_id)?.phone || '',
        status: mapRosterStatusToLabel(item.status),
        sourceLabel: item.source === 'manual' ? '线下人工核销' : '小程序预约',
      })),
    })
  } catch (error) {
    return buildFail('读取到场核销页失败：' + (error.errMsg || error.message || error), 'COACH_CLASS_VIEW_ERROR')
  }
}

async function getCoachScheduleViewData(event) {
  const payload = event.payload || {}
  if (!payload.storeId) {
    return buildFail('请先选择门店', 'INVALID_COACH_SCHEDULE_VIEW_PAYLOAD')
  }

  try {
    const [schedules, stores] = await Promise.all([
      listAllCollection(COLLECTIONS.CLASS_SCHEDULE, { is_deleted: false, store_id: payload.storeId }),
      listCollection(COLLECTIONS.STORE, { is_deleted: false, status: 1 }),
    ])
    const storeMap = new Map(stores.map((item) => [item._id, item]))

    return buildSuccess({
      currentStore: buildStoreView(stores.find((item) => item._id === payload.storeId)),
      stores: stores.map((item) => buildStoreView(item)),
      plans: schedules
        .filter((item) => !item.manual_only)
        .filter((item) => (Number(event.operator.role) === 3 && payload.allCoaches === true) || !payload.coachId || item.coach_id === payload.coachId)
        .sort((left, right) => String(left.start_time).localeCompare(String(right.start_time)))
        .map((item) => ({
          id: item._id,
          weekLabel: getWeekdayLabelByDateTime(item.start_time),
          dateLabel: formatDateLabel(item.start_time),
          timeRange: formatTimeRange(item.start_time, item.end_time),
          title: item.title,
          type: mapAssetTypeToPageType(item.class_type),
          storeId: item.store_id,
          storeName: storeMap.get(item.store_id)?.name || item.store_name || '',
          venue: getScheduleVenueName(item, storeMap),
          repeatWeekly: Boolean(item.repeat_weekly),
          fullDate: String(item.start_time).slice(0, 10),
          startTime: formatTimeText(item.start_time),
          endTime: formatTimeText(item.end_time),
          capacity: Number(item.max_capacity || 0),
          bookedCount: Number(item.booked_count || 0),
          status: Number(item.status) === SCHEDULE_STATUS.COACH_CANCELLED ? '已取消' : '已发布',
          coachId: item.coach_id, cancelRemaining: (item.cancel_pending_ids || []).length,
        })),
    })
  } catch (error) {
    return buildFail('读取排课管理页失败：' + (error.errMsg || error.message || error), 'COACH_SCHEDULE_VIEW_ERROR')
  }
}

async function getBootstrapData() {
  try {
    await ensureAdminOperator()
    const result = await ensureBaseCollectionsAndSeeds({
      includeDemo: process.env.ENABLE_DEMO_SEEDS === 'true',
    })
    const wxContext = cloud.getWXContext()
    return buildSuccess({
      envId: wxContext.ENV || cloud.DYNAMIC_CURRENT_ENV,
      collections: COLLECTIONS,
      ...result,
    })
  } catch (error) {
    return buildFail('数据库检查失败：' + (error.errMsg || error.message || error), 'BOOTSTRAP_ERROR')
  }
}

async function getCurrentUserSession() {
  try {
    const wxContext = cloud.getWXContext()
    if (!wxContext.OPENID) {
      return buildSuccess({
        loggedIn: false,
        role: 'client',
        userProfile: null,
        currentStore: null,
        stores: [],
      })
    }

    const currentUser = await getFirstUserByWhere({
      is_deleted: false,
      status: 1,
      openid: wxContext.OPENID,
    })

    if (!currentUser) {
      return buildSuccess({
        loggedIn: false,
        role: 'client',
        userProfile: null,
        currentStore: null,
        stores: [],
      })
    }

    return buildSuccess(await buildUserSession(currentUser))
  } catch (error) {
    return buildFail('读取当前登录态失败：' + (error.errMsg || error.message || error), 'GET_CURRENT_USER_SESSION_ERROR')
  }
}

async function getIdentityQrCode(event) {
  const payload = event.payload || {}
  const minuteKey = String(payload.minuteKey || '').replace(/[^0-9]/g, '').slice(-4)

  if (!minuteKey) {
    return buildFail('请重新打开身份码后重试', 'INVALID_IDENTITY_QR_PAYLOAD')
  }

  try {
    const currentUser = await getCurrentAuthedUser()
    if (!currentUser) {
      return buildFail('请先完成登录', 'IDENTITY_QR_LOGIN_REQUIRED')
    }

    const scene = buildIdentityQrScene(currentUser, minuteKey)
    const qrRes = await cloud.openapi.wxacode.getUnlimited({
      scene,
      page: 'pages/profile/index',
      checkPath: false,
      width: 430,
      autoColor: false,
      lineColor: {
        r: 0,
        g: 0,
        b: 0,
      },
      isHyaline: false,
    })

    return buildSuccess({
      imageBase64: qrRes.buffer.toString('base64'),
      scene,
      minuteKey,
    })
  } catch (error) {
    return buildFail('生成身份二维码失败：' + (error.errMsg || error.message || error), 'GET_IDENTITY_QR_CODE_ERROR')
  }
}

async function loginWithPhone(event) {
  const payload = event.payload || {}
  if (!payload.phoneCode) {
    return buildFail('请重新授权手机号登录', 'INVALID_PHONE_LOGIN_PAYLOAD')
  }

  try {
    const wxContext = cloud.getWXContext()
    if (!wxContext.OPENID) {
      return buildFail('未能确认微信登录身份，请重新进入小程序后登录', 'OPENID_NOT_FOUND')
    }

    const phoneRes = await cloud.openapi.phonenumber.getPhoneNumber({
      code: payload.phoneCode,
    })
    const phoneInfo = phoneRes.phone_info || phoneRes.phoneInfo || {}
    const purePhoneNumber = phoneInfo.purePhoneNumber || phoneInfo.phoneNumber || ''

    if (!purePhoneNumber) {
      return buildFail('未获取到手机号，请重新授权', 'PHONE_NUMBER_NOT_FOUND')
    }

    const stores = await listCollection(COLLECTIONS.STORE, { is_deleted: false, status: 1 })
    const defaultStoreId = stores[0] ? stores[0]._id : ''
    const existingUser = await getFirstUserByWhere({
      is_deleted: false,
      phone: purePhoneNumber,
    })
    const userId = existingUser ? existingUser._id : buildPhoneUserId(purePhoneNumber)
    const currentUser = await runBusinessTransaction(async (transaction) => {
      // 事务中重读，避免与管理员录入并发时覆盖姓名、门店及已有权益归属。
      const current = (await getDocById(COLLECTIONS.USER, userId, transaction)).data
      if (current && (current.is_deleted || Number(current.status) !== 1)) {
        throw Object.assign(new Error('账号已停用，请联系场馆管理员'), { code: 'ACCOUNT_DISABLED' })
      }
      const role = isConfiguredAdminPhone(purePhoneNumber) ? 3 : (current ? current.role : 1)
      if (current) {
        const patch = { openid: wxContext.OPENID, role, updated_at: db.serverDate() }
        await transaction.collection(COLLECTIONS.USER).doc(userId).update({ data: patch })
        return { ...current, ...patch }
      }
      const user = {
        openid: wxContext.OPENID, phone: purePhoneNumber,
        real_name: payload.realName || ('新会员' + purePhoneNumber.slice(-4)),
        avatar_url: '', role, home_store_id: payload.storeId || defaultStoreId,
        status: 1, created_at: db.serverDate(), updated_at: db.serverDate(), is_deleted: false,
      }
      await transaction.collection(COLLECTIONS.USER).doc(userId).set({ data: user })
      return { ...user, _id: userId }
    })

    return buildSuccess(await buildUserSession(currentUser))
  } catch (error) {
    return buildFail('手机号登录失败：' + (error.errMsg || error.message || error), error.code || 'LOGIN_WITH_PHONE_ERROR')
  }
}

async function createAssetDistribution(event) {
  const payload = event.payload || {}
  const validationMessage = validateDistributionPayload(payload)
  if (validationMessage) {
    return buildFail(validationMessage, 'INVALID_DISTRIBUTION_PAYLOAD')
  }

  try {
    const packageRecord = await getDocById(COLLECTIONS.PACKAGE, payload.packageId)
    const userRecord = await getDocById(COLLECTIONS.USER, payload.userId)
    const operatorRecord = await getDocById(COLLECTIONS.USER, payload.operatorId)

    if (!packageRecord.data || packageRecord.data.is_deleted) return buildFail('该套餐已不存在，请重新选择套餐', 'PACKAGE_NOT_AVAILABLE')
    if (Number(packageRecord.data.status) !== 1) return buildFail('该套餐已下架，请选择已上架套餐', 'PACKAGE_NOT_AVAILABLE')
    if (!userRecord.data || userRecord.data.is_deleted) return buildFail('客户档案已不存在，请重新搜索客户', 'USER_NOT_AVAILABLE')
    if (Number(userRecord.data.status) !== 1) return buildFail('客户账号已停用，请联系场馆管理员', 'USER_NOT_AVAILABLE')
    if (!operatorRecord.data || operatorRecord.data.role < 2) {
      return buildFail('操作人没有派课权限', 'OPERATOR_FORBIDDEN')
    }

    const packageData = packageRecord.data
    const storeId = payload.storeId || event.operator.home_store_id
    const store = storeId ? (await getDocById(COLLECTIONS.STORE, storeId)).data : null
    if (!store || Number(store.status) !== 1 || store.is_deleted) return buildFail('请选择正在营业的门店', 'STORE_NOT_AVAILABLE')
    const assetDocId = buildAssetDocId(payload.userId, packageData.asset_type)
    const unlimited = packageData.usage_mode === 'unlimited'
    const lessonCount = unlimited ? 0 : Number(packageData.course_count)
    const expiryDate = payload.expiryDate || businessDate(Date.now() + Number(packageData.valid_days || 365) * 86400000)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(expiryDate) || businessDate(expiryDate + ' 00:00:00') !== expiryDate || expiryDate < businessDate()) {
      return buildFail('请选择有效的权益到期日期', 'INVALID_EXPIRY_DATE')
    }
    if (!Number.isFinite(Number(payload.offlineAmount)) || Number(payload.offlineAmount) < 0) {
      return buildFail('实收金额必须为非负数', 'INVALID_AMOUNT')
    }

    const distributionId = 'distribution_' + crypto.randomBytes(16).toString('hex')
    const transactionResult = await runBusinessTransaction(async (transaction) => {
      const assetData = (await getDocById(COLLECTIONS.USER_ASSET, assetDocId, transaction)).data

      const beforeAsset = { unlimited_start_date: assetData && assetData.unlimited_start_date || '', unlimited_expiry_date: assetData && assetData.unlimited_expiry_date || '', unlimited_usage_version: Number(assetData && assetData.unlimited_usage_version || 0), balance: Number(assetData && assetData.balance || 0), total_earned: Number(assetData && assetData.total_earned || 0), expiry_date: assetData && assetData.expiry_date || '', is_deleted: Boolean(assetData && assetData.is_deleted), exists: Boolean(assetData) }
      const balanceReset = !unlimited && Boolean(assetData && (assetData.is_deleted || (assetData.expiry_date && assetData.expiry_date < businessDate())))
      const afterAsset = { balance: !assetData || balanceReset ? lessonCount : beforeAsset.balance + lessonCount, total_earned: beforeAsset.total_earned + lessonCount, expiry_date: unlimited ? beforeAsset.expiry_date : beforeAsset.expiry_date > expiryDate ? beforeAsset.expiry_date : expiryDate, unlimited_start_date: unlimited ? (unlimitedAt(assetData) ? beforeAsset.unlimited_start_date : businessDate()) : beforeAsset.unlimited_start_date, unlimited_expiry_date: unlimited ? (beforeAsset.unlimited_expiry_date > expiryDate ? beforeAsset.unlimited_expiry_date : expiryDate) : beforeAsset.unlimited_expiry_date, unlimited_usage_version: beforeAsset.unlimited_usage_version, is_deleted: false, exists: true }
      if (!assetData) {
        await transaction.collection(COLLECTIONS.USER_ASSET).add({
          data: {
            _id: assetDocId,
            user_id: payload.userId,
            asset_type: packageData.asset_type,
            balance: lessonCount,
            last_distribution_id: distributionId,
            total_earned: lessonCount,
            expiry_date: afterAsset.expiry_date, unlimited_start_date: afterAsset.unlimited_start_date, unlimited_expiry_date: afterAsset.unlimited_expiry_date, last_unlimited_distribution_id: unlimited ? distributionId : '', unlimited_usage_version: 0,
            created_at: db.serverDate(),
            updated_at: db.serverDate(),
            is_deleted: false,
          },
        })
      } else {
        await transaction.collection(COLLECTIONS.USER_ASSET).doc(assetDocId).update({
          data: {
            balance: afterAsset.balance,
            last_distribution_id: distributionId,
            total_earned: _.inc(lessonCount),
            expiry_date: afterAsset.expiry_date, unlimited_start_date: afterAsset.unlimited_start_date, unlimited_expiry_date: afterAsset.unlimited_expiry_date, ...(unlimited ? { last_unlimited_distribution_id: distributionId } : {}),
            updated_at: db.serverDate(),
            is_deleted: false,
          },
        })
      }

      await transaction.collection(COLLECTIONS.USER_ASSET_LOG).doc(distributionId).set({
        data: {
          usage_mode: unlimited ? 'unlimited' : 'count', previous_unlimited_distribution_id: assetData && assetData.last_unlimited_distribution_id || '', before_asset: beforeAsset, after_asset: afterAsset, balance_reset: balanceReset, previous_distribution_id: assetData && assetData.last_distribution_id || '',
          before_balance: beforeAsset.balance, after_balance: afterAsset.balance,
          user_id: payload.userId,
          operate_type: OPERATE_TYPE.COACH_DISTRIBUTE,
          amount: lessonCount,
          operator_id: payload.operatorId,
          ref_biz_id: payload.packageId,
          package_name: packageData.name,
          expiry_date: expiryDate,
          remark: payload.remark || ('线下收款 ' + payload.payType + ' ￥' + normalizeAmount(payload.offlineAmount)),
          offline_amount: normalizeAmount(payload.offlineAmount),
          pay_type: payload.payType,
          store_id: storeId,
          asset_type: packageData.asset_type,
          created_at: db.serverDate(),
          updated_at: db.serverDate(),
          is_deleted: false,
        },
      })

      return {
        assetDocId,
        lessonCount, unlimited,
        expiryDate: unlimited ? afterAsset.unlimited_expiry_date : afterAsset.expiry_date,
      }
    })

    return buildSuccess({
      message: '派课成功',
      packageId: payload.packageId,
      userId: payload.userId,
      ...transactionResult,
    })
  } catch (error) {
    return buildFail('派课失败：' + (error.errMsg || error.message || error), 'DISTRIBUTE_ASSET_ERROR')
  }
}

async function createClientBooking(event) {
  const payload = event.payload || {}
  if (!payload.userId || !payload.scheduleId) {
    return buildFail('请先登录并选择要预约的场次', 'INVALID_BOOKING_PAYLOAD')
  }

  try {
    const result = await runBusinessTransaction(async (transaction) => {
      const scheduleRes = await getDocById(COLLECTIONS.CLASS_SCHEDULE, payload.scheduleId, transaction)
      const scheduleData = scheduleRes.data
      if (!scheduleData) {
        throw new Error('排课不存在')
      }
      if (scheduleData.direct_private) throw new Error('请通过选择教练和时间预约专属训练')
      if (scheduleData.is_deleted) throw new Error('该场次已移除，请选择其他场次')
      if (!Number.isFinite(parseBusinessTime(scheduleData.start_time))) throw new Error('该场次尚未设置有效的开课时间，请联系场馆')
      if (parseBusinessTime(scheduleData.start_time) <= Date.now()) throw new Error('该场次已开始，请选择尚未开课的场次')
      const store = (await getDocById(COLLECTIONS.STORE, scheduleData.store_id, transaction)).data
      if (!store || store.is_deleted || Number(store.status) !== 1) throw new Error('门店已暂停营业，请选择其他门店')
      if (scheduleData.status !== SCHEDULE_STATUS.OPEN && scheduleData.status !== SCHEDULE_STATUS.FULL) {
        throw new Error('当前排课状态不可预约')
      }
      if (Number(scheduleData.booked_count) >= Number(scheduleData.max_capacity)) {
        throw new Error('当前时段已满员')
      }

      const assetType = mapClassTypeToAssetType(scheduleData.class_type)
      const assetDocId = buildAssetDocId(payload.userId, assetType)
      const bookingExists = await db.collection(COLLECTIONS.BOOKING).where({
        schedule_id: payload.scheduleId,
        user_id: payload.userId,
        status: BOOKING_STATUS.PENDING,
        is_deleted: false,
      }).count()
      if (bookingExists.total > 0) {
        throw new Error('该用户已预约当前场次')
      }

      const assetRes = await getDocById(COLLECTIONS.USER_ASSET, assetDocId, transaction)
      const assetData = assetRes.data
      const charge = chargeFor(assetData, businessDate(scheduleData.start_time))
      const client = (await getDocById(COLLECTIONS.USER, payload.userId, transaction)).data
      if (!client || client.is_deleted || Number(client.status) !== 1) throw new Error('账号已停用，请联系场馆管理员')
      const own = await listAllCollection(COLLECTIONS.BOOKING, { user_id: payload.userId, is_deleted: false })
      const ownIds = new Set(own.filter(b => [1, 2, 5].includes(Number(b.status))).map(b => b.schedule_id))
      const allSchedules = await listAllCollection(COLLECTIONS.CLASS_SCHEDULE, { is_deleted: false })
      if (allSchedules.some(s => ownIds.has(s._id) && Number(s.status) !== 4 && parseBusinessTime(s.start_time) < parseBusinessTime(scheduleData.end_time) && parseBusinessTime(s.end_time) > parseBusinessTime(scheduleData.start_time))) throw new Error('你在该时间已有训练预约，请选择其他时间')
      await transaction.collection(COLLECTIONS.USER).doc(payload.userId).update({ data: { booking_revision: _.inc(1) } })
      const nextBookedCount = Number(scheduleData.booked_count) + 1
      await transaction.collection(COLLECTIONS.USER_ASSET).doc(assetDocId).update({ data: { ...(charge.charged_count ? { balance: _.inc(-1) } : { unlimited_usage_version: _.inc(1) }), updated_at: db.serverDate() } })
      await transaction.collection(COLLECTIONS.CLASS_SCHEDULE).doc(payload.scheduleId).update({
        data: {
          booked_count: _.inc(1), booking_revision: _.inc(1),
          status: nextBookedCount >= Number(scheduleData.max_capacity) ? SCHEDULE_STATUS.FULL : SCHEDULE_STATUS.OPEN,
          updated_at: db.serverDate(),
        },
      })
      const bookingDocId = 'booking_' + crypto.randomBytes(16).toString('hex')
      await transaction.collection(COLLECTIONS.BOOKING).doc(bookingDocId).set({
        data: {
          schedule_id: payload.scheduleId,
          ...charge, user_id: payload.userId,
          status: BOOKING_STATUS.PENDING,
          writeoff_time: null,
          created_at: db.serverDate(),
          updated_at: db.serverDate(),
          is_deleted: false,
        },
      })
      await transaction.collection(COLLECTIONS.USER_ASSET_LOG).add({
        data: {
          user_id: payload.userId,
          operate_type: OPERATE_TYPE.CLIENT_BOOK,
          amount: -charge.charged_count, ...charge,
          operator_id: payload.userId,
          ref_biz_id: payload.scheduleId,
          remark: payload.remark || '预约使用权益',
          created_at: db.serverDate(),
          updated_at: db.serverDate(),
          is_deleted: false,
        },
      })

      return {
        bookingId: bookingDocId,
        assetDocId,
        nextBookedCount,
      }
    })

    return buildSuccess({
      message: '预约成功',
      ...result,
    })
  } catch (error) {
    return buildFail('预约失败：' + (error.errMsg || error.message || error), 'CREATE_BOOKING_ERROR')
  }
}

async function cancelClientBooking(event) {
  const payload = event.payload || {}
  if (!payload.bookingId) return buildFail('请选择要取消的预约', 'INVALID_CANCEL_PAYLOAD')
  try {
    const result = await runBusinessTransaction(async (transaction) => {
      const bookingData = (await getDocById(COLLECTIONS.BOOKING, payload.bookingId, transaction)).data
      if (!bookingData || bookingData.is_deleted) throw new Error('预约记录不存在')
      if (bookingData.user_id !== event.operator._id) throw new Error('只能取消自己的预约')
      if (Number(bookingData.status) !== BOOKING_STATUS.PENDING) throw new Error('该预约已处理，请刷新后查看')
      const scheduleData = (await getDocById(COLLECTIONS.CLASS_SCHEDULE, bookingData.schedule_id, transaction)).data
      if (!scheduleData) throw new Error('关联场次不存在，请联系场馆')
      if (Number(scheduleData.status) === SCHEDULE_STATUS.COACH_CANCELLED) throw new Error('场馆正在处理取消退课，请刷新预约记录')
      if (!canCancel(scheduleData.start_time)) throw new Error('开课前 2 小时内不可取消，请联系场馆')
      const assetDocId = buildAssetDocId(bookingData.user_id, mapClassTypeToAssetType(scheduleData.class_type))
      const asset = (await getDocById(COLLECTIONS.USER_ASSET, assetDocId, transaction)).data
      if (!asset) throw new Error('权益记录不存在，请联系场馆')
      const refund = refundCount(bookingData)
      const nextBookedCount = Math.max(0, Number(scheduleData.booked_count) - 1)
      await transaction.collection(COLLECTIONS.BOOKING).doc(payload.bookingId).update({
        data: { status: BOOKING_STATUS.CLIENT_CANCELLED, updated_at: db.serverDate() },
      })
      await transaction.collection(COLLECTIONS.USER_ASSET).doc(assetDocId).update({
        data: { balance: _.inc(refund), updated_at: db.serverDate() },
      })
      await transaction.collection(COLLECTIONS.CLASS_SCHEDULE).doc(bookingData.schedule_id).update({
        data: { booked_count: nextBookedCount, booking_revision: _.inc(1), status: scheduleData.direct_private ? SCHEDULE_STATUS.COACH_CANCELLED : scheduleData.status === SCHEDULE_STATUS.FULL ? SCHEDULE_STATUS.OPEN : scheduleData.status, updated_at: db.serverDate() },
      })
      await transaction.collection(COLLECTIONS.USER_ASSET_LOG).add({ data: {
        user_id: bookingData.user_id, operate_type: OPERATE_TYPE.CLIENT_CANCEL, amount: refund, charge_mode: bookingData.charge_mode || 'count',
        operator_id: event.operator._id, ref_biz_id: bookingData.schedule_id,
        remark: '客户取消预约退课', created_at: db.serverDate(), updated_at: db.serverDate(), is_deleted: false,
      } })
      return { assetDocId, nextBookedCount, refund }
    })
    return buildSuccess({ message: result.refund ? '预约已取消，1 次权益已退回' : '预约已取消，无限次权益保持不变', ...result })
  } catch (error) {
    return buildFail(error.errMsg || error.message || '取消失败，请重试', 'CANCEL_BOOKING_ERROR')
  }
}

async function writeOffBooking(event) {
  const payload = event.payload || {}
  const targetStatus = Number(payload.status || BOOKING_STATUS.WRITTEN_OFF)
  if (!payload.bookingId || ![BOOKING_STATUS.WRITTEN_OFF, BOOKING_STATUS.ABSENT].includes(targetStatus)) {
    return buildFail('请选择预约及有效的核销状态', 'INVALID_WRITEOFF_PAYLOAD')
  }
  try {
    await runBusinessTransaction(async (transaction) => {
      const booking = (await getDocById(COLLECTIONS.BOOKING, payload.bookingId, transaction)).data
      if (!booking || booking.is_deleted) throw new Error('预约记录不存在')
      if (Number(booking.status) !== BOOKING_STATUS.PENDING) throw new Error('该预约已处理，请刷新名单')
      const schedule = (await getDocById(COLLECTIONS.CLASS_SCHEDULE, booking.schedule_id, transaction)).data
      if (!schedule || (Number(event.operator.role) !== 3 && schedule.coach_id !== event.operator._id)) {
        throw new Error('只能核销自己负责的场次')
      }
      if (Number(schedule.status) === SCHEDULE_STATUS.COACH_CANCELLED) throw new Error('场次已取消，不能继续核销')
      await transaction.collection(COLLECTIONS.CLASS_SCHEDULE).doc(schedule._id).update({ data: { booking_revision: _.inc(1), updated_at: db.serverDate() } })
      await transaction.collection(COLLECTIONS.BOOKING).doc(payload.bookingId).update({ data: {
        writeoff_version: _.inc(1), status: targetStatus, writeoff_time: db.serverDate(), writeoff_operator_id: event.operator._id, updated_at: db.serverDate(),
      } })
    })
    return buildSuccess({ message: targetStatus === BOOKING_STATUS.WRITTEN_OFF ? '到场已确认' : '缺席已记录', bookingId: payload.bookingId, status: targetStatus })
  } catch (error) {
    return buildFail(error.errMsg || error.message || '核销失败，请重试', 'WRITEOFF_BOOKING_ERROR')
  }
}

async function getManualWriteOffViewData(event) {
  try {
    const payload = event.payload || {}
    let classInfo = null
    if (payload.classId) {
      const result = await getCoachClassViewData(event)
      if (!result.success) return result
      const schedule = (await getDocById(COLLECTIONS.CLASS_SCHEDULE, payload.classId)).data
      classInfo = { ...result.data.classInfo, classType: Number(schedule.class_type) }
    }
    const keyword = String(payload.keyword || '').trim()
    // 不默认下载全量客户资料；输入至少两字后才返回有限候选。
    const members = keyword.length < 2 ? [] : (await listCollection(COLLECTIONS.USER, { is_deleted: false, status: 1 }))
      .filter((user) => [user.real_name, user.phone].some((field) => String(field || '').includes(keyword)))
      .slice(0, 20)
    const assets = members.length ? await listCollection(COLLECTIONS.USER_ASSET, { is_deleted: false }) : []
    return buildSuccess({ classInfo, members: members.map((user) => ({
      id: user._id, nickname: user.real_name || '未命名学员', phone: user.phone || '',
      ...buildAssetView(assets.filter((asset) => asset.user_id === user._id)),
    })) })
  } catch (error) {
    return buildFail(error.message || '读取人工核销资料失败', 'MANUAL_VIEW_ERROR')
  }
}

async function manualWriteOff(event) {
  const payload = event.payload || {}
  const remark = String(payload.remark || '').trim()
  if (!payload.userId || !/^[a-zA-Z0-9_-]{16,80}$/.test(String(payload.requestId || '')) || remark.length > 200) {
    return buildFail('请选择学员，备注最多 200 字', 'INVALID_MANUAL_PAYLOAD')
  }
  const classType = Number(payload.classType)
  const trainingTime = parseBusinessTime(payload.trainingTime)
  if (!payload.classId && (!payload.storeId || ![1, 2].includes(classType) || !Number.isFinite(trainingTime) || trainingTime > Date.now())) {
    return buildFail('请选择门店、课程类型和已发生的训练时间', 'INVALID_MANUAL_TIME')
  }
  const requestKey = crypto.createHash('sha256').update(event.operator._id + ':' + payload.requestId).digest('hex')
  const fingerprint = crypto.createHash('sha256').update(JSON.stringify([payload.userId, payload.classId || '', payload.storeId || '', classType, payload.trainingTime || '', remark])).digest('hex')
  const receiptId = 'manual_' + requestKey
  try {
    const result = await runBusinessTransaction(async (transaction) => {
      const receipt = (await getDocById(COLLECTIONS.USER_ASSET_LOG, receiptId, transaction)).data
      if (receipt) {
        if (receipt.request_fingerprint !== fingerprint) throw new Error('请求已用于其他核销，请重新选择')
        return { bookingId: receipt.booking_id, deducted: receipt.new_attendance === undefined ? receipt.amount === -1 : receipt.new_attendance, unlimited: receipt.charge_mode === 'unlimited', repeated: true }
      }
      const member = (await getDocById(COLLECTIONS.USER, payload.userId, transaction)).data
      if (!member || member.is_deleted) throw new Error('该学员档案已不存在，请重新搜索选择')
      if (Number(member.status) !== 1) throw new Error('该学员账号已停用，请联系场馆管理员')
      let scheduleId = payload.classId || 'manual_class_' + requestKey
      let schedule
      if (payload.classId) {
        schedule = (await getDocById(COLLECTIONS.CLASS_SCHEDULE, scheduleId, transaction)).data
        if (!schedule || schedule.is_deleted || Number(schedule.status) === SCHEDULE_STATUS.COACH_CANCELLED || schedule.manual_only) throw new Error('该场次不可核销')
        if (Number(event.operator.role) !== 3 && schedule.coach_id !== event.operator._id) throw new Error('只能核销自己负责的场次')
        if (parseBusinessTime(schedule.start_time) > Date.now()) throw new Error('场次尚未开始，请在训练到场后核销')
      } else {
        schedule = { store_id: payload.storeId, coach_id: event.operator._id, class_type: classType }
      }
      const store = (await getDocById(COLLECTIONS.STORE, schedule.store_id, transaction)).data
      if (!store || store.is_deleted) throw new Error('该门店已不存在，请重新选择门店')
      if (Number(store.status) !== 1) throw new Error('该门店已停用，请选择营业中的门店')
      let bookingId = 'manual_booking_' + requestKey
      if (!payload.classId) {
        // 同一学员、门店、课程类型和训练分钟只能登记一次，即使更换操作人或请求编号。
        const attendanceKey = crypto.createHash('sha256').update(JSON.stringify([payload.userId, schedule.store_id, classType, trainingTime])).digest('hex')
        bookingId = 'manual_attendance_' + attendanceKey
        const attendance = (await getDocById(COLLECTIONS.BOOKING, bookingId, transaction)).data
        if (attendance) throw new Error('该学员此时间的训练已核销，请核对记录')
      }
      let deducted = true
      if (payload.classId) {
        const existing = await listCollection(COLLECTIONS.BOOKING, { schedule_id: scheduleId, user_id: payload.userId, is_deleted: false })
        if (existing.some((item) => [BOOKING_STATUS.WRITTEN_OFF, BOOKING_STATUS.ABSENT].includes(Number(item.status)))) throw new Error('该学员本场课程已处理，请勿重复核销')
        const pending = existing.find((item) => Number(item.status) === BOOKING_STATUS.PENDING)
        if (pending) { bookingId = pending._id; deducted = false }
        else if (Number(schedule.booked_count) >= Number(schedule.max_capacity)) throw new Error('场次人数已满，请核对训练名单')
      }
      const assetType = mapClassTypeToAssetType(schedule.class_type)
      let charge = { charge_mode: 'count', charged_count: 0 }
      if (deducted) {
        const assetId = buildAssetDocId(payload.userId, assetType)
        const asset = (await getDocById(COLLECTIONS.USER_ASSET, assetId, transaction)).data
        charge = chargeFor(asset, businessDate(payload.classId ? schedule.start_time : payload.trainingTime))
        await transaction.collection(COLLECTIONS.USER_ASSET).doc(assetId).update({ data: { ...(charge.charged_count ? { balance: _.inc(-1) } : { unlimited_usage_version: _.inc(1) }), updated_at: db.serverDate() } })
      }
      if (payload.classId) {
        // 所有同场人工核销共享排课文档，事务冲突重试后重新检查名单。
        await transaction.collection(COLLECTIONS.CLASS_SCHEDULE).doc(scheduleId).update({ data: {
          booked_count: _.inc(deducted ? 1 : 0), booking_revision: _.inc(1), writeoff_revision: _.inc(1), updated_at: db.serverDate(),
        } })
      } else {
        const start = new Date(trainingTime + 8 * 3600000).toISOString().slice(0, 19).replace('T', ' ')
        await transaction.collection(COLLECTIONS.CLASS_SCHEDULE).doc(scheduleId).set({ data: {
          ...schedule, title: classType === 1 ? '线下团体训练' : '线下私教训练', store_name: store.name,
          start_time: start, end_time: start, max_capacity: 1, booked_count: 1,
          status: SCHEDULE_STATUS.FINISHED, manual_only: true, is_deleted: false,
          created_at: db.serverDate(), updated_at: db.serverDate(),
        } })
      }
      const bookingData = { last_manual_receipt_id: receiptId, writeoff_version: _.inc(1), status: BOOKING_STATUS.WRITTEN_OFF, writeoff_time: db.serverDate(), writeoff_operator_id: event.operator._id,
        training_time: payload.classId ? schedule.start_time : payload.trainingTime, manual_remark: remark, updated_at: db.serverDate() }
      if (deducted) await transaction.collection(COLLECTIONS.BOOKING).doc(bookingId).set({ data: {
        ...bookingData, ...charge, writeoff_version: 1, schedule_id: scheduleId, user_id: payload.userId, source: 'manual', is_deleted: false, created_at: db.serverDate(),
      } })
      else {
        const current = (await getDocById(COLLECTIONS.BOOKING, bookingId, transaction)).data
        if (!current || Number(current.status) !== BOOKING_STATUS.PENDING) throw new Error('预约已处理，请刷新后重试')
        await transaction.collection(COLLECTIONS.BOOKING).doc(bookingId).update({ data: bookingData })
      }
      await transaction.collection(COLLECTIONS.USER_ASSET_LOG).doc(receiptId).set({ data: {
        user_id: payload.userId, asset_type: assetType, operate_type: OPERATE_TYPE.MANUAL_WRITEOFF, amount: deducted ? -charge.charged_count : 0, new_attendance: deducted, charge_mode: charge.charge_mode,
        operator_id: event.operator._id, store_id: schedule.store_id, ref_biz_id: scheduleId, booking_id: bookingId,
        writeoff_version: deducted ? 1 : Number((await getDocById(COLLECTIONS.BOOKING, bookingId, transaction)).data.writeoff_version || 0),
        request_class_id: payload.classId || '', request_fingerprint: fingerprint, remark, created_at: db.serverDate(), updated_at: db.serverDate(), is_deleted: false,
      } })
      return { bookingId, deducted, unlimited: deducted && charge.charge_mode === 'unlimited' }
    })
    return buildSuccess({ ...result, message: result.unlimited ? '人工核销成功，使用有效期内无限次权益' : result.deducted ? '人工核销成功，已扣减 1 课时' : '已有预约已核销，未重复扣课' })
  } catch (error) {
    return buildFail(error.errMsg || error.message || '人工核销失败', 'MANUAL_WRITEOFF_ERROR')
  }
}

async function createCoachSchedule(event) {
  const payload = event.payload || {}
  const title = String(payload.title || '').trim()
  const startTime = parseBusinessTime(payload.startTime)
  const endTime = parseBusinessTime(payload.endTime)
  const capacity = Number(payload.maxCapacity)
  if (!payload.storeId || !title || title.length > 60 || !payload.coachId) return buildFail('请补全门店与训练主题，主题最多 60 个字', 'INVALID_SCHEDULE_PAYLOAD')
  if (!Number.isFinite(startTime) || !Number.isFinite(endTime) || startTime <= Date.now() || endTime <= startTime) {
    return buildFail('请选择未来的训练时间，结束时间应晚于开始时间', 'INVALID_SCHEDULE_TIME')
  }
  if (!Number.isInteger(capacity) || capacity < 1 || capacity > 100) return buildFail('预约人数应为 1 至 100 的整数', 'INVALID_CAPACITY')
  if (![1, 2].includes(Number(payload.classType))) return buildFail('请选择正确的训练类型', 'INVALID_CLASS_TYPE')
  try {
    const store = (await getDocById(COLLECTIONS.STORE, payload.storeId)).data
    const coach = (await getDocById(COLLECTIONS.USER, payload.coachId)).data
    if (!store || Number(store.status) !== 1 || store.is_deleted) return buildFail('门店当前不可用，请重新选择', 'STORE_NOT_AVAILABLE')
    if (!coach || ![2, 3].includes(Number(coach.role)) || Number(coach.status) !== 1 || coach.is_deleted) return buildFail('请选择可排课的场馆人员', 'COACH_NOT_AVAILABLE')
    const count = payload.repeatWeekly === true ? 4 : 1
    const slots = Array.from({ length: count }, (_, index) => ({ start: startTime + index * 7 * 86400000, end: endTime + index * 7 * 86400000 }))
    const existing = (await listCollection(COLLECTIONS.CLASS_SCHEDULE, { is_deleted: false, coach_id: payload.coachId })).filter((item) => !item.manual_only)
    if (slots.some((slot) => existing.some((item) => Number(item.status) !== SCHEDULE_STATUS.COACH_CANCELLED &&
      parseBusinessTime(item.start_time) < slot.end && parseBusinessTime(item.end_time) > slot.start))) {
      return buildFail('与已有排课时间重叠，请调整时间后重试', 'SCHEDULE_CONFLICT')
    }
    const format = (time) => new Date(time + 8 * 3600000).toISOString().slice(0, 19).replace('T', ' ')
    const scheduleIds = await runBusinessTransaction(async (transaction) => {
      // 排课共享教练记录作为并发冲突点；事务重试时重新检查已发布时段。
      await getDocById(COLLECTIONS.USER, payload.coachId, transaction)
      const latest = (await listCollection(COLLECTIONS.CLASS_SCHEDULE, { is_deleted: false, coach_id: payload.coachId })).filter((item) => !item.manual_only)
      if (slots.some((slot) => latest.some((item) => Number(item.status) !== SCHEDULE_STATUS.COACH_CANCELLED &&
        parseBusinessTime(item.start_time) < slot.end && parseBusinessTime(item.end_time) > slot.start))) throw new Error('与已有排课时间重叠，请调整时间')
      await transaction.collection(COLLECTIONS.USER).doc(payload.coachId).update({ data: { schedule_revision: _.inc(1) } })
      const ids = []
      for (const slot of slots) {
        const result = await transaction.collection(COLLECTIONS.CLASS_SCHEDULE).add({ data: {
          store_id: store._id, store_name: store.name, coach_id: payload.coachId,
          class_type: Number(payload.classType), title, start_time: format(slot.start), end_time: format(slot.end),
          max_capacity: capacity, booked_count: 0, status: SCHEDULE_STATUS.OPEN, venue: store.name,
          week_day: Number(payload.weekDay || 0), repeat_weekly: count === 4,
          created_at: db.serverDate(), updated_at: db.serverDate(), is_deleted: false,
        } })
        ids.push(result._id)
      }
      return ids
    })
    return buildSuccess({ message: count === 4 ? '已发布连续 4 周的训练场次' : '训练场次已发布', scheduleId: scheduleIds[0], scheduleIds })
  } catch (error) {
    return buildFail('排课未保存：' + (error.errMsg || error.message || error), 'CREATE_SCHEDULE_ERROR')
  }
}

// 积分与课时分开记录；绑定关系、双方余额和明细必须一同提交。
function requirePointUser(user) {
  if (!user || user.is_deleted || Number(user.status) !== 1) throw new Error('账号已停用或不存在，请重新登录或联系场馆')
}

async function ensureInviteCode(userId) {
  const code = 'ON' + crypto.createHash('sha256').update('invite:' + userId).digest('hex').slice(0, 12).toUpperCase()
  await runBusinessTransaction(async (transaction) => {
    const user = (await getDocById(COLLECTIONS.USER, userId, transaction)).data
    requirePointUser(user)
    const existing = (await getDocById(COLLECTIONS.INVITE_CODE, code, transaction)).data
    if (existing && existing.user_id !== userId) throw new Error('邀请码暂时无法生成，请联系场馆处理')
    if (!existing) await transaction.collection(COLLECTIONS.INVITE_CODE).doc(code).set({ data: { user_id: userId, created_at: db.serverDate() } })
  })
  return code
}

async function getPointsViewData(event) {
  try {
    const userId = event.operator._id
    const inviteCode = await ensureInviteCode(userId)
    const user = (await getDocById(COLLECTIONS.USER, userId)).data
    requirePointUser(user)
    const logs = (await db.collection(COLLECTIONS.POINT_LOG).where({ user_id: userId }).orderBy('created_at', 'desc').limit(50).get()).data
    return buildSuccess({ balance: Number(user.point_balance || 0), inviteCode, bound: Boolean(user.invited_by), boundCode: user.bound_invite_code || '', reward: 100,
      records: logs.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).map(log => ({ id: log._id, amount: log.amount, title: log.reason === 'INVITE' ? '邀请好友奖励' : '填写邀请码奖励', dateLabel: businessDate(log.created_at) })) })
  } catch (error) { return buildFail(error.message || error.errMsg, 'POINTS_VIEW_ERROR') }
}

async function bindInviteCode(event) {
  const code = String(event.payload.inviteCode || '').trim().toUpperCase()
  if (!/^ON[0-9A-F]{12}$/.test(code)) return buildFail('邀请码格式不正确，请核对好友分享的14位邀请码', 'INVALID_INVITE_CODE')
  try {
    const result = await runBusinessTransaction(async (transaction) => {
      const userId = event.operator._id
      const user = (await getDocById(COLLECTIONS.USER, userId, transaction)).data
      requirePointUser(user)
      // 原码重试幂等，网络超时后再次提交不会重复加分。
      if (user.invited_by) {
        if (user.bound_invite_code === code) return { repeated: true, balance: Number(user.point_balance || 0), message: '该邀请码已绑定，积分已到账' }
        throw new Error('你已绑定过邀请码，不能更换或再次领取奖励')
      }
      const invite = (await getDocById(COLLECTIONS.INVITE_CODE, code, transaction)).data
      if (!invite) throw new Error('邀请码不存在，请向好友确认后重新输入')
      if (invite.user_id === userId) throw new Error('不能填写自己的邀请码，请输入好友的邀请码')
      const inviter = (await getDocById(COLLECTIONS.USER, invite.user_id, transaction)).data
      if (!inviter || inviter.is_deleted || Number(inviter.status) !== 1) throw new Error('该邀请码所属账号已停用，暂时不能领取奖励')
      await transaction.collection(COLLECTIONS.USER).doc(userId).update({ data: { invited_by: inviter._id, bound_invite_code: code, invite_bound_at: db.serverDate(), point_balance: _.inc(100) } })
      await transaction.collection(COLLECTIONS.USER).doc(inviter._id).update({ data: { point_balance: _.inc(100) } })
      for (const entry of [{ user_id: userId, reason: 'BIND' }, { user_id: inviter._id, reason: 'INVITE' }]) {
        await transaction.collection(COLLECTIONS.POINT_LOG).doc(userId + '_' + entry.reason).set({ data: { ...entry, amount: 100, related_user_id: entry.reason === 'BIND' ? inviter._id : userId, created_at: db.serverDate() } })
      }
      return { repeated: false, balance: Number(user.point_balance || 0) + 100, message: '绑定成功，你和好友各获得100积分' }
    })
    return buildSuccess(result)
  } catch (error) { return buildFail(error.message || error.errMsg, 'BIND_INVITE_ERROR') }
}

const adjustments = require('./adjustments')({ db, collections: COLLECTIONS, getDocById, listAllCollection, runBusinessTransaction, buildSuccess, buildFail })

const privateBooking = require('./private-booking')({ db, collections: COLLECTIONS, getDocById, listAllCollection, runBusinessTransaction, buildSuccess, buildFail })

const reports = require('./reports')({ collections: COLLECTIONS, listAllCollection, buildSuccess, buildFail })

const coachProfiles = require('./coach-profile')({ db, collections: COLLECTIONS, cloud, getDocById, runBusinessTransaction, buildSuccess, buildFail, buildUserSession })
const updateStoreGallery = require('./store-gallery')({ db, collections: COLLECTIONS, cloud, getDocById, runBusinessTransaction, buildSuccess, buildFail })

exports.main = async (event = {}) => {
  try {
    // 在任何登录查询、鉴权或业务读写之前初始化，避免依赖管理员页面。
    await ensureDatabaseReady()
  } catch (error) {
    return buildFail('数据库自动初始化失败：' + (error.errMsg || error.message || error), 'DATABASE_INIT_ERROR')
  }
  try {
    const needsUser = !PUBLIC_ACTIONS.has(event.action) || event.action === 'getBookingViewData'
    const currentUser = needsUser ? await getCurrentAuthedUser() : null
    event = authorizeRequest(event, currentUser)
  } catch (error) {
    return buildFail(error.message || '身份验证失败，请重试', error.code || 'AUTH_ERROR')
  }
  switch (event.action) {
    case 'getCoachProfile':
    case 'getOwnCoachProfile':
    case 'getMediaUploadData':
    case 'updateUserAvatar':
    case 'updateCoachProfile': return coachProfiles[event.action](event)
    case 'updateStoreGallery': return updateStoreGallery(event)
    case 'createPrivateBooking': return privateBooking.createPrivateBooking(event)
    case 'getCustomerFollowUpData':
    case 'getBusinessReportData':
      return reports[event.action](event)
    case 'getScheduleAdjustmentData':
    case 'updateCoachSchedule':
    case 'cancelCoachSchedule':
    case 'getCorrectionRecords':
    case 'reverseOperation':
      return adjustments[event.action](event)
    case 'getPointsViewData':
      return getPointsViewData(event)
    case 'bindInviteCode':
      return bindInviteCode(event)
    case 'getManualWriteOffViewData':
      return getManualWriteOffViewData(event)
    case 'manualWriteOff':
      return manualWriteOff(event)
    case 'logout':
      return logoutCurrentUser()
    case 'bootstrap':
      return getBootstrapData()
    case 'getCurrentUserSession':
      return getCurrentUserSession()
    case 'getIdentityQrCode':
      return getIdentityQrCode(event)
    case 'loginWithPhone':
      return loginWithPhone(event)
    case 'getHomeViewData':
      return getHomeViewData(event)
    case 'getBookingViewData':
      return getBookingViewData(event)
    case 'getProfileViewData':
      return getProfileViewData(event)
    case 'getWorkspaceViewData':
      return getWorkspaceViewData(event)
    case 'getDistributeViewData':
      return getDistributeViewData(event)
    case 'getAdminDashboardData':
      return getAdminDashboardData(event)
    case 'getAdminUserManageData':
      return getAdminUserManageData()
    case 'getAdminUserAssets':
      return getAdminUserAssets(event)
    case 'getAdminPackageManageData':
      return getAdminPackageManageData()
    case 'getAdminStoreManageData':
      return getAdminStoreManageData()
    case 'createUser':
      return createUser(event)
    case 'createPackage':
      return createPackage(event)
    case 'createStore':
      return createStore(event)
    case 'updateStore':
      return updateStore(event)
    case 'updateStoreStatus':
      return updateStoreStatus(event)
    case 'getCoachClassViewData':
      return getCoachClassViewData(event)
    case 'getCoachScheduleViewData':
      return getCoachScheduleViewData(event)
    case 'updateUserRole':
      return updateUserRole(event)
    case 'updateUserProfile':
      return updateUserProfile(event)
    case 'updatePackageStatus':
      return updatePackageStatus(event)
    case 'distributeAsset':
      return createAssetDistribution(event)
    case 'createBooking':
      return createClientBooking(event)
    case 'cancelBooking':
      return cancelClientBooking(event)
    case 'writeOffBooking':
      return writeOffBooking(event)
    case 'createCoachSchedule':
      return createCoachSchedule(event)
    default:
      return buildFail('未知 action: ' + event.action, 'UNKNOWN_ACTION')
  }
}
