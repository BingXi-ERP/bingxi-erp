# 后端缺陷登记台账（2026-11-02）

配对 e2e 改造过程中查出的后端行为缺陷集中登记在此，便于按处置类别排期。只记有源码坐标的事实，
不记推测。每条给出验证方式：**亲验** 指本轮我逐字读过该文件该段并交叉核过路由与快照；
**自述** 指由该枚 spec 的作者读源码写进文件头，我未逐行复核，合入前需点验。

处置类别口径：`源码修`＝行为本身错；`词表收口`＝取值域/枚举缺门；`端点废除`＝死端点或假可供；
`信封统一`＝响应形状偏离 `PaginatedResponse`／`ApiResponse` 约定；`授权补授`＝角色键缺位；
`口径裁定`＝需先在米公斤换算等业务口径上定权威方（依 GB/T 与行标的计量口径，不由测试面自行裁定）。

| 编号 | 面 | 现象 | 证据 | 验证 | 处置 | 是否已有配对断言钉住 |
|---|---|---|---|---|---|---|
| D-01 | 库存调拨 | 只判"可用量够不够"，未判量本身：负量恒小于可用量必过门，源批次减法变加量、目标变减量，可凭空造出或吞掉在架米数；零量留下一条不改库存的流水 | backend/src/services/inventory_stock_service.rs:997-999 与扣减加行 1002-1004、1024-1026 | 亲验 | 源码修（已在 `0062a8a2` 落地，未推） | 待补两条拒绝腿，218 文件头 34-37 行自述"留待入口校验补齐后再写" |
| D-02 | 用户改写 | status 只与 ACTIVE 比相等，词表外任意取值被静默解释成"停用"写库并触发停用联动，调用方拿 200 无从察觉 | backend/src/services/user_service.rs:333-335 | 亲验 | 词表收口（已修，未推） | **反向**：216 第 9 段现把"静默禁用落库"钉成现状断言，门一合入即红，须随动改判 |
| D-03 | 告警运维 | 告警解除为纯桩：不校验 id、不读状态、不写库，直接回"告警已处理" | backend/src/handlers/login_security_handler.rs:410-416 | 亲验 | 端点废除 或 源码修（二选一，取决于是否要真解除语义） | 252 已按现状钉住"无操作语义" |
| D-04 | 设备连接观测 | 七条腿的 handler 全部收 `_auth: AuthContext` 且文件内零 `require_admin_role`，handler 层无深度防御，角色门只剩 RBAC 中间件一道 | backend/src/handlers/device_connection_handler.rs:104/119/131/142/161/172/195 | 亲验 | 源码修（补 admin 门） | 253 按现状钉非 admin 与匿名档 |
| D-05 | 审计摘要 | 同族无深度防御：`get_audit_log_summary` 签名 `_auth` | backend/src/handlers/audit_log_handler.rs:705-707 | 亲验 | 源码修 | 254 按现状钉住 |
| D-06 | 财务分析 | 反查与统计族同问题：文件内 `require_admin_role` 计数 0、`_auth: AuthContext` 5 处 | backend/src/handlers/financial_analysis_handler.rs | 亲验（计数） | 源码修 | 263 覆盖形状，权限档按现状 |
| D-07 | 趋势配置 | 无 DELETE 也无 PUT：routes 只给 `trends` 挂 GET 与 POST，全 routes 无 `trends/{id}` 形态，服务侧亦无删除函数 ⇒ 经此入口写入的 analysis_result 行没有任何 API 回收面，自埋数据只能靠库侧清理 | backend/src/routes/finance.rs:516-522；frontend/scripts/route-snapshot.txt 的 financial-analysis 段 | 亲验（三处交叉） | 源码修（补 PUT/DELETE）或 归入"报表类只读派生数据"口径 | 263 的孤儿行断言已点名 |
| D-08 | 物流面单 | 水平越权：运单在打印服务里登记为"无归属用户列"，任何过 RBAC 的登录用户可取任意运单 docx | backend/src/services/print_service.rs:170；handlers/print_handler.rs:420-421 | 自述（249 文件头，未逐行复验） | 源码修（补归属门） | 249 明确声明本轮不覆盖该水平面缺口 |
| D-09 | 扫码族 | `scan_to_ship_impl` 收下 `_order_id` 不用；GET scan-to-ship 返回硬编码空信封 | backend/src/handlers/barcode_scanner_handler.rs（217 文件头带坐标） | 自述 | 源码修 | 217 已钉 |
| D-10 | 导出族 | 登录日志与成本归集两条导出不读审批令牌、无 admin 门，与同族 sales-prices 腿不对称 | backend/src/handlers/login_security_handler.rs 导出腿；handlers/production/cost_collections 导出腿 | 自述 | 源码修（统一受理门） | 235 已把不对称钉成回归护栏 |
| D-11 | 报表引擎 | xlsx 走 `from_utf8_lossy`，非法字节被静默替换 | backend/src/handlers/report_engine_handler.rs:230 | 自述 | 源码修 | 235 侧记录 |
| D-12 | 业务追溯 | 正反向追溯对不存在主键无存在性检查，回 200 加空壳；快照腿反而有真 404 | backend/src/services/business_trace_service.rs:70-105 与 110-114 | 自述 | 源码修（统一 404 语义） | 252、254 分别钉 |
| D-13 | 角色授权 | 整批替换授权接受不存在的资源键，写进库不校验 | backend/src/services/role_permission_service.rs replace_role_permissions | 自述 | 源码修 | 215、254 |
| D-14 | 数据范围 | `scope-types` 广播五个大写值，写入侧只认三个小写档，取值域两侧不同源 | backend/src/utils/data_scope.rs:43-48 与 services/role_permission_service.rs:367 | 自述 | 词表收口 | 216 钉住不对称 |
| D-15 | 证书与商检 | 两个 handler 绕过 ApiResponse 信封直出模型，且不收 AuthContext | backend/src/handlers/certificate_of_origin_handler.rs:11-35；handlers/export_inspection_handler.rs:22 | 自述 | 信封统一 加 源码修 | 236 把两处信封漂移点名进交接 |
| D-16 | 库存细码 | 盘点/批次改写腿未见 NOT NULL 与范围门之外的入口校验（0 与负数量可入库） | backend/src/services/inventory_stock_service.rs 与 services/inv/batch.rs | 自述 | 词表收口 | 218、248 侧记录 |

## 与推送次序绑定的两条依赖

1. D-01 与 D-02 的修在 `fix/inventory-transfer-and-user-status-gates`（提交 `0062a8a2`，本地未推）。
   它必须晚于测试面 bundle 合入，并在同一支里带上 216 第 9 段的随动改判（改成断 400 拒绝且 `is_active`
   不变，属只加严）。顺序反了就会由我亲手写出一枚新红。
2. D-01 补齐后要在 218 追加"零量""负量"两条拒绝腿，拒因文案与 `bad_request` 源码文案逐字同源。
