require("../../../libs/utils/time").parseTime;
Page({
  data: {
    moneyData: {},
  },
  onLoad: function (e) {
    var n = JSON.parse(e.data);
    this.setData({
      moneyData: n,
    });
  },
  onReady: function () {},
  onShow: function () {},
  onHide: function () {},
  onUnload: function () {},
  onPullDownRefresh: function () {},
  onReachBottom: function () {},
  onShareAppMessage: function () {},
  handlePayment: function () {
    var e = getCurrentPages(),
      n = e.find(function (e) {
        return "pages/order/receipt/index" === e.route;
      });
    n
      ? (n.resetData(),
        wx.navigateBack({
          delta: 1,
        }))
      : wx.navigateBack({
          delta: 1,
        });
  },
  handleToDetail: function (e) {
    var n = e.currentTarget.dataset.id,
      a = "/pages/order/detail/index?orderId=".concat(n);
    wx.navigateTo({
      url: a,
    });
  },
});
