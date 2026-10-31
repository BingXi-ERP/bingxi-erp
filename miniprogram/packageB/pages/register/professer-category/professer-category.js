var ServicesShop = require("../../../libs/services/ServicesShop"),
  login = require("../../../libs/utils/login"),
  app = getApp();
Page({
  data: {
    userInfo: {},
    chooseList: [],
    hasList: [],
  },
  getHasList: function (e) {
    var login = String(e.detail.hasList);
    this.setData({
      hasList: login,
    });
  },
  getWxCode: function () {
    return new Promise(function (e, o) {
      wx.login({
        success: function (n) {
          n.code ? e(n.code) : o();
        },
      });
    });
  },
  comfirm: function (t) {
    var i = this,
      s = this.data.userInfo,
      a = s.region,
      r = s.userName,
      c = s.shopName,
      u = s.address,
      g = s.mobile,
      h = wx.getStorageSync("inviteUserId");
    this.getWxCode().then(function (t) {
      var s = {
        mobile: g,
        nickName: r,
        shopName: c,
        shopProvince: a[0],
        shopCity: a[1],
        shopArea: a[2],
        shopAddress: u,
        category: i.data.hasList,
        inviteUserId: h || "0",
        channel: app.globalData.inChannel,
        subChannel: app.globalData.subChannel,
        wxCode: t,
        wxId: app.globalData.wxId,
      };
      ServicesShop.servicesShop.postProfessorData(s).then(function (e) {
        if (0 == e.code) {
          (wx.showToast({
            title: "提交成功",
            icon: "success",
            image: "".concat(
              app.config.imgHost,
              "/img/customer/duibuIcon/icon/icon_successful.png",
            ),
          }),
            wx.removeStorageSync("inviteUserId"),
            (app.globalData.wxId = ""));
          var t = e.data;
          t
            ? login.login
                .loginByLoginToken({
                  loginToken: t,
                })
                .then(function (e) {
                  0 === e.code &&
                    wx.reLaunch({
                      url: "/pages/index/index",
                    });
                })
            : (wx.showToast({
                title: "请重新登录",
                icon: "none",
              }),
              wx.reLaunch({
                url: "/pages/register/login/login",
              }));
        } else
          wx.showToast({
            title: e.data.msg,
            icon: "",
          });
      });
    });
  },
  getCategory: function () {
    var login = this;
    ServicesShop.servicesShop.getProfessorCategory().then(function (e) {
      var app = e.data.map(function (e) {
        return {
          title: e,
          isChoose: !1,
        };
      });
      login.setData({
        chooseList: app,
      });
    });
  },
  onLoad: function (e) {
    var login = JSON.parse(e.info);
    this.setData({
      userInfo: login,
    });
  },
  onReady: function () {},
  onShow: function () {
    this.getCategory();
  },
  onHide: function () {
    wx.removeStorageSync("mobile");
  },
  onUnload: function () {
    wx.removeStorageSync("mobile");
  },
  onPullDownRefresh: function () {},
  onReachBottom: function () {},
  onShareAppMessage: function () {},
});
