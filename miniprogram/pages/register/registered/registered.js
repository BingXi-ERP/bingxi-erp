var app = getApp();
Page({
  data: {
    headerimg: "".concat(app.config.imgHost, "/html/static/img/shop-registered-bg.png"),
  },
  toIndex: function () {
    (wx.setStorageSync("newShop", "yes"),
      wx.reLaunch({
        url: "/pages/register/login/login",
        success: function (a) {
          var t = getCurrentPages().pop();
          null != t && null != t && t.onLoad();
        },
      }));
  },
  onLoad: function (a) {
    wx.hideShareMenu();
  },
  getUserInfo: function () {
    var t = {
      token: wx.getStorageSync("token"),
    };
    wx.request({
      url: "".concat(app.config.bingxiHost, "/api/v1/erp/users/me"),
      data: t,
      complete: function (a) {},
      success: function (t) {
        0 === t.data.code
          ? ((app.globalData.userInfo = t.data.data),
            wx.setStorageSync("userRole", t.data.data.role),
            wx.setStorageSync("lastAccessShopId", t.data.data.lastAccessShopId),
            wx.setStorageSync("myShopId", t.data.data.shopId),
            wx.setStorageSync("paramShopId", t.data.data.shopId),
            wx.setStorageSync("loginToken", t.data.data.loginToken),
            wx.setStorageSync("logoutFlag", t.data.data.logoutFlag))
          : wx.showToast({
              title: t.data ? t.data.msg : "",
              icon: "none",
            });
      },
    });
  },
});
