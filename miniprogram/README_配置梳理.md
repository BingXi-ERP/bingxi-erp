# 对布管家小程序 · 配置梳理与运行说明

> 目标：微信编译器已压掉原始变量名/注释/TS 类型（无 sourcemap、不可逆），本工程不再追求"还原成可读源码"，而是**确保项目能在微信开发者工具里直接运行**，并把散落在 `app.js` / `envConfig.js` 中的"看起来像配置"的字段梳理清楚，避免上线/联调踩旧环境坑。

---

## 一、环境 / 域名配置（核心，已集中管理 ✓）

`envConfig.js`（根目录）是**唯一的**环境与域名配置源，定义 4 套环境；其中 `bingxiHost`（本仓后端主机）为四环境单点同源，真值来自本地配置 `mpHost.local.js`（主机地址见本地配置，模板 `mpHost.local.example.js`，真值不入库）：

| key | 名称 | rootHost（接口域名） | imgHost（图片 CDN） | imgOssHost |
|---|---|---|---|---|
| `dev` | 开发 dev | `https://dshop.duibu.cn` | `https://oss.duibu.cn/duibu/shop` | `https://oss.duibu.cn/` |
| `test` | 测试 test | `https://tshop.duibu.cn` | `https://oss.duibu.cn/duibu/shop` | `https://oss.duibu.cn/` |
| `uat` | 产品 uat | `https://ushop.duibu.cn` | `https://img.duibu.cn/duibu/shop` | `https://img.duibu.cn/` |
| `production` | 生产 product | `https://shop.duibu.cn` | `https://img.duibu.cn/duibu/shop` | `https://img.duibu.cn/` |

- 运行时由 `app.js` 的 `initEnv()` 根据 `envConfig.envPage`（**默认 `"production"`**）选中环境，并写入 `app.config`。
- 所有 `request.js` 封装（`libs/services/request.js`、`packageA/services/request.js`、`packageB/libs/services/request.js` 等）**不硬编码 host**，统一通过 `getApp().config.rootHost` 拼请求地址 → 域名集中可控，无散落硬编码风险。

---

## 二、app.js 中的"看起来像配置"的字段

| 字段 | 当前值 | 性质 | 上线 / 联调建议 |
|---|---|---|---|
| `customsPhoneNum` | `"13727172916"` | ⚠️ **真·硬编码业务值**（客服电话） | 上线前确认是否为当前有效客服号；如需可配置，建议抽到 `envConfig` 或改为接口下发 |
| `globalData.mpVersion` | `"3.2.8"` | ⚠️ **硬编码版本号，与 `envConfig.version`(`3.13.10`) 不一致** | 上报 / 埋点用的版本号，建议统一引用 `envConfig.version` 或 `wx.getAccountInfoSync().miniProgram.version`，避免新旧不一 |
| 顶部 `appVersion` | `"2.6.1.20190824"` | ⚠️ **失效遗留值**：`initEnv` 会把它覆盖成 `envConfig.appVersion`(`1.0.0`) | 运行时不生效，仅误导维护者，可删（非阻塞） |
| `envVersion` | `"release"` | 占位，会被 `judgeConfig` 覆盖 | 无需改 |
| `client` | `"MP-Shop"` | 业务常量（请求头标识） | 一般不变 |
| `getCountInit` 内 mta appID | `500675117`(tshop)、`500673758`(jzcang) | ⚠️ **统计 SDK appID 硬编码** | 见下方"死代码"说明 |

---

## 三、潜在 Bug / 旧环境残留（仅标注，未改动以免改变语义）

1. **`judgeConfig` 中 `case "https://tshop.duibu.cn"` 出现两次**（dev 与 test 都指向 tshop），test 分支因顺序在前被 dev 抢先匹配 → 当 rootHost 为 tshop 时 `environment` 恒为 `"dev"`。但 token 隔离在 `request.js` 里按 `app.environment` 分支（devToken / testToken / uatToken / productionToken），dev/test 同 host 时 token 仍区分。**不影响运行**，仅标注。
2. **`getCountInit` 死代码（已清理）**：原方法仅在 `app.js` 定义、**从未被调用**，且两个 case 的 host 均匹配不到 `config.rootHost`（envList 全是 https）→ MTA 的 `App.init`（全局统计初始化）从未执行。页面级 `mta_analysis.default.Page.init()` 在各页面正常执行，不受影响。**本轮已从 `app.js` 移除该方法，并删掉随之变未使用的顶部 `mta_analysis` require。**
3. **散落硬编码**：`packageB/pages/personal-center/use-teach/use-teach.js` 的 `demo: "https://bdd-admin.jzcang.cn/resource"` 是教程静态资源地址，与业务接口无关，如需统一 CDN 可改。

---

## 四、本次为"确保能运行"已做的改动

1. **清除 `envConfig.js` 顶部调试残留**：删掉 `console.log(__wxConfig, ...)` 与未使用的 `s/t` 变量（会泄露 envVersion 等内部信息）。
2. **`app.js` `initEnv` 支持本地环境覆盖**：改为 `wx.getStorageSync('envPage') || envConfig.envPage`，非法 key 回退默认。向后兼容——storage 为空时行为与发布版完全一致。
3. **还原 `packageDebug/pages/env/index` 调试页**：原始提取只还原出 `index.json`，原本是空占位 stub；现已基于 `envConfig` 还原为**真实可用的环境切换页**（列出 4 套环境、高亮当前、点击切换写入本地、可恢复默认、可返回个人中心）。入口：个人中心 → 调试页（`reLaunch`）。
4. **清理 `getCountInit` 死代码**：从 `app.js` 删除该 MTA 应用级统计初始化方法（从未被调用、host 均不匹配 envList），并移除随之变未使用的顶部 `mta_analysis` require。页面级 `Page.init()` 埋点不受影响。
5. **补齐导航栏标题**：全局 `window.navigationBarTitleText` 由占位符 `"WeChat"` 改为 `"对布管家"`；并为 15 个缺标题页面（如 `pages/index/index`→工作台、`pages/register/login/login`→登录、`pages/personal-center/personal-center`→个人中心 等）补齐各自的 `navigationBarTitleText`，确保所有页面均有合理标题。

> 这样调试页切换**真正生效**：在调试页选某环境 → 写入 `storage.key="envPage"` → 杀进程重启小程序 → `initEnv` 优先读取 → 切到目标环境。不污染发版（上线时 storage 为空，走默认 production）。

---

## 五、页面 / 分包完整性

- 主包 81 个页面 + 4 个分包页面，四件套（`.js/.json/.wxml/.wxss`）**齐备，0 缺失**。
- 已清除发布包 webpack 残留（`*.appservice.js` / `*.webview.js` 共 470 个 + `_compiled_wxapkg/`），其中 `packageB/chunk_23.appservice.js` 是提取时截断的 WXML 桩（会致整包构建失败），已随清理移除。
- `miniprogram_npm`（含 @vant）被源码引用，已保留。

---

## 六、上线 / 联调建议

- **上线生产**：确认 `envConfig.envPage` 为 `"production"`（默认即 production），且 `envConfig.envList.production.rootHost = https://shop.duibu.cn` 指向真实生产域名。
- **联调 / 测试**：用个人中心 → 调试页临时切到 `test` / `uat`，重启生效，不污染发版；用完点"恢复默认环境"。
- **上线前逐项核对**：`customsPhoneNum`（客服电话）、`globalData.mpVersion`（版本号）、MTA `appID` 是否需要更新（见第二、三节）。

---

## 七、运行前校验（已通过）

| 校验项 | 结果 |
|---|---|
| app.json 页面齐备（81 主包 + 4 分包） | 0 缺失 |
| 关键 JSON 合法（app.json / project.config.json / sitemap.json） | 全部 OK |
| 全量 .js 语法校验（303 个，排除 @babel/miniprogram_npm/node_modules） | 0 失败 |
| 静态 `require()` 路径解析（945 处） | 0 未解析（@babel runtime helpers 齐全） |

---

## 八、交付物

- `对布管家_小程序源码_去混淆.zip` —— 去混淆 + 清理 + 可直接运行的工程。
- 解压目录：`work_patch/mp_download/对布管家_小程序源码_去混淆/`
- 原始备份（未动）：`work_patch/mp_download/对布管家_小程序源码_原始备份/`
- 工具链：`work_patch/js_deobf/deobf.js` + `run_all.js`
- 说明文档：`README_还原说明.md`（去混淆方案）、本文档（配置梳理）
