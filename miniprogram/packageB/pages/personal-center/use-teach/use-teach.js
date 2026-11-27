getApp();
Page({
  onLoad: function (e) {
    (wx.hideShareMenu());
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
