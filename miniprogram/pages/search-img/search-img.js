var e = require("../../@babel/runtime/helpers/interopRequireDefault").default,
  ServicesUserLog = require("../../libs/services/ServicesUserLog.js"),
  mta_analysis = e(require("../../utils/mta_analysis.js")),
  app = getApp(),
  login = require("../../libs/utils/login.js").login;
require("../../libs/utils/util.js").utils;
Page({
  data: {
    icon: {
      bg: "/assets/icons/bg.png",
      photo: "/packageB/assets/icons/camera@2x.png",
      notice: "/assets/icons/no_img.png",
      noPower: "/assets/icons/Defaultpage_NoRecord_Color.png",
    },
  },
  getUserInfo: function () {
    return new Promise(function (e, n) {
      login.getUserInfo(!0).then(function () {
        e();
      });
    });
  },
  chooseImage: function (e) {
    var mta_analysis = e.currentTarget.dataset.action;
    wx.chooseMedia({
      count: 1,
      sizeType: ["original", "compressed"],
      sourceType: ["".concat(mta_analysis)],
      mediaType: ["image"],
      success: function (e) {
        (ServicesUserLog.servicesUserLog.setUserHandleLog(601),
          wx.navigateTo({
            url: "/pages/search-img/search/search?imgUrl=".concat(e.tempFiles[0].tempFilePath),
          }));
      },
      fail: function (e) {
        (wx.hideLoading(),
          wx.showToast({
            title: "取消选择",
            icon: "none",
          }));
      },
    });
  },
  onLoad: function (e) {
    (mta_analysis.default.Page.init(), wx.hideShareMenu());
  },
  onReady: function () {},
  onShow: function () {
    this.getUserInfo().then(function () {});
  },
  onHide: function () {},
  onUnload: function () {},
  onPullDownRefresh: function () {},
  onReachBottom: function () {},
  onShareAppMessage: function () {},
});
