# D-66 改判：四张缺失页所在的需求域在本仓没有后端（2026-11-10）

原登记把 D-66 定为"缺四张页面，建出来即可清死链"。本轮取证后改判：这不是缺页，
是整域后端不在本仓，建页会造出假可供性。证据如下，全部只读实测。

## 一 四页的落点与调用点（原登记不变）

死链基线 scripts/ci/miniprogram-route-baseline.txt 现有 10 键（11 处调用点去重），
四个落点都在 packageA 分包下：
- /packageA/pages/demand/demand-detail/offer-info/offer-info（调用点字面量误拼 offer-onfo）
- /packageA/pages/demand/demand-detail/post-demand/post-demand
- /packageA/pages/demand/demand-order/demand-order-detail/index
- /packageA/pages/demand/my-demand/my-post-result-choose/my-post-result-choose

app.json 实测：主包 55 页，四个分包（packageA 31 页其中 demand 族 12 页、packageB 101 页、
packageC 3 页、packageDebug 1 页）。四个落点两口径（页面文件与 app.json 声明）全为零，原登记成立。

## 二 决定性新证据：该域后端不在本仓

1. 服务层实际打的 URL：miniprogram/libs/services/servicesDemand.js 里的字面量是
   /app-api/goods/ask/askList、/app-api/goods/ask/holidayNotice、
   /app-api/goods/ask/shopCategoryList、/app-api/user/invite/notice，
   只有 /api/v1/erp/behavior 一条是本仓路径。
2. 后端路由面零命中：在 backend/src/routes/ 全目录按 ask、inquiry、inquiries、offer、
   offers、demand、demands、goods/ask 大小写不敏感搜索，零命中。即需求广场、发布需求、
   报价、选择报价、需求订单这一整族在本仓没有任何端点。
3. 命名不可信：packageA/services/services-demand.js 这个文件名带 demand，里面装的却是
   /api/v1/erp/ar-reconciliations、/api/v1/erp/ar/payments、/api/v1/erp/sales/sales-returns
   与一批 /app-api/customer/two/reconciliation/* 对账端点。取档树的文件名不能当域归属依据。
4. 仓库自己的契约文档已给出既定口径：miniprogram/README_接口契约对照与实现规格.md
   第〇节 v3 直替版明写"未映射的 275 个旧路径统一直通 bingxiHost（旧后端彻底下线），
   仓库没有的接口就是 404，不做任何回退/模拟"。需求域正属未映射那一类。

## 三 为什么不能按原方向建页

四页若建出来，其数据腿只能打 /app-api/goods/ask/*，按 v3 口径直通后是 404。
页面存在、按钮可点、请求必失败，这正是本轮刚在 D-65 修掉的那一类假可供性
（前端把不可用能力摆成可用）。给 404 的域建四张页面等于把缺陷从"跳转失败"
换成"页面内请求失败"，没有消除缺陷，只是换了个失败位置，还会让路由门假绿。

## 四 两个合法方向（待裁，推荐甲）

甲（推荐）：撤入口。把 11 处指向这四页的跳转调用点连同其触发按钮一并撤掉，
基线条目随调用点消失而删除，路由门转绿。依据是 v3 契约"旧后端彻底下线、不做回退模拟"，
UI 不应提供进入不存在能力的入口。代价是需求域在小程序侧暂时不可达，
但这与后端现状一致，不是新增功能缺失。offer-onfo 的拼写错误随调用点撤掉一并消失，
不必单独修拼写（修好拼写仍指向不存在的页）。

乙：补域。把需求域（需求广场、发布需求、报价与选择报价、需求订单）作为新功能域
在后端建端点与表，再建四页接通。这是产品范围扩张，工作量与 BOM 下线同级，
需要单独立项与排期，不能作为清死链的顺手改动。

未拍之前不动代码：不建假页、不撤入口、不改基线、不放宽门。

## 五 本轮执行记录

派出的研发专家实例因额度上限在 0 次工具调用时被杀，车道 wt-mp-land 未被触碰
（head 仍 9771a888b，dirty=0），无残留需收编。本文所有结论来自主智能体只读取证。
