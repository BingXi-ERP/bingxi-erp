var ServicesUser = require("../../../../../libs/services/ServicesUser.js").servicesUser,
  app = getApp();
Page({
  data: {
    nickName: "",
    headImg: "",
    wxCode: "",
    wxId: "",
    userInfo: getApp().globalData.userInfo,
  },
  onLoad: function (e) {},
  onReady: function () {},
  onShow: function () {
    this.setData({
      nickName: app.globalData.userInfo.nickName,
      headImg: app.globalData.userInfo.avatar,
      wxId: app.globalData.userInfo.wechatId,
    });
  },
  getUserProfile: function (e) {
    var app = this;
    wx.getUserProfile({
      desc: "用于绑定门店信息，便于登录",
      success: function (a) {
        if ("getUserProfile:ok" === a.errMsg) {
          try {
            e.detail.userInfo = JSON.parse(a.rawData);
          } catch (t) {
            e.detail.userInfo = a.userInfo;
          }
          ((e.rawData = a.rawData),
            (e.encryptedData = a.encryptedData),
            (e.iv = a.iv),
            app.bindUser(e));
        }
      },
    });
  },
  bindUser: function (e) {
    var a,
      o,
      n,
      i = this,
      s = "";
    if (
      ("0" == e.currentTarget.id &&
        ((a = "解绑中..."),
        (o = "解绑成功"),
        (s = "".concat(app.config.bingxiHost, "/app-api/setting/unbindWechat")),
        (n = {
          userId: getApp().globalData.userInfo.id,
          openId: getApp().globalData.userInfo.wxOpenId,
          nickName: getApp().globalData.userInfo.nickName,
        }),
        i.bindWx(s, n, o)),
      "1" == e.currentTarget.id)
    ) {
      if (!e.detail.userInfo)
        return void wx.showToast({
          title: "已取消",
          icon: "none",
        });
      ((a = "绑定中..."),
        (o = "绑定成功"),
        (s = "".concat(app.config.bingxiHost, "/app-api/setting/bindWechat")),
        wx.login({
          success: function (t) {
            ((n = {
              wxCode: t.code,
              wxMiniUserInfo: e.rawData,
              nickName: e.detail.userInfo.nickName,
              headImg: e.detail.userInfo.avatarUrl,
              unionId: e.encryptedData,
              iv: e.iv,
            }),
              i.bindWx(s, n, o));
          },
        }));
    }
    wx.showLoading({
      title: a,
    });
  },
  bindWx: function (t, a, o) {
    var n = this;
    ServicesUser.requestPost(a, t).then(function (e) {
      if (0 === e.code) {
        if (
          (wx.showToast({
            title: o,
            icon: "success",
          }),
          n.getUserInfo(),
          "解绑成功" == o)
        )
          var app = setTimeout(function () {
            (clearTimeout(app),
              wx.navigateBack({
                delta: "1",
              }));
          }, 500);
        if ("绑定成功" == o)
          var a = setTimeout(function () {
            (clearTimeout(a),
              wx.navigateBack({
                delta: "1",
              }));
          }, 1e3);
      } else
        wx.showToast({
          title: e.msg,
          icon: "none",
        });
      wx.hideLoading();
    });
  },
  getUserInfo: function () {
    ServicesUser.getUserInfo({}).then(function (e) {
      0 === e.code
        ? ((getApp().globalData.userInfo = e.data),
          wx.setStorageSync("userRole", e.data.role),
          wx.setStorageSync("lastAccessShopId", e.data.lastAccessShopId),
          wx.setStorageSync("myShopId", e.data.shopId),
          wx.setStorageSync("loginToken", e.data.loginToken),
          wx.setStorageSync("logoutFlag", e.data.logoutFlag),
          wx.setStorageSync("wxId", e.data.wxId),
          wx.setStorageSync("wxOpenId", e.data.wxOpenId))
        : wx.showToast({
            title: e.msg,
            icon: "none",
          });
    });
  },
  loginout: function () {
    ServicesUser.logout({}).then(function (e) {
      0 === e.code
        ? (wx.setStorageSync("logoutFlag", e.data.logoutFlag),
          wx.reLaunch({
            url: "/pages/register/login/login",
          }))
        : wx.showToast({
            title: e.msg,
            icon: "none",
          });
    });
  },
  onHide: function () {},
  onUnload: function () {},
  onPullDownRefresh: function () {},
  onReachBottom: function () {},
  onShareAppMessage: function () {},
});
