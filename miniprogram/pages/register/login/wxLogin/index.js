(0, require("../../../../@babel/runtime/helpers/interopRequireDefault").default)(
  require("../../../../libs/utils/getWxInfo"),
);
var app = getApp(),
  ServicesUser = require("../../../../libs/services/ServicesUser.js").servicesUser,
  login = require("../../../../libs/utils/login.js").login,
  n = null;
Page({
  data: {
    check: !0,
    login_member: "",
    login_code: "",
    currentTime: 61,
    codeName: "获取验证码",
    disable: !0,
    disabled: !1,
    showPop: !1,
    icon: {
      stopHeader: "".concat(
        app.config.imgHost,
        "/img/v2.7.9/Popup_header@2x.png?imageView2/2/w/800",
      ),
      logo: "".concat(app.config.imgHost, "/img/customer/login-logo.png"),
      tips: "".concat(app.config.imgHost, "/img/customer/Popup_Announcement20190415@2x.png"),
      weChat: "".concat(app.config.imgHost, "/img/customer/Icon_Wechat.png"),
      delImage: "".concat(app.config.imgHost, "/img/customer/duibuIcon/icon/del@2x.png"),
    },
  },
  contact: function () {
    var ServicesUser = this;
    wx.showActionSheet({
      itemList: [app.customsPhoneNum],
      itemColor: "#4C7CF9",
      success: function (e) {
        ServicesUser.makeCall(e.tapIndex);
      },
      fail: function (e) {
        console.log(e.errMsg);
      },
    });
  },
  makeCall: function (o) {
    wx.makePhoneCall({
      phoneNumber: app.customsPhoneNum,
    });
  },
  input_val: function (e) {
    var ServicesUser = e.detail.value;
    this.setData({
      login_member: ServicesUser,
    });
  },
  code_val: function (e) {
    var ServicesUser = e.detail.value;
    this.setData({
      login_code: ServicesUser,
      disable: !1,
    });
  },
  clearInput: function (e) {
    (0 == e.currentTarget.id &&
      this.setData({
        login_member: "",
      }),
      1 == e.currentTarget.id &&
        this.setData({
          login_code: "",
          disable: !0,
        }));
  },
  getVerificationCode: function () {
    if (11 == this.data.login_member.length) {
      if (/^1\d{10}$/.test(this.data.login_member)) {
        this.setCodeMobile();
      } else
        wx.showToast({
          title: "请输入正确的手机号",
          icon: "none",
          duration: 1e3,
        });
    } else
      wx.showToast({
        title: "请输入完整手机号",
        icon: "none",
        duration: 1e3,
      });
  },
  getCode: function (e) {
    var ServicesUser = this,
      login = ServicesUser.data.currentTime;
    n = setInterval(function () {
      (login--,
        ServicesUser.setData({
          codeName: "重新获取(" + login + ")",
        }),
        login <= 0 &&
          (clearInterval(n),
          ServicesUser.setData({
            codeName: "获取验证码",
            currentTime: 61,
            disabled: !1,
          })));
    }, 1e3);
  },
  setCodeMobile: function () {
    var login = this,
      n = {
        mobile: this.data.login_member,
        wxId: app.globalData.wxId,
      };
    (login.setData({
      disabled: !0,
    }),
      ServicesUser.sendCode(n).then(function (e) {
        0 === e.code
          ? (wx.showToast({
              title: "发送成功，验证码有效期为10分钟",
              icon: "none",
            }),
            login.getCode())
          : (wx.showToast({
              title: e.msg,
              icon: "none",
            }),
            login.setData({
              disabled: !1,
            }));
      }));
  },
  loginByMobile: function (e) {
    var ServicesUser = this,
      n = this;
    "" != this.data.login_member
      ? "" != this.data.login_code
        ? (wx.showLoading({
            title: "登录中",
          }),
          wx.setStorageSync("mobile", this.data.login_member),
          wx.login({
            success: function (i) {
              "login:ok" == i.errMsg &&
                "getUserInfo:ok" == e.detail.errMsg &&
                login
                  .loginByWX(
                    i.code,
                    e,
                    ServicesUser.data.login_code,
                    ServicesUser.data.login_member,
                  )
                  .then(function (e) {
                    if (0 === e.code)
                      wx.reLaunch({
                        url: "/pages/index/index",
                        success: function () {
                          (ServicesUser.setData({
                            showPop: !1,
                          }),
                            wx.hideLoading(),
                            wx.showToast({
                              title: "登录成功",
                              icon: "none",
                            }));
                        },
                      });
                    else if (87 === i.code)
                      (wx.hideLoading(),
                        wx.showModal({
                          content: i.msg,
                          cancelText: "注册新店",
                          success: function (e) {
                            e.confirm ||
                              (e.cancel &&
                                wx.navigateTo({
                                  url: "/pages/register/writeApplyInfo/writeApplyInfo?mobile=".concat(
                                    n.data.login_member,
                                  ),
                                }));
                          },
                        }));
                    else if (96 === e.code)
                      wx.navigateTo({
                        url: "/pages/register/writeApplyInfo/writeApplyInfo?mobile=".concat(
                          ServicesUser.data.login_member,
                        ),
                      });
                    else if (70700106 === e.code)
                      (wx.hideToast(),
                        ServicesUser.setData({
                          showPop: !0,
                        }));
                    else if (905 === e.code) {
                      wx.showToast({
                        title: e.msg,
                        icon: "none",
                        duration: 3e3,
                      });
                      var login = setTimeout(function () {
                        (clearTimeout(login),
                          wx.navigateTo({
                            url: "/pages/register/infoExamine/infoExamine",
                          }));
                      }, 1e3);
                    } else if (98 === e.code)
                      var a = setTimeout(function () {
                        (clearTimeout(a),
                          wx.navigateTo({
                            url: "/packageB/pages/personal-center/apply-account-error/apply-account-error?reason="
                              .concat(e.msg, "&&phone=")
                              .concat(ServicesUser.data.login_member),
                          }));
                      }, 1e3);
                    else if (97 === e.code)
                      var s = setTimeout(function () {
                        (clearTimeout(s),
                          wx.navigateTo({
                            url: "/packageB/pages/personal-center/apply-account/apply-account",
                          }));
                      }, 1e3);
                  });
            },
          }))
        : wx.showToast({
            title: "请输入验证码",
            icon: "none",
            duration: 1e3,
          })
      : wx.showToast({
          title: "请输入手机号",
          icon: "none",
          duration: 1e3,
        });
  },
  onLoad: function (o) {
    this.setData({
      customsPhoneNum: app.customsPhoneNum,
    });
  },
  onReady: function () {},
  onShow: function () {},
  onHide: function () {},
  onUnload: function () {},
  onPullDownRefresh: function () {},
  onReachBottom: function () {},
  onShareAppMessage: function () {},
});
