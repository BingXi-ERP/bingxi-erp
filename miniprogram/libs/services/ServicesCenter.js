var createClass = require("../../@babel/runtime/helpers/createClass"),
  classCallCheck = require("../../@babel/runtime/helpers/classCallCheck"),
  app = getApp(),
  request = require("./request.js").request,
  i = createClass(function t(i) {
    (classCallCheck(this, t),
      (this.redPoint = function (t) {
        return request.GET(
          "".concat(app.config.bingxiHost, "/app-api/goods/ask/statusChangeWarn"),
          t,
        );
      }),
      (this.accountList = function (t) {
        return request.GET("".concat(app.config.bingxiHost, "/api/v1/erp/users"), t);
      }),
      (this.roleList = function (t) {
        return request.POST(
          "".concat(app.config.bingxiHost, "/app-api/shop/user/role/listWithMenu"),
          t,
        );
      }),
      (this.authList = function (t) {
        return request.GET("".concat(app.config.bingxiHost, "/app-api/shop/user/role/getMenus"), t);
      }),
      (this.addOrChangeRole = function (t, o) {
        return request.POST(o, t);
      }),
      (this.delRole = function (t) {
        return request.POST(
          "".concat(app.config.bingxiHost, "/app-api/user/subAccount/deleteRole"),
          t,
        );
      }),
      (this.createChildrenQRCode = function (t) {
        return request.GET(
          "".concat(app.config.bingxiHost, "/app-api/customer/two/createInviteQRCode"),
          t,
        );
      }),
      (this.checkChildrenQRCode = function (t) {
        return request.GET(
          "".concat(app.config.bingxiHost, "/app-api/user/subAccount/checkInviteQRCodeStatus"),
          t,
        );
      }),
      (this.changeChildrenName = function (t) {
        return request.PUT("".concat(app.config.bingxiHost, "/api/v1/erp/user/profile"), t);
      }),
      (this.editChilder = function (t) {
        return request.PUT("".concat(app.config.bingxiHost, "/api/v1/erp/user/profile"), params);
      }),
      (this.switchChildren = function (t) {
        return request.POST(
          "".concat(app.config.bingxiHost, "/app-api/user/subAccount/subAccountSwith"),
          t,
        );
      }),
      (this.saveChildrenRole = function (t) {
        return request.POST(
          "".concat(app.config.bingxiHost, "/app-api/user/subAccount/saveSubAccountRole"),
          t,
        );
      }),
      (this.getChildrenInfo = function (t) {
        return request.GET(
          "".concat(app.config.bingxiHost, "/app-api/user/subAccount/subAccountInfo"),
          t,
        );
      }),
      (this.delChildren = function (t) {
        return request.DELETE("".concat(app.config.bingxiHost, "/api/v1/erp/users/", t.subAccountId),
        );
      }),
      (this.colorCardCollectList = function (t) {
        return request.GET(
          "".concat(app.config.bingxiHost, "/app-api/visitor/goods/goodsFavoriteList"),
          t,
        );
      }),
      (this.shopCollectList = function (t) {
        return request.GET("".concat(app.config.bingxiHost, "/app-api/visitor/shop/shopList"), t);
      }),
      (this.addOrUpdateColorCard = function (t) {
        return request.GET(
          "".concat(app.config.bingxiHost, "/app-api/visitor/goods/addOrUpdateFavoriteRemark"),
          t,
        );
      }),
      (this.shopDetail = function (t, o) {
        return request.GET("".concat(app.config.bingxiHost, "/app-api/shop/").concat(o), t);
      }),
      (this.shopDetail2 = function (t) {
        // 功能 读取本公司档案详情用于店铺资料页回显
        // 调用方 packageB/pages/personal-center/edit-shop/edit-shop.js 的 shopDetail2
        // 入参 t 旧侧按表单键提交的查询对象，本仓该口按会话取当前公司，无查询参数
        // 传给谁 本仓 company-profile 全量读口 GET（route-snapshot.txt 第 349 行）
        // 存什么 不落盘，回给页面的列名是 company_profile 表的 name 与 short_name 与
        //   credit_code 与 legal_representative 与 bank_name 与 bank_account 与 phone 与
        //   address 与 logo 等（backend/src/models/company_profile.rs 第 21 行起），
        //   与旧侧店铺字段名不同，差异点已登记进映射报告
        // 存哪里 不写本地缓存
        return request.GET("".concat(app.config.bingxiHost, "/api/v1/erp/company-profile/full"), {});
      }),
      (this.updateShop = function (t) {
        return request.POST("".concat(app.config.bingxiHost, "/app-api/setting/company/modify"), t);
      }),
      (this.updateUser = function (t) {
        return request.PUT("".concat(app.config.bingxiHost, "/api/v1/erp/user/profile"), t);
      }),
      (this.combo = function () {
        return request.GET("".concat(app.config.bingxiHost, "/app-api/pay/membership/status"));
      }));
  });
module.exports = {
  servicesCenter: new i(),
};
