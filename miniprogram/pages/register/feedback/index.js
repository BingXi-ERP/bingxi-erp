var e = (0, require("../../../@babel/runtime/helpers/interopRequireDefault").default)(
    require("@vant/weapp/toast/toast"),
  ),
  ServicesShop = require("../../../libs/services/ServicesShop.js").servicesShop;
Page({
  data: {
    message: "",
  },
  onLoad: function (e) {},
  onReady: function () {},
  onShow: function () {
    wx.hideHomeButton();
  },
  onHide: function () {},
  onUnload: function () {},
  onPullDownRefresh: function () {},
  onReachBottom: function () {},
  onShareAppMessage: function () {},
  changeInput: function (e) {
    this.setData({
      message: e.detail.value,
    });
  },
  submit: function () {
    var a = getApp().globalData.userInfo,
      n = {};
    if (a.phone) {
      var o = a.companyName,
        s = a.phone,
        i = a.nickName;
      n = {
        feedbackContent: this.data.message,
        companyName: o,
        phone: s,
        contacts: i,
      };
    } else
      n = {
        feedbackContent: this.data.message,
        phone: wx.getStorageSync("mobile"),
      };
    this.data.message &&
      ServicesShop.addCategory(n).then(function (t) {
        0 === t.code
          ? (e.default.success("提交成功"),
            setTimeout(function () {
              wx.navigateTo({
                url: "/pages/register/mainCategory/index",
              });
            }, 1e3))
          : e.default.fail(t.message);
      });
  },
});
