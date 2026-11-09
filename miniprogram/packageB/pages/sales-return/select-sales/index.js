var ServicesReturn = require("../../../../libs/services/ServicesReturn");
Page({
  data: {
    radio: "",
    salesList: [],
    selectedList: {},
  },
  onRadioClick: function (e) {
    var t = e.currentTarget.dataset,
      n = t.item,
      a = t.name;
    (console.log(n, a),
      this.setData({
        radio: a,
        selectedList: n,
      }));
  },
  goback: function () {
    var ServicesReturn = getCurrentPages(),
      t = ServicesReturn.find(function (e) {
        return "packageB/pages/sales-return/index" === e.route;
      });
    t &&
      (t.updateSales(this.data.selectedList),
      wx.navigateBack({
        delta: 1,
      }));
  },
  getShopUserList: function () {
    var t = this;
    ServicesReturn.ServicesReturn.shopUserList().then(function (e) {
      if (0 == e.code) {
        var n = (e.data || []).map(function (e) {
          return {
            salesId: e.id,
            salesName: e.nickName || "-",
            salesMobile: e.phone,
          };
        });
        t.setData({
          salesList: n,
        });
      }
    });
  },
  onLoad: function (e) {
    this.getShopUserList();
  },
  onReady: function () {},
  onShow: function () {},
  onHide: function () {},
  onUnload: function () {},
  onPullDownRefresh: function () {},
  onReachBottom: function () {},
  onShareAppMessage: function () {},
});
