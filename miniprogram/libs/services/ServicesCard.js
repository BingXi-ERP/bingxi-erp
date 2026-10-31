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

/**
 * 功能 统计上架与下架两个状态下的色卡商品条数（列表页顶部计数）
 * 调用方 本文件的 queryColorCardCount，上游为 pages/color-card-management/color-card-management.js
 *   的 queryColorCardCount（该处不传入参，统计全组织）与同类页面的按分类计数
 * 入参 o 可选，只认旧侧的 categoryId 一键（同一分类内的计数），缺席就统计全部
 * 传给谁 本仓产品列表读口 GET 两条，状态分别取 active 与 inactive（products.status 的小写词表，
 *   唯一源为 backend 侧 models/status/general.rs 的 master_data 常量），分页取 page 1 与 page_size 1，
 *   只读信封里的 total 计数不取行；查询键 category_id 与 page 与 page_size 与 status 逐条对齐
 *   ProductListQuery（backend 侧 product_handler.rs），旧侧 camelCase 的 categoryId 在此转成 category_id
 * 存什么 组装成旧侧同名键的响应对象（code 与 data 下 onSaleCount 与 offSaleCount），值就是两条读口
 *   各自的 total；任一条非 0 原样回该条，让读方弹后端真实文案；两条都 0 但 total 不是数值即点名拒绝
 * 存哪里 不写本地缓存，结果只回给调用页
 */
function queryProductSaleCount(o) {
  var host = app.config.bingxiHost;
  var base = { page: 1, page_size: 1 };
  if (o && o.categoryId !== undefined && o.categoryId !== "") {
    base.category_id = o.categoryId;
  }
  var onQuery = Object.assign({ status: "active" }, base);
  var offQuery = Object.assign({ status: "inactive" }, base);
  return Promise.all([
    request.GET("".concat(host, "/api/v1/erp/products"), onQuery),
    request.GET("".concat(host, "/api/v1/erp/products"), offQuery),
  ]).then(function (pairs) {
    var on = pairs[0];
    var off = pairs[1];
    if (on.code !== 0) return on;
    if (off.code !== 0) return off;
    if (
      !on.data ||
      typeof on.data.total !== "number" ||
      !off.data ||
      typeof off.data.total !== "number"
    ) {
      return {
        code: 500,
        msg: "产品计数出参缺 total 数值，与本仓契约不符",
        data: {},
      };
    }
    return {
      code: 0,
      data: { onSaleCount: on.data.total, offSaleCount: off.data.total },
    };
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
      /**
       * 功能 色卡上下架计数（读口换成本仓产品列表两次读，组装见本文件 queryProductSaleCount 注释）
       * 调用方 pages/color-card-management/color-card-management.js 的 queryColorCardCount
       * 入参 o 旧侧查询对象，本仓只认其中 categoryId 一键
       * 传给谁 本文件 queryProductSaleCount
       * 存什么/存哪里 不落盘，结果只回调用页
       */
      (this.queryColorCardCount = function (o) {
        return queryProductSaleCount(o);
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
