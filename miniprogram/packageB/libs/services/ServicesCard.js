var createClass = require("../../../@babel/runtime/helpers/createClass"),
  classCallCheck = require("../../../@babel/runtime/helpers/classCallCheck"),
  app = getApp(),
  request = require("./request.js").request;

/**
 * 功能 批量切换色卡商品的上架与下架状态（与 libs 份 ServicesCard.js 同一逻辑）
 * 调用方 本文件的 batchSetOnSale 与 batchSetOffSale
 * 入参 o.productIds 商品标识数组，o.onSale 上架标志（数值 1 上架，其余按下架处理）
 * 传给谁 本仓 products 批量更新口 POST（route-snapshot.txt 第 1492 行），载荷键按
 *   BatchUpdateProductsPayload 的 products 数组与逐行 status 字段（backend/src/handlers/bulk_product_handler.rs 第 27 行）
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
 * 功能 统计上架与下架两个状态下的色卡商品条数（与 libs 份 ServicesCard.js 同一逻辑）
 * 调用方 本文件的 queryColorCardCount
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

/**
 * 功能 把色卡页本地表单映射为产品色号创建契约
 * 调用方 saveColor 的新增分支
 * 入参 item 包含 colorVal 与 colorName 的本地色号对象
 * 传给谁 本仓 POST /products/{product_id}/colors
 * 存什么 color_no、color_name、pantone_code、color_type、dye_formula、extra_cost、color_fastness_grade
 * 存哪里 不写本地缓存，载荷只交给请求层
 */
function createProductColorPayload(item) {
  var colorNo = String(item.colorVal || "").trim();
  var colorName = String(item.colorName || "").trim();
  if (!colorNo) throw new Error("色号不能为空");
  if (!colorName) throw new Error("颜色名称不能为空");
  return {
    color_no: colorNo,
    color_name: colorName,
    pantone_code: null,
    color_type: "STANDARD",
    dye_formula: null,
    extra_cost: 0,
    color_fastness_grade: null,
  };
}

var r =
  createClass(function o(r) {
    (classCallCheck(this, o),
      (this.colorCardList = function (o) {
        return request.GET("".concat(app.config.bingxiHost, "/api/v1/erp/products"), o);
      }),
      /**
       * 功能 读取产品色号并保留后端契约原貌
       * 调用方 add-colour 页 getColorList
       * 入参 o.id 或 o.goodsId 为产品标识，o.page/o.size 为分页，o.keyword 为可选搜索词
       * 传给谁 GET /products/{product_id}/colors，查询键转 page/page_size/keyword
       * 存什么 不转换响应键，data 保持 product_color::Model 数组
       * 存哪里 不写本地缓存，结果只回调用页
       */
      (this.getColorList = function (o) {
        var query = {
          page: Number(o.page) || 1,
          page_size: Number(o.size) || 20,
        };
        if (o.keyword !== undefined && o.keyword !== "") query.keyword = o.keyword;
        return request.GET(
          "".concat(app.config.bingxiHost, "/api/v1/erp/products/", o.id || o.goodsId, "/colors"),
          query
        );
      }),
      /**
       * 功能 新增、更新或删除单个产品色号
       * 调用方 add-colour 页 saveColorList 与 removeIndex
       * 入参 o.productId 产品标识，o.itemList 仅允许一项；flag 1 新增、2 更新、3 删除
       * 传给谁 POST、PUT 或 DELETE /products/{product_id}/colors，更新与删除再带 color_id
       * 存什么 只发送后端 DTO 明确声明的键，不发送仪器测量或旧第三方线协议字段
       * 存哪里 不写本地缓存，结果只回调用页
       */
      (this.saveColor = function (o) {
        if (!o || !Array.isArray(o.itemList) || o.itemList.length !== 1) {
          throw new Error("产品色号保存要求且仅允许一项 itemList");
        }
        var item = o.itemList[0];
        var base = "".concat(
          app.config.bingxiHost,
          "/api/v1/erp/products/",
          o.productId,
          "/colors"
        );
        if (Number(item.flag) === 1) {
          return request.POST(base, createProductColorPayload(item));
        }
        var colorId = Number(item.skuId);
        if (!Number.isInteger(colorId) || colorId <= 0) throw new Error("产品色号标识必须是正整数");
        var url = "".concat(base, "/").concat(colorId);
        if (Number(item.flag) === 2) {
          var colorName = String(item.colorName || "").trim();
          if (!colorName) throw new Error("颜色名称不能为空");
          return request.PUT(url, { color_name: colorName });
        }
        if (Number(item.flag) === 3) return request.DELETE(url, {});
        throw new Error("产品色号操作 flag 只能是 1、2 或 3");
      }),
      /**
       * 功能 分页读取并逐条删除产品下的全部色号
       * 调用方 add-colour 页 removeColorList 的清空确认分支
       * 入参 productId 产品标识
       * 传给谁 GET 与 DELETE /products/{product_id}/colors
       * 存什么 不落本地缓存，返回删除成功条数
       * 存哪里 不适用
       */
      (this.clearAllColor = function (productId) {
        var page = 1;
        var all = [];
        var readPage = function () {
          return request.GET(
            "".concat(
              app.config.bingxiHost,
              "/api/v1/erp/products/",
              productId,
              "/colors"
            ),
            { page: page, page_size: 500 }
          ).then(function (res) {
            if (!res || res.code !== 0 || !Array.isArray(res.data)) {
              throw new Error("读取产品色号失败，无法执行清空");
            }
            all = all.concat(res.data);
            if (res.data.length < 500) return all;
            page += 1;
            return readPage();
          });
        };
        return readPage().then(function (items) {
          return items.reduce(function (promise, item) {
            return promise.then(function () {
              var id = Number(item.id);
              if (!Number.isInteger(id) || id <= 0) throw new Error("产品色号响应缺少有效 id");
              return request.DELETE(
                "".concat(
                  app.config.bingxiHost,
                  "/api/v1/erp/products/",
                  productId,
                  "/colors/",
                  id
                ),
                {}
              ).then(function (res) {
                if (!res || res.code !== 0) throw new Error("删除产品色号失败");
              });
            });
          }, Promise.resolve()).then(function () {
            return items.length;
          });
        });
      }),
      (this.onOrOffShelves = function (o) {
        return request.POST("".concat(app.config.bingxiHost, "/api/v1/erp/products/batch/update"),
          o,
        );
      }),
      /**
       * 功能 色卡上下架计数（读口换成本仓产品列表两次读，组装见本文件 queryProductSaleCount 注释）
       * 调用方 packageB 侧色卡列表页的计数分支
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
          "".concat(app.config.bingxiHost, "/app-api/goods/print/print/").concat(o.id),
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
      (this.shopIngredient = function (o) {
        return request.GET("".concat(app.config.bingxiHost, "/app-api/material/list"));
      }),
      (this.shopIngredientAdd = function (o) {
        return request.POST("".concat(app.config.bingxiHost, "/app-api/material/add"), o);
      }),
      (this.batchSetOnSale = function (o) {
        return batchSwitchProductStatus(o);
      }),
      (this.batchSetOffSale = function (o) {
        return batchSwitchProductStatus(o);
      }),
      (this.saveBatchUpdatePrice = function (o) {
        return request.POST("".concat(app.config.bingxiHost, "/app-api/product/batchEditPrice"), o);
      }),
      (this.shopIngredientDelete = function (o) {
        return (
          console.log(o),
          request.POST("".concat(app.config.bingxiHost, "/app-api/material/delete"), o, {
            headers: {
              "Content-Type": "application/json",
            },
          })
        );
      }),
      (this.materialQueryCount = function (o) {
        return request.POST("".concat(app.config.bingxiHost, "/app-api/material/queryCount"), o);
      }));
  });
module.exports = {
  servicesCard: new r(),
};
