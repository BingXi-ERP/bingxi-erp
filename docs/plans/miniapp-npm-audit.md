# 新小程序 npm audit 分类与处置

- 审计时间：2026-11-28（依赖安全修复轮 3）
- 数据源：`npm audit --json` + `npm ls --all` + `npm ls --omit=dev --all --long --json`
- 门禁：`node scripts/ci/miniapp-npm-audit.mjs`
- 风险接受文件：`docs/security/miniapp-dev-dependency-risk-acceptance.json`

## 1. 当前结论

| 指标                           | 修复轮 1 后 | 修复轮 2 后 | 修复轮 3 后 |
| ------------------------------ | ----------: | ----------: | ----------: |
| audit 漏洞总数                 |          46 |          33 |          34 |
| critical                       |           0 |           0 |           0 |
| high                           |          12 |           0 |           1 |
| moderate                       |          19 |          20 |          21 |
| low                            |          15 |          13 |          12 |
| 生产树 critical/high 节点      |           0 |           0 |           0 |
| dev critical/high 节点         |          12 |           0 |           1 |
| 生产树全部严重级节点           |           0 |           0 |           0 |
| dev/build-only moderate 唯一包 |           — |          20 |          21 |
| dev/build-only low 唯一包      |           — |          13 |          12 |

生产依赖树 critical/high 为 **0**。剩余 1 个 high 位于 dev/build/test 树，由 `vite@5.2.8` 聚合报告，实际公告对象为 Vite 内置打包的 `launch-editor` 开发服务器代码；不进入小程序生产运行时。

最终 `npm audit --json` 汇总：

```json
{ "info": 0, "low": 12, "moderate": 21, "high": 1, "critical": 0, "total": 34 }
```

`npm audit` 因仍有 high/moderate/low 返回退出码 1。仓库审计门 `miniapp-npm-audit.mjs` 也返回退出码 **1**，因为 dev high 包 `vite` 的风险接受文件保持 `pending`、未签署；门禁按设计失败关闭，没有伪造签署放行：

```text
MINIAPP_NPM_AUDIT_SUMMARY {"info":0,"low":12,"moderate":21,"high":1,"critical":0,"total":34} productionBlockers=0 devBlockers=1 devRiskStatus=pending
MINIAPP_NPM_DEV_RISK_BLOCKER reason=风险接受状态为 pending，不是 approved
MINIAPP_NPM_DEV_RISK_BLOCKER reason=approvedBy 缺失或为空
MINIAPP_NPM_DEV_RISK_BLOCKER reason=approvedAt 缺失或为空
```

## 2. Vite peer 冲突修复

### 根因

当前 uni-app Vue3 alpha 工具链的 peer 为：

```text
@dcloudio/vite-plugin-uni@3.0.0-5030420261029002 peerDependencies.vite = 5.2.8
@vitejs/plugin-legacy@5.3.2 peerDependencies.vite = ^5.0.0
@vitejs/plugin-vue-jsx@3.1.0 peerDependencies.vite = ^4.0.0 || ^5.0.0
```

修复轮 2 将直接依赖与 override 都固定为 `vite@6.4.6`，虽然清除了 high，但违反 uni-app 的精确 peer `5.2.8`，也不满足 `@vitejs/plugin-legacy` 与 `@vitejs/plugin-vue-jsx` 的 Vite 5 peer。

### 最终处置

- `miniapp/package.json` 的 `devDependencies.vite` 固定为 **5.2.8**。
- 删除 `overrides.vite`，不再用 Vite 6 override 覆盖依赖树。
- 其余安全 overrides 全部保留，版本未变。
- `npm install` 成功；`npm ls --all` 退出码 0，无 invalid dependency。
- 安装后的 Vite 树全部 dedupe 到 5.2.8：

```text
@dcloudio/vite-plugin-uni -> vite@5.2.8
@vitejs/plugin-legacy -> vite@5.2.8
@vitejs/plugin-vue-jsx -> vite@5.2.8
@vitejs/plugin-vue -> vite@5.2.8
vitest / vite-node / @vitest/mocker -> vite@5.2.8
```

## 3. 保留的安全 overrides

| 包                          | 最终 override/版本 |
| --------------------------- | ------------------ |
| `adm-zip`                   | 0.6.1              |
| `@intlify/core-base`        | 9.14.4             |
| `@intlify/message-compiler` | 9.14.4             |
| `@intlify/message-resolver` | 9.1.11             |
| `@intlify/runtime`          | 9.1.10             |
| `@intlify/shared`           | 9.14.4             |
| `@intlify/vue-devtools`     | 9.14.4             |
| `@vue/server-renderer`      | 3.5.46             |
| `body-parser`               | 1.20.9             |
| `express`                   | 4.22.3             |
| `jimp`                      | 0.22.12            |
| `path-to-regexp`            | 0.1.13             |
| `postcss`                   | 8.5.34             |
| `source-map-js`             | 1.2.4              |
| `tinypool`                  | 2.2.0              |
| `ws`                        | 8.23.0             |

这些 override 与 Vite 5.2.8 未发现安装或加载冲突；完整 Vitest、typecheck、lint 与 `miniprogram-automator` require 均通过。

## 4. 剩余 dev-only high 精确清单

### 4.1 审计节点

| 字段           | 值                                                                                              |
| -------------- | ----------------------------------------------------------------------------------------------- |
| 审计包名       | `vite`                                                                                          |
| 安装版本       | `5.2.8`                                                                                         |
| 严重级         | high                                                                                            |
| 生产树         | 否                                                                                              |
| 依赖路径       | `bingxi-miniapp (devDependencies) > vite@5.2.8`                                                 |
| npm audit 节点 | `node_modules/vite`                                                                             |
| 实际漏洞代码   | Vite 内置打包的 `launch-editor`，不是独立安装的 npm 包                                          |
| 触发面         | Windows 上的 Vite 开发服务器 `/__open-in-editor` / `launchEditor` 路径；不进入小程序生产 bundle |

`vite@5.2.8` 节点聚合了两条 high advisory：

| Advisory                                                                 | CVE             | 类型                                                        | Vite 受影响范围 | 修复版本 | 是否仅 dev server                               |
| ------------------------------------------------------------------------ | --------------- | ----------------------------------------------------------- | --------------- | -------- | ----------------------------------------------- |
| [GHSA-c27g-q93r-2cwf](https://github.com/advisories/GHSA-c27g-q93r-2cwf) | CVE-2024-52011  | Windows 下特制 `file` 参数导致 `launch-editor` 命令注入     | `<=5.4.8`       | 5.4.9    | 是，开发期 `launchEditor` / open-in-editor 路径 |
| [GHSA-587h-7wmj-h5pm](https://github.com/advisories/GHSA-587h-7wmj-h5pm) | CVE-2026-112942 | Windows 下 `fs.existsSync()` 检查绕过，可进一步导致命令注入 | `<=6.4.3`       | 6.4.4    | 是，开发期 `launch-editor-middleware` 路径      |

### 4.2 为什么不能安全升级或 override

1. **Vite 5.4.9+ 可修复 high，但违反 uni-app 精确 peer。** `@dcloudio/vite-plugin-uni@3.0.0-5030420261029002` 明确要求 `vite=5.2.8`，不是 `^5.2.8`；升级到 5.4.9+ 会重新产生 invalid peer。
2. **Vite 6.4.4+ 可修复 high，但同样不兼容。** 除 uni-app 精确 peer 外，`@vitejs/plugin-legacy@5.3.2` 仅接受 `^5.0.0`，`@vitejs/plugin-vue-jsx@3.1.0` 仅接受 `^4.0.0 || ^5.0.0`。
3. **不能通过 `launch-editor` override 修复。** 当前依赖树没有独立 `node_modules/launch-editor`；代码直接打包在 `vite/dist/node/chunks/dep-whKeNLxG.js`，并由 Vite 挂载 `/__open-in-editor` 中间件。添加 `launch-editor` override 不会改变 Vite 包内代码，也会形成无效治理假象。
4. **等待上游工具链整体升级。** 只有 uni-app 发布支持较新 Vite 5 或 Vite 6 的版本后，才能同时满足 peer 与安全补丁要求。

## 5. 剩余 moderate/low

剩余 moderate 唯一包（21）：

`@dcloudio/uni-cli-shared`、`@dcloudio/uni-mp-weixin`、`@dcloudio/vite-plugin-uni`、`@intlify/core-base`、`@intlify/vue-devtools`、`@jimp/core`、`@jimp/custom`、`@vitest/mocker`、`@vue/language-core`、`@vue/test-utils`、`editorconfig`、`esbuild`、`file-type`、`glob`、`jimp`、`js-beautify`、`minimatch`、`miniprogram-automator`、`postcss-selector-parser`、`vitest`、`vue-tsc`。

剩余 low 唯一包（12）：

`@babel/core`、`@dcloudio/uni-app`、`@dcloudio/uni-cloud`、`@dcloudio/uni-components`、`@dcloudio/uni-console`、`@dcloudio/uni-h5`、`@dcloudio/uni-h5-vite`、`@dcloudio/uni-mp-compiler`、`@dcloudio/uni-mp-vite`、`@dcloudio/uni-push`、`@dcloudio/uni-stat`、`debug`。

上述包均不在生产依赖树。Vite 回退后新增的 high 是 peer 兼容与安全补丁之间的已知冲突，不是新增业务依赖。

## 6. 风险接受状态

- 文件：`docs/security/miniapp-dev-dependency-risk-acceptance.json`
- 当前状态：`pending`
- 签署人：未签署
- `approvedBy`：`null`
- `approvedAt`：`null`
- 拟定到期时间：`2026-12-31T23:59:59.000Z`
- 待评估覆盖包：`["vite"]`
- 当前门禁：失败关闭；pending 不影响“记录问题”，但不能放行发布
- 若未来批准：必须由安全负责人核实 dev server 暴露面、控制措施与到期时间；在生产 critical/high 为 0 的前提下仅接受 dev/build/test 树风险

## 7. 验证结果

| 检查                                                       | 结果                                                 |
| ---------------------------------------------------------- | ---------------------------------------------------- |
| `npm install`                                              | 通过                                                 |
| `npm ls --all`                                             | 通过，退出码 0，无 invalid dependency                |
| `npm audit --json`                                         | 已执行；退出码 1，汇总 high=1/moderate=21/low=12     |
| `node scripts/ci/miniapp-npm-audit.mjs`                    | 已执行；退出码 1，dev high=`vite` 且风险接受 pending |
| 完整 Vitest                                                | **16 个测试文件、286 个用例全部通过**                |
| `npm run typecheck`                                        | 通过                                                 |
| `npm run lint`                                             | 通过                                                 |
| Prettier                                                   | 通过                                                 |
| `require('miniprogram-automator')`                         | 通过，`connect` 为函数                               |
| Vite/插件加载                                              | 通过，Vite 5.2.8 与所有相关插件 peer 匹配            |
| uni-app build / Playwright / automator 运行时 / cargo 编译 | 按约束未执行                                         |

## 8. Concerns

1. 当前唯一 high 仅影响 Windows 开发服务器 open-in-editor 路径，但 npm audit 仍按 high 阻断；风险接受保持 pending，因此审计门禁不会放行。
2. Vite 5.2.8 是 uni-app 工具链的硬性 peer，不能为了消除 high 单独升级；需等待上游 uni-app 工具链升级。
3. 完整 Vitest、typecheck、lint 通过，但未执行真实 `mp-weixin` 构建；CI 仍需验证 uni-app 构建产物与插件链兼容性。
4. `ws@8.23.0` 同时覆盖 uni-mp-weixin 与 automator 的 ws；require 与单元测试通过，但 automator 运行时 E2E 未执行。
5. `adm-zip@0.6.1` 与 Intlify 9.14.4 的安全 override 保留；真实构建路径仍需 CI 复核。
6. 未修改旧 `miniprogram/` 或 `ci-cd.yml`；未暂存、提交或推送任何文件。
