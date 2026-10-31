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
        return request._POST(
          "".concat(app.config.bingxiHost, "/app-api/access/log/ask/addAskListLog"),
          o,
        );
      }),
      (this.addSquareTabLog = function (o) {
        return request.GET(
          "".concat(app.config.bingxiHost, "/app-api/access/log/ask/addSquareTabLog"),
          o,
        );
      }),
      (this.addSquareSubTabLog = function (o) {
        return request.GET(
          "".concat(app.config.bingxiHost, "/app-api/access/log/ask/addSquareSubTabLog"),
          o,
        );
      }),
      (this.holidayNotice = function (o) {
        return request.GET("".concat(app.config.bingxiHost, "/app-api/goods/ask/holidayNotice"), o);
      }));
  });
module.exports = {
  ServicesDemand: new e(),
};
