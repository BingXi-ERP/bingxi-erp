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
        return request.POST(
          "".concat(app.config.bingxiHost, "/app-api/statistics/colorcardreceive/detailByDate"),
          t,
        );
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
        return request.POST(
          "".concat(app.config.bingxiHost, "/app-api/statistics/accessanalysis/detailByDate"),
          t,
        );
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
