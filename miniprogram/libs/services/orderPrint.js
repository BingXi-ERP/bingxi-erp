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
    // 功能 读取打印页可选的经办人清单
    // 调用方 pages/printing/order/index.js 的 onLoad
    // 入参 无
    // 传给谁 本仓 users 列表 GET 口（route-snapshot.txt 第 966 行），
    //   与 ServicesReturn.shopUserList 同一读口，旧侧的 order/print/shopUserList 专用口本仓不存在
    // 存什么 不传查询参数（调用页无入参），出参列名按 ListUsers 返回体，
    //   与旧侧店铺用户列名差异已登记进映射报告
    // 存哪里 不写本地缓存
    return request.GET("".concat(app.config.bingxiHost, "/api/v1/erp/users"), {});
  },
};
