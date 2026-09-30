# ONE 泰拳格斗馆小程序

项目使用微信小程序云开发，业务入口是 `cloudfunctions/businessCore`，`quickstartFunctions` 仅用于示例。

## 部署与首次启动

1. 在微信开发者工具中开通或选择云开发环境，把 `miniprogram/app.js` 中的 `globalData.env` 设置为该环境 ID。
2. 右键 `cloudfunctions/businessCore`，选择“上传并部署：云端安装依赖”。该目录的 `config.json` 声明了手机号登录和身份二维码需要的云调用权限。使用 `uploadCloudFunction.sh` 时也会部署此业务函数。
3. 在云开发控制台的 `businessCore` 云函数配置中，设置环境变量 `ADMIN_PHONE_NUMBERS`，值为首位管理员的真实手机号；多个管理员号码用英文逗号分隔。例如 `13812345678,13912345678`。建议将函数执行超时设置为 20 秒，为首次建集合预留时间。
4. 打开小程序并授权手机号登录。管理员号码匹配的是微信接口返回的真实手机号，客户端不能通过传入 `role` 或 `phone` 获得管理员权限。

**部署上传本身不会执行初始化。部署后首次调用 `businessCore` 时，云函数会在查询登录态、手机号登录或业务读写之前自动初始化数据库，不需要先登录管理员，也不需要点击管理页面按钮。**

自动创建以下 7 个集合，并补齐默认门店和套餐配置：

| 集合 | 首次启动数据 |
| --- | --- |
| `app_user` | 空，用户手机号登录时创建 |
| `biz_store` | 默认门店 |
| `biz_package` | 默认套餐 |
| `user_asset` | 空 |
| `user_asset_log` | 空 |
| `biz_class_schedule` | 空 |
| `biz_booking` | 空 |

初始化按固定 ID 补齐基础配置，不覆盖已有同 ID 的记录。同一云函数实例共享初始化 Promise；不同实例同时启动时允许重复建集合和重复插入检查。初始化失败会返回 `DATABASE_INIT_ERROR`，后续调用可重试。热实例初始化成功后不再重复初始化；管理员页面的“检查数据库”可以再次补齐和校验。

普通号码首次登录为客户。配置的管理员号码下次进行手机号登录时会获得管理员权限，包括已注册的客户账号。未设置 `ADMIN_PHONE_NUMBERS` 不影响普通用户登录；也可在云开发控制台将真实用户的 `app_user.role` 改为 `3`，再重新登录。移除环境变量中的号码不会撤销数据库中已有的管理员角色，后续人员权限由管理员页面管理。

## 演示数据

自动初始化不写入演示用户、课时余额、排课和预约。已有演示记录不会被删除。

仅在测试环境需要旧版演示数据时，将 `businessCore` 的环境变量 `ENABLE_DEMO_SEEDS` 设置为 `true`，然后由已登录管理员点击“检查数据库”。该操作会额外补齐演示记录，包括演示管理员；正式环境应保持该变量未设置。`bootstrap` 接口要求管理员身份，首次启动自动建集合不依赖此接口。

## 验证

本地回归测试使用 Node.js 内置测试运行器和模拟云 SDK，无需安装依赖：

```sh
node --test cloudfunctions/businessCore/test/bootstrap.test.js
```

这些测试验证业务逻辑；部署后仍需在目标微信云环境验证云函数权限、超时配置和真实手机号授权。

参考：[微信云开发文档](https://developers.weixin.qq.com/miniprogram/dev/wxcloud/basis/getting-started.html)、[云调用权限配置](https://docs.cloudbase.net/faq/knowledge/cloud-call-604101-permission-error)。

