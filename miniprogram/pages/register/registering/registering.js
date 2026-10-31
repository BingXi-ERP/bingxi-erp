var app = getApp();
Page({
  data: {
    showBtn: !0,
    headerimg: "".concat(app.config.imgHost, "/html/static/img/shop-registered-bg.png"),
  },
  onLoad: function (a) {
    (wx.hideShareMenu(), this.getUserInfo());
  },
  toLogin: function () {
    (1 == getApp().globalData.userInfo.role && wx.setStorageSync("newShop", "yes"),
      wx.reLaunch({
        url: "/pages/register/login/login",
        success: function (a) {
          var t = getCurrentPages().pop();
          null != t && null != t && t.onLoad();
        },
      }));
  },
  getUserInfo: function () {
    wx.showLoading({
      title: "加载中...",
    });
    var t = this,
      o = {
        token: wx.getStorageSync("token"),
      };
    wx.request({
      url: "".concat(app.config.bingxiHost, "/app-api/user/detai"),
      data: o,
      complete: function (a) {},
      success: function (a) {
        0 === a.data.code
          ? ((getApp().globalData.userInfo = a.data.data),
            wx.setStorageSync("userRole", a.data.data.role),
            wx.setStorageSync("lastAccessShopId", a.data.data.lastAccessShopId),
            wx.setStorageSync("loginToken", a.data.data.loginToken),
            wx.setStorageSync("logoutFlag", a.data.data.logoutFlag),
            null === a.data.data.lastAccessShopId && 0 == a.data.data.role
              ? t.setData({
                  showBtn: !1,
                })
              : t.setData({
                  showBtn: !0,
                }),
            null != a.data.data.shopId &&
              (wx.setStorageSync("myShopId", a.data.data.shopId),
              wx.setStorageSync("paramShopId", a.data.data.shopId)),
            wx.hideLoading())
          : (wx.hideLoading(),
            wx.showToast({
              title: a.data.msg.result,
              icon: "none",
            }));
      },
      fail: function () {
        wx.hideLoading();
      },
    });
  },
});
