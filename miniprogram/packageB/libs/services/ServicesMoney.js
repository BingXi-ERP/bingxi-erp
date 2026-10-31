var createClass = require("../../../@babel/runtime/helpers/createClass"),
  classCallCheck = require("../../../@babel/runtime/helpers/classCallCheck"),
  app = getApp(),
  request = require("./request.js").request,
  c = createClass(function e(c) {
    (classCallCheck(this, e),
      (this.myMoneyInfo = function (e) {
        return request.GET(
          "".concat(app.config.bingxiHost, "/app-api/pay/wallet/account/myWalletAccountMsg"),
          e,
        );
      }),
      (this.awardRecord = function (e) {
        return request.GET(
          "".concat(app.config.bingxiHost, "/app-api/pay/wallet/account/getRewardList"),
          e,
        );
      }),
      (this.getMoneyRecord = function (e) {
        return request.GET(
          "".concat(app.config.bingxiHost, "/app-api/pay/wallet/account/getReceiptList"),
          e,
        );
      }),
      (this.getMoney = function (e) {
        return request._POST(
          "".concat(app.config.bingxiHost, "/app-api/pay/wallet/account/addUserReceipt"),
          e,
        );
      }));
  });
module.exports = {
  ServicesMoney: new c(),
};
