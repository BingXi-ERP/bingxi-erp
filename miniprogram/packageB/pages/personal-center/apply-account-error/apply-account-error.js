var app = getApp();
Page({
  data: {
    successBg: "".concat(app.config.imgHost, "/img/customer/duibuIcon/success.png"),
    errorBg: "".concat(app.config.imgHost, "/img/customer/duibuIcon/error.png"),
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
