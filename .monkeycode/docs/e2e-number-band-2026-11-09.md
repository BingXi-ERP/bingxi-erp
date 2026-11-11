# e2e 号段划拨分册 2026-11-09

本文件只记当日新划的号，不是车道规则总台账；总台账仍由工装侧 LANE_RULES 文档承担（本次在 repo1 工作树与 origin/main 均未取到该档，故不在此续写节号）。


## 本轮 e2e 号段划拨（2026-11-09 15:12 UTC 实量后）

实量参照面：wt-bom-1106 车道 frontend/e2e 现有编号到 472（470 471 472 为投纱与完工扣料档），473 及以上为空。

1. 473 到 479 划给微信小程序域并行实例（车道 wt-mp-land），其只许在该区间内取紧邻空号。
2. 480 划给投纱驱动的缺料需求链路用例（车道 wt-bom-1106，PR #1184），只新增单档，不改既有 spec 与 helpers。
3. 481 及以后未授权，需要时必须先回编排方改派，禁止并行实例自行越界取号。

追加划拨：481 归通知中心入口权限键与读面同源修复（车道 wt-notif-perm，分支 fix/notification-entry-permission-same-source），482 及以后仍未授权。

同轮补一条 D-61 的前提核验：主干 backend/src/services/init_service_ops/permission.rs 第 57 行的 SHELL_PERMISSIONS 实际值已含 ("notifications","read")，注释明写这是每个角色都必须具备的应用外壳权限码，因此"授权矩阵可能根本没有 notifications:read"这一未验前提已被证伪，缺陷形态确定为"读面权限全局到位而路由入口键写成 users:read"，修法只剩入口键同源与页内控件按 users:read 收口两层。
