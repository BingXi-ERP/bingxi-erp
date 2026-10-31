var ServicesIndex = require("../../../../../libs/services/ServicesIndex.js").ServicesIndex,
  ServicesUser = require("../../../../../libs/services/ServicesUser.js").servicesUser,
  util = require("../../../../../libs/utils/util.js").utils,
  app = getApp();
Page({
  data: {
    types: "add",
    mobile: "",
    code: "",
  },
  test_code: function (e) {
    this.setData({
      code: e.detail.value,
    });
  },
  toChange: function (t) {
    var util = this;
    if ("" != this.data.code) {
      var n = this,
        s = {
          mobile: this.data.mobile,
          code: this.data.code,
        };
      ("add" == n.data.types
        ? "".concat(app.config.bingxiHost, "/app-api/user/bindMobile")
        : "".concat(app.config.bingxiHost, "/app-api/setting/changeMobile"),
        ServicesIndex.changeMobile(s).then(function (e) {
          if ((wx.hideLoading(), 0 === e.code)) {
            var ServicesUser = "";
            "add" == n.data.types
              ? ((t = "add" == n.data.types ? "绑定手机号成功" : "更改手机号成功"),
                wx.showToast({
                  title: ServicesUser,
                  icon: "success",
                }),
                n.getUserInfo(),
                wx.setStorageSync("mobile", util.data.mobile),
                wx.navigateBack({
                  delta: 3,
                }))
              : ((t = "更改手机号成功"),
                wx.showToast({
                  title: ServicesUser,
                  icon: "success",
                }),
                setTimeout(function () {
                  wx.reLaunch({
                    url: "/pages/register/login/login",
                  });
                }, 600));
          } else
            wx.showToast({
              title: e.msg,
              icon: "none",
            });
        }));
    } else
      wx.showToast({
        title: "请输入验证码",
        icon: "none",
        duration: 1e3,
      });
  },
  getUserInfo: function () {
    ServicesUser.getUserInfo({}).then(function (e) {
      if (0 === e.code) {
        switch (
          ((app.globalData.userInfo = e.data),
          wx.setStorageSync("wxOpenId", e.data.wxOpenId),
          wx.setStorageSync("wxId", e.data.wxId),
          app.environment)
        ) {
          case "dev":
            wx.setStorageSync("devToken", e.data.token);
            break;
          case "demo":
            wx.setStorageSync("demoToken", e.data.token);
            break;
          case "production":
            wx.setStorageSync("productionToken", e.data.token);
        }
        (wx.setStorageSync("token", e.data.token),
          wx.setStorageSync("loginToken", e.data.loginToken),
          wx.setStorageSync("logoutFlag", e.data.logoutFlag),
          wx.setStorageSync("id", e.data.id),
          wx.setStorageSync("myShopId", e.data.shopId),
          wx.setStorageSync("nickName", e.data.nickName),
          wx.setStorageSync("mobile", e.data.mobile),
          "" == e.data.headImg
            ? wx.setStorageSync("avatar", util.addDefaultAvatar())
            : wx.setStorageSync("avatar", e.data.headImg),
          wx.setStorageSync("fullName", e.data.fullName),
          wx.setStorageSync("resCodeList", e.data.resCodeList));
      } else
        wx.showToast({
          title: e.msg,
          icon: "none",
        });
    });
  },
  onLoad: function (e) {
    (null != e.type &&
      this.setData({
        types: e.type,
        mobile: e.mobile,
      }),
      wx.hideShareMenu());
  },
  onReady: function () {},
  onShow: function () {},
  onHide: function () {},
  onUnload: function () {},
  onPullDownRefresh: function () {},
  onReachBottom: function () {},
  onShareAppMessage: function () {},
});
