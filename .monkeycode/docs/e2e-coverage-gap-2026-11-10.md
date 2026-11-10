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



