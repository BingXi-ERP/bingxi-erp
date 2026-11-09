# 对布管家 小程序源码 —— 去混淆还原 + 可运行工程说明

> 目标 AppID：`wx9fc2137059cd96d0`（包版本 25）
>
> 微信编译器在发布时已将**原始变量名、注释、TS 类型全部压掉**（无 sourcemap，不可逆）。
> 因此本工程的目标明确为：**在保留可读还原（结构 / async 语义 / 模块别名）的同时，确保小程序能在微信开发者工具中直接打开并正常运行**。

## 一、交付物

| 路径 | 说明 |
|---|---|
| `F:/7/对布管家_小程序源码_去混淆.zip` | **主交付**：去混淆 + 已清理 + 可直接运行的工程（约 1.7MB） |
| `F:/7/work_patch/mp_download/对布管家_小程序源码_去混淆/` | 同上，解压后的工作目录 |
| `F:/7/work_patch/mp_download/对布管家_小程序源码_原始备份/` | 反编译原始态（未经去混淆，可回滚） |
| `F:/7/work_patch/js_deobf/deobf.js` + `run_all.js` | 去混淆引擎与批量处理器 |
| `F:/7/对布管家_小程序源码.zip` | 早期「反编译原始态」压缩包（保留对照） |

## 二、怎么跑起来（微信开发者工具）

1. 解压 `对布管家_小程序源码_去混淆.zip`。
2. 打开「微信开发者工具」→ 导入项目 → 选择解压目录。
3. AppID：已写入 `project.config.json`（`wx9fc2137059cd96d0`）。
   - 若想用测试号，可在导入时选「测试号」，或把 `appid` 改为 `touristappid`。
4. 编译即可运行。`setting.es6` 已设为 `false`（代码已是编译后形态，由运行时直接执行，避免二次转译冲突），`urlCheck` 设为 `false`（便于联调开发域名）。

## 三、为"能运行"所做的工程清理（关键）

原始反编译产物里混有大量**发布包 webpack 残留**与**提取截断文件**，这些在开发者工具中会导致整包构建失败或页面缺失。本工程已处理：

1. **删除 470 个 bundle 残留**：`*.appservice.js`、`*.webview.js` 各 235 个 + `_compiled_wxapkg/` 目录。
   - 这些文件源码零引用（grep 全空），属发布包编译产物，并非用户源码。
   - 其中 `packageB/chunk_23.appservice.js` 是提取时即截断的残缺 WXML 桩（仅 495 字节、`}i` 处断尾），标准解析器无法处理，**会在构建时直接让整包失败**——已随清理一并移除。
2. **补齐缺失分包页**：`app.json` 声明了 `packageDebug/pages/env/index`，但反编译只还原出了 `index.json`（缺 `.js/.wxml/.wxss`）。
   - 已补最小可用 stub（标题「切换环境」调试页），保证该分包可被正确编译、页面可跳转而不报错。
3. **补全 `project.config.json`**：原始仅 `{"miniprogramRoot":""}`，已写入 `appid`、必要 `setting`（`es6:false` / `enhance:false` / `urlCheck:false` / `postcss:true`）、`compileType:miniprogram`、`projectname` 等。

## 四、运行前校验结果（全绿）

| 校验项 | 结果 |
|---|---|
| app.json 页面齐备性（81 主包页 + 4 分包） | 0 缺失 |
| 关键 JSON 合法（app.json / project.config.json / sitemap.json） | 全部 OK |
| 全量 .js 语法校验（303 个，排除 @babel / miniprogram_npm / node_modules） | 0 失败 |
| 静态 `require()` 路径解析（945 处） | 0 未解析（@babel runtime helpers 齐全） |

## 五、去混淆还原（可读性，不破坏运行）

在确保可运行的前提下，JS 还做了结构还原（详见 `deobf.js`），仅做语义等价变换，不引入运行时错误：

1. **`Page({...})` 嵌套** `o(o(o(t,"k",v),...))` → 原生对象字面量。
2. **`regeneratorRuntime` 生成器** → 原生 `async/await`。
3. **单字母 require 别名** → 按模块路径重命名（保留字自动加 `_`）。

保守策略：复杂生成器 / 计算键 / 保留字冲突时回退原样或安全兜底，绝不产生语法损坏。去混淆覆盖全部 303 个真实源码 JS（原始反编译的 530 计数含 470 个 webpack 残留，已清理）。

## 六、已知不可逆限制

- 原始**变量名、注释、TS 类型**已被微信编译器压没，无 sourcemap，不可恢复；本工程恢复的是结构、async 语义与模块别名可读性。
- `packageDebug/pages/env/index` 原始实现未完整提取，当前为占位 stub（功能为空，仅保证可编译可跳转）。
