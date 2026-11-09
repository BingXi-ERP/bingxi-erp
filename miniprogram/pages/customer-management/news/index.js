var e = require("../../../@babel/runtime/helpers/regeneratorRuntime"),
  n = require("../../../@babel/runtime/helpers/asyncToGenerator"),
  ServicesIndex = require("../../../libs/services/ServicesIndex.js").ServicesIndex,
  app = getApp();
Page({
  data: {
    icon: {
      message: "".concat(app.config.imgHost, "/img/v2.7.8/Icon_Sys_Messages@2x.png"),
      order: "".concat(app.config.imgHost, "/img/v2.7.8/Icon_Order_Messages@2x.png"),
      right: "".concat(app.config.imgHost, "/img/customer/ic_jinru.png"),
      feedback: "".concat(app.config.imgHost, "/img/v2.7.8/Icon_Order_Feedback@2x.png"),
    },
    unReadCount: {},
    userAuthList: {},
  },
  getUnreadMessageCount: function () {
    var e = this;
    ServicesIndex.getNoReadCount().then(function (n) {
      0 === n.code &&
        e.setData({
          unReadCount: n.data,
        });
    });
  },
  onReadMessage: async function () {
    await ServicesIndex.setReadMessage(app);
  },
  toSysMessage: async function () {
    await ServicesIndex.onReadMessage(1);
    wx.navigateTo({
      url: "/pages/customer-management/sys-message/index",
    });
  },
  toDynamic: async function () {
    await ServicesIndex.onReadMessage(2);
    wx.navigateTo({
      url: "/pages/customer-management/news-center/news-center",
    });
  },
  toFeedback: async function () {
    await ServicesIndex.onReadMessage(3);
    wx.navigateTo({
      url: "/pages/customer-management/news-feedback/index",
    });
  },
  onLoad: function (e) {
    this.setData({
      userAuthList: app.userAuthList,
    });
  },
  onReady: function () {},
  onShow: function () {
    this.getUnreadMessageCount();
  },
  onHide: function () {},
  onUnload: function () {},
  onPullDownRefresh: function () {},
  onReachBottom: function () {},
  onShareAppMessage: function () {},
});
