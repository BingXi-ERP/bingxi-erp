getApp();
var ServicesCenter = require("../../../../libs/services/ServicesCenter.js").servicesCenter;
Page({
  data: {
    roleList: [],
  },
  onLoad: function (e) {
    wx.hideShareMenu();
  },
  onReady: function () {},
  onShow: function () {
    this.getRoleList();
  },
  getRoleList: function () {
    var t = this;
    (wx.showLoading({
      title: "加载中...",
    }),
      ServicesCenter.roleList({}).then(function (e) {
        0 === e.code
          ? (t.setData({
              roleList: e.data.content,
            }),
            wx.hideLoading())
          : wx.showToast({
              title: e.msg,
              icon: "none",
            });
      }));
  },
  onHide: function () {},
  toJobs: function (e) {
    (wx.navigateTo({
      url:
        "/packageB/pages/personal-center/children/add-job/add-job?type=" +
        e.currentTarget.dataset.type,
    }),
      1 == e.currentTarget.dataset.type &&
        wx.setStorageSync("roleItem", e.currentTarget.dataset.item));
  },
  onUnload: function () {},
  onPullDownRefresh: function () {},
  onReachBottom: function () {},
  onShareAppMessage: function () {},
});
