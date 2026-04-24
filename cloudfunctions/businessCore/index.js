const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
})

const db = cloud.database()
const _ = db.command

const COLLECTIONS = {
  USER: 'sys_user',
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

const storeSeeds = [
  {
    _id: 'store_gaoxin',
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
    _id: 'store_jingkai',
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
    _id: 'user_client_1001',
    openid: 'demo_openid_client_1001',
    phone: '13800001234',
    real_name: '王小明',
    avatar_url: '',
    role: 1,
    home_store_id: 'store_gaoxin',
    status: 1,
    created_at: db.serverDate(),
    updated_at: db.serverDate(),
    is_deleted: false,
  },
  {
    _id: 'user_client_1002',
    openid: 'demo_openid_client_1002',
    phone: '13800004567',
    real_name: '张三',
    avatar_url: '',
    role: 1,
    home_store_id: 'store_gaoxin',
    status: 1,
    created_at: db.serverDate(),
    updated_at: db.serverDate(),
    is_deleted: false,
  },
  {
    _id: 'user_coach_2001',
    openid: 'demo_openid_coach_2001',
    phone: '13900001234',
    real_name: '李教练',
    avatar_url: '',
    role: 2,
    home_store_id: 'store_gaoxin',
    status: 1,
    created_at: db.serverDate(),
    updated_at: db.serverDate(),
    is_deleted: false,
  },
  {
    _id: 'user_admin_3001',
    openid: 'demo_openid_admin_3001',
    phone: '13700001234',
    real_name: '管理员',
    avatar_url: '',
    role: 3,
    home_store_id: 'store_gaoxin',
    status: 1,
    created_at: db.serverDate(),
    updated_at: db.serverDate(),
    is_deleted: false,
  },
]

const userAssetSeeds = [
  {
    _id: buildAssetDocId('user_client_1001', ASSET_TYPE.PRIVATE),
    user_id: 'user_client_1001',
    asset_type: ASSET_TYPE.PRIVATE,
    balance: 12,
    total_earned: 12,
    created_at: db.serverDate(),
    updated_at: db.serverDate(),
    is_deleted: false,
  },
  {
    _id: buildAssetDocId('user_client_1001', ASSET_TYPE.GROUP),
    user_id: 'user_client_1001',
    asset_type: ASSET_TYPE.GROUP,
    balance: 5,
    total_earned: 5,
    created_at: db.serverDate(),
    updated_at: db.serverDate(),
    is_deleted: false,
  },
  {
    _id: buildAssetDocId('user_client_1002', ASSET_TYPE.PRIVATE),
    user_id: 'user_client_1002',
    asset_type: ASSET_TYPE.PRIVATE,
    balance: 6,
    total_earned: 6,
    created_at: db.serverDate(),
    updated_at: db.serverDate(),
    is_deleted: false,
  },
  {
    _id: buildAssetDocId('user_client_1002', ASSET_TYPE.GROUP),
    user_id: 'user_client_1002',
    asset_type: ASSET_TYPE.GROUP,
    balance: 10,
    total_earned: 10,
    created_at: db.serverDate(),
    updated_at: db.serverDate(),
    is_deleted: false,
  },
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
    return { collectionName, created: true }
  } catch (error) {
    const message = String(error && error.errMsg ? error.errMsg : error)
    if (message.includes('already exists')) {
      return { collectionName, created: false }
    }
    throw error
  }
}

async function seedCollectionIfEmpty(collectionName, docs) {
  const countResult = await db.collection(collectionName).count()
  if (countResult.total > 0 || !docs.length) {
    return { collectionName, seeded: false, total: countResult.total }
  }

  for (const doc of docs) {
    await db.collection(collectionName).add({ data: doc })
  }

  return { collectionName, seeded: true, total: docs.length }
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

  return {
    createResults,
    seedResults,
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

async function getBootstrapData() {
  const result = await ensureBaseCollectionsAndSeeds()
  return buildSuccess({
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
      await transaction.collection(COLLECTIONS.BOOKING).add({
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
    const maxCapacity = Number(payload.maxCapacity || (classType === ASSET_TYPE.PRIVATE ? 1 : 15))
    const addRes = await db.collection(COLLECTIONS.CLASS_SCHEDULE).add({
      data: {
        store_id: payload.storeId,
        coach_id: payload.coachId,
        class_type: classType,
        title: payload.title,
        start_time: payload.startTime,
        end_time: payload.endTime,
        max_capacity: maxCapacity,
        booked_count: 0,
        status: SCHEDULE_STATUS.OPEN,
        venue: payload.venue || '',
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
