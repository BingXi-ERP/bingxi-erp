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
    // 功能 保存一张草稿态销售订单
    // 调用方 pages/order-create/offline/create.js 的提交腿
    // 入参 n 订单头与行集载荷
    // 传给谁 本仓 sales orders 建单口 POST（route-snapshot.txt 第 1580 行），
    //   草稿态由 CreateSalesOrderRequest 的 status 字段表达（backend/src/services/so/mod.rs 第 162 行），
    //   与正式单同一建单口，不再有独立的 draft 端点
    // 存什么 载荷补 status 为 draft 一键（不改动调用页传入的对象），其余键名由调用页按本仓
    //   请求体提交，旧侧的 billing 与 goods 系列键名差异已登记进映射报告
    // 存哪里 不写本地缓存
    var payload = Object.assign({}, n, {
      status: "draft",
    });
    return request.POST("".concat(app.config.bingxiHost, "/api/v1/erp/sales/orders"), payload, {
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
    // 功能 按订单标识回读一张既有订单，用于再次下单时带出原单内容
    // 调用方 pages/order-create/offline/create.js 的再次下单腿
    // 入参 n.billingId 订单标识
    // 传给谁 本仓 sales orders 详情 GET 口（route-snapshot.txt 第 893 行），
    //   标识内联进 URL 路径段（快照用星号表示该段），旧侧的 reBillingDetail 专用口本仓不存在
    // 存什么 URL 上只带订单标识，请求体传空对象，不再透传旧侧整包查询对象
    // 存哪里 不写本地缓存
    return request.GET(
      "".concat(app.config.bingxiHost, "/api/v1/erp/sales/orders/", n.billingId),
      {},
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
