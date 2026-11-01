var createClass = require("../../@babel/runtime/helpers/createClass"),
  classCallCheck = require("../../@babel/runtime/helpers/classCallCheck"),
  app = getApp(),
  request = require("./request.js").request,
  e = createClass(function o(e) {
    (classCallCheck(this, o),
      (this.demandList = function (o) {
        return request.GET("".concat(app.config.bingxiHost, "/app-api/goods/ask/askList"), o);
      }),
      (this.getCategory = function (o) {
        return request.GET(
          "".concat(app.config.bingxiHost, "/app-api/goods/ask/shopCategoryList"),
          o,
        );
      }),
      (this.getNotice = function () {
        return request.GET("".concat(app.config.bingxiHost, "/app-api/user/invite/notice"));
      }),
      (this.getCategory = function (o) {
        return request.GET(
          "".concat(app.config.bingxiHost, "/app-api/goods/ask/shopCategoryList"),
          o,
        );
      }),
      (this.addAskListLog = function (o) {
        // 功能 上报需求广场列表浏览埋点
        // 调用方 pages/demand-square/demand-square.js 的 _consoleTheInfo（响应不落数据，失败由传输层外显）
        // 入参 o 旧载荷 {askIds, stayTime}
        // 传给谁 本仓行为埋点写口 POST /api/v1/erp/behavior（route-snapshot.txt 第 1077 行
        //   record_behavior，backend/src/handlers/tracking_handler.rs 的 BehaviorRequest），
        //   旧载荷整体放进 event_data 键，event_type 取稳定事件名 addAskListLog
        // 存什么 不落本地；旧 ask 日志表与本仓 behavior 表的读侧词表不存在，形态差异登记交付报告
        // 存哪里 服务端行为分析域（analytics），经 request.js 与 apiGateway 契约层发出
        return request.POST("".concat(app.config.bingxiHost, "/api/v1/erp/behavior"), {
          event_type: "addAskListLog",
          event_data: o,
        });
      }),
      (this.addSquareTabLog = function (o) {
        // 功能 上报需求广场页签停留埋点，本仓写口只认 POST 请求体
        // 调用方 pages/demand-square/demand-square.js 的 demandInCount（不落消费响应）
        // 入参 o 旧载荷 {stayTime}
        // 传给谁 本仓行为埋点写口 POST /api/v1/erp/behavior（快照第 1077 行，BehaviorRequest）
        // 存什么 不落本地；event_type 取稳定事件名 addSquareTabLog，旧载荷放进 event_data
        // 存哪里 服务端行为分析域（analytics）
        return request.POST("".concat(app.config.bingxiHost, "/api/v1/erp/behavior"), {
          event_type: "addSquareTabLog",
          event_data: o,
        });
      }),
      (this.addSquareSubTabLog = function (o) {
        // 功能 上报需求广场子页签停留埋点
        // 调用方 pages/demand-square/demand-square.js 的 demandTabCount（不落消费响应）
        // 入参 o 旧载荷 {stayTime, accessType}
        // 传给谁 本仓行为埋点写口 POST /api/v1/erp/behavior（快照第 1077 行，BehaviorRequest）
        // 存什么 不落本地；event_type 取稳定事件名 addSquareSubTabLog，旧载荷放进 event_data
        // 存哪里 服务端行为分析域（analytics）
        return request.POST("".concat(app.config.bingxiHost, "/api/v1/erp/behavior"), {
          event_type: "addSquareSubTabLog",
          event_data: o,
        });
      }),
      (this.holidayNotice = function (o) {
        return request.GET("".concat(app.config.bingxiHost, "/app-api/goods/ask/holidayNotice"), o);
      }));
  });
module.exports = {
  ServicesDemand: new e(),
};
