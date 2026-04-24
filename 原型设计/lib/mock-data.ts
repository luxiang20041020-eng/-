// 🥊 泰拳搏击馆 · 前端 Demo 静态 Mock 数据
// 所有数据仅用于前端原型展示，真实项目请对接 /api/* 接口。

export type Role = 1 | 2 | 3 // 1-客户 2-教练 3-管理员

export interface Store {
  id: number
  name: string
  address: string
  distance?: string
}

export interface Banner {
  id: number
  title: string
  subtitle: string
  tag: string
}

export interface Package {
  id: number
  name: string
  assetType: 1 | 2 // 1-团课 2-私教
  courseCount: number
  displayPrice: number
  status: 1 | 0
  highlight?: boolean
}

export interface Schedule {
  id: number
  storeId: number
  coachName: string
  coachAvatar?: string
  classType: 1 | 2
  title: string
  startTime: string // HH:mm
  endTime: string
  maxCapacity: number
  bookedCount: number
  status: 1 | 2 | 3 // 1-可约 2-已满 3-已结束
  room: string
  date: string // YYYY-MM-DD
  level?: "入门" | "进阶" | "实战"
}

export interface Booking {
  id: number
  userId: number
  userName: string
  userPhone: string
  scheduleId: number
  status: 1 | 2 | 3 | 4 | 5 // 1-待核销 2-已核销 3-客户取消 4-教练取消 5-缺席
}

export interface AuditLog {
  id: number
  createdAt: string
  coachName: string
  clientName: string
  packageName: string
  courseCount: number
  offlineAmount: number
  payMethod: string
  remark: string
}

export const STORES: Store[] = [
  { id: 1, name: "高新旗舰店", address: "成都高新区天府三街 101 号", distance: "0.8km" },
  { id: 2, name: "经开万象店", address: "成都经开区万象城 B 座 3F", distance: "5.2km" },
  { id: 3, name: "江北训练馆", address: "重庆江北区嘉陵江路 66 号", distance: "—" },
]

export const BANNERS: Banner[] = [
  {
    id: 1,
    title: "2025 铁拳争霸赛 · 报名开启",
    subtitle: "3 级别·8 强淘汰·奖金 10,000￥",
    tag: "EVENT",
  },
  {
    id: 2,
    title: "国庆集训 · 每日加训 2 小时",
    subtitle: "10/01 - 10/07 · 限额 30 名",
    tag: "NOTICE",
  },
]

export const PACKAGES: Package[] = [
  { id: 1, name: "新人体验 · 1 节私教", assetType: 2, courseCount: 1, displayPrice: 9.9, status: 1, highlight: true },
  { id: 2, name: "泰拳基础大班卡 · 半年不限次", assetType: 1, courseCount: 180, displayPrice: 2999, status: 1 },
  { id: 3, name: "团课次卡 · 30 节", assetType: 1, courseCount: 30, displayPrice: 1680, status: 1 },
  { id: 4, name: "进阶一对一私教 · 30 节", assetType: 2, courseCount: 30, displayPrice: 6000, status: 1, highlight: true },
  { id: 5, name: "实战特训一对一 · 50 节", assetType: 2, courseCount: 50, displayPrice: 9800, status: 1 },
]

const today = new Date()
const fmt = (d: Date) => d.toISOString().slice(0, 10)

function mkDate(offset: number) {
  const d = new Date(today)
  d.setDate(d.getDate() + offset)
  return fmt(d)
}

export const SCHEDULES: Schedule[] = [
  {
    id: 501,
    storeId: 1,
    coachName: "李 · ARTHIT",
    classType: 1,
    title: "泰拳基础 · 发力小班",
    startTime: "10:00",
    endTime: "11:30",
    maxCapacity: 15,
    bookedCount: 8,
    status: 1,
    room: "A 馆",
    date: mkDate(0),
    level: "入门",
  },
  {
    id: 502,
    storeId: 1,
    coachName: "王 · SAMART",
    classType: 1,
    title: "泰拳实战模拟",
    startTime: "19:00",
    endTime: "20:30",
    maxCapacity: 15,
    bookedCount: 15,
    status: 2,
    room: "B 馆",
    date: mkDate(0),
    level: "实战",
  },
  {
    id: 503,
    storeId: 1,
    coachName: "李 · ARTHIT",
    classType: 2,
    title: "一对一私教",
    startTime: "20:30",
    endTime: "21:30",
    maxCapacity: 1,
    bookedCount: 0,
    status: 1,
    room: "私教区 03",
    date: mkDate(0),
  },
  {
    id: 504,
    storeId: 1,
    coachName: "陈 · YODSANKLAI",
    classType: 1,
    title: "踢腿专项课",
    startTime: "07:00",
    endTime: "08:00",
    maxCapacity: 12,
    bookedCount: 6,
    status: 1,
    room: "A 馆",
    date: mkDate(1),
    level: "进阶",
  },
  {
    id: 505,
    storeId: 1,
    coachName: "李 · ARTHIT",
    classType: 1,
    title: "泰拳基础 · 发力小班",
    startTime: "19:00",
    endTime: "20:30",
    maxCapacity: 15,
    bookedCount: 11,
    status: 1,
    room: "A 馆",
    date: mkDate(1),
    level: "入门",
  },
  {
    id: 506,
    storeId: 1,
    coachName: "王 · SAMART",
    classType: 2,
    title: "一对一私教",
    startTime: "14:00",
    endTime: "15:00",
    maxCapacity: 1,
    bookedCount: 1,
    status: 2,
    room: "私教区 01",
    date: mkDate(2),
  },
]

export const TODAY_BOOKINGS: Booking[] = [
  { id: 8001, userId: 1001, userName: "张 · 三", userPhone: "138****1234", scheduleId: 501, status: 2 },
  { id: 8002, userId: 1002, userName: "李 · 四", userPhone: "139****5678", scheduleId: 501, status: 1 },
  { id: 8003, userId: 1003, userName: "王 · 五", userPhone: "137****9988", scheduleId: 501, status: 1 },
  { id: 8004, userId: 1004, userName: "赵 · 六", userPhone: "135****1122", scheduleId: 501, status: 1 },
  { id: 8005, userId: 1005, userName: "孙 · 七", userPhone: "133****3344", scheduleId: 501, status: 2 },
  { id: 8006, userId: 1006, userName: "周 · 八", userPhone: "186****5566", scheduleId: 501, status: 5 },
  { id: 8007, userId: 1007, userName: "吴 · 九", userPhone: "150****7788", scheduleId: 501, status: 1 },
  { id: 8008, userId: 1008, userName: "郑 · 十", userPhone: "189****2233", scheduleId: 501, status: 1 },
]

export const AUDIT_LOGS: AuditLog[] = [
  {
    id: 9901,
    createdAt: "2025-10-25 10:30:12",
    coachName: "李 · ARTHIT",
    clientName: "王 · 小明",
    packageName: "30 节私教卡",
    courseCount: 30,
    offlineAmount: 6000,
    payMethod: "微信转账",
    remark: "续费，已转财务",
  },
  {
    id: 9902,
    createdAt: "2025-10-25 11:05:44",
    coachName: "王 · SAMART",
    clientName: "赵 · 六",
    packageName: "新人体验课 1 节",
    courseCount: 1,
    offlineAmount: 9.9,
    payMethod: "POS 机",
    remark: "大众点评引流体验",
  },
  {
    id: 9903,
    createdAt: "2025-10-25 14:15:00",
    coachName: "王 · SAMART",
    clientName: "张 · 三",
    packageName: "半年团课卡",
    courseCount: 180,
    offlineAmount: 2999,
    payMethod: "支付宝",
    remark: "—",
  },
  {
    id: 9904,
    createdAt: "2025-10-25 16:42:30",
    coachName: "陈 · YODSANKLAI",
    clientName: "孙 · 七",
    packageName: "30 节团课次卡",
    courseCount: 30,
    offlineAmount: 1680,
    payMethod: "微信转账",
    remark: "老带新 · 赠 2 节",
  },
  {
    id: 9905,
    createdAt: "2025-10-25 18:10:09",
    coachName: "李 · ARTHIT",
    clientName: "周 · 八",
    packageName: "50 节实战特训",
    courseCount: 50,
    offlineAmount: 9800,
    payMethod: "微信转账",
    remark: "已交财务 · 已开收据",
  },
]

export const MY_BOOKINGS = [
  {
    id: 7001,
    title: "泰拳基础 · 发力小班",
    coachName: "李 · ARTHIT",
    date: mkDate(0),
    startTime: "10:00",
    endTime: "11:30",
    storeName: "高新旗舰店",
    room: "A 馆",
    status: 1, // 待上课
  },
  {
    id: 7002,
    title: "一对一私教",
    coachName: "王 · SAMART",
    date: mkDate(-2),
    startTime: "19:00",
    endTime: "20:00",
    storeName: "高新旗舰店",
    room: "私教区 01",
    status: 2, // 已完成
  },
  {
    id: 7003,
    title: "泰拳实战模拟",
    coachName: "陈 · YODSANKLAI",
    date: mkDate(-5),
    startTime: "19:00",
    endTime: "20:30",
    storeName: "高新旗舰店",
    room: "B 馆",
    status: 5, // 缺席
  },
]
