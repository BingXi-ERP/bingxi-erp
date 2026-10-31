var e = require("../../../../../../@babel/runtime/helpers/defineProperty"),
  ServicesIndex = require("../../../../../libs/services/ServicesIndex.js").ServicesIndex,
  app = getApp();
Page({
  data: {
    password1: "",
    password2: "",
    passwordShow: !0,
    passwordShow2: !0,
    icon: {
      shape: "".concat(app.config.imgHost, "/img/customer/duibuIcon/icon/CombinedShape@2x.png"),
      eye: "".concat(app.config.imgHost, "/img/customer/duibuIcon/icon/Icon_eyes@3x.png"),
    },
  },
  handleInputVal: function (o) {
    var app = o.target.dataset.prop,
      a = o.detail.value;
    this.setData({
      app: a,
    });
  },
  handleClickIcon: function (o) {
    var app = o.target.dataset.prop;
    this.setData({
      app: !this.data[app],
    });
  },
  loginout: function () {
    (wx.showLoading({
      title: "正在退出...",
    }),
      ServicesIndex.logout().then(function (e) {
        (wx.hideLoading(),
          0 === e.code
            ? (wx.setStorageSync("logoutFlag", 1),
              wx.removeStorageSync("token"),
              wx.removeStorageSync("devToken"),
              wx.removeStorageSync("demoToken"),
              wx.removeStorageSync("productionToken"),
              wx.removeStorageSync("wxId"),
              wx.removeStorageSync("wxOpenId"),
              wx.removeStorageSync("id"),
              wx.removeStorageSync("nickName"),
              wx.removeStorageSync("mobile"),
              wx.removeStorageSync("myShopId"),
              wx.removeStorageSync("resCodeList"),
              wx.removeStorageSync("userType"),
              wx.removeStorageSync("loginToken"),
              wx.removeStorageSync("avatar"),
              wx.removeStorageSync("logoutFlag"),
              wx.removeStorageSync("fullName"),
              (app.userAuthList = []),
              (app.statisticsCount = 0),
              (app.globalData = {
                userInfo: {},
                userOpenIdFlag: "",
                token: wx.getStorageSync("token"),
                loginToken: wx.getStorageSync("loginToken"),
                logoutFlag: wx.getStorageSync("logoutFlag"),
                mpVersion: "3.2.8",
                categoriesList: [],
                mobileInfo: {},
                formIds: [],
                inChannel: "",
                subChannel: "",
                wxId: "",
              }),
              wx.reLaunch({
                url: "/pages/register/login/login",
              }))
            : wx.showToast({
                title: e.msg,
                icon: "none",
              }));
      }));
  },
  save: function () {
    var e = this;
    if (this.data.password1.length < 8 || this.data.password2.length < 8)
      wx.showToast({
        title: "密码长度最低不能小于8位",
        icon: "none",
      });
    else if (this.data.password1 && this.data.password2) {
      if (this.data.password1 === this.data.password2) {
        wx.showLoading({
          title: "努力修改中...",
        });
        var app = {
          newPsw: this.data.password1,
          confirmPsw: this.data.password2,
        };
        ServicesIndex.editLoginPsd(app).then(function (o) {
          (wx.hideLoading(),
            0 === o.code
              ? (e.setData({
                  password1: "",
                  password2: "",
                  passwordShow: !1,
                  passwordShow2: !1,
                }),
                wx.showToast({
                  title: "修改成功",
                  icon: "success",
                }),
                e.loginout())
              : wx.showToast({
                  title: o.msg,
                  icon: "none",
                }));
        });
      } else
        wx.showToast({
          title: "两次输入的密码不一致",
          icon: "none",
        });
    } else
      wx.showToast({
        title: "请先输入密码",
        icon: "none",
      });
  },
});
