var createClass = require("../../@babel/runtime/helpers/createClass"),
  classCallCheck = require("../../@babel/runtime/helpers/classCallCheck"),
  app = getApp(),
  request = require("./request.js").request,
  r = createClass(function t(r) {
    (classCallCheck(this, t),
      (this.list = function (t) {
        return request.GET("".concat(app.config.bingxiHost, "/api/v1/erp/product-categories/tree"), t);
      }),
      (this.sort = function (t) {
        return request.POST("".concat(app.config.bingxiHost, "/app-api/classify/move"), t);
      }),
      (this.delete = function (t) {
        return request.DELETE("".concat(app.config.bingxiHost, "/api/v1/erp/product-categories/", t));
      }),
      (this.permissionUser = function (t) {
        return request.GET("".concat(app.config.bingxiHost, "/api/v1/erp/crm/customers"),
          t,
        );
      }),
      (this.add = function (t) {
        return request.POST("".concat(app.config.bingxiHost, "/api/v1/erp/product-categories"), t);
      }),
      (this.save = function (t) {
        return request.PUT("".concat(app.config.bingxiHost, "/api/v1/erp/product-categories/", t.id || ""), t);
      }),
      (this.categoryDetail = function (t) {
        return request.GET("".concat(app.config.bingxiHost, "/api/v1/erp/product-categories/", t.id || ""), t,
        );
      }),
      (this.baseCardList = function (t) {
        return request.GET(
          "".concat(app.config.bingxiHost, "/app-api/productBottomCard/list/").concat(t.id),
          {},
        );
      }),
      (this.addBaseCard = function (t) {
        return request._POST("".concat(app.config.bingxiHost, "/app-api/productBottomCard/add"), t);
      }),
      (this.baseCardDetail = function (t) {
        return request.POST("".concat(app.config.bingxiHost, "/app-api/productBottomCard/detail"), t);
      }),
      (this.updateBaseCard = function (t) {
        return request.POST("".concat(app.config.bingxiHost, "/app-api/productBottomCard/edit"), t);
      }),
      (this.deleteBaseCard = function (t) {
        return request.POST("".concat(app.config.bingxiHost, "/app-api/productBottomCard/delete"), t);
      }),
      (this.goodsManagerList = function (t) {
        return request.GET("".concat(app.config.bingxiHost, "/api/v1/erp/products"), t);
      }),
      (this.goodsSaleCount = function (t) {
        return request.GET("".concat(app.config.bingxiHost, "/app-api/goods/goodsSaleCount"), t);
      }),
      (this.sortGoods = function (t) {
        return request._POST("".concat(app.config.bingxiHost, "/app-api/product/moveClassify"), t);
      }));
  });
module.exports = {
  ServicesCardType: new r(),
};
