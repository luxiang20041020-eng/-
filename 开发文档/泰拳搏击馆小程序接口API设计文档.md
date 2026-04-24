# **🥊 泰拳搏击馆小程序：接口 (API) 详细设计文档**

本文档定义了泰拳搏击馆小程序前后端交互的 API 规范。所有接口设计均基于“线下交易、线上派课核销”的特殊业务闭环。

## **零、 全局接口规范**

### **1\. 基础路径与协议**

* **Base URL**: https://api.yourdomain.com/v1  
* **通信协议**: HTTPS  
* **请求数据格式**: application/json  
* **鉴权方式**: HTTP Header 携带 Token。  
  * Authorization: Bearer \<Your\_Token\>

### **2\. 标准响应格式 (JSON)**

所有接口无论成功或失败，均返回统一的 JSON 结构：

{  
  "code": 200,         // 业务状态码：200-成功，400-参数错误，401-未登录，403-无权限，500-服务器错误  
  "msg": "操作成功",    // 提示信息（可直接用于前端 Toast 提示）  
  "data": { ... }      // 具体的响应数据，可能是对象或数组；失败时可为 null  
}

## **一、 鉴权与公共基础模块 (Auth & Common)**

### **1.1 微信授权登录**

* **路径**: POST /api/auth/login  
* **权限**: 公开  
* **描述**: 前端调用 wx.login() 获取 code，传给后端换取 Token 和用户信息。  
* **请求参数**:  
  { "wx\_code": "0e1Ooxxx..." }

* **响应数据 (data)**:  
  {  
    "token": "eyJhbGciOiJIUzI1NiIs...",  
    "user\_info": {  
      "id": 1001,  
      "role": 1, // 1-客户 2-教练 3-管理员  
      "real\_name": "张三",  
      "phone": "13800000000",  
      "home\_store\_id": 1  
    }  
  }

### **1.2 获取门店列表**

* **路径**: GET /api/common/stores  
* **描述**: 供用户在首页切换门店使用。

### **1.3 获取课程套餐列表 (价格公示)**

* **路径**: GET /api/common/packages  
* **描述**: 返回后台上架的套餐列表，供首页展示及教练发课时选择。

## **二、 客户核心流程 (Client UI)**

### **2.1 获取排课大厅列表**

* **路径**: GET /api/client/schedules  
* **权限**: 客户 (Role \>= 1\)  
* **请求参数 (Query)**:  
  * store\_id: 门店ID (必填)  
  * date: 日期 (格式 YYYY-MM-DD，必填)  
  * class\_type: 课程类型 (1-团课, 2-私教，可选)  
  * coach\_id: 教练ID (可选)  
* **响应数据 (data)**:  
  \[  
    {  
      "schedule\_id": 501,  
      "title": "泰拳基础入门",  
      "coach\_name": "李教练",  
      "start\_time": "19:00",  
      "end\_time": "20:30",  
      "max\_capacity": 15,  
      "booked\_count": 14,  
      "status": 1 // 1-可约，2-已满，3-已结束  
    }  
  \]

### **2.2 客户预约课程 (核心高并发接口)**

* **路径**: POST /api/client/booking/create  
* **描述**: 扣减对应资产并生成预约记录。  
* **⚠️ 开发注意**: 必须开启数据库事务，并使用乐观锁（如 UPDATE user\_asset SET balance \= balance \- 1 WHERE user\_id \= ? AND balance \>= 1）防止超卖/课时扣成负数。  
* **请求参数**:  
  { "schedule\_id": 501 }

### **2.3 客户取消预约**

* **路径**: POST /api/client/booking/cancel  
* **描述**: 客户主动取消预约，退还课时。  
* **⚠️ 开发注意**: 必须校验当前时间距离 start\_time 是否大于规定的“最晚取消时间”（如 2小时）。若超时则拒绝取消。  
* **请求参数**:  
  { "booking\_id": 8011 }

### **2.4 获取客户动态身份码**

* **路径**: GET /api/client/qrcode  
* **描述**: 生成用于教练核销/扫码发课的动态二维码字符串。  
* **响应数据 (data)**:  
  {   
    "qr\_token": "qr\_usr\_1001\_1698765432",   
    "expires\_in": 60 // 60秒后前端需重新请求刷新  
  }

### **2.5 获取我的课时资产**

* **路径**: GET /api/client/assets  
* **响应数据 (data)**:  
  {  
    "group\_class\_balance": 12, // 剩余团课  
    "private\_class\_balance": 5 // 剩余私教  
  }

## **三、 教练工作台模块 (Coach Workspace)**

### **3.1 搜索/解析客户 (发课前置)**

* **路径**: POST /api/coach/users/search  
* **权限**: 教练及以上 (Role \>= 2\)  
* **请求参数** (二选一):  
  {  
    "qr\_token": "qr\_usr\_1001\_1698765432", // 如果是扫码  
    "phone": "13800000000"                // 如果是输入手机号  
  }

* **响应数据**: 返回该客户的基本信息和当前剩余课时。

### **3.2 课时派发 (代充值 \- 财务核心接口)**

* **路径**: POST /api/coach/asset/distribute  
* **权限**: 教练及以上 (Role \>= 2\)  
* **描述**: 线下收款后，教练手动给客户加课。必须记录详细的线下收款信息以备审计。  
* **⚠️ 开发注意**: 需使用 Redis 分布式锁（锁 user\_id），防止教练网卡时狂点导致重复发课。  
* **请求参数**:  
  {  
    "target\_user\_id": 1001,  
    "package\_id": 3,               // 选择的套餐ID  
    "offline\_amount": 6000.00,     // 线下实际收款金额  
    "pay\_method": "Wechat\_Transfer", // 收款方式：Wechat\_Transfer / Alipay / POS / Cash  
    "remark": "张三买半年卡，微信转给财务了"  
  }

### **3.3 核销客户课程 (Write-off)**

* **路径**: POST /api/coach/booking/writeoff  
* **描述**: 教练确认客户到场，将预约状态改为“已核销”。  
* **请求参数** (支持两种模式):  
  {  
    "schedule\_id": 501,   
    "booking\_id": 8011,            // 模式A：手动点名核销（传 booking\_id）  
    "qr\_token": "qr\_usr\_1001\_..."  // 模式B：扫码核销（传用户动态码）  
  }

### **3.4 标记客户缺席**

* **路径**: POST /api/coach/booking/absent  
* **描述**: 客户未到场，标记为缺席，**不退还课时**。  
* **请求参数**:  
  { "booking\_id": 8011 }

### **3.5 发布排课计划 (单次/模板)**

* **路径**: POST /api/coach/schedule/create  
* **请求参数**:  
  {  
    "store\_id": 1,  
    "class\_type": 1, // 1-团课 2-私教  
    "title": "泰拳进阶",  
    "start\_time": "2023-11-01 19:00:00",  
    "end\_time": "2023-11-01 20:30:00",  
    "max\_capacity": 15,  
    "repeat\_weeks": 4 // 存为模板并重复排课的周数，0表示仅本次  
  }

### **3.6 教练紧急取消排课**

* **路径**: POST /api/coach/schedule/cancel  
* **描述**: 教练因故停课。  
* **⚠️ 开发注意**: 后端需要异步处理：1. 将已预约用户的记录标记为“教练取消”；2. 退还课时；3. 触发微信订阅消息提醒用户。  
* **请求参数**:  
  { "schedule\_id": 501, "reason": "教练生病" }

## **四、 管理员模块 (Admin Dashboard)**

### **4.1 获取课时派发审计日志**

* **路径**: GET /api/admin/audit/asset-logs  
* **权限**: 管理员 (Role \== 3\)  
* **描述**: 供财务人员核对线下账款。  
* **请求参数 (Query)**:  
  * date\_start, date\_end  
  * coach\_id (可选筛选)  
* **响应数据 (data)**:  
  {  
    "total\_offline\_amount": 12000.00, // 今日汇总实收  
    "logs": \[  
      {  
        "log\_id": 9901,  
        "created\_at": "2023-11-01 10:00:00",  
        "coach\_name": "李教练",  
        "client\_name": "王五",  
        "operate\_type": "派发",  
        "package\_name": "30节私教卡",  
        "offline\_amount": 6000.00,  
        "pay\_method": "Wechat\_Transfer",  
        "remark": "..."  
      }  
    \]  
  }

### **4.2 基础统计数据看板**

* **路径**: GET /api/admin/dashboard/stats  
* **响应数据**:  
  {  
    "today\_checkin\_count": 45,       // 今日总核销人次  
    "today\_new\_asset\_count": 120,    // 今日新派发课时总数  
    "active\_booking\_count": 60       // 今日预约总人次  
  }  
