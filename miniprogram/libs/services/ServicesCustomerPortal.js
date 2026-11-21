/**
 * 功能：小程序客户门户只读服务，封装绑定客户自有的汇总、订单、对账与色卡查询。
 * 调用方：pages/customer-portal 下四个只读页面（汇总、订单、对账、色卡）。
 * 入参：分页与筛选对象，键名与后端 Portal*ListQuery 同源（page、page_size、order_no、status、search）。
 * 传给谁：libs/services/request.js，再经 apiGateway 发往 /api/v1/erp/customer-portal/*；不拼内部读端点。
 * 存什么：不落本地缓存；数据范围完全由后端 role.code 与 users.customer_id 双门决定。
 * 存哪里：无。
 */
var createClass = require("../../@babel/runtime/helpers/createClass"),
  classCallCheck = require("../../@babel/runtime/helpers/classCallCheck"),
  app = getApp(),
  request = require("./request.js").request,
  servicesCustomerPortal = createClass(function t() {
    classCallCheck(this, t);
    this.dashboard = function () {
      return request.GET(
        "".concat(
          app.config.bingxiHost,
          "/api/v1/erp/customer-portal/dashboard",
        ),
      );
    };
    this.orders = function (params) {
      return request.GET(
        "".concat(app.config.bingxiHost, "/api/v1/erp/customer-portal/orders"),
        params,
      );
    };
    this.reconciliations = function (params) {
      return request.GET(
        "".concat(
          app.config.bingxiHost,
          "/api/v1/erp/customer-portal/reconciliations",
        ),
        params,
      );
    };
    this.colorCards = function (params) {
      return request.GET(
        "".concat(
          app.config.bingxiHost,
          "/api/v1/erp/customer-portal/color-cards",
        ),
        params,
      );
    };
  });

module.exports = { servicesCustomerPortal: new servicesCustomerPortal() };
