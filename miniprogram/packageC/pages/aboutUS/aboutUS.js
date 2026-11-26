var app = getApp();
Page({
  data: {
    icon: {
      appVersion: app.appVersion,
    },
  },
  onLoad: function () {
    this.setData({
      appVersion: app.appVersion,
    });
  },
  goToAgreementPage: function () {
    wx.navigateTo({ url: "/pages/register/terms/index" });
  },
  goToPrivacyPolicyPage: function () {
    wx.navigateTo({ url: "/pages/register/agreement/agreement" });
  },
});
