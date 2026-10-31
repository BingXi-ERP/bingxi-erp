var createClass = require("../../../@babel/runtime/helpers/createClass"),
  classCallCheck = require("../../../@babel/runtime/helpers/classCallCheck"),
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
        return request[arguments.length > 2 && void 0 !== arguments[2] ? arguments[2] : "POST"](
          o,
          t,
        );
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
        return request.PUT("".concat(app.config.bingxiHost, "/api/v1/erp/user/profile"), t);
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
          "".concat(app.config.bingxiHost, "/app-api/user/getChildUserInfo/").concat(t.id),
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
        return request.GET("".concat(app.config.bingxiHost, "/api/v1/erp/users/me"), t);
      }),
      (this.shopDetail2 = function (t) {
        return request.POST(
          "".concat(app.config.bingxiHost, "/app-api/setting/company/detail?id=").concat(t.id),
          t,
          {
            headers: {
              "content-type": "application/x-www-form-urlencoded",
            },
          },
        );
      }),
      (this.updateShop = function (t) {
        return request.POST("".concat(app.config.bingxiHost, "/app-api/setting/company/modify"), t);
      }),
      (this.updateUser = function (t) {
        return request.PUT("".concat(app.config.bingxiHost, "/api/v1/erp/user/profile"), t);
      }));
  });
module.exports = {
  servicesCenter: new i(),
};
