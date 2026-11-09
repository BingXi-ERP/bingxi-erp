var e = require("../../../../@babel/runtime/helpers/defineProperty"),
  app = getApp();
Page({
  data: {
    region: [],
    userName: "",
    shopName: "",
    address: "",
    icon: {
      rightArrow: "".concat(app.config.imgHost, "/img/customer/ic_jinru.png"),
    },
  },
  inputVal: function (a) {
    var t = a.detail.value,
      n = a.currentTarget.dataset.item;
    this.setData({
      n: t,
    });
  },
  bindRegionChange: function (e) {
    this.setData({
      region: e.detail.value,
    });
  },
  toPath: function () {
    var e = {
      region: this.data.region,
      mobile: this.data.mobile,
      userName: this.data.userName,
      shopName: this.data.shopName,
      address: this.data.address,
    };
    wx.navigateTo({
      url: "/packageB/pages/register/professer-category/professer-category?info=".concat(
        JSON.stringify(e),
      ),
    });
  },
  onLoad: function (e) {
    this.setData({
      userName: e.userName,
      mobile: e.mobile,
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
