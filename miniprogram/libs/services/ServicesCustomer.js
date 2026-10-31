var createClass = require("../../@babel/runtime/helpers/createClass"),
  classCallCheck = require("../../@babel/runtime/helpers/classCallCheck"),
  app = getApp(),
  request = require("./request.js").request,
  e = createClass(function t(e) {
    (classCallCheck(this, t),
      (this.customerIndex = function (t) {
        return request.GET("".concat(app.config.bingxiHost, "/api/v1/erp/dashboard/overview"), t);
      }),
      (this.customersData = function (t) {
        return request.GET(
          "".concat(app.config.bingxiHost, "/app-api/customer/two/statistics/").concat(t.grouping),
          t,
        );
      }),
      (this.customersList = function (t) {
        return request.POST(
          "".concat(app.config.bingxiHost, "/app-api/customer/two/groupingList"),
          t,
        );
      }),
      (this.allCustomerList = function (t) {
        return request.GET("".concat(app.config.bingxiHost, "/api/v1/erp/crm/customers"), t);
      }),
      (this.selectPageList = function (t) {
        return request.GET("".concat(app.config.bingxiHost, "/api/v1/erp/crm/customers"),
          t,
        );
      }),
      (this.shopNews = function (t) {
        return request.POST("".concat(app.config.bingxiHost, "/app-api/message/shop"), t, {
          headers: {
            "content-type": "application/json",
          },
        });
      }),
      (this.sysNews = function (t) {
        return request.GET("".concat(app.config.bingxiHost, "/api/v1/erp/notifications"), t);
      }),
      (this.sysFeedbackList = function (t) {
        return request.POST("".concat(app.config.bingxiHost, "/app-api/message/feedback/list"), t);
      }),
      (this.customerDetail = function (t) {
        return request.GET("".concat(app.config.bingxiHost, "/api/v1/erp/crm/customers/", t.customerId),
          t,
        );
      }),
      (this.trackRecordList = function (t) {
        return request.POST("".concat(app.config.bingxiHost, "/app-api/customer/two/trackList"), t);
      }),
      (this.saveCustomer = function (t) {
        return request.POST("".concat(app.config.bingxiHost, "/api/v1/erp/crm/customers"), t);
      }),
      (this.editCustomer = function (t) {
        return request.PUT("".concat(app.config.bingxiHost, "/api/v1/erp/crm/customers/", t.id || t.customerId || ""), t);
      }),
      (this.colorCardList = function (t) {
        return request.GET("".concat(app.config.bingxiHost, "/api/v1/erp/products"), t);
      }),
      (this.goodsDetail = function (t, o) {
        return request.GET("".concat(app.config.bingxiHost, "/api/v1/erp/products/", t), o);
      }),
      (this.saveTrackRecord = function (t) {
        return request.POST("".concat(app.config.bingxiHost, "/app-api/customer/two/track/add"), t);
      }),
      (this.sendInviteMsg = function (t) {
        return request.GET(
          "".concat(app.config.bingxiHost, "/app-api/send/message/customer/sendInviteMsg/").concat(t),
        );
      }),
      (this.trackRecordDetail = function (t) {
        return request.GET(
          ""
            .concat(app.config.bingxiHost, "/app-api/customer/two/trackDetail/")
            .concat(t.trackRecordId),
          t,
        );
      }),
      (this.removeTrackRecord = function (t) {
        return request.POST(
          "".concat(app.config.bingxiHost, "/app-api/customer/two/track/delete"),
          t,
        );
      }),
      (this.customerOrderRecordNum = function (t) {
        return request.GET("".concat(app.config.bingxiHost, "/api/v1/erp/sales/orders?customer_id=", t.customerId),
          t,
        );
      }),
      (this.customerOrderList = function (t) {
        return request.GET("".concat(app.config.bingxiHost, "/api/v1/erp/sales/orders"), t);
      }),
      (this.customerDealNum = function (t) {
        return request.GET("".concat(app.config.bingxiHost, "/app-api/crm/customerLedger"), t, {
          headers: {
            "content-type": "application/json",
          },
        });
      }),
      (this.refundrOrderList = function (t) {
        return request.POST(
          "".concat(app.config.bingxiHost, "/app-api/order/refund/billing/customer/refundList"),
          t,
        );
      }));
  });
module.exports = {
  servicesCustomer: new e(),
};
