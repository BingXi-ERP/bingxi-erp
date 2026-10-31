var e = (0, require("../../../../../@babel/runtime/helpers/interopRequireDefault").default)(
    require("../../../../utils/mta_analysis.js"),
  ),
  ServicesCenter = require("../../../../libs/services/ServicesCenter.js").servicesCenter;
Page({
  data: {
    color: ["green"],
    qrCodeUrl: "",
    checkCode: 0,
    setInter: "",
  },
  onLoad: function () {
    e.default.Page.init();
    (this.getCode(), wx.hideShareMenu());
  },
  getCode: function () {
    var e = this;
    ServicesCenter.createChildrenQRCode().then(function (t) {
      0 === t.code
        ? e.setData({
            qrCodeUrl: t.data,
          })
        : wx.showToast({
            title: t.msg,
            icon: "none",
          });
    });
  },
  checkCode: function () {
    var e = this,
      n = {
        inviteToken: wx.getStorageSync("inviteToken"),
      };
    ServicesCenter.checkChildrenQRCode(n).then(function (t) {
      0 === t.code
        ? 1 == t.data.status
          ? (e.setData({
              checkCode: 1,
            }),
            clearInterval(e.data.setInter))
          : e.setData({
              checkCode: 0,
            })
        : wx.showToast({
            title: t.msg,
            icon: "none",
          });
    });
  },
  onHide: function () {
    clearInterval(this.data.setInter);
  },
  onUnload: function () {
    clearInterval(this.data.setInter);
  },
});
