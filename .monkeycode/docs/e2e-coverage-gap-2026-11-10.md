# 存量漏测疑点清单 2026-11-10（配对门全量面首次量出）

本文只登记实测事实与优先序，不改代码。口径全部来自 e2e 配对门判定器本身，
不是另起一套统计，任何人可用一条命令复现同一组数：

```
cd frontend && node scripts/check-e2e-feature-pairing.mjs --self-test
```

看输出的 `SELFTEST_POOL` 一行即本文全部总数；`--full-surface` 那趟的 `mode=full`
汇总行给出同一组数的判定视角。基线文件在 frontend/scripts/e2e-feature-pairing-ratchet.json。

## 一 总量

| 口径 | 数 |
| --- | --- |
| 在册端点（后端路由面派生，与 route-snapshot 同谓词） | 1822 |
| 配上用例（用例文件里既命中该路径又出现该方法记号） | 1199 |
| 弱命中（路径前缀命中某个用例文件，但该文件里没有该方法的记号） | 20 |
| 零引用（frontend/e2e 下无任何引用） | 603 |
| 其中 前端有调用点，属用户可达 | 164 |
| 其中 前端零调用点 | 439 |
| 带理由豁免在册生效 | 0 |

零引用占在册约三分之一。此前这个比例没人量过，因为这道门只有增量语义
（只判"本支相对分支起点新增的端点"），存量面从未被扫过一遍。

上表是并基主干顶点后的修正值。首版量出的是 606/167/1195/21，那次判定跑在
落后主干一个提交的车道语料上，缺 248 与 458 等已合入用例，把本来已被覆盖的
三枚端点算成零引用。修正过程与退休的三枚键见第六节 6.6。

## 二 按资源段分组（零引用 606 枚，共 124 个分组，取前 18）

erp/production 39，erp/fixed-assets 18，erp/quotations 17，erp/inventory 15，
erp/bulk-color-approvals 14，erp/color-cards 14，erp/contract-templates 14，
erp/boms 13，erp/budgets 11，erp/quality-standards 11，erp/finance 11，
erp/chemical-requisitions 10，erp/chemical-lots 9，erp/print-templates 9，
erp/roles 9，erp/textile-submissions 9，erp/vouchers 9，erp/crm 9。

分组是按 URL 第 3 与第 4 段拼的粗粒度，同一业务域可能落在两个分组里
（例如委外染整既在 production 也在 textile-submissions），拆批前要先按域归并一次。

## 三 优先序（这条是本清单的结论，不是数字）

1. 先补 164 枚"前端有调用点"的：它们是真用户可达功能，按目标 三 的面料主链顺序排
   （色卡 样品打样 报价 库存细码 采购 销售 委外染整 质检 对账结算），
   高危写面（审批 红冲 作废 发放 锁定）排在同域纯读面之前。
   这 164 枚是配对门自己定的硬口径，仓内既有规则写明有界面入口的端点不许靠豁免过门。
2. 再判 439 枚"前端零调用点"的归属，不要直接给它们补 e2e。
   给一个界面进不去的端点写端到端用例，测的是不存在的能力，属凑覆盖率。
   每条只有三种合法去向：确实是对外或内部集成端点（改走接口测试并显式登记带理由豁免），
   确实是死端点（随所属域一起下线），或前端漏接（那是功能缺失，要先补前端入口再补用例）。
   已裁定方向可直接命中其中一部分：单据号展示端点一族的 7 枚 generate-no 已定为废除方向，
   BOM 一族的 13 枚随 BOM 下线一并消失，这两批不必再补测。
3. 弱命中的 21 枚单列一批：路径出现在用例文件里但那个文件没有对应方法的记号，
   常见成因是只测了 GET 列表没测同一资源的写面，或字符串撞车造成的假命中。
   它们已被计入"配上用例"以外的中间态，判据目前不判红，属已知宽松点，
   收紧时要连判定器一起改，不能只改门。

## 四 与在途工作的关系

- 棘轮基线只减不增：补上用例或端点下线后从基线删条目，禁止往里加新债。
  定期腿每天会把全量面重跑一遍，新出现的零引用端点当场判红。
- 拆批时号段与车道要先实量：同一车道两实例会撞同一个 spec 编号，
  单实例承载量约 5 端点乘 3 族，超量会撞回合上限且零产出。
- 本文数字的时效：以 origin/main 顶点 6a0ca600e 为参照面实测。
  在途支若新增或删除端点，合入后数字会变，复现命令不变。

## 五 尚未量出的（留给下一轮，不在本文充数）

- 167 枚可达漏配的按域分布：已量出，见第六节。
- 三端归属：这 606 枚里有多少属于 H5 或微信小程序独有链路，
  需要按前端源码目录（PC 的 frontend/src 与小程序树）分面重跑一次可达性。
- 目标 三 要求的面料核心字段（色号 缸号 批次 门幅 克重 米数 卷号 损耗 余码 色差 打样版本）
  在用例里的落字段覆盖，本清单只到端点粒度，没到字段粒度。

## 六 164 枚可达漏配的按域分布与批一选题（并基主干后修正值）

### 6.1 怎么量出来的

判定器新增 `--emit-gap-json`，把全量面已算出的逐枚漏配结果落盘，每行含键、方法、
路径、资源段分组、前端可达性布尔。可达性谓词与豁免分支用的是同一条
（matchNeedles 命中 frontend/src 源码），分组也是报告里那一条，不另起口径。

```
cd frontend && node scripts/check-e2e-feature-pairing.mjs --emit-gap-json <落盘路径>
```

守恒自证：导出 603 行，reachable=164、dead=439，与 `--self-test` 的
`SELFTEST_POOL uncovered=603 uncoveredWithUi=164 uncoveredNoUi=439` 逐字相等；
11 道反向探针仍全命中，说明这次改动没有把判定面改宽或改窄。

### 6.2 分布

164 枚落在 52 个资源段分组。前十：production 14、inventory 12、roles 9、
quotations 7、sales 7、ar 6、crm 6、financial-analysis 6、bi 5、finance 5。

方法分布 GET 94、POST 54、PUT 9、DELETE 6、PATCH 1。即写面 70 枚、读面 94 枚。
按第三节优先序，同域内写面先于读面，故批一从这 70 枚里选。

### 6.3 先排除与在途支撞面的域

开放 PR 七支各自的域（按分支名与改动面核）：审计定位维度（audit-logs、business-trace）、
超折扣审批门（quotations）、BOM 与 MRP 整族下线（boms、production/mrp）、
开票前置门（ar 发票族、finance）、物流面单配对（logistics-tracking/waybills）、
配对门自身（scripts）、通知入口权限同源（notifications）。

据此从写面 70 枚里剔除：quotations 3 枚、boms 1 枚、production/mrp/convert-orders 1 枚、
logistics-tracking 3 枚、inventory/logistics 3 枚（与面单族同属物流域，待逐路径核实前不抢）。
剔除后剩 59 枚可排批，其中面料主链上的干净候选如下。

### 6.4 批一选题（库存细码写面，5 枚，已落地）

- POST inventory/batches/*/transfer（批次转移，对应缸号锁定与调拨）
- PUT inventory/batches/*（批次改）
- DELETE inventory/batches/*（批次删）
- PUT inventory/transfers/items/*（调拨明细改）
- DELETE inventory/transfers/items/*（调拨明细删）

选它的理由：inventory 是可达漏配里第二大的一域（12 枚），这 5 枚全是写面且直接落在
目标 三 的库存细码环节与目标 4.1 的 E 节（删除作废红冲持久化）、G 节（缸号锁定与
库存数字）、4.3 反向链路（调拨、盘点、盘盈盘亏）上；与七支在途域零交集。

已拆两枚 spec 落地在车道 wt-inv-write-b1（分支 test/e2e-inventory-write-face-batch1，
基于主干顶点 9389e189c）：483-inventory-batch-write-face.spec.ts 覆盖批次族 3 端点
（5 个 test、52 条 expect），484-inventory-transfer-items-write-face.spec.ts 覆盖调拨
明细族 2 端点（4 个 test、45 条 expect）。号段 483 与 484 已横扫 151 个车道实量为空闲。
两枚都经 prettier 归一与 TypeScript 语法诊断零错；本车道无 node_modules，eslint 与
vue-tsc 与 playwright --list 未跑，类型与实跑结论留给 CI。

原选题里的盘点明细 PUT 与 DELETE 两枚已撤销，理由见 6.6：它们其实已被 248 号用例
以 API 字面量覆盖，首版判零引用是陈旧语料造成的假漏配，再写就是重复用例。

批二候选（同法排除后）：production 的 production-recipes/additions/*/approve 与
/*/close 与 calculate 共 3 枚（委外染整配料审批），products 的 batch/create、
batch/update、batch/delete 共 3 枚（基础档案批量写）。roles 6 枚与 users 3 枚属
权限域，排在面料主链之后但在读面之前。

批二落地前核验（2026-11-10）：products 的 batch/create、batch/update、batch/delete
三枚经 grep 确认 frontend/src/api/product.ts 第 279、288、294 行有真实消费点，属可达
漏配（真实批量写功能缺 e2e），且 catalog 域与七支在途零交集，定为批二首选，落地前
再核 e2e 零引用与号段空闲。production-recipes/additions 三枚暂缓：1184 BOM 下线支
大改 backend/src/routes/production.rs 与 production_order_ops，additions 是否随删
未定，待 1184 合入后再核，避免抢覆盖面写废用例。

### 6.5 派工前还要做的两件事

一，号段实量：已做。横扫 151 个含 e2e 目录的车道，已占号最大 482，483 起全空，
批一取 483 与 484 两号，落地后已复核无重号。
二，逐路径核实 inventory/logistics 与 logistics-tracking/waybills 是否同域：
若不同域，那 3 枚（sign、改、删）可并入下一批，批一不变。本文先按保守口径排除，
不抢在途支的覆盖面。

### 6.6 更正记录 首版底数被陈旧语料抬高三枚

首版（本文第一稿）量出 606 枚零引用、167 枚可达，并据此把盘点明细 PUT 与 DELETE
选进批一。落地前逐枚核既有语料时发现 248-inventory-count-items-diff-cycle.spec.ts
对这两枚有十余处真实 API 调用（含状态门、负数量、不存在主键、非法路径、二次删除），
458 号用例也有一处删除调用。判定器不该判它们零引用。

根因：那次判定跑在 wt-pairing-cron 车道，该车道落后主干一个提交，语料里根本没有
248 与 458 等已合入用例（语料文件数 423）。并基主干顶点后语料增至 430 个文件，
重跑自证得 uncovered=603、uncoveredWithUi=164、uncoveredNoUi=439，退休三枚键：

- DELETE /api/v1/erp/inventory/counts/items/*
- PUT /api/v1/erp/inventory/counts/items/*
- GET /api/v1/erp/inventory/counts/generate-no

新增零枚，11 道反向探针仍全命中。棘轮基线已按只减不增重算为 603 条并提交。

为什么这不只是数字好看不好看：基线的作用是庇护存量债，被庇护的键日后即使用例
被删也不会判红。把本来已覆盖的端点写进基线，等于给"删掉 248 号用例"这件事提前
发了免死金牌，属假绿风险。故发现即收缩，不留到下一轮。

教训入规：量全量面底数与生成棘轮基线之前，必须先并基到主干顶点再跑，不能在
落后主干的车道语料上量。本文第一稿的 606/167 与批一里的盘点明细两枚就此作废，
以本节与 6.4 的修正值为准。

## 七 三批落地实录与选题前必做的证伪

三批均已并基到主干顶点 bef790c20 后开独立测试 PR，只新增 spec、不动共享 helpers
与 route-snapshot，彼此及与在途审计域 BOM 域零文件交集：

- 批一 库存细码写面五端点，483-inventory-batch-write-face.spec.ts 与
  484-inventory-transfer-items-write-face.spec.ts，合九个 test。
- 批二 产品批量写面三端点，485-product-batch-write-face.spec.ts，八个 test。
  创建与更新事务整单回滚、删除按主键部分成功，三态更新与超上限拒皆有实断。
- 批三 权限域两个改口，486-role-user-update-write-face.spec.ts，八个 test 四十二条断言。

### 7.1 批三选题经过两次证伪

第一次判色卡与打样域为缺口，核既有语料后证伪：23-color-card-full、
110-color-card-stock-intake、113-color-card-maintenance-chain、
114-color-card-issue-gate-chain、440-color-card-sample-proofing-chain、
210-lab-dip-color-difference、446-sample-version-downgrade-and-production-transfer
已把该族写面覆盖满，再写即重复用例。

第二次判色价域为缺口，同样证伪：115-color-price-chain.spec.ts 覆盖建价改价审批
批量调价软删五个写口，116-color-price-seasonal-tier.spec.ts 覆盖季节规则阶梯与
客户特价。首版判缺口是因为 grep 只匹配了 color-card 族词形，没匹配 color-prices，
属判定面过窄造成的假缺失。

真缺口最终由宽模式实量确证：PUT /roles/* 与 PUT /users/* 两个改口在 e2e 零真实
调用，所有 users 变量路径命中都是清理删除或 GET 回读。故批三取这两口。

### 7.2 选题判据固化

一，参照面必须是主干顶点的语料，不能是落后车道（第 6.6 节教训）。
二，端点词形要按族枚举，不能只匹配一个近义拼法（本节 color-prices 教训）。
三，命中要区分调用性质：清理腿的 DELETE 与回读的 GET 不算该写口被覆盖，
只有对该端点发起目标方法并断言落库结果才算。
四，判某端点已覆盖前要看它是否被断言链钉住，仅出现在注释或 CLEANUP 数组里不算。

### 7.3 批三两条安全判据的取值依据

UpdateRolePayload 刻意不含 code 列（禁止改角色编码防提权），故夹带 code=admin
后回读 code 必须逐字符不变，这条是批三的安全核心而非装饰断言。

update_user 内另有一道提权拦截，但它排在 require_admin_role 之后；非管理员会话
在更早的门就被拒，该分支经 HTTP 不可达。故只断言真实管理员门回 403 与目标行不变，
不断言那条不可达文案，避免写出恒过或恒红的假断言。

## 八 批四候选 production-recipes 次腿（端点级已核 2026-11-10）

参照面取 origin/main 顶点 565ff6b50，按 7.2 四条判据逐腿核实，非按族粗筛。

production-recipes 写面共 15 腿（route-snapshot）。主腿已断言级覆盖：create（03-production、446、44f），approve（03-production 带 status=approved、approved_by、approved_at 三断言），update（03-production PUT 后 GET 回读），close（44f real-lifecycle POST close）。

次腿确证零断言覆盖五条，定批四首选：
- POST /production-recipes/{id}/cancel 全 e2e 零命中，取消跃迁无测。
- POST /production-recipes/calculate 零命中，这是大货处方成本计算腿，对客观 4.5 染费运费分摊与毛利口径直接相关，漏测代价高。
- POST /production-recipes/{id}/additions 投料明细新增，仅在 traversal endpoints.config.ts 遍历清单登记，无断言。
- POST /production-recipes/additions/{id}/approve 投料明细审批，同上仅遍历清单。
- POST /production-recipes/additions/{id}/close 投料明细关闭，零命中。

判据依据：遍历清单与 endpoints.config 出现不算覆盖（判据四），cleanup 与 GET 回读不算写面覆盖（判据三），故以上五条按断言级口径判为真缺口。additions 两腿此前被 endpoints.config 的单点命中掩盖成「有覆盖」，逐词形与命中性质复核后证伪。

落地前置：落笔前先 ls frontend/e2e/flow 向编排方取未占号段，spec 覆盖五腿的状态跃迁、字段回读、非法前置拒因（calculate 依赖配方明细齐备、additions-approve 需先 create、cancel 后禁止再 approve）。与在途四支（BOM 下线、inventory、products、roles-users）零交集。CI 拥塞期不推，待四支收口后排入可推波次。

## 九 批四落地实录 production-recipes 次腿五处（2026-11-10）

号段实量：横扫全部 71 个工作树的 frontend/e2e 用例文件名取号，450 段以上最大实占 486（480 与 481 与 482 归 BOM 支，483 与 484 归 inventory 支，485 归 products 支，486 归 roles-users 支），487 起未占，本批取 487。

交付面：车道 E:/work/bingxi/wt-recipe-legs，分支 test/e2e-production-recipe-legs，基线 origin/main 顶点 565ff6b50，单文件 frontend/e2e/flow/487-production-recipe-cancel-calculate-additions.spec.ts（588 行，九条用例），提交 20a8861ae。与在途四支零文件交集，未新建第二枚 spec，未动 helpers 与遍历清单与基线。

九条用例对五腿的映射：487-01 与 02 与 03 与 04 打 calculate（公式重算、浴比三写法同值、加成系数放大与缺省、四类非法前置）；487-05 打 cancel（腿内返回态、读回落库态、再取消拒、再审核拒、非法跃迁后进库态未变）；487-06 打 additions 建单对 draft 父单的前置门并读回子资源列表证被拒不落库；487-07 打 additions 建单成功腿（路径 id 覆盖请求体关联、PA 号形、单张读回、父单子资源命中、诱饵父单零命中）；487-08 打 additions approve 与 close 两段跃迁各读回并打重复审批与终态再关闭与终态再审核；487-09 打加料跳步（draft 直接 close 拒且状态未进）。

落笔前钉死的契约事实（全部取自 origin/main 顶点实读，非记忆）：
- calculate 是纯函数，无库访问；公式为 浓度% 乘 备布重量 乘 浴比冒号后数值 除以 100 再乘 加成系数，系数缺省 1，浓度为空的物料行原样返回其用量。浴比接受半角冒号、全角冒号、斜杠三种写法（services/production_recipe_service.rs 的 parse_liquor_ratio 一次遍历归一）。
- 拒因面：备布重量不大于 0、浴比空串或格式非两段或分母不大于 0、加成系数不大于 0、浓度为负，四族一律用脱敏构造器 AppError::business，HTTP 400 且机器码 BUSINESS_ERROR，出参 message 不外显真实文案。故用例只钉状态码与机器码，不钉中文文案（钉文案会把源码推向可外显改造，属改判责）。唯一可外显的是删除腿（validate_can_delete 用 business_displayable）。
- 词表实值（models/status/quality_dyeing.rs 第 111 与 126 行两个模块）：大货处方 draft、approved、closed、cancelled 四态全小写，加料处方 draft、approved、closed 三态全小写。跃迁为 draft 到 approved 或 cancelled，approved 到 closed，closed 与 cancelled 是终态。
- 审核腿实读只校验状态跃迁与「处方明细非空」，不建生产领用单据、不要求工单（services/production_recipe_ops/recipe_state.rs::approve），故 44e 时代「审核后自动建立领用单据」的文档口径在本支不是断言依据。
- 加料建单的关联父单由 handler 用路径 id 强制覆盖请求体，身份取会话 auth.user_id，请求体不承载身份；单号前缀 RP 与 PA 后接 8 位日期与 3 位流水（utils/number_generator.rs 的 date_prefix 用 %Y%m%d）。
- 路由面（routes/production.rs 第 185 至 216 行）加料单只挂 GET 详情与 approve、close 两条跃迁，在册 DELETE 仅 /production-recipes/*，且服务端仅草稿可删。

清理与残留：afterAll 走仓内既有 browser 新建上下文形态（481 与 482 同款，已上主干），只对草稿态大货处方发真实 DELETE。已审核、已取消、已关闭的处方与全部加料单没有可达删除端点，按前缀 RP487 留在 e2e 库中，不伪造清理 URL，不为凑绿调断言次序。

未本地验证面（如实登记）：该车道无 frontend/node_modules，tsc 类型门与 playwright --list 均未跑，本地零验证。断言能否通过只认 CI；本批的四处高危形态（DECIMAL 出参字符串线格式、RP 与 PA 号形、被拒建单不落库、路径 id 覆盖）若与真实运行不符会显红，按红面回到同一 job 取证再判责，不在本地预改。

## 十 配对门本地可跑与批四锁档（2026-11-10）

新取证通道：`node frontend/scripts/check-e2e-feature-pairing.mjs --full-surface` 零依赖、不碰 node_modules，本地即可跑（从 frontend/ 目录执行，退出码 0 打 PAIRING_GREEN）。它把当前全部端点拉进判定集对一份只减不增的棘轮基线，基线内只报告、基线外新发生的才判红，因此全量底数不必等 CI 也能自证。

批四锁档实录（车道 wt-recipe-legs，提交 4caf84d43）：487 落地后该门自报四条由漏配转入 PAIRING_DEBT_RETIRED（GET production-recipes/additions/*、POST additions/*/approve、POST additions/*/close、POST production-recipes/calculate），按门自身话术「已配上用例或已下线，应从棘轮基线删除」从 e2e-feature-pairing-ratchet.json 摘除；摘后复跑 JSON 可解析、rc=0、PAIRING_GREEN，retired 由 16 降到 12，debt 590 不变（摘的是已配上项，不是新漏配）。cancel 腿本就不在基线内。

同一时刻门自证的底数（参照面为该车道基线 origin/main 565ff6b50，语料 437 个 e2e 文件加 733 个 src 文件）：judged=1824 paired=1213 weak=21 exempt=0 debt=590 reachableOrphans=151 deadOrphans=439。这组数是配对门口径的字面引用判据，弱于本清单 7.2 的断言级四条：spec 里出现过该路径前缀且同文件有该 METHOD 记号即算 paired，所以 paired 集合里仍可能藏着零断言的次腿（本批 additions 两腿此前正是被遍历清单命中而看似有覆盖）。反向也成立：debt 集合可直接当候选池用，但入批前必须逐腿回 handler 与 service 复核有无真断言。

下一批候选（门自报、待断言级复核）：GET production-recipes/by-work-order/*（本域剩余唯一基线内漏配）；lab-dip 族四条（resamples 建单、result、tech-card 与同族写腿）在基线内成串出现；mrp/convert-orders 在基线内但该端点随 BOM 下线的在途支可能整族移除，动它前必须先确认承载支归属，避免重复立项。weak=21 那批只点名不判红，属经封装助手发请求的正常形态，不作缺陷登记。

## 十一 棘轮基线清档与批五选定（2026-11-10）

清档实录（车道 wt-recipe-legs，提交 9873f0dd6，diff 为 12 行删除零新增）：配对门一轮自报 16 枚 PAIRING_DEBT_RETIRED，其中批四四枚已在 4caf84d43 手摘，余 12 枚按门自报的 RETIRED 键集程序化摘除（只按该集合过滤，禁止往里加条目），基线 602 降到 590。摘后复跑门 rc=0、PAIRING_GREEN、retired=0、debt=590，与基线条数守恒一致。

清档显出的新事实：lab-dip 族三条（resamples 建单、result、tech-card）与另两条 GET 其实早由 flow/210-lab-dip-color-difference.spec.ts 断言级覆盖（该文件第 675 到 825 行覆盖建单诱饵拒因、失败与通过两态、开卡号形与重复开卡拒绝），基线里的条目是清档滞后而非真缺口。教训入册：基线条目只代表"上一次生成时未配上"，判"某腿缺测"必须回到语料读断言本身，不能只读基线；本清单第七节与 7.2 四条判据对门产出的数据同样适用。批五因此改定域（见下），不在已覆盖的 lab-dip 上重复立项。

同域分布实量（清档后 debt=590 按一级路径计数）：production 35、fixed-assets 16、quotations 15、contract-templates 12、color-cards 12、bulk-color-approvals 12、finance 11、boms 11、vouchers 9、quality-standards 9、purchase 9、crm 9、budgets 9、inventory 8、financial-analysis 8、dashboard 8、chemical-requisitions 8、textile-submissions 7。boms 11 枚不选（随 BOM 下线在途支整族消失，动它是重复立项）；production 与 inventory 与 quotations 与 crm 域与在途四支的补测面重叠风险高，选前先核文件交集。

批五选定：bulk-color-approvals 域 14 腿（DELETE 一处、GET 六处：列表 详情 history report statistics 与两个提醒读面；POST 七处：建单 send-to-customer approve reject rework downgrade cut-sample scrap）。该域整条就是大货色样审批状态机，直接挂目标里的面料核心字段（色号、色差、打样版本）、反向链路（返工 降级 报废 剪样）、审批时间线（history 腿）与多角色协同（客户确认与客户驳回），补测价值高于同批其它候选。号段取 488（487 归批四，489 与 490 预留）。

落地前置：先读 handlers/bulk_color_approval_handler.rs 与 services 对应文件的七条写腿入参、状态词表实值与前置门，再核前端页面与在途支是否已在 e2e 侧留号，最后按第七节联动门要求同步遍历清单与基线（生成物用生成器重算，不手改）。CI 拥塞期不推。

## 十二、批四批五推送实录，与配对门对单段资源的检索盲区

车道 wt-recipe-legs 分支 test/e2e-production-recipe-legs，基线为主干顶点 565ff6b50（现读远端确认 behind=0，未并基即推）。五笔提交合起来是三枚文件的 1055 增 16 删：

1. 487 大货处方族九枚用例，593 行。取消腿 用量计算腿（三档精确值 40 与 7.5 与 60，浴比三种写法同值，加成系数可放大）四枚非法前置 加料三态流转与逐态读回 路径号覆盖请求体号 清理分档。
2. 488 批色单族九枚用例，462 行。建档三拒（跨单错挂 明细行缺席 非法样布类型）产品与色号以行为准（伪造值不生效）pending 态六条跃迁全拒且不改状态不写时间线 读面形状四钉 删除后详情与再删双 404 不存在主键三腿 404。
3. 棘轮基线两笔只减摘除十六枚（批四四枚 本轮门自报 RETIRED 十二枚）。

推送前的本地档位，prettier 两枚文件由 warn 改到全过；类型门 tsc -p tsconfig.e2e.json --noEmit 的剩余错误数实测为 2，正是两枚永久基线伪影（32-import-export 的 path 与 helpers 的 crypto），新增用例零类型错；配对门全量面跑通且无 TOOL_BUG。

类型门抓到的一处真缺陷值得记档。488 初版在成功面写 res.status，五处编译错。事实是 helpers 里两个返回类型不同名，ApiResponse 只有 code message data，ApiFailureResult 才继承 status。所以断成功只用 code，断拒因才用 status，两侧混用必编译失败。同类坑在 488-06 的删除腿复现一次（toBeLessThan(300) 改成 code 等值 200）。

配对门的检索盲区（本轮新量出，判据级）。matchNeedles 的口径是，整串取静态前缀，再在 path 以挂载前缀开头时追加一条去前缀串，但去前缀串必须至少两段才进检索（防只剩一个斜杠的退化判定）。末段就是主键的通配端点（快照形如 METHOD 前缀/单段资源名/星号）去前缀后恰为一段，被这条门槛丢弃，于是只剩带完整挂载前缀的那条串参与子串匹配；而用例按前端调用方惯例只写 baseURL 之后的相对路径，永远命不中。后果是这类端点即便写了真断言也会恒报 PAIRING_DEBT，且永不出现 PAIRING_DEBT_RETIRED，基线里的这一族属结构性不可退役项，不代表用例缺失。实证对照，同资源的 report 与 statistics 两枚静态路径正常退役，同文件的通配删除腿不过——差异只在段数。改判定器（放开到一段）会同时改变判定力，须同支重算基线并附正向对照，留独立一支，未在本支夹带。

网络面的一条环境事实，本轮 git ls-remote 与 git fetch 出现 schannel 握手失败，同一时刻 curl 到 github.com 得 200，退避一次后 git 恢复正常；node fetch 到 api.github.com 首轮 fetch failed，加 8 秒退避重试后建 PR 成功。结论是这类失败属瞬时抖动，处置是退避重试而非判定为断网，更不是禁用证书校验的借口。另记，工装脚本 ghq.sh 在 C 盘用户目录下已不存在，本轮改为在仓库外临时目录写一次性脚本、由脚本自行读取令牌文件，命令行与日志均不含凭据。

## 十三 补测批次一的三枚红定性，一枚真源码缺陷与两类脱敏契约误钉

同一分片可叠多层红因这条判据本轮再次生效：先修的那枚断言挡住的是后面的腿，改完必须回同一 job 再看一次，否则会把"没跑到"当成"没问题"。

真源码缺陷一处，批次转移只扣两列。库存批次建档时 quantity_on_hand、quantity_available、quantity_meters、quantity_kg 四列写成同值，而 transfer_batch 只扣前两列，转移成功后主计量与辅计量两列停在旧值——出参"批次转移成功"、库里米数纹丝不动，守恒破了，读面米数列与在库数列从此分叉。修法是四列同笔扣减，目标行累加分支同步补两列（新建行分支本来就写了这两列，所以只在累加路径缺失），并给辅计量补充足性判定：既然现在开始真扣 quantity_kg，不补这道判定就是新增一条能扣成负数的口子，拒因沿用同一句库存数量不足，不另造第二个契约。用例侧 483-05 的断言本来就是契约，不动。

脱敏契约被当成业务契约误钉两类。第一类是把 not_found 与 bad_request 的出参文案钉成具体字面。backend/src/utils/error.rs 的 public_message 写死只有三个 Displayable 变体返回真文案，其余一律返回固定脱敏常量，NotFound 与 BadRequest 都在"其余"里；所以 484-04 期望"调拨明细 主键 未找到"收到的是资源未找到，483-05 后半腿期望的库存数量不足同样收不到。这类修法是用例侧，只断状态码、机器码与"确有非空拒因"，不断文案。

第二类相反，是源码把仓内既有的外显通道绕掉了。批量产品三枚写面的长度门文案本来就声明在 DTO 的 validate 属性上，而 error.rs 的 From validator::ValidationErrors 会转成 validation_displayable 并把字段级中文文案按出现顺序去重拼接外显；bulk_product_handler.rs 却在调用点写 map_err 重包成 bad_request，等于自己造第二条转换口径并把真文案咽进日志。这条是源码面缺陷，用例那条 toContain 是对的——按"源码错改源码"改三处调用点为直接问号透传，并给用例补钉机器码 VALIDATION_ERROR，把契约钉全。同文件还剩服务调用侧两处 map_err 重包（把下游真实 kind 与 code 拍平成 BAD_REQUEST），同一问题但不挡这枚红，已立条目独立处理，不在这支夹带。

推送落点：库存车道 f62769a0 推入 test/e2e-inventory-write-face-batch1（PR 1191），批量车道 f512cf53 推入 test/e2e-product-batch-write-face（PR 1192），两支 PR 的 head 均回读核到本次提交号。本地门只跑到能跑的四枚，prettier 两文件通过，e2e 类型门 error TS 计数为 2（即既有的 32-import-export 的 path 与 helpers 的 crypto 两枚伪影，无新增），逐文件 rustfmt 在两处都只剩一条与本次改动无关的 use 排序 hunk，未顺手重排。

## 十四 批六选题与落地 financial-analysis 五枚写面（2026-11-10）

选题经过。按 7.2 四条判据在主干顶点语料上重核，financial-analysis 域的五枚写面端点（报告建档、报告更新、报告删除、报告执行、指标建档）在册且语料里只有 GET 回读与页面访问：10b 与 25-finance-full 只打 reports 与 indicators 的 GET，29c 与 smoke 只访问页面，traversal 配置里该域标了 noCreate。写口零断言成立。同域另两枚 POST（trends 与 cash-flow-ratios）被证伪退选：前者前端只有 GET 封装无写入口，后者前端零调用。跨域候选 export-approvals 原正好五腿，核出四腿已被 39b、39d、447、82 的断言链钉住，只剩 reject 一腿，不足一批，退选。号段实量全部车道 460 以上已占到 488，批六取 490（489 留给暂缓的批色正向链）。

写用例过程中量出四处源码缺陷，全部同支修掉。一，编码唯一性：financial_indicators 的 indicator_code 列是 VARCHAR(50) NOT NULL UNIQUE（m0012_add_ap_ar_finance_analysis.rs 第 346 行），而报告编码用秒级时间戳拼 RPT 前缀、指标编码用秒级时间戳拼 IND 前缀，同秒建两笔必撞约束并裸抛数据库错；改走仓内取号器 number_generator.rs 的 generate_no（前缀加八位日期加流水，事务咨询锁串行化）。二，创建报告无校验：CreateReportRequest 只派生 Deserialize 且建档腿从不调用 validate，超长名称直落 VARCHAR(100) 列报数据库错；补 Validate 与列宽一致的长度门并在校验失败时走 validation_displayable 外显。三，分页双重减一：list_reports 先把页号减一再传给服务层，而 get_indicators_list 自己又减一算 offset，第二页退回第一页、第三页拿到第二页；改传一基页号，与同文件 get_indicators 口径一致。四，重复编码归口：服务层 create_indicator 直接 insert，撞唯一约束即裸抛；改为识别 SqlErr::UniqueConstraintViolation 归口 business_displayable，出参 400 加 BUSINESS_ERROR 加"指标编码 某码 已存在"，非唯一约束类错误原样上抛。

用例面。490 一枚 spec 九腿：同秒两笔编码各异且都落库、空名与三处超长被拒且拒后不落库、更新三态与描述段保留期间元数据、更新不存在主键 404、删后回读与二次删除 404、执行腿期间回显与两态透明且不伪造计算值、指标显式与缺省编码、重复编码业务拒绝且只留一行、列表第二页不与第一页重叠。前置全部自建，报告与指标共用一张表故清理都走报告删除腿。

本地门与推送。prettier 通过，e2e 类型门 error TS 计数 2（两枚既有伪影，期间抓出并修掉一处把详情出参误标成指标实体形状的 TS2339），playwright test --list 列出 18 条（九腿乘两个浏览器项目），配对门退出码 0 自述 baseline 1824 current 1824 judged 0。新车道缺 node_modules，用目录联接借既有车道依赖后四档才跑得起来，联接只读不改 donor。三笔提交 fe5bc218、390b4ac4、d76e082c 推入 test/e2e-financial-analysis-write-face，开 PR 1197，head 回读核到 d76e082c。

一条取证纪律再记。本轮扫开放八支红数皆零，但 1191、1192、1197 当时只有 17 到 19 格 check-runs，而全量面是 83 到 86 格，格数不足即全量矩阵尚未开跑，此时的零不是全绿证据，不得据此报可合并。

## 十五 批七选题 textile-submissions 整族零断言（2026-11-10）

取数口径先纠一处。配对门默认是增量模式，在干净的主干顶点车道上跑会得到 judged 0、debt 0、PAIRING_GREEN，这不是"没有漏配"，而是"本支相对基线无新增"。要取存量漏配必须显式加 --full-surface，此时门自报 reachableOrphans 155、deadOrphans 439、judged 1824、paired 1209、weak 21、debt 594、retired 12、corpusFiles 436、srcFiles 733。第六节与第十一节记的 590 是清档前的值，本轮主干顶点 565ff6b50 上重量为 594，差额来自此后合入的端点，底数必须以当轮主干顶点重量为准，不许沿用旧数。

选题经过。四个候选域按 objective 三 的面料模块优先序核既有语料：quality-standards 已有 97-quality-standard-and-8d-chain、quality/01-standard、smoke 与 24-production-full 四处引用，bulk-color-approvals 已有 81-bulk-color-approval-sales-order-item、113-color-card-maintenance-chain、446 与 454 等八处引用，chemical-requisitions 已有 62-chemical-batch-chain 与 70-chemical-contract-gaps 两处引用，这三域都属"部分腿已钉、剩几条次腿"，按 7.1 的判据不能当整族缺口立项。textile-submissions 在全 e2e 语料里只出现在 traversal/modules.config.ts 一处（遍历清单登记，无断言），八条腿全在棘轮债内，整族零断言成立，选它。

域归因纠一处。textile-submissions 不是委外染整送检，而是纺织品安全合规域的送检单面。路由文件 textile_safety.rs 头注释明写该域含送检单、第三方报告、主数据三张资源面，模型侧对应 textile_safety_submission、textile_safety_submission_item、textile_child_safety_check、textile_limit_rule、textile_test_item、textile_third_party_report、textile_export_market_requirement，业务上是生态纺织品安全指标限量判定与童装加考核查，对应 GB 18401 与 GB 31701 这条国标合规链，归质检域。按名字猜域会把它错挂到委外加工，进而错判与在途支的撞面。

八条腿与路由事实。submission_routes 挂 GET 列表、POST 建单、GET 详情、PUT 要素修改、DELETE 草稿删除、PUT status（状态机白名单推进，撤回也走本面）、POST items（项目清单推导，重生成幂等）、PUT child-checks（童装加考核查登记，upsert 语义走集合面）、PUT judgement（整单判定，judged 态唯一产出口）。配对门债内是其中八条（DELETE 未在债内）。路由面不承载业务校验，状态推进、判定与完整性门的判据都在 textile_safety_submission_service.rs。该域 seg3 即权限资源名，登记在 utils/path_utils.rs 直接资源白名单与 init_service 的 PERMISSION_RESOURCES，未注册段会被权限中间件 fail-closed 403 含 admin，所以用例不能靠拼未注册段来造拒绝腿。

号段与车道。全部工作树横扫 49x 只有 wt-fin-analysis-b6 占 490，主干顶点无 49x，批七取 491（489 仍留给暂缓的批色正向链）。车道 wt-qc-std-b7 基于主干顶点 565ff6b50，分支名沿用建车道时的 test/qc-standards-write-face-b7（选题改域后分支名与内容不再对应，推送前须改名或另建载体，不许把送检用例挂在质检标准名下误导评审）。node_modules 用目录联接借 wt-prod-batch-b2 的依赖，只读不改 donor。

名额与推送档位。开放 PR 现取八支（1184、1191 至 1197），八支都有在跑矩阵，按"上限是同时八个在跑"的口径名额已满，批七本地压住不推，待某支全绿释放名额再开车。

监控取数的一条教训。主干全量 run 42829801961 的阻塞式轮询器在 16:03 至 16:18 连续五轮 fetch failed 后按 TOOL_BUG 退出 9，而 run 本身一直在推进（重启后现取 85 枚 job、56 成功、1 跳过、28 在跑排队、0 失败）。五轮连败阈值约十五分钟，短于本机实测的网络抖动窗口，已放宽到十二轮。判"监控退出"必须先读它自己的日志区分连败退出与收口退出，不许把退出 9 读成 run 失败。

## 十六 批七落地实录与 1196 分片红定性（2026-11-10）

批七落地。491 一枚 spec 十二条腿（491-01 至 491-12），921 行、97 处 expect，覆盖建单逐字段回读、四类拒绝腿且拒后零落库、要素修改三态、状态机白名单与非法跃迁与撤回、清单推导集合与主数据 basis 分组一致且重生成幂等、童装核查逐行 upsert、整单判定完整性门三腿、pass 与 fail 两种结论都能产出、草稿删除与非草稿拒删、不存在 id 七腿 404、重复编码只落一行。棘轮基线摘除九条（含 DELETE 通配），全量面 paired 由 1209 升到 1218、debt 由 594 降到 585、corpusFiles 由 436 升到 437，三个数字守恒。六笔提交 eeaa3e1a3、6ec52ac64、cd91dcb61、9301ad312、4ba06d747、ee4895e2d，工作树净。

写用例过程中量出一处源码缺陷并同支修掉。textile_safety_submission_service.rs 的 create 只校验 submission_no 非空，不查重也不归口唯一约束错，直接 insert 后问号上抛，重复编码经库侧 uq_textile_safety_submission_no（m0110_create_textile_safety_tables.rs 第 111 行）落 DbErr，再被 error.rs 的 From DbErr 映射成 500 DATABASE_ERROR 掩码文案。同域 create_test_item 有前置查重落 400 业务拒绝，两处口径不一致。修法是插入侧归口而非前置查重，因为前置查重挡不住并发建单；识别 sea_orm::SqlErr::UniqueConstraintViolation 后转 business_displayable 并点名单号，其余数据库错原样上抛。符号真实性先在 Cargo.lock 钉住的 2.0.2 registry 源码核过（error.rs 第 252 行 sql_err、第 217 行变体），仓内另有六处同型用法。配套把 491-12 的弱断言（只钉状态大于等于 400 与机器码非真）升成钉死 400 加 BUSINESS_ERROR 加拒因包含冲突单号。

两处派工单事实被实例证伪并如实申报。一，棘轮基线真实路径是 frontend/scripts/e2e-feature-pairing-ratchet.json，派工单写的 frontend/e2e/ 下不存在该文件。二，upsert_child_checks 没有"删一行"语义，派工单要求的删腿按真实契约改成"未提交行保留"断言。这两条都属按真实契约写而不是按设想写，判据与 7.2 一致。

本地门结论。tsc 的 error TS 计数 2 且都是既有基线伪影，prettier 通过，playwright test --list 列出 24 条（十二腿乘两个浏览器项目），配对门增量与全量面都退出码 0，注释门退出码 0 结论 PASS 且 ::error 行数 0。rustfmt 逐文件 check 的唯一差行在第 34 行既有 use 排序（本地与 CI 钉版分歧），新增代码零差行，按纪律不顺手重排。名额面开放八支都有在跑矩阵，批七本地压住未推。

1196 分片红定性。PR 1196 head 458f9e75 的 flow e2e/flow(17/20) 判负，job 129920268517，日志 149376 字节、装配正常、reporter 报 1 failed，E2E-ASSERT 块原文是 Playwright 的 fixture 生命周期错误：context 与 page 按用例创建，不能在 beforeAll 里取用。失败附件点名 488-bulk-color-approval-gate-and-illegal-transitions 的 488-01。判责属本支测试面真红，488 spec 第 155 行把共享前置写成 beforeAll 解构 page，整条 describe 在钩子阶段抛错，所以只有一枚失败附件而其余用例未跑；同文件第 441 行 afterAll 已用正确范式（解构 browser 再 newContext 带 storageState 并 loginViaUI），两处写法不一致是直接来源。全车道横扫同型形态只此一处。修法照 afterAll 范式改 beforeAll，断言一条未放宽，提交 07cc9df5b 推入载体支并回读远端头核到同号，PR 正文已补全。

两条新判据。一，fixture 生命周期错误只在运行时暴露，playwright test --list 与 tsc 都抓不到，本地四档全绿不等于这类写法正确，最终判据仍是该分片实跑；这与"编译红使下游分片整片 skipped"是相反形态，本次装配正常且跑到了用例阶段，不能按装配型红处置。二，重试循环里 `if git push ... | tail -n 3; then break; fi` 的退出码取自 tail 恒为 0，首轮失败也会跳出并让人误读成已推；必须 set -o pipefail 或每轮用 ls-remote 回读远端头与本地 HEAD 比对，本次正是靠回读发现 HEAD_MISMATCH 才重推成功。

## 十七 主干全量面首次全绿与批七开车（2026-11-10）

主干验证结论。CI/CD Pipeline 的 run 42829801961 在 17:56 收口，job 面 87 枚、86 成功、1 跳过、0 失败、0 在跑，阻塞式轮询器的 DONE 哨兵与独立 API 复核两路一致。此前同一主干顶点上被读成"成功"的那条 run 只有 12 成功 17 跳过，属部分面；本次是 full_suite 全量面，含后端编译、Clippy、格式、注释门、契约门、Rust 测试分片、前端类型与单测、e2e flow 二十分片与 extras 各分组、安卓两条腿。判据上要点名三件事：一，job 总数在收口前从 85 涨到 87，矩阵是逐步物化的，中途任何一次计数都不是最终面；二，最后落下的一枚是收尾聚合门，它若未物化则 pending 不为零，不能提前判收口；三，extras 各分组在 runner 并发上限下逐枚排水，queued 成堆而 success 仍在涨属正常排水，不是停摆。

名额释放与批七开车。PR 1184（BOM 与 MRP 整族下线）的 head d8325ec6 全量面收口为 88 格、85 成功 3 跳过、零失败零在跑，据此释放一个在跑名额。批七车道分支由 test/qc-standards-write-face-b7 改名为 test/e2e-textile-safety-submission-write-face（内容属纺织品安全合规域，不属质检标准，沿用旧名会误导评审），推送后远端头回读核到 ee4895e2d，开 PR 1198，回读 changed_files 为 3 与本地改动面一致。与 1184 的文件交集按 API 首页一百枚核为空，但 1184 改动面超过一百枚需分页才能定论，合并次序上仍按"棘轮基线是共同热点"预防性对待。

一条名额哨兵的假阳性。等待循环初版把"pending 为 0"当名额释放，结果刚推头的 PR 1196 只物化 1 格、PR 1194 物化 0 格，两者 pending 都是 0 却根本没开跑，当场假命中。修正为 total 大于等于 70 且 pending 为 0 才算释放，与"格数不足即全量矩阵尚未开跑"的既有判据同源。这类假阳性与陈旧的日志哨兵（追加式日志里留着上一轮 TOOL_BUG 行，全文 grep 当场命中）是同一族错误，判据必须锚定当轮当 head，不能锚定历史文本。

## 十八 小程序域门禁落点核实与并基保工（2026-11-10）

先纠我自己上一轮的转述。我曾说"小程序四道门禁不在主干 ci-cd.yml，只存在于四条未合车道"，前半句对、后半句的取证口径错：按 ci-cd.yml 单文件 grep 得零，就断言门禁不存在，是扫描面自己变窄。实量四条车道的全部 workflows 后，门禁住在独立文件 .github/workflows/miniprogram-checks.yml，判据单点在 scripts/ci/miniprogram-checks.sh（699 行），另有 mp-check-pages.cjs 与 mp-endpoint-check.cjs 两枚辅助判定器。承载车道是 wt-mp-land（feat/wechat-miniprogram-domain），不是 ci-cd.yml 里缺一段。

七道门与 objective 二 四项要求的对照。门体覆盖 JS 语法逐文件 node --check（带 MIN_JS_FLOOR 扫空判据）、代码包体积（主包与单分包 2048KB、整包 20480KB，取微信官方上限，图片字体计入所在包）、app.json 与磁盘页面双向一一对账、调用点端点对 route-snapshot.txt 权威面、miniprogram_npm 厂商包对 package.json 声明、入库面凭据与主机暴露、跳转路由字面量可解析性（等值命中或按段边界前缀命中，带查询串只许等值）。对照 objective 二 的"打包、依赖、语法、包大小"：语法、包大小、依赖三项已有真判据；**打包一项是缺口**——体积门量的是源码原始字节，没有 wxml 与 wxss 编译、也没有构建 npm 产物的真实打包腿，node --check 只验 JS 语法不验小程序编译。这条缺口如实登记，不拿体积门冒充打包门。

判定器检测力已自证。--self-test 造七道已知违规夹具，caught=7/7、missed=0，退 0 自述 MP_DETECTOR_OK；七道实跑退 0 自述 MP_CHECK_GREEN，路由面 scanned=534、declared=191、urlLiterals=281、exactOk=268、prefixOk=2、dead=11，其中 10 条在死链棘轮基线内只报告、new=0。

推送档位裁定。记忆里的用户裁定明确：仓库是 public，小程序树虽获全量授权但**用户裁定先不推、本地照做**，feat/miniprogram-adapt 与 feat/wechat-mp-notification-leg 报孤本属预期，CI 门禁已推迟。据此本轮**不推送该车道、不开 PR**，只做并基保工。我原先"待名额释放就开车"的计划据此撤回；objective 二 的小程序门禁在主干缺席属用户主动推迟，不是漏做，不得当缺陷去推平。

并基实录。该车道原落后主干 7 笔、领先 4 笔，用 git merge origin/main 而非 rebase（首亲为本支头，普通 push 即快进，不触 force 授权档）。冲突恰落在记忆点名的两枚只追加热点 backend/migration/src/domain/mod.rs 与 backend/migration/src/lib.rs，三处冲突按既定解法处理：双方注册都留，主干四条（quotation_discount_gate、quotation_discount_config_grant、logistics_waybill_order_fk_drop、m0126_add_audit_terminal_context_columns）在前，本支 wechat_mp_binding 续编为链文档第 42 条并排在 vec 末尾。同时纠掉本支原文一处已过时的声称（"迁移号 m0135 高于既有全部单档号"，主干已有 m0136），改为"与主干既有单档号互不相同故不撞台账，执行序以 vec 为准"。合并提交 d5ed7146d，落后 0、领先 5，工作树净，七道门复跑仍全绿。rustfmt 逐文件 check 退 1 但差行数为 0，非零码来自既有文件的 CRLF 告警行，按既有判据不算格式红。

## 十九 批八选题与一处配对门待查候选（2026-11-10）

选题方法。在批七车道（已含 491，corpusFiles 437、debt 585）上跑全量面，把债内端点按一级路径段归组得 122 段，再对每段在 e2e 语料里 grep 真实引用并剔除 traversal 配置，按"非遍历引用数升序、债数降序"排。整族零断言的强信号段：textile-export-requirements（债 4、语料 0）、locked-accounts（债 2、语料 0）、aging-grades 与 asset-categories 与 industry-benchmarks（各债 5、语料仅 traversal 一处）。

一处信号污染要点名。textile-reports、textile-limit-rules、textile-test-items 三段的"非遍历引用 1"正是刚落的 491——它把这三面当前置自建（第 178 至 221 行建检测项目与限量规则，第 605 至 638 行建报告并录结果、过完整性门、判定）。所以这三段不是"未被触及"，而是"已被行使但缺断言级覆盖"。按 7.1 判据不能当整族缺口立项，批八对它们要补的是回读、拒绝、门前后状态不变这类断言，不是从零造调用。

批八定案。取纺织品安全合规域剩余四面共 19 腿，分两枚 spec：492 第三方报告面七腿（列表、详情、建档、要素修改、完整性门 accept、逐项目结果 upsert、报告级判定），493 主数据三面十二腿（检测项目、限量规则、出口市场要求各自的列表、建档、修改、删除）。选它的理由是域内合支：批七已开送检单面，同域续完才形成"送检单→报告→判定→主数据"的完整合规链，且出口市场要求面语料真零。号段 492 与 493 待派工前再横扫一次确认空闲。

一处配对门待查候选。491 第 605、620、633、638 行确实调用了 POST /textile-reports、POST /textile-reports/{id}/results、PUT /{id}/acceptance、PUT /{id}/judgement，但全量面仍把这四腿列为 PAIRING_DEBT；同文件不带泛型实参的送检单腿则被正确配对并摘出基线。差异形态是这四腿都写成 apiCallRaw 带泛型实参（如 apiCallRaw<{ id: number }>）。方向是"多报债"而不是假绿，故不紧急、不据此改门；登记为待查，核门体的调用点提取是否被泛型实参或 helper 函数体位置挡住。按既有纪律，改判定器前必须先造反向夹具证明它当前确实漏检，且改后通过集合只许扩大不许缩小。

## 二十 批八落地与配对门候选证伪（2026-11-11）

1196 分片红定性。flow(17/20) 的 488-05b 断"pending 态报废应 400"实际 200。判责取证：本支对 backend 零 diff，主干 bulk_color_approval_service.rs 的 scrap 门明文允许 approved 与 pending 与 sampled 三来源（状态机第九号跃迁"直接报废"），是用例前提造错，测试错改测试。修法：非法跃迁清单收窄为五条，另起 488-05d 正向腿钉 pending 直接报废落 scrapped 终态且 delivery_blocking 仍 true。本地五门加注释门全绿后推 2e7b478ae，1196 重跑。

批八落地。492 第三方报告面十二腿与 493 主数据三面十二腿同车道（test/e2e-textile-report-write-face），PR 1199（head f3b184c5e）。492 覆盖登记前提门、受理态不可直填与 sent 自动 reported、完整性门十缺项逐条点名（顺序与门体一致）、判定 pass 与重录复位改判 fail、修正复位与撤回封账、三型录入互斥矩阵（等级 3-4 编码 3.5）、有效期三档、批次口径、资质至少一枚、检验依据格式、五端点 404、同单多报告隔离。493 覆盖项目词表门与编码封账与引用守卫、限值四维唯一与比较器形态门十连拒与修订撞维、出口要求市场过滤（dom 拒收）与校验矩阵、三面悬空 id 404。前置全自建，493 项目一律 CUSTOMER 基组不污染他单清单推导。配对门全量守恒：paired 1209 升 1228、debt 594 降 575、unpaired 恒 0、corpusFiles 436 升 438，棘轮摘 19 枚。

十九节候选证伪。真因不是泛型实参：matchNeedles 对一级路径段端点只发快照整串针（去前缀串短于两段不发），491 头注只写了送检单面的整串路径，报告面四腿在语料里没有任何整串出现点，故判债。492 初版同样踩中（头注只写相对路径），补整串调用面注释后七腿全配对。结论：判定器无盲区，是"头注按快照整串登记调用面"的既有约定（491 已示范）；不改门体，候选关闭。

收口面。1184 与 1191 与 1192 与 1193 与 1194 与 1195 与 1197 与 1198 八支 check-runs 全完成零红，待用户 UI 合并；1196 带修复重跑中；1199 新开。批八写作实例宿主侧中断零交付，按第二次零交付纪律改主编排自写，两枚 spec 均一次过门。




