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
        // 功能 统计当前草稿态销售订单的张数
        // 调用方 pages/order/pin/index.js 的 onLoad（把返回值直接当张数显示）
        // 入参 t 旧侧的空查询对象，本仓按状态过滤取一页一条只为读 total
        // 传给谁 本仓 sales orders 列表 GET 口（route-snapshot.txt 第 892 行），
        //   状态键按 SalesOrderFilter 的 status 字段（backend/src/handlers/sales_order_handler.rs 第 69 行）
        // 存什么 只带 status 与 page 与 page_size 三枚查询参数
        // 存哪里 不写本地缓存；出参由旧侧的裸数值变成分页信封，张数在 data.total，
        //   消费页仍读 data 整包，该形态差异已登记进映射报告
        return request.GET("".concat(app.config.bingxiHost, "/api/v1/erp/sales/orders"), {
          status: "draft",
          page: 1,
          page_size: 1,
        }, {
          headers: {
            "content-type": "application/json",
          },
        });
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
        // 功能 读取单张销售订单的金额构成（收款页表头）
        // 调用方 pages/order/receipt/index.js 的 paymentDetail
        // 入参 t.billingId 订单标识
        // 传给谁 本仓 sales orders 详情 GET 口（route-snapshot.txt 第 893 行），
        //   标识内联进 URL 路径段（快照用星号表示该段）
        // 存什么 URL 上只带订单标识，请求体不再传旧侧的整包查询对象；
        //   旧侧返回独立的金额聚合体，本仓由订单头的 total_amount 与 paid_amount 等列承载，
        //   DECIMAL 列序列化为字符串，字段名与类型差异已登记进映射报告
        // 存哪里 不写本地缓存
        return request.GET(
          "".concat(app.config.bingxiHost, "/api/v1/erp/sales/orders/", t.billingId),
          {},
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
