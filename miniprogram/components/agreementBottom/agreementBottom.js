var app = getApp();
Component({
  properties: {
    isAgreed: {
      type: Boolean,
      value: !0,
    },
  },
  data: {},
  methods: {
    onChange: function () {
      this.triggerEvent("change", !this.data.isAgreed);
    },
    goToAgreementPage: function () {
      wx.downloadFile({
        url: "".concat(app.config.imgHost, "/product/syxy_new.docx"),
        success: function (o) {
          var e = o.tempFilePath;
          wx.openDocument({
            filePath: e,
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
          var e = o.tempFilePath;
          wx.openDocument({
            filePath: e,
            showMenu: !0,
            success: function (o) {
              console.log("打开文档成功");
            },
          });
        },
      });
    },
  },
});
