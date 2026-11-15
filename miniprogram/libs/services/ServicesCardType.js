var createClass = require("../../@babel/runtime/helpers/createClass"),
  classCallCheck = require("../../@babel/runtime/helpers/classCallCheck"),
  app = getApp(),
  request = require("./request.js").request;

/**
 * 功能 统计某个产品分类下上架与下架两个状态的色卡商品条数（与 ServicesCard.js 同一口径的分类版）
 * 调用方 本文件的 goodsSaleCount，上游为 packageB/pages/color-card-management/type-management
 *   batch-management/batch-management.js 的 queryColorCardCount
 * 入参 t 旧侧查询对象，本仓只认其中 categoryId 一键（本分类内的计数）；
 *   该键在本调用链上必给（调用页从路由参数取到分类标识才发起计数），缺席即点名拒绝，不按全量凑数
 * 传给谁 本仓产品列表读口 GET 两条，状态分别取 active 与 inactive（products.status 的小写词表，
 *   唯一源为 backend 侧 models/status/general.rs 的 master_data 常量），分页取 page 1 与 page_size 1，
 *   只读信封里的 total 计数不取行；查询键 category_id 与 page 与 page_size 与 status 逐条对齐
 *   ProductListQuery（backend 侧 product_handler.rs），旧侧 camelCase 的 categoryId 在此转成 category_id
 * 存什么 组装成旧侧同名键的响应对象（code 与 data 下 onSaleCount 与 offSaleCount），值就是两条读口
 *   各自的 total；任一条非 0 原样回该条，让读方弹后端真实文案；都 0 但 total 不是数值即点名拒绝
 * 存哪里 不写本地缓存，结果只回给调用页
 */
function queryCategorySaleCount(t) {
  if (!t || t.categoryId === undefined || t.categoryId === "") {
    return Promise.resolve({
      code: 500,
      msg: "分类计数缺 categoryId，本仓该口按分类过滤必须有该键",
      data: {},
    });
  }
  var host = app.config.bingxiHost;
  var base = { page: 1, page_size: 1, category_id: t.categoryId };
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

var r = createClass(function t(r) {
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
      /**
       * 功能 分类内色卡上下架计数（组装与拒绝口径见本文件 queryCategorySaleCount 注释）
       * 调用方 packageB/pages/color-card-management/type-management/batch-management/batch-management.js
       * 入参 t 旧侧查询对象（本链上带 categoryId）
       * 传给谁 本文件 queryCategorySaleCount
       * 存什么/存哪里 不落盘，结果只回调用页
       */
      (this.goodsSaleCount = function (t) {
        return queryCategorySaleCount(t);
      }),
      (this.sortGoods = function (t) {
        return request._POST("".concat(app.config.bingxiHost, "/app-api/product/moveClassify"), t);
      }));
  });
module.exports = {
  ServicesCardType: new r(),
};
