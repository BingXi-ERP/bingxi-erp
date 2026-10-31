var login = require("../../../libs/utils/login.js").login,
  ServicesIndex = require("../../../libs/services/ServicesIndex.js").ServicesIndex,
  app = getApp();
Page({
  data: {
    openShopStatus: "",
    userInfoList: {},
    img: {
      info: "".concat(app.config.imgHost, "/img/v3.0.0/info.png"),
    },
  },
  getUserInfo: function () {
    var ServicesIndex = this;
    return new Promise(function (n, t) {
      login
        .getUserInfo()
        .then(function (e) {
          (ServicesIndex.setData({
            userInfoList: e.data,
            openShopStatus: e.data.shopApplyStatus,
          }),
            n());
        })
        .catch(function () {
          t();
        });
    });
  },
  goPath: function () {
    switch (this.data.openShopStatus) {
      case -1:
        var login = this.data.userInfoList,
          ServicesIndex = {
            shopAddress: login.shopAddress,
            shopArea: login.shopArea,
            shopCity: login.shopCity,
            shopProvince: login.shopProvince,
            shopName: login.shopName,
            nickName: login.nickName,
          };
        wx.navigateTo({
          url: "/pages/register/writeApplyInfo/writeApplyInfo?isProfessor=true&userInfo=".concat(
            JSON.stringify(ServicesIndex),
          ),
        });
        break;
      case 0:
        wx.navigateTo({
          url: "/pages/register/infoExamine/infoExamine",
        });
        break;
      case 1:
        this.setData({
          openShopPopup: !0,
        });
    }
  },
  logout: function () {
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
  onLoad: function (e) {
    var ServicesIndex = this;
    this.getUserInfo().then(function () {
      wx.setNavigationBarTitle({
        title: 0 === ServicesIndex.data.openShopStatus ? "查看进度" : "申请成为供货商",
      });
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
