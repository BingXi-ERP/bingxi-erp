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
        // 功能 统计当前草稿态销售订单的张数（与 libs 份同一形态）
        // 调用方 packageB 订单首页的草稿角标
        // 入参 t 旧侧的查询对象，本仓按状态过滤取一页一条只为读 total
        // 传给谁 本仓 sales orders 列表 GET 口（route-snapshot.txt 第 892 行），
        //   状态键按 SalesOrderFilter 的 status 字段（backend/src/handlers/sales_order_handler.rs 第 69 行）
        // 存什么 只带 status 与 page 与 page_size 三枚查询参数，
        //   出参由旧侧裸数值变成分页信封（张数在 data.total），差异已登记进映射报告
        // 存哪里 不写本地缓存
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
        // 功能 关闭一张销售订单（本仓由取消动作表达，与 libs 份同一形态）
        // 调用方 packageB 订单列表与详情的关闭腿
        // 入参 t.billingId 或 t.id 或 t.orderId 订单标识
        // 传给谁 本仓 sales orders 取消口 POST（route-snapshot.txt 第 1582 行），
        //   旧侧 GET 关单改为 POST 加路径参数的权威操作口
        // 存什么 标识内联进 URL 路径段（快照用星号表示该段）
        // 存哪里 不写本地缓存
        return request.POST("".concat(app.config.bingxiHost, "/api/v1/erp/sales/orders/", t.billingId || t.id || t.orderId || "", "/cancel"), t, {
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
