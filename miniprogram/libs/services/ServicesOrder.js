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
        // 功能 改写指定销售订单的备注正文
        // 调用方 pages/order/remark/index.js 的 saveFun（非退货分支）
        // 入参 t.billingId 订单标识 t.billingRemark 备注正文
        // 传给谁 本仓 sales orders 编辑保存口 PUT（route-snapshot.txt 第 1795 行），
        //   正文键名按后端 UpdateSalesOrderRequest 的 notes 字段改名（backend/src/services/so/mod.rs:288）
        // 存什么 只提交 notes 一键，其余订单头字段与状态不进载荷（状态改由权威操作口产生）
        // 存哪里 不落本地缓存
        return request.PUT(
          "".concat(app.config.bingxiHost, "/api/v1/erp/sales/orders/", t.billingId),
          {
            notes: t.billingRemark,
          },
          {
            headers: {
              "content-type": "application/json",
            },
          },
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
