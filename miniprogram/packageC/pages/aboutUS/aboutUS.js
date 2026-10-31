var app = getApp();
Page({
  data: {
    icon: {
      duibuLogo: "".concat(app.config.imgHost, "/img/customer/duibuIcon/logo@2x.png"),
      appVersion: app.appVersion,
    },
  },
  onLoad: function () {
    this.setData({
      appVersion: app.appVersion,
    });
  },
  goToAgreementPage: function () {
    wx.downloadFile({
      url: "".concat(app.config.imgHost, "/product/syxy_new.docx"),
      success: function (o) {
        var n = o.tempFilePath;
        wx.openDocument({
          filePath: n,
          showMenu: !0,
          success: function (o) {
            console.log("打开文档成功");
          },
        });
      },
    });
  },
  goToPrivacyPolicyPage: function () {
    wx.downloadFile({
      url: "".concat(app.config.imgHost, "/product/yszc_new.docx"),
      success: function (o) {
        var n = o.tempFilePath;
        wx.openDocument({
          filePath: n,
          showMenu: !0,
          success: function (o) {
            console.log("打开文档成功");
          },
        });
      },
    });
  },
});
