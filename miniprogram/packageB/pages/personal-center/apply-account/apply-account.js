var app = getApp();
Page({
  data: {
    successBg: "".concat(app.config.imgHost, "/img/customer/duibuIcon/group@2x.png"),
    errorBg: "".concat(app.config.imgHost, "/img/customer/duibuIcon/error.png"),
    kfimg: "".concat(app.config.imgHost, "/img/customer/Icon_Contact@2x.png"),
  },
  toMine: function () {
    wx.reLaunch({
      url: "/pages/index/personalCenter/personalCenter",
    });
  },
});
