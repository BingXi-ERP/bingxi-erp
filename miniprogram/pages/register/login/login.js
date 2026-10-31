var e = (0, require("../../../@babel/runtime/helpers/interopRequireDefault").default)(
    require("../../../miniprogram_npm/@vant/weapp/dialog/dialog"),
  ),
  app = getApp(),
  login = require("../../../libs/utils/login.js").login,
  apiGateway = require("../../../libs/utils/apiGateway.js");
Page({
  data: {
    icon: {
      duibuLogo: "".concat(app.config.imgHost, "/img/customer/duibuIcon/logo@2x.png"),
      weChat: "".concat(app.config.imgHost, "/img/customer/duibuIcon/weixin@2x.png"),
    },
    isAgreed: !1,
    checked: !0,
    phoneNumber: "",
    areaCode: "86",
    showDialog: !1,
  },
  onShow: function () {
    app.areaCode &&
      this.setData({
        areaCode: app.areaCode,
      });
  },
  getPhoneNumber: function (e) {
    var app = this;
    "getPhoneNumber:ok" === e.detail.errMsg
      ? wx.getUserInfo({
          success: function (i) {
            ((i.phoneKey = e.detail.code), app.loginByWX(i));
          },
          fail: function () {
            wx.showToast({
              title: "获取用户信息失败",
              icon: "none",
            });
          },
        })
      : wx.showToast({
          title: "取消授权",
          icon: "none",
        });
  },
  loginByWX: function (e) {
    var app = this;
    this.data.isAgreed
      ? (wx.showLoading({
          title: "登录中",
        }),
        wx.login({
          success: function (t) {
            "login:ok" == t.errMsg
              ? login.loginByWX(t.code, e).then(function (e) {
                  if ((wx.hideLoading(), 0 === e.code && apiGateway.isLoggedIn())) {
                    var login =
                      4 === e.data.type
                        ? "/pages/register/fabric-guide/index"
                        : "/pages/index/index";
                    wx.reLaunch({
                      url: login,
                      success: function () {
                        wx.showToast({
                          title: "登录成功",
                          icon: "none",
                        });
                      },
                    });
                  } else if (905 === e.code) {
                    (wx.showToast({
                      title: e.msg,
                      icon: "none",
                      duration: 3e3,
                    }),
                      wx.setStorageSync("mobile", e.data.mobile));
                    var t = setTimeout(function () {
                      (clearTimeout(t),
                        wx.navigateTo({
                          url: "/pages/register/infoExamine/infoExamine",
                        }));
                    }, 1e3);
                  } else
                    95 === e.code
                      ? app.showWxLogin(e.data)
                      : 70700106 === e.code
                        ? (wx.hideToast(),
                          app.setData({
                            showPop: !0,
                          }))
                        : wx.showToast({
                            title:
                              e.msg ||
                              (0 === e.code ? "登录状态未确认，请重试" : "登录失败"),
                            icon: "none",
                            duration: 3e3,
                          });
                })
              : (wx.hideLoading(),
                wx.showToast({
                  title: "取消授权",
                  icon: "none",
                  duration: 3e3,
                }));
          },
        }))
      : wx.showToast({
          title: "请先同意服务协议和隐私政策",
          icon: "none",
          duration: 1500,
        });
  },
  toggleAgreement: function () {
    this.setData({
      isAgreed: !this.data.isAgreed,
    });
  },
  handleAgreementChange: function (e) {
    this.setData({
      isAgreed: e.detail,
    });
  },
  onPhoneNumberInput: function (e) {
    this.setData({
      phoneNumber: e.detail.value,
    });
  },
  chooseAreaCode: function () {
    wx.navigateTo({
      url: "/packageC/pages/areaCode/areaCode",
    });
  },
  navigateToNextPage: function () {
    var app,
      login = this,
      t = this.data.phoneNumber;
    11 === t.length && /^1[3-9]\d{9}$/.test(t)
      ? null !== (o = this.data) && void 0 !== app && app.isAgreed
        ? wx.navigateTo({
            url: "/pages/register/verifyCode/verifyCode?phoneNumber=".concat(t),
          })
        : e.default
            .confirm({
              message: "是否同意服务协议和隐私政策并进行下一步？",
            })
            .then(function () {
              (wx.navigateTo({
                url: "/pages/register/verifyCode/verifyCode?phoneNumber=".concat(t),
              }),
                login.setData({
                  isAgreed: !0,
                }));
            })
            .catch(function () {})
      : this.setData({
          showDialog: !0,
        });
  },
  handleCloseDialog: function () {
    this.setData({
      showDialog: !1,
    });
  },
});
