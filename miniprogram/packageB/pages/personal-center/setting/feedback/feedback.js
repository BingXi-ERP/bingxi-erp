var e = (0, require("../../../../../@babel/runtime/helpers/interopRequireDefault").default)(
    require("../../../../utils/mta_analysis.js"),
  ),
  ServicesUser = require("../../../../libs/services/ServicesUser.js"),
  app = getApp();
Page({
  data: {
    textarea_feedback: "",
    showPhone: "",
    userRole: 0,
  },
  onLoad: function (t) {
    (e.default.Page.init(),
      this.setData({
        showPhone: app.globalData.userInfo.phone,
        userRole: app.globalData.userInfo.role,
      }),
      wx.hideShareMenu());
  },
  textarea_val: function (e) {
    var ServicesUser = e.detail.value;
    this.setData({
      textarea_feedback: ServicesUser,
    });
  },
  getPhoneNumber: function (e) {
    (console.log(e.currentTarget.dataset.goodsId),
      console.log(e.detail.errMsg),
      console.log(e.detail.iv),
      console.log(e.detail.encryptedData),
      "getPhoneNumber:fail user deny" == e.detail.errMsg ||
      null == e.detail.iv ||
      null == e.detail.encryptedData
        ? wx.showToast({
            title: "您已取消授权，无法提交反馈",
            icon: "none",
          })
        : this.upLoad(e, e.detail.iv, e.detail.encryptedData));
  },
  upLoad: function (e, o, n) {
    var s = this,
      i = {
        id: app.globalData.userInfo.id,
        iv: o,
        mobile: n,
      };
    ServicesUser.servicesUser.uploadUserInfo(i).then(function (e) {
      0 === e.code
        ? s.getUserInfo()
        : wx.showToast({
            title: e.msg,
            icon: "none",
          });
    });
  },
  getUserInfo: function () {
    var e = this;
    ServicesUser.servicesUser.getUserInfo({}).then(function (t) {
      0 === t.code
        ? ((app.globalData.userInfo = t.data),
          wx.setStorageSync("userRole", t.data.role),
          wx.setStorageSync("lastAccessShopId", t.data.lastAccessShopId),
          wx.setStorageSync("myShopId", t.data.shopId),
          wx.setStorageSync("loginToken", t.data.loginToken),
          wx.setStorageSync("logoutFlag", t.data.logoutFlag),
          e.setData({
            showPhone: t.data.mobile,
          }),
          e.formSubmit())
        : wx.showToast({
            title: t.msg,
            icon: "none",
          });
    });
  },
  formSubmit: function (e) {
    if ("" === this.data.textarea_feedback)
      wx.showToast({
        title: "请输入反馈内容",
        icon: "none",
      });
    else {
      var ServicesUser = {
          content: this.data.textarea_feedback,
        },
        o = {
          "content-type": "application/json",
          Authorization: wx.getStorageSync("token"),
          terminalSource: 6,
          terminalType: 81,
        };
      wx.request({
        url: "".concat(app.config.bingxiHost, "/app-api/feedback/add"),
        header: o,
        method: "POST",
        data: ServicesUser,
        complete: function (e) {},
        success: function (e) {
          0 === e.data.code
            ? (setTimeout(function () {
                wx.showToast({
                  title: "意见反馈已成功提交",
                  icon: "none",
                });
              }, 100),
              wx.navigateBack({
                delta: 1,
              }))
            : wx.showToast({
                title: e.data.msg,
                icon: "none",
              });
        },
      });
    }
  },
});
