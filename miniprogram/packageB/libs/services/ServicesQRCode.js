var createClass = require("../../../@babel/runtime/helpers/createClass"),
  classCallCheck = require("../../../@babel/runtime/helpers/classCallCheck"),
  app = getApp(),
  request = require("./request.js").request,
  r = createClass(function e(r) {
    (classCallCheck(this, e),
      (this.moneyCode = function (e) {
        return request.POST("".concat(app.config.bingxiHost, "/app-api/setting/paymentCode/view"), e);
      }),
      (this.updateMoneyCode = function (e) {
        return request._POST("".concat(app.config.bingxiHost, "/app-api/setting/paymentCode/add"), e);
      }),
      (this.delMoneyCode = function (e) {
        return request.GET(
          "".concat(app.config.bingxiHost, "/app-api/setting/paymentCode/del/").concat(e),
        );
      }));
  });
module.exports = {
  ServicesQRCode: new r(),
};
