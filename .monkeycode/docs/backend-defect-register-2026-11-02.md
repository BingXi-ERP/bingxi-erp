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
| D-08 | 物流面单 | 行级归属门缺位（潜伏，非当前可控面）：运单登记在 `PRINT_SCOPE_NO_OWNER`，而归属门函数对一切非 `PRINT_SCOPE_GATED` 类型直接 `return Ok(())` 放行，注释自陈"PENDING 与 NO_OWNER 与未登记同样放行"，故 handler 传进去的 `DataScopeContext` 在这条腿上是死参数 | backend/src/services/print_service.rs:170-171 登记，同文件 269-277 门体放行；handlers/print_handler.rs:47-48 与 420-428 | 亲验（四处交叉） | 源码修（补归属门），且**必须与授权补授同支** | 249 已声明本轮不覆盖该水平面；**先前"任何过 RBAC 的登录用户可取任意运单"的说法被我证伪并撤下**，见下节口径 |
| D-09 | 扫码族 | `scan_to_ship_impl` 收下 `_order_id` 不用；GET scan-to-ship 返回硬编码空信封 | backend/src/handlers/barcode_scanner_handler.rs（217 文件头带坐标） | 自述 | 源码修 | 217 已钉 |
| D-10 | 导出族 | 登录日志与成本归集两条导出不读审批令牌、无 admin 门，与同族 sales-prices 腿不对称 | backend/src/handlers/login_security_handler.rs 导出腿；handlers/production/cost_collections 导出腿 | 自述 | 源码修（统一受理门） | 235 已把不对称钉成回归护栏 |
| D-11 | 报表引擎 | xlsx 走 `from_utf8_lossy`，非法字节被静默替换 | backend/src/handlers/report_engine_handler.rs:230 | 自述 | 源码修 | 235 侧记录 |
| D-12 | 业务追溯 | 正反向追溯对不存在主键无存在性检查，回 200 加空壳；快照腿反而有真 404 | backend/src/services/business_trace_service.rs:70-105 与 110-114 | 自述 | 源码修（统一 404 语义） | 252、254 分别钉 |
| D-13 | 角色授权 | 整批替换授权接受不存在的资源键，写进库不校验 | backend/src/services/role_permission_service.rs replace_role_permissions | 自述 | 源码修 | 215、254 |
| D-14 | 数据范围 | `scope-types` 广播五个大写值，写入侧只认三个小写档，取值域两侧不同源 | backend/src/utils/data_scope.rs:43-48 与 services/role_permission_service.rs:367 | 自述 | 词表收口 | 216 钉住不对称 |
| D-15 | 证书与商检 | 两个 handler 绕过 ApiResponse 信封直出模型，且不收 AuthContext | backend/src/handlers/certificate_of_origin_handler.rs:11-35；handlers/export_inspection_handler.rs:22 | 自述 | 信封统一 加 源码修 | 236 把两处信封漂移点名进交接 |
| D-16 | 库存细码 | 盘点/批次改写腿未见 NOT NULL 与范围门之外的入口校验（0 与负数量可入库） | backend/src/services/inventory_stock_service.rs 与 services/inv/batch.rs | 自述 | 词表收口 | 218、248 侧记录 |
| D-17 | 坏账核销打印 | 归属列其实存在，被"永久豁免"口径一刀切：清单头称这些表"不存在 created_by 或等效归属用户列因此永久豁免行级门"，但 `bad_debt_writeoff` 自己的条目注释写着归属语义由 `applicant_user_id` 承载、待裁定是否建等效门——同一清单里既有事实又有例外，按注释读会把可修的一条当成不可修 | backend/src/services/print_service.rs:161 起（清单头 158-160 与 bad_debt_writeoff 条目注释） | 亲验 | 口径裁定（定 applicant 序列是否算行级归属），裁定后转 源码修 | 尚无断言钉住 |
| D-18 | 验布打卷门 | 拒绝原因对操作员不可见：打卷前置门用 `AppError::business` 造错，出参 message 被脱敏成固定常量，操作员只知"失败"不知"须先评级才能打卷"；同族的库存不足类门走 `bad_request` 会逐字外显，两族口径不一致 | backend/src/services/fabric_inspection_service.rs 的 `validate_roll_preconditions`；对照 utils/messages.rs 的 `BUSINESS_PUBLIC` 与 utils/error.rs 的通道分族 | 亲验（主干红取证时逐字读过构造点） | 口径裁定后转 源码修（换可外显错误族）。**改前必须清点谁在钉"该门返回脱敏常量"**——211 已把常量本身钉成断言，换通道即打红 | 211 的判据形状已按当前契约钉住（随 #1154 提交） |
| D-19 | 报价单入口 | 展示面与鉴权面口径不一致（水平越权暴露面）：报价路由五处 `meta.permission` 写粗域键 `sales:read`，而报价端点挂在 `/api/v1/erp/quotations` 下、后端派生鉴权键是 `quotations` 加动作；`sales:` 粗域在前端守卫里展开到 14 枚细资源（orders 加 quotations 加 sales-returns 加 sales-contracts 加 sales-prices 加 sales-analysis 加 custom-orders 加 fabric-orders 加 customers 加 color-cards 加 color-prices 加 export-inspections 加 pieces 加 reports，实量自 router 的展开表），只持其中 `pieces` 读权的仓储岗因此在侧栏看得见"报价单管理"入口，点进去被后端判 403——入口对无权限岗位可供而动作必然失败 | frontend/src/router/index.ts 的 quotations 五条路由；对照 middleware/permission.rs 的键派生、services/init_service_ops/permission.rs 的 warehouse_keeper 授权组（不含 quotations） | 亲验（四处交叉：路由表 加 守卫展开表 加 鉴权键推导 加 授权种子） | 源码修（`sales:read` 改 `quotations:read`，与既有细资源键写法同构） | 已修在 #1155；权限快照与角色矩阵遍历用例（traversal/permission-model.ts 与 44-role-matrix.spec.ts）若因此转红属随动改判，须同支登记。**实证（2026-11-02 从 #1144 的 extras fullflow 制品取到断言原文）：`e2e/fullflow/40-quotation-role-journey.spec.ts` 早就把这条钉成断言"仓储棒侧栏不应存在菜单项 报价单"，实测 `Expected: 0 / Received: 1` 判红——被测侧正确、源码侧错，#1155 的细资源键改法正是这条红的解**。**改判的随动面（2026-11-02 实量）：角色矩阵遍历确实转红，且只有业务员岗判负——该岗是 e2e 补建角色（后端 init 只建 sales_rep，不建 salesperson），权限完全来自 global-setup 的手写镜像清单，而清单从未列 quotations:read；后端同名分组 sales_rep 本就持该键，故按同口径回补一枚读键、写面不扩，遍历基线里业务员的两条报价可达路由保持不变。反之 sales_manager 由后端 init 建角，镜像里那行对它不生效，权限取后端授权面** |
| D-20 | 报价详情页 | 操作员可被困在空白页且无提示：整张卡片（含唯一无条件渲染的"返回"按钮）被 `v-if="quotation"` 门住，取数失败或取到空壳时 `quotation` 为 null，动作区连同返回入口一起消失，页面上只剩空白。实测会话 sales_manager 进 `/quotations/{id}`，该页自身发的 GET 已回 200，但 15 秒内动作区始终未出现，判据 `locator('.actions .el-button', { hasText: '返回' })` 超时。后端详情腿确认走 `ApiResponse::success(dto)` 带信封，前端读 `res.data` 两侧同形，所以红点不在信封漂移，而在"取数成功但数据为空"时前端没有任何空态或错误出口 | frontend/src/views/quotations/detail.vue（`v-if="quotation"` 的卡片与卡内 actions、`loadData` 的 catch 分支）；对照 handlers/quotation_handler.rs 的 `get_quotation` 出参形状 | 亲验（制品断言原文 加 三处源码交叉；data 为空的具体上游分支还等证据在取诊断快照） | 前端修（把返回入口与空态提示移出 `v-if="quotation"` 之外，任何取数结果都留一条出口），后端侧是否存在"200 空壳"另案登记 | 40-quotation-role-journey 的 40-01 与 40-02 已把该出口钉成判据（随 #1144 提交） |
| D-21 | 错误外显族（D-18 的族面） | 把脱敏常量钉成契约的判据不止打卷门一处，主干实量为六枚文件十处：labor-contracts-readback 四处、data-import-lifecycle-readback 两处、44e-state-machines-extended、161-ap-request-schedule-reconcile-chain、160-ap-invoice-balance-aging-report-chain、crm/04-status-readback 各一处。这类点位等于用测试面把"操作员看不出被哪条门拒"合法化，与 utils/error.rs 里"何时允许 business_displayable"的硬规则相冲，后续任何把门改走可外显通道的源码修都会打红这些点 | frontend/e2e/enhanced/labor-contracts-readback.spec.ts、flow/126-data-import-lifecycle-readback.spec.ts、flow/44e-state-machines-extended.spec.ts、flow/161-ap-request-schedule-reconcile-chain.spec.ts、flow/160-ap-invoice-balance-aging-report-chain.spec.ts、crm/04-status-readback.spec.ts | 亲验（git grep 实量计数，六枚文件十处） | 逐枚判责后排期：状态门与删除门的拒因属操作员必须可见，改源码走可外显通道并同步判据；内部错误与第三方原文回显类维持脱敏，判据保留不动 | 计数可复现：对 `frontend/e2e` 取 `toBe('业务处理失败')` 得十处、六枚文件。**同批随动记录：#1154 一度把 211 的第二卷拒绝判据由点名状态门翻成该常量，并给 31b 详情通道加第三条 200 加 data 为 null 的通过形状，两处均已撤回——该支只保留卷号与卷序号按写入方算式实量推导那一半，31b 回到 404 或 200 加软删标记两态** |

## 与推送次序绑定的两条依赖

1. D-01 与 D-02 的修在 `fix/inventory-transfer-and-user-status-gates`（提交 `0062a8a2`，本地未推）。
   它必须晚于测试面 bundle 合入，并在同一支里带上 216 第 9 段的随动改判（改成断 400 拒绝且 `is_active`
   不变，属只加严）。顺序反了就会由我亲手写出一枚新红。
2. D-01 补齐后要在 218 追加"零量""负量"两条拒绝腿，拒因文案与 `bad_request` 源码文案逐字同源。
3. 主干 run 41326285558 的两枚实红只能由源码修解，次序固定为 #1151 先合、#1154 后合：#1151 把打卷等
   七处状态门改走 `business_displayable` 并把数据权限详情按 404 出，#1154 只带 211 的卷号与卷序号实量
   推导。若先合 #1154，其判据仍断言逐字点名状态门，而源码侧仍脱敏，分片照旧红；反之先合 #1151，主干
   两枚红当场转绿。`🚨 E2E 真实性门禁` 与 `🧹 收尾清理` 两枚不是独立缺陷——前者的 env 实证
   `CI_E2E_RESULT=failure`、`SETUP_WIZARD_RESULT=success`、`ROLE_MATRIX_RESULT=success`，属上游 ci-e2e
   的 needs 随动红，后者是聚合器，红面数到分片为止。

## D-08 的证伪过程与由此得出的排期口径

spec 249 文件头原写"任何过 RBAC 的登录用户可取任意运单 docx"。**这句不成立，已从台账撤下。**

不成立的原因在同枚 spec 内部就能自证矛盾：该腿是 `GET /api/v1/erp/logistics-tracking/waybills/*/print`
（`frontend/scripts/route-snapshot.txt:598`），权限键按 URL 段推导，段名是 `logistics-tracking`；而
`backend/src/services/init_service_ops/permission.rs` 全文对该段命中 0 次，种子只授 `("logistics", ...)`
（同文件 501、542、1380-1398 段）。249 自己的权限腿断的正是 `logistics_coordinator` 对本族四动作全 403，
与"任何登录用户可取"互相打脸。缺陷是真的，可达主体是假的。

真实口径：行级归属门确实缺位——`print_service.rs:269-277` 对一切非 `PRINT_SCOPE_GATED` 的类型直接
`return Ok(())`，注释自陈"PENDING 与 NO_OWNER 与未登记同样放行"，所以 `render_print_docx` 传进去的
`DataScopeContext` 在运单这条腿上是死参数。但当前只有 admin 短路能走到这个分支，它是**补授即开面**的
潜伏缺口，不是现网可控越权。

由此得出一条排期红线：**给任何登记在 `PRINT_SCOPE_NO_OWNER` 的类型所属 URL 段补授给非 admin 角色的 PR，
必须与该类型的归属门同支落地，不许拆成两支。** 拆开的后果是补授那支独立开出水平可控面，而那支自己一行
断言都不会红（它加的只是授权数据，门的缺失早于它存在），CI 抓不到，只有 review 能抓。

该清单在主干实量为 **十五枚**（`print_service.rs:161` 起，逐项数出，不是十枚）：`dye_batch_card`、
`color_card_issue`、`bulk_color_approval`、`quality_inspection_record`、`logistics_waybill`、
`unqualified_product`、`purchase_inspection`、`material_shortage`、`quality_8d_report`、
`supplier_evaluation_record`、`safety_accident_report`、`dye_batch_rework`、`bad_debt_writeoff`、
`after_sales`、`quality_issue`。一条红线管全部，逐个域补授时逐次生效。

清单头的注释还自陈这是一次**一刀切**：这些表"不存在 `created_by` 或等效归属用户列…因此永久豁免行级门"，
但其中 `bad_debt_writeoff` 自己的条目注释就写着归属语义由 `applicant_user_id` 承载、待后续工单裁定是否
建等效门（D-17）。所以"永久豁免"这个措辞与清单内部事实不一致，排期时不能按"不可修"处理。
