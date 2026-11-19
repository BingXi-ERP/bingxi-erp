# 缺陷与功能补齐闭环看板（2026-11-19）

口径来源：本看板按目标第七、八章建立，是当前缺陷/功能补齐工单的唯一可视化入口。每条工单标注类型（Bug 缺陷 / 功能补齐）、优先级（P0/P1/P2）、状态、准入证据、关联 E2E 用例或 PR。状态流转遵循 7.3：新建 → 待评估 → 待开发 → 开发中 → 待测试 → 验证中 → 已关闭 / 搁置，不允许跳步。事实以本仓与远端 PR 现状为准，凡与早期报告冲突以本看板实量结论为准。

## 一、状态看板（P0 置顶）

### 验证中

| 编号 | 类型 | 优先级 | 标题 | 准入证据 | 关联用例 / PR | 负责人 |
|------|------|--------|------|----------|---------------|--------|
| DC-001 | 功能补齐 | P1 | 小程序接口层客户越权 E2E 用例集 | miniprogram/ 有工程但 6 条独有链路零 E2E，仅 7 道静态门（completion audit 实量） | `frontend/e2e/miniprogram/01-customer-access.spec.ts` / PR #1320 | 测试 |
| DC-002（第一批） | 功能补齐 | P1 | 写操作参数篡改 IDOR（目标 4.1-P / 3.6） | 现有 data-scope-isolation 仅覆盖读越权；换他人 ID 改金额 0.01、DELETE 他人单据的写越权为真实缺口 | `frontend/e2e/miniprogram/02-write-idor.spec.ts` / PR #1320（head fcff7e120） | 测试 |
| DC-010（回归失效） | Bug 缺陷 | P1 | AP 手机卡片支付方式断言共享红——原记已关闭，抽检证实修复未入主干 | blob 级取证：#1303 open/merged=false，主干 `ap-mobile-parity.test.ts` 最后提交是 #1252、仍无 `paymentMethodLabel`/`expectedPaymentMethod`、断言全宽度 `toBe('bank_transfer')`；而主干组件桌面列 `paymentMethodLabel` →「银行转账」/「Bank Transfer」，手机卡片用原始 token | 待 #1303 或其 cherry-pick 载体（#1308/#1307/#1297）合并入主干后，blob 回读测试已按宽度分治再重关 | 测试 |
| DC-003 | 功能补齐 | P1 | 统一测试数据工厂 builder API | 代码已交付：`frontend/e2e/factory/test-data-factory.ts` 聚合客户/线索/色卡原子造数、自动追踪 id、LIFO 统一回收；`data-factory.spec.ts` 为真实消费者（造数→按 id 回读→cleanup）。字段照抄已验证端点，不自造键 | 载体分支 `test/data-factory-1119`（commit `114e0fb`）已推送保工；本地 prettier/eslint/`playwright --list`、配对门 `PAIRING_GREEN`、api-paths 门均绿；待 CI 队列消化后开 PR、全量绿且合入 main 再关单 | 测试 |

验收标准（7.4）：客户角色越权访问 5 个内部单据端点（sales/orders、products、ar-reconciliations、crm/customers、purchase/orders）由后端返回 401/403；CI 全量面绿；不依赖前端按钮隐藏。事实核对已记入 PR #1320 描述（端点在 route-snapshot、权限码在册、不在 AUTH_ONLY、customer 可登录）。

DC-002 第一批验收标准（7.4）：两个不同 user_id 的 self 角色，跨 owner PUT 把他人线索金额改成 0.01、DELETE 他人线索，后端返回 403 固定脱敏信封并带字符串机器码；owner 回读金额仍为原值、记录仍在（实证未篡改）。后端承载体为 `update_lead`/`delete_lead` 的 `ensure_cross_owner_write_allowed` 写门（crm_handler.rs:719/753）。本地静态检查 prettier/eslint/playwright --list 全绿；CI run 44601446625（CI/CD）+ 44601446715（配对门）在新 head 物化 pending，待终态方可关闭。

### 待开发

| 编号 | 类型 | 优先级 | 标题 | 缺口证据 | 计划 | 负责人 |
|------|------|--------|------|----------|------|--------|
| DC-002（余项） | 功能补齐 | P1 | 询样/对账跨端互通与分享卡片可见性正向用例 | 第一批写 IDOR 已进验证中；远端树复核纠正假阴：`flow/431-customer-team-share-and-signature.spec.ts` 已覆盖 customer-shares 的 403+FORBIDDEN 统一机器码、by-user 通道只回读本人行且交叉互查不可见，在途 #1300 还有 531/532 小程序共享契约——"分享卡片越权负例空白"不成立，勿重复建设。真实余项收敛为询样提交/客户对账确认的**正向可见性**，受 DC-007 客户业务账号缺失约束 | 负例不重复建；正向待第一批 CI 终态且 DC-007 账号体系明确后同专支追加 | 测试 |
| DC-004 | 功能补齐 | P2 | 分环境预制脚本与独立库隔离 | `playwright.config.ts:48` baseURL 写死 localhost，CI 45 分片共用同库，仅靠账号前缀+时间戳唯一名隔离 | 与 DC-003 同域 | 测试 / 运维 |
| DC-008（重开） | 功能补齐 | P1 | 联动影响矩阵 PR 门禁（4.41.N）——原误判已关闭，抽检证实未落地 | blob 级取证：#1306 open/merged=false，`check-e2e-linkage-gate.mjs`/`e2e-linkage-gate.yml` 在 main NOT_CARRIED，main 的 ci-cd/e2e-batch/e2e-pairing 对 linkage 引用均为 0，主干仅有「信息工具，不是门禁」的 report 脚本；对应任务 #41/#47 仍 in_progress | 兑现载体已验证：#1306 的 `check-e2e-linkage-gate.mjs` 有 `process.exit(0/2/3)` + `--self-test` 正向对照，ci-cd.yml 新增 `ci-e2e-linkage` job 并挂进 `ci-cleanup-retry` needs，是真 fail-closed；其旁路门「联动影响矩阵静态检查」已 success、全量门 queued。待 #1306 合并后 blob 回读再关单，不再凭脚本存在关单 | 测试 / CI |

### 待评估

| 编号 | 类型 | 优先级 | 标题 | 判定要点 | 卡点 |
|------|------|--------|------|----------|------|
| DC-006 | Bug 缺陷 | P0 | #1302 合并阻塞（mergeable=false / state=dirty） | 23 支开放 PR 中唯一脏支，46 文件与已合并移动端支冲突，CI 绿也无法 squash 合并 | 收口末期处理：fetch --unshallow → merge origin/main 解冲突 → 普通 push；force push 属另一档需单独授权 |

DC-005 已于 2026-11-19 联网取证拍板（目标"项目决策支持，自动联网查询，结合行业标准给出最优拍板方案"），结论为**不可行，转入搁置**：
- 硬约束：全仓 CI job 均为 `runs-on: ubuntu-latest`（.github/workflows/ci-cd.yml:97 等、miniprogram-checks.yml:65）；微信开发者工具仅 Windows/macOS 版，Linux 无法安装。
- 工具现状（GitHub API 与 npm registry 实量）：`open-wxa/wxa-runner`（唯一能在 Linux 浏览器跑小程序 E2E、无需开发者工具的方案）仓库描述明确为"已应腾讯公司要求下线"，pushed_at 2026-11-16，不可再作为长期依赖；`miniprogram-automator` npm 包仍在（0.13.0）但依赖微信开发者工具；`miniprogram-ci` 仅做上传/预览，无 E2E 能力。
- 拍板：不在 CI 引入小程序真机/运行时 E2E；以接口层 E2E（DC-001/002，走 /api/v1/erp/*）+ 7 道静态门为当前可行上限。4.35 的真机深度项（分包加载、页面栈、隐私协议弹窗、WebView、杀后台）改由手工回归清单覆盖，不进自动化 CI。
- 触发重启条件：若后续出现官方支持的 Linux 无头小程序运行时，或团队提供专用 macOS/Windows runner，再重开本项立项。

### 搁置

| 编号 | 类型 | 优先级 | 标题 | 搁置原因 |
|------|------|--------|------|----------|
| DC-007 | 功能补齐 | P2 | 客户业务账号正向可见性用例 | 现有 `customer` 是黑名单验证角色（仅 SHELL + stock:export + pieces:print），非业务客户账号，无数据归属，无法构造"只看自己单据"正向断言；需先明确客户门户账号体系 |

### 已关闭（本期审计确证达标）

| 编号 | 类型 | 优先级 | 标题 | 闭环证据 |
|------|------|--------|------|----------|
| DC-009 | 功能补齐 | P1 | 新增功能配 E2E 配对门 | `.github/workflows/e2e-pairing.yml` 九道 self-test + 增量零引用判负 + 棘轮基线，真 fail-closed |

**抽检审计纠正（8.5，2026-11-19）**：DC-008（联动影响矩阵 PR 门禁）原记「已关闭」，经 blob 级复核判定为**假闭环，已重开**（见待开发段 DC-008 标注）。原闭环证据「#1306 入收尾聚合器 needs」不成立：#1306 至审计时仍 open/merged=false，其 `check-e2e-linkage-gate.mjs` 与 `e2e-linkage-gate.yml` 在 main 上 NOT_CARRIED；main 的 ci-cd.yml/e2e-batch.yml/e2e-pairing.yml 对 linkage 引用均为 0；主干仅有 `report-e2e-linkage.mjs`，其源码首部明写「信息工具，不是门禁，不设置非零退出码」。根因：把「信息报告工具」误当成「fail-closed PR 门禁」验收关单，验收标准未要求核对门禁是否真正挂载到 CI。同类防线：今后凡「门禁类」工单关单，必须核对 workflow job 实际挂载与退出码语义，不能只凭脚本存在。DC-010（AP 手机卡片支付方式断言）同样经 blob 级复核判定为**回归失效，已重开**：#1303 修复仍 open/merged=false，主干 `ap-mobile-parity.test.ts` 最后提交停在 #1252、无 `paymentMethodLabel`/`expectedPaymentMethod`、仍全宽度 `toBe('bank_transfer')`，而组件桌面列已走标签映射、手机卡片用原始 token；原闭环证据未入主干。待 #1303 或其 cherry-pick 载体（#1308/#1307/#1297）合并后 blob 回读断言已按宽度分治再关单。

## 二、周报（7.2.3 固定字段）

统计周期：2026-11-19。数据来自本轮 completion audit 与远端 PR 现状。

- 新增清单：DC-001（小程序接口层越权 E2E，PR #1320）、DC-002 第一批（写操作参数篡改 IDOR，PR #1320 head fcff7e120）、DC-005/DC-006（audit 新识别待评估项）、DC-003（数据工厂代码已交付，分支 test/data-factory-1119 commit 114e0fb）。
- 已闭环清单：DC-009（配对门，self-test 16/16 通过；DC-008/DC-010 经本周抽检判定假闭环/回归失效，已移出，不再计入闭环）。
- 积压清单：待开发 3（DC-002 余项/004/008 重开），验证中 4（DC-001/DC-002 第一批/DC-010 回归失效/DC-003），待评估 2（DC-005/006），搁置 1（DC-007）。
- P0 风险项：DC-006（#1302 脏支阻塞合并）——收口末期处理，不需 force 时走 merge origin/main。
- P1 积压清单：DC-001/002/003/005/010；DC-006 为 P0。
- 本周新增固化 E2E 用例数量：8（DC-001 的 5 端点越权断言 + DC-002 第一批 2 条写越权断言，均 PR #1320；DC-003 数据工厂消费 spec 1 条，分支 test/data-factory-1119）。
- 逾期工单清单：无（本看板为首期建立，无历史逾期基准）。
- 来源统计：completion audit 实量 8 条（DC-001~007 中除 DC-010 外），E2E 断言失败 1 条（DC-010）。
- 遗留风险与计划：DC-005 受限于真机自动化基础设施，待拍板；DC-002/003/004 待存量 PR 消化后开工，避免加剧队列拥塞。

## 三、验收判据汇总（8.4 统一标准）

- DC-001/002（权限类）：客户/非授权角色独立无痕 context 校验，验证越权路径，不只看页面；关联用例 ID 见关联列。
- DC-003/004（数据工厂/环境隔离）：造数经统一 builder 且环境前缀不串；CI 分片间无脏数据互扰可复现。
- DC-005（小程序跨端）：Web 与小程序两端同时验证数据同步，不只端点。
- DC-006（联动/合并类）：解冲突后 route-snapshot --check 逐字节不变，全量 CI 绿方可合并。

## 四、维护规则（8.3）

- 本文件随代码评审；状态变更须更新对应行并保留准入证据，禁止只改状态不写证据。
- P0 永远置顶于"待评估/验证中"段；长期搁置项（>14 天）每周复盘时强制回看。
- 周报字段每周更新一次，保留历史周期段落于文件末尾追加，不覆盖上一周期。

## 五、E2E 专项覆盖矩阵 completion audit（2026-11-19）

- 方法：对 `frontend/e2e/` 全量 470 个 spec 逐项核对目标 4.1~4.41，三态判定（已覆盖/部分/空白），证据到文件:行号。
- 统计口径更正（2026-11-19 二次复核）：首轮用本地落后工作树（停在 e63563813）扫出"已覆盖 26/部分 13/空白 2"，经远端 main 的 git trees API（473 spec，treeTruncated=false）复核为假阴——按 8.5 抽检纪律更正如下，以本段为准。
- 更正后结论：无障碍 4.34 从"空白"改判**部分覆盖**：main 上已有 `flow/523-a11y-login-keyboard.spec.ts`（aria-label 语义 + 连续 Tab 遍历 + 焦点 + Enter 提交，PR #1256 已 merged）与 `flow/524-a11y-dialog-focus.spec.ts`（焦点陷阱 + Esc 关闭）。缺口收敛为读屏语义覆盖不全 + 150% 字号/深色模式无断言。
- 更正后结论：4.37 色差与计量从"部分"上修为**已有专门 spec 但在途**：`542-fabric-gsm-deviation-grade-gate` / `543-quotation-dual-unit-conversion-conservation` / `544-cross-dye-lot-fallback-trace` 三 spec 在开放 PR #1300，main 尚未收录，待 #1300 合并后改判已覆盖。
- 空白项更正：严格空白仅剩 4.35 微信小程序深度专项（受 DC-005 真机基础设施搁置约束，仅接口层 DC-001/002 覆盖）。
- 方法教训：审计必须以远端 main 权威树为准，不得用本地工作树——本地 main 滞后会制造假阴。后续每轮 audit 先 `git ls-remote`/trees API 对齐基线再判定。
- 首轮结论存照（已被上方更正）：已覆盖 26 / 部分 13 / 空白 2。
- 首轮空白存照：4.34 无障碍与可访问性；4.35 微信小程序深度专项。
- 首轮部分 13 项存照：4.9 性能压力、4.10 浏览器兼容矩阵、4.11 OWASP（仅越权，无 XSS/SQLi/CSRF 负例）、4.12 历史迁移灰度、4.13 Monkey/探索性、4.26 第三方支付回调、4.27 缓存一致性、4.28 MQ 异步、4.30 时区边界、4.36 扫码识别、4.38 备份恢复、4.39 脏数据巡检、4.40 多组织维度。
- 下一波工单池：4.34 缺口收敛为读屏语义 + 字号/深色模式（与已拍板 v-permission 状态级灰化决策衔接）；4.35 维持搁置；4.37 待 #1300 合并后复判；部分项按 P1→P2 分批补专门 spec。
- 关单判据：每专项须有独立 spec + 字段级精确断言 + CI 全量绿，不得凭零散断言报已覆盖。
