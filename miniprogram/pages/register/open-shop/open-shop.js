var app = getApp();
require("../../../libs/services/ServicesUser.js").servicesUser;
Page({
  data: {
    image: {
      bg: "".concat(app.config.imgHost, "/img/customer/img_budadang01@3x.png"),
      bglogo: "/assets/images/icon/symbols-bg2-logo.png",
      bgbtn: "/assets/images/icon/symbols-bg2-btn.png",
    },
    imageWidth: 750,
    userInfo: null,
  },
  toRegister: function () {
    wx.navigateTo({
      url: "/pages/register/login/login",
    });
  },
  onGotUserInfo: function (e) {
    "getUserInfo:fail auth deny" == e.detail.errMsg
      ? wx.showToast({
          title: "您已取消授权，无法注册店铺",
          icon: "none",
        })
      : (this.setData({
          userInfo: e.detail.userInfo,
        }),
        wx.setStorageSync("nickName", e.detail.userInfo.nickName),
        wx.setStorageSync("avatar", e.detail.userInfo.avatarUrl));
  },
  onLoad: function (e) {
    wx.hideShareMenu();
  },
  onReady: function () {},
  onShow: function () {
    this.setData({
      imageWidth: wx.getSystemInfoSync().windowWidth,
    });
  },
});
