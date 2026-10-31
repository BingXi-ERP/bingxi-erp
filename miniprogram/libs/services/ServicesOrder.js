var createClass = require("../../@babel/runtime/helpers/createClass"),
  classCallCheck = require("../../@babel/runtime/helpers/classCallCheck"),
  app = getApp(),
  request = require("./request.js").request,
  i = createClass(function t(i) {
    (classCallCheck(this, t),
      (this.searchHistoryList = function (t) {
        return request.POST("".concat(app.config.bingxiHost, "/app-api/searchHistory/pageList"), t, {
          headers: {
            "content-type": "application/json",
          },
        });
      }),
      (this.delHistoryList = function (t) {
        return request.POST("".concat(app.config.bingxiHost, "/app-api/searchHistory/delete"), t, {
          headers: {
            "content-type": "application/json",
          },
        });
      }),
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
        return request.GET(
          "".concat(app.config.bingxiHost, "/app-api/order/sale/billing/draftCount"),
          t,
          {
            headers: {
              "content-type": "application/json",
            },
          },
        );
      }),
      (this.closeOrder = function (t) {
        return request.POST("".concat(app.config.bingxiHost, "/api/v1/erp/sales/orders/", t.billingId || t.id || t.orderId || "", "/cancel"), t,
          {
            headers: {
              "content-type": "application/json",
            },
          },
        );
      }),
      (this.deleteOrder = function (t) {
        return request.DELETE("".concat(app.config.bingxiHost, "/api/v1/erp/sales/orders/", t),
          {},
          {
            headers: {
              "content-type": "application/json",
            },
          },
        );
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
      (this.saveRemark = function (t) {
        return request.POST(
          "".concat(app.config.bingxiHost, "/app-api/order/sale/billing/updateBillingRemark"),
          t,
        );
      }),
      (this.saveImage = function (t) {
        return request.POST(
          "".concat(app.config.bingxiHost, "/app-api/order/sale/billing/purchaseImg/save"),
          t,
          {
            headers: {
              "content-type": "application/json",
            },
          },
        );
      }),
      (this.paymentList = function (t) {
        return request.GET("".concat(app.config.bingxiHost, "/api/v1/erp/ar/payments?billing_id=", t.orderId),
          t,
          {
            headers: {
              "content-type": "application/json",
            },
          },
        );
      }),
      (this.paymentDetail = function (t) {
        return request.GET(
          ""
            .concat(app.config.bingxiHost, "/app-api/order/sale/billing/billingAmount/")
            .concat(t.billingId),
          t,
          {
            headers: {
              "content-type": "application/json",
            },
          },
        );
      }),
      (this.savePayment = function (t) {
        return request.POST("".concat(app.config.bingxiHost, "/api/v1/erp/ar/payments"),
          t,
          {
            headers: {
              "content-type": "application/json",
            },
          },
        );
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
      }),
      (this.previewRefundImage = function (t, e) {
        return request.GET(
          "".concat(app.config.bingxiHost, "/app-api/order/refund/print/previewImage/").concat(t),
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
  ServicesOrder: new i(),
};
