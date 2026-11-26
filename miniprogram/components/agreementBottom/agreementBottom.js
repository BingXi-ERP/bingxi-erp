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
      wx.navigateTo({ url: "/pages/register/terms/index" });
    },
    goToPrivacyPolicyPage: function () {
      wx.navigateTo({ url: "/pages/register/agreement/agreement" });
    },
  },
});
