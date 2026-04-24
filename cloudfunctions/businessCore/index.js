const cloud = require('wx-server-sdk')

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
}

const ASSET_TYPE = {
  GROUP: 1,
  PRIVATE: 2,
}

const OPERATE_TYPE = {
  COACH_DISTRIBUTE: 1,
  CLIENT_BOOK: 2,
  CLIENT_CANCEL: 3,
  SYSTEM_VOID: 4,
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
    name: '30节私教卡',
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
    name: '新人体验私教课',
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
    name: '半年团课卡',
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
    real_name: '李教练',
    avatar_url: '',
    coach_title: '泰拳主教练',
    specialties: ['步法', '膝法', '燃脂'],
    level_label: '资深',
    bio: '职业泰拳背景，擅长小班动作纠正与燃脂训练。',
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
    real_name: '王教练',
    avatar_url: '',
    coach_title: '自由搏击教练',
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
    real_name: '赵教练',
    avatar_url: '',
    coach_title: '体能与私教教练',
    specialties: ['减脂', '私教', '体能'],
    level_label: '核心',
    bio: '偏重私教减脂与体能提升，适合零基础进阶。',
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
    title: '泰拳基础发力小班课',
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
    title: '拳腿衔接私教档期',
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
  '暑期燃脂计划开启，团课卡续费可预约教练体验课。',
  '五一假期营业时间调整：高新店 9:00-21:00，经开店 10:00-20:00。',
  '新手友好课程持续开放，首次到店可申请教练动作评估。',
]

const HOME_GALLERY = [
  '拳台区 / 标准赛台 / 录像回放',
  '力量区 / 壶铃雪橇 / 爆发训练',
  '沙袋区 / 实战靶训练 / 私教专区',
]

const COACH_QUICK_ACTIONS = [
  { id: 'distribute', title: '课时派发', desc: '线下收款后给学员加课，并形成审计流水。' },
  { id: 'class', title: '课程核销', desc: '进入单节课名单，扫码或手动核销到场学员。' },
  { id: 'schedule', title: '排课管理', desc: '管理近期排课并临时新增训练计划。' },
]

function buildSuccess(data) {
  return {
    success: true,
    data,
  }
}

function buildFail(message, code = 'BUSINESS_FAIL') {
  return {
    success: false,
    code,
    message,
  }
}

function buildAssetDocId(userId, assetType) {
  return userId + '_' + assetType
}

function normalizeAmount(value) {
  return Number(value || 0)
}

function mapClassTypeToAssetType(classType) {
  return Number(classType) === ASSET_TYPE.GROUP ? ASSET_TYPE.GROUP : ASSET_TYPE.PRIVATE
}

async function tryCreateCollection(collectionName) {
  try {
    await db.createCollection(collectionName)
    return { collectionName, created: true, status: 'created' }
  } catch (error) {
    const message = String(error && error.errMsg ? error.errMsg : error)
    const errorCode = String(error && error.errCode ? error.errCode : '')
    // 云开发在“集合已存在”场景下返回值并不稳定，可能是英文提示、错误码，
    // 也可能混有 "Table exist" / "COLLECTION_ALREADY_EXIST" 等文本，这里统一按幂等成功处理。
    if (
      message.includes('already exists') ||
      message.includes('COLLECTION_ALREADY_EXIST') ||
      message.includes('Table exist') ||
      message.includes('resource system error') ||
      errorCode === '-501001'
    ) {
      return { collectionName, created: false, status: 'exists', rawError: message, rawErrorCode: errorCode }
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

  const countResult = await db.collection(collectionName).count()
  if (countResult.total === 0) {
    for (const doc of docs) {
      await db.collection(collectionName).add({ data: doc })
    }

    return {
      collectionName,
      seeded: true,
      total: docs.length,
      insertedCount: docs.length,
      insertedIds: docs.map((item) => item._id),
    }
  }

  const insertedIds = []
  for (const doc of docs) {
    const existsResult = await db.collection(collectionName).where({ _id: doc._id }).count()
    if (existsResult.total > 0) {
      continue
    }
    await db.collection(collectionName).add({ data: doc })
    insertedIds.push(doc._id)
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

async function getDocById(collectionName, docId) {
  return db.collection(collectionName).doc(docId).get()
}

async function ensureBaseCollectionsAndSeeds() {
  const createResults = []
  for (const collectionName of Object.values(COLLECTIONS)) {
    createResults.push(await tryCreateCollection(collectionName))
  }

  const seedResults = []
  seedResults.push(await seedCollectionIfEmpty(COLLECTIONS.STORE, storeSeeds))
  seedResults.push(await seedCollectionIfEmpty(COLLECTIONS.PACKAGE, packageSeeds))
  seedResults.push(await seedCollectionIfEmpty(COLLECTIONS.USER, userSeeds))
  seedResults.push(await seedCollectionIfEmpty(COLLECTIONS.USER_ASSET, userAssetSeeds))
  seedResults.push(await seedCollectionIfEmpty(COLLECTIONS.CLASS_SCHEDULE, scheduleSeeds))
  seedResults.push(await seedCollectionIfEmpty(COLLECTIONS.BOOKING, bookingSeeds))

  const inspectResults = []
  for (const collectionName of Object.values(COLLECTIONS)) {
    inspectResults.push(await inspectCollection(collectionName))
  }

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

function validateDistributionPayload(payload) {
  if (!payload.userId) {
    return 'userId 不能为空'
  }
  if (!payload.packageId) {
    return 'packageId 不能为空'
  }
  if (!payload.operatorId) {
    return 'operatorId 不能为空'
  }
  if (!payload.payType) {
    return 'payType 不能为空'
  }
  if (normalizeAmount(payload.offlineAmount) < 0) {
    return 'offlineAmount 不能小于 0'
  }
  return ''
}

function mapAssetTypeToPageType(assetType) {
  return Number(assetType) === ASSET_TYPE.GROUP ? 'group' : 'private'
}

function mapAssetTypeToLabel(assetType) {
  return Number(assetType) === ASSET_TYPE.GROUP ? '团课' : '私教'
}

function mapBookingStatusToLabel(status) {
  switch (Number(status)) {
    case BOOKING_STATUS.PENDING:
      return '待上课'
    case BOOKING_STATUS.WRITTEN_OFF:
      return '已完成'
    case BOOKING_STATUS.CLIENT_CANCELLED:
      return '已取消'
    case BOOKING_STATUS.COACH_CANCELLED:
      return '教练取消'
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
      return '教练取消'
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
  const res = await db.collection(collectionName).where(where).get()
  return res.data || []
}

function buildStoreView(store) {
  if (!store) {
    return null
  }
  return {
    id: store._id,
    name: store.name,
    address: store.address,
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
  }

  assetList.forEach((item) => {
    if (Number(item.asset_type) === ASSET_TYPE.PRIVATE) {
      result.privateCount = Number(item.balance || 0)
    }
    if (Number(item.asset_type) === ASSET_TYPE.GROUP) {
      result.groupCount = Number(item.balance || 0)
    }
  })

  return result
}

async function getBookingViewData(event) {
  const payload = event.payload || {}
  if (!payload.userId || !payload.storeId) {
    return buildFail('userId 和 storeId 不能为空', 'INVALID_BOOKING_VIEW_PAYLOAD')
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
      listCollection(COLLECTIONS.USER, { is_deleted: false, status: 1, role: 2 }),
      listCollection(COLLECTIONS.CLASS_SCHEDULE, { is_deleted: false, store_id: payload.storeId }),
      listCollection(COLLECTIONS.BOOKING, { is_deleted: false, user_id: payload.userId }),
      listCollection(COLLECTIONS.USER_ASSET, { is_deleted: false, user_id: payload.userId }),
    ])

    const pendingBookingIdSet = new Set(
      bookings.filter((item) => Number(item.status) === BOOKING_STATUS.PENDING).map((item) => item.schedule_id)
    )
    const storeMap = new Map(stores.map((item) => [item._id, item]))

    const visibleSchedules = schedules
      .filter((item) => Number(item.status) !== SCHEDULE_STATUS.COACH_CANCELLED)
      .filter((item) => !filters.type || mapAssetTypeToPageType(item.class_type) === filters.type)
      .filter((item) => filters.coachId === 'all' || item.coach_id === filters.coachId)
      .filter((item) => !filters.dateKey || formatDateKey(item.start_time) === filters.dateKey)
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

    const dateMap = new Map()
    schedules.forEach((item) => {
      const key = formatDateKey(item.start_time)
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
        id: item._id,
        name: item.real_name,
        title: item.coach_title || '教练',
        specialties: Array.isArray(item.specialties) ? item.specialties : [],
        levelLabel: item.level_label || '',
        bio: item.bio || '',
      })),
      dates: Array.from(dateMap.values()).sort((left, right) => left.key.localeCompare(right.key)),
      schedules: visibleSchedules,
      assets: buildAssetView(assets),
    })
  } catch (error) {
    return buildFail('读取预约大厅失败：' + (error.errMsg || error.message || error), 'BOOKING_VIEW_ERROR')
  }
}

async function getHomeViewData(event) {
  const payload = event.payload || {}
  if (!payload.storeId) {
    return buildFail('storeId 不能为空', 'INVALID_HOME_VIEW_PAYLOAD')
  }

  try {
    const [stores, packages] = await Promise.all([
      listCollection(COLLECTIONS.STORE, { is_deleted: false, status: 1 }),
      listCollection(COLLECTIONS.PACKAGE, { is_deleted: false, status: 1 }),
    ])

    return buildSuccess({
      currentStore: buildStoreView(stores.find((item) => item._id === payload.storeId)),
      stores: stores.map(buildStoreView),
      notices: HOME_NOTICES.slice(),
      galleryList: HOME_GALLERY.slice(),
      packages: packages.map((item) => ({
        id: item._id,
        name: item.name,
        type: mapAssetTypeToPageType(item.asset_type),
        lessons: Number(item.course_count || 0),
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
    return buildFail('userId 不能为空', 'INVALID_PROFILE_VIEW_PAYLOAD')
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
            timeRange: schedule ? formatTimeRange(schedule.start_time, schedule.end_time) : '',
            status: mapBookingStatusToLabel(item.status),
          }
        }),
      trainingStats: {
        monthLessons: writtenOffCount,
        streakDays: writtenOffCount > 0 ? writtenOffCount + 3 : 0,
        nextTarget: writtenOffCount >= 12 ? '本月目标已完成，继续保持训练节奏。' : '本月再完成 ' + Math.max(0, 12 - writtenOffCount) + ' 节课即可达到目标。',
      },
    })
  } catch (error) {
    return buildFail('读取个人中心失败：' + (error.errMsg || error.message || error), 'PROFILE_VIEW_ERROR')
  }
}

async function getWorkspaceViewData(event) {
  const payload = event.payload || {}
  if (!payload.storeId || !payload.coachId) {
    return buildFail('storeId 和 coachId 不能为空', 'INVALID_WORKSPACE_VIEW_PAYLOAD')
  }

  try {
    const [schedules, bookings, storeRes] = await Promise.all([
      listCollection(COLLECTIONS.CLASS_SCHEDULE, { is_deleted: false, store_id: payload.storeId, coach_id: payload.coachId }),
      listCollection(COLLECTIONS.BOOKING, { is_deleted: false }),
      getDocById(COLLECTIONS.STORE, payload.storeId),
    ])
    const currentStore = buildStoreView(storeRes.data)

    const todayClasses = schedules
      .filter((item) => Number(item.status) !== SCHEDULE_STATUS.COACH_CANCELLED)
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
    })
  } catch (error) {
    return buildFail('读取工作台失败：' + (error.errMsg || error.message || error), 'WORKSPACE_VIEW_ERROR')
  }
}

async function getAdminDashboardData(event) {
  const payload = event.payload || {}

  try {
    const [logs, bookings, packages, stores, users] = await Promise.all([
      listCollection(COLLECTIONS.USER_ASSET_LOG, { is_deleted: false }),
      listCollection(COLLECTIONS.BOOKING, { is_deleted: false }),
      listCollection(COLLECTIONS.PACKAGE, { is_deleted: false, status: 1 }),
      listCollection(COLLECTIONS.STORE, { is_deleted: false, status: 1 }),
      listCollection(COLLECTIONS.USER, { is_deleted: false, status: 1 }),
    ])

    const packageMap = new Map(packages.map((item) => [item._id, item]))
    const userMap = new Map(users.map((item) => [item._id, item]))
    let addedPrivateLessons = 0
    let addedGroupLessons = 0
    let incomeAmount = 0

    logs.forEach((item) => {
      if (Number(item.operate_type) !== OPERATE_TYPE.COACH_DISTRIBUTE) {
        return
      }
      const packageInfo = packageMap.get(item.ref_biz_id)
      if (packageInfo) {
        if (Number(packageInfo.asset_type) === ASSET_TYPE.PRIVATE) {
          addedPrivateLessons += Number(item.amount || 0)
        } else {
          addedGroupLessons += Number(item.amount || 0)
        }
      }
      incomeAmount += Number(item.offline_amount || 0)
    })

    return buildSuccess({
      currentStore: buildStoreView(stores.find((item) => item._id === payload.storeId) || stores[0]),
      auditOverview: {
        addedPrivateLessons,
        addedGroupLessons,
        writeOffCount: bookings.filter((item) => Number(item.status) === BOOKING_STATUS.WRITTEN_OFF).length,
        incomeText: '￥' + incomeAmount.toFixed(2),
      },
      auditLogs: logs
        .slice()
        .reverse()
        .slice(0, 20)
        .map((item) => ({
          id: item._id,
          operatorName: userMap.get(item.operator_id)?.real_name || item.operator_id,
          packageName: packageMap.get(item.ref_biz_id)?.name || item.ref_biz_id,
          targetName: userMap.get(item.user_id)?.real_name || item.user_id,
          amount: Number(item.offline_amount || 0),
          payType: item.pay_type || '未记录',
          remark: item.remark || '',
          time: String(item.created_at || '').slice(11, 19) || '--:--:--',
        })),
    })
  } catch (error) {
    return buildFail('读取管理员看板失败：' + (error.errMsg || error.message || error), 'ADMIN_VIEW_ERROR')
  }
}

async function getCoachClassViewData(event) {
  const payload = event.payload || {}
  if (!payload.classId) {
    return buildFail('classId 不能为空', 'INVALID_COACH_CLASS_VIEW_PAYLOAD')
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
      return buildFail('课程不存在', 'CLASS_NOT_FOUND')
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
      })),
    })
  } catch (error) {
    return buildFail('读取课程核销页失败：' + (error.errMsg || error.message || error), 'COACH_CLASS_VIEW_ERROR')
  }
}

async function getCoachScheduleViewData(event) {
  const payload = event.payload || {}
  if (!payload.storeId) {
    return buildFail('storeId 不能为空', 'INVALID_COACH_SCHEDULE_VIEW_PAYLOAD')
  }

  try {
    const [schedules, stores] = await Promise.all([
      listCollection(COLLECTIONS.CLASS_SCHEDULE, { is_deleted: false, store_id: payload.storeId }),
      listCollection(COLLECTIONS.STORE, { is_deleted: false, status: 1 }),
    ])
    const storeMap = new Map(stores.map((item) => [item._id, item]))

    return buildSuccess({
      currentStore: buildStoreView(stores.find((item) => item._id === payload.storeId)),
      stores: stores.map((item) => buildStoreView(item)),
      plans: schedules
        .filter((item) => !payload.coachId || item.coach_id === payload.coachId)
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
          status: Number(item.status) === SCHEDULE_STATUS.COACH_CANCELLED ? '已取消' : '已发布',
        })),
    })
  } catch (error) {
    return buildFail('读取排课管理页失败：' + (error.errMsg || error.message || error), 'COACH_SCHEDULE_VIEW_ERROR')
  }
}

async function getBootstrapData() {
  const result = await ensureBaseCollectionsAndSeeds()
  const wxContext = cloud.getWXContext()
  return buildSuccess({
    envId: wxContext.ENV || cloud.DYNAMIC_CURRENT_ENV,
    collections: COLLECTIONS,
    ...result,
  })
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

    if (!packageRecord.data || packageRecord.data.status !== 1) {
      return buildFail('套餐不存在或已下架', 'PACKAGE_NOT_AVAILABLE')
    }
    if (!userRecord.data || userRecord.data.status !== 1) {
      return buildFail('客户不存在或已禁用', 'USER_NOT_AVAILABLE')
    }
    if (!operatorRecord.data || operatorRecord.data.role < 2) {
      return buildFail('操作人没有派课权限', 'OPERATOR_FORBIDDEN')
    }

    const packageData = packageRecord.data
    const assetDocId = buildAssetDocId(payload.userId, packageData.asset_type)
    const lessonCount = Number(packageData.course_count)

    const transactionResult = await db.runTransaction(async (transaction) => {
      let assetData = null

      try {
        const assetRes = await transaction.collection(COLLECTIONS.USER_ASSET).doc(assetDocId).get()
        assetData = assetRes.data
      } catch (error) {
        assetData = null
      }

      if (!assetData) {
        await transaction.collection(COLLECTIONS.USER_ASSET).add({
          data: {
            _id: assetDocId,
            user_id: payload.userId,
            asset_type: packageData.asset_type,
            balance: lessonCount,
            total_earned: lessonCount,
            created_at: db.serverDate(),
            updated_at: db.serverDate(),
            is_deleted: false,
          },
        })
      } else {
        await transaction.collection(COLLECTIONS.USER_ASSET).doc(assetDocId).update({
          data: {
            balance: _.inc(lessonCount),
            total_earned: _.inc(lessonCount),
            updated_at: db.serverDate(),
          },
        })
      }

      await transaction.collection(COLLECTIONS.USER_ASSET_LOG).add({
        data: {
          user_id: payload.userId,
          operate_type: OPERATE_TYPE.COACH_DISTRIBUTE,
          amount: lessonCount,
          operator_id: payload.operatorId,
          ref_biz_id: payload.packageId,
          remark: payload.remark || ('线下收款 ' + payload.payType + ' ￥' + normalizeAmount(payload.offlineAmount)),
          offline_amount: normalizeAmount(payload.offlineAmount),
          pay_type: payload.payType,
          created_at: db.serverDate(),
          updated_at: db.serverDate(),
          is_deleted: false,
        },
      })

      return {
        assetDocId,
        lessonCount,
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
    return buildFail('userId 和 scheduleId 不能为空', 'INVALID_BOOKING_PAYLOAD')
  }

  try {
    const result = await db.runTransaction(async (transaction) => {
      const scheduleRes = await transaction.collection(COLLECTIONS.CLASS_SCHEDULE).doc(payload.scheduleId).get()
      const scheduleData = scheduleRes.data
      if (!scheduleData) {
        throw new Error('排课不存在')
      }
      if (scheduleData.status !== SCHEDULE_STATUS.OPEN && scheduleData.status !== SCHEDULE_STATUS.FULL) {
        throw new Error('当前课程状态不可预约')
      }
      if (Number(scheduleData.booked_count) >= Number(scheduleData.max_capacity)) {
        throw new Error('课程已满员')
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
        throw new Error('该用户已预约当前课程')
      }

      const assetRes = await transaction.collection(COLLECTIONS.USER_ASSET).doc(assetDocId).get()
      const assetData = assetRes.data
      if (!assetData || Number(assetData.balance) <= 0) {
        throw new Error('可用课时不足')
      }

      const nextBookedCount = Number(scheduleData.booked_count) + 1
      await transaction.collection(COLLECTIONS.USER_ASSET).doc(assetDocId).update({
        data: {
          balance: _.inc(-1),
          updated_at: db.serverDate(),
        },
      })
      await transaction.collection(COLLECTIONS.CLASS_SCHEDULE).doc(payload.scheduleId).update({
        data: {
          booked_count: _.inc(1),
          status: nextBookedCount >= Number(scheduleData.max_capacity) ? SCHEDULE_STATUS.FULL : SCHEDULE_STATUS.OPEN,
          updated_at: db.serverDate(),
        },
      })
      const bookingDocId = payload.clientBookingId || ('booking_' + Date.now())
      await transaction.collection(COLLECTIONS.BOOKING).doc(bookingDocId).set({
        data: {
          schedule_id: payload.scheduleId,
          user_id: payload.userId,
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
          amount: -1,
          operator_id: payload.userId,
          ref_biz_id: payload.scheduleId,
          remark: payload.remark || '预约扣课',
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
  if (!payload.bookingId || !payload.operatorId) {
    return buildFail('bookingId 和 operatorId 不能为空', 'INVALID_CANCEL_PAYLOAD')
  }

  try {
    const bookingRes = await getDocById(COLLECTIONS.BOOKING, payload.bookingId)
    const bookingData = bookingRes.data
    if (!bookingData) {
      return buildFail('预约记录不存在', 'BOOKING_NOT_FOUND')
    }
    if (bookingData.status !== BOOKING_STATUS.PENDING) {
      return buildFail('当前预约状态不可取消', 'BOOKING_STATUS_INVALID')
    }

    const scheduleRes = await getDocById(COLLECTIONS.CLASS_SCHEDULE, bookingData.schedule_id)
    const scheduleData = scheduleRes.data
    if (!scheduleData) {
      return buildFail('关联课程不存在', 'SCHEDULE_NOT_FOUND')
    }

    const assetType = mapClassTypeToAssetType(scheduleData.class_type)
    const assetDocId = buildAssetDocId(bookingData.user_id, assetType)

    const result = await db.runTransaction(async (transaction) => {
      const nextBookedCount = Math.max(0, Number(scheduleData.booked_count) - 1)
      await transaction.collection(COLLECTIONS.BOOKING).doc(payload.bookingId).update({
        data: {
          status: BOOKING_STATUS.CLIENT_CANCELLED,
          updated_at: db.serverDate(),
        },
      })
      await transaction.collection(COLLECTIONS.USER_ASSET).doc(assetDocId).update({
        data: {
          balance: _.inc(1),
          updated_at: db.serverDate(),
        },
      })
      await transaction.collection(COLLECTIONS.CLASS_SCHEDULE).doc(bookingData.schedule_id).update({
        data: {
          booked_count: nextBookedCount,
          status: SCHEDULE_STATUS.OPEN,
          updated_at: db.serverDate(),
        },
      })
      await transaction.collection(COLLECTIONS.USER_ASSET_LOG).add({
        data: {
          user_id: bookingData.user_id,
          operate_type: OPERATE_TYPE.CLIENT_CANCEL,
          amount: 1,
          operator_id: payload.operatorId,
          ref_biz_id: bookingData.schedule_id,
          remark: payload.remark || '客户取消预约退课',
          created_at: db.serverDate(),
          updated_at: db.serverDate(),
          is_deleted: false,
        },
      })

      return {
        assetDocId,
        nextBookedCount,
      }
    })

    return buildSuccess({
      message: '取消成功',
      ...result,
    })
  } catch (error) {
    return buildFail('取消失败：' + (error.errMsg || error.message || error), 'CANCEL_BOOKING_ERROR')
  }
}

async function writeOffBooking(event) {
  const payload = event.payload || {}
  if (!payload.bookingId || !payload.operatorId) {
    return buildFail('bookingId 和 operatorId 不能为空', 'INVALID_WRITEOFF_PAYLOAD')
  }

  const targetStatus = Number(payload.status || BOOKING_STATUS.WRITTEN_OFF)
  if (![BOOKING_STATUS.WRITTEN_OFF, BOOKING_STATUS.ABSENT].includes(targetStatus)) {
    return buildFail('status 仅支持已核销或缺席', 'WRITEOFF_STATUS_INVALID')
  }

  try {
    const bookingRes = await getDocById(COLLECTIONS.BOOKING, payload.bookingId)
    const bookingData = bookingRes.data
    if (!bookingData) {
      return buildFail('预约记录不存在', 'BOOKING_NOT_FOUND')
    }
    if (bookingData.status !== BOOKING_STATUS.PENDING) {
      return buildFail('当前预约状态不可核销', 'BOOKING_STATUS_INVALID')
    }

    await db.runTransaction(async (transaction) => {
      await transaction.collection(COLLECTIONS.BOOKING).doc(payload.bookingId).update({
        data: {
          status: targetStatus,
          writeoff_time: db.serverDate(),
          updated_at: db.serverDate(),
        },
      })
    })

    return buildSuccess({
      message: targetStatus === BOOKING_STATUS.WRITTEN_OFF ? '核销成功' : '缺席已记录',
      bookingId: payload.bookingId,
      status: targetStatus,
    })
  } catch (error) {
    return buildFail('核销失败：' + (error.errMsg || error.message || error), 'WRITEOFF_BOOKING_ERROR')
  }
}

async function createCoachSchedule(event) {
  const payload = event.payload || {}
  if (!payload.storeId || !payload.coachId || !payload.title || !payload.startTime || !payload.endTime) {
    return buildFail('storeId、coachId、title、startTime、endTime 不能为空', 'INVALID_SCHEDULE_PAYLOAD')
  }

  try {
    const classType = mapClassTypeToAssetType(payload.classType)
    const storeRecord = await getDocById(COLLECTIONS.STORE, payload.storeId)
    const storeData = storeRecord.data
    if (!storeData || storeData.status !== 1 || storeData.is_deleted) {
      return buildFail('门店不存在或不可用', 'STORE_NOT_AVAILABLE')
    }

    const storeName = payload.storeName || storeData.name
    const maxCapacity = Number(payload.maxCapacity || (classType === ASSET_TYPE.PRIVATE ? 1 : 15))
    const addRes = await db.collection(COLLECTIONS.CLASS_SCHEDULE).add({
      data: {
        store_id: payload.storeId,
        store_name: storeName,
        coach_id: payload.coachId,
        class_type: classType,
        title: payload.title,
        start_time: payload.startTime,
        end_time: payload.endTime,
        max_capacity: maxCapacity,
        booked_count: 0,
        status: SCHEDULE_STATUS.OPEN,
        venue: storeName,
        week_day: Number(payload.weekDay || 0),
        repeat_weekly: Boolean(payload.repeatWeekly),
        created_at: db.serverDate(),
        updated_at: db.serverDate(),
        is_deleted: false,
      },
    })

    return buildSuccess({
      message: '排课创建成功',
      scheduleId: addRes._id,
    })
  } catch (error) {
    return buildFail('排课创建失败：' + (error.errMsg || error.message || error), 'CREATE_SCHEDULE_ERROR')
  }
}

exports.main = async (event) => {
  switch (event.action) {
    case 'bootstrap':
      return getBootstrapData()
    case 'getHomeViewData':
      return getHomeViewData(event)
    case 'getBookingViewData':
      return getBookingViewData(event)
    case 'getProfileViewData':
      return getProfileViewData(event)
    case 'getWorkspaceViewData':
      return getWorkspaceViewData(event)
    case 'getAdminDashboardData':
      return getAdminDashboardData(event)
    case 'getCoachClassViewData':
      return getCoachClassViewData(event)
    case 'getCoachScheduleViewData':
      return getCoachScheduleViewData(event)
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
