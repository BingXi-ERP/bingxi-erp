# 移动端与微信小程序存量分支落地方案（2026-11-09）

本文件是排期依据，不是变更流水账。所有事实以 origin/main 与四条远端分支的实量为参照面，
本地工作树落后远端二十四笔，凡零命中结论均已按主线红取证文档结论十的判据复核。

## 一 为什么要落地这四条分支

当前目标明确要求小程序代码纳入统一管控、小程序打包与依赖与语法与包大小校验纳入 CI 门禁、
E2E 覆盖 PC 与 H5 与微信小程序三端、以及移动端专项优化。而主干实量为：

- 小程序工程标志文件零命中（project.config.json 与 sitemap.json 与 app.wxss 与 pages.json 全无）。
  frontend/public/manifest.json 是 PWA 清单，不是小程序工程。
- wx.request 与 wx.login 与 code2session 与 subscribeMessage 与 miniprogram 与 weapp 六个关键词
  在主干只命中三处，分别是 .github/actions/vuln-scan/action.yml 第 281 行的 semgrep 排除项、
  .gitleaks.toml 第 27 与 28 行的豁免、以及 .monkeycode/docs/e2e-master-plan-2026-11-02.md 的计划记述。
  没有任何一处是小程序源码。
- .github/workflows 全目录搜小程序与 miniprogram 与 weapp 零命中，即 CI 无小程序作业。
- mobile-app 目录一层只有 android 与 dist 与 scripts 与 src-tauri，是 Tauri 桌面壳加安卓壳，不是小程序。
- scripts/ci 在册十三枚文件里没有 miniprogram-checks.sh，但 .gitleaks.toml 第 28 行仍在豁免它，
  属指向不存在文件的悬空豁免。

结论：目标要求的小程序端在主干属乙类缺功能，补测试也测不出来。但能力并非要从零建，
它已存在于四条未开 PR 的远端分支上。11-02 的主计划文档第 57 与 152 行记着当时裁定"维持不推"，
该裁定已被当前目标取代（目标明确要求纳入管控），故本轮改为落地。

## 二 四条分支的实量承载面

远端现态用 git ls-remote 取，不用本地分支指针。

### feat/miniprogram-adapt（736e112bf08405253fae1c12c7387b03307308fe）

相对主干 32 ahead 与 31 behind，改动 1336 枚文件。按顶层目录归类计数为
packageB 468、pages 226、miniprogram_npm 219、packageA 153、components 91、assets 79、
libs 35、@babel 23、packageC 14、utils 8、packageDebug 4、scripts/ci 3。

其中 miniprogram_npm 的 219 枚与 @babel 的 23 枚共 242 枚是微信"构建 npm"的产物，不是源码。
其余约 1074 枚是真实小程序源码与图标资产。另带 .github/workflows/miniprogram-checks.yml
与 .gitignore 改动。已有一份接口契约对照与实现规格文档、一份还原说明、一份配置梳理在 miniprogram 根。

### feat/wechat-mp-notification-leg（9f009f6aca5121fa4a17cd817b2a104f72d976e9）

相对主干 24 ahead 与 4 behind，改动 8 枚文件，全是后端：
backend/.env.example、migration/src/domain/mod.rs、
migration/src/domain/wechat_mp_binding/m0128_bind_wechat_openid.rs 与同目录 mod.rs、
migration/src/lib.rs、src/config/settings.rs、src/services/mod.rs、src/services/wechat_mp_service.rs。
这是小程序微信授权登录与订阅消息推送的后端腿。

### feat/mobile-adaptive-ui（da2c2c847192db0a349a8c8add07262084a4fe0c）

相对主干 115 ahead 与 3 behind，改动 42 枚文件，是 H5 与移动端自适应源码面：
BarcodeScannerDialog.vue、bluetooth-print.ts、android-permissions.ts、mobile-content.css、
config/navigation.ts、router/index.ts、双语 locales、utils/print.ts、types/tauri.d.ts、
views/business-trace/index.vue、main.ts，另带两枚 e2e（46-page-health-patrol 与 87-mobile-content-and-dedup）。

### test/e2e-mobile-form-layout（12e9fe3f2fea5f63af15d4e58ac42785879ced57）

相对主干 24 ahead 与 3 behind，改动 2 枚文件，纯测试面：
frontend/e2e/flow/131-mobile-form-layout.spec.ts 与 132-mobile-numeric-input.spec.ts。
对应目标五的数字键盘与表单布局两条。

## 三 两处硬阻塞，落地前必须先解

### 阻塞一 微信腿迁移号撞面

微信腿带 m0128_bind_wechat_openid.rs，而主干已有
backend/migration/src/domain/piece_length_scale_widen/m0128_widen_inventory_piece_length_scale.rs。
同号不同域，直接落地会撞号。

占用面实量：主干最大到 m0128；六支在途载体新增号分别为 1182 的 m0126、
1183 的 m0129 与 m0134、1184 的 m0131 与 m0132 与 m0133，1188 与 1168 与 1186 无新增迁移。
故已占集合为 m0126 到 m0129 加 m0131 到 m0134。

改派裁定：微信腿的 m0128 改为 m0135，高于全部已占号，且不与任何在途载体争用。
改号要同时改文件名、mod.rs 里的模块名与引用、migration/src/lib.rs 的注册项，三处一致。
落地前须重扫一次占用面，因为并行执行体可能在此期间改号。

### 阻塞二 小程序分支混入构建产物

242 枚 miniprogram_npm 与 @babel 产物已被跟踪进该分支。主计划文档第 57 行早已点名
"纳入时须与构建 npm 同支，禁先排产物"。落地时必须把这 242 枚从跟踪面移除并加进 .gitignore，
只保留约 1074 枚源码与资产。移除产物属改动面收窄，不是删功能，须在 PR 正文里逐类点名计数。

## 四 域划分与落地次序

按一个功能域只开一支的纪律，四条分支合成两支 PR，不是四支：

- 微信小程序域一支：feat/miniprogram-adapt 的小程序树与七道静态门，
  加 feat/wechat-mp-notification-leg 的后端授权与订阅消息腿。两者是同一条链路的前后端，
  分支单独落地任一半都跑不通（小程序登录要 openid 绑定，订阅消息要后端服务）。
- 移动端 H5 自适应域一支：feat/mobile-adaptive-ui 的 42 枚源码，
  加 test/e2e-mobile-form-layout 的 131 与 132 两枚 e2e。按 11-06 裁定后端前端 e2e 同支，
  不再按旧"测试面单独 PR"口径拆成两支。

次序受名额与队列约束。当前六支开放 PR 已满，且 1188 与 1168 正在跑全量面，
四支继承红载体待 1188 合入后串行并基重推。此时再开新支会把队列堵住
（已有六支并行重推致三十分钟面冻结的实证）。故落地排在：

1. 1188 全量面绿，由用户在 UI 合入。
2. 按甲案先并基 1168（458 须合两侧修法），再串行并基 1182 与 1183 与 1184 与 1186，每支等各自全量面绿。
3. 名额释放后开微信小程序域一支，先解两处阻塞再推。
4. 随后开移动端 H5 自适应域一支。

## 五 落地后要验的面

- 小程序七道静态门真跑并出结论，不能只挂工作流名。门体在 scripts/ci/miniprogram-checks.sh，
  落地后 .gitleaks.toml 第 28 行的悬空豁免才指向真实文件。
- 新增作业若挂进 ci-cd.yml，必须同时加进 ci-cleanup-retry 的 needs 列（该列现列全二十七个 job）。
  若走独立 miniprogram-checks.yml 工作流则不涉及该 needs，但要确认分支规则集零必需检查下它仍会跑。
- 小程序端 E2E 覆盖目标三列的八条独有链路：授权登录、订阅消息、询样提交、单据查看、
  分享、扫码、图片预览、客户自助对账确认。当前审计判这八条在主干全属乙类，落地后须逐条转甲类并补判据。
- 移动端 H5 面落地后，131 与 132 两枚 e2e 要真跑，且 46 与 87 两枚既有 e2e 不得因导航与路由改动而回归。
- 三端权限与脱敏对齐：小程序客户侧不得见到成本与他客户数据，判据要与 PC 端同源。

## 六 与本轮审计制品的关系

只读审计实例的全文在仓库外 E:/tmp/coverage-gap-audit-1109.md（224 行，六簇）。
它判"小程序整体无承载"对主干成立，但未查远端分支，故漏了"能力已在四条分支上"这一层。
本文件第二节补上该层，两者合并才是完整排期依据。审计另更正三处旧口径
（蓝牙打印已接通、customers 导入已真通而空转方为 inventory、通知已有 WebSocket 通道），
这三条在采信前仍须按两种互不依赖口径复核。

## 七 残量复核更正第二节的判定，自适应分支不是干净增量

第二节把 feat/mobile-adaptive-ui 记为"42 枚源码面增量"，本轮按 blob 与行内容集合复核后更正。
该支相对主干的 42 枚改动分布是 5 枚 A、1 枚 D、36 枚 M，merge-base 为 0a95c915c，主干顶点 6a0ca600e。

五枚 A 全部是两侧独立新增（merge-base 时都不在册），逐枚比对结果为：
tauri.d.ts 与 android-permissions.ts 两枚逐字节相同，即主干已完整承载；
87-mobile-content-and-dedup.spec.ts 主干 675 行对分支 298 行，分支独有 74 行而主干独有 423 行；
mobile-content.css 主干 216 行对分支 195 行，分支独有 2 行而主干独有 20 行；
bluetooth-print.ts 主干 517 行对分支 373 行，分支独有 14 行而主干独有 145 行。
三十六枚 M 全部（36 比 36）在 merge-base 之后被主干改过，即该支的修改都基于陈旧 base。

结论：该支是陈旧的并行迭代，主干已在同一域走得更远，整支合入会把三枚文件回退掉共 588 行主干内容。
真实残量只有三枚文件里的 90 行分支独有内容（74 加 2 加 14），且这 90 行是否已被主干以别的写法覆盖还需逐行判。
故该支不按"落地整支"处理，改为逐行残量审查后只移植确属缺失的部分。

那 1 枚 D 是 frontend/src/views/periods/index.vue。复核发现主干也不在册该文件，
即两侧共同删除，不是该支删掉主干仍在的页面，不构成回归。本轮曾误判为回归，此处更正。

真正干净的增量在 test/e2e-mobile-form-layout：131-mobile-form-layout.spec.ts 与
132-mobile-numeric-input.spec.ts 两枚都是 A 且主干确认不在册，无撞面无陈旧 base，可直接收编。

小程序分支的门面抽查结果是干净的：miniprogram-checks.yml、scripts/ci/miniprogram-checks.sh、
mp-check-pages.cjs、mp-endpoint-check.cjs 四枚都是 A，.gitignore 是 M，无 add/add 撞面。
故第三节的两处阻塞（242 枚产物与 m0128 撞号）仍是该域仅有的阻塞，判定不变。

更正后的域划分与次序：
- 微信小程序域一支（任务 85）不变，承载小程序树与四枚门面加微信后端腿，先解产物与撞号。
- 移动端域（任务 86）改性质：不再整支合入 feat/mobile-adaptive-ui。
  先收编 131 与 132 两枚干净增量 e2e，再对该自适应支做逐行残量审查，
  只移植主干确缺的内容，审查结论若是残量为零则关支不删分支并留实证评论。
  这样避免用陈旧版本回退主干已走远的 588 行。
## 第八节 小程序 CI 门禁的落地口径（11-09 15:15 UTC 主干实量后补）

主干 .github/workflows/ci-cd.yml 实测只有两枚与本域相关的既有件：feature-completeness-check 在第 4034 行，其"新增功能必须配套 e2e 用例"的判定靠第 4064 行一份手工维护的 declared 映射表；第 30 行明文写着任何新增 job 必须同时加入 ci-cleanup-retry.needs，否则不参与门禁。全文件 grep 不到任何 miniprogram 或小程序 job，因此目标里"小程序打包、依赖、语法、包大小校验纳入 CI 门禁"目前在主干侧零承载，不是"接了没跑"。

落地口径四条，随本域同一支 PR 进去，不分叉另开支。

1. 依赖面：只在小程序目录内跑 npm ci，锁文件缺失即判红不静默装最新；不许复用前端 workspace 的 node_modules。
2. 语法面：对 app.json、各页面 json 与 wxml 与 wxss 与 js 做解析型检查（JSON.parse 与 node --check），解析失败按文件点名报错，不允许只报总数。
3. 打包面：调用官方 CLI 的非交互构建产出一个可核对的产物路径与字节数，构建失败即判红；产物只作校验用，不上传、不提审、不入仓。
4. 包大小面：主包与分包各自设上限并在日志里打出实测值与上限，超限判红。上限取行业口径：主包 2MB，单包与总包按微信当前规则，具体数值在 job 里显式写成变量而不埋在脚本常量，便于后续随规则调整。

接入纪律（沿用本仓新静态门的三件套，缺一条会把每条在途支挂红）：

1. 默认只报告，不硬拦；把首轮实测基线落进仓库，之后只在"新增违例"时判红。小程序树刚落地时必然带存量问题，直接硬拦等于给所有在途支加红。
2. 工具自身故障（CLI 取不到、网络失败、依赖装不上）归 unverified，不判红也不判绿，并在日志打显式哨兵行。
3. 该 job 必须同时登记进 ci-cleanup-retry.needs，否则收尾聚合看不见它，等于没接门禁；改 needs 后要以下一轮实跑输出的格数为准复核，不按声明数采信。
4. declared 那份手工映射表与本域新增的 e2e 用例之间存在反向耦合：新增页面而 declared 不更新，配对门就只会报"未声明"而不是"缺用例"。本域落地时必须同时把新面补进 declared，并在同一笔提交里补配套用例，否则按用户口径禁止合并。
