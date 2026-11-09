var app = getApp(),
  ServicesUser = require("../../../libs/services/ServicesUser.js").servicesUser,
  login = require("../../../libs/utils/login.js").login;
Page({
  data: {
    icon: {
      duibuLogo: "".concat(app.config.imgHost, "/img/customer/duibuIcon/logo@2x.png"),
    },
    smsnumber: "",
    resendSeconds: 60,
    code: "",
    phoneNumber: "",
    maskedPhoneNumber: "",
  },
  onLoad: function (e) {
    (e.phoneNumber &&
      this.setData({
        phoneNumber: e.phoneNumber,
        maskedPhoneNumber: this.maskPhoneNumber(e.phoneNumber),
      }),
      this.setCodeMobile());
  },
  maskPhoneNumber: function (e) {
    return e.replace(/(\d{3})\d{4}(\d{4})/, "$1****$2");
  },
  onCodeNumberInput: function (e) {
    this.setData({
      code: e.detail.value,
    });
  },
  resendCode: function () {
    this.data.resendSeconds > 0 ||
      (this.setData({
        resendSeconds: 60,
      }),
      this.startCountdown(),
      this.setCodeMobile());
  },
  startCountdown: function () {
    var app = this,
      ServicesUser = setInterval(function () {
        var login = app.data.resendSeconds;
        --login <= 0
          ? (clearInterval(ServicesUser),
            app.setData({
              resendSeconds: null,
            }))
          : app.setData({
              resendSeconds: login,
            });
      }, 1e3);
  },
  setCodeMobile: function () {
    var app = this,
      login = this,
      t = {
        mobile: this.data.phoneNumber,
      };
    ServicesUser.sendCode(t).then(function (o) {
      if (100 === o.code)
        return (
          app.setData({
            resendSeconds: 0,
          }),
          void wx.redirectTo({
            url: "/pages/register/writeApplyInfo/writeApplyInfo?mobile=".concat(
              login.data.phoneNumber,
            ),
          })
        );
      0 === o.code
        ? (wx.showToast({
            title: "发送成功，验证码有效期为10分钟",
            icon: "none",
          }),
          login.startCountdown())
        : wx.showToast({
            title: o.msg,
            icon: "none",
          });
    });
  },
  loginByMobile: function () {
    var ServicesUser = this,
      t = this;
    (wx.showLoading({
      title: "登录中",
    }),
      wx.setStorageSync("mobile", this.data.phoneNumber));
    login.loginByMobile(this.data.phoneNumber, this.data.code, 2).then(function (n) {
      if (0 === n.code) {
        app.globalData.storeInfo = n.data.user;
        var i =
          4 === n.data.type
            ? "/pages/register/fabric-guide/index"
            : "/pages/index/index?isLogin=true";
        wx.reLaunch({
          url: i,
          success: function () {
            (wx.hideLoading(),
              wx.showToast({
                title: "登录成功",
                icon: "none",
              }));
          },
        });
      } else if (87 === n.code)
        (wx.hideLoading(),
          wx.showModal({
            content: n.msg,
            cancelText: "注册新店",
            success: function (e) {
              e.confirm ||
                (e.cancel &&
                  wx.navigateTo({
                    url: "/pages/register/writeApplyInfo/writeApplyInfo?mobile=".concat(
                      t.data.phoneNumber,
                    ),
                  }));
            },
          }));
      else if (96 === n.code)
        (wx.hideLoading(),
          wx.navigateTo({
            url: "/pages/register/writeApplyInfo/writeApplyInfo?mobile=".concat(
              ServicesUser.data.phoneNumber,
            ),
          }));
      else if (905 === n.code) {
        (wx.hideLoading(),
          wx.showToast({
            title: n.msg,
            icon: "none",
          }));
        var a = setTimeout(function () {
          (clearTimeout(a),
            wx.navigateTo({
              url: "/pages/register/infoExamine/infoExamine",
            }));
        }, 1e3);
      } else if (98 === n.code) {
        wx.hideLoading();
        var s = setTimeout(function () {
          (clearTimeout(s),
            wx.navigateTo({
              url: "/packageB/pages/personal-center/apply-account-error/apply-account-error?reason="
                .concat(n.msg, "&&phone=")
                .concat(ServicesUser.data.login_member),
            }));
        }, 1e3);
      } else if (97 === n.code) {
        wx.hideLoading();
        var r = setTimeout(function () {
          (clearTimeout(r),
            wx.navigateTo({
              url: "/packageB/pages/personal-center/apply-account/apply-account",
            }));
        }, 1e3);
      } else
        wx.showToast({
          title: n.msg,
          icon: "none",
        });
    });
  },
});
