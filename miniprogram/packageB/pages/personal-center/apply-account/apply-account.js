var app = getApp();
Page({
  data: {
    successBg: "/packageB/assets/icons/group@2x.png",
    errorBg: "/packageB/assets/icons/error.png",
    kfimg: "/assets/icons/phone@2x.png",
  },
  toMine: function () {
    wx.reLaunch({
      url: "/pages/personal-center/personal-center",
    });
  },
});
