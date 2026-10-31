var createClass = require("../../@babel/runtime/helpers/createClass"),
  classCallCheck = require("../../@babel/runtime/helpers/classCallCheck"),
  app = getApp(),
  request = require("./request.js").request;

/**
 * 功能 批量切换色卡商品的上架与下架状态
 * 调用方 本文件的 batchSetOnSale 与 batchSetOffSale，上游为 pages/color-card-management/batch-management/batch-management.js 的 onOrOffShelves 与 pages/color-card-management/color-card-management.js 的 onOrOff
 * 入参 o.productIds 商品标识数组，o.onSale 上架标志（数值 1 上架，其余按下架处理）
 * 传给谁 本仓 products 批量更新口 POST（route-snapshot.txt 第 1492 行），载荷键按 BatchUpdateProductsPayload 的 products 数组与逐行 status 字段（backend/src/handlers/bulk_product_handler.rs 第 27 行）
 * 存什么 只把商品标识与状态两键组进载荷，状态词表取 active 与 inactive（frontend/src/api/product.ts 第 202 行）
 * 存哪里 不写本地缓存，结果只回给调用页
 */
function batchSwitchProductStatus(o) {
  var ids = o.productIds;
  var status = Number(o.onSale) === 1 ? "active" : "inactive";
  var products = [];
  for (var i = 0; i < ids.length; i++) {
    products.push({ id: Number(ids[i]), status: status });
  }
  return request.POST("".concat(app.config.bingxiHost, "/api/v1/erp/products/batch/update"), {
    products: products,
  });
}

var c =
  createClass(function o() {
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
        return batchSwitchProductStatus(o);
      }),
      (this.batchSetOffSale = function (o) {
        return batchSwitchProductStatus(o);
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
