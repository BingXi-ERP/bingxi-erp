(Object.defineProperty(exports, "__esModule", {
  value: !0,
}),
  (exports.default = void 0));
var createClass = require("../../@babel/runtime/helpers/createClass"),
  classCallCheck = require("../../@babel/runtime/helpers/classCallCheck"),
  app = getApp(),
  request = require("./request.js").request,
  n = createClass(function e(n) {
    (classCallCheck(this, e),
      (this.orderSave = function (e) {
        return request.POST("".concat(app.config.bingxiHost, "/app-api/goods/ask/order/save"), e, {
          headers: {
            "content-type": "application/json",
          },
        });
      }),
      (this.orderCreat = function (e) {
        return request.POST("".concat(app.config.bingxiHost, "/app-api/order/askOrder/create"), e, {
          headers: {
            "content-type": "application/json",
          },
        });
      }),
      (this.orderList = function (e) {
        return request.GET("".concat(app.config.bingxiHost, "/app-api/order/askOrder/list"), e);
      }),
      (this.orderDetail = function (e) {
        return request.GET("".concat(app.config.bingxiHost, "/app-api/order/askOrder/detail"), e);
      }),
      (this.wxPay = function (e) {
        return request.GET("".concat(app.config.bingxiHost, "/app-api/order/askOrder/wxPay"), e);
      }),
      (this.expressAmount = function (e) {
        return request.GET(
          "".concat(app.config.bingxiHost, "/app-api/order/askOrder/expressAmount"),
          e,
        );
      }),
      (this.cancelOrder = function (e) {
        return request.POST("".concat(app.config.bingxiHost, "//app-api/order/askOrder/cancel"), e);
      }),
      (this.paymentList = function (e) {
        return request.GET(
          "".concat(app.config.bingxiHost, "/app-api/order/sale/billing/paymentList/").concat(e),
          {},
          {
            headers: {
              "content-type": "application/json",
            },
          },
        );
      }));
  });
exports.default = new n();
