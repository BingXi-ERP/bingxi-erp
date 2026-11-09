var n = (0, require("../../../../@babel/runtime/helpers/interopRequireDefault").default)(
    require("../../../utils/mta_analysis.js"),
  ),
  app = getApp();
Page({
  data: {
    app: app,
    icon: {
      checked: "".concat(app.config.imgHost, "/img/v2.7.4/Control_Choiced@2x.png"),
      noCheck: "".concat(app.config.imgHost, "/img/v2.7.4/Control_NotChoice@2x.png"),
      noAllChecked: "".concat(app.config.imgHost, "/img/v2.7.4/Icon_Not_Select@2x.png"),
      success: "".concat(app.config.imgHost, "/img/customer/duibuIcon/icon/succss.png"),
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
