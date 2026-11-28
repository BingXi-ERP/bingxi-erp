# 新小程序 npm audit 分类与处置

- 审计时间：2026-11-28（Vite 6 工具链升级轮）
- 数据源：`npm audit --json` + `npm ls --all` + `npm ls --omit=dev --all --long --json`
- 门禁：`node scripts/ci/miniapp-npm-audit.mjs`
- 风险接受文件：`docs/security/miniapp-dev-dependency-risk-acceptance.json`

## 1. 当前结论

| 指标                      | 升级前 | Vite 6 升级后 |
| ------------------------- | -----: | ------------: |
| audit 漏洞总数            |     34 |            33 |
| critical                  |      0 |             0 |
| high                      |      1 |         **0** |
| moderate                  |     21 |            20 |
| low                       |     12 |            13 |
| 生产树 critical/high 节点 |      0 |             0 |
| dev critical/high 节点    |      1 |         **0** |
| 生产树全部严重级节点      |      0 |             0 |

生产依赖树 critical/high 为 **0**，dev/build/test 树 critical/high 也为 **0**。此前阻断审计门的 `vite@5.2.8` / `launch-editor` high 已通过升级清除，不再需要针对该漏洞的风险接受。

最终 `npm audit --json` 汇总：

```json
{ "info": 0, "low": 13, "moderate": 20, "high": 0, "critical": 0, "total": 33 }
```

`npm audit` 因仍有 moderate/low 返回退出码 1；仓库审计门 `miniapp-npm-audit.mjs` 返回退出码 **0**：

```text
MINIAPP_NPM_AUDIT_SUMMARY {"info":0,"low":13,"moderate":20,"high":0,"critical":0,"total":33} productionBlockers=0 devBlockers=0 devRiskStatus=pending
```

`devRiskStatus=pending` 仅表示未有人签署风险接受文件；当前没有需要接受的 dev critical/high，因此该状态不再构成阻断，也不得将它伪造为 `approved`。

## 2. Vite 工具链升级与 peer 处置

### 升级结果

- `miniapp/package.json` 的 `devDependencies.vite` 固定为 **6.4.6**。
- 嵌套插件升级到支持 Vite 6 的版本：
  - `@vitejs/plugin-legacy@6.1.1`
  - `@vitejs/plugin-vue-jsx@5.1.6`
  - `@vitejs/plugin-basic-ssl@2.3.0`
- 保留 uni-app 固定版本 `3.0.0-5030420261029002`。该版本仍将 Vite peer 写死为 `5.2.8`，不能据此判定 Vite 6 运行时不兼容。
- 新增 `miniapp/scripts/patch-uni-vite-peers.mjs`，仅对以下两个精确版本扩大 peer 声明为 `^5.2.8 || ^6.0.0`：
  - `@dcloudio/vite-plugin-uni@3.0.0-5030420261029002`
  - `@uni-helper/vite-plugin-uni-manifest@0.7.0`
- 脚本同时更新锁文件和安装后的包清单；包名或版本漂移会显式失败，不静默扩大补丁范围。
- `npm install`、`npm run postinstall` 与 `npm ls --all --long --json` 均通过，无 invalid dependency。

> peer 补丁只解决 npm 依赖树声明，不替代真实 `mp-weixin` 构建验证。uni-app 构建与插件加载仍须由新 HEAD 的 CI 证明。

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
| `@vitejs/plugin-legacy`     | 6.1.1              |
| `@vitejs/plugin-vue-jsx`    | 5.1.6              |
| `@vitejs/plugin-basic-ssl`  | 2.3.0              |
| `body-parser`               | 1.20.9             |
| `express`                   | 4.22.3             |
| `jimp`                      | 0.22.12            |
| `path-to-regexp`            | 0.1.13             |
| `postcss`                   | 8.5.34             |
| `source-map-js`             | 1.2.4              |
| `tinypool`                  | 2.2.0              |
| `ws`                        | 8.23.0             |

## 4. 剩余 moderate/low

剩余 moderate 唯一包（20）：

`@dcloudio/uni-cli-shared`、`@dcloudio/uni-mp-weixin`、`@intlify/core-base`、`@intlify/vue-devtools`、`@jimp/core`、`@jimp/custom`、`@vitest/mocker`、`@vue/language-core`、`@vue/test-utils`、`editorconfig`、`esbuild`、`file-type`、`glob`、`jimp`、`js-beautify`、`minimatch`、`miniprogram-automator`、`postcss-selector-parser`、`vitest`、`vue-tsc`。

剩余 low 唯一包（13）：

`@babel/core`、`@dcloudio/uni-app`、`@dcloudio/uni-cloud`、`@dcloudio/uni-components`、`@dcloudio/uni-console`、`@dcloudio/uni-h5`、`@dcloudio/uni-h5-vite`、`@dcloudio/uni-mp-compiler`、`@dcloudio/uni-mp-vite`、`@dcloudio/uni-push`、`@dcloudio/uni-stat`、`@dcloudio/vite-plugin-uni`、`debug`。

上述包均不在生产依赖树，持续按工具链升级治理；它们不影响本次 critical/high 门禁结论。

## 5. 风险接受状态

- 文件：`docs/security/miniapp-dev-dependency-risk-acceptance.json`
- 当前状态：`pending`，未伪造签署
- `approvedBy` / `approvedAt`：`null`
- 当前 dev critical/high 待接受包：`[]`
- 当前门禁：退出码 0，`productionBlockers=0`、`devBlockers=0`
- 若后续复扫出现新的 dev critical/high，门禁会重新要求精确、有效且未过期的风险接受；现有 pending 文件不能自动放行新风险。

## 6. 验证结果

| 检查                                                   | 结果                                                      |
| ------------------------------------------------------ | --------------------------------------------------------- |
| `npm install --ignore-scripts` + `npm run postinstall` | 通过                                                      |
| `npm ci`（含 postinstall）                             | **通过**；干净安装 810 个包，两个精确版本 peer 补丁均生效 |
| `npm ls --all --long --json`                           | 通过，退出码 0，无 invalid dependency                     |
| `npm audit --json`                                     | 已执行；退出码 1，汇总 high=0/moderate=20/low=13          |
| `node scripts/ci/miniapp-npm-audit.mjs`                | **退出码 0**；`productionBlockers=0`、`devBlockers=0`     |
| 完整 Vitest                                            | **18 个测试文件、309 个用例全部通过**                     |
| `npm run typecheck`                                    | 通过                                                      |
| `npm run lint`                                         | 通过                                                      |
| Prettier                                               | 通过                                                      |
| Vite/插件加载                                          | typecheck、lint 与完整 Vitest 通过                        |
| uni-app build / Playwright / automator 运行时          | 按约束未执行，等待新 HEAD 的 CI                           |

## 7. Concerns

1. peer 补丁有精确版本边界；uni-app 或 manifest 插件升级时必须重新核对脚本中的版本与 peer 范围。
2. 本地验证没有生成真实 `mp-weixin` 产物，不能据此声称 Vite 6 与 uni-app 的构建链已验收。
3. Windows 运行时 E2E 仍缺六个 Secrets，且尚未执行；审计通过不替代运行时验收。
4. 未修改旧 `miniprogram/` 或 `.github/workflows/ci-cd.yml`。
