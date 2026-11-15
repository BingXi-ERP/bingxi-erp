var createClass = require("../../@babel/runtime/helpers/createClass"),
  classCallCheck = require("../../@babel/runtime/helpers/classCallCheck"),
  app = getApp(),
  request = require("./request.js").request,
  a = createClass(function t() {
    (classCallCheck(this, t),
      (this.addAskDetailLog = function (t) {
        // 功能 上报需求详情停留埋点
        // 调用方 packageA/pages/demand/demand-detail/demand-detail.js 的 endCountUser（不落消费响应）
        // 入参 t 旧载荷 {askId, stayTime}
        // 传给谁 本仓行为埋点写口 POST /api/v1/erp/behavior（route-snapshot.txt 第 1077 行
        //   record_behavior，backend/src/handlers/tracking_handler.rs 的 BehaviorRequest），
        //   旧载荷整体放进 event_data 键，event_type 取稳定事件名 addAskDetailLog
        // 存什么 不落本地；旧 ask 日志读侧词表与本仓 behavior 表不存在对应，形态差异登记交付报告
        // 存哪里 服务端行为分析域（analytics），经 packageA 请求层与 apiGateway 契约层发出
        return request.POST("".concat(app.config.bingxiHost, "/api/v1/erp/behavior"), {
          event_type: "addAskDetailLog",
          event_data: t,
        });
      }),
      (this.demandList = function (t) {
        return request.GET("".concat(app.config.bingxiHost, "/app-api/goods/ask/askList"), t);
      }),
      (this.getCategory = function (t) {
        return request.GET(
          "".concat(app.config.bingxiHost, "/app-api/goods/ask/shopCategoryList"),
          t,
        );
      }),
      (this.getBottomCategory = function (t) {
        return request.GET(
          "".concat(app.config.bingxiHost, "/app-api/goods/ask/getBottomTypeList"),
          t,
        );
      }),
      (this.demandDetail = function (t) {
        return request.GET("".concat(app.config.bingxiHost, "/app-api/goods/ask/detail"), t);
      }),
      (this.getMyJoinList = function (t) {
        var classCallCheck = t.shopId,
          a = t.status,
          c = t.keyword,
          e = t.pageNum,
          s = t.pageSize;
        return request.GET(
          "".concat(app.config.bingxiHost, "/app-api/goods/ask/joinAskList"),
          classCallCheck,
          a,
          c,
          e,
          s,
        );
      }),
      (this.getAskProcess = function (t) {
        var classCallCheck = t.id;
        return request.GET("".concat(app.config.bingxiHost, "/app-api/goods/ask/getAskProcess"), {
          id: classCallCheck,
        });
      }),
      (this.addDemand = function (t) {
        return request.POST("".concat(app.config.bingxiHost, "/app-api/goods/ask/add"), t, {
          headers: {
            "content-type": "application/json",
          },
        });
      }),
      (this.getReDemand = function (t) {
        var classCallCheck = t.id;
        return request.GET("".concat(app.config.bingxiHost, "/app-api/goods/ask/oldAskDetail"), {
          id: classCallCheck,
        });
      }),
      (this.matchList = function (t) {
        return request.GET("".concat(app.config.bingxiHost, "/app-api/goods/ask/matchList"), t);
      }),
      (this.matchDetail = function (t) {
        return request.GET("".concat(app.config.bingxiHost, "/app-api/goods/ask/matchDetail"), t);
      }),
      (this.contactLog = function (t) {
        // 功能 上报联系商家动作埋点，本仓写口只认 POST 请求体
        // 调用方 packageA/pages/demand/demand-detail/demand-detail.js 的 makeCall 与
        //   my-post-result-detail.js 的 showService，两腿只读 code 与 msg，失败经传输层外显
        // 入参 t 旧载荷 {replyId}
        // 传给谁 本仓行为埋点写口 POST /api/v1/erp/behavior（route-snapshot.txt 第 1077 行
        //   record_behavior，backend/src/handlers/tracking_handler.rs 的 BehaviorRequest）
        // 存什么 不落本地；event_type 取稳定事件名 addContactLog，旧载荷放进 event_data；
        //   响应回的是埋点写口信封，读方按 code 判成败的形状不变
        // 存哪里 服务端行为分析域（analytics）
        return request.POST("".concat(app.config.bingxiHost, "/api/v1/erp/behavior"), {
          event_type: "addContactLog",
          event_data: t,
        });
      }),
      (this.addPrice = function (t) {
        return request.POST("".concat(app.config.bingxiHost, "/app-api/goods/ask/addPrice"), t, {
          headers: {
            "content-type": "application/json",
          },
        });
      }),
      (this.editPrice = function (t) {
        return request.POST("".concat(app.config.bingxiHost, "/app-api/goods/ask/editPrice"), t, {
          headers: {
            "content-type": "application/json",
          },
        });
      }),
      (this.addSearchHistory = function (t) {
        // 功能 上报需求搜索动作埋点，本仓搜索历史的列表与删除只走 wx.storage 本地键
        //   joinHistoryList 与 postHistoryList，这条网络腿纯上报，读侧不依赖它
        // 调用方 packageA/pages/demand/search-demand/search-demand.js 的 setStorage（响应只进 console.log）
        // 入参 t 旧载荷 {keyword, sourceType, searchType}
        // 传给谁 本仓行为埋点写口 POST /api/v1/erp/behavior（route-snapshot.txt 第 1077 行
        //   record_behavior，backend/src/handlers/tracking_handler.rs 的 BehaviorRequest）
        // 存什么 不落本地；event_type 取稳定事件名 addSearchHistory，旧载荷放进 event_data
        // 存哪里 服务端行为分析域（analytics）
        return request.POST("".concat(app.config.bingxiHost, "/api/v1/erp/behavior"), {
          event_type: "addSearchHistory",
          event_data: t,
        });
      }),
      (this.myJoinList = function (t) {
        return request.GET("".concat(app.config.bingxiHost, "/app-api/goods/ask/joinAskList"), t);
      }),
      (this.myPostList = function (t) {
        return request.GET("".concat(app.config.bingxiHost, "/app-api/goods/ask/myAskList"), t);
      }),
      (this.closeDemand = function (t) {
        return request.GET("".concat(app.config.bingxiHost, "/app-api/goods/ask/close"), t, {
          headers: {
            "content-type": "application/json",
          },
        });
      }),
      (this.otherPost = function (t) {
        return request.GET("".concat(app.config.bingxiHost, "/app-api/goods/ask/merPriceDetail"), t);
      }),
      (this.saveNoMatch = function (t) {
        return request.GET("".concat(app.config.bingxiHost, "/app-api/goods/ask/saveNoMatch"), t);
      }),
      (this.getCrmAboutSum = function (t) {
        return request.GET(
          "".concat(app.config.bingxiHost, "/app-api/customer/two/reconciliation/totalSum"),
          t,
        );
      }),
      (this.getCrmBalanceDueList = function (t) {
        return request.GET("".concat(app.config.bingxiHost, "/api/v1/erp/ar-reconciliations"),
          t,
        );
      }),
      (this.getCrmDebtAmount = function (t) {
        return request.POST(
          "".concat(app.config.bingxiHost, "/app-api/customer/two/reconciliation/customerDebtAmount"),
          t,
        );
      }),
      (this.getCrmSaleBillingList = function (t) {
        return request.POST(
          "".concat(
            app.config.bingxiHost,
            "/app-api/customer/two/reconciliation/customerSaleBillingList",
          ),
          t,
        );
      }),
      (this.getPrintSetting = function (t) {
        return request.GET(
          "".concat(app.config.bingxiHost, "/app-api/customer/two/reconciliation/getPrintSetting"),
          t,
        );
      }),
      (this.previewDue = function (t, o) {
        return request.POST(
          ""
            .concat(app.config.bingxiHost, "/app-api/customer/two/reconciliation/previewImage/")
            .concat(t),
          o,
        );
      }),
      (this.printDue = function (t, o) {
        return request.POST(
          "".concat(app.config.bingxiHost, "/app-api/customer/two/reconciliation/print/").concat(t),
          o,
          {
            headers: {
              "content-type": "application/json",
            },
          },
        );
      }),
      (this.previewAllDue = function (t) {
        return request.POST(
          "".concat(
            app.config.bingxiHost,
            "/app-api/customer/two/reconciliation/previewImageCustomers",
          ),
          t,
          {
            headers: {
              "content-type": "application/json",
            },
          },
        );
      }),
      (this.printAllDue = function (t) {
        return request.POST(
          "".concat(app.config.bingxiHost, "/app-api/customer/two/reconciliation/printCustomers"),
          t,
          {
            headers: {
              "content-type": "application/json",
            },
          },
        );
      }),
      (this.batchPayment = function (t) {
        return request.POST("".concat(app.config.bingxiHost, "/api/v1/erp/ar/payments"),
          t,
        );
      }),
      (this.batchRefundment = function (t) {
        return request.POST(
          "".concat(app.config.bingxiHost, "/app-api/customer/two/reconciliation/batchRefundment"),
          t,
        );
      }),
      (this.shopPaymentList = function (t) {
        return request.GET("".concat(app.config.bingxiHost, "/api/v1/erp/ar/payments"),
          t,
        );
      }),
      (this.saveRefundment = function (t) {
        return request.POST("".concat(app.config.bingxiHost, "/api/v1/erp/sales/sales-returns"),
          t,
          {
            headers: {
              "content-type": "application/json",
            },
          },
        );
      }),
      (this.oneKeyHexiao = function (t) {
        return request.GET(
          ""
            .concat(app.config.bingxiHost, "/app-api/customer/two/reconciliation/verification/")
            .concat(t),
        );
      }));
  });
module.exports = {
  ServicesDemand: new a(),
};
