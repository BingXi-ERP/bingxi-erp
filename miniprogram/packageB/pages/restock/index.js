var releaseCargoPass = require("../../libs/services/releaseCargoPass.js").servicesCargoPass;
Page({
  data: {
    searchFiled: "",
    historyKey: [],
  },
  submitStayTime: function () {
    var e = wx.getStorageSync("cargoStayTime");
    e &&
      releaseCargoPass.saveStayTime(e).then(function (t) {
        0 === t.code && wx.setStorageSync("cargoStayTime", "");
      });
  },
  getHistoryKeyword: function () {
    var e = this;
    releaseCargoPass.getHistoryKeyword().then(function (t) {
      0 === t.code &&
        e.setData({
          historyKey: t.data,
        });
    });
  },
  clearHistoryKey: function () {
    var e = this;
    releaseCargoPass.clearHistoryKeyword().then(function (t) {
      0 === t.code &&
        e.setData({
          historyKey: [],
        });
    });
  },
  onToSearch: function (t) {
    var e = t.currentTarget.dataset.item;
    wx.navigateTo({
      url: "../restockList/index?keyword=".concat(e),
    });
  },
  onChange: function (t) {
    this.setData({
      searchFiled: t.detail,
    });
  },
  handleSearch: function () {
    this.data.searchFiled
      ? wx.navigateTo({
          url: "../restockList/index?keyword=".concat(this.data.searchFiled),
        })
      : wx.showToast({
          title: "请输入搜索关键词",
          icon: "error",
        });
  },
  onLoad: function (t) {},
  onReady: function () {},
  onShow: function () {
    (this.getHistoryKeyword(), this.submitStayTime());
  },
  onHide: function () {},
  onUnload: function () {},
  onPullDownRefresh: function () {},
  onReachBottom: function () {},
  onShareAppMessage: function () {},
});
