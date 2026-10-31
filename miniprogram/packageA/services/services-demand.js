var createClass = require("../../@babel/runtime/helpers/createClass"),
  classCallCheck = require("../../@babel/runtime/helpers/classCallCheck"),
  app = getApp(),
  request = require("./request.js").request,
  a = createClass(function t() {
    (classCallCheck(this, t),
      (this.addAskDetailLog = function (t) {
        return request.POST(
          "".concat(app.config.bingxiHost, "/app-api/access/log/ask/addAskDetailLog"),
          t,
          {
            headers: {
              "content-type": "application/json",
            },
          },
        );
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
        return request.GET(
          "".concat(app.config.bingxiHost, "/app-api/access/log/ask/addContactLog"),
          t,
        );
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
        return request.POST("".concat(app.config.bingxiHost, "/app-api/access/addSearchHistory"), t, {
          headers: {
            "content-type": "application/json",
          },
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
