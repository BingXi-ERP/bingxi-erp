# 主线红取证 2026-11-10 flow16 盘点提交腿

取证一律只读，不推送、不合并、不改分支。参照面按远端引用与制品实名取，不按本地分支指针。

## 一 现红面（board_all_open 实测，同一时刻）

开放四支的 CI/CD run 都在 flow(16/20) 这一枚 e2e 分片上判负，另外 #1188 还多一枚 flow(17/20)。
每支同时挂 🚨 E2E 真实性门禁与 🧹 收尾清理两枚红，这两枚是 needs 汇总型聚合器，不代表本支缺陷，数红面时先摘掉。

- #1183 63340bb96 红面 flow16 与 flow20
- #1184 c76157c93 红面 flow16
- #1186 fddf150fb 红面 flow16
- #1188 293876d90 红面 flow16 与 flow17

四支的 flow16 同刻同枚红，按仓内既有归类法先按主干侧共享红对待，但共享红的前提是同文，
同文要逐支取断言原文才成立，本轮只取到 #1188 一枚（api.github.com 的 TLS 握手在取第二支时被断开两次），
所以其余三支只登记为同枚待证同文，不据枚号相同就说同因。

## 二 #1188 flow16 的失败位与原文

- 断言块点名：test-results 目录名含 458-inventory-count 的角色面用例，对应
  frontend/e2e/flow/458-inventory-count-diff-and-transfer-persistence.spec.ts 第 1297 行声明的 458-06。
- 块内唯一错误原文：Error: API POST /inventory/counts/6/submit failed code=FORBIDDEN message=无权限。
- 日志内 spec 定位只命中这一枚，SUMMARY 计 1 failed，与 458-06 的声明行一致，红位不漂。

## 三 458-06 的提交腿到底谁拒的（逐层核到源码）

用例形状（同文件 1297 到 1470 实测）：仓管建盘点单并录入实盘 77，随后仓管直连提交应被拒（断言拒因是键 counts:submit 未授），
再切到 inventory_manager 会话，第 1442 行用 apiCallRaw 提交同一枚单，断言必须推进到 in_review，
第 1447 行由同一会话过账到 completed。

后端这条例外的来源实测到两处拒绝点，都在同一条腿前面：

1. 鉴权中间件按 URL 段派生键，路径 inventory/counts/6/submit 的末段 submit 命中
   middleware/permission.rs 第 232 到 247 行的 PATH_ACTION_KEYWORDS，动作即 submit，资源由第 318 到 355 行的
   取段规则定为 counts，键是 counts:submit。admin 走第 587 与 634 行的角色码直通，其余岗位须命中授予行。
2. 即便键过，handler 里还有一层归属校验。handlers/inventory_count_handler.rs 第 404 到 421 行写明
   submit_for_approval 先取 to_data_scope_context 再调 service.get_count 带 scope 参数，
   注释点名服务侧 submit_for_approval 自身无归属校验，越权由 get_count 返回 403。

两条拒因的对外文案都是 无权限，单看日志分不出是哪条拒的，故本轮不下"就是 RBAC 缺码"或"就是归属范围"的结论。

## 四 已排除的两条假因

- 会话残留不是本条红因。helpers.ts 的 loginAsRole 在第 2068 到 2078 行显式传 force=true，
  注释写明就是为了避开模块级登录态短路，第 1441 行的库存经理会话必是新鲜登录。
  我先前把这条红归给会话残留，属未验前提，现按上述行号作废该归因。
  会话残留本身仍是真缺陷，其修复已在另一车道本地提交（身份不匹配即清 cookie 重登），但那是另一条判据，不是本条的解。
- 不是状态前置。services/inventory_count_service.rs 第 467 到 477 行的前置判的是 status 不等于 pending，
  拒因文案与本轮日志文案不同形，且同一枚单在第 1340 行刚被断言仍为 pending。

## 五 夹具面的两处真实分歧（不猜，登记待裁）

- frontend/e2e/global-setup.ts 第 634 到 637 行自述本库 init 只种 3 个角色，业务角色含 inventory_manager 须由 ensureRoleUsers 补建；
  同仓 frontend/e2e/flow/55-role-page-access.spec.ts 第 28 行却说 CI 库业务角色由后端 init 全矩阵播种再叠加镜像表。
  两份自述互斥，且该分歧直接决定补建岗持不持有 counts 族键，本轮没有取到 globalSetup 所在步骤的日志，判不了。
- 镜像清单里 counts 出现次数为 0（全文件 grep 零命中）。补建的 inventory_manager 只有 adjustments 三枚加 pieces 两枚。
  若 CI 库该岗确由补建而来，第 1442 行必被键检拒；若由 init 全矩阵而来，该岗持 ("counts","*")，
  拒因就只剩归属范围一条（补建角色 data_scope 默认 self，见 global-setup 同文件第 758 行上方注释）。

## 六 待裁项（编号，附推荐默认）

1. 若判定为夹具缺码，正解是把 counts 族键补进 SEED_ROLE_EXTRA_PERMISSIONS 的 inventory_manager，
   并按矩阵原文写通配还是逐动作枚举要一次裁定。写 counts:* 与后端矩阵逐字符同形，但 role_permission_service.rs
   第 542 到 571 行的 create 与 approve 共存校验会拒通配，补建通道走的是 API 授权，会被这条规则挡下。
   推荐默认：不写通配，拆成两岗，提交腿给 inventory_manager 授 counts:read 与 counts:create 与 counts:submit，
   过账腿改由另一岗或 admin 做，并在 458-06 里把这条 SoD 事实写成正向断言，而不是让一个岗自批自过。
2. 若判定为归属范围，正解是让 manager 提交自己名下建的单。推荐默认：与第 1 条同一改法天然满足，
   自建单即自带归属，不用动 data_scope，也不动 02-adjustment 那条 IDOR 判据。
3. 若判定为源码面（即产品口径本就该允许同岗提交并过账），则第 542 行的 create 与 approve 共存校验
   与矩阵里 ("counts","*") 的播种互斥，属矩阵自相矛盾，须单独立缺陷裁矩阵或裁校验，不在本支顺手改。
   推荐默认：先按第 1 与第 2 条走测试面与夹具面，源码面这条另立缺陷登记，等 #1188 合入释放名额后按域排。

判这条的前置事实只有一件，即 CI 库里 inventory_manager 究竟由 init 全矩阵播种还是由镜像补建。
取它只要一次 globalSetup 步骤日志或一次只读库查询，二者都不在本轮可及面内，已列为下一轮第一手取证。

## 六之一 本轮已按推荐默认自裁并落地（不等用户拍板）

用户未答裁定项，按目标里"项目决策参考通用标准输出最优方案，不全依赖用户决策"取第 1 与第 2 条的并集落地，
车道 wt-e2e-sign 本地提交 ac0a02090，未推：

1. 458-06 的提交腿改打自建靶子——库存经理会话内 seed 一枚自己的库存行、建自己的盘点单、录自己的实盘 88 再提交，
   单自带归属，键检放行这才被真正测到，不再让断言打在归属层上。
2. 过账拆岗——同会话自批改成正向断言必须被拒（counts:approve 未授，岗责分离），过账腿由 admin 做；
   账面终局读数按 88 逐值核，并复核仓管被拒那枚单的账面仍是 70，被拒零副作用这条判据不降反强。
3. 夹具面同步给 inventory_manager 补 counts:read、counts:create、counts:submit 三键，刻意不补 approve，
   与第 542 到 571 行的 create 与 approve 共存校验互不冲突。
4. 脱敏面读数一并改到经理自建的行上，原先在经理会话读仓管名下行去断"列被隐藏"，
   读不到行的时候该断言会假绿，换成自有行后判据只剩列隐藏一件事。

本地已过 prettier、eslint（0 error，67 条既有 console 警告）、playwright --list 与按目标文件名过滤的 e2e 类型检查。
CI 才能证伪本改法，需推送授权。第 3 条源码面（矩阵通配与共存校验互斥）仍按待裁保留，未动源码。

## 七 同日顺带记一枚凭据面事实（不复述值）

flow16 同一 job 日志的 env 分组把 e2e 装配期的若干键值原样打出，含测试账号口令与三枚签名类密钥的 e2e 专用常量。
这些是仓内既有的 e2e 专用字面量，不是生产凭据，但把装配期 env 整组打进日志这一步本身就是
任务 56 收口的对象，本轮只登记"命中仍在"，不改法、不贴值。
