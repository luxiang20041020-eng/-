# ONE 泰拳格斗馆小程序

项目使用微信小程序云开发，业务入口是 `cloudfunctions/businessCore`，`quickstartFunctions` 仅用于示例。

## 使用说明

- [管理员使用说明](docs/管理员使用说明.md)：人员权限、套餐管理、权益派发、排期、到场与线下人工核销、门店和看板。
- [客户使用说明](docs/客户使用说明.md)：登录、权益、预约与取消、到店、线下预约和常见问题。

同目录的 HTML 阅读版可直接打开，支持目录跳转和浏览器打印／保存为 PDF。修改 Markdown 后运行 `node tools/render-user-guides.js` 更新 HTML。

## 部署与首次启动

1. 在微信开发者工具中开通或选择云开发环境，把 `miniprogram/app.js` 中的 `globalData.env` 设置为该环境 ID。
2. 右键 `cloudfunctions/businessCore`，选择“上传并部署：云端安装依赖”。该目录的 `config.json` 声明了手机号登录和身份二维码需要的云调用权限。使用 `uploadCloudFunction.sh` 时也会部署此业务函数。
3. 在云开发控制台的 `businessCore` 云函数配置中，设置环境变量 `ADMIN_PHONE_NUMBERS`，值为首位管理员的真实手机号；多个管理员号码用英文逗号分隔。例如 `13812345678,13912345678`。建议将函数执行超时设置为 20 秒，为首次建集合预留时间。
4. 打开小程序并授权手机号登录。管理员号码匹配的是微信接口返回的真实手机号，客户端不能通过传入 `role` 或 `phone` 获得管理员权限。

**部署上传本身不会执行初始化。部署后首次调用 `businessCore` 时，云函数会在查询登录态、手机号登录或业务读写之前自动初始化数据库，不需要先登录管理员，也不需要点击管理页面按钮。**

自动创建以下 7 个集合，并补齐默认门店和套餐配置：

| 集合 | 首次启动数据 |
| --- | --- |
| `app_user` | 空，用户手机号登录或管理员手动录入时创建 |
| `biz_store` | 默认门店 |
| `biz_package` | 默认套餐 |
| `user_asset` | 空 |
| `user_asset_log` | 空 |
| `biz_class_schedule` | 空 |
| `biz_booking` | 空 |

初始化按固定 ID 补齐基础配置，不覆盖已有同 ID 的记录。同一云函数实例共享初始化 Promise；不同实例同时启动时允许重复建集合和重复插入检查。初始化失败会返回 `DATABASE_INIT_ERROR`，后续调用可重试。热实例初始化成功后不再重复初始化；管理员页面的“检查服务”可以再次补齐和校验。

普通号码首次登录为客户。配置的管理员号码下次进行手机号登录时会获得管理员权限，包括已注册的客户账号。未设置 `ADMIN_PHONE_NUMBERS` 不影响普通用户登录；也可在云开发控制台将真实用户的 `app_user.role` 改为 `3`，再重新登录。移除环境变量中的号码不会撤销数据库中已有的管理员角色，后续人员权限由管理员页面管理。

## 演示数据

自动初始化不写入演示用户、课时余额、排课和预约。已有演示记录不会被删除。

仅在测试环境需要旧版演示数据时，将 `businessCore` 的环境变量 `ENABLE_DEMO_SEEDS` 设置为 `true`，然后由已登录管理员点击“检查服务”。该操作会额外补齐演示记录，包括演示管理员；正式环境应保持该变量未设置。`bootstrap` 接口要求管理员身份，首次启动自动建集合不依赖此接口。

## 验证

本地回归测试使用 Node.js 内置测试运行器和模拟云 SDK，无需安装依赖：

```sh
node --test cloudfunctions/businessCore/test/bootstrap.test.js cloudfunctions/businessCore/test/business-flow.test.js cloudfunctions/businessCore/test/manual-writeoff.test.js cloudfunctions/businessCore/test/create-user.test.js cloudfunctions/businessCore/test/customer-assets.test.js cloudfunctions/businessCore/test/user-feedback.test.js tests/miniprogram/interaction.test.js
```

这些测试验证业务逻辑；部署后仍需在目标微信云环境验证云函数权限、超时配置和真实手机号授权。

## 设计与交互

生产小程序的 13 个页面统一采用深墨色、暖白与朱红，保留 ONE 品牌。首页的团体与专属训练分别进入对应场次；游客可浏览真实排课，登录后回到原预约入口。个人中心优先展示权益与预约，身份码按需展开。

管理员保留管理权限，同时拥有工作台入口，可用自己的账号排课、查看学员名单、派发权益及核销，管理员也会出现在预约大厅的教练筛选中。工作台的“人工核销”支持按姓名或手机号查找已建档学员，登记一次已发生的团课或私教训练；已有场次的名单页也提供“补核销线下学员”。未预约的学员每次扣减对应类型的 1 课时，已有待核销预约则直接确认到场，不重复扣课。余额不足、权益过期、账号停用或无场次权限时拒绝写入；扣课、训练记录和审计流水在同一事务中提交。网络异常会在本地保存未确认请求，重进页面后复用同一请求核对，不能改动待确认参数；同一学员、门店、课程类型和训练分钟也不能重复独立登记。单独登记的训练不会作为开放场次出现在排课列表，学员个人中心与管理员看板可查看记录。尚未建档或没有课时的线下客户须先建立账号并派发权益。

数据页支持加载反馈、失败重试和下拉刷新。预约、退课、派发、核销和排课都以云端写入成功为准，不再退回本地模拟成功。排课使用日期与时间选择器，每周重复明确生成连续 4 周场次；派发与缺席操作会提示具体对象和结果。

管理员可在“看板 → 人员权限管理 → 录入新用户”填写姓名、11 位手机号和营业中的所属门店，建立客户档案。录入不会绑定操作人的微信身份，也不会自动增加课时；可随后派发权益、进行线下人工核销。重复手机号不会覆盖已有档案，网络失败后在同一表单重试会复用请求号。客户使用该手机号授权登录时关联原档案，保留姓名、门店、角色、权益及训练记录。录入与手机号登录共用固定用户 ID，并在事务中重读，避免并发建档覆盖。

后端统一按微信 OPENID 验证身份和角色，检查权益到期、开课时间、预约归属、取消时限、重复核销及排课冲突。看板展示当前门店的当日真实数据，可复制当前展示的权益流水。旧数据无 `expiry_date` 时继续兼容为未设置到期日。

退出登录会在一个事务中清除当前微信身份的全部业务登录绑定，包括已停用账号和历史重复绑定，保留会员账号、权益及预约记录。云端退出成功后，前端清空个人资料、权益、二维码和管理缓存，并将退出状态保存到本地；重启后仍以游客身份浏览，重新手机号登录后恢复正常登录态。云端失败时会保留当前账号并提示重试。退出期间迟到的资料查询不会写回旧数据。

本地布局预览直接渲染页面的 WXML/WXSS，并使用独立示例数据，不调用云函数：

```sh
node tools/preview-miniprogram.js
```

访问 `http://127.0.0.1:4318` 选择页面；`?state=guest`、`?state=empty`、`?state=error` 分别预览游客、空数据和失败状态，管理页的 `?popup=1` 可预览表单弹窗。人员页 `?popup=1&state=duplicate` 可查看重复号码反馈，`?popup=role` 可查看权限调整。人员页 `?popup=assets` 可查看客户套餐详情，结合 `state=expired`、`empty`、`error`、`loading`、`disabled` 查看不同状态。截图位于 `artifacts/design`。此预览用于检查布局，实际微信组件、隐私授权、身份二维码和云端事务仍须在微信开发者工具与真机验收。

人员管理的客户卡片展示团课／私教可用余额，详情展示有效期、过期次数与最近 30 条套餐派发记录；同类型课时合并使用，历史派发名称和到期日通过新流水快照保留。详情每次打开及手动刷新均读取云端，不将读取失败显示成零余额。

前后端统一将内部故障转换为可理解的原因和处理建议，保留具体业务校验；超时写入提示核对结果，不假定失败。原始错误只留在服务日志。提示规则源文件为 `cloudfunctions/businessCore/user-feedback.js`，修改后运行 `node tools/sync-user-feedback.js` 同步小程序副本，回归测试校验一致性。

更新时需重新上传部署整个 `cloudfunctions/businessCore` 目录（包含 `request-policy.js` 和 `user-feedback.js`），并重新编译上传 `miniprogram`。不用清空现有数据库。

参考：[微信云开发文档](https://developers.weixin.qq.com/miniprogram/dev/wxcloud/basis/getting-started.html)、[云调用权限配置](https://docs.cloudbase.net/faq/knowledge/cloud-call-604101-permission-error)。

