var request = require("./request.js").request,
  app = getApp();
module.exports = {
  getColorCards: function (n) {
    return request.GET("".concat(app.config.bingxiHost, "/api/v1/erp/products"), n);
  },
  getColorCard: function (n) {
    return request.GET("".concat(app.config.bingxiHost, "/api/v1/erp/products/", n),
      {},
      {
        headers: {
          "Content-Type": "application/json",
        },
      },
    );
  },
  getOrderDetail: function () {
    var n = arguments.length > 0 && void 0 !== arguments[0] ? arguments[0] : {};
    return request.GET("".concat(app.config.bingxiHost, "/api/v1/erp/sales/orders/", n.orderId),
      n,
      {
        headers: {
          "Content-Type": "application/json",
        },
      },
    );
  },
  draftOrder: function () {
    var n = arguments.length > 0 && void 0 !== arguments[0] ? arguments[0] : {};
    return request.POST("".concat(app.config.bingxiHost, "/app-api/order/sale/billing/draft"), n, {
      headers: {
        "Content-Type": "application/json",
      },
    });
  },
  paymentOrder: function () {
    var n = arguments.length > 0 && void 0 !== arguments[0] ? arguments[0] : {};
    return request.POST("".concat(app.config.bingxiHost, "/api/v1/erp/sales/orders"),
      n,
      {
        headers: {
          "Content-Type": "application/json",
        },
      },
    );
  },
  getQRCode: function (n, e) {
    return (
      console.log("request.GET", n),
      request.GET(
        ""
          .concat(app.config.bingxiHost, "/app-api/order/sale/billing/share/")
          .concat(n, "/")
          .concat(e),
        {},
        {
          headers: {
            "Content-Type": "application/json",
          },
        },
      )
    );
  },
  reBillingDetail: function () {
    var n = arguments.length > 0 && void 0 !== arguments[0] ? arguments[0] : {};
    return request.GET(
      ""
        .concat(app.config.bingxiHost, "/app-api/order/sale/billing/reBillingDetail/")
        .concat(n.billingId),
      null,
      {
        headers: {
          "Content-Type": "application/json",
        },
      },
    );
  },
  getUnlimitedQRCode: function (n) {
    return request.POST(
      "".concat(app.config.bingxiHost, "/app-api/user/wechat/getUnlimitedQRCode"),
      n,
    );
  },
  editColor: function (n) {
    return request.POST("".concat(app.config.bingxiHost, "/app-api/product/editColor"), n);
  },
  changeBotColorCards: function (n) {
    return request.POST(
      "".concat(app.config.bingxiHost, "/app-api/product/convertBatchBottomCard"),
      n,
    );
  },
};
