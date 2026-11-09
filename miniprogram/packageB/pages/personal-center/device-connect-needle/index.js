var e = require("../../../../@babel/runtime/helpers/interopRequireDefault").default,
  mta_analysis = e(require("../../../utils/mta_analysis.js")),
  toast = e(require("../../../../miniprogram_npm/@vant/weapp/toast/toast")),
  ServicesIndex = require("../../../libs/services/ServicesIndex.js").ServicesIndex;
Page({
  data: {
    serialNumber: "",
    checkCode: "",
    statusCode: "0",
    statusText: "--",
    linkNeedId: "",
    showNeedPrintTerm: !1,
    linkNeedOptions: [
      {
        name: "断开打印机连接",
        value: 1,
      },
    ],
  },
  onLoad: function (e) {
    mta_analysis.default.Page.init();
  },
  onShow: function () {
    this.getPrintNeedle();
  },
  onShowClosePrint: function () {
    this.setData({
      showNeedPrintTerm: !0,
    });
  },
  onClosePrintSheet: function () {
    this.setData({
      showNeedPrintTerm: !1,
    });
  },
  onNeedPrintSelect: function (e) {
    1 === e.detail.value && this.clearPrintNeedle();
  },
  clearPrintNeedle: function () {
    var e = this;
    (wx.showLoading(),
      ServicesIndex.clearBillingPrinter().then(function (t) {
        0 === t.code &&
          (e.setData({
            serialNumber: "",
            checkCode: "",
            statusText: "--",
            statusCode: "0",
            linkNeedId: "",
            showNeedPrintTerm: !1,
          }),
          wx.hideLoading(),
          wx.showToast({
            title: "断开成功",
          }));
      }));
  },
  getPrintNeedle: function () {
    var e = this;
    (wx.showLoading(),
      ServicesIndex.getBillingPrinter().then(function (t) {
        (wx.hideLoading(),
          0 === t.code
            ? t.data &&
              e.setData({
                serialNumber: t.data.printerSn,
                checkCode: t.data.checkCode,
                statusText: t.data.id ? (1 == t.data.printerStatus ? "在线" : "离线") : "--",
                statusCode: 1 == t.data.printerStatus ? 1 : 2,
                linkNeedId: t.data.id,
              })
            : wx.showToast({
                title: t.msg,
                icon: "none",
              }));
      }));
  },
  getStatus: function (e) {
    var mta_analysis = {
      0: "--",
      1: "在线",
      2: "离线",
    }[e];
    this.setData({
      statusCode: e,
      statusText: mta_analysis,
    });
  },
  handleSubmitForm: function (e) {
    var mta_analysis = e.detail.value;
    if ("" !== mta_analysis.serialNumber) {
      if ("" !== mta_analysis.checkCode) {
        var n = {
          printerSn: mta_analysis.serialNumber,
          checkCode: mta_analysis.checkCode,
        };
        ServicesIndex.saveBillingPrinter(n).then(function (e) {
          0 === e.code
            ? (wx.showToast({
                title: "保存成功",
                icon: "success",
              }),
              setTimeout(function () {
                wx.navigateBack({
                  delta: 1,
                });
              }, 500))
            : wx.showToast({
                title: e.msg,
                icon: "none",
              });
        });
      } else
        (0, toast.default)({
          message: "请输入校验码",
          duration: 1e3,
        });
    } else
      (0, toast.default)({
        message: "请输入制造编号",
        duration: 1e3,
      });
  },
});
