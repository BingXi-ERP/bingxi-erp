var createClass = require("../../@babel/runtime/helpers/createClass"),
  classCallCheck = require("../../@babel/runtime/helpers/classCallCheck"),
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
        return request.POST(
          "".concat(app.config.bingxiHost, "/app-api/order/refund/billing/relateBilling"),
          n,
          {
            headers: {
              "content-type": "application/json",
            },
          },
        );
      }),
      (this.relatableOrders = function (n) {
        return request.POST(
          "".concat(app.config.bingxiHost, "/app-api/order/refund/billing/relatableOrders"),
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
        // 功能 读取单张退货单的详情
        // 调用方 packageB/pages/sales-return/sales-return-list/sales-return-list-detail/index.js
        // 入参 n.refundId 退货单标识
        // 传给谁 本仓 sales sales-returns 详情 GET 口（route-snapshot.txt 第 912 行）
        // 存什么 标识内联进 URL 路径段，请求体不再携带旧侧的整包查询对象
        // 存哪里 不落本地缓存
        return request.GET(
          "".concat(app.config.bingxiHost, "/api/v1/erp/sales/sales-returns/", n.refundId),
          {},
          {
            headers: {
              "content-type": "application/json",
            },
          },
        );
      }),
      (this.updateRemark = function (n) {
        // 功能 改写销售订单的备注正文（退货页复用同一入口的非退货分支）
        // 调用方 pages/order/remark/index.js 的 saveFun
        // 入参 n.billingId 订单标识 n.billingRemark 备注正文
        // 传给谁 本仓 sales orders 编辑保存口 PUT（route-snapshot.txt 第 1795 行），
        //   正文键名按 UpdateSalesOrderRequest 的 notes 字段（backend/src/services/so/mod.rs:288）
        // 存什么 只提交 notes 一键
        // 存哪里 不落本地缓存
        return request.PUT(
          "".concat(app.config.bingxiHost, "/api/v1/erp/sales/orders/", n.billingId),
          {
            notes: n.billingRemark,
          },
        );
      }),
      (this.updateRemarkRefund = function (n) {
        // 功能 改写退货单的备注正文
        // 调用方 pages/order/remark/index.js 的 saveFun（orderType 为真的退货分支）
        // 入参 n.billingId 退货单标识 n.billingRemark 备注正文
        // 传给谁 本仓 sales sales-returns 编辑保存口 PUT（route-snapshot.txt 第 1800 行），
        //   正文键名按 UpdateSalesReturnRequest 的 notes 字段（backend/src/services/sales_return_service.rs:89）
        // 存什么 只提交 notes 一键，其余可空键保持缺席（后端按合并补丁语义区分缺席与显式清空）
        // 存哪里 不落本地缓存
        return request.PUT(
          "".concat(app.config.bingxiHost, "/api/v1/erp/sales/sales-returns/", n.billingId),
          {
            notes: n.billingRemark,
          },
        );
      }),
      (this.refundImg = function (n) {
        return request.POST(
          "".concat(app.config.bingxiHost, "/app-api/order/refund/billing/refundImg/save"),
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
        // 功能 读取可选业务员（本店在职用户）清单
        // 调用方 packageB/pages/sales-return/select-sales/index.js 的 getShopUserList
        // 入参 n 关键字与状态等查询条件，可为 undefined
        // 传给谁 本仓 users 列表 GET 口（route-snapshot.txt 第 966 行），
        //   查询名按 ListUsersParams 的 keyword 与 status 与 page 与 page_size
        // 存什么 原样透传查询对象，不改写键名（调用页当前无入参）
        // 存哪里 不落本地缓存
        return request.GET("".concat(app.config.bingxiHost, "/api/v1/erp/users"), n);
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
      }));
  });
module.exports = {
  ServicesReturn: new i(),
};
