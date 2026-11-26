var app = getApp();
Page({
  data: {
    successBg: "/packageB/assets/icons/success.png",
    errorBg: "/packageB/assets/icons/error.png",
    reasonsed: "",
    phone: "",
  },
  toMine: function () {
    wx.reLaunch({
      url: "/pages/register/writeApplyInfo/writeApplyInfo?mobile=".concat(this.data.phone),
    });
  },
  onLoad: function (o) {
    this.setData({
      reasonsed: o.reason,
      phone: o.phone,
    });
  },
});
