// 静态导航和首次加载的门店展示配置；课时、预约、用户和流水均来自云端。
module.exports = {
  "ROLE_LIST": [
    {
      "value": "client",
      "label": "客户",
      "level": 1
    },
    {
      "value": "coach",
      "label": "场馆人员",
      "level": 2
    },
    {
      "value": "admin",
      "label": "管理员",
      "level": 3
    }
  ],
  "STORE_LIST": [
    {
      "id": "gaoxin",
      "name": "高新旗舰店",
      "address": "高新区唐延路 88 号",
      "phone": "029-88886666",
      "notice": "周三晚 19:00 泰拳基础满员较快，建议提前一天预约。"
    },
    {
      "id": "jingkai",
      "name": "经开实战店",
      "address": "经开区凤城八路 18 号",
      "phone": "029-66668888",
      "notice": "本周新增周日自由搏击公开课，适合零基础体验。"
    }
  ],
  "GALLERY_LIST": [
    "拳台区 / 标准赛台 / 录像回放",
    "力量区 / 壶铃雪橇 / 体能区",
    "沙袋区 / 实战靶区 / 专属区域"
  ],
  "COACH_QUICK_ACTIONS": [
    {
      "id": "distribute",
      "title": "权益派发",
      "desc": "线下收款后给学员加权益，并形成审计流水。"
    },
    {
      "id": "class",
      "title": "到场核销",
      "desc": "确认学员到场与缺席。"
    },
    {
      "id": "schedule",
      "title": "排期管理",
      "desc": "管理近期排期并临时新增场次计划。"
    }
  ]
}
