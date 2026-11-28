# Miniapp Phase 1 Acceptance

- 验收日期：2026-11-28
- 工作树：`E:/work/bingxi/wt-miniapp-rebuild`
- 基线 HEAD：`5e8b00c5a2d9adad1263278ee68d1fac4c71d563`（完整 40 位；重放前远端 `main`，不是 Phase 1 变更提交）
- 候选代码提交：见 PR #1404 的提交历史；验收 head SHA 以 GitHub 回读为准
- 总体状态：**BLOCKED / NOT ACCEPTED**
- 当前结论：**不可合并 main，不可发布**。最终复审的 8 项 findings 与残余波 F2/F3/F5/F6、E2E 路径触发缺口均已修复，并通过独立 scoped 复审；但 Vite dev-only 风险接受仍未签署，CI、真实微信构建与真机证据也尚未闭环。

> 本文件不把“未运行”写成通过，不伪造 workflow run、制品、包体积或风险批准。勾选只在对应证据存在后更新。

## 1. 验收结论与阻断边界

| 类别         | 当前结论                                                                       | 证据 / 下一步                                                                                                                                                                                                                                    | 负责人           |
| ------------ | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------- |
| 生产依赖安全 | 本次审计 `productionBlockers=0`，不代表代码无缺陷或验收通过                    | 最终修复波 npm audit 分类报告；仍需新 HEAD 复扫与 scoped 复审                                                                                                                                                                                    | 小程序依赖维护者 |
| 开发依赖安全 | dev critical = 0，dev high = 1                                                 | `vite@5.2.8` 聚合的 Windows dev-server `launch-editor` high；风险接受仍为 `pending`                                                                                                                                                              | 安全负责人       |
| 本地质量     | 最终修复波与残余波 typecheck、lint、Prettier、完整 Vitest、架构/源码扫描均通过 | 最终波：[final-fix-evidence.txt](../../.superpowers/sdd/2026-11-27-miniapp-phase1-foundation/final-fix-evidence.txt)；残余波：[residual-fix-evidence.txt](../../.superpowers/sdd/2026-11-27-miniapp-phase1-foundation/residual-fix-evidence.txt) | 质量交付工程师   |
| 审计门       | **失败，符合预期**                                                             | 退出码 1；`devRiskStatus=pending`，不得改写成绿色                                                                                                                                                                                                | 安全负责人       |
| CI           | 两条独立工作流均未实跑                                                         | 无 run URL、job conclusion、构建产物或 E2E 制品                                                                                                                                                                                                  | 仓库维护者       |
| 运行时       | Windows CI、uni-app 微信构建、automator 均未实跑                               | 必须由对应 PR 的 GitHub Actions 提供证据                                                                                                                                                                                                         | CI/测试负责人    |
| 微信真机     | 真实手机号授权登录未验收                                                       | automator 只覆盖拒绝授权/缺码路径；真实授权是人工发布门                                                                                                                                                                                          | 产品/测试负责人  |
| 旧版保护     | `miniprogram/` 与 `.github/workflows/ci-cd.yml` 无 diff                        | 本次 `git diff --name-only` 输出为空；旧版可部署性未重新构建                                                                                                                                                                                     | 仓库维护者       |

### 阻断判定

1. **代码侧最终复审已通过**：最终复审登记的 8 项 findings 及残余波 F2/F3/F5/F6、N1 均已修复，独立 scoped re-review 为 PASS（5/5 ADDRESSED），未发现新增 Critical/Important。
2. **Vite 风险接受未签署**：`docs/security/miniapp-dev-dependency-risk-acceptance.json` 仍为 `status=pending`、`approvedBy=null`、`approvedAt=null`，审计门按设计失败关闭。签署前不得合并或发布。
3. **CI 与真机证据未闭环**：Windows GitHub Actions、uni-app 微信构建、automator、真实 PostgreSQL 集成测试与真实微信设备验收尚未完成。未完成前不得合并或发布。
4. 生产依赖 critical/high 不接受风险。若后续复扫出现生产 critical/high，必须升级、移除或隔离，不允许用 dev 风险接受覆盖。
5. 本任务已提交并推送至 `feat/miniapp-rebuild-phase1`，PR #1404 已创建；独立工作流尚未成为分支保护必需检查，仓库管理员仍须将两条工作流设为 PR 必需检查。

## 2. 最终复审 findings 与修复状态

最终复审结论为 **NO-GO**，共 1 Critical、6 Important、1 Minor；残余修复波补入 1 项 Important 触发缺口。下表只登记本地修复状态，不将其等同于复审通过；逐文件明细与剩余 concern 见 [final-fix-report.md](../../.superpowers/sdd/2026-11-27-miniapp-phase1-foundation/final-fix-report.md)，残余波原始输出见 [residual-fix-evidence.txt](../../.superpowers/sdd/2026-11-27-miniapp-phase1-foundation/residual-fix-evidence.txt)。

| ID  | 级别      | Finding                                                      | 当前修复状态               | 主要证据                                                                                                                                                                    |
| --- | --------- | ------------------------------------------------------------ | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1  | Critical  | 异步 auth guard 破坏 uni-app 同步 interceptor 契约           | scoped 复审通过 | guard 同步返回 options/false；验证后按原 method/options 重放；真实 interceptor 回调测试                                                                                     |
| F2  | Important | npm audit 命令失败、畸形 JSON 或 metadata 计数不完整可能假绿 | scoped 复审通过 | 六个计数必填且为非负整数、total=各级之和、metadata 与漏洞明细对象逐级一致；反向覆盖 status=0/high=1/空明细、缺字段、非法数值和严重级错配                                    |
| F3  | Important | dev 风险接受按包名放行，范围过宽                             | scoped 复审通过 | 包名、版本、安装节点、advisory URL/range/severity、scope 精确匹配；requiredEntries/acceptedEntries 双向差集为空；同包同版本多余 advisory 自证失败                           |
| F4  | Important | feature 边界与公开入口缺失，shared 反向依赖 auth             | scoped 复审通过 | 新增 `features/auth/index.ts`；shared UI 不再引用 auth；架构扫描自证与实际扫描通过                                                                                          |
| F5  | Important | 源码安全扫描缺失                                             | scoped 复审通过 | 仅真实 `src/shared/i18n/zh-CN.ts`、`en-US.ts` 豁免；`features/auth/zh-CN.ts` 含 secret/IP/裸中文夹具必须命中；self-test 与实际扫描通过                                      |
| F6  | Important | 工作流缺少 Step Summary 或误记 PR merge commit SHA           | scoped 复审通过 | 两条工作流显式传 PR head SHA（非 PR 回退 github.sha）；摘要脚本优先且严格校验 HEAD_SHA；merge/head 不同与非法 HEAD_SHA 测试通过；保留审计、扫描、页数、体积、E2E 与制品字段 |
| F7  | Important | 验收文档阻断描述过时                                         | scoped 复审通过 | 删除“唯一代码外阻断”等表述；登记 8 项 findings；保持 BLOCKED / NOT ACCEPTED                                                                                                 |
| F8  | Minor     | 误称 CI Prettier 漏检 `shims-uni.d.ts`                       | scoped 复审通过 | `miniapp/*.ts` 已覆盖该 shim；删除错误说明，最终 Prettier 证据包含显式 shim 参数                                                                                            |
| N1  | Important | E2E PR paths 未包含 Step Summary 脚本                        | scoped 复审通过 | `miniapp-e2e.yml` 新增 `scripts/ci/miniapp-write-step-summary.mjs`；Vitest 校验 pull_request paths                                                                          |

## 3. Phase 1 exit criteria 逐项验收

| #   | Exit criterion                                                                  | 状态                   | 本地证据                                                                                  | CI / 发布证据                                                                            | 负责人 / 下一步                                                  |
| --- | ------------------------------------------------------------------------------- | ---------------------- | ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| 1   | 干净 checkout 可不经人工步骤运行 `miniapp-checks.yml` 与 `miniapp-e2e.yml`      | 未验收                 | 工作流存在；action 全量固定；YAML 解析通过                                                | 两条工作流均未运行； Secrets、Windows 工具链和干净安装未验证                             | 仓库维护者：获授权推送后运行 PR 工作流并记录 run URL/head SHA    |
| 2   | 新应用可用密码与微信测试凭据登录，验证 `/auth/me` 并渲染工作台                  | 部分实现，未验收       | 单元测试覆盖会话与页面；密码 E2E 已定义；登录成功路径会回读 `/auth/me`                    | 密码运行时 E2E 未跑；真实微信手机号登录未跑                                              | 测试负责人：先跑 Windows E2E，再执行人工微信验收                 |
| 3   | API client、CSRF queue、error model、permission model、session store 有单元覆盖 | 本地通过               | 完整 Vitest：18 files / 309 tests，全部通过                                               | CI 复跑待完成                                                                            | 前端负责人：保持覆盖并接入 PR 必需检查                           |
| 4   | 契约门证明零旧端点、零旧分页键                                                  | 本地通过               | `MINIAPP_CONTRACT calls=4 failures=0`；自证通过                                           | CI 复跑待完成                                                                            | 前端负责人：新增端点必须继续通过 AST 契约门                      |
| 5   | 195 页后端缺口台账完整并已评审                                                  | 本地通过               | 195 pages / 4381 rows；重新生成与提交候选文件 `cmp` 一致；Task 9 已独立复审               | 无额外 CI 运行记录                                                                       | 后端负责人：Phase 2 按域评审 `manual-review` 与缺口              |
| 6   | 后端小程序登录为增量实现，经 PostgreSQL 测试且不自动建用户                      | 代码完成，动态证据缺失 | migration 有 `(appid,openid)` 唯一键；测试覆盖未知手机号不建用户、重复绑定、唯一约束/外键 | Rust/PostgreSQL 集成测试未在本次实跑；Windows E2E 工作流只构建后端，不替代 Rust 测试 job | 后端负责人：在真实 PostgreSQL CI 中运行新增集成测试并记录结果    |
| 7   | 运行时 E2E 使用真实微信开发者工具、真实后端、真实 PostgreSQL，无 mock/拦截      | 未验收                 | E2E 源码使用 automator；工作流显式启动 PostgreSQL、迁移并启动后端                         | Windows job、微信开发者工具安装、automator 连接均未实跑；0 条运行时用例执行              | CI/测试负责人：运行 `miniapp-e2e.yml`，上传并审查 8 个白名单制品 |
| 8   | 旧 `miniprogram/` 在 Phase 4 切换前保持不变且可部署                             | 本地部分通过           | 受保护路径无 diff                                                                         | 旧版未重新构建，可部署性无新证据                                                         | 仓库维护者：保持旧版门禁与回退入口，Phase 4 再统一下线           |

## 4. Task 12 验收清单

| 验收项                                           | 状态                     | 证据与限制                                                                                   | 负责人 / 下一步                                             |
| ------------------------------------------------ | ------------------------ | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `miniapp/` 在 CI 中完成微信构建                  | 待执行                   | `build:mp-weixin` 已配置；未本地构建                                                         | CI 负责人：记录 `static` job 日志                           |
| TypeScript、ESLint、Prettier、单测、契约测试通过 | 本地通过 / CI 待执行     | 本次本地全部通过；Vitest 309/309                                                             | CI 负责人：PR 复跑                                          |
| 契约门零 `/app-api`、`/oauth-api`、旧分页键      | 本地通过                 | `calls=4 failures=0`；反向自证通过                                                           | 前端负责人：持续门禁                                        |
| 页面检查零缺失                                   | 本地通过                 | `MINIAPP_PAGES declared=2 missing=0`                                                         | 前端负责人：新增页面同步 `pages.json`                       |
| 主包 ≤ 2048KB                                    | 待执行                   | 只有自证夹具的 `MINIAPP_SIZE totalKb=2 limitKb=2`，不是真实产物                              | CI 负责人：记录真实 `miniapp/dist/build/mp-weixin` 体积输出 |
| 运行时 E2E 连接真实开发者工具、后端、PostgreSQL  | 待执行                   | 工作流已实现，未实跑                                                                         | CI/测试负责人：提供 `miniapp-e2e-results` 制品              |
| 密码登录与 `/auth/me` 验证通过                   | 待执行                   | `smoke.spec.ts` 定义真实密码登录并断言工作台用户名；session store 回读 `/auth/me`            | 测试负责人：运行时确认                                      |
| 微信登录仅匹配既有手机号且不创建 ERP 用户        | 人工待验收               | 后端测试已覆盖未知手机号不建用户；automator 不操作原生授权框                                 | 产品/测试负责人：真机授权并核对用户/绑定数量                |
| 身份绑定唯一约束由集成测试验证                   | 代码完成 / CI 待执行     | `miniapp_identity_unique_key_and_user_foreign_key_are_enforced` 直接插库断言重复键与外键失败 | 后端负责人：真实 PostgreSQL CI 证据                         |
| 195 页缺口台账完整且确定性生成                   | 本地通过                 | 195 / 4381，`cmp` 一致                                                                       | 后端负责人：Phase 2 域级评审                                |
| 无 Secret 或真实主机值被跟踪                     | 静态检查通过 / CI 待执行 | env 示例均为占位值；制品扫描器自证通过；未做全仓真实 Secret 鉴定                             | 安全负责人：复核 diff 与 CI 制品                            |
| 旧 `miniprogram/` 保持不变                       | 本地通过                 | 无 diff                                                                                      | 仓库维护者：Phase 4 前持续保护                              |
| 风险接受单独变更触发新 HEAD 审计门               | 静态通过 / CI 待执行     | 文件已加入 PR 与 main push 的 `paths`；YAML 解析通过                                         | 安全负责人：签署提交后以新 HEAD 的 run 与报告判定放行       |

## 5. 本地验证记录

原始输出：最终波 [final-fix-evidence.txt](../../.superpowers/sdd/2026-11-27-miniapp-phase1-foundation/final-fix-evidence.txt)；残余波 [residual-fix-evidence.txt](../../.superpowers/sdd/2026-11-27-miniapp-phase1-foundation/residual-fix-evidence.txt)。执行时间：2026-11-28；Node `v22.23.2`，npm `10.9.8`。

| 检查                | 命令                                                                                                                         | 结果                                                                                                                                  |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| typecheck           | `npm --prefix miniapp run typecheck`                                                                                         | 退出码 0                                                                                                                              |
| lint                | `npm --prefix miniapp run lint`                                                                                              | 退出码 0                                                                                                                              |
| Prettier            | `npm --prefix miniapp exec -- prettier --check miniapp/src miniapp/tests miniapp/*.ts miniapp/*.json miniapp/shims-uni.d.ts` | 退出码 0；显式包含 shim                                                                                                               |
| 完整 Vitest         | `npm --prefix miniapp run test:run`                                                                                          | 18 files / 309 tests 通过，退出码 0                                                                                                   |
| 架构扫描 self-test  | `node scripts/ci/miniapp-architecture-check.mjs --self-test`                                                                 | `MINIAPP_ARCHITECTURE_SELFTEST_OK`，退出码 0                                                                                          |
| 架构实际扫描        | `node scripts/ci/miniapp-architecture-check.mjs`                                                                             | `MINIAPP_ARCHITECTURE_OK`，退出码 0                                                                                                   |
| 源码扫描 self-test  | `node scripts/ci/miniapp-source-scan.mjs --self-test`                                                                        | `MINIAPP_SOURCE_SCAN_SELFTEST_OK`，退出码 0                                                                                           |
| 源码实际扫描        | `node scripts/ci/miniapp-source-scan.mjs`                                                                                    | `MINIAPP_SOURCE_SCAN_OK`，退出码 0                                                                                                    |
| npm audit self-test | `node scripts/ci/miniapp-npm-audit.mjs --self-test`                                                                          | `MINIAPP_NPM_AUDIT_SELFTEST_OK`，退出码 0                                                                                             |
| npm audit gate      | `node scripts/ci/miniapp-npm-audit.mjs --markdown-output ... --json-output ...`                                              | **退出码 1，预期阻断**；`productionBlockers=0`、`devBlockers=1`、`devRiskStatus=pending`                                              |
| 静态门 self-test    | `bash scripts/ci/miniapp-checks.sh --self-test`                                                                              | `MINIAPP_STATIC_SELFTEST_OK`，退出码 0                                                                                                |
| 契约实际检查        | `node scripts/ci/miniapp-contract-check.mjs --root miniapp/src --snapshot frontend/scripts/route-snapshot.txt`               | `calls=4 failures=0`，退出码 0                                                                                                        |
| 页面实际检查        | `node scripts/ci/miniapp-check-pages.mjs miniapp/src`                                                                        | `declared=2 missing=0`，退出码 0                                                                                                      |
| Step Summary 单测   | `npm --prefix miniapp run test:run -- tests/unit/ci-step-summary.test.ts tests/unit/task11-ci-security.test.ts`              | 16 tests 通过，退出码 0；摘要 8 条覆盖成功/失败、缺失/畸形报告、merge/head 不同与非法 HEAD_SHA；工作流 8 条覆盖 head 传参与 E2E paths |
| action pinning      | `node scripts/ci/check-action-pinning.mjs`                                                                                   | `hard=0`，退出码 0                                                                                                                    |
| YAML 解析           | 使用仓库现有 `yaml` 依赖解析两条工作流                                                                                       | 两条均 `YAML_OK`，退出码 0                                                                                                            |
| Node 语法           | 对 `scripts/ci/miniapp-*.mjs` 执行 `node --check`                                                                            | 全部退出码 0                                                                                                                          |
| Bash 语法           | `bash -n scripts/ci/miniapp-checks.sh scripts/ci/start-miniapp-e2e-backend.sh`                                               | 退出码 0                                                                                                                              |
| 保护路径            | `git diff --name-only -- miniprogram/ .github/workflows/ci-cd.yml`                                                           | 空输出，退出码 0                                                                                                                      |

审计摘要：`{"info":0,"low":12,"moderate":21,"high":1,"critical":0,"total":34}`。详细分类见 [npm audit 报告](miniapp-npm-audit.md)。

验证边界与注意事项：

- 本次完整 Vitest 是用户明确授权的本地例外；常规开发仍以 CI 为最终证据。
- 未执行 `npm ci`、uni-app 构建、Rust 编译/测试、dev server、automator 或任何运行时 E2E。首次运行或锁文件变化后仍必须先清洁安装。
- `scripts/ci/miniapp-checks.sh` 的 `miniapp/*.ts` 已覆盖 `miniapp/shims-uni.d.ts`；本轮 Prettier 还显式列出该 shim，不存在 CI 漏检结论。
- 未生成真实微信构建产物，因此真实包体积仍必须由 CI 构建后登记；自证夹具的 2 KB 不是产物证据。
- 最终修复波首轮完整 Vitest 暴露 3 个测试侧过期断言：两处仍期待旧中文错误文案，一处 upload step 文本切片吞入后续 `if: always()` 摘要步骤。已修正文案断言与 step 边界，未修改生产行为；随后完整套件通过。
- 实际契约扫描另暴露判定器把 TypeScript `CaseBlock.clauses` 误当 `statements` 的工具缺陷；已按真实 AST 结构修复，并同时加入 Vitest 回归与静态门 self-test，实际扫描恢复 `calls=4 failures=0`。
- Vitest 有 Vite CJS Node API 弃用警告，未影响 309 条用例；CI 应继续观察。
- 残余波 F2 的 metadata 计数对象与 `npm audit` 的 vulnerability 明细对象逐级对账；报告行按安装节点展开，节点行数可以与 metadata total 不同。F3 增加 advisory entry 双向差集；F5 收紧 i18n 路径并加入 feature 伪 locale 反向夹具；F6 增加 PR head 优先与非法 HEAD_SHA 拒绝测试；N1 补入 E2E 摘要脚本路径触发。

## 6. CI 证据登记（待实跑后填写）

| 字段             | `miniapp-checks.yml`                                                                                                                   | `miniapp-e2e.yml`                                                                                                                                      |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 工作流           | [miniapp-checks.yml](../../.github/workflows/miniapp-checks.yml)                                                                       | [miniapp-e2e.yml](../../.github/workflows/miniapp-e2e.yml)                                                                                             |
| 最终 head SHA    | PR #1404 head SHA（以 GitHub 回读为准）                                                                                                                      | PR #1404 head SHA（以 GitHub 回读为准）                                                                                                                                      |
| Workflow run URL | 未执行                                                                                                                                 | 未执行                                                                                                                                                 |
| Step Summary     | `if: always()`；优先完整 40 位 `HEAD_SHA`（PR head，非 PR 回退 `github.sha`）、`job.status`、审计、架构/源码、页数、真实体积（若存在） | `if: always()`；优先完整 40 位 `HEAD_SHA`（PR head，非 PR 回退 `github.sha`）、`job.status`、exit-code、测试数量/结果、制品路径与上传结果              |
| Job / conclusion | `static`: 未执行                                                                                                                       | `e2e`: 未执行                                                                                                                                          |
| 主包体积         | 未执行                                                                                                                                 | 不适用                                                                                                                                                 |
| E2E 数量         | 不适用                                                                                                                                 | 源码定义 2 条；实际执行 0 条                                                                                                                           |
| E2E 制品         | 不适用                                                                                                                                 | 预期 `miniapp-e2e-results`，当前无制品                                                                                                                 |
| 制品路径         | 预期 `miniapp-npm-audit-report`                                                                                                        | `e2e.json`、`exit-code.txt`、`backend.log`、`backend.stderr.log`、`automator.stdout.log`、`automator.stderr.log`、`readiness.json`、`init-status.json` |

此外必须在现有 Rust CI 中记录新增后端集成测试的 PostgreSQL job 名称、run URL、head SHA 与 conclusion。不得用 Windows E2E 的“后端构建成功”替代数据库集成测试证据。

## 7. 发布阻断与人工验收

### 7.1 风险接受签署

安全负责人须审阅 [Vite 风险记录](miniapp-npm-audit.md) 与 [待签署 JSON](../security/miniapp-dev-dependency-risk-acceptance.json)，确认：

- 仅覆盖 dev/build/test 树，不覆盖生产依赖；
- 风险包清单覆盖当前及复扫后的全部 dev critical/high；
- dev server 仅绑定回环、仅处理受信输入，不使用 `/__open-in-editor` 处理外部输入；
- 签署人、签署时间、到期时间与缓解措施真实有效。

Task 12 不代签、不修改 `pending`。若选择不接受风险，则升级 uni-app/Vite 工具链并重新验证 peer、构建、审计和运行时 E2E。

`docs/security/miniapp-dev-dependency-risk-acceptance.json` 已加入 `miniapp-checks.yml` 的 `pull_request.paths` 与 `push.paths`。因此，单独签署该文件也会产生新的候选 HEAD，并在 PR 或推送到 `main` 时触发新的审计门。必须登记并审查该新 HEAD 的 workflow run、`static` job conclusion 与 npm 审计报告；签署前 HEAD 的通过结果不得复用为新 HEAD 证据。审计仍失败时，后续静态步骤不会执行，其他本地检查也不能替代该门。

### 7.2 真实微信登录人工步骤

1. 在微信公众平台配置测试 AppID，并在开发者工具中导入 `miniapp/dist/build/mp-weixin`；禁止用 `touristappid` 代替运行时测试号。
2. 确认测试 AppID 与后端 `MINIAPP_APPID` 完全一致，`MINIAPP_SECRET` 来自同一测试号；不得复用 `WECHAT_MP_APPID/WECHAT_MP_SECRET`。
3. 在 ERP 中准备一个已存在、启用、无 TOTP 阻断的测试用户，其 `users.phone` 等于测试微信号真实授权手机号；记录验收前用户总数。
4. 真机点击“微信登录”，在原生授权框同意手机号授权。
5. 确认进入工作台且用户名与既有 ERP 用户一致；确认会话回读 `/auth/me` 成功。
6. 在数据库确认 `miniapp_identity` 新增且仅新增一条 `(appid,openid)` 绑定，`user_id` 指向既有用户；ERP 用户总数不变。
7. 退出后重复登录，确认复用同一绑定，不产生重复身份记录。
8. 使用未匹配手机号的测试微信账号重试，确认登录失败、停留登录页、不创建用户、不产生绑定。
9. 拒绝手机号授权，确认显示错误并停留登录页，不进入工作台。
10. 保存脱敏截图、时间、AppID 标识、后端 trace_id、用户/绑定数量核对结果；禁止保存 Secret、Cookie、手机号明文或 token。

### 7.3 CI 运行时验收

1. PR #1404 已创建，两条独立工作流由该 PR 触发；不得仅手动运行旧分支或伪造 run。风险接受签署提交也必须通过 PR 路径触发，并以新候选 HEAD 的审计结果为准。
2. 配置六个 Secrets：`MINIAPP_TEST_APPID`、`MINIAPP_TEST_SECRET`、`WECHAT_DEVTOOLS_INSTALLER_URL`、`WECHAT_DEVTOOLS_CLI`、`MINIAPP_E2E_USERNAME`、`MINIAPP_E2E_PASSWORD`。
3. 确认 `MINIAPP_TEST_APPID` 符合 `wx` + 16 位十六进制格式且不是 `touristappid`。
4. 审查 Windows PostgreSQL、Rust release 构建、微信开发者工具安装、uni-app 构建、迁移、automator 与 2 条 E2E 的逐步日志。
5. 审查 npm 审计报告、真实包体积和 E2E 白名单制品；敏感信息扫描失败时不得上传或采信制品。
6. 将两条工作流设为 PR 必需检查后，才可讨论合并。

## 8. Phase 2 交接与后端缺口

Phase 2 范围：工作台、订单列表/详情/建单/收款/打印、客户管理、商品与色卡、销售退货，并同步补齐后端端点、字段、权限与测试。

[195 页后端缺口台账](miniapp-backend-gap-ledger.md) 当前统计：

| existing | missing | legacy | manual-review | 总行数 |
| -------: | ------: | -----: | ------------: | -----: |
|     1490 |       7 |   2623 |           261 |   4381 |

解释与治理要求：

- `legacy` 只表示旧 `/app-api` 或 `/oauth-api` 调用，不能直接解释为新后端“已有”或“缺失”；必须先映射到真实业务能力。
- `missing` 是路由快照中未注册的候选缺口，仍需人工复核动态路径与替代端点。
- `manual-review` 的请求字段、响应字段与权限不能由静态调用可靠推导，进入具体业务域时逐项对照 Rust DTO、状态词表、数据范围和审计要求。
- 每个 Phase 2 后端新增能力必须同时具备 handler、service、权限码、数据范围、审计、OpenAPI 注解、migration（如需要）和真实 PostgreSQL 集成测试。
- 无真实后端承载的页面不得进入新小程序，不得以假数据、空成功或 404 占位绕过。
- 台账是静态盘点，不等同于 195 页功能验收；全量功能对照属于 Phase 4。

## 9. 已知限制（不改变上述阻断结论）

- 正式 AppID 尚未配置；测试号验收不能替代正式号真机验收。
- 真机微信手机号授权无法由当前 automator 可靠操作，因此保留人工发布门。
- Windows 冷编译、微信开发者工具静默安装与 60 分钟 job 时限尚未实测量。
- 剩余 moderate/low 漏洞已分类，但需随工具链升级持续治理；它们本次不作为 critical/high 门禁放行理由。
- 当前英文文案尚未展开；中文默认与后续多语言结构是 Phase 1 口径，不据此声称全量多语言验收完成。
- 旧 `miniprogram/` 未改动，但本次没有重新构建旧版，因此只证明“未改”，不证明“重新可部署”。
