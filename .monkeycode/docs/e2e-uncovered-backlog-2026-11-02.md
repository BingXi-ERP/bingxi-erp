# 存量漏测疑点清单与处置批次（2026-11-02）

口径来源（2026-11-02 实测更正）：`cd frontend && node scripts/check-e2e-feature-pairing.mjs --self-test`
打印的 `SELFTEST_POOL current=… covered=… uncovered=… uncoveredNoUi=… uncoveredWithUi=…` 这一行。
本仓不存在 `scripts/e2e-pairing-coverage-baseline.json`，配对门也不支持 `--write-coverage-baseline`
（逐字 grep 该开关命中 0），早前一版把两者写成本数的出处属不实引用，已按实测改掉。定义＝该端点在
前端源码有调用点，但在 `frontend/e2e` 语料零引用。主干实量 `uncoveredWithUi=189`（分母 1822 枚端点、
已覆盖 1166 枚），这是 189 这个数的可复现来源；门体只打印计数不打印成员，逐条点名要用成员清单时
须临时写探针把同一谓词命中的数组落盘，禁止凭记忆列成员。

配套目标见 [E2E 与质量治理总纲](./e2e-master-plan-2026-11-02.md)，本文件只负责"这 189 枚怎么消化"。

## 一、先分类再动手（五类，合计 189）

| 类别 | 数量 | 处置 | 去处 |
|---|---|---|---|
| B0 随废除而消 | 5 | 不写用例。全部是 `generate-no` 族（库存调整、盘点、调拨、销售订单、凭证）。本仓已裁定这些单据号展示端点属死端点或假可供性，方向是废除；它们进 e2e 等于给要拆的东西补锁 | 废除支落地后分母自然降 5。对外可见面的收法需用户拍，不在本清单强推 |
| B1 导出、打印、模板 | 18 | 补测，走总纲 C9 簇：导出按角色裁列、脱敏、内容与当前筛选一致，打印内容与模板配对，导入模板与入口双向配对 | W1-C 批，号段 235-239 |
| B2a 审计与账号观测 | 10 | 补 e2e，走 C11 与 C1：审计日志检索与导出、业务反查（backward／snapshot）、告警确认与解除、锁定账号解锁、登录日志 | W1-D 批，号段 248 起 |
| B2b 运行时观测面 | 23 | 判为**不该占 e2e 号段**。`health`、`stats`、`slow-queries`、`api-gateway/stats`、`admin/failover/*`、`ws/*`、`device-connections/*`、`email-*`、`init/initialize-with-db`、`send` 这类是运维观测与通道面，正确载体是后端集成测与 smoke，用 UI 点它们只会造出恒过断言 | 转后端集成测批次；分母口径不变，等相应用例落地后下降 |
| B3 用户与角色与权限键 | 16 | 已在跑：号段 214、215、216 三条 spec（写后回读链、角色档案链、权限键与数据范围变更链，含非 admin 越权且库内零写入） | `wt-e2e-acct` 车道 |
| B4 业务动作面 | 117 减 B2a 与 B3 后余量 | 按域切批补测，见第二节 | W1-E 起 |

## 二、业务面（B4）按域分布，决定批次切法

域计数（前端有调用点却零 e2e 引用）：`inventory` 13、`production` 11、`ai` 9、`financial-analysis` 6、
`warehouses` 5、`ar` 5、`bi` 5、`finance` 5、`quotations` 5、`ai-models` 4、`crm` 4、`logistics-tracking` 4、
`products` 4、`sales` 4、`scanner` 4、`dashboard` 3、`export-inspections` 3、`purchase` 3、`bpm` 2、`budgets` 2、
`customer-shares` 2、`customer-team-members` 2、`period-adjustments` 2，其余 13 个域各 1。

批次按"同域 3-6 项一支"切，不按字母序，也不按剩余量平均分配：

| 批次 | 域组合 | 覆盖动机（对应总纲簇） | 号段 | 状态 |
|---|---|---|---|---|
| W1-A | scanner 全部 4 枚加 warehouses locations 5 枚 | C2 写后回读、C7 并发、L4 移动端扫码与视口 | 217、218（219 未启用） | 已写，本地未推（`wt-e2e-scan` 与 `wt-e2e-bundle`） |
| W1-B | inventory 的批次、盘点明细、调拨明细、物流签收 4 组读写 | C2、C3 删除联动、C6 时序门（未签收禁对账） | 248、249（250、251 留空） | 已落地未推（`wt-e2e-inv` 7258075d 248 共 855 行；`wt-e2e-sign` 678e274d 加订正提交 009af378，249 共 700 行 16 条用例） |
| W1-C | B1 导出打印模板 18 枚 | C9 导出裁列与脱敏、模板配对 | 235-239 | 在跑（`wt-e2e-export`，实占 235、236；237-239 空待派） |
| W1-D | B2a 审计与账号 10 枚 | C11 追溯（按缸号／订单／客户反查）、C1 会话隔离 | 252-254 | 已落地未推（`wt-e2e-audit`，252 与 253 与 254 各一枚提交） |
| W1-E | production 与 ai 与 ai-models 共 24 枚 | C8 成本归集与分摊、面料专项场景（缸差、缩率、损耗） | 255-260 | 255 已落地未推（`wt-e2e-acct` d699bad7，加料处方状态流转与配方计算，773 行）；**256 经十一枚在途车道横扫实量不存在**，此前任何"256 在跑"的记录都不成立，256-260 待派；`ai` 族是否属真用户可达功能仍待确认 |
| W1-F | 财务族 financial-analysis、ar、ap、finance、budgets、period-adjustments、vouchers、exchange-rates 共 24 枚 | C8 结算口径（明细与合计无分差、核销、红冲应收联动、账期与逾期） | 261-264（265、266 留空） | 已落地未推，优先级 P0（`wt-e2e-acct` cc85d114 261 共 607 行；`wt-e2e-scan` aadde57d 262 共 1001 行 11 条用例；`wt-e2e-export` a086d9b9 263 共 1492 行；`wt-e2e-audit` be06c537 264 共 1139 行） |
| W1-G | 其余长尾 13 个单枚域加 sales、purchase、quotations、crm、bpm、dashboard | C2、C6、C1 | 267 起 | 待派 |

## 三、每批合入后的可核对期望（防止"补了但没降"）

合入一批就跑一次 `cd frontend && node scripts/check-e2e-feature-pairing.mjs --self-test`，取
`SELFTEST_POOL` 行的 `uncoveredWithUi` 与 `covered` 两个计数，看 `uncoveredWithUi` 是否按该批点名的
端点数下降。判据三条，缺一条就算这批白做：

0. 实测样例（2026-11-02 本轮 W1 载体，15 枚 spec 全部入库后）：主干面 `covered=1166`、
   `uncoveredWithUi=189`；载体面 `covered=1269`、`uncoveredWithUi=101`。即新增覆盖 103 枚端点，
   有界面漏测债降 46.6%（两面的分母同为 1822，可直接相减）。同一分母是这条判据成立的前提，
   分母不同说明两侧快照的 route-snapshot 不同版，数字不许比。

1. 分母下降量等于该批点名的端点数（不等就说明有用例没有真引用到路径字面量，属本仓已知的
   "URL 收进 helper 体内导致判定器绑错实参"形态，正解是把路径字面量写回调用点）。
2. 分片覆盖门 `check-e2e-shard-coverage` 绿，且新用例被 `playwright test --list` 枚举到（新用例数增加）。
3. 用例断言指名期望值。出现 `toBeGreaterThan(0)`、只断言元素可见、`try/catch` 吞断言、`?? []` 掩盖缺键、
   钉中文字面量当断言依据，一律视为未覆盖。

## 四、更新纪律

基线文件与成员清单只能由生成器重算，禁止手改数字（判定器会比对计数与成员清单长度，不一致直接
`TOOL_BUG` 退 9）。号段在本文件预分配后，派工前仍要横扫一次全部工作树实量，别引用这里写的历史链尾。
