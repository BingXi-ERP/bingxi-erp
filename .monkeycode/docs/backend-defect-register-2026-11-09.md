# 后端缺陷台账 2026-11-09 分册

## D-60 调拨拒因文案在同一句里出现两处场景词

级别 P3 文案，无红暴露，不挡合并。

现象与证据。调拨维度校验的拒因由场景前缀加内层原因拼成，前缀由 `backend/src/services/inv/stock.rs` 第 52 行与第 215 行以字面量 "调拨出库" 传入，内层原因由 `backend/src/services/inv/fabric_class.rs` 第 63 行给出「染色布必须提供缸号（color_no=… 但 dye_lot_no 为空）」。缺批次那一支的内层文案在 `fabric_class.rs` 第 57 行自带「明细缺少批号：出库对染色布按缸号+色号+批次+匹号四维强制追溯…」，其中已含"出库"场景词，于是同一句外内两段都各报一次方向，用户可见串为「调拨出库：明细缺少批号：出库对染色布按…」。

判责。属源码侧文案组装缺陷，不是测试钉错。功能判定本身正确：缺批次确实该拒，缸号缺失也确实该拒，四维追溯与白坯豁免口径与 `fabric_class.rs` 第 35 行起记的统一规则一致。

修法二选一。一，把内层原因里重复的方向措辞去掉，让场景只由前缀承载；二，让拼前缀的地方只在原因未自带场景词时才拼。推荐取一，改动面小且不改变任何判定路径，也不影响既有 e2e 断言中逐字钉住的那条缸号文案。

载体归属。库存调拨与门控域。现有开放支中没有该域的载体支（`fix/inventory-transfer-and-user-status-gates` 未开 PR），按一域一支的规矩，待有名额时随该域一并处理，不单开第三支。

同日关联。三份重复测试文件的 flow16 定性与两案解锁次序见 `main-red-forensics-2026-11-09.md`。

## D-61 通知中心入口权限键与读面不同源，普通岗双向受阻（P2，主干真缺陷，无红暴露）

取证参照面是 origin/main，不是本地工作树（本地 main 落后远端二十四笔，工作树 grep 会造假缺失，判据见主线红取证文档结论十）。

事实三条。一，frontend/src/router/index.ts 第 827 行通知中心路由的 meta.permission 写的是 users:read。二，frontend/src/views/notification/index.vue 第 305 行读的是 /notifications，该族路由在 backend/src/routes/analytics.rs 第 419 到 433 行，挂 list 与 get 与 delete 与 read 与 unread-count 与 read-all；按 middleware/permission.rs 从 URL 段推导权限键的规矩，读面要的是 notifications:read。三，该页第 287 行确实 import 了 getUserList，第 512 行注明系统公告直发走 POST /notifications/announcement 且权限为 notifications:create，所以 users:read 是公告直发时选收件人的合法需求，不是可以一并撤掉的东西。

后果双向。持 notifications:read 而不持 users:read 的普通岗看不到菜单入口，明明有权读自己的通知却进不去；持 users:read 而不持 notifications:read 的岗看得到入口，进去列表 403。入口门与读面门各判各的，属权限键不同源族缺陷，与目标里"按钮级权限逐页验证"和"三端权限一致"两条直接冲突。

修法方向。路由 meta.permission 改为 notifications:read 与读面同源；页内系统公告直发按钮另按 notifications:create 门控，收件人选择器另按 users:read 门控，两个门控用 v-permission 落在控件上而不是落在整页入口上。配套 e2e 按角色双向验：有读权限无用户权限的岗必须看得到入口且列表可读，有用户权限无通知读权限的岗必须看不到入口或进去被明确拒绝，公告直发按钮只对持 create 权限的岗可见。

待核一项。notifications 这一族在角色权限授予矩阵里的实际授予面尚未核实（本轮所用检索路径未证明在册，按两种口径判据不能据单一零命中下结论）。若矩阵里根本没有 notifications:read 的授予行，则改入口键后普通岗仍进不去，修法要连带补授予行，这一点必须在动手前核清。

载体归属。通知与权限域。现有六支开放载体（物流面单、应收发票、BOM 下线、超折扣门、审计定位、面料补测）无该域承载，按一域一支与名额纪律，待 1188 合入释放名额后随该域一并处理，不塞进域不符的在途支。看板对应任务号 54。

## D-62 微信订阅消息只有数据模型没有发送腿，通知链路里该渠道恒不可达（P1，功能缺失）

现象与实证（两条互不依赖口径同日实测，参照面 origin/main，本地 main 落后 24 已先 fetch）：

1. 在册文件侧确有该渠道的数据模型：backend/src/models/notification_subscription.rs 与 backend/src/models/notification_template.rs 都在仓库树里（按 git ls-tree 取实名，不是按目录扫版本列）。
2. 发送侧整族零命中：全仓 backend/src 搜 subscribe_msg、subscribe_message、模板发送相关符号，零命中；notification_service.rs 也在册（所以这不是路径没取到的假阴性，而是真零）。同一文件的 retry、attempt 一类失败重试符号同样零命中。

结论：站内信渠道是真的（410 与 454 两档用例已断到收件人解析、去重窗口、内容不泄露成本列），微信订阅消息这一渠道只有表没有腿——订阅关系存下来了，永远没有任何代码把它发出去。目标里"微信小程序独有链路：订阅消息推送"与 4.7 的"站内、微信订阅消息等渠道触达校验"因此不可能有真用例，写出来也只能是假绿。

附带一条同族缺口：4.7 还要求"失败重试"。通知服务侧无任何重试语义，事件总线与采集类服务里有 attempt 类写法，说明仓内不是没有重试范式，而是通知腿没接。

修法方向（未拍承载支，等 #1188 与 #1168 合入后按域排）：

1. 订阅消息发送只走一个出口点，凭据从环境变量读（appid、secret、模板 id 三者都不许落库、不许进源码字面量、不许进日志），发送结果必须落一行可回读状态（成功、失败、失败原因码），失败可重试且有退避与次数上限，不许静默吞。
2. 收件人解析必须复用 D-56 已裁定的那一个解析点，不得在发送腿里再算一次角色到用户的映射，否则两处口径会分叉。
3. 触达判定不得以"调用没抛错"当成功，要按微信返回体里的错误码判；发送状态要能在只读端点或审计里回读，配套 e2e 断"订阅关系存在时才发、未订阅时显式跳过并把跳过原因写进状态、失败重试后只落一条终态"。
4. 本条与小程序域一支（#85）同域：树、门禁、微信后端腿应一支带走，不再另开分叉支占名额。

## D-63 功能与用例映射检查只在 PR 面触发，目标 4.13 要求的定期执行没有承载（P2，门禁缺口）

实证（同日实测，参照面 origin/main 的七份工作流原文，按 git show 取档后数 schedule 键）：

1. e2e-pairing.yml 的 schedule 计数为 0。该门自述用途是把"新增后端端点必须配套 E2E 用例"落成 PR 门禁，只在 push 与 pull_request 上触发，另有 workflow_dispatch 手工入口。
2. 带 cron 的只有三份工作流：coverage.yml、dead-code-audit.yml、vuln-scan-daily.yml。ci-cd.yml、android.yml、e2e-batch.yml、e2e-pairing.yml 四份的 schedule 计数均为 0。

后果：主干合入路径不经过该门。两条各自配了用例的支背靠背合并时，配对门只看见各自那一段 diff；合入主干后如果有人删了用例文件或把端点改了名而没动新增侧，主干没有任何定期机制会再判一次。目标 4.13 写的"定期执行功能与用例映射检查，识别漏覆盖功能"目前只有 PR 面触发，不构成定期。

修法方向（按仓内新门接入三件套执行，未拍承载支）：

1. 给 e2e-pairing.yml 增加一条 cron（每日一次，时刻与已有的两枚定期扫描错开），同一判定脚本切两种模式：PR 面保持现在的判负语义，定期面先只报告加棘轮基线，只新增漏配判红，主干存量债不一次挂红所有在途支。
2. 定期模式必须跑在全量面上：基线取主干顶点而不是分支起点，否则并基后仍只看本支 diff，等于没扩面。
3. 工具故障与判定不通过要分开：脚本报错归 unverified 并显式打点，不许把取数失败读成零漏配。
4. 该 job 若新建，必须同时加进 ci-cleanup-retry 的 needs 清单，否则收尾门聚合不到它。

## D-64 审计防篡改的 DB 层只追加约束只覆盖导出二次审计表，两张主审计表没有（P1，安全纵深）

目标 4.11 要求"审计日志不可篡改"。实证分两层，两条口径互不依赖（同日实测，参照面 origin/main）：

1. 应用写面：审计路由全族只有 GET 与 POST 追加（GET 列表、GET 导出、GET 单条、GET summary、POST print-event、GET export-logs），analytics 与 crm 两处审计挂载点同样只有 GET 与 POST，全仓路由里没有对审计的 PUT 与 DELETE。这一层是真的。
2. DB 层：backend/migration 全族共 8 枚 CREATE TRIGGER，其中只有 trg_audit_log_export_log_no_update 与 trg_audit_log_export_log_no_delete 是防篡改语义，目标表是 audit_log_export_log（V15 的导出二次审计表），函数 fn_audit_log_export_log_immutable 对 UPDATE 与 DELETE 一律 RAISE EXCEPTION。其余 6 枚是部门维同步触发器，与防篡改无关。另有 5 枚 CREATE POLICY 只挂在 customers、suppliers、sales_orders、crm_lead、crm_opportunity 上做行隔离，没有一条挂在审计表上。

后果：audit_logs 与 omni_audit_logs 两张主审计表在库里可被任何有该库连接权限的角色直接 UPDATE 与 DELETE。绕过 HTTP 直接落库改写审计历史，没有任何 DB 层防线会拒绝；而仓内已有的那张表证明了范式与写法都现成，不是不能做，是两张主表没做。

修法方向（登记为缺口，承载待按域排，建议与审计域一支同走）：

1. 照抄 audit_log_export_log 的既有范式给两张主表补同一形状的 BEFORE UPDATE 与 BEFORE DELETE 触发器，异常消息里点名表名，迁移必须幂等（DROP TRIGGER IF EXISTS 再 CREATE）并配探测式前置检查，不许让建库期撞上 42601 一类串内注释坑。
2. 触发器只挡直连库改写，挡不住持有超级权限的角色，因此验收面要同时断两条：直连库 UPDATE 被拒且错误码可见，以及经 HTTP 无删除面（现状态已满足，用例要钉住防回归）。
3. 若要做链式校验（行级 prev_hash 加当日校验），属新增列与新迁移，本条先不合并进来，等 1 与 2 落地后另立条目评估。

## D-65 系统公告入口的前端权限键与后端角色判定不同源，非超管看到可用卡片却恒被拒（P2，假可供性）

实证（同日实测，参照面 origin/main 两处原文）：

1. 后端 notification_handler.rs 的 create_announcement 不看权限键，走 is_admin_role(role_id) 判定，admin_checker.rs 里该判定的真相源是 ADMIN_ROLE_CODE 常量等于 admin，非 admin 一律返回"系统公告仅限管理员发送"的权限拒绝。
2. 前端通知页把公告卡挂在 notifications:create 上，而 init_service_ops/permission.rs 的岗位矩阵里 admin_assistant 显式持有 notifications:read 与 notifications:create 两枚，同时也持有 users:read。

后果：admin_assistant 进通知中心能看到公告卡并填写标题正文，点发送必被后端 403 拒。这不是越权（后端拒绝方向是对的），是前端把不可用的能力摆成可用，属目标里"按钮级权限逐页验证"与 4.8 拦截口径要覆盖的形态。同一处还有第二种分叉风险：只要以后有任何一个岗位被配上 notifications:create 而它不是 admin，就自动复现该假可供性。

修法方向（与 D-61 已收口的通知域一支同支，不另开支）：

1. 二者必须同源，只能选一种：把受理面的角色判定换成权限键判定（并让矩阵只有 admin 持 notifications:create），或者前端把公告卡的可达条件改成与后端同一 admin 事实。建议前者，理由是仓内鉴权键由 URL 段推导，权限键才是唯一口径，硬编码角色码是第二套真相源。
2. 配套 e2e 断两向：持 notifications:create 的非 admin 岗位公告卡不可达（或点发送得到与后端一致的拒绝文案），admin 岗位发送成功且 delivered_count 由库里回读。
3. 不许用前端隐藏代替后端判定，也不许把后端判定放宽成权限键而矩阵仍发给非 admin，那样会把拒绝变成真发送。

## D-66 取档回来的小程序源码缺四张页面，11 处跳转是死链（P1，功能缺失）

实证（同日实测，工作树 wt-mp-land 分支 feat/wechat-miniprogram-domain）：门禁 `bash scripts/ci/miniprogram-checks.sh` 首轮真跑 rc 1，第七道报 `MP_ROUTE_RED 有 11 处跳转路由落不到 app.json 声明页`。11 处调用点去重成 10 个"调用点文件 加 跳转目标"键，归并为 4 个落点页。双口径逐条核存在性：一是查页面上的 wxml 与 json 文件，二是查 app.json 的 pages 与 subPackages 声明，四个落点两口径全为零。

四个缺失落点分别是发布需求 post-demand、报价信息 offer-info、选择报价 my-post-result-choose、需求订单详情 demand-order-detail。app.json 的 demand 族实际只声明 13 页（demand-square、demand-banner、demand-detail、demand-order/index、add-address、address-manage、my-demand、my-post-result-detail、my-post-result、my-post-schedule、search-demand、search-join、search-post），均不含上述四页。其中 offer-info 的调用点字面量写成 offer-onfo，看似笔误，但把正确拼写一并查也是盘上零文件零声明，故不能只改拼交了事。

后果：这四条链路的入口在界面上可点，点了必然跳转失败。目标里"询样提交""客户自助对账确认""看订单进度"这类小程序独有链路因此实际不可达，属功能缺失而非用例缺失。

处置与边界（本轮已做与不许做的分开写清）：

1. 已做：第七道改只报告加棘轮基线（提交 9771a888b）。基线文件 scripts/ci/miniprogram-route-baseline.txt 十条键不含行号，理由是行号会随上方任意改动漂移而造出假新增；判定改成分层，基线内打 MP_ROUTE_RATCHET baselined=N new=0 并返 0，基线外新增打 MP_ROUTE_NEW_DEAD 逐条点名后判红；缺基线文件或基线去注释后为空一律走 tool_bug，不把读不到参照面咽成没有新增。改后三件验证齐过：bash -n rc 0，--self-test 仍 caught=7/7 missed:0 与 MP_DETECTOR_OK（证明反向探针没被基线吞掉，新增判红路径仍有效），真跑 MP_CHECK_GREEN 且 STEP_END routes rc 0。
2. 不许做：不凭空补造这四页。页面业务逻辑未知，造页等于编功能，属仓内禁止的假可供性，也与"测试要真测"相悖。基线文件头已写明修掉一条就从基线删一行，基线是债务台账不是免修凭证。
3. 待办：拿真实小程序源（或向业务确认目标页应落何处）逐条补齐，补齐后同支删对应基线行并把跳转链路的 e2e 或小程序侧用例补上；号段用 473 到 479 中已划给小程序域的号。
