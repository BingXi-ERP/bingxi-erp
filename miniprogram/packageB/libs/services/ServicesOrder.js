var createClass = require("../../../@babel/runtime/helpers/createClass"),
  classCallCheck = require("../../../@babel/runtime/helpers/classCallCheck"),
  app = getApp(),
  request = require("./request.js").request,
  r = createClass(function t(r) {
    (classCallCheck(this, t),
      (this.shopOrderList = function (t) {
        return request.GET("".concat(app.config.bingxiHost, "/api/v1/erp/sales/orders"),
          t,
          {
            headers: {
              "content-type": "application/json",
            },
          },
        );
      }),
      (this.draftCount = function (t) {
        return request.GET("".concat(app.config.bingxiHost, "/app-api/order/draftCount"), t, {
          headers: {
            "content-type": "application/json",
          },
        });
      }),
      (this.closeOrder = function (t) {
        return request.GET("".concat(app.config.bingxiHost, "/app-api/order/closeOrder"), t, {
          headers: {
            "content-type": "application/json",
          },
        });
      }),
      (this.orderDetail = function (t) {
        return request.GET("".concat(app.config.bingxiHost, "/api/v1/erp/sales/orders/", t.orderId),
          t,
          {
            headers: {
              "content-type": "application/json",
            },
          },
        );
      }),
      (this.paymentList = function (t) {
        return request.GET("".concat(app.config.bingxiHost, "/api/v1/erp/sales/orders"),
          t,
          {
            headers: {
              "content-type": "application/json",
            },
          },
        );
      }),
      (this.paymentDetail = function (t) {
        return request.GET("".concat(app.config.bingxiHost, "/api/v1/erp/sales/orders/statistics"), t, {
          headers: {
            "content-type": "application/json",
          },
        });
      }),
      (this.savePayment = function (t) {
        return request.POST("".concat(app.config.bingxiHost, "/api/v1/erp/ar/payments"), t, {
          headers: {
            "content-type": "application/json",
          },
        });
      }),
      (this.orderCancel = function (t) {
        return request.POST("".concat(app.config.bingxiHost, "/api/v1/erp/sales/orders/", t.billingId || t.id || t.orderId || "", "/cancel"), t,
          {
            headers: {
              "content-type": "application/json",
            },
          },
        );
      }),
      (this.previewImage = function (t, e) {
        return request.GET(
          "".concat(app.config.bingxiHost, "/app-api/order/print/previewImage/").concat(t),
          e,
          {
            headers: {
              "content-type": "application/json",
            },
          },
        );
      }));
  });
module.exports = {
  ServicesOrder: new r(),
};
