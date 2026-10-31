var createClass = require("../../@babel/runtime/helpers/createClass"),
  classCallCheck = require("../../@babel/runtime/helpers/classCallCheck"),
  app = getApp(),
  request = require("./request.js").request,
  c = createClass(function o() {
    (classCallCheck(this, o),
      (this.colorCardList = function (o) {
        return request.GET("".concat(app.config.bingxiHost, "/api/v1/erp/products"), o);
      }),
      (this.getElColorCardList = function (o) {
        return request.POST("".concat(app.config.bingxiHost, "/app-api/share/color/product/list"), o);
      }),
      (this.saveColorCardImage = function (o) {
        return request.POST("".concat(app.config.bingxiHost, "/app-api/share/color/img/save"), o);
      }),
      (this.searchAppList = function (o) {
        return request.GET("".concat(app.config.bingxiHost, "/api/v1/erp/search/products"), o);
      }),
      (this.colorCardDetails = function (o) {
        return request.GET(
          "".concat(app.config.bingxiHost, "/app-api/colorCardSetting/detail/").concat(o.productId),
          o,
          {
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
            },
          },
        );
      }),
      (this.shareProductDetails = function (o) {
        return request.GET(
          "".concat(app.config.bingxiHost, "/app-api/productSetting/detail/").concat(o.productId),
          o,
          {
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
            },
          },
        );
      }),
      (this.productSetting = function (o) {
        return request.POST("".concat(app.config.bingxiHost, "/app-api/productSetting/save"), o);
      }),
      (this.colorCardSetting = function (o) {
        return request.POST("".concat(app.config.bingxiHost, "/app-api/colorCardSetting/save"), o);
      }),
      (this.batchSetOnSale = function (o) {
        return request.PUT(
          "".concat(app.config.bingxiHost, "/app-api/product/batch/switchStatus"),
          o,
        );
      }),
      (this.batchSetOffSale = function (o) {
        return request.PUT(
          "".concat(app.config.bingxiHost, "/app-api/product/batch/switchStatus"),
          o,
        );
      }),
      (this.queryColorCardCount = function (o) {
        return request.GET("".concat(app.config.bingxiHost, "/app-api/goods/goodsSaleCount"), o);
      }),
      (this.delColorCard = function (o, t) {
        return request.DELETE("".concat(app.config.bingxiHost, "/api/v1/erp/products/", t),
          o,
        );
      }),
      (this.colorCardDetail = function (o, t) {
        return request.GET("".concat(app.config.bingxiHost, "/api/v1/erp/products/", t), o);
      }),
      (this.addCategory = function (o) {
        return request.POST("".concat(app.config.bingxiHost, "/api/v1/erp/product-categories"), o);
      }),
      (this.categoryList = function (o) {
        return request.GET("".concat(app.config.bingxiHost, "/api/v1/erp/product-categories/tree"), o, {
          headers: {
            "Content-Type": "application/json",
          },
        });
      }),
      (this.addCategoryList = function (o) {
        return request.POST("".concat(app.config.bingxiHost, "/app-api/product/updateClassify"), o);
      }),
      (this.CategoryListRemove = function (o) {
        return request.POST("".concat(app.config.bingxiHost, "/app-api/product/removeClassify"), o);
      }),
      (this.getColorCardId = function (o) {
        return request.GET("".concat(app.config.bingxiHost, "/api/v1/erp/products/", o.id || o.goodsId || ""), o);
      }),
      (this.addOrUpdateColorCard = function (o, t) {
        return request.POST(t, o);
      }),
      (this.addColorCard = function (o) {
        return request.POST("".concat(app.config.bingxiHost, "/api/v1/erp/products"), o);
      }),
      (this.updateColorCard = function (o) {
        return request.PUT("".concat(app.config.bingxiHost, "/api/v1/erp/products/", o.id || ""), o);
      }),
      (this.ColorCardDetail = function (o, t) {
        return request.GET("".concat(app.config.bingxiHost, "/api/v1/erp/products/", t), o);
      }),
      (this.colorCardCollectList = function (o) {
        return request.GET(
          "".concat(app.config.bingxiHost, "/app-api/visitor/goods/goodsFavoriteList"),
          o,
        );
      }),
      (this.shopCollectList = function (o) {
        return request.GET("".concat(app.config.bingxiHost, "/app-api/visitor/shop/shopList"), o);
      }),
      (this.addOrUpdateColorCardCollect = function (o) {
        return request.GET(
          "".concat(app.config.bingxiHost, "/app-api/visitor/goods/addOrUpdateFavoriteRemark"),
          o,
        );
      }),
      (this.ColorCardNameList = function (o) {
        return request.GET("".concat(app.config.bingxiHost, "/app-api/goods/colorName/list"), o);
      }),
      (this.addColorCardName = function (o) {
        return request.POST("".concat(app.config.bingxiHost, "/app-api/colorName/add"), o);
      }),
      (this.delColorCardName = function (o) {
        return request.POST(
          "".concat(app.config.bingxiHost, "/app-api/colorName/delete/").concat(o),
          {},
          {
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
            },
          },
        );
      }),
      (this.printCommand = function (o) {
        return request.GET("".concat(app.config.bingxiHost, "/app-api/goods/print/newCommand"), o);
      }),
      (this.newLabelPrint = function (o) {
        return request.GET("".concat(app.config.bingxiHost, "/app-api/loss/anon/mpNewLabelPrint"), o);
      }),
      (this.getPrintInfo = function (o) {
        return request.GET(
          "".concat(app.config.bingxiHost, "/app-api/goods/print/print/").concat(o.goodsId),
          o,
        );
      }),
      (this.updatePrintInfo = function (o) {
        return request.POST("".concat(app.config.bingxiHost, "/app-api/goods/print/print"), o, {
          headers: {
            "content-type": "application/json",
          },
        });
      }),
      (this.updatePrintInfoCount = function (o) {
        return request.POST("".concat(app.config.bingxiHost, "/app-api/goods/print/updatePrint"), o, {
          headers: {
            "content-type": "application/x-www-form-urlencoded",
          },
        });
      }),
      (this.getQRcode = function (o) {
        return request.GET(
          "".concat(app.config.bingxiHost, "/app-api/wechat/createProductQRcode"),
          o,
        );
      }),
      (this.listV2 = function (o) {
        return request.POST("".concat(app.config.bingxiHost, "/app-api/colorName/queryList"), o);
      }),
      (this.saveBatchUpdatePrice = function (o) {
        return request.POST("".concat(app.config.bingxiHost, "/app-api/product/batchEditPrice"), o);
      }),
      (this.checkRepeatProductName = function (o) {
        return request.POST(
          "".concat(app.config.bingxiHost, "/app-api/product/isExistProductName"),
          o,
        );
      }),
      (this.checkRepeatShelvesNumber = function (o) {
        return request.POST(
          "".concat(app.config.bingxiHost, "/app-api/product/isExistShelvesNumber"),
          o,
        );
      }),
      (this.updateSingleColorCardPic = function (o) {
        return request.POST(
          "".concat(app.config.bingxiHost, "/app-api/colorCardSetting/customSkuColorImage"),
          o,
        );
      }),
      (this.saveBottomCardToProduct = function (o) {
        return request.GET(
          "".concat(app.config.bingxiHost, "/app-api/productBottomCard/toProduct/").concat(o),
        );
      }),
      (this.saveColor = function (o) {
        return request.POST(
          "".concat(app.config.bingxiHost, "/app-api/product/color/batch/operate"),
          o,
        );
      }),
      (this.getColorList = function (o) {
        return request.GET("".concat(app.config.bingxiHost, "/api/v1/erp/products/", o.productId || o.id || o.goodsId || "", "/colors"), o);
      }),
      (this.clearAllColor = function (o) {
        return request.DELETE(
          "".concat(app.config.bingxiHost, "/app-api/product/color/clear//").concat(o),
        );
      }));
  });
module.exports = {
  servicesCard: new c(),
};
