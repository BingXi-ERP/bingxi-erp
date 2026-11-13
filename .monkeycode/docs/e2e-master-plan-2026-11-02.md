# E2E 与质量治理总纲（重组版 2026-11-02）

本文件是两段在跑会话（ERP开发任务推进与CI管理、ERP 开发）里全部指令与执行记录重组后的**单一事实来源**。
原文为五章约 208 条口号式要求，本次梳理做了四件事：去重、分级、逐条对账仓库现状、纠正与现行裁定冲突的口径。
规则本体仍以 `.monkeycode/MEMORY.md` 为准，未完成任务队列仍以 `.monkeycode/doto.md` 为准，本文件只负责"E2E 与质量治理"这条线的目标、边界与排期。

证据底数（本仓库实测，非估算）：`frontend/e2e` 共 400 个 spec 文件、103,469 行；`e2e/flow` 已占编号上限 213；
CI e2e 分片矩阵 45 片（flow 20 + smoke 5 + traversal 5 + extras 15），唯一事实来源 `frontend/scripts/e2e-shard-registry.mjs`。

---

## 1. 原内容的重复计数（为什么要重组）

原文把同一个内核写成多套话术，直接照单开工会出现"同一行为 7 个用例、每个都恒过"的假绿堆量。实测重复簇：

| 内核 | 原文出现处 | 出现次数 |
|---|---|---|
| 保存后刷新回读（写→刷新→字段完整） | 4.1 B/C/D/E/F/G/I | 7 |
| 越权与前端绕过（URL 直连、控制台调接口、改参数、改角色） | 三 权限脱敏、4.1 A/J/P、4.8、4.11 | 6 |
| 角色数据可见性与隔离 | 三 权限脱敏、4.1 A/J/N、4.1 Q、五 末条 | 5 |
| 状态机与时序门（未审批不能转单、红冲后不可引用） | 三 反向链路、4.1 R、4.3、4.1 E | 4 |
| 并发与幂等（重复点击、多标签页、多单锁同缸） | 4.1 H/K、4.2、三 面料专项 | 4 |
| 打印/导出/附件 | 三 单据模板、4.1 C/G、4.4、五 | 5 |
| 移动端与小程序 | 4.1 B/I、三 微信链路、4.10、五 全章 | 4 |

208 条 → **12 个用例簇 + 5 个治理层 + 6 个执行波次**（本文件后续章节）。

---

## 2. L0 治理层：协作纪律（不产 E2E 工单）

原文第二章 6 条与后续裁定有 4 处冲突，以下为**现行口径**，冲突项已改名并注明。

| 纪律 | 现行口径 | 与原指令的差异 |
|---|---|---|
| PR 名额 | 上限是**同时 8 个在跑验证**，全绿即释放名额；开放 PR 数不设限，6 支是常规载体加 1 支紧急的目标位 | 原文"维持在 6 个左右"是 2026-10-23 口径，已被 2026-10-30 裁定替代 |
| 合并授权 | PR 检查全绿才可合，且**合并只由用户在 UI 点**；agent 只推分支、只开 PR | 无差异 |
| 红标处置 | 每枚红先归因（本支真红／needs 随动／聚合器／基础设施／主干继承），非本支缺陷不修本支代码 | 原文"所有红标问题必须修复"会被读成"把聚合器红也当本支缺陷修" |
| 验证分工 | 本地只做静态轻判（rustfmt/prettier/eslint/vue-tsc/check-*.mjs/`playwright --list`/`bash -n`）；**编译、活测、安卓构建一律交云端 CI** | 原文"所有编译验证统一走云端 CI"保留，但"本地验证全绿"指静态门全绿，不含编译 |
| 推送节奏 | 同一 PR 不碎片触发，**一支打包 3-6 项同域修复**；多支串行推，避免队列互堵 | 无差异 |
| 面的分离 | 功能面／变更面／修复面可归并一支；**测试文件变更一律单独 PR，绝不混** | 新增，原文未区分 |
| 决策依据 | 参考国标／行标／通用标准＋仓库事实＋联网取证三源，先自动裁定再落地，待裁项**当场列编号＋推荐默认**请用户终裁 | 原文"不全依赖用户决策"的具体做法 |
| 在制品保全 | 每笔可独立成立的改动即 commit；撞回合上限前先代存快照 | 新增，源于两次额度中断事故 |

---

## 3. L1 门禁层：先把闸门做实，再灌用例

闸门现状与缺口（缺口语义 = 门存在但不硬拦，等于没门）：

| 门禁 | 现状 | 缺口与工单 |
|---|---|---|
| 新增端点必须配套 E2E（配对门） | 已落地主干，独立工作流 `.github/workflows/e2e-pairing.yml`，基线取分支起点提交，取不到起点显式跳过不算通过；反向自证 9 道全命中 | **缺口**：`ci-cd.yml` 零引用它，也不在必检聚合门 `ci-cleanup-retry` 的 needs 里，而主干 ruleset 无任何必需状态检查 ⇒ 该门红不拦合并。**已按裁定处置（本地待推）**：GitHub 的 `needs` 不能跨工作流，所以"并入 needs"只能落成把同一对脚本的判定做成 `ci-cd.yml` 内的 `ci-e2e-pairing` job（`pull_request` 才跑，缺起点按判负），并加进 `ci-cleanup-retry` 的 needs（27→28，job 总数 29）；独立工作流撤掉 `pull_request` 触发避免同一扫描跑两遍，保留 `push: main` 与手工触发两条腿（`ci-cd.yml` 的 push 只认 `v*` tag，撤掉那条腿主干累积漏测就再没人对账）。车道 `wt-pairing-hard`，提交 `041c32c7` 加一条 AGENTS 同步 |
| 存量漏测分母 | 配对门自测口径实测：端点 1822 枚，e2e 已覆盖 1166，**前端有调用点却零 e2e 引用 189 枚**，前端零调用 467 枚（豁免池） | 工单 G2：189 枚按域切批补测，号段见第 7 节预分配表。**已按裁定处置（本地待推）**：G3 覆盖率宣称换成棘轮——判定器加"分母只准降不准升"档，基线 `frontend/scripts/e2e-pairing-coverage-baseline.json` 只能由 `--write-coverage-baseline` 重算，缺基线自曝退 9，反向自证由 9 道增至 12 道全命中，实跑 `ratchet=ok 189/189` 绿。车道 `wt-pairing-ratchet`，三枚提交 |
| 测试真实性门 | `e2e-authenticity-guard` 已落地（动态 needs ＋ 静态禁 mock，带 DO-NOT-MODIFY 标记） | 工单 G3：底数口径对齐——历史登记只记 3 处，实测源级 `test.skip` 24 处，判定面偏窄会放行假绿 |
| 覆盖率门 | codecov 全 `informational` ＋ 前端 vitest 四项阈值实测 1，"80%／跌幅 5%"只是配置里的宣称 | **已按裁定处置**：不再用百分比覆盖率当门，改用上一行的配对覆盖率棘轮（分母可复现、只准降不准升）。宣称与实态的差异已在第 8 节裁定记录里点名 |
| 小程序门禁（打包／依赖／语法／包大小） | **主干不存在**：main 无 `miniprogram` 跟踪文件；七道静态门与 `miniprogram-checks.yml` 只在在途分支 `feat/miniprogram-adapt` | 工单 G4：先裁小程序树是否入主干（待裁项 6），门才谈得上纳入；纳入时须与"构建 npm"同支，禁先排产物 |
| 端点基线 | `route-snapshot.mjs --check` 在 `ci-static-checks` 内，绝对前缀只在 `routes/mod.rs` 一次 nest | 挂载重构必须让快照输出逐字节不变（既有硬规矩） |
| 契约四向 | `check-contract`／`check-api-paths`／`check-api-envelope`／`check-api-request`／`check-route-mount` 同在 `ci-static-checks` | 新用例不许绕过信封声明，列表形状必填 listKey |
| 注释规范 | R1-R4 只判 diff 行硬红，R5 全量对基线棘轮 | 文档与本类规划文件不在扫描面（backend/frontend/.github ＋ 十种扩展名） |
| i18n 中英双侧 | `check-i18n` 带自证步 | 新用例引文案只走完整键路径 |
| 分片覆盖 | `check-e2e-shard-coverage`（锚点/hash 连续/差集三层）＋ `check-e2e-main-push-shards` | **加用例不必动 45 片矩阵**：放已登记目录即自动纳入；新建顶层目录必须同步 `e2e-shard-registry.mjs` 与 `ci-cd.yml` 的 case 表两处，未登记直接 `::error` 退 1 |
| 选择器棘轮 | `check-e2e-select-ratchet`（裸 `.el-select-dropdown` 只准降） | 新下拉要收窄到可见 popper，禁放宽期望值 |
| e2e 类型棘轮 | `check-e2e-types`（文件\|错误码 基线，存量 93） | 新用例不许新增错误码 |

---

## 4. L2 主链路层：面料业务域矩阵

原文第三章 11 条重组为"域 × 载体 × 现状"。载体含义：flow＝单域行为链，fullflow＝跨角色跨域全链，smoke＝页面可达，contract＝契约与形状，be-test＝后端 Rust 集成测。

| 域 | 现有载体 | 厚度判定 |
|---|---|---|
| 色卡 | `e2e/color-card.spec.ts`、`color-price.spec.ts`、flow 23/79/110/113-116/81 | 厚，缺借出归还与色卡图替换的写后回读 |
| 样品打样 | flow 210（lab-dip 色差）、`e2e/custom-order.spec.ts`、production/05、flow/10c | **极薄**，无独立目录，打样成本与寄样腿零覆盖 |
| 报价 | `e2e/quotations/`（5）、sales/01、flow/21b、flow/123（五棒审批链） | 中，含税口径与阶梯价待随功能支同步 |
| 库存细码 | `e2e/inventory/`（7）、flow 12/13/105/106/211/212/213 | 中，卷号细码与缸号锁定已有防超卖链 |
| 采购 | `e2e/purchase/`（17，含 contract 08/12）、fullflow/20、flow/99/107 | 厚 |
| 销售 | `e2e/sales/`（8）、fullflow/21、flow/93（非法流转）、120、90/91 | 厚 |
| 委外染整 | production/06、flow/10b/21d/80/96、fullflow/23、fabric/02 | **无独立目录**，染厂进度与返工腿散在别处 |
| 质检 | `e2e/quality/`（5）、flow/104、97、fullflow/22/25 | 中，不合格退回扣款与缸差登记待补 |
| 对账结算 | finance/04/11、flow/92（核销链）/125/160/161、fullflow/10/11 | **无独立目录**，开票与账期预警腿缺 |

面料核心字段（色号、缸号、批次、门幅、克重、米数、卷号、损耗、余码、色差、打样版本）：属"字段级落库与回读"，正确载体是 contract 形状断言＋写后回读，不是 UI 点击；已有 m 序号迁移台账约束存储口径，DECIMAL 线格式按既有裁定只认序列化字符串。

正向全链（建档→询样打样→报价审批→订单锁缸→委外加工→入库质检→出库发货→对账收款）与反向链（退货、委外返工、调拨、盘点、盘盈盘亏、红冲作废）：落 `fullflow/`，每链一支 spec，禁拆成 8 条"打开页面"式伪链。

---

## 5. L3 专项层：12 个用例簇

原文 4.1（A-R）＋4.2-4.13 去重后的全部可执行内容。**优先级**：P0＝有已知缺陷或门失效；P1＝分母已量出的存量漏测；P2＝协同与时序；P3＝环境差异，只进人工清单。
**归属**：e2e＝Playwright 分片；be＝后端 Rust 集成测；manual＝无法在本仓库 CI 自动化，只能人工验收；none＝判为不该做。

| 簇 | 覆盖的原文条目 | 判据（可证伪的断言形态） | 现状 | 优先级 | 归属 |
|---|---|---|---|---|---|
| C1 会话隔离与角色可见性 | 4.1 A/J/N/Q、三 权限脱敏 | 同端点不同角色，列表行数与列键差异逐一相等基线；非 admin 出参掩 phone/email/cost_price | 遍历基线 35 个 access-map json，行为级隔离仅 flow/33/34/55＋enhanced 两支 | P1 | e2e |
| C2 写后回读持久化 | 4.1 B/C/D/E/F/G/I 的同一内核 | 新增／编辑／删除→重新进入页面（不靠组件内状态）→字段、合计、附件、图片顺序逐键等于落库值；刷新路径用 `page.reload` 与直接 URL 导航两种，禁只测 SPA 内跳转 | 各域零散有，无统一范式与命名 | P1 | e2e |
| C3 删除／作废／红冲联动 | 4.1 E、4.3 红冲、三 反向链 | 删前存在性预检→终止腿→404 只作辅助证据；联动面（库存／应收／成本）同查；有下游引用禁硬删且点名依赖单据 | 已有删除矩阵与门（在途功能支），红冲联动缺 | P0 | e2e＋be |
| C4 异常保存与幂等 | 4.1 H、4.2 | 重复点击只落一条（按单据号与行数断言）；500／超时不出现"成功"文案；必填与非法值前端拦截不发请求（用请求计数证伪） | 仅幂等类 flow/47；假成功防护未成体系 | P1 | e2e |
| C5 越权与篡改 | 4.1 A/J/P、4.8、4.11 | 直接调接口（不经 UI）：换 ID、改金额、塞角色、重放审批，四种各自断言后端拒绝且**库内零写入**；审计日志不可篡改 | 越权链有，改参数与重放腿缺 | P0 | e2e＋be |
| C6 业务时序门 | 4.1 R、4.3 | 前置态未满足时按钮禁用**且**接口 4xx（两侧都要断言，只断 UI 即假绿）；非法状态跳转逐对枚举 | flow/44 族＋93 已有，报价未审批转订单／签收前禁对账／确认后禁开票三腿缺 | P1 | e2e |
| C7 协同与并发一致性 | 4.1 K/N、4.2 | 多 context 真并发：锁同缸超卖拦截、并发审批只流转一次、并发建单单据号无跳号无重复、多仓出库一致 | 缸号防超卖仅 flow/213 单点，其余无 | P2 | e2e＋be |
| C8 财务结算口径 | 4.5、4.1 G 含税切换 | 含税录入只能用除法反算（净额＝含税÷(1+税率)，税额取差额并与含税钩稽），单头三键与行合计**无分差**；多币种、定金部分回款核销、缸号批次成本归集与染费运费分摊、毛利、账期逾期 | 含税口径在途两腿修＋审批链已钉；核销链 flow/92 有，多币种端到端与批次成本归集缺 | P0 | e2e＋be |
| C9 导入导出与主数据唯一性 | 4.4 | 导入模板与入口配对（双向判），异常容错／重复识别／部分成功回滚；导出按角色裁列；色号／缸号／编号／单据号唯一性 | 导入链 flow/32/122/126 有；导出裁列与唯一性专项缺 | P2 | e2e＋be |
| C10 通知与定时作业 | 4.6、4.7、4.1 I 推送腿 | 调度器到点推送且推送对象正确、幂等不重复轰炸、失败重试；站内通知链可测，外部渠道只测"落库的待发记录与收件人"，禁在 CI 真发外部消息 | 站内 flow/31d/31e 有；scheduler／recycle／report job 无 e2e | P2 | be 为主 |
| C11 审计与追溯 | 三 审计日志 | 高危操作单独标记，记录账号／角色／终端／变更前后值／时间，支持按缸号、订单、客户反查 | 审计面存在（resource_type 词表已定），前后值与追溯腿待钉 | P1 | e2e＋be |
| C12 环境差异与探索性 | 4.1 L、4.9、4.10、4.13、五 部分 | 见第 6 节人工清单，**不进 e2e**（写进 e2e 即只能造恒过断言） | 无自动化，perf 有独立脚本与 `ci-perf-bench` job | P3 | manual |

明确判为不该做的形态（与既有质量硬约束一致）：把文案钉成中文字面量去测界面（走 i18n 键）、只断 UI 可见不断后端拒绝、用 `?? []`／`\|\| 默认值` 掩盖缺键、给同一行为跨域各写一套、靠调顺序或放宽阈值消红、断言不指名期望值。

---

## 6. L4 移动端与小程序（原第五章）

拆成三条互不混淆的线：

1. **前端整改（功能面）**：流式卡片与明细折叠、长文本换行、数字键盘与小数校验拦截非法值、模糊搜索联想、附件与图片预览压缩、分包体积、首页菜单轻量化。已有对应门：`check-no-stepper-control`（步进控件禁）、小程序包体积 2048/20480KB（在途分支）。
2. **自动化（测试面）**：H5 视口现仅 4 支 spec 触及（flow/00/78/87/121），移动端越权与写后回读未成链；小程序树无任何 UI 自动化（`mobile-app/` 是 Tauri＋Android 壳，无 spec；小程序代码不在主干）。
3. **人工验收清单（不建工单，只建清单）**：PDA 扫码、蓝牙／云打印实机、强光可读性、杀后台、横竖屏与输入法适配、不同微信版本与基础库、Safari/Firefox 与 4K/1366 分辨率、禁用 JS 降级、Monkey 随机测试。CI 里 Firefox project 只在本地 config 声明、实际只跑 chromium，扩浏览器面属另行裁定。

---

## 7. 执行波次与号段预分配

号段规矩（血泪口径）：号段必须由编排方**事前划固定区间并附已占清单**；派工前横扫全部工作树实量，禁止实例自己 `ls` 后各自取号；单实例约 5 端点 × 3 族，超量会撞回合上限且零产出。

`e2e/flow` 主干已占至 213。在途会话已划走：**230-234**（纺织品安全）、**240-243**、**245-247**（补 e2e 两路）。本表新划区间避开上述占用。

| 波次 | 内容 | 载体支 | 号段 | 责任专家 | 验收判据 |
|---|---|---|---|---|---|
| W0 解锁 | ①主干人工 dispatch 全量验证（把主干红面钉成基线）②三支已换根分支串行推 ③配对门纳入硬拦（G1） | 现有 5 支在途 PR 之内 | 不新增 | 主编排＋质量交付 | 主干红面清单落地成表；三支 PR 的继承红有对照依据 |
| W1 存量 189 补测第一批 | C2 写后回读＋C1 可见性，销售／报价域端点 | 新建测试面支（一支 3-6 项同域） | 214-219 | 质量交付 | 每枚端点断言指名期望键与期望值；配对门 added 计数下降可复现 |
| W2 门户角色前置 | 客户／供应商外部主体（按第 10 节实测切三片：归属维度收口 → 客户侧缺端点 → 供应商录发货） | 功能面支三枚＋迁移单支 | 不新增 | 研发专家 | 归属反查不再靠 email 取首个活跃客户；缺的端点族建齐后才开客户侧 e2e |
| W3 协同并发时序 | C7＋C6（报价未审批转订单、签收前禁对账、确认后禁开票、超信用额度拦截、超折扣需主管） | 测试面支 | 220-226 | 质量交付 | 前置态两侧断言（UI＋接口）；并发用多 context 真跑 |
| W4 财务与追溯 | C8 缺腿（多币种端到端、核销、批次成本归集）＋C11 审计前后值 | 测试面支＋be 支 | 227-229、235-239 | 研发＋质量交付 | 只认序列化字符串；明细与合计无分差；追溯按缸号命中 |
| W5 人工清单交付 | C12＋L4 第 3 线清单成文并挂验收人 | 文档面支 | 不新增 | 调度与决策 | 每条写明验收环境与预期现象，不进 CI |

每波通用红线：不动 45 片矩阵（新目录才动，动则两处同步）；生成物一律用生成器重算；给"只新增文件"的专家必须授权本地 commit，否则注释门空 diff 会 fail-closed 卡成空转；专家自报完成先按派工文件清单核工作树。

---

## 8. 裁定与执行状态（2026-11-02 凌晨，按推荐默认裁定后回填）

| 裁定项 | 状态 | 落点与证据 |
|---|---|---|
| 1 主干全量验证 | **已执行** | 发起 `workflow_dispatch`，run `41326285558`，`full_suite=true`、`skip_release=true`（只验证不产出 release 二进制），锁 `f9385ce9`。判读前提：现行门控已改为按 `ci-info` 的 `full_suite` 输出放行，dispatch 不再大面积 skip，且因为 `ci-cd.yml` 的 push 触发只认 `v*` tag，这条 run 就是主干顶点的唯一自证位。已挂 30 分钟一轮的只读监控（04:30 过期） |
| 2 配对门成硬拦 | **已执行，机制已纠正** | 原推荐语"并入 `ci-cleanup-retry` needs"在 GitHub 语法上做不到——`needs` 不能跨工作流。实际落法：判定搬进 `ci-cd.yml` 做成 `ci-e2e-pairing` job（只在 `pull_request` 跑，缺分支起点判负而不是跳过），needs 27→28，顶层 job 29；独立工作流撤 `pull_request` 触发、留 `push: main` 与手工两条腿。车道 `wt-pairing-hard`（`041c32c7` ＋ AGENTS 计数与行号漂移同步一枚）。本地实测：YAML 可解析且 needs 全覆盖、actionlint 原生面零发现、`bash -n` 过、注释门命中 0（改动文件 4）。shellcheck 面与 CI 固定版 actionlint 1.7.12 交云端（本地工装下载的是 linux 二进制，Windows 跑不了，脚本自陈"拒绝判绿"属环境限制不是代码红） |
| 3 覆盖率宣称换成棘轮 | **已执行** | 判定器加"分母只准降不准升"档，三态判定（缺基线或计数与成员清单不一致退 9、上升判红并逐条点名、改善只提示重算）；基线 `frontend/scripts/e2e-pairing-coverage-baseline.json` 由 `--write-coverage-baseline` 实测生成，含 189 枚成员清单以便点名。反向自证 9→12 道全命中，实跑 `ratchet=ok 189/189` 绿。车道 `wt-pairing-ratchet`（三枚提交） |
| 4 客户与供应商门户角色 | **取证已回，实施切片已重划** | 只读取证结论见第 10 节：外部主体归属没有通用机制，客户侧与供应商侧多数端点根本不存在，新开 portal 前缀会撞权限白名单 fail-closed 与键退化。因此 W2 从"加两枚角色"改切三片，取证结论出来前不动代码，避免为过用例造角色 |
| 5 凭据落点 | **地基已落，代码腿在跑** | 本地配置 `backend/.env`（权限 0600，被 `backend/.gitignore` 命中，`git grep` 在全部被跟踪内容里对这些值零命中，工作树干净）。仓库侧只出现变量名：`WECHAT_MP_APPID`／`WECHAT_MP_SECRET`（公众号模板消息）、`WECHAT_MINIAPP_APPID`／`WECHAT_MINIAPP_SECRET`（小程序订阅消息，另用另一对凭据，公众号那对不能用）、三枚模板 ID 变量留空占位（等后台选定模板再填，代码缺失时须显式报"模板未配置"而不是静默）。openid 绑定迁移分派 `m0128`（域 `wechat_mp_binding`，链尾实测 `m0123`，`m0124` 至 `m0127` 与 `m0130` 已被在途与预留占走），车道 `wt-wxmp`。**GitHub Secrets 未创建**（属仓库设置写操作，需你授权或你在 UI 做）。两枚 Secret 已出现在会话记录里，建议按已暴露处理并重置 |
| 6 小程序树 | **维持不推** | 主干仍无 `miniprogram` 跟踪文件；静态门与 `miniprogram-checks.yml` 留在 `feat/miniprogram-adapt`，与凭据落点同批进 |

待你授权才能做的三件事：把 `wt-pairing-hard`、`wt-pairing-ratchet` 两条车道推上远端并各开一支 PR（hub 文件 `ci-cd.yml` 的改动会与在途 1144 撞面，需按串行推次序处理）；创建上述 GitHub Secrets；以及另一会话已就绪未推的三支换根分支。

---

## 9. 现状快照（截至本文件写就）

- 主干顶点 `f9385ce9`（配对门基线取分支起点那版已合入）；本文件所在树只有本文档与索引两处改动，已本地提交。
- 开放 PR 5 支：1150 死列下线（head `12fe63c4`）、1149 报价含税口径（`abb4d8a2`）、1147 坯布夹具事实（`092117cb`）、1146 录入与删除门载体（`cdad064b`）、1144 报价五棒审批链 e2e（`734f2948`）。
- 预检结论：这 5 支相对主干的端点增删实测均为 0（按 `route-snapshot.txt` 集合差比对），所以新的配对硬拦门合入后不会立刻把它们判红。
- 已合入主干：1142（缸号锁定防超卖 e2e）、1148（配对门基线修复）、1140、1145、1143、1100、1141。
- 红面归因结论：`🧹收尾清理`＝聚合器不代表本支缺陷；Rust 分片 2/10＝runner 磁盘写满（0 例未跑，基础设施红）；`contract_wave12` 的 400≠200＝夹具自相矛盾（已由 1147 处置）；flow 7/20 与 12/20 三支同撞＝指向主干侧，由 run `41326285558` 出对照基线。
- 聚合门只覆盖 `ci-cd.yml` 内部 needs：独立工作流（含配对门主干 push 腿）的红不会出现在 `🧹 收尾清理` 上，数红时要分开看。
- 换根就绪未推：三支落后分支已就地并基到主干顶点（零冲突），按串行推规矩等红面归属落地逐支推。

---

## 10. 门户角色取证结论（本轮新查出的三条硬事实，都带 文件:行号）

这一节决定原清单里所有"客户账号／供应商账号"类用例能不能开工，所以单列。

一 **外部主体归属没有通用机制**。数据隔离只有 `all/dept/self` 三档，入参一律是内部组织维度——归属人列与用户或部门成员集合（`backend/src/utils/data_scope.rs:18-25` 定义、`:83-111` 构造条件、`:116-140` RLS 专用列），注入链是 `middleware/auth.rs:304-333` → `middleware/auth_context.rs:92-128` → `middleware/rls_context.rs:71-117`。唯一的"按客户过滤"实现藏在应收核销一处：`services/data_permission_service.rs:286-304` 明确 user 表无 customer_id，改用 `users.email = customers.contact_email` 取**首个活跃客户**（消费点 `handlers/ar_verification_handler.rs:36,231,254` 与 `services/ar_ops/verification_ops/query.rs:151,160,182,191`）。一个邮箱对应多个客户时这个语义就是错的，而且它只服务 AR 域。供应商侧按 `supplier_id` 归属当前登录人的机制：**查不到**。

二 **客户侧与供应商侧多数动作没有可对端的功能端点**。**（快照里路径参数段一律写作 `*`，下文 `{id}` 与 `*` 同指一枚）**已存在：`GET /api/v1/erp/quotations`、`GET /api/v1/erp/quotations/{id}`、`POST /api/v1/erp/quotations/{id}/approve|reject`（这两个是内部审批语义）、`GET /api/v1/erp/sales/orders/{id}`、`.../history`、`.../deliveries`、`POST /api/v1/erp/ar-reconciliations/{id}/confirm|dispute|send`、`GET /api/v1/erp/purchase/orders` 与其明细与导出、`GET /api/v1/erp/ap/reconciliations` 与其 `confirm|dispute`（路径均见 `frontend/scripts/route-snapshot.txt:864,865,1550,1553,893,894,896,1048-1050,803-808,175-178,1031-1032`）。不存在：客户专用报价确认（只有 approve/reject，没有 `quotations/{id}/confirm`）、订单进度读（progress 只有生产单的 `POST /production/production-orders/orders/{id}/progress`，`:1463`）、客户签收（sign 只有内部 `POST /inventory/logistics/{id}/sign`，`:1315`）、客户上传确认样、供应商录发货（发货写面只有内部 `POST /sales/orders/{id}/deliveries`，`:1584`；`purchase/receipts` 仅读与删）。⇒ 原清单的"客户确认报价／客户签收／供应商录发货"三条属**功能缺口**，不是补测试能了结的。

三 **新开 portal 前缀这条路会踩两道硬约束**。权限键由 URL 第三段推导（`middleware/permission.rs:212-223`），新开 `/api/v1/erp/portal/...` 只会得到 `resource_type=portal`；而 `:59-70` 的路由白名单要求该段是已知资源段，未登记即对**全员含 admin** fail-closed 403（`utils/path_utils.rs:101`、`:305-306`）；把 `portal` 登记成模块前缀又会与内部 `quotations`／`orders` 撞成同名键（`path_utils.rs:236` 的默认臂保留原名），独立收细反而做不到。授键是双通道，必须同批改：角色矩阵种子 `services/init_service_ops/permission.rs:1193-1194,1281-1282` 与存量库补授迁移 `backend/migration/src/domain/ap_family_grant/m0001_grant_ap_family_keys.rs:1-6`，一致性由 `backend/tests/contract_ap_family_grant_channels_test.rs:144-150,182` 锁。另有一处代码假设与种子不一致：`middleware/permission.rs:562,565` 已经写了角色 code 为 `customer` 的打印与导出黑名单分支，而种子表里根本没有这个角色 ⇒ 单独立一条待查项，别让它长期当死分支留着。

四 **由此 W2 切成三片，顺序不可颠倒**：S1 归属建模收口（外部主体与用户的绑定关系落到列或绑定表，用探测式迁移，替换 email 反查"取首个"的错误语义）；S2 客户侧端点族（确认、进度读、签收、上传确认样）；S3 供应商录发货。每片动手前要先定口径（谁有权确认、状态机怎么流转、是否记真实委托人），因为这三条都落状态词表与审计面。C1 簇里"客户只见自己单据"在 S1 之前判**不可测阻塞**，不许用内部角色冒充客户去凑用例。

---

## 11. 标准依据（目标第一条"决策参考国标行标"的落地面）

本节只登记"哪些决策以哪份标准为准、仓内实现在哪"，用例不许把限值抄成自己的常量。

**纺织品安全检验：GB 18401-2010《国家纺织产品基本安全技术规范》**，强制性国标，2011-08-01 实施，适用于境内生产销售的服用、装饰用、家用纺织产品，出口按合同。按最终用途三分：婴幼儿（A 类）、直接接触皮肤（B 类）、非直接接触皮肤（C 类）。限值：甲醛 ≤20／≤75／≤300 mg/kg；水萃取液 pH 4.0～7.5／4.0～8.5／4.0～9.0（后续必须湿处理的非最终产品可放宽到 4.0～10.5）；染色牢度（级）耐水与耐酸耐碱汗渍 A ≥3-4、B 与 C ≥3，耐干摩擦 A ≥4、B 与 C ≥3，耐唾液仅考核 A ≥4；异味三类均"无"；可分解致癌芳香胺染料三类均禁用，限量 ≤20 mg/kg，测定按 GB/T 17592 与 GB/T 23344（后者单测 4-氨基偶氮苯，这也是外部资料里"23 种"与"24 种"说法不一致的原因，判据一律以标准附录 C 清单为准，不引用二手计数）。婴幼儿产品另有 GB 31701-2015 加严要求（含可萃取重金属）。

仓内落点与一致性：`backend/src/models/status/textile_safety.rs` 是该子域全部取值型列的唯一权威来源，落库用带前缀稳定码 `GB18401_A/B/C`（裸 A/B/C 在本仓已被质量分级、库存等级、产品等级三套语义占用，禁止互抄），展示文本" A类"一类只由 `display_label` 换算且永不入库；限值判定器 `backend/src/services/textile_safety_limit_judge.rs` 按类别行取限值，法定"不考核"是第三态（`comparator=na`），不得折算成合格，`forbidden` 与 `lte 20` 同层并存时取合取。据此两条硬要求：在途的纺织品安全用例（号段 230-234）期望值必须引用上述常量与限值行，不许在 spec 里重写数字；任何"类别降档仍判合格"或"不考核当合格"的断言形态直接判为用例错而非源码对。

## 12. 主干红面定责（run 41326285558，event=workflow_dispatch，主干顶点 f9385ce9）

**盘面**：86 个 job，78 绿、4 skip、4 红。四枚红只有两枚是本支缺陷，另两枚是随动——
`🚨 E2E 真实性门禁`（步骤"动态校验——全部 E2E job 必须真实执行成功"随 ci-e2e 结论）与
`🧹 收尾清理`（if always 的聚合器，红不代表它自己发现问题）。真红两枚：
`🎭 E2E: flow: e2e/flow(7/20)` 与 `e2e/flow(12/20)`，即 0 基分片号 6 与 11。
这一条把上一轮的悬案结掉：三支互不相关的 PR 都撞在同两枚分片上，是主干自己红，不是它们的改动带出来的。

**取证口径**（复现路径，下次别再绕）：日志末尾汇总行给出 `1 failed` 的用例名与文件行号，
制品 `e2e-report-shard-<0基号>-<run>` 里有 `ui-failures.md`（只统计 UI 操作失败，不含断言原文）
与 `playwright-output.txt`（断言原文在失败块里，要先剔掉 `pw:api` 噪声行才能看清）；
`e2e-exit-code.txt` 单列为 1 才说明红来自用例而不是某个后置步骤。

### 红一：验布打卷状态门的拒因被脱敏吞掉（flow 7/20）

`frontend/e2e/flow/211-fabric-roll-detail.spec.ts:556` 断言第二卷的拒绝文案必须点名状态门，
实际收到 `message="业务处理失败"`。判责：**源码缺陷**。真因文案在
`backend/src/services/fabric_inspection_service.rs:664`（"仅已评级(graded)状态可打卷入库，当前状态: X"），
但走的是 `AppError::business`，出参按 `backend/src/utils/messages.rs:43` 的
`BUSINESS_PUBLIC` 脱敏成"业务处理失败"——用户点"打卷"被拒却看不出为什么被拒。
本仓已把这个口径写死在四处注释里（`handlers/color_card/error_map.rs`、
`services/outsourcing_ops/order.rs`、`services/po/order_ops/crud.rs`、
`services/supplier_qualification_gate.rs`）：不含内部 ID 与数量的拒绝理由必须走
`*_displayable` 外显通道。修复在车道 `wt-main-red-fix`（分支 `fix/roll-gate-reason-displayable`，
提交 `8661ce0c`，七处 `business` 改 `business_displayable`），用例不动。

### 红二：数据权限详情路由给 200 空壳（flow 12/20）

`frontend/e2e/flow/31b-deletion-matrix.spec.ts:310`（用例本体在 1258）判负，消息里
`postStatus=200, getApi="/data-permissions/1", marker=null`。判责：**源码缺陷**。
`backend/src/handlers/data_permission_handler.rs` 的 `get_data_permission` 对
"记录所属角色非 admin 且 `is_enabled=false`"（删除即软删，见
`backend/src/services/role_permission_service.rs:420`）返回 `ApiResponse::success(None)`，
即 HTTP 200 而 `data` 为空——与真正缺行用的 404 是同一种调用侧语义却给两种形状，
前端只能判 null（`frontend/src/api/data-permission.ts` 旧注释），删除回读也拿不到硬删证据。
用例的判定本身是对的（要么 404，要么 200 带软删标记），不动。修复在车道 `wt-dp-404`
（分支 `fix/data-permission-detail-404`，提交 `f6784713`）：不可见与缺行统一 `AppError::not_found`，
出参去掉 `Option`，同批收掉 `frontend/src/views/data-permission/index.vue` 里恒真的 null 分支。
本地面：`rustfmt_repo_check.sh` 全仓 1878 文件 FMT_REPO_OK；
`check-api-envelope.mjs`、`check-contract.mjs`（14 组 198 字段 0 错）、`check-api-paths.mjs`、
`check-api-request.mjs`、`vue-tsc -b --force` 全 rc=0；注释门命中 0。
prettier 对 `data-permission.ts` 与 `index.vue` 报 warn，控制组（主干未改副本）同样报 warn，
且把格式化结果与本轮文件逐行比对为空——属本机 CRLF 伪影，不据此跑 `--write` 制造行尾 churn。

### 已定责的观测面：waitListResponse 恒超时（判测试面，非前端缺陷）

两枚分片的 `ui-failures.md` 各自记了大量 `[waitListResponse]` 超时（7/20 片 132 处、
12/20 片 30 处），命中端点恒为三族：`GET /api/v1/erp/production/dye-batches`、
`GET /api/v1/erp/custom-orders`、`GET /api/v1/erp/color-cards`，三枚都在 `route-snapshot.txt`
里真实存在。超时含义是"浏览器压根没发这个请求"，与断言失败不同性质，所以不判红，
但每枚 `ensureTestEntities` 白烧 3×20s 种子预算（`playwright.config.ts` 里 `retries: 0`，
132 与 30 都是 3 的整数倍，即三处各满 20s，非重试重复计数）。两条根因：

1. `frontend/e2e/flow/ui-helpers.ts` 的 `readFirstEntityId` 先 `safeGoto` 再注册
   `waitForResponse`，而 `custom-orders` 与 `color-cards` 两页的列表 GET 由 `useTableApi`
   在构造时自动发一次，错过挂载那一刻就恒等满超时。仓内早已认证过该范式：
   `frontend/e2e/color-card.spec.ts` 文件头明写"waitForResponse 必须注册在导航前"。
2. `frontend/e2e/flow/helpers.ts` 种子第 11 把 dye-batches 导航到 `/production`
   （生产总览页，挂载只刷新本页数据源，全文无 dye 引用），而批次列表页是 `/dye-batch`
   （`src/router/index.ts` 的 path 与权限键 `dye-batches:read`，`views/dye-batch/index.vue`
   的 useTableApi 构造即初始加载）。落点写错页 ⇒ 该腿恒超时。

修面在车道 `wt-e2e-waitfix`（分支 `test/e2e-wait-response-before-nav`，提交 `c6cbb3ba`，
两文件 9 增 2 删）：等待器改为先挂后导航，导航落点改到真正发请求的页面。本地四道 e2e
静态门（types/shard-coverage/select-ratchet/worker-account）与 eslint 全绿、注释门 0 命中。
**行为面只能由 CI 证**：等待器改对之后，原本静默空转的 UI 腿会开始真拿响应，
若某端点形状与声明不符会首次暴露成红——那是把既有漂移暴露出来，不是新增缺陷，判责时按此认。

## 13. 在途 PR 红面定责与本轮推送（2026-11-02 01:10）

### 13.1 Rust 分片红有一类是磁盘，不是代码

判据（实测，可复现）：`test-report-partition-<m>` 制品体积。正常分片 26-33KB，**1627 字节＝归档解包失败**。

- PR #1150（head `12fe63c4`，run 41320387994）`Rust 测试 (9/10)` 与 PR #1146（head `cdad064b`，run 41294816393）`Rust 测试 (2/10)` 两份制品逐字节只差临时目录名，正文末行都是 `No space left on device (os error 28)`，卡在解包 `target/debug/deps/contract_wave2_supplier_qualification_attachment_test-…`。nextest 把约 4GB 归档解到临时区，临时区与 runner 根分区同盘。
- 这两枚此前被记成"本支待查的代码红"，实际一条断言都没跑起来。修向是工装：解包前腾空间 + 把磁盘不足点名成独立结论，不放宽判定（仍判负）。

### 13.2 #1146 的另一枚红是本支真红，属断言没跟功能口径

`Rust 测试 (3/10)` 分片失败 1 例：`contract_wave12_greige_recipe_gates_test.rs:352` 断 `left == right` failed，left 400 / right 200。本支把坯布删除门从读 `status` 改成按可撤回性判（零在架实物 + 无活单据引用，见 `greige_fabric_handler.rs` 的 `remaining_stock_rejection` 与 `find_greige_reference_rejection`），而旧用例仍按"状态设成已出库就可删"播种 weight 10.00。处置按"断言随功能口径同步"：归零两列走可撤回路径仍断 200，另加一条真有在架库存的 400 拒因腿（断言与源码文案逐字同源 + 回读 `is_deleted` 仍 false）。

### 13.3 一处我自己写错的判据，当场更正

先前本节写的是"#1144 的 extras 失败没有任何报告制品，属取证盲区"。**这句不实，且我上一版的"更正"也只对了一半**（它仍说"制品确实缺"）。逐件核实 run 41309252987 的全部 94 枚制品后：分片 0 到 44 **每一片都有** `e2e-report-shard-<N>-<run>`，失败片另有 `e2e-diag-shard-<N>-<run>`（本轮 6、11、44 三片有 diag，44 就是那枚 extras: fullflow 5/5，12.5 MB，内含 error-context.md 全套）。根本不存在 extras 族的制品缺口，也没有需要补的工装步。

我连错两次的成因都在方法上，不是 CI：

- **按 label grep 制品名恒零命中**：`e2e-report-shard-44-…` 这类名字里只有分片号，`matrix.label`（"extras: fullflow 5/5（按实测时长分组）"）从不进制品名。用 label 关键词过滤必然得到空集，再把空集读成"没制品"。
- **job 级制品端点 404 不等于无制品**：`/repositories/<id>/actions/jobs/<job>/artifacts` 这轮实测返回 `HTTP/1.1 404 Not Found`（`curl_rc=0`，是真 404 不是断网），而 run 级端点同刻能取到该 job 的制品。制品清单只认 run 级端点。

正确归属法：跑测步之后的取证步会打一行 `E2E-FORENSICS-MAP shard0based=<0 基号> label=<矩阵标签> reportArtifact=e2e-report-shard-<号> diagArtifact=e2e-diag-shard-<号>`，label 与制品的对应只从这行取。断言原文有两处来源，先用 job 日志里成对的 `E2E-ASSERT-BEGIN <test-results 目录>/error-context.md` 与 `E2E-ASSERT-END` 块（快，无需下载），要截图与 trace 再下 diag 制品（zip 套 tar.gz 两层）。本轮 44 号片的诊断制品里取到的两条失败原文与日志块逐字一致：

- `frontend/e2e/fullflow/40-quotation-role-journey.spec.ts` 的 40-01：`Error: 报价头税额：键 tax_amount 期望 26000 实际 0 原始 "0"`
- 同文件 40-02：`Error: locator.waitFor: Timeout 15000ms exceeded. locator('.actions .el-button').filter({ hasText: '返回' }).first() to be visible`

40-01 定责（已定，落在用例侧）：后端把 `tax_inclusive` 读作"单价已含税"，`calc.rs:24-31` 据此把小计当含税额、`tax_amount` 记 `Decimal::ZERO`；明细腿 `crud.rs:160-189` 只写 `amount` 与 `amount_with_tax` 两列，压根没有行税额列。旧用例却写 `tax_inclusive: true` 又把净额送进 `unit_price`，再按"净额乘税率"断头税额 26000 —— 前提与断言两头都对着源码不成立。修向是提交口径改成不含税（净额与含税单价两个事实都由调用方给且互相钩稽），行税额按 `amount_with_tax - amount` 导出，并加两条头行钩稽断言把"明细和合计无分差"钉成可失败判定（`ce038be3`）。遗留的源码侧不对称如实记着：`tax_inclusive` 为真时头 `tax_amount` 恒 0，而明细侧存在含税与净额两列，同一张单的头与行对"税额"给的不是同一个口径，要不要统一到差额口径属产品裁定，不在测试面动。

40-02 的处置（不定根因，先把归因分开）：动作区整块在 `v-if="quotation"` 内，详情读失败时连"返回"都不渲染，原先那枚 15s 超时同时替"读面被行级数据范围门挡"和"按钮缺失"两种根因背锅。改法是进页面前先等那次详情 GET 并点名状态码，等不到响应与非 200 各出独立结论，批准与拒绝各须恰一枚的计数断言不放宽。真实根因等 `ce038be3` 的 run 出结果再定，不预先写进结论。


### 13.4 本轮推送与 PR 形态

| 载体 | 内容 | PR |
| --- | --- | --- |
| `fix/main-e2e-reds-roll-gate-and-dp-404` | 打卷状态门拒因改可外显通道 + 数据权限详情按 404 出（两笔，cherry-pick 到同基点新支并 `-x` 记来源） | #1151 |
| `carrier/fn-batch-1101` | 追加坯布删除门断言同步（fast-forward，非 force） | #1146 更新 |
| `ci/nextest-archive-disk-guard` | Rust 分片磁盘工装修面（只动分片步，不新增 job，`ci-cleanup-retry` 的 needs 不变） | #1152 |

推前门：rustfmt backend 全作用面 1878 文件 offender 0；`check-api-envelope/contract/api-paths/api-request` 四道 rc=0；注释门命中 0；#1152 另有 actionlint 原生面零发现、`bash -n`、判定器检测力自证（拿真制品正文命中 os error 28）。远端回读：`833057d7`／`f16b1293`／`b2c439d9` 与本地 HEAD 一致。

测试面车道（214、waitfix、217、235、252 已落盘，215/218/236/253 在写）**未推**，等全部落盘后合成一枚测试面 PR——本仓规矩：测试文件变更一律单独 PR，绝不与功能面混。
