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

**抽检正向对照（8.5，2026-11-19，main 4b40f6ced）**：DC-009（新增功能配 E2E 配对门）按同一 blob 级方法复核，判定为**真闭环，维持已关闭**。证据：`.github/workflows/e2e-pairing.yml` 在 main 在册且真挂载——`:107` 跑 `--self-test`、`:152`/`:162` 实际调用判定器、`:52`/`:65` 列为 paths 过滤触发条件；判定器 `check-e2e-feature-pairing.mjs` 含 `process.exit` 非零阻断、棘轮基线与 `--baseline-ref` 增量比对。与 DC-008 的 report-only 假闭环构成正负对照，证明抽检判定器能区分「真 fail-closed 门禁」与「改名的信息工具」，而非一律否定已关闭工单。附方法论纠偏：Git Bash 的 MSYS 路径转换会把 `origin/main:<path>` 冒号表达式改写为 `origin\main;<path>`，此时 `git show` 落盘 0 字节属工具假象，不可据此判假交付；须以 `cat-file -s`/blob hash 为准——本例 main 看板 blob `7f5fdf41cd9` 与载体分支一致（21543 字节，六项关键词全命中），#1340/#1342 文档合并真实落地。

## 二、周报（7.2.3 固定字段）

统计周期：2026-11-19。数据来自本轮 completion audit 与远端 PR 现状。

- 新增清单：DC-001（小程序接口层越权 E2E，PR #1320）、DC-002 第一批（写操作参数篡改 IDOR，PR #1320 head fcff7e120）、DC-005/DC-006（audit 新识别待评估项）、DC-003（数据工厂代码已交付，分支 test/data-factory-1119 commit 114e0fb）。
- 已闭环清单：DC-009（配对门，self-test 16/16 通过；DC-008/DC-010 经本周抽检判定假闭环/回归失效，已移出，不再计入闭环）。
- 积压清单：待开发 3（DC-002 余项/004/008 重开），验证中 4（DC-001/DC-002 第一批/DC-010 回归失效/DC-003），待评估 2（DC-005/006），搁置 1（DC-007）。
- P0 风险项：CI 平台级停摆（GitHub Actions 全仓 0 in_progress / 0 success，31 支开放 PR 全部 queued，最老 run 排队数小时）——仓库侧成因（漏合、真红、审批门、叠层、脏支、concurrency 死锁）已全部排除，属平台调度故障，本地无可修项；合并循环 PID 732 守候，CI 一恢复即自动逐支收口。次生风险：#1302 脏支（收口末期解冲突，force 需单独授权）。
- P1 积压清单：DC-001/002/003/005/010；CI 停摆为 P0 环境阻塞（非工单）。
- 本周新增固化 E2E 用例数量：9（上一周期 8 条 + 本周期 4.19「导出按筛选一致」断言 1 条：39d spec `frontend/e2e/traversal/39d-export-filter-consistency.spec.ts`，PR #1341，本地六项静态门全绿、await CI）。
- 逾期工单清单：无（本看板无历史逾期基准）。
- 来源统计：completion audit 实量 8 条（DC-001~007 中除 DC-010 外），E2E 断言失败 1 条（DC-010）；本周期新增 8.5 抽检 1 次（门禁脚本与专项 spec 的 main 落地核对，无假闭环）、专项覆盖复核 6 项（4.16/4.17/4.25/4.28/4.31 已密集覆盖不重复建设，4.33 日志脱敏为 E2E 盲区归后端单测面）。
- 遗留风险与计划：DC-005 受限于真机自动化基础设施，维持搁置；DC-002/003/004 待存量 PR 消化后开工，避免加剧队列拥塞；31 支 PR 收敛与全部在途专项（4.11/4.34/4.36/4.37 对应 525-527/542-544）落地均依赖 CI 平台恢复，恢复后由合并循环自动收口并逐支 8.5 blob 回读关单。

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
- 三次更正（2026-11-19 本轮，均**在途未合并**，不得据此报已覆盖）：4.34 新增 `flow/525-a11y-dark-mode.spec.ts`（点击 `.theme-toggle-btn` 断言 `html.dark` + `data-theme=dark` + localStorage `bx-erp-theme=dark`、刷新恢复、预置深色后加载即应用并可切回亮色），契约逐字段核对 `useTheme.ts` 的 STORAGE_KEY/DARK_CLASS/applyTheme/onMounted 与 `MainLayout.vue:90`；4.11 补 CSRF 负例 `flow/owasp-csrf-negative.spec.ts`（裸 POST `/crm/customers` 缺 X-CSRF-Token 断言 403 + CSRF 机器码，中间件层拒绝不达 handler）。两 spec 均在开放 PR #1332（head `0bbe4578d`），main 尚未收录，待 CI 全绿且合并后按 8.5 抽检改判。4.34 的「150% 字号布局不错乱」经核对主题字号为 px 定值（`styles/theme.css:44-46`），浏览器字号缩放不改变组件尺寸，无法做真值断言，列**不可测观察项**，不以假绿断言充数；读屏语义仍为剩余缺口（523 仅覆盖登录页 aria-label）。
- 四次更正（2026-11-19 本轮抽检，均在途未合并，不得据此报已覆盖）：三次更正所列 PR #1332 的 head 已由 `0bbe4578d` 推进至 `14c22e584`，新增两 spec——4.34 补 `flow/526-a11y-semantics.spec.ts`（用户页 `.el-table` 首个 `aria-label` 非空、表头 `th` 与内联筛选项/新建用户弹窗 `.el-form-item__label` 逐项非空），4.36 补 `flow/527-barcode-invalid-negative.spec.ts`（扫不存在条码盘库/出库断言 HTTP 404 + 机器码 `NOT_FOUND` + 脱敏文案「资源未找到」，回读确认失效码未凭空写入布卷）；后者逐字核对 `barcode_scanner_handler.rs:97/131` 的 `AppError::not_found` 与 `error.rs:817/848` 的 code/message 映射。两 spec 随 #1332 合并入 main 后按 8.5 抽检改判已覆盖。
- 假绿案例登记（8.5 抽检实证，527 首版）：527 首次提交（`2329029df`）对 `apiCallExpectFail` 返回值误用 `fail.json` 取机器码/文案，而该 helper 返回 `{status, code, message, ...}` 平铺体（`helpers.ts:1742`，`ApiFailureResult extends ApiFailureBody { status }`），`fail.json` 恒 undefined，两处断言运行时必红；prettier --check / eslint / `playwright test --list` 三道静态门全绿（列表只枚举不执行），属典型「看起来通过但问题还在」假绿。经人工审计发现并在 `14c22e584` 修正为 `failureCode(fail)` / `fail.message` / `failureCode(reread)`。同批 525/526/data-factory/CSRF 逐个核对 helper 契约无同类误用；根 `tsconfig.json` 只含 `src/**`，e2e 类型由独立棘轮门承担（`ci-cd.yml:610` + `scripts/check-e2e-types.mjs`，按 `文件|TS错误码` 与基线比对，新增即判负），实测修复后 0 新增类型错误，此类 TS2339 可被该门抓到。根因教训：新增 e2e spec 必须过 e2e 类型棘轮门，不得只凭 prettier/eslint/--list 判绿。
- 五次更正（2026-11-19 全 4.x 专项系统映射审计，objective 4.13「定期功能-用例映射检查」）：对 4.5/4.14/4.16/4.19/4.23/4.29/4.30 与 4.41.N 逐条做 spec-to-requirement 映射并人工复核，推翻两条仅凭文件名或旧树得出的假阳性，避免据此新开 worktree 重复建设。其一，4.30 时间与时区非空白：`492-textile-report-write-face.spec.ts:609-634` 的 492-07 已断言未来出具日记 `not_yet_valid`，`37-export-refund-base-and-incoterms-freight.spec.ts:202,241` 覆盖跨年申报 month=12 上界，`460-crm-contract-and-follow-up-chain.spec.ts:333-337` 断言纯日期入库折当日 00:00:00 UTC。其二，4.41.N 联动矩阵非 report-only：开放 PR #1306 分支 `ci/e2e-linkage-gate`（head `cc14c7422e`）上 `check-e2e-linkage-gate.mjs` 与 `e2e-linkage-gate.yml` 均存在、`ci-cd.yml` 的 `ci-e2e-linkage` job 已挂载；旧树 `wt-datafactory-1119` 看不到未合入分支，属用落后基线判假阴，待 #1306 合并后 blob 回读再关 DC-008。其三，真弱覆盖：4.19「导出内容与筛选一致」——`39c-export-content.spec.ts:334` 自述「admin 视角全量」，导出腿仅按服务端 total 自洽断言（`:353-356`），无「带筛选导出只出筛选结果」字段级断言；报表导出另有筛选能力（`report_engine_handler.rs:241` 的 `parse_export_filters`，服务于 `/report-engine/export`），但与本例色卡发放导出是不同端点，不得混用为证据，列入下一波补测工单池。
- 首轮结论存照（已被上方更正）：已覆盖 26 / 部分 13 / 空白 2。
- 首轮空白存照：4.34 无障碍与可访问性；4.35 微信小程序深度专项。
- 首轮部分 13 项存照：4.9 性能压力、4.10 浏览器兼容矩阵、4.11 OWASP（仅越权，无 XSS/SQLi/CSRF 负例）、4.12 历史迁移灰度、4.13 Monkey/探索性、4.26 第三方支付回调、4.27 缓存一致性、4.28 MQ 异步、4.30 时区边界、4.36 扫码识别、4.38 备份恢复、4.39 脏数据巡检、4.40 多组织维度。
- 下一波工单池：4.34 缺口收敛为读屏语义 + 字号/深色模式（与已拍板 v-permission 状态级灰化决策衔接）；4.35 维持搁置；4.37 待 #1300 合并后复判；部分项按 P1→P2 分批补专门 spec。
- 关单判据：每专项须有独立 spec + 字段级精确断言 + CI 全量绿，不得凭零散断言报已覆盖。

- 六次更正（2026-11-19 本轮 4.x 覆盖复核与 4.19 补测落地）：以 origin/main（ea4fbff87）为基线核对，避免重复建设——4.16 自动计算与数值精度已有 40 个 spec 命中（452 米数缩率换算守恒、455 阶梯价折扣、543 报价双单位换算在途 #1300 等），4.17 状态标签映射、4.25 兜底页（403/404.smoke、28b、55）、4.28 幂等消费（474 HTTP 重放、501 定时任务、504 通知去重）均已有专门 spec，均不新建。4.33「日志脱敏」的「日志不打印明文密码/完整手机号」子项判定为 E2E 盲区：审计日志详情 API（audit_log_handler.rs:267-278）只暴露 before/after/old/new 业务字段快照，不暴露 request_body 与 tracing 日志正文；明文脱敏发生在 field_mask.rs:4 mask_phone 与 middleware/omni_audit.rs:205-210（请求体先 mask_text_pii、敏感路径 REDACTED）内部，从 HTTP 层断言不到，归后端单测/集成测试面，不写假绿 E2E。4.19「导出内容与筛选一致」经源码坐实为可测缺口：build_issue_conditions（color_card_issue_service.rs:661-683）应用 customer_id/status/from_date/to_date/sales_order_id 六项，导出取数 list_issue_records_for_export 经 build_scoped_issue_find 复用全套条件，水印条数=筛选后 total（issue.rs:556-559）。已产出 39d spec（frontend/e2e/traversal/39d-export-filter-consistency.spec.ts），双路对账水印条数与筛选列表 total、两客户互不串号、全量严格大于单客户筛选，避开客户ID数字子串假阳性；本地四件套静态门全绿（prettier/eslint 0 error/类型棘轮门 0 恶化/playwright --list 2 条）加 api-paths（A类0/E类探针0）与配对门（PAIRING_GREEN），水印正则与 helper 返回契约逐字核对通过。分支 test/e2e-export-filter-consistency-419 已推送保工（head d348d8a33），待开 PR 与 CI 全量绿后关单。同时证伪「导出赔偿金额列未脱敏」潜在缺陷：导出门槛 require_issue_permission(export)（issue.rs:171-193）与成本可见判定 can_view_cost_amount（issue.rs:209-217）同走 check_role_action_covering_wildcard(role_id, color-cards, export)，能导出即能看成本，设计自洽不开工单。

- 七次更正（2026-11-19 本轮 4.40 系统映射审计，以 origin/main 0b970f823 为基线）：4.40「多组织/多仓/多公司维度」首次做 spec-to-code 映射，原告知结论「后端主体不支持多公司/集团语义，子项 2/3/4/5 属功能缺失而非测试缺口，禁止写假绿 E2E」。blob 级证据（亲自复核非仅采信调研）：多租户功能由 m0029_drop_tenant_columns.rs:1-11 完整删除（DROP tenants/tenant_users/tenant_configs 及全部 tenant_id 列与索引，明确不可逆）；company_profile.rs:4-5 单例「全库唯一、仅 id=1 一行」；后端 org_id/company_id/organization_id 命中均 0 文件；数据范围只有 all/dept/self 三档（data_scope.rs:5-7,31-47）；前端组织/公司切换 UI 关键词（org-switch/company-switch/currentOrg/组织切换/公司切换）命中均 0。据此逐子项判定：子项1「维度切换」——仓库/部门维度存在（warehouse_id 103 文件、dept 15 文件），已有跨仓/库位互不可见 spec（flow/12-inventory-ops.spec.ts、flow/450-inventory-transfer-and-count-variance.spec.ts、flow/465-warehouse-location-master-and-adjustment.spec.ts）部分覆盖，公司维度不存在故不可测；子项2「A 公司看不到 B 公司客户单据」、子项3「跨公司调拨/集团统一客户」、子项4「集团角色与公司角色权限叠加」、子项5「集团汇总各公司之和、内部交易抵消」——后端无 company/org 维度，E2E 无法断言，均属功能缺失/需求超出当前架构，不立测试缺口工单。纠偏首轮把 4.40 列入「部分覆盖」的笼统结论：其「部分」仅指仓库维度，多组织主体是空白且为架构缺席。拍板（目标第一章「综合评估给最优拍板、不全部交用户」）：维持单公司 + 部门/仓库二维隔离架构，租户功能系主动删除说明已有架构决策；不写假绿 E2E、不为 4.40 新开支。重启触发条件：产品明确提出 SaaS 多租户需求并立项多组织架构改造，届时按新架构重写映射与 E2E。

- 八次更正（2026-11-19 本轮 4.27 系统映射审计，以 origin/main 8f7c5e9e 为基线）：4.27「缓存一致性与数据同步」首次做 spec-to-code 映射，结论「无『可写且不假绿、不重复』的新 E2E 缺口，不新建 spec」。后端确有真实缓存层：cache_service.rs 进程内 moka LRU + 分级 TTL（TTL_DASHBOARD 30s / REPORT 120s / USER 300s / PERMISSION 120s / PRODUCT 600s / CUSTOMER 300s / CONFIG 1800s，:30-56）+ invalidate_prefix 精确失效（:87-90）+ Redis pub/sub 多实例同步（redis 命中 26 文件）。逐子项判定：子项1「修改后缓存失效再读新值」——业务实体走 56-read-after-write.spec.ts（保存→刷新→目标列单元格真显示新值），权限缓存失效是后端内部写路径（permission.rs:490/552 PERMISSION_CACHE.clear），从 HTTP 层无法断言内部失效动作，不写假绿；击穿/穿透/雪崩需并发压测+故障注入，E2E 单实例跑不出。子项2「多节点 A 写 B 读」——需多实例部署，E2E 环境单实例，盲区，归集成/压测面。子项3「前端缓存三层」——浏览器层，56 刷新路径已部分覆盖。子项4「清理缓存后首次加载」——唯一可测端点 /analytics/cache/clear（routes/analytics.rs:348）仅报表缓存，价值低且属 analytics 域，不构成面料主链路缺口。子项5「库存缓存高并发扣减最终一致」——需并发压测，盲区；库存正确性非并发部分已由 flow/12、450、465 的守恒断言覆盖。观察点（非测试缺口、不越界定性）：分级 TTL 常量全标 `#[allow(dead_code, reason="预留")]`（cache_service.rs:32-56），说明分级 TTL 尚未真正接入调用方，属后端功能完工状态，不在 E2E 职责内。纠偏首轮把 4.27 列入「部分覆盖」的笼统结论：其可测部分实为通用持久化/库存守恒 spec 顺带覆盖，无专门缓存 E2E，且剩余主体是架构级盲区，与 4.33 同类。不新建 spec、不立测试缺口工单。

- 十次更正（2026-11-19 本轮 4.21「审批分支穷举与流程矩阵」系统映射审计，以 origin/main d8cd3c7f2 为基线）：结论拆两类，其余子项已覆盖，三项属功能缺失而非测试缺口，不写假绿 E2E。已覆盖且有专门 spec：节点通过/驳回基本动作（bpm/02、03 与 flow/109、53）、金额阈值三档（flow/455 已有边界，455-05 精确阈值 99999/100000/100001 在途 PR #1346 待验证）、折扣阈值（flow/469 超折扣审批门）、多级审批链（flow/41b 双级链、53 防自审批与双人约束、109 BPM 两级推进与事件回写）、重复审批拦截（flow/47-A1）、驳回重提与审批留痕（flow/109-03b、39b、39d）。审批权限转移已覆盖：flow/119-permission-delegation-lifecycle-readback 覆盖建委托、双视角列表、有效权限聚合、撤销门与过期扫描，后端承载体 permission_delegation_service.rs（V15 P1 12.6 时限化委托，过期自动失效、禁链式委托）。功能缺失三项（目标原文要求但后端未实现）：会签/或签（会签需全体通过、任一人驳回即终止，或签一人通过即流转）、超时自动转交。后端取证：services/bpm_ops/task.rs:39-49 明确「审批动作取值域只有同意/拒绝两种」，APPROVE_ACTION/REJECT_ACTION 两常量，validate_approve_action 对 transfer/delegate 等取值一律拒绝（防同一次调用自相矛盾写坏数据）；全仓 cosign/counter_sign/或签/超时转交在审批引擎零命中，仅有 47-A1 的审计日志 ALL 常量等无关命中。据此判定：这三项是需求超出当前 BPM 引擎设计能力的功能补齐类工单，不是「写了断言就能过」的测试缺口，写假绿 E2E 无意义。处置拍板（目标第一章综合评估给最优拍板）：登记为功能补齐工单（P1），重启条件为产品立项多人会签/或签审批模式与超时自动转交引擎改造；实现后再按 4.21 补字段级 E2E（会签需逐人审批断言、或签一人即流转、超时后待办归属转移）并 CI 全量绿方可关单。4.21 其余子项维持已覆盖，不重复建设。：结论「属边际断言缺口而非真漏洞，当前不新建 spec/PR，列入存量收敛后补测池」。后端取证（亲自复核）：services/crm/lead.rs 的 list_leads 在 :134 应用 keyword 模糊条件（pattern=%keyword%），在 :152 对同一查询串联 apply_department_scope_with_pool 行级过滤，二者同处一条查询链，keyword 只收紧结果集、不绕过 owner/dept 隔离；导出版（:300/:317）、手机号分支（:1040/:1074）同口径；按 ID 越权另由 :476-477 check_resource_owner 拦截。远端 main blob 取证：frontend/e2e/enhanced/data-scope-isolation.spec.ts（blob 15cf8497c1cb51379c0110d6bf96af3acf23eb44）keyword 仅 3 处命中（L205/L211/L224）且全在 admin（all scope）「列表搜索也能看到」正向分支；self-01（不同 self 用户列表互不可见）与 self-02（按 ID GET 越权 403）均无 keyword 参数。据此判定：目标 4.14「业务员搜索只命中自己客户，不能通过搜索绕开数据隔离」在 self/dept scope 下缺一条「带 keyword 搜索仍看不到他人私有行」的显式负例断言——行为已由后端正确保证，缺口仅在断言侧，不构成越权漏洞。处置拍板（目标第一章「综合评估给最优拍板」）：CI 平台级停摆（实量 50 个 CI/CD run 全部 queued、零 success 全量 run，仓库侧红因已排除）、开放 PR 已达 32 支，此时新增第 33 支 PR 违反「PR 维持约 9 个」且无法验证；不重复建设既有 self-01/02 隔离覆盖，待存量 PR 收敛、CI 恢复后，在 data-scope-isolation.spec.ts 既有 self describe 内补一条 self 用户带 keyword 搜索的负例断言（复用 createUserAndSeedLead、不新建 spec 文件）。关单判据不变：独立字段级断言 + CI 全量绿，未补前 4.14 该子项记「部分覆盖」。
