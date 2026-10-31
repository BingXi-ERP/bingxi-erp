var createClass = require("../../../@babel/runtime/helpers/createClass"),
  classCallCheck = require("../../../@babel/runtime/helpers/classCallCheck"),
  app = getApp(),
  request = require("./request.js").request,
  i = createClass(function n(i) {
    (classCallCheck(this, n),
      (this.goodsList = function (n) {
        return request.GET("".concat(app.config.bingxiHost, "/api/v1/erp/products"), n);
      }),
      (this.getPriceList = function (n) {
        return request.GET(
          "".concat(app.config.bingxiHost, "/app-api/order/refund/getPriceList"),
          n,
          {
            headers: {
              "content-type": "application/json",
            },
          },
        );
      }),
      (this.relateBilling = function (n) {
        return request._POST(
          "".concat(app.config.bingxiHost, "/app-api/order/refund/relateBilling"),
          n,
          {
            headers: {
              "content-type": "application/json",
            },
          },
        );
      }),
      (this.relatableOrders = function (n) {
        return request.GET(
          "".concat(app.config.bingxiHost, "/app-api/order/refund/relatableOrders"),
          n,
          {
            headers: {
              "content-type": "application/json",
            },
          },
        );
      }),
      (this.saveRefundBilling = function (n) {
        return request.POST("".concat(app.config.bingxiHost, "/api/v1/erp/sales/sales-returns"),
          n,
          {
            headers: {
              "content-type": "application/json",
            },
          },
        );
      }),
      (this.saveBillingRefund = function (n) {
        return request.POST("".concat(app.config.bingxiHost, "/api/v1/erp/sales/sales-returns"),
          n,
          {
            headers: {
              "content-type": "application/json",
            },
          },
        );
      }),
      (this.refundDetail = function (n) {
        return request.GET(
          ""
            .concat(app.config.bingxiHost, "/app-api/order/refund/billing/refundDetail/")
            .concat(n.refundId),
          {
            headers: {
              "content-type": "application/json",
            },
          },
        );
      }),
      (this.updateRemark = function (n) {
        return request.POST(
          "".concat(app.config.bingxiHost, "/app-api/order/sale/billing/updateBillingRemark"),
          n,
        );
      }),
      (this.refundImg = function (n) {
        return request._POST(
          "".concat(app.config.bingxiHost, "/app-api/order/sale/billing/purchaseImg/save"),
          n,
          {
            headers: {
              "content-type": "application/json",
            },
          },
        );
      }),
      (this.refundList = function (n) {
        return request.GET("".concat(app.config.bingxiHost, "/api/v1/erp/sales/sales-returns"),
          n,
          {
            headers: {
              "content-type": "application/json",
            },
          },
        );
      }),
      (this.shopUserList = function (n) {
        return request.GET(
          "".concat(app.config.bingxiHost, "/app-api/order/refund/billing/shopUserList"),
          n,
          {
            headers: {
              "content-type": "application/json",
            },
          },
        );
      }),
      (this.refundableGoodsList = function (n) {
        return request.POST(
          "".concat(app.config.bingxiHost, "/app-api/order/refund/billing/refundableGoodsList"),
          n,
          {
            headers: {
              "content-type": "application/json",
            },
          },
        );
      }),
      (this.refundCancel = function (n) {
        return request._POST(
          "".concat(app.config.bingxiHost, "/app-api/order/refund/billing/cancelRefund"),
          n,
          {
            headers: {
              "content-type": "application/json",
            },
          },
        );
      }));
  });
module.exports = {
  ServicesReturn: new i(),
};
