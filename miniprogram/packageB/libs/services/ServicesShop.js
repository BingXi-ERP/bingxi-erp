var createClass = require("../../../@babel/runtime/helpers/createClass"),
  classCallCheck = require("../../../@babel/runtime/helpers/classCallCheck"),
  app = getApp(),
  request = require("./request.js").request,
  n = createClass(function o(n) {
    (classCallCheck(this, o),
      (this.openShop = function (o) {
        return request.POST("".concat(app.config.bingxiHost, "/app-api/shop/openShopV2"), o);
      }),
      (this.sendCode = function (o) {
        return request.POST("".concat(app.config.bingxiHost, "/app-api/shop/sendCodeV2"), o);
      }),
      (this.allShopCategory = function (o) {
        return request.GET("".concat(app.config.bingxiHost, "/app-api/shop/allShopCategory"), o);
      }),
      (this.allShopCategoryV2 = function (o) {
        return request.GET("".concat(app.config.bingxiHost, "/app-api/shop/allShopCategoryV2"), o);
      }),
      (this.marketPlace = function (o) {
        return request.GET("".concat(app.config.bingxiHost, "/app-api/basic/marketplace/list"), o);
      }),
      (this.marketPlaceV2 = function (o) {
        return request.GET("".concat(app.config.bingxiHost, "/app-api/basic/marketplace/listV2"), o);
      }),
      (this.openShopApply = function (o) {
        return request.POST("".concat(app.config.bingxiHost, "/app-api/shop/openShopApplyV2"), o);
      }),
      (this.submitShopApply = function (o) {
        return request.POST("".concat(app.config.bingxiHost, "/app-api/companyApply/applyTwo"), o);
      }),
      (this.checkInviteCode = function (o) {
        return request.POST("".concat(app.config.bingxiHost, "/app-api/shop/checkInviteCode"), o);
      }),
      (this.getShopApply = function (o) {
        return request.GET("".concat(app.config.bingxiHost, "/app-api/shop/getShopApply"), o);
      }),
      (this.shopApplyLog = function (o) {
        return request.GET("".concat(app.config.bingxiHost, "/api/v1/erp/page-view/stats"), o);
      }),
      (this.getProfessorCategory = function () {
        return request.GET("".concat(app.config.bingxiHost, "/app-api/basic/flowerCategoryList"));
      }),
      (this.postProfessorData = function (o) {
        return request._POST(
          "".concat(app.config.bingxiHost, "/app-api/user/fabricExpert/register"),
          o,
        );
      }),
      (this.operateAccess = function (o) {
        return request.GET("".concat(app.config.bingxiHost, "/app-api/loss/operateAccess"), o);
      }));
  });
module.exports = {
  servicesShop: new n(),
};
