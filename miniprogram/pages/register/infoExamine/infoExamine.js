var e = require("../../../@babel/runtime/helpers/defineProperty"),
  ServicesShop = require("../../../libs/services/ServicesShop.js").servicesShop,
  t = (require("../../../libs/utils/util.js").utils, getApp());
Page({
  data: {
    codeDisplay: !1,
    inviteCode: "",
    icon: {
      success: "".concat(t.config.imgHost, "/img/shareFile/Defaultpage.png"),
      delImage: "".concat(t.config.imgHost, "/img/customer/duibuIcon/icon/del@2x.png"),
      audit: "".concat(t.config.imgHost, "/img/customer/duibuIcon/audit@2x.png"),
    },
  },
  codeDisplay: function () {
    this.setData({
      codeDisplay: !this.data.codeDisplay,
    });
  },
  toWriteInfo: function () {
    var e = this;
    if ("" != this.data.inviteCode) {
      var t = {};
      ((t.inviteCode = this.data.inviteCode),
        ServicesShop.checkInviteCode(t).then(function (i) {
          0 === i.code
            ? wx.navigateTo({
                url: "/pages/register/submission/submission?inviteCode=".concat(e.data.inviteCode),
              })
            : wx.showToast({
                title: i.msg,
                icon: "none",
              });
        }));
    } else
      wx.showToast({
        title: "认证码不能为空",
        icon: "none",
      });
  },
  input_val: function (i) {
    this.setData({
      [i.currentTarget.dataset.name]: i.detail.value,
    });
  },
  clearInput: function () {
    this.setData({
      inviteCode: "",
    });
  },
  shopApplyLog: function () {
    wx.login({
      success: function (e) {
        (e.code, wx.getStorageSync("mobile"));
      },
    });
  },
  onLoad: function (e) {
    this.shopApplyLog();
  },
  onReady: function () {},
  onShow: function () {},
  onHide: function () {},
  onUnload: function () {},
  onPullDownRefresh: function () {},
  onReachBottom: function () {},
  onShareAppMessage: function () {},
});
