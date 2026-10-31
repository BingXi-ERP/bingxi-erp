var request = require("./request.js").request,
  app = getApp();
module.exports = {
  getPrintInfo: function () {
    var t = arguments.length > 0 && void 0 !== arguments[0] ? arguments[0] : {};
    return request.GET(
      "".concat(app.config.bingxiHost, "/app-api/order/print/info/").concat(t.billingId),
      t,
      {
        headers: {
          "Content-Type": "application/json",
        },
      },
    );
  },
  printOrder: function () {
    var t = arguments.length > 0 && void 0 !== arguments[0] ? arguments[0] : "",
      r = arguments.length > 1 && void 0 !== arguments[1] ? arguments[1] : {};
    return request.POST("".concat(app.config.bingxiHost, "/app-api/order/print/").concat(t), r, {
      headers: {
        "Content-Type": "application/json",
      },
    });
  },
  getRefundInfo: function () {
    var t = arguments.length > 0 && void 0 !== arguments[0] ? arguments[0] : {};
    return request.GET(
      "".concat(app.config.bingxiHost, "/app-api/order/refund/print/info/").concat(t.refundId),
    );
  },
  printRefundOrder: function () {
    var t = arguments.length > 0 && void 0 !== arguments[0] ? arguments[0] : "",
      r = arguments.length > 1 && void 0 !== arguments[1] ? arguments[1] : {};
    return request.POST(
      "".concat(app.config.bingxiHost, "/app-api/order/refund/print/").concat(t),
      r,
      {
        headers: {
          "Content-Type": "application/json",
        },
      },
    );
  },
  shopUserList: function () {
    return request.GET("".concat(app.config.bingxiHost, "/app-api/order/print/shopUserList"));
  },
};
