var createClass = require("../../@babel/runtime/helpers/createClass"),
  classCallCheck = require("../../@babel/runtime/helpers/classCallCheck"),
  app = getApp(),
  request = require("./request.js").request,
  c = createClass(function t(c) {
    (classCallCheck(this, t),
      (this.summary = function (t) {
        return request.GET("".concat(app.config.bingxiHost, "/api/v1/erp/bi/sales/by-time"),
          t,
        );
      }),
      (this.orderList = function (t) {
        return request.POST(
          "".concat(app.config.bingxiHost, "/app-api/statistics/sale/billing/sourceList"),
          t,
        );
      }),
      (this.goodsListV2 = function (t) {
        // 功能 按日期读取色卡收发日明细清单
        // 调用方 packageA 数据中心的色卡明细页签
        // 入参 t 日期区间与分页条件，旧侧的分页口径 pageNum 与 pageSize 由网关适配层改名
        // 传给谁 本仓 color-cards 日统计 GET 口（route-snapshot.txt 第 337 行），
        //   与同文件的 chartData 同一读口，旧侧的 detailByDate 与 countByDate 两条腿本仓合并成一枚
        // 存什么 只带查询参数，HTTP 方法由 POST 改 GET
        // 存哪里 不写本地缓存
        return request.GET("".concat(app.config.bingxiHost, "/api/v1/erp/color-cards/statistics/daily"), t);
      }),
      (this.chartData = function (t) {
        return request.GET("".concat(app.config.bingxiHost, "/api/v1/erp/color-cards/statistics/daily"),
          t,
        );
      }),
      (this.customerChartData = function (t) {
        return request.GET("".concat(app.config.bingxiHost, "/api/v1/erp/page-view/stats/by-day"),
          t,
        );
      }),
      (this.accessListV2 = function (t) {
        // 功能 按日期读取页面访问明细清单
        // 调用方 packageA 数据中心的访问明细页签
        // 入参 t 日期区间与分页条件，旧侧的分页口径 pageNum 与 pageSize 由网关适配层改名
        // 传给谁 本仓 page-view 按日统计 GET 口（route-snapshot.txt 第 623 行），
        //   与同文件的 customerChartData 同一读口，旧侧的 detailByDate 与 countByDate 两条腿本仓合并成一枚
        // 存什么 只带查询参数，HTTP 方法由 POST 改 GET
        // 存哪里 不写本地缓存
        return request.GET("".concat(app.config.bingxiHost, "/api/v1/erp/page-view/stats/by-day"), t);
      }),
      (this.countTop5ByRelease = function (t) {
        return request.POST(
          "".concat(app.config.bingxiHost, "/app-api/statistics/countTop5ByRelease"),
          t,
        );
      }),
      (this.countClick = function (t) {
        return request.POST("".concat(app.config.bingxiHost, "/api/v1/erp/behavior"), t);
      }),
      (this.countTop5BySearch = function (t) {
        return request.POST(
          "".concat(app.config.bingxiHost, "/app-api/statistics/countTop5BySearch"),
          t,
        );
      }),
      (this.productList = function (t) {
        return request.GET("".concat(app.config.bingxiHost, "/api/v1/erp/bi/sales/by-product"),
          t,
        );
      }),
      (this.productDetail = function (t) {
        return request.GET("".concat(app.config.bingxiHost, "/api/v1/erp/bi/sales/by-product"),
          t,
        );
      }));
  });
module.exports = {
  ServicesDataCenter: new c(),
};
