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
| D-22 | 验证层 取数工装 | 写请求根本没拿到 HTTP 响应时假报成功。两次建 PR 的调用都打印出 status=000，也就是 curl 一条响应都没收到，而脚本自身退出码仍是 0，外层包装按退出码判成成功，调用方以为已经创建、实际没有创建。同期只读侧取数工装的 GET 全部正常，所以不是网络面也不是 token 面 | E:/tmp/tools/api_write.sh 第 21 到 33 行把 curl 直接管给 node 收尾，全文只打印 HTTP 状态、没有任何判定与哨兵，管道退出码取的是尾命令 node 的 0，对照 E:/tmp/tools/api.sh 第 34 到 38 行，只读侧对非 2xx 往 stderr 打一行 API_HTTP_ 前缀加实际状态码的显式哨兵、并按 curl 自身退出码退出，两侧判定能力不对称 | 亲验（两枚工装体逐字读过并交叉比对判定段，缺判定与尾命令覆盖退出码这两点是代码事实。现场那两次 status=000 被外层判成成功属推送现场记录） | 工装修。HTTP 状态为 000 或空时必须退非零并打显式哨兵。修好之前口径为 工装缺陷在册，凡用它做的写操作（建 PR 与评论与改正文）返回值一律不可信，事后必须用独立只读端点回读确证。与"门禁结论只认日志自身哨兵与真实计数"同族，属验证层假绿 | 尚无断言钉住。本轮规避做法是改用 E:/tmp/create_pr.mjs（node 的 fetch，token 只从 ~/.gh_bingxi_token 读入、只打印 http 状态与 PR 编号、绝不打印 token），该工装成功产出后续三枚配对载体 PR |
| D-23 | 验证层 推送判定 | 把 push 的退出码与远端回读写在同一条命令里判定时，同行内联的命令替换先执行并覆盖了 $?，于是打印出的 push_rc 是命令替换的退出码而不是 push 的退出码。同一行里 git ls-remote 偶发的 schannel 与 SSL/TLS connection failed 因此被读成推送失败，而实际推送是成功的。这类判定器会把成功读成失败、也会把失败读成成功，与 D-22 同属假绿假红同源 | 判定行写法本身，即同一条 echo 里既取 $? 又内联一条 git ls-remote 的命令替换。正确做法已实证，push 单独一条命令并单独取其退出码，远端是否更新另用一条 git ls-remote 与本地 git rev-parse HEAD 做相等比对确证，本轮实测两者一致、且推送输出自身给出 new branch 字样，分支确为新分支 | 自述（判定行写法与相等比对结果由推送现场记录，本轮未复演该条命令，采信前需点验） | 工装修，属判定纪律而非源码缺陷。push 与远端回读拆成两条命令、各自单独取码，推送成败只以 ls-remote 返回的远端 sha 与本地 HEAD 相等为准，同行内联命令替换一律禁止用于取码 | 无断言面可钉（判据在编排侧写法里，测试面钉不住）。同类风险在判定器盘满假绿那节已记一笔，两处同族，排期时一并收口 |
| D-24 | 验证层 红面盘点判定器（自造只读工装） | 首版只看 `check-runs` 面就把 #1146 读成"可合"：该面在 run 尚未把 job 物化完之前就能凑出"零红"形状，pending 与 queued 的条目既不带 failure 也不被计进守恒，于是"还没跑"被读成"都绿了"。同一 head 的 job 面实为 14 项全部 queued 且有 1 条 run 未收口。这是假绿同族的第三枚，与 D-22（尾命令覆盖退出码）、D-23（同行内联命令替换污染 $?）同源，共性都是判定器本身没有检测力：run 级 status 是滞后聚合量，check-runs 总数少于 job 总数只说明未物化，不说明通过 | E:/tmp/pr_red_sweep.mjs 第 5 行（run 级 status 只作排队判断不作结论）、第 6 行（判可合必须同时满足失败 0 与未收口 0 且 completed 数达到该 run 的 job 总数）、第 36-37 行（check-runs 面只用来交叉核对，绝不单独据此判绿）、第 43-58 行（按 head sha 取最新一条 run 的 /actions/runs/{id}/jobs 逐 job 取 status 与 conclusion，jobs 为空即报"在跑或未物化"）。修复后复演输出原文：`PR 1146 e19ce7ae1 在跑（job 待 0，run 未收口 1，check-run 待 14）`，汇总行 `开放 6 支：可合候选 0 有红 0 在跑或未物化 6 未触发 0` | 亲验（工装体逐字读过并现场复跑一次取数，输出原文如上；首版那次误判属现场记录，未复演，修复前的写法已不在当前工装体内，由上述四条口径注释与守恒段自证） | 工装修，本轮已改并复跑有效。口径固定三条并写进工装头：判绿只认 job 面且必须 job 总数守恒；check-runs 面与 run 级 status 只作交叉核对；queued 与 in_progress 与 skipped 既不算红也不算绿。对外结论一律禁止只凭 check-runs 面下达 | 无断言面可钉（判定器在编排侧，不随 CI 跑，仓库内无对应用例，同 D-22 与 D-23）。排期建议：给判定器补一枚自证探针，照 prepush 工装已有的 probe_prepush_verdict.py 四情形含正向对照的做法，至少覆盖"全 success""含 failure""未物化（job 数少于 job 总数）""check-runs 全 completed 而 job 面仍 queued"四种输入，否则这三枚同族缺陷都会靠人守 |

## 验证层与测试面的四枚新登记（同日第二批，全部带可复现计数）

| D-25 | 验证层 门组脏树判定 | 把 autocrlf 车道的**行尾伪脏**当成真脏拦在起跑线：编辑器（prettier 写回 LF）改过工作树后，`git status --porcelain` 报 M，但 `git diff --numstat` 为空、索引 blob 与工作树文件 md5 逐字相同，`git update-index -q --refresh` 也刷不掉；门组在第一步就 `TREE_DIRTY` 退 8，整轮验证根本没跑，容易被误读成"我的改动把门禁弄红了" | E:/tmp/tools/prepush.sh 的脏树段（原 `DIRTY=$(git status --porcelain | head -5)` 直接判红）；现场证据是 wt-cred-literals 车道 53 号文件 index 与工作树同为 `43994d7953227be9a3b074120c012fdd` | 亲验（三件套取证：numstat 空 加 blob md5 相同 加 `git ls-files --eol` 给 i/lf w/lf） | 工装修，本轮已改：判脏前先刷索引，命中脏时再用 `git diff --ignore-cr-at-eol --name-only` 加暂存侧 加未跟踪三源复核，内容差为空即打 `TREE_EOL_PSEUDO_DIRTY <n> 枚，内容差为空，按干净处理` 并继续，不静默吞脏 | 已实测生效：同一车道从 `TREE_DIRTY` 变 `TREE_CLEAN` 后跑完整门并 `PREPUSH_GREEN` |
| D-26 | 验证层 凭证字面量棘轮门 | 门自身两处隐形，会让"加了门禁"变成"加了个不响的门铃"：一是属性名正则写成 `[A-Za-z_$][A-Za-z0-9_$]*[Pp]assword...`，要求 `password` 前面还有一个字符，于是**最常见的裸 `password:` 字面量恰好扫不到**（要 `testPassword`/`approverPassword` 这种带前缀的才命中）；二是作用面按 `process.cwd()` 解析（`../e2e`），在非 `frontend/` 目录跑就指向不存在的路径，报"零文件"或抛 ENOENT。两条都是自测夹具把它逼出来的：`--self-test` 先报 `expect=1 got=0`，修完作用面才露出真计数 | frontend/scripts/check-e2e-credential-literals.mjs 的 `SITE_RE` 与 `E2E_DIR`；复现是 `--self-test` 与 `--emit-baseline` 两条命令在车道里的原始输出 | 亲验（夹具正向对照三种形态原本 0 命中；改后 `CREDLIT_SELFTEST_OK planted=3 detected clean=0 flagged`，含带插值模板串不误报） | 工装修，本轮已改：属性名允许零前缀、值形态扩到单双引号与模板串、含 `${` 的插值串跳过、作用面按 `import.meta.url` 解析；自测夹具扩成"三正三负"逐文件计数而非总数，防再来一处隐形就整体哑火 | 基线未落盘（刻意的）：基线必须在测试面字面量清理合入后按当时主干生成，否则会把正要删掉的点位白名单进去 |
| D-27 | e2e 假清理腿与恒过断言 | 全库实量 607 个 DELETE 位点里 **10 处打在未注册端点**上：`/quotations/{id}` 两处、`/ap/payments/{id}` 两处、`/production/quality-inspection/records/{id}` 四处、`/purchase/inspections/{id}` 一处、`/production/lab-dips/{id}` 一处（该资源段整族不在快照里）。清理封装吞掉 405/404 ⇒ 用例全绿而数据一条没清。同位点还藏着一枚更重的**恒过断言**：44e-6 对不存在的 `lab-dips` 路径断 `toBe(404)`，"路由未注册"本身就回 404，断言从未跑到服务层删除门 | 判据来自 route-snapshot.txt（`DELETE` 注册 135 条）与 e2e 字面量对照；在册终结面速查：quotations 有 `POST /quotations/*/cancel`，ap/payments 只有 create 与 `/*/confirm`，purchase/inspections 头级只有 `/*/items/*` 可删，production/quality-inspection/records 只有 POST，打样通知单的删除路由在 `production/lab-dip/requests/*` | 亲验（扫描器三版迭代：初版把数字段与变量基底错判成幽灵虚报 26，二版矫枉过正把末段 id 变量算未解析 365，定稿口径为"末段变量即快照的 `*` 可判定、非末段含变量才算未解析、纯数字段归 `*`、泛型清理循环要采 `path:` 字面量"） | 测试面修：有在册跃迁的改走跃迁并断响应状态（报价单取消后断 `cancelled`，与写入方小写词表一致），无删除面的撤腿改依运行戳唯一命名隔离并在注释点名原因；44e-6 改指 lab-dip/requests 真路由 | 修后同一把尺子复扫该车道：未注册 21 降到 11（余 11 全是我采集器对"插值内含引号"的截断，非缺陷），在册 557 升到 558，正是 lab-dip/requests 那条改对的证据。提交面 `test/e2e-ghost-cleanup-legs2`（五笔） |
| D-28 | 编排工装 门日志并发与陈旧误读 | 两处都属"结论来自不该信的面"：一是串门链时用 `grep PREPUSH_` 等上一道结束，若那份 `.out` 还留着上一轮的哨兵，链会**瞬间放行并造成两道门并发跑**，两道门写同一个 `.out` 各自截断，判据全废；二是同名日志本身会陈旧，本轮就把 443 上一次跑的 `PREPUSH_GREEN` 当成新结论用了一次，实际那一轮的门当时还在 `gate_fe`。另外这台机 `pgrep` 不存在，用 `pgrep`+`kill` 做的"收口"静默空转，误以为已经排他 | E:/tmp/tools/prepush.sh 头部（现加锁段），以及本轮 `pgrep: command not found` 的原始报错与 447 的 `GATE_LOCKED` 输出 | 亲验（现场两次：一次把陈旧日志读成绿，一次起链后发现并发；锁生效证据是第二道对同车道的尝试被打回 rc=7） | 工装修，本轮已改：`prepush.sh` 起手用 `mkdir /e/tmp/.gate_lock_<车道>.d` 做按车道原子锁，第二道直接 `GATE_LOCKED ... 拒绝并发` 退 7，`trap rmdir` 释放，不同车道仍可并行；配套纪律是补跑同一车道前先 `rm` 旧 `.out`，判绿只认本轮 mtime 之后的哨兵 | 无仓库内断言面可钉（工装不随 CI 跑）。与 D-22、D-23、D-24 同族：判定器自身缺检测力，四处共性是靠人守而不是靠哨兵与守恒 |

## 工装层同日第三批登记（2026-11-02 深夜，全部带可复演命令）

| 编号 | 面 | 缺陷 | 证据位置 | 取证方式 | 处置 | 断言面 |
| --- | --- | --- | --- | --- | --- | --- |
| D-29 | 验证层 取数工装 | 写请求判定核缺失，curl 一条响应都没收到（HTTP 000）仍退 0，外层按退出码判成功（即 D-22 的原始现场）。本轮已修：curl 不进管道不放后台、状态码与响应体分落两个临时文件，curl 退码非零 或 状态码空或 000 或 非 2xx 或 2xx 零字节 四种一律退非零并打显式哨兵 | E:/tmp/tools/api_write.sh 的 verdict 函数与四拒一放的 --self-test；修前形态见本表 D-22 行 | 亲验（改后实跑 --self-test 输出 API_WRITE_SELFTEST_OK rejects=4 accepted=1；再拿不存在的 body 文件真调一次，输出 API_WRITE_CURL_FAIL rc=26 加 API_WRITE_FAIL，退码 8；随后 14 次真实写操作（7 条关闭评论 201 与 7 次改状态 200）全部 API_WRITE_OK） | 工装修毕。判定核与自检共用同一谓词，不走两套逻辑 | 无仓库内断言面（工装不随 CI 跑），自证靠 --self-test 的正向对照 |
| D-30 | 验证层 门禁并发锁 | 本会话新加的原子锁有两处自身缺陷。一 释放用 rmdir 而 owner 文件还在目录里，非空目录 rmdir 恒失败，等于每道门跑完必留一枚陈旧锁，下一道无条件判红；二 想按 pid 判持有者死活不可行，Git Bash 的 $$ 是 MSYS 侧 pid，tasklist 查它对一个正在跑的门也报零命中，/proc 那条路 kill 之后目录仍在，按 pid 判活会把活门当陈旧锁抢走 | E:/tmp/tools/prepush.sh 的 LOCK 段；实测输出为 对 5 个持有者 tasklist 全部 alive_rows=0 而其中至少一个门当时正在 gate_fe；kill 之后 procdir 仍 YES | 亲验（四形态探针复演 活心跳锁拒绝 rc=7、心跳造老 40 分钟接管、无效入参 ARG_INVALID rc=9、退出后 lock_absent） | 工装已改：owner 与 beat 先删再摘目录；陈旧判定改为心跳年龄（默认阈值 25 分钟，每开一档刷一次 beat），并在日志里写进年龄可复核；保留 FORCE_GATE_LOCK 抢占口 | 探针四形态含正向对照，可复演；无仓库内断言面 |
| D-31 | 验证层 入参面 | prepush 的位置参数把旗标吃掉。签名是 车道 基点 旗标，而惯用写法是把 --skip-heavy 直接写在第二格，于是 BASE 成了字面量 --skip-heavy，档 1 与档 2 要拿一个不存在的 ref 比差集；这类垃圾基点按原实现会静默继续，空差集＝假绿 | E:/tmp/tools/prepush.sh 第 12 到 20 行的旧写法；同轮 SUMMARY 行把基点截成 9 字符显示为 base=--skip-he 是直接指纹 | 亲验（本轮多次实跑都出现该指纹；同时定点复核档 1 日志，static_scan 自带基点推导，实量 changed_files=16 hard=0 debt=8 advisory=17，所以本批没有出现真假绿，但缺陷面成立且不依赖运气） | 工装改毕：先把旗标从位置参数里摘出来再定基点，旗标两种写法都认；进车道后用 git rev-parse --verify 强制基点可解析，解析不出就打 BASE_UNRESOLVED 并判红而不是判绿 | 两形态探针（垃圾基点判红 与 正确基点跑绿）已复演 |
| D-32 | 流程面 e2e 承载 | 同一批测试面改动散在七支 PR 上占七份并发验证名额，且互相之间没有合并验证。本轮按用户指令合成为一支 | 开放 PR 面实量分类（classify_open_prs.mjs 只读遍历 pulls 与 pulls/{n}/files）判出 7 支纯测试面加 1 支功能面；合流顶点 39f0e01ea 改动面 16 枚全在 frontend/e2e 下，非测试面文件数 0，号段重复检测为空 | 亲验（七次 git merge 全零冲突；统一支本地门组五档退出码全零 PREPUSH_GREEN；全量差集新增行 7299 行凭据预检命中 0） | 流程做法入台账：合流前先按文件面分类，只合纯测试面；合完必核三件事（差集纯度 号段重复 全量新增行凭据扫描），关闭旧支前先在被取代 PR 上留指认评论 | 无（编排面做法，非仓库断言） |
| D-33 | 验证层 e2e 号段 | 主干上三对 spec 同占一个号段（70、92、93），十枚用例编号各自在两个文件里出现一次。后果是判红时同一编号指向两处互不相干的断言，指认、计数与回归映射全会串 | 统一支合并时对 e2e/flow 逐文件遍历 test 标题前缀做重复检测，实量 171 个 spec、161 枚编号、10 枚重复；git ls-tree origin/main 确认三对文件的六个文件都已在主干且本支新增为 0；号段外引用面按 spec 文件排除后 grep 零命中 | 亲验（重复面来自本支引入的检测，不是推测；主干既有这一点是实量出来的，本支只解决了自己造成的 430 双占） | 本支不处理（测试面改动要单开一支，且六个文件都是主干件）；整改口径是按空闲号段重排其中一档并把文件名与正文标记同长度随动，不动另一档 | 检测器已在本支复演两次：改前 430 双占可见，改后 430 单占、431 单占，剩余重复恰为主干那十枚 |
| D-34 | 工装 显示面 | prepush 的 SUMMARY 行把基点按九字符截断输出，base=origin/main 打成 base=origin/ma。截断本身不改判定，但它正是上一轮 base=--skip-he 这一指纹的出处，读日志的人会据它误判基点，进而在合错基线上做后续决策 | E:/tmp/tools/prepush.sh 第 190 行的 `${BASE:0:9}`；同轮 SUMMARY 实测输出 base=origin/ma | 亲验（改前输出留在那轮日志里，改后同一档重跑输出 base=origin/main） | 工装改毕：SUMMARY 直接输出完整 $BASE，与 BASE_OK 行同源同串 | 无（纯显示面，判定不取该字段；基点可解析性由 BASE_UNRESOLVED 把关） |

## 与推送次序绑定的两条依赖

1. D-01 与 D-02 的修在 `fix/inventory-transfer-and-user-status-gates`（提交 `0062a8a2`，本地未推）。
   它必须晚于测试面 bundle 合入，并在同一支里带上 216 第 9 段的随动改判（改成断 400 拒绝且 `is_active`
   不变，属只加严）。顺序反了就会由我亲手写出一枚新红。
2. D-01 补齐后要在 218 追加"零量""负量"两条拒绝腿，拒因文案与 `bad_request` 源码文案逐字同源。
3. 主干 run 41326285558 的两枚实红要两支都合才收口，缺一不可，次序固定为 #1151 先合、#1154 后合：
   #1151 把打卷等七处状态门改走 `business_displayable` 并把数据权限详情按 404 出；#1154 带 211 的
   卷号与卷序号按写入方算式实量推导。实证（#1151 的 job 125050098828 断言原文）推翻了"先合 #1151
   就当场全绿"这一说，文案脱敏那半被 #1151 解掉后，`flow(7/20)` 仍红在写死序号的判据上，
   期望 `DL-20261102-414-002`、实得 `DL-20261102-414-003`——那半属测试面缺陷，只有 #1154 能解。
   若先合 #1154，其判据断言逐字点名状态门而源码侧仍脱敏，分片照旧红。
   `🚨 E2E 真实性门禁` 与 `🧹 收尾清理` 两枚不是独立缺陷——前者的 env 实证
   `CI_E2E_RESULT=failure`、`SETUP_WIZARD_RESULT=success`、`ROLE_MATRIX_RESULT=success`，属上游 ci-e2e
   的 needs 随动红，后者是聚合器，红面数到分片为止。
4. 两枚非源码类红的实证归位，避免被当成待修缺陷反复追。其一，#1154 的 `🧪 Rust 测试 (1/10)`
   （job 125114469827）输出只有 `❌ 分片 1 进程异常退出（EXIT_CODE=96）`，全日志零 FAILED、
   零 panicked、零磁盘错误字样，而该支改动面只有两枚 e2e spec，不碰 Rust，判为进程异常类红，
   处置是重放当前 head 而不是改代码，且当前主干流水线仍在 queued，重放要等队列松开。
   其二，`AUDIT_SECRET_KEY` 的字面量硬编在 ci-cd.yml 三处、coverage.yml 一处、e2e-batch.yml 一处，
   另有 e2e 专用变体两处，并随 job 日志的 env 段进入公开记录（仓库是 public）。
   这不是生产密钥泄漏，`config/settings.rs` 的强度校验与弱密钥黑名单会拒绝生产环境用这类模式值，
   `omni_audit_service.rs` 在未设置时只允许测试与开发环境回退默认值，生产直接 Err；
   但 CI 与 e2e 数据集的审计链 HMAC 密钥对外可读，意味着这两套数据里的审计条目可被任何人生成，
   排期时应把它当"测试面审计链不作为不可篡改证据"的口径记录，而不是当密钥泄漏去轮换生产值。

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

## 主干顶点的验证面现状与判定器的两类伪结论

主干顶点 3c886a82（即 #1150 落主干后）在本地逐字镜像 CI 的门组上，凡能静态验证的项全部通过。
light 档 22 步里 21 步为 0，fe 档 26 步里 25 步为 0（含 prettier、i18n 中英双侧、契约四件套、
路由挂载与路由快照、e2e 分片覆盖、选择器棘轮、playwright 用例枚举），be 档 backend 全量 1880 个
rust 文件格式面与 CI 同作用面合规。两枚此前带红入主干的分片判据也已在主干上改成正确形状，
211 现写"负例一律钉 HTTP 400 加状态门或校验门机器码族"，31b 现走"删前预检 200 才认删后 404"，
后端数据权限详情不可见也确实按 404 出。

唯一非零来自注释形态门禁，而且它是**前置拒跑，不是判红**。该门禁按 diff 行执法，规则要求差集非空；
当被审对象的 HEAD 与基线同 sha（正是"直接审主干顶点"这一形态）时它 fail-closed 退 2。
由此得出一条取证口径：**判主干有没有注释面红，必须用一支领先主干至少一笔提交的载体支去跑，
拿主干顶点自己跑必然拿到伪红。** 带 GATE_LOCAL_EVENT=push 复演时它给的那条 FAIL 也是同一前置
（差集为空即判失败），同属伪红。

判定器另一侧的缺陷更危险，已在工装侧修掉并自证。门组尾段原先靠回读磁盘上的汇总文件来数红档。
E 盘被 110 份工作树各自的 frontend/node_modules 写满到零可用之后，逐档追写汇总的管道全部失败，
汇总文件里一条红档都没落下，于是内存中 gate_light 与 gate_fe 与 gate_be 三档全坏仍被打成
PREPUSH_GREEN。这不是代码缺陷，是**结论生成器在共享态崩掉时的伪绿**，直接后果是可能按假绿推送。
现在的判定只认内存里逐档累加的红计数，并要求预期五档齐全、汇总文件里读得到本轮 SUMMARY 行，
三者任一不满足一律判红并点名原因。探针脚本 E:/tmp/tools/probe_prepush_verdict.py 从真实门体里
原样切出尾段跑四种情形（盘满且三档全坏、全绿且汇总可落盘、缺档未记录、全绿但汇总写不出去），
四种都符合预期，其中"全绿且汇总可落盘"作为正向对照确保修复没把门改成恒红。

还有一条运维事实要如实挂着。CI/CD Pipeline 自 08:15 起 in_progress 为 0，八条 run 全在排队，
而配对门、死代码审计、code scanning 同期正常 completed；仓库级 runner 列表返回 0 且本机没有
runner 进程与目录。执行体不在本机，恢复不由本会话决定。**在 runner 回来之前，主干的 e2e 与编译
验证面不可得，任何"主干已全绿""某枚红已修好"的话都只能停在静态面，不能提前下结论。**

空间口径也记一条，防止下次再把它当代码问题查。E 盘总 50G，占用与工作树份数正相关，回收 85 份
可再生依赖目录后也只回到 6.6G 余量，说明剩余体积主要不在依赖而在源码树本身。另外，判断某工作树
是否"已并入主干"不能用 sha 祖先关系：主干合并走 squash，被 squash 的分支头永远不是主干的后代，
按祖先判会把全部已交付车道误判成孤本。要判承载得按 blob 与行内容集合比，成本另计。

## D-35 主干现带一枚扫描器解析红，且本地任何门都看不见它

统一 E2E 支 #1163 合入主干后，"全面漏洞检测"作业在两条支上同时判负（#1146 与主干验证载体支
#1164）。job 125428071009 第三个复合步的运行输出是 semgrep 退出码 0 紧跟 PartialParsing，报错
路径唯一，位置在 448-business-sequence-gate-and-credit-limit.spec.ts 第 90 行第 35 列，原文形态
是从 helpers 内联 import 拿到的类型上再套泛型实参。

这条值得单独记，因为它不是断言错，是**门禁执法者的解析能力边界**。同一形态去掉泛型实参在主干有
260 处（内联 import 取 Page 与 Locator 类型），全部正常过扫描；只有内联 import 再套泛型实参这一种
会把扫描器的 TypeScript 解析器噎住，而该门禁按解析异常 fail-closed。vue-tsc 判合法，eslint 判合法，
prettier 判合法，本地整套门组判绿，红只在 CI 出现。写这条的起因是我自己派出去修 TS2339 的子智能体
选了这个写法——**子智能体为了让本地类型门过关而引入的写法，可以恰好把 CI 的另一个门弄红**，所以
它的产出不只要看"门有没有绿"，还要看有没有引入 CI 独有执法面的新形态。修法是把该类型改成顶层
命名导入后再写泛型，断言面一字不动，通过集合没扩大，属纯类型标注换位。已推 1f4355030 并开测试面
PR #1166，本地门组轻档三档全过（static_scan 与 lf_mirror 与 gate_light，23 步 failing=0，其中
覆盖本改动面的 e2e-types 与 comment-format-ci 均 rc=0）。同时补了一枚本地镜像检
E:/tmp/tools/e2e_semgrep_shape_check.mjs，只认"内联 import 套泛型"这一形态，带判定器自证（正向 2
反向 4 全对），当前 e2e 全树零命中——这形态以前只有 CI 抓得到，本地零覆盖。

## D-36 号段双占的两种形态与一条检测器必须自证的教训

复核主干 flow 目录时先写的检测器用了方括号形态的编号谓词，扫 181 个文件只认出 40 枚编号、报
"重复编号=0"。真实形态是 test 标题起首的裸编号，谓词整个错。若直接采信那个 0，D-33 会被"证伪"成
不成立。**"报 0"之前必须拿已知成立的那枚当正向对照**：改成从 test 标题起首取号并在代码里硬要求
70-01 必须被检出、检不出即自检失败非零退出之后，同一棵树给出 193 枚标题、183 枚唯一编号、
10 枚重复，重复面恰是 D-33 登记的三对，一条不多一条不少。

顺带把"双占"分成两种形态，别混为一谈。D-33 说的是**用例编号真撞**（同号段两文件里出现同名编号，
判红取证时一个编号指两处断言）。另有一种只是**文件名同号段而用例编号不撞**：60 与 79 各被两个文件
占用，但 60-greige-deeplink-redirect、79-flow-card-order-picker、79-print-task-real-chain 的用例
标题不带编号前缀，所以取证不歧义。后者属可读性问题不是缺陷，本轮不重排，只在此挂账，避免下次有人
把它当成同一枚缺陷去"修"。重排范围仍按 D-33 的三对，让位对象按外部引用面定：70 对里
70-chemical-contract-gaps 被后端迁移 m0068 的注释引用，改它会逼着动源码，而测试面变更必须独立成支，
所以让位的是 70-export-refund-base-and-incoterms-freight；92 与 93 两对按"后进主干的让位"处理
（保留方属 10-25 08:12 那一批，让位方属同日 21:03 那一批）。两位号段的空闲位只剩 37 42 49 50 57
59 63 64，65 到 111 全被占，四个在途分支均未新增 flow 文件，所以按升序取 37 42 49 分配给让位的三枚。

## D-37 环境盘满红与代码红同形，以及"动手前先扫本地未推提交"这条工序

主干一轮 Rust 分片红的真根因是 runner 写盘空间不足导致 nextest 归档解包失败，一个测试都没跑起来。
旧口径下这种失败与真实断言失败在日志上同形：非零退出、无 Summary 行，只能事后读制品最后 50 行人眼
分辨。整改落进 PR #1165 那一支的 ci-cd.yml（提交 dc841ae9），Rust 测试分片与 ignored 用例真库执行
两路作业都加了：跑测试前清执行体预装的安卓、dotnet、ghc 目录腾空间并打根分区与临时区可用量，清理
后仍低于 2 GiB 打 DISK_WATERMARK_LOW 告警；解包后把结论分成 ALL_PASS、TEST_FAILURE、ENV_DISK_FULL、
NO_SUMMARY、PROCESS_ABNORMAL_EXIT 五态，判定顺序上环境盘满先于测试失败，对外文案一律带 ENV_DISK_FULL
哨兵，取证工装可整片 grep 归类，不再靠人眼。

工序教训更值钱。这枚整改我先前已经写过一版**更完整的**实现，但它只躺在 repo1 本地 main 的一个未推
提交里（那个提交当时被任何远端 ref 包含，是孤本）。本轮开工时我没先扫本地未推提交，直接在车道里另
写了一版薄的：只把英文全文那条谓词放宽并加了个哨兵词，覆盖面明显不如已有那版。两处一起存在的话，
薄版会先把富版挡在合并次序前面。**先扫本地未推提交再动手写第二版**，扫描口径就是 `git branch -r
--contains HEAD` 判孤本加上对同主题提交的 `git log --all --oneline --grep`；本轮处置是丢弃薄版提交、
把富版 cherry-pick 进车道（一处冲突，取富版侧，因为归因块已整体上移），验证后推上去。

顺带记一枚字符集门的实测。给 PR 正文追加段之前，把"只认一张受限字符清单"的旧谓词换成白名单谓词
（认不出的字符一律拦下），带 12 类对照的合成夹具自证。结果旧正文里翻出 11 处受限字符（全角冒号 3、
全角分号 2、斜杠 6），当场 fail-closed 拒推正文，归一化之后才 PATCH 成功。这说明**受限字符集这件事
以前是靠人眼守的，没守全**；白名单谓词比黑名单谓词强，因为清单会漏、白名单不会。

