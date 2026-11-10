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
