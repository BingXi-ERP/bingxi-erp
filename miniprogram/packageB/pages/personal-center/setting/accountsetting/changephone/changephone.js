var ServicesIndex = require("../../../../../libs/services/ServicesIndex.js").ServicesIndex,
  app = getApp();
Page({
  data: {
    phoneType: "0",
    mobiles: "",
    mobile: "",
  },
  test_number: function (e) {
    this.setData({
      mobile: e.detail.value,
    });
  },
  setCodeMobile: function () {
    var page = this,
      type = this.data.mobiles ? "edit" : "add",
      payload = {
        mobile: this.data.mobile,
      };
    return ServicesIndex.sendVerCode(payload)
      .then(function (response) {
        console.log(33333, response);
        if (0 === response.code) {
          wx.navigateTo({
            url:
              "/packageB/pages/personal-center/setting/accountsetting/phone-code/phone-code?type=" +
              type +
              "&mobile=" +
              page.data.mobile,
          });
          wx.showToast({
            title: "验证码已发送",
            icon: "success",
          });
        } else {
          wx.showToast({
            title: response.msg,
            icon: "none",
          });
        }
      })
      .catch(function (error) {
        console.log(555, error);
      });
  },
  toNext: function (e) {
    /^1\d{10}$/.test(this.data.mobile)
      ? this.data.mobile != this.data.mobiles
        ? this.setCodeMobile()
        : wx.showToast({
            title: "该号码与当前手机号码一致，请重新填写",
            icon: "none",
          })
      : wx.showToast({
          title: "请输入正确的手机号",
          icon: "none",
          duration: 1e3,
        });
  },
  onLoad: function (e) {
    this.setData({
      mobiles: app.globalData.userInfo.phone,
      phoneType: e.id,
    });
  },
  onReady: function () {},
  onShow: function () {},
  onHide: function () {},
  onUnload: function () {},
  onPullDownRefresh: function () {},
  onReachBottom: function () {},
  onShareAppMessage: function () {},
});
