var n = (0, require("../../../../@babel/runtime/helpers/interopRequireDefault").default)(
  require("../../../../utils/mta_analysis.js"),
);
getApp();
Page({
  data: {
    demo: "https://bdd-admin.jzcang.cn/resource",
  },
  onLoad: function (e) {
    (n.default.Page.init(), wx.hideShareMenu());
  },
  onReady: function () {},
  onShow: function () {},
  onHide: function () {},
  onUnload: function () {},
  onPullDownRefresh: function () {},
  onReachBottom: function () {},
  onShareAppMessage: function () {},
});
