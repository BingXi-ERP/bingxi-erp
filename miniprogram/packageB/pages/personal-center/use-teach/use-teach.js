var n = (0, require("../../../../@babel/runtime/helpers/interopRequireDefault").default)(
  require("../../../../utils/mta_analysis.js"),
);
getApp();
Page({
  onLoad: function (e) {
    (n.default.Page.init(), wx.hideShareMenu());
    wx.redirectTo({
      url: "/packageB/pages/personal-center/teach-video/index",
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
