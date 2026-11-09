# 系统公告发送门禁口径裁定 2026-11-09

调度与决策口径，只读取证，不改代码，不提交，不推送。

## 0 说明与取证基线

- 路径分隔符按要求写作点号，例如 backend.src.handlers.notification_handler.rs。
- 行号写法为“第 N 行”，避免使用冒号。
- 参照面取 origin/main 的树（git ls-tree -r origin/main），本地 main 落后，不按本地分支指针下结论。
- 本轮所有断言逐条实测，未实测的一律标“未验”。

## 1 问题一句话

后端 create_announcement 用 is_admin_role（角色码等于 admin）做门禁，前端公告卡片用权限键 notifications:create 做可见性，两侧不同源。admin_assistant 岗位持有 notifications:create，能看到并填写公告表单，点发送必被后端拒。方向上后端拒绝没有放过越权，缺陷在系统把一个按声明该可用的能力实际做成不可用，属假可供性。

## 2 在册核验（每条都在 origin/main 的树里实测）

1. 后端门。backend.src.handlers.notification_handler.rs 第 9 行 use crate.utils.admin_checker.is_admin_role，第 231 行 pub async fn create_announcement，第 240 至 242 行 is_admin_role 不成立即返回 permission_denied，文案“系统公告仅限管理员发送”。该函数体内没有第二道权限键判定。
2. 角色码常量。backend.src.utils.admin_checker.rs 第 10 行 ADMIN_ROLE_CODE 的字面量是 admin，第 27 行的允许名单常量只含 ADMIN_ROLE_CODE 与 OPS_ROLE_CODE，公告面不走该常量。
3. 路由与键派生。backend.src.routes.analytics.rs 第 418 行注释写明 POST announcement 是管理员系统公告，第 423 至 424 行把 /announcement 挂到 notification_handler.create_announcement。按 backend.src.middleware.permission.rs 第 259 行的取段规则，本端点资源段是 notifications，动作由末段或方法派生。
4. 中间件对 admin 直接放行。backend.src.middleware.permission.rs 第 587 行与第 634 行先判 is_admin_role，成立即通过，所以 admin 岗位过键检与过第 3 条的角色码门是两条独立路径。
5. 授予面。backend.src.services.init_service_ops.permission.rs 第 55 行 SHELL_PERMISSIONS 只含 ("notifications","read")，即 notifications:create 不在每岗必授的壳权限里。全文件 notifications 字面量共三处，第 1546 行是一处只读授予，第 1567 行的块是 admin_assistant，其第 1574 与 1575 行分别是 ("notifications","read") 与 ("notifications","create")。也就是说除 admin 的通配路径外，唯一显式持有 notifications:create 的岗位是 admin_assistant。
6. 前端门。frontend.src.constants.permissions.ts 第 428 行 NOTIFICATION_CREATE 的值是 notifications:create。frontend.src.views.notification.index.vue 第 230 行公告卡片写作 v-permission="'notifications:create'"，第 512 与 514 行注释同样把该卡片的可见性绑在这个键上，并说明无条件取用户列表会给无权限角色白打一次请求。

结论：前端“看得见且填得完”的条件是键，后端“发得出去”的条件是角色码，两个条件在 admin_assistant 这个岗位上必然背离。

## 3 未验项（不下结论）

1. 末段 announcement 是否命中 PATH_ACTION_SEGMENT_MAP 或 PATH_ACTION_KEYWORDS，本轮只读到第 225 至 300 行的函数形状，没读到两张表的完整字面量，因此“该端点的运行期键恰为 notifications:create”标未验。修法不依赖这个结论（见第 4 节判据 3）。
2. admin_assistant 在 e2e 侧是否有在册账号与在岗用例、SEED_ROLE_EXTRA_PERMISSIONS 镜像表是否为其补建过该键，本轮未取，标未验。
3. 是否已有用例断言 admin_assistant 发公告必 403，本轮未取，标未验。若存在，第 4 节任一改法都要同步改该用例，属“源码错改源码，测试错改测试”的判责范围。

## 4 裁定

判据按仓内既有纪律排，不按个人偏好。

1. 同一业务动作只允许一个判定口径，且比较点与门控值必须与写入值逐字符相同。agents.md 明确权限键由 URL 段推导、键是唯一事实源，前端 v-permission 与路由 meta.permission 都读这个键。后端在键检之外再加一条角色码硬门，就是把唯一事实源换成了第二套口径，这正是本缺陷的成因。
2. 修法不许只藏前端。只把公告卡片改成 admin 可见，等于用前端隐藏掩盖后端第二口径，后端仍然对新授予该键的岗位一律拒绝，背离会在下一次授予时重演。
3. 修法也不许只放宽后端而不声明持有人集合。若只删后端角色码门，公告能力就等于交给“矩阵里显式持有 notifications:create 的岗位”，这个集合本来就是系统的声明意图，删除第二口径是让实现回到声明，不是扩权；但必须同时把持有人集合写进验收，防止后续无声扩面。

裁定采用第 3 判据的形态，落成一句：以权限键为唯一门控口径，删去 create_announcement 里的 is_admin_role 分支。落地时 role_id 的取值与“未分配角色即拒”那条一并删，因为该函数体内 role_id 除这条判定外没有第二个消费点，留着会造出一条永不命中的分支并触发未使用变量；无角色用户本来就过不了鉴权中间件的键检，删它不减少任何拦截。同文件的 admin_checker 引用随之删除（实测本文件仅第 9 行 use 与第 240 行两处用到该符号）。

同时登记一条配套约束，供后续产品意图裁定时一并处理，本轮不擅自动矩阵。若业务方认定全员广播只许老板与管理员发，则正确做法是从 admin_assistant 的授予行删掉 ("notifications","create") 并同步镜像表与岗位基线双向全等门，而不是在后端再加一条角色码门。

## 5 落地清单（随通知域一支，号段 482）

1. 源码面。notification_handler.rs 删 is_admin_role 分支与随之无用的 use 引用，改后该函数体的拒绝只剩“未分配角色”一条加中间件的键检。
2. 前端面。notification/index.vue 的卡片键与第 514 行的用户列表取数条件保持同一键，不改判定形态，只把注释里“仅管理员”的措辞改成按权限键，避免注释与实现相反。
3. 测试面。482 一支 spec 断三档。admin 发公告成功且收件人解析出的通知逐条落库。admin_assistant 发公告同样成功（这是本裁定的行为变更点，必须实测，不能只删门不验）。无 notifications:create 的岗位卡片不可达且直接 POST 得 4xx 且小于 500，覆盖 4.1 第 A 节“不能只靠前端隐藏按钮”与第 P 节“地址栏直接输入敏感接口 URL”。
4. 联动门。岗位基线双向全等门与路由权限快照门本轮不改授予矩阵，预期输出不变；若第 3 档用例的岗位键与矩阵不一致，按门报的红先判责再动文件。
5. 号段。482 划拨给本条，473 至 479 已划拨小程序域，480 挂在投纱驱动缺料前提上（结论十二已证不在主干），481 已划拨通知入口权限修复，本条不与其合并，避免一支内两枚入口改动互相掩盖。
