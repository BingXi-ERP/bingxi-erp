var createClass = require("../../@babel/runtime/helpers/createClass"),
  classCallCheck = require("../../@babel/runtime/helpers/classCallCheck"),
  app = getApp(),
  request = require("./request.js").request,
  a = createClass(function e(a) {
    (classCallCheck(this, e),
      (this.comboList = function (e) {
        return request.GET("".concat(app.config.bingxiHost, "/app-api/pay/package/list"), e);
      }),
      (this.comboCreate = function (e) {
        return request.POST("".concat(app.config.bingxiHost, "/app-api/pay/membership/create"), e);
      }),
      (this.payResult = function (e) {
        return request.GET(
          "".concat(app.config.bingxiHost, "/app-api/pay/membership/payResult/").concat(e),
        );
      }));
  });
module.exports = {
  Combo: new a(),
};
