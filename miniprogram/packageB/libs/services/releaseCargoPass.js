var createClass = require("../../../@babel/runtime/helpers/createClass"),
  classCallCheck = require("../../../@babel/runtime/helpers/classCallCheck"),
  app = getApp(),
  request = require("./request.js").request,
  r = createClass(function t(r) {
    (classCallCheck(this, t),
      (this.releaseCargoPassList = function (t) {
        return request.POST("".concat(app.config.bingxiHost, "/app-api/releaseCargoPass/list"), t);
      }),
      (this.notPlatformList = function (t) {
        return request.POST(
          "".concat(app.config.bingxiHost, "/app-api/releaseCargoPass/notPlatformList"),
          t,
        );
      }),
      (this.releaseCargoPassAdd = function (t) {
        return request.POST("".concat(app.config.bingxiHost, "/app-api/releaseCargoPass/add"), t);
      }),
      (this.releaseCargoPassSuspend = function (t) {
        return request.POST("".concat(app.config.bingxiHost, "/app-api/releaseCargoPass/suspend"), t);
      }),
      (this.releaseCargoPassRestart = function (t) {
        return request.POST("".concat(app.config.bingxiHost, "/app-api/releaseCargoPass/restart"), t);
      }),
      (this.releaseCargoPassRevoke = function (t) {
        return request.POST("".concat(app.config.bingxiHost, "/app-api/releaseCargoPass/revoke"), t);
      }),
      (this.releaseRestockList = function (t) {
        return request.POST(
          "".concat(app.config.bingxiHost, "/app-api/purchasing/platform/purchasing/pageList"),
          t,
        );
      }),
      (this.getRestockProduct = function (t, o, r) {
        return request.GET(
          ""
            .concat(app.config.bingxiHost, "/app-api/purchasing/product/detail/")
            .concat(t, "/")
            .concat(o, "/")
            .concat(r),
        );
      }),
      (this.getRestockCompany = function (t, o) {
        return request.POST(
          "".concat(app.config.bingxiHost, "/app-api/purchasing/company/detail/").concat(o),
          t,
        );
      }),
      (this.getHistoryKeyword = function () {
        return request.GET("".concat(app.config.bingxiHost, "/app-api/purchasing/searchHistory"));
      }),
      (this.clearHistoryKeyword = function () {
        return request.POST("".concat(app.config.bingxiHost, "/app-api/purchasing/clearHistory"));
      }),
      (this.saveStayTime = function (t) {
        return request.PUT(
          ""
            .concat(app.config.bingxiHost, "/app-api/purchasing/search/updateStayTime/")
            .concat(t.searchNo, "/")
            .concat(t.stayTime),
        );
      }),
      (this.getShopProuductList = function (t) {
        return request.GET(
          "".concat(app.config.bingxiHost, "/app-api/purchasing/shop/classifyList/").concat(t),
          {
            terminalSource: 1,
          },
        );
      }),
      (this.getProductList = function (t) {
        return request.POST("".concat(app.config.bingxiHost, "/app-api/purchasing/shop/pageList"), t);
      }),
      (this.getProductInfo = function (t, o) {
        return request.GET("".concat(app.config.bingxiHost, "/api/v1/erp/products/", t, "/", o),
          {},
          {
            headers: {
              "Content-Type": "application/json",
            },
          },
        );
      }));
  });
module.exports = {
  servicesCargoPass: new r(),
};
