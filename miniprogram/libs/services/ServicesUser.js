var t = require("../../@babel/runtime/helpers/interopRequireDefault").default,
  createClass = require("../../@babel/runtime/helpers/createClass"),
  classCallCheck = require("../../@babel/runtime/helpers/classCallCheck"),
  getWxInfo = t(require("../utils/getWxInfo")),
  apiGateway = require("../utils/apiGateway.js"),
  app = getApp(),
  request = require("./request.js").request,
  s = createClass(function t(o) {
    var s = this;
    (classCallCheck(this, t),
      (this.countInvite = function (t) {
        var createClass = t.type;
        return request.GET("".concat(app.config.bingxiHost, "/app-api/loss/operateAccess"), {
          type: createClass,
        });
      }),
      (this.userInit = function () {
        return new Promise(function (t, o) {
          wx.login({
            success: function (o) {
              if ("login:ok" == o.errMsg) {
                var classCallCheck = {
                  code: o.code,
                };
                (console.log(classCallCheck),
                  s.login(classCallCheck).then(function (o) {
                    if (0 === o.code) {
                      switch (app.environment) {
                        case "dev":
                          wx.setStorageSync("devToken", o.data.token);
                          break;
                        case "demo":
                          wx.setStorageSync("demoToken", o.data.token);
                          break;
                        case "production":
                          wx.setStorageSync("productionToken", o.data.token);
                      }
                      (wx.setStorageSync("token", o.data.token),
                        wx.setStorageSync("id", o.data.id),
                        wx.setStorageSync("logoutFlag", o.data.logoutFlag),
                        t(o));
                    } else
                      wx.showToast({
                        title: o ? o.msg : "",
                        icon: "none",
                      });
                  }));
              } else
                wx.showToast({
                  title: o ? o.errMsg : "",
                  icon: "none",
                });
            },
          });
        });
      }),
      (this.checkToken = function (t) {
        return !0;
      }),
      (this.login = function (t) {
        return request.POST("".concat(app.config.bingxiHost, "/api/v1/erp/auth/login"), t);
      }),
      (this.login2 = function (t) {
        return new Promise(function (o, n) {
          var __g = apiGateway.adapt("".concat(app.config.bingxiHost, "/api/v1/erp/auth/login"), "POST", t),
            getWxInfo = {
              "App-User-Agent": app.AppUserAgent,
              terminalSource: 6,
            };
          Object.assign(getWxInfo, apiGateway.authHeaders(__g.isBingxi, "POST"));
          wx.request({
            url: __g.url,
            data: __g.data,
            method: "POST",
            header: getWxInfo,
            complete: function (t) {},
            success: function (t) {
              o(apiGateway.adaptLogin(t.data, __g.isBingxi));
            },
            fail: function (t) {
              n(t);
            },
          });
        });
      }),
      (this.logout = function (t) {
        return request.POST("".concat(app.config.bingxiHost, "/api/v1/erp/auth/logout"), t);
      }),
      (this.uploadUserInfo = function (t) {
        return request.POST("".concat(app.config.bingxiHost, "/app-api/user"), t);
      }),
      (this.getUserInfo = function (t) {
        return app.globalData.wxCode
          ? request.GET("".concat(app.config.bingxiHost, "/api/v1/erp/users/me"), t)
          : getWxInfo.default.getWxCode().then(function (o) {
              return request.GET("".concat(app.config.bingxiHost, "/api/v1/erp/users/me"), t);
            });
      }),
      (this.sendCode = function (t) {
        return request.GET(
          "".concat(app.config.bingxiHost, "/app-api/send/message/login/").concat(t.mobile),
          t,
        );
      }),
      (this.wxSendCode = function (t) {
        return request.GET("".concat(app.config.bingxiHost, "/app-api/user/wx/register/sendCode"), t);
      }),
      (this.sendChildrenCode = function (t) {
        return request.POST(
          "".concat(app.config.bingxiHost, "/app-api/user/subAccount/sendVerCode"),
          t,
        );
      }),
      (this.bindWX = function (t) {
        return request.POST("".concat(app.config.bingxiHost, "/app-api/setting/bindWechat"), t);
      }),
      (this.unbindWx = function (t) {
        return request.POST("".concat(app.config.bingxiHost, "/app-api/setting/unbindWechat"), t);
      }),
      (this.subAccountLogin = function (t) {
        return request.POST("".concat(app.config.bingxiHost, "/api/v1/erp/users"), t);
      }),
      (this.subAccountSendCode = function (t) {
        return request.GET(
          ""
            .concat(app.config.bingxiHost, "/app-api/send/message/account/children/")
            .concat(t.mobile),
          t,
        );
      }),
      (this.requestPost = function (t, o) {
        return request.POST(o, t);
      }),
      (this.saveBankAccount = function (t) {
        return request.POST("".concat(app.config.bingxiHost, "/app-api/setting/bankAccount/add"), t);
      }),
      (this.bankAccountList = function (t) {
        return request.POST(
          "".concat(app.config.bingxiHost, "/app-api/setting/bankAccount/view"),
          t,
          {
            headers: {
              "content-type": "application/x-www-form-urlencoded",
            },
          },
        );
      }),
      (this.bankList = function (t) {
        return request.POST(
          "".concat(app.config.bingxiHost, "/app-api/setting/baseBankAccountList"),
          t,
        );
      }),
      (this.getChannel = function (t) {
        return request.POST("".concat(app.config.bingxiHost, "/api/v1/erp/page-view"), t, {
          headers: {
            "content-type": "application/json",
          },
        });
      }),
      (this.logAccessPage = function (t) {
        return request.GET("".concat(app.config.bingxiHost, "/api/v1/erp/page-view/stats"), t, {
          headers: {
            "content-type": "application/json",
          },
        });
      }));
  });
module.exports = {
  servicesUser: new s(),
};
