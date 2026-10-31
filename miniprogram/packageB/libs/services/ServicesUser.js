var createClass = require("../../../@babel/runtime/helpers/createClass"),
  classCallCheck = require("../../../@babel/runtime/helpers/classCallCheck"),
  app = getApp(),
  request = require("./request.js").request,
  c = createClass(function t(c) {
    var i = this;
    (classCallCheck(this, t),
      (this.userInit = function () {
        return new Promise(function (t, n) {
          wx.login({
            success: function (n) {
              if ("login:ok" == n.errMsg) {
                var request = {
                  code: n.code,
                };
                i.login(request).then(function (n) {
                  if (0 === n.code) {
                    switch (app.environment) {
                      case "dev":
                        wx.setStorageSync("devToken", n.data.token);
                        break;
                      case "demo":
                        wx.setStorageSync("demoToken", n.data.token);
                        break;
                      case "production":
                        wx.setStorageSync("productionToken", n.data.token);
                    }
                    (wx.setStorageSync("token", n.data.token),
                      wx.setStorageSync("id", n.data.id),
                      wx.setStorageSync("logoutFlag", n.data.logoutFlag),
                      t(n));
                  } else
                    wx.showToast({
                      title: n.msg,
                      icon: "none",
                    });
                });
              } else
                wx.showToast({
                  title: n.errMsg,
                  icon: "none",
                });
            },
          });
        });
      }),
      (this.checkToken = function (t) {
        return request.GET("".concat(app.config.bingxiHost, "/api/v1/erp/users/me"), t);
      }),
      (this.login = function (t) {
        return request.POST("".concat(app.config.bingxiHost, "/api/v1/erp/auth/login"), t);
      }),
      (this.login2 = function (t) {
        return new Promise(function (n, e) {
          var c = {
            "content-type": "application/x-www-form-urlencoded",
            "App-User-Agent": app.AppUserAgent,
          };
          wx.request({
            url: "".concat(app.config.bingxiHost, "/api/v1/erp/auth/login"),
            data: t,
            method: "POST",
            header: c,
            complete: function (t) {},
            success: function (t) {
              (0 === t.data.code ||
                wx.showToast({
                  title: t.data.msg.result,
                  icon: "none",
                }),
                n(t.data));
            },
            fail: function (t) {
              e(t);
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
        app.globalData.wxCode;
        return request.GET("".concat(app.config.bingxiHost, "/api/v1/erp/users/me"), t);
      }),
      (this.sendCode = function (t) {
        return request.GET("".concat(app.config.bingxiHost, "/app-api/user/sendCode"), t);
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
      (this.requestPost = function (t, n) {
        var app =
          n.indexOf("/setting/unbindWechat") > -1
            ? "application/x-www-form-urlencoded"
            : "application/json";
        return request.POST(n, t, {
          headers: {
            "content-type": app,
          },
        });
      }),
      (this.saveBankAccount = function (t) {
        return request.POST("".concat(app.config.bingxiHost, "/app-api/setting/bankAccount/add"), t);
      }),
      (this.delBankAccount = function (t) {
        return request.POST(
          "".concat(app.config.bingxiHost, "/app-api/setting/bankAccount/remove"),
          t,
          {
            headers: {
              "content-type": "application/x-www-form-urlencoded",
            },
          },
        );
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
      }));
  });
module.exports = {
  servicesUser: new c(),
};
