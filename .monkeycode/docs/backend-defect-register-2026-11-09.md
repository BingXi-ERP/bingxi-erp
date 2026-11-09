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
