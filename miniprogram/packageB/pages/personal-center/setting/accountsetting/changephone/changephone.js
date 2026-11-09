var objectSpread2 = require("../../../../../../@babel/runtime/helpers/objectSpread2"),
  ServicesIndex = require("../../../../../libs/services/ServicesIndex.js").ServicesIndex,
  app = getApp();
Page({
  data: {
    phoneType: "0",
    mobiles: "",
    mobile: "",
    captchaOpt: {
      baseUrl: "".concat(app.config.bingxiHost, "/oauth-api"),
      mode: "pop",
      captchaType: "blockPuzzle",
      imgSize: {
        width: "310px",
        height: "155px",
      },
      barHeight: "32px",
      vSpace: 5,
      success: function (e) {
        wx.showToast({
          title: "验证成功",
          icon: "success",
          duration: 1e3,
        });
      },
      fail: function (e) {
        (console.log("失败响应"), console.log(e));
      },
    },
  },
  test_number: function (e) {
    this.setData({
      mobile: e.detail.value,
    });
  },
  setCodeMobile: function (t) {
    var n = this,
      i = {
        mobile: this.data.mobile,
      };
    (t && (i = objectSpread2(objectSpread2({}, i), t)),
      console.log(444444, i),
      ServicesIndex.sendVerCode(i)
        .then(function (e) {
          var ServicesIndex;
          (console.log(33333, e), 100 !== e.code)
            ? 0 === e.code
              ? ((o = "" != n.data.mobiles ? "edit" : "add"),
                wx.navigateTo({
                  url:
                    "/packageB/pages/personal-center/setting/accountsetting/phone-code/phone-code?type=" +
                    ServicesIndex +
                    "&mobile=" +
                    n.data.mobile,
                }),
                wx.showToast({
                  title: "验证码已发送",
                  icon: "success",
                }))
              : wx.showToast({
                  title: e.msg,
                  icon: "none",
                })
            : n.selectComponent(".smsCaptchas").show();
        })
        .catch(function (e) {
          console.log(555, e);
        }));
  },
  ajCaptchaSuccess: function (e) {
    e.detail
      ? this.setCodeMobile(e.detail)
      : wx.showToast({
          title: "参数错误，请联系管理员",
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
