var createClass = require("../../../@babel/runtime/helpers/createClass"),
  classCallCheck = require("../../../@babel/runtime/helpers/classCallCheck"),
  app = getApp(),
  request = require("./request.js").request,
  c = createClass(function t(c) {
    (classCallCheck(this, t),
      (this.getRecord = function (t) {
        return request.POST("".concat(app.config.bingxiHost, "/app-api/cloth/search/list"), t);
      }),
      (this.getResult = function (t) {
        return request.POST("".concat(app.config.bingxiHost, "/app-api/cloth/search/result"), t);
      }),
      (this.getFilterResult = function (t) {
        return request.POST(
          "".concat(app.config.bingxiHost, "/app-api/cloth/search/searchFilter"),
          t,
        );
      }),
      (this.getPlatFilterResult = function (t) {
        return request.POST(
          "".concat(app.config.bingxiHost, "/app-api/cloth/search/searchFilterPlatform"),
          t,
        );
      }),
      (this.getPlatFamily = function (t) {
        return request.POST(
          "".concat(app.config.bingxiHost, "/app-api/cloth/search/viewPlatformFamily"),
          t,
        );
      }),
      (this.getFilterParam = function (t) {
        return request.GET("".concat(app.config.bingxiHost, "/app-api/product/searchParams"), t);
      }),
      (this.getSupplierMsg = function (t) {
        return request.GET(
          ""
            .concat(app.config.bingxiHost, "/app-api/cloth/search/queryZtSupplierBySpuNumber/")
            .concat(t.searchId, "/")
            .concat(t.uuid, "/")
            .concat(t.spuNumber),
        );
      }),
      (this.getPlatFilterParam = function (t) {
        return request.POST(
          "".concat(app.config.bingxiHost, "/app-api/cloth/search/searchParams"),
          t,
        );
      }),
      (this.getSimilarityResult = function (t) {
        return request.POST(
          "".concat(app.config.bingxiHost, "/app-api/cloth/search/viewSimilarity"),
          t,
        );
      }),
      (this.getDuiBuDetail = function (t) {
        return request.GET(
          "".concat(app.config.bingxiHost, "/app-api/product/getDuibuProductDetail/").concat(t),
        );
      }),
      (this.getColorChartPicture = function (t) {
        return request.GET("".concat(app.config.bingxiHost, "/api/v1/erp/color-cards"), t);
      }));
  });
module.exports = {
  ServicesSearch: new c(),
};
