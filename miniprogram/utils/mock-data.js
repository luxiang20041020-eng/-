const ROLE_LIST = [
  { value: 'client', label: '客户', level: 1 },
  { value: 'coach', label: '场馆人员', level: 2 },
  { value: 'admin', label: '管理员', level: 3 },
]

const STORE_LIST = [
  {
    id: 'gaoxin',
    name: '高新旗舰店',
    address: '高新区唐延路 88 号',
    phone: '029-88886666',
    notice: '周三晚 19:00 泰拳基础满员较快，建议提前一天预约。',
  },
  {
    id: 'jingkai',
    name: '经开实战店',
    address: '经开区凤城八路 18 号',
    phone: '029-66668888',
    notice: '本周新增周日自由搏击公开课，适合零基础体验。',
  },
]

const ROLE_USER_MAP = {
  client: {
    id: 'u_1001',
    nickname: '王小明',
    phone: '13800001234',
    levelText: '综合格斗会员',
    homeStoreId: 'gaoxin',
  },
  coach: {
    id: 'coach_li',
    nickname: '李馆员',
    phone: '13900001234',
    levelText: '场馆服务人员',
    homeStoreId: 'gaoxin',
  },
  admin: {
    id: 'admin_001',
    nickname: '陈店长',
    phone: '13700001234',
    levelText: '门店运营管理员',
    homeStoreId: 'gaoxin',
  },
}

const USER_PROFILE = ROLE_USER_MAP.client

const MEMBER_LIST = [
  {
    id: 'u_1001',
    nickname: '王小明',
    phone: '13800001234',
    privateCount: 12,
    groupCount: 5,
    privateExpiry: '2027-04-24',
    groupExpiry: '2026-10-24',
  },
  {
    id: 'u_1002',
    nickname: '张三',
    phone: '13800004567',
    privateCount: 6,
    groupCount: 10,
    privateExpiry: '2026-12-31',
    groupExpiry: '2026-10-25',
  },
  {
    id: 'u_1003',
    nickname: '李四',
    phone: '13800007890',
    privateCount: 0,
    groupCount: 8,
    privateExpiry: '',
    groupExpiry: '2026-09-01',
  },
  {
    id: 'u_1004',
    nickname: '赵六',
    phone: '13911112222',
    privateCount: 2,
    groupCount: 1,
    privateExpiry: '2026-07-20',
    groupExpiry: '2026-08-15',
  },
]

const ASSET_PACKAGE_OPTIONS = [
  {
    id: 'pkg_private_30',
    name: '30 次专属权益',
    type: 'private',
    lessons: 30,
    price: 6000,
    validDays: 365,
    payTypes: ['微信转账', '支付宝', '前台 POS', '现金', '赠课'],
  },
  {
    id: 'pkg_private_trial',
    name: '新人体验权益',
    type: 'private',
    lessons: 1,
    price: 99,
    validDays: 30,
    payTypes: ['微信转账', '支付宝', '前台 POS', '现金', '赠课'],
  },
  {
    id: 'pkg_group_half_year',
    name: '半年团体权益',
    type: 'group',
    lessons: 48,
    price: 2999,
    validDays: 180,
    payTypes: ['微信转账', '支付宝', '前台 POS', '现金', '赠课'],
  },
]

const BANNERS = [
  '暑期燃脂计划开启',
  '五一假期营业时间调整：高新店 9:00-21:00，经开店 10:00-20:00。',
  '新手友好体验时段持续开放，首次到店可申请动作评估。',
]

const PRICE_PACKAGES = [
  { id: 'pkg_trial', name: '新人体验权益', type: 'private', lessons: 1, price: 99 },
  { id: 'pkg_group_half_year', name: '泰拳基础团体权益', type: 'group', lessons: 48, price: 2999 },
  { id: 'pkg_private_30', name: '进阶一对一专属权益', type: 'private', lessons: 30, price: 6000 },
]

const GALLERY_LIST = [
  '拳台区 / 标准赛台 / 录像回放',
  '力量区 / 壶铃雪橇 / 体能区',
  '沙袋区 / 实战靶区 / 专属区域',
]

const COACH_LIST = [
  { id: 'coach_li', name: '李馆员', title: '场馆服务顾问', specialties: ['步法区', '膝法区', '燃脂'], levelLabel: '资深' },
  { id: 'coach_wang', name: '王馆员', title: '场馆协调员', specialties: ['拳法区', '实战区', '对练'], levelLabel: '资深' },
  { id: 'coach_zhao', name: '赵馆员', title: '体能区顾问', specialties: ['减脂', '专属', '体能'], levelLabel: '核心' },
]

const BOOKING_DATES = [
  { key: '04-24', label: '04/24 今日' },
  { key: '04-25', label: '04/25 周五' },
  { key: '04-26', label: '04/26 周六' },
  { key: '04-27', label: '04/27 周日' },
]

const SCHEDULE_LIST = [
  {
    id: 'class_001',
    storeId: 'gaoxin',
    dateKey: '04-24',
    dateLabel: '04/24 今日',
    timeRange: '19:00 - 20:30',
    title: '泰拳基础发力小班场',
    type: 'group',
    coachId: 'coach_li',
    coachName: '李馆员',
    venue: '高新旗舰店',
    capacity: 15,
    bookedCount: 12,
    status: '可预约',
  },
  {
    id: 'class_002',
    storeId: 'gaoxin',
    dateKey: '04-24',
    dateLabel: '04/24 今日',
    timeRange: '20:30 - 21:30',
    title: '拳腿衔接专属时段',
    type: 'private',
    coachId: 'coach_wang',
    coachName: '王馆员',
    venue: '高新旗舰店',
    capacity: 1,
    bookedCount: 0,
    status: '可预约',
  },
  {
    id: 'class_003',
    storeId: 'gaoxin',
    dateKey: '04-25',
    dateLabel: '04/25 周五',
    timeRange: '19:30 - 21:00',
    title: '自由搏击进阶对练',
    type: 'group',
    coachId: 'coach_zhao',
    coachName: '赵馆员',
    venue: '高新旗舰店',
    capacity: 18,
    bookedCount: 9,
    status: '可预约',
  },
  {
    id: 'class_004',
    storeId: 'jingkai',
    dateKey: '04-24',
    dateLabel: '04/24 今日',
    timeRange: '18:30 - 19:30',
    title: '零基础体验时段',
    type: 'group',
    coachId: 'coach_li',
    coachName: '李馆员',
    venue: '经开实战店',
    capacity: 12,
    bookedCount: 5,
    status: '可预约',
  },
  {
    id: 'class_005',
    storeId: 'jingkai',
    dateKey: '04-26',
    dateLabel: '04/26 周六',
    timeRange: '10:00 - 11:00',
    title: '专属减脂时段',
    type: 'private',
    coachId: 'coach_zhao',
    coachName: '赵馆员',
    venue: '经开实战店',
    capacity: 1,
    bookedCount: 0,
    status: '可预约',
  },
]

const MY_BOOKINGS = [
  {
    id: 'booking_001',
    scheduleId: 'class_001',
    userId: 'u_1001',
    userName: '王小明',
    title: '泰拳基础发力小班场',
    type: 'group',
    dateLabel: '04/24 今日',
    timeRange: '19:00 - 20:30',
    status: '待到店',
  },
  {
    id: 'booking_002',
    scheduleId: 'class_003',
    userId: 'u_1001',
    userName: '王小明',
    title: '自由搏击进阶对练',
    type: 'group',
    dateLabel: '04/18 已结束',
    timeRange: '19:30 - 21:00',
    status: '已完成',
  },
]

const CLASS_ROSTER_MAP = {
  class_001: [
    {
      bookingId: 'booking_001',
      userId: 'u_1001',
      userName: '王小明',
      phone: '13800001234',
      status: '待核销',
    },
    {
      bookingId: 'booking_101',
      userId: 'u_1002',
      userName: '张三',
      phone: '13800004567',
      status: '已核销',
    },
    {
      bookingId: 'booking_102',
      userId: 'u_1003',
      userName: '李四',
      phone: '13800007890',
      status: '待核销',
    },
  ],
  class_002: [
    {
      bookingId: 'booking_201',
      userId: 'u_1004',
      userName: '赵六',
      phone: '13911112222',
      status: '待核销',
    },
  ],
}

const COACH_SCHEDULE_BOARD = [
  {
    id: 'plan_001',
    storeId: 'gaoxin',
    storeName: '高新旗舰店',
    weekLabel: '本周四',
    dateLabel: '04/24',
    timeRange: '19:00 - 20:30',
    title: '泰拳基础发力小班场',
    type: 'group',
    venue: '高新旗舰店',
    status: '已发布',
  },
  {
    id: 'plan_002',
    storeId: 'gaoxin',
    storeName: '高新旗舰店',
    weekLabel: '本周四',
    dateLabel: '04/24',
    timeRange: '20:30 - 21:30',
    title: '拳腿衔接专属时段',
    type: 'private',
    venue: '高新旗舰店',
    status: '已发布',
  },
]

const INITIAL_ASSETS = {
  privateCount: 12,
  groupCount: 5,
  privateExpiry: '2027-04-24',
  groupExpiry: '2026-10-24',
}

const TODAY_CLASSES = [
  {
    id: 'class_001',
    title: '泰拳基础发力小班场',
    timeRange: '19:00 - 20:30',
    bookedCount: 12,
    capacity: 15,
    venue: '高新旗舰店',
  },
  {
    id: 'class_002',
    title: '拳腿衔接专属时段',
    timeRange: '20:30 - 21:30',
    bookedCount: 1,
    capacity: 1,
    venue: '高新旗舰店',
  },
]

const COACH_QUICK_ACTIONS = [
  { id: 'distribute', title: '权益派发', desc: '线下收款后给学员加权益，并形成审计流水。' },
  { id: 'class', title: '到场核销', desc: '进入单节名单，扫码或手动核销到场学员。' },
  { id: 'schedule', title: '排期管理', desc: '管理近期排期并临时新增场次计划。' },
]

const AUDIT_OVERVIEW = {
  addedPrivateLessons: 60,
  addedGroupLessons: 100,
  writeOffCount: 105,
  incomeAmount: 12000,
}

const AUDIT_LOGS = [
  {
    id: 'log_001',
    operatorName: '李馆员',
    packageName: '30 次专属权益',
    targetName: '王小明',
    amount: 6000,
    payType: '微信转账',
    remark: '续费，已转财务',
    time: '10:30:12',
  },
  {
    id: 'log_002',
    operatorName: '王馆员',
    packageName: '新人体验权益 1 次',
    targetName: '赵六',
    amount: 99,
    payType: '前台 POS',
    remark: '大众点评引流体验',
    time: '14:15:00',
  },
]

const TRAINING_STATS = {
  monthLessons: 8,
  streakDays: 11,
  nextTarget: '本月再完成 4 次预约即可解锁进阶体验。',
}

module.exports = {
  ROLE_LIST,
  STORE_LIST,
  ROLE_USER_MAP,
  USER_PROFILE,
  MEMBER_LIST,
  ASSET_PACKAGE_OPTIONS,
  BANNERS,
  PRICE_PACKAGES,
  GALLERY_LIST,
  COACH_LIST,
  BOOKING_DATES,
  SCHEDULE_LIST,
  MY_BOOKINGS,
  CLASS_ROSTER_MAP,
  COACH_SCHEDULE_BOARD,
  INITIAL_ASSETS,
  TODAY_CLASSES,
  COACH_QUICK_ACTIONS,
  AUDIT_OVERVIEW,
  AUDIT_LOGS,
  TRAINING_STATS,
}
