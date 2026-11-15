var createClass = require("../../@babel/runtime/helpers/createClass"),
  classCallCheck = require("../../@babel/runtime/helpers/classCallCheck"),
  app = getApp(),
  request = require("./request.js").request,
  e = createClass(function t(e) {
    (classCallCheck(this, t),
      (this.logout = function (t) {
        return request.POST("".concat(app.config.bingxiHost, "/api/v1/erp/auth/logout"), t);
      }),
      (this.sendVerCode = function (t) {
        return request.POST(
          "".concat(app.config.bingxiHost, "/app-api/setting/changeMobile/").concat(t.mobile),
          t,
        );
      }),
      (this.changeMobile = function (t) {
        return request.POST("".concat(app.config.bingxiHost, "/app-api/setting/changeMobile"), t);
      }),
      (this.ranking = function (t) {
        return request.POST(
          "".concat(app.config.bingxiHost, "/app-api/statistics/colorcardreceive/totalList"),
          t,
        );
      }),
      (this.summary = function (t, o) {
        return request.GET("".concat(app.config.bingxiHost, "/app-api/data2/").concat(o), t);
      }),
      (this.getStoreDetail = function (t) {
        // 功能 读取本公司档案详情（首页店铺资料卡）
        // 调用方 首页与店铺资料页，与 ServicesCenter.shopDetail2 同一读口
        // 入参 t 旧侧的查询对象，本仓该口按会话取当前公司，不接查询参数
        // 传给谁 本仓 company-profile 全量读口 GET（route-snapshot.txt 第 349 行）
        // 存什么 出参列名按 company_profile 实体（backend/src/models/company_profile.rs 第 21 行起），
        //   与旧侧店铺字段名不同，差异点已登记进映射报告
        // 存哪里 不写本地缓存
        return request.GET("".concat(app.config.bingxiHost, "/api/v1/erp/company-profile/full"), {});
      }),
      (this.getBillingPrinter = function (t) {
        return request.GET(
          "".concat(app.config.bingxiHost, "/app-api/shop/printer/getBillingPrinter"),
          t,
          {
            headers: {
              "content-type": "application/json",
            },
          },
        );
      }),
      (this.saveBillingPrinter = function (t) {
        return request.POST(
          "".concat(app.config.bingxiHost, "/app-api/shop/printer/saveBillingPrinter"),
          t,
          {
            headers: {
              "content-type": "application/json",
            },
          },
        );
      }),
      (this.getLastesMessage = function (t) {
        return request.GET("".concat(app.config.bingxiHost, "/api/v1/erp/oa-announcements"), t);
      }),
      (this.countsData = function (t) {
        return request.GET("".concat(app.config.bingxiHost, "/api/v1/erp/dashboard/sales-stats"), t);
      }),
      (this.countsDataPer = function (t) {
        return request.GET("".concat(app.config.bingxiHost, "/api/v1/erp/dashboard/sales-stats"),
          t,
          {
            headers: {
              "content-type": "application/json",
            },
          },
        );
      }),
      (this.colorCardReceiveDetail = function (t, o) {
        return request.GET(
          "".concat(app.config.bingxiHost, "/api/v1/erp/bi/sales/by-product"),
          t,
        );
      }),
      (this.dataSummary = function (t) {
        return request.GET("".concat(app.config.bingxiHost, "/api/v1/erp/dashboard/overview"), t, {
          headers: {
            "content-type": "application/json",
          },
        });
      }),
      (this.saleDataSummary = function (t) {
        return request.GET("".concat(app.config.bingxiHost, "/api/v1/erp/bi/sales/kpi"), t, {
          headers: {
            "content-type": "application/json",
          },
        });
      }),
      (this.saleCustomerData = function (t) {
        return request.GET("".concat(app.config.bingxiHost, "/api/v1/erp/bi/sales/by-customer"), t, {
          headers: {
            "content-type": "application/json",
          },
        });
      }),
      (this.saleColorCardData = function (t) {
        return request.GET("".concat(app.config.bingxiHost, "/api/v1/erp/bi/sales/by-product"), t, {
          headers: {
            "content-type": "application/json",
          },
        });
      }),
      (this.customerDataSummary = function (t) {
        return request.GET("".concat(app.config.bingxiHost, "/api/v1/erp/bi/sales/by-customer"), t, {
          headers: {
            "content-type": "application/json",
          },
        });
      }),
      (this.customerVisitList = function (t) {
        return request.GET("".concat(app.config.bingxiHost, "/api/v1/erp/page-view/stats"), t, {
          headers: {
            "content-type": "application/json",
          },
        });
      }),
      (this.addCustomerList = function (t) {
        return request.GET(
          "".concat(app.config.bingxiHost, "/app-api/stat/customer/increasedList"),
          t,
          {
            headers: {
              "content-type": "application/json",
            },
          },
        );
      }),
      (this.storeDataSummary = function (t) {
        return request.GET("".concat(app.config.bingxiHost, "/app-api/stat/goods/summary"), t, {
          headers: {
            "content-type": "application/json",
          },
        });
      }),
      (this.storeDataList = function (t) {
        return request.GET("".concat(app.config.bingxiHost, "/api/v1/erp/bi/sales/by-product"), t, {
          headers: {
            "content-type": "application/json",
          },
        });
      }),
      (this.storeDetail = function (t) {
        return request.GET("".concat(app.config.bingxiHost, "/app-api/stat/goods/info"), t, {
          headers: {
            "content-type": "application/json",
          },
        });
      }),
      (this.storeReceiveList = function (t) {
        return request.GET("".concat(app.config.bingxiHost, "/app-api/stat/goods/users"), t, {
          headers: {
            "content-type": "application/json",
          },
        });
      }),
      (this.readControl = function (t) {
        return request.GET("".concat(app.config.bingxiHost, "/app-api/loss/readNotice"), t, {
          headers: {
            "content-type": "application/json",
          },
        });
      }),
      (this.getLaststAdvertis = function (t) {
        return request.GET(
          "".concat(app.config.bingxiHost, "/app-api/ad/latest/popupAdvertisement/").concat(t),
          null,
          {
            headers: {
              "content-type": "application/json",
            },
          },
        );
      }),
      (this.getNoReadCount = function () {
        return request.GET("".concat(app.config.bingxiHost, "/api/v1/erp/notifications/unread-count"), null, {
          headers: {
            "content-type": "application/json",
          },
        });
      }),
      (this.setReadMessage = function (t) {
        return request.POST("".concat(app.config.bingxiHost, "/api/v1/erp/notifications/", t, "/read"),
          null,
          {
            headers: {
              "content-type": "application/json",
            },
          },
        );
      }));
  });
module.exports = {
  ServicesIndex: new e(),
};
