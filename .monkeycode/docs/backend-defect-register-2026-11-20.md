# 后端缺陷台账 2026-11-20 分册

## D-67 Web Cookie-only 登出未吊销 JTI，旧 token 在有效期内仍可重放（P1，会话安全，假闭环重开）

级别 P1 会话安全，可升级 P0。后端设计意图与实际行为不符，且现有 E2E 断言为假闭环，按 8.5 重新打开并标记回归失效。

标题场景与业务模块。登录态与账号安全（objective 4.20「退出后 Token 失效」、4.11「会话安全」），模块为认证鉴权，终端为 Web 后台（httpOnly Cookie 会话），影响链路为登录→登出→鉴权中间件。

操作角色与复现环境。任意已登录角色（admin 即可）；浏览器任意（与浏览器无关，根因在后端与前端请求头约定）；环境为 Web 后台，凭据由 httpOnly Cookie 承载。

完整复现步骤。一，以 admin 登录，从 Set-Cookie 或浏览器上下文取出 access_token 原值。二，发起 POST /api/v1/erp/auth/logout，只带 Cookie 与 X-CSRF-Token，不带 Authorization 头（这是前端 request.ts 的真实发法）。三，登出返回 200、data.success=true，且浏览器侧 access_token Cookie 被清。四，另起独立 bare request context，携带 Cookie: access_token=<登出前的原值> 请求 GET /api/v1/erp/auth/me。

预期结果。第四步应返回 401，因为登出必须使该会话 token 在服务端立即失效（objective 4.20「退出后，本地缓存，token，页面数据全部清除」）。

实际结果。第四步返回 200。根因三条链路证据：一，后端 logout handler（backend/src/handlers/auth_handler_session.rs:184）把 headers 交给 process_logout_token；二，process_logout_token（同文件 :66-84）仅当请求带 Authorization: Bearer 才解析 token 并调 blacklist_and_revoke_token，无 Bearer 直接返回 (None, None)；三，前端 request.ts:143-145 明确「不再手动注入 Authorization 头，凭据由 httpOnly Cookie 自动发送」。于是 Web 登出只走 clear_auth_cookies（同文件 :193）清浏览器 Cookie，从不调用 revoke_jti（同文件 :103）。鉴权中间件虽在 auth.rs:224-235 有 is_jti_revoked 检查，但因 JTI 从未写入吊销表而放行。

判责。属源码实现缺陷，不是测试钉错，也不是功能缺失。后端注释 auth_handler_session.rs:88-89 自述设计意图：「P1 7-3 修复：原 logout 仅写进程内 state.cache 黑名单，多实例部署时 登出后 token 在其他实例仍可用（最长 2 小时）。修复方案：与 refresh_token 流程对齐，调用 revoke_jti 写入 Redis，使所有实例通过 is_jti_revoked 检测到吊销状态」。对照 refresh 流程已在 flow/19-token-connection.spec.ts:165-175 用 bare context 重放旧 token 验到 401（refresh 端点从 Cookie 取 token 后会 revoke），说明登出端点是唯一漏掉 Cookie 路径 revoke 的环节，属该 P1 7-3 修复的不完整落地。

假闭环证据与重开标记。flow/19-token-connection.spec.ts:192-234 的用例「登出后 Cookie 被清除且会话失效」在 :230 断言 meAfter.status()=401，但其请求复用同一个 context（:198 的 page.request），登出后该 context 的 access_token Cookie 已被 clear_auth_cookies 清除，请求因缺少 token 在 auth.rs:196「缺少认证凭据」分支被拒，从未触达 auth.rs:224-235 的 is_jti_revoked 分支。因此该断言只能证明「浏览器侧 Cookie 被清」，不能证明「服务端 token 已失效」，正是 8.5 所指「换个入口就复现」的假闭环。按 8.5 处置：工单重新打开并标记回归失效，根因是验收标准只覆盖同 context 清 Cookie、未要求 bare context 重放旧 token，属用例不全 + 验收标准宽松。

修法方向（开发侧，勿改测试掩盖）。让 logout handler 在缺少 Authorization 头时，从 PrivateCookieJar 中取 access_token（与 auth.rs:134-136 的取法同源），验证签名后调用 blacklist_and_revoke_token 写 Redis JTI 吊销；保持现有 Bearer 分支不变以兼容非浏览器客户端。需保证 clear_auth_cookies 之前完成 revoke，避免顺序颠倒。

待补 E2E（修复后随功能同批入库，当前不先写会红的断言）。在 flow/19 该用例内，登出后新增独立 bare context 重放旧 access_token 请求 /auth/me 断言 401，范式照搬同文件 :165-175 的 refresh 重放段，并补机器码与 420 系列一致的 UNAUTHORIZED 校验。修复未落地前不提交该断言，以免制造 CI 假红。

关联标签。会话安全；退出失效；JTI 吊销；Cookie-only；假闭环重开；E2E 发现。关联 E2E 用例 ID：flow/19-token-connection.spec.ts::登出后 Cookie 被清除且会话失效（当前假闭环，待补强）。

## QA 交接（2026-11-20 03:37）本轮补测成果的收纳状态

背景。开放 PR 由 31 收敛到 12，`#1351`（test/e2e-all-reorg-1119，标题「全部 E2E 补测汇总为一支」）正在统一收纳散落补测，03:28 仍在更新。本工作分支 test/e2e-search-scope-414 当前查无开放 PR，存在补测成果悬空风险。

逐项状态（2026-11-20 03:37 经 contents API 只读核实）。一，已被 #1351 收纳：sql-injection-negative.spec.ts 与 data-scope-isolation.spec.ts，其中仅后者在 main 在册。二，未被 #1351 收纳、位于无 PR 工作分支：439-charset-emoji-rare-chars.spec.ts 与本台账 D-67。三，位于已关闭未合并 PR #1300（head 8d5ecabca6）：414b-sales-order-filter-combo.spec.ts；416/420/422 三枚已由 #1351 收纳，414b 未见。

待办（交收口流）。将 439 与 414b 两枚 spec、本台账 D-67 一并纳入 #1351 或等价开放载体，使客观"不漏单、纳入回归"要求落地。本会话不越界改 #1351 活跃车道的源码与用例文件，仅登记交接。

CI 状态。平台级 fetch failed 与 git schannel 握手失败导致全 PR 无法验证与合并，非源码红，按纪律不反复轮询。
