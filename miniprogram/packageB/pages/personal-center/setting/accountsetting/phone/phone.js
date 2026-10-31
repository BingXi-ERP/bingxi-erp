Page({
  data: {
    phoney: "/assets/images/icon2nd/phone-y.png",
    phonen: "/assets/images/icon2nd/phone-n.png",
  },
  onLoad: function () {
    wx.hideShareMenu();
  },
  onShow: function () {
    this.setData({
      mobile: getApp().globalData.userInfo.phone,
    });
  },
  toChangePhone: function (n) {
    wx.navigateTo({
      url:
        "/packageB/pages/personal-center/setting/accountsetting/changephone/changephone?id=" +
        n.currentTarget.id,
    });
  },
  onHide: function () {},
  onUnload: function () {},
  onPullDownRefresh: function () {},
  onReachBottom: function () {},
  onShareAppMessage: function () {},
});
