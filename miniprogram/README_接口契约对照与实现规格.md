# 秉羲工作台小程序 ↔ bingxi-erp 接口契约对照与实现规格 (v3 直替版)

> 依据: bingxi-erp 仓库 commit c0f45839（2026-10-31「按代码实测重写」版接口文档）
> 端点清单来源: 本地源码实测（frontend/scripts/check-api-paths.mjs 口径）——
> 后端 (path,method) 组合 **1821** 个、去重路径 **1385** 条
> 更新时间: 2026/10/31 14:00

## 〇、v3 关键变更：从"运行时改写"改为"调用点直替"

- **旧方案 (v2)**：服务文件保留旧 `/app-api/*` 路径，运行时由 `apiGateway.adapt()` 查 ROUTES 表改写 URL —— 旧接口数据仍留在代码里。
- **新方案 (v3)**：由 `bake_endpoints_v4.js` 将 **75 条已核对映射直接固化进调用点**——
  host 换 `bingxiHost`、路径换 `/api/v1/erp/*`、HTTP 方法改写（POST→GET/PUT/DELETE 等）、
  id 取值表达式内联（如 `/sales/orders/{billingId}/cancel`）。
  **旧 `/app-api`、`/oauth-api` 路径与 ROUTES 运行时改写表已全部删除。**
- `apiGateway.js` 降级为纯契约层：响应归一化(200→0)、Bearer 鉴权头、CSRF 一次性消费恢复、登录深度适配、GET 分页参数适配(pageNum/pageSize→page/page_size)。
- **未映射的 275 个旧路径：统一直通 bingxiHost（旧后端彻底下线）。仓库没有的接口就是 404，不做任何回退/模拟。**

## 一、通用契约约定（以实测文档为准）

| 项 | bingxi-erp 实际约定 | 小程序侧处理 |
|---|---|---|
| 传输 | REST over HTTP, JSON | wx.request ✓ |
| 凭据 | httpOnly Cookie 优先（access_token 8h）; **Bearer 头为第 3 优先级，非浏览器客户端标准用法** | Authorization: Bearer <JWT> |
| CSRF | x-csrf-token **一次性消费**；403 时响应头 x-new-csrf-token 下发恢复令牌 | 缓存复用；403 自动取新令牌重放一次 |
| L-1 防御 | 公开路径要求 X-Requested-With 或 x-csrf-token 任一自定义头 | 全部请求附 X-Requested-With |
| 响应包络 | {code:200, message, data}；分页 {items,total,page,page_size} | 归一化 200→0，业务层零改动 |
| 错误外显 | message 默认脱敏常量，仅显式声明的构造点携带真实文案 | msg 字段透传 |
| 限流 | 认证 10 次/分，普通 100 次/分 | 未做特殊处理 |
| 登录响应 | {code:200,data:{token,refresh_token,expires_in,user}} | adaptLogin 深度适配落 storage |

⚠️ 注意：采购模块前缀是 `/purchase`（单数），销售退货是 `/sales/sales-returns`——均与直觉命名不同，已按实测核对。

## 二、已固化路由（75 条，全部经实测端点清单核对存在并写入调用点）

| # | 功能 | 小程序原路径 | bingxi-erp 端点（已固化） | 方法 |
|---|---|---|---|---|
| 1 | 登录(微信手机号授权) | `/oauth-api/front/user/login` | `/auth/login` | POST |
| 2 | 登录(账密) | `/oauth-api/user/login` | `/auth/login` | POST |
| 3 | 登出 | `/oauth-api/front/user/logout` | `/auth/logout` | POST(原DELETE) |
| 4 | 用户信息 | `/app-api/user/info` | `/users/me` | GET |
| 5 | 编辑个人资料 | `/app-api/user/editInfo` | `/user/profile` | PUT(原POST) |
| 6 | 修改密码 | `/app-api/user/editPsw` | `/users/change-password` | POST |
| 7 | 删除子账号 | `/app-api/user/delete/{id}` | `/users/{id}` | DELETE |
| 8 | 新增子账号 | `/app-api/user/addChildrenAccount` | `/users` | POST |
| 9 | 子账号列表 | `/app-api/user/childrenList` | `/users` | GET |
| 10 | 商品详情 | `/app-api/goods/getId` | `/products/{id}` | GET(原POST,id取自data) |
| 11 | 商品创建 | `/app-api/goods/add` | `/products` | POST |
| 12 | 商品更新 | `/app-api/goods/update` | `/products/{id}` | PUT(原POST,id取自data) |
| 13 | 商品批量更新(上下架等) | `/app-api/goods/batchSetGoodsSaleStatus` | `/products/batch/update` | POST |
| 14 | 商品列表(应用) | `/app-api/product/list/forApp` | `/products` | GET |
| 15 | 商品搜索 | `/app-api/product/list/searchApp` | `/search/products` | GET |
| 16 | 商品详情(byId) | `/app-api/product/byId/{id}` | `/products/{id}` | GET |
| 17 | 商品删除 | `/app-api/product/delete/{id}` | `/products/{id}` | DELETE |
| 18 | 商品颜色列表 | `/app-api/product/color/list` | `/products/{productId}/colors` | GET(原POST) |
| 19 | 分类树 | `/app-api/classify/list` | `/product-categories/tree` | GET |
| 20 | 分类新增 | `/app-api/classify/add` | `/product-categories` | POST |
| 21 | 分类编辑 | `/app-api/classify/edit` | `/product-categories/{id}` | PUT(原POST) |
| 22 | 分类删除 | `/app-api/classify/delete/{id}` | `/product-categories/{id}` | DELETE |
| 23 | 分类详情 | `/app-api/goods/category/categoryDetail` | `/product-categories/{id}` | GET(id取自data) |
| 24 | 色卡列表 | `/app-api/product/listColorChart` | `/color-cards` | GET |
| 25 | 色卡收发日统计 | `/app-api/statistics/colorcardreceive/countByDate` | `/color-cards/statistics/daily` | GET |
| 26 | 销售订单分页列表 | `/app-api/order/sale/billing/pageList` | `/sales/orders` | GET(原POST) |
| 27 | 销售订单详情 | `/app-api/order/sale/billing/billingDetail/{id}` | `/sales/orders/{id}` | GET |
| 28 | 创建销售订单 | `/app-api/order/sale/billing/saveBilling` | `/sales/orders` | POST |
| 29 | 保存退款单 | `/app-api/order/sale/billing/saveRefundment` | `/sales/sales-returns` | POST |
| 30 | 订单发货 | `/app-api/order/sale/billing/send` | `/sales/orders/{billingId}/ship` | POST |
| 31 | 订单取消 | `/app-api/order/sale/billing/cancelOrder` | `/sales/orders/{billingId}/cancel` | POST |
| 32 | 订单关闭 | `/app-api/order/sale/billing/closeOrder` | `/sales/orders/{billingId}/cancel` | POST |
| 33 | 订单删除 | `/app-api/order/sale/billing/deleteOrder/{id}` | `/sales/orders/{id}` | DELETE |
| 34 | 订单统计 | `/app-api/order/billingAmount` | `/sales/orders/statistics` | GET |
| 35 | 退货列表 | `/app-api/order/refund/billing/refundList` | `/sales/sales-returns` | GET |
| 36 | 创建退货 | `/app-api/order/refund/billing/saveBillingRefund` | `/sales/sales-returns` | POST |
| 37 | 创建退货(saveRefundBilling) | `/app-api/order/refund/billing/saveRefundBilling` | `/sales/sales-returns` | POST |
| 38 | 保存收款 | `/app-api/order/sale/billing/savePayment` | `/ar/payments` | POST |
| 39 | 保存收款(savePayment) | `/app-api/order/savePayment` | `/ar/payments` | POST |
| 40 | 收款列表 | `/app-api/order/sale/billing/receive/paymentList/{id}` | `/ar/payments?billing_id={id}` | GET |
| 41 | 客户分页列表 | `/app-api/customer/two/queryList` | `/crm/customers` | GET |
| 42 | 客户选择列表 | `/app-api/customer/two/selectPageList` | `/crm/customers` | GET |
| 43 | 客户新增 | `/app-api/customer/two/add` | `/crm/customers` | POST |
| 44 | 客户编辑 | `/app-api/customer/two/edit` | `/crm/customers/{id}` | PUT(原POST) |
| 45 | 客户详情 | `/app-api/customer/two/detail/{id}` | `/crm/customers/{id}` | GET |
| 46 | 客户订单列表 | `/app-api/customer/two/orderList` | `/sales/orders` | GET |
| 47 | 客户订单计数 | `/app-api/customer/two/orderCount/{id}` | `/sales/orders?customer_id={id}` | GET |
| 48 | 对账单列表 | `/app-api/customer/two/reconciliation/customerList` | `/ar-reconciliations` | GET |
| 49 | 店铺收款列表 | `/app-api/customer/two/reconciliation/shopPaymentList` | `/ar/payments` | GET |
| 50 | 批量收款 | `/app-api/customer/two/reconciliation/batchPayment` | `/ar/payments` | POST |
| 51 | CRM首页汇总 | `/app-api/crm/indexTotalData` | `/dashboard/overview` | GET |
| 52 | 销售汇总(日/月) | `/app-api/statistics/sale/billing/summary` | `/bi/sales/by-time` | GET |
| 53 | 今日销售指数 | `/app-api/statistics/sale/billing/todayIndex` | `/dashboard/sales-stats` | GET |
| 54 | 商品销售汇总 | `/app-api/statistics/sale/billing/product/summary` | `/bi/sales/by-product` | GET |
| 55 | 商品销售明细汇总 | `/app-api/statistics/sale/billing/productDetail/summary` | `/bi/sales/by-product` | GET |
| 56 | 销售汇总(入口) | `/app-api/stat/billing/summary` | `/bi/sales/kpi` | GET |
| 57 | 按商品销售统计 | `/app-api/stat/billing/goods` | `/bi/sales/by-product` | GET |
| 58 | 按客户销售统计 | `/app-api/stat/billing/customer` | `/bi/sales/by-customer` | GET |
| 59 | 订单首页汇总 | `/app-api/stat/order/indexSummary` | `/dashboard/sales-stats` | GET |
| 60 | 订单首页汇总(个人) | `/app-api/stat/order/indexSummaryPerson` | `/dashboard/sales-stats` | GET |
| 61 | 商品统计列表 | `/app-api/stat/goods/list` | `/bi/sales/by-product` | GET |
| 62 | 客户统计数据 | `/app-api/stat/customer/data` | `/bi/sales/by-customer` | GET |
| 63 | 店铺汇总 | `/app-api/stat/shop/summary` | `/dashboard/overview` | GET |
| 64 | 数据中心-商品 | `/app-api/datacenter2/goods/` | `/bi/sales/by-product` | GET |
| 65 | 首页访问埋点 | `/app-api/access/log/index/visit` | `/page-view` | POST |
| 66 | 点击埋点 | `/app-api/statistics/countClick` | `/behavior` | POST |
| 67 | 页面访问日志 | `/app-api/loss/logAccessPage` | `/page-view/stats` | GET |
| 68 | 访问分析按日 | `/app-api/statistics/accessanalysis/countByDate` | `/page-view/stats/by-day` | GET |
| 69 | 客户访问列表 | `/app-api/stat/customer/accessList` | `/page-view/stats` | GET |
| 70 | 消息列表 | `/app-api/message/list` | `/notifications` | GET |
| 71 | 系统公告 | `/app-api/message/noticeList` | `/oa-announcements` | GET |
| 72 | 未读消息数 | `/app-api/message/noReadCount` | `/notifications/unread-count` | GET |
| 73 | 消息已读 | `/app-api/message/readMessage/{id}` | `/notifications/{id}/read` | POST |
| 74 | 公告已读 | `/app-api/notice/readNotice` | `/notifications/batch-read` | POST |

> 另：`checkToken.js`（3 份副本）已直改 `/users/me`、`/auth/login`，响应判据 `code===0` → `code===200`，鉴权头改 `Bearer` + `X-Requested-With`。

## 三、未映射接口（275 个去重路径，直通 bingxiHost，预期 404）

> 原则：**没有就是没有**——仓库后端不存在的端点不做模拟映射。这些请求会指向
> `https://8.166.117.33/<旧路径>` 并收到 404，前端按错误分支处理，旧后端已彻底不再被调用。
> 完整清单见 `work_patch/js_deobf/_apiref/baked_unmapped_paths.json`。

| 业务域 | 数量 | 说明 |
|---|---|---|
| `/app-api/order` | ~30 | 订单细分(打印/草稿/询价单/退款明细图) |
| `/app-api/goods` | ~28 | 求购广场(ask)、打印指令、色名 |
| `/app-api/user` | ~18 | 邀请码/子账号角色/微信小程序码 |
| `/app-api/shop` | ~15 | 店铺管理/区域 |
| `/app-api/product` | ~14 | 色卡细分(底卡/换底/搜色/价签) |
| `/app-api/setting` | ~14 | 小程序配置 |
| `/app-api/customer` | ~12 | 客户跟进轨迹/对账合计/打印设置 |
| `/app-api/pay` | 8 | 微信支付(仓库无对应) |
| `/app-api/cloth`、`/app-api/ai`、`/app-api/purchasing` 等 | 其余 | 求购/布料/AI 撮合等布行特有域 |

**已知功能缺口**（仓库后端目前没有对应端点，固化后为 404）：
文件上传（`/app-api/oss/upload`、`/app-api/file/upload`、`/app-api/img/uploadV2`）——
仓库仅有 `POST /system-update/upload`，语义不符，未强行映射。头像/图片上传类功能需后端补充上传端点后方可使用。

## 四、验证结果（2026-10-31）

| 项 | 结果 |
|---|---|
| 全量 JS 语法校验 | **304/304 通过** |
| 固化端点 vs 仓库端点清单 | **52 去重端点全部命中**（50 直查 + 2 通配假阴性已人工确认 `notifications/*/read`、`sales/orders/*/cancel|ship`） |
| 旧 host + 旧 API 路径残留 | **0** |
| 契约回归测试 (regression_v4.js) | **15/15 通过**（归一化/分页适配/鉴权头/CSRF 恢复/登录适配/直通识别） |
| 转换脚本幂等性 | 两次运行哈希一致 |

## 五、bingxi-erp 端点模块分布（141 个模块，共 1821 组合）

<details><summary>展开</summary>

| 模块 | 端点数 |
|---|---|
| production | 312 |
| crm | 145 |
| purchase | 136 |
| inventory | 77 |
| sales | 64 |
| ap | 50 |
| color-cards | 41 |
| finance | 36 |
| budgets | 32 |
| bpm | 31 |
| ar | 28 |
| fixed-assets | 25 |
| custom-orders | 21 |
| reports | 21 |
| ai | 20 |
| bulk-color-approvals | 20 |
| fund-management | 20 |
| color-prices | 19 |
| system-update | 18 |
| products | 17 |
| quotations | 17 |
| ar-reconciliations-enhanced | 16 |
| bi | 16 |
| boms | 14 |
| contract-templates | 14 |
| webhooks | 14 |
| bad-debts | 13 |
| financial-analysis | 13 |
| vouchers | 13 |
| ai-models | 12 |
| data-import | 12 |
| occupational-health | 12 |
| quality-standards | 12 |
| roles | 12 |
| warehouses | 12 |
| ar-reconciliations | 11 |
| chemical-requisitions | 11 |
| dashboard | 11 |
| chemical-lots | 10 |
| export-approvals | 10 |
| material-shortage | 10 |
| notifications | 10 |
| scheduling | 10 |
| advanced | 9 |
| export-inspections | 9 |
| print-templates | 9 |
| textile-submissions | 9 |
| assist-accounting | 8 |
| auth | 8 |
| labor-contracts | 8 |
| subjects | 8 |
| users | 8 |
| collection-tasks | 7 |
| currencies | 7 |
| data-permissions | 7 |
| device-connections | 7 |
| oa-announcements | 7 |
| permission-delegations | 7 |
| quality-8d-reports | 7 |
| role-change-approvals | 7 |
| social-insurance | 7 |
| textile-reports | 7 |
| api-gateway | 6 |
| audit-logs | 6 |
| categories | 6 |
| chemical-categories | 6 |
| chemicals | 6 |
| customer-shares | 6 |
| departments | 6 |
| export-refunds | 6 |
| finance-alerts | 6 |
| health | 6 |
| init | 6 |
| period-adjustments | 6 |
| pollution-monitoring | 6 |
| pollution-permits | 6 |
| product-categories | 6 |
| role-relations | 6 |
| scanner | 6 |
| slow-queries | 6 |
| admin | 5 |
| aging-alert-rules | 5 |
| aging-grades | 5 |
| asset-categories | 5 |
| customer-team-members | 5 |
| email-templates | 5 |
| field-permissions | 5 |
| industry-benchmarks | 5 |
| logistics-tracking | 5 |
| print-targets | 5 |
| business-trace | 4 |
| contract-signatures | 4 |
| exchange-rates | 4 |
| period-report-snapshots | 4 |
| privacy | 4 |
| search | 4 |
| textile-export-requirements | 4 |
| textile-limit-rules | 4 |
| textile-test-items | 4 |
| company-profile | 3 |
| environmental-tax | 3 |
| incoterms | 3 |
| page-view | 3 |
| print-tasks | 3 |
| user | 3 |
| alerts | 2 |
| excel | 2 |
| locked-accounts | 2 |
| login-logs | 2 |
| logs | 2 |
| report-templates | 2 |
| templates | 2 |
| user-notification-settings | 2 |
| ws | 2 |
| aggregate | 1 |
| behavior | 1 |
| cache | 1 |
| convert | 1 |
| detect-anomalies | 1 |
| document-no | 1 |
| email-records | 1 |
| email-statistics | 1 |
| execute | 1 |
| export | 1 |
| forecast-sales | 1 |
| funnel | 1 |
| lock-status | 1 |
| optimize-inventory | 1 |
| permission-audits | 1 |
| permissions | 1 |
| popular-pages | 1 |
| recommendations | 1 |
| send | 1 |
| stats | 1 |
| stream | 1 |
| supplier-qualifications | 1 |
| suppliers | 1 |
| unlock | 1 |
| user-path | 1 |
| validate | 1 |
| xlsx | 1 |
</details>

## 六、维护指南

- **权威端点清单重算**（仓库内）：
  ```bash
  cd frontend && node scripts/check-api-paths.mjs   # 前后端契约门禁
  ```
- **导出后端全量端点 JSON**（本工作区）：
  ```bash
  node F:/7/work_patch/js_deobf/_apiref/dump_backend_api.mjs
  ```
- **固化转换**（幂等，可重复执行）：
  ```bash
  node F:/7/work_patch/js_deobf/_apiref/bake_endpoints_v4.js
  ```
- **核对固化端点存在性**：`node F:/7/work_patch/js_deobf/_apiref/verify_baked.js`
- **契约回归测试**：`node F:/7/work_patch/js_deobf/_apiref/regression_v4.js`
- **新增映射**：在 `bake_endpoints_v4.js` 的 RULES 加一条 `{ old, style, method, nw }`，
  手动修改对应调用点（或对全新源码重跑脚本），再跑 verify 确认端点存在。
- 后端 Swagger: `http://<host>/swagger-ui`；OpenAPI: `/api-docs/openapi.json`
- 环境地址：四环境 `bingxiHost` 均为 `https://8.166.117.33`（见 `envConfig.js`）。
  开发者工具需勾选"不校验合法域名"；真机需信任自签证书。
