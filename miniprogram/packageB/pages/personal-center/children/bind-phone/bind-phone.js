var e = null,
  ServicesUser = require("../../../../libs/services/ServicesUser.js").servicesUser,
  login = require("../../../../libs/utils/login.js").login;
require("../../../../libs/utils/util.js").utils;
Page({
  data: {
    login_member: "",
    login_code: "",
    currentTime: 61,
    codeName: "获取验证码",
    disable: !0,
    disabled: !1,
  },
  onLoad: function (e) {
    wx.hideShareMenu();
  },
  onReady: function () {},
  onShow: function () {},
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
  getVerificationCode: function () {
    if (11 == this.data.login_member.length) {
      if (/^1\d{10}$/.test(this.data.login_member)) {
        (this.getCode(), this.setCodeMobile());
        this.setData({
          disabled: !0,
        });
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
  getCode: function (t) {
    var login = this,
      o = login.data.currentTime;
    e = setInterval(function () {
      (o--,
        login.setData({
          codeName: "(" + o + ")重新获取",
        }),
        o <= 0 &&
          (clearInterval(e),
          login.setData({
            codeName: "获取验证码",
            currentTime: 61,
            disabled: !1,
          })));
    }, 1e3);
  },
  setCodeMobile: function () {
    var e = {
      mobile: this.data.login_member,
    };
    ServicesUser.sendChildrenCode(e).then(function (e) {
      0 === e.code
        ? wx.showToast({
            title: "发送成功，验证码有效期为10分钟",
            icon: "none",
          })
        : wx.showToast({
            title: e.msg,
            icon: "none",
          });
    });
  },
  upLoadPhone: function () {
    if ("" != this.data.login_member) {
      if ("" != this.data.login_code) {
        var e = this,
          o = {
            mobile: this.data.login_member,
          };
        ServicesUser.uploadUserInfo(o).then(function (t) {
          0 === t.code
            ? (console.log("getApp().globalData.userInfo", getApp().globalData.userInfo),
              login.getUserInfo(e.navigateToBack))
            : wx.showToast({
                title: t.msg,
                icon: "none",
              });
        });
      } else
        wx.showToast({
          title: "请输入验证码",
          icon: "none",
          duration: 1e3,
        });
    } else
      wx.showToast({
        title: "请输入手机号",
        icon: "none",
        duration: 1e3,
      });
  },
  navigateToBack: function () {
    wx.navigateBack({
      delta: 1,
    });
  },
});
