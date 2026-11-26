var n = (0, require("../../../../@babel/runtime/helpers/interopRequireDefault").default)(
    require("../../../utils/mta_analysis.js"),
  ),
  app = getApp();
Page({
  data: {
    app: app,
    icon: {
      checked: "/assets/icons/select_s@2x.png",
      noCheck: "/assets/icons/select_s@2x.png",
      noAllChecked: "/assets/icons/no_img.png",
      success: "/packageB/assets/icons/icon/succss.png",
    },
  },
  onLoad: function (o) {
    n.default.Page.init();
  },
  onReady: function () {},
  onShow: function () {},
  onHide: function () {},
  onUnload: function () {
    wx.navigateBack({
      delta: 1,
    });
  },
  onPullDownRefresh: function () {},
  onReachBottom: function () {},
  onShareAppMessage: function () {},
});
