# 小程序静态门首轮实跑结论 2026-11-09

载体：工作树 E:\work\bingxi\wt-mp-land，分支 feat/wechat-miniprogram-domain，顶端 32091a75c（本地三笔，未推）。参照面 origin/main（本地 main 落后 24，本轮已 fetch 成功一次后网络又断，取数按已落盘的 origin/main）。

## 一 门禁本体自证通过

跑 CI 第一步的原命令 `bash scripts/ci/miniprogram-checks.sh --self-test`，出参末三行 `SELFTEST caught=7/7 missed:0`、`MP_DETECTOR_OK 七道反向探针全部被抓到`、`MP_SELFTEST_OK`，rc 0。七道门各自有反向探针且全被抓到，判定器有检测力这一条成立，其后的绿才算数。

一处我自己的取数错记在此备查：`scripts/ci/mp-check-pages.cjs` 只收位置参数（argv 2 是小程序根目录），我按 `--self-test` 直接调它，得到 `TOOL_BUG 取不到 app.json：--self-test` 与 rc 9。这是我把标志位喂给了只认目录的脚本，不是脚本缺陷。真镜像只跑工作流里的那两条命令。

## 二 真跑判红抓到的是取档残缺，不是判定器误报

第二步 `bash scripts/ci/miniprogram-checks.sh` rc 1，判红项集中在路由对账一道：`MP_ROUTE_RED 有 11 处跳转路由落不到 app.json 声明页`，`STEP_END routes rc=1`。

11 处调用点归并到 4 个落点。逐条实测这 4 个落点在取档树里的存在性（既查页面文件，也查 app.json 声明）：

1. `/packageA/pages/demand/demand-detail/offer-info/offer-onfo`，盘上 0 文件，声明 0 条。目标名本身像把 `offer-info` 打成了 `offer-onfo`，但把 `offer-info` 一并查也是盘上 0 文件、声明 0 条，所以不是单纯笔误，是这一页整体不在树里。4 处调用点指向它。
2. `/packageA/pages/demand/demand-detail/post-demand/post-demand`，盘上 0 文件，声明 0 条，3 处调用点。
3. `/packageA/pages/demand/my-demand/my-post-result-choose/my-post-result-choose`，盘上 0 文件，声明 0 条，2 处调用点。
4. `/packageA/pages/demand/demand-order/demand-order-detail/index`，盘上 0 文件，3 处调用点；这条 `grep` 同名声明数报 70 是假阳性（我按 `index` 这个 basename 去数 app.json，命中了全部 `"index"` 结尾项），按整路径查 app.json 的 demand 族声明清单里没有它。

app.json 的 demand 族实际声明 13 页：demand-square、demand-banner、demand-detail、demand-order/index、add-address、address-manage、my-demand、my-post-result-detail、my-post-result、my-post-schedule、search-demand、search-join、search-post。上面 4 个落点都不在其中，且页面文件也不在树上。

结论：取档回来的小程序源码不完整，11 处跳转的落点页既没有实现也没有声明。这些是发布需求、报价信息、选择报价、需求订单详情四条链路的入口，用户点到就是跳转失败。这不是假警报，正是这道门要拦的东西。

## 三 处置与不做什么

1. 不补造这 4 页。业务逻辑未知，凭空写页面等于编造功能，属仓内禁止的假可供性。缺页面登记为缺陷 D-66（P1，功能缺失，取档残缺），待与真实小程序源核对后补。
2. 该门对存量 11 处应改为只报告加棘轮基线（只新增判红），依据是本仓既有的新门接入三件套纪律：一条门的硬拦不该把主干存量债算到每条在途支头上。基线文件与改动落在 `scripts/ci/miniprogram-checks.sh` 的 routes 段（该段在第 505 行起内联一段 node，明细行 ROUTE_DEAD 由第 612 行产出）。这一步尚未做。
3. 更正我早前写进 miniprogram-landing-plan 的一条口径：新门禁落在独立工作流 `.github/workflows/miniprogram-checks.yml`（单 job miniprogram-checks，触发面 pull_request 与 push 与 workflow_dispatch），因此**不需要**加进 `ci-cleanup-retry` 的 needs。那条 needs 硬规则只对 `ci-cd.yml` 内的 job 生效。
4. 后端面新增 `backend/src/services/wechat_mp_service.rs` 与绑定表迁移 m0135，实测该服务档里没有 `.route(`、`.nest(`、`pub fn router` 任何一处，即本支不新增对外端点。因此配对门 `check-e2e-feature-pairing.mjs` 不会因本支判红，缺的是 Rust 集成测试承载（绑定唯一性与出件收件人反查），不是 Playwright 用例。
5. 本地无法验证的两面如实登记：`cargo fmt --all --check` 在该车道报 `os error 206 文件名或扩展名太长`，是 Windows 路径长度限制，不是代码格式错，格式面与全部编译面只能等 CI；车道无 frontend/node_modules，vue-tsc 与 eslint 未在此车道跑。

## 四 推送前置

第 2 条的棘轮基线未落地前，本支推上去就是自己挂红自己的新门。推送与开 PR 等用户授权，且授权后应先把基线那一笔一并带上。
