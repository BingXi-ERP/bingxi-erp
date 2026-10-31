var e = require("../../../@babel/runtime/helpers/interopRequireDefault").default,
  ServicesUserLog = require("../../../libs/services/ServicesUserLog"),
  mta_analysis = e(require("../../../utils/mta_analysis")),
  ServicesOrder = require("../../../libs/services/ServicesOrder").ServicesOrder,
  app = getApp();
Page({
  data: {
    web: "",
    printType: "",
    imageList: [],
    index: 0,
  },
  onLoad: function (e) {
    mta_analysis.default.Page.init();
    var ServicesUserLog = wx.getStorageSync("token") || "",
      ServicesOrder = e.orderId,
      o = e.billingFooter,
      r = e.refundBillingFooter,
      s = e.printPaymentType,
      c = (e.hasBankInfo, e.printCopies),
      l = e.printRemark,
      u = e.billingDeliveryman,
      d = e.printCustomerTel,
      p = e.refundPrintTel,
      g = e.printType,
      m = e.printUserName,
      f = e.printerSale,
      h = app.config.rootHost,
      w = ""
        .concat(h, "/app-api/order/print/previewImage/")
        .concat(ServicesOrder, "?token=")
        .concat(ServicesUserLog, "&billingFooter=")
        .concat(o, "&refundBillingFooter=")
        .concat(r, "&printPaymentType=")
        .concat(s, "&printCopies=")
        .concat(c, "&printRemark=")
        .concat(l, "&billingDeliveryman=")
        .concat(u, "&printUserName=")
        .concat(m, "&printerSale=")
        .concat(f);
    this.setData({
      web: w,
      printType: g,
    });
    var v = {
      billingFooter: o || "",
      refundBillingFooter: "undefined" != r && r ? r : "",
      printPaymentType: s,
      printCopies: c || "",
      printRemark: l || "",
      printUserName: m,
      billingDeliveryman: "undefined" != u && u ? u : "",
      printCustomerTel: Number(d),
      refundPrintTel: Number(p),
      printerSale: Number(f),
    };
    "order" == e.printType
      ? this.getPreviewImage(ServicesOrder, v)
      : "return" == e.printType && this.getRefundImage(ServicesOrder, v);
  },
  getPreviewImage: function (e, t) {
    var mta_analysis = this;
    (wx.showLoading({
      title: "",
    }),
      ServicesOrder.previewImage(e, t).then(function (e) {
        (wx.hideLoading(),
          0 === e.code
            ? mta_analysis.setData({
                imageList: e.data,
              })
            : wx.showToast({
                title: e.msg,
                icon: "none",
              }));
      }));
  },
  getRefundImage: function (e, t) {
    var mta_analysis = this;
    (wx.showLoading({
      title: "",
    }),
      ServicesOrder.previewRefundImage(e, t).then(function (e) {
        (wx.hideLoading(),
          0 === e.code
            ? mta_analysis.setData({
                imageList: e.data,
              })
            : wx.showToast({
                title: e.msg,
                icon: "none",
              }));
      }));
  },
  imgPre: function () {
    wx.previewImage({
      urls: this.data.imageList,
    });
  },
  saveImg: function () {
    this.sampleSaveImg();
  },
  sampleSaveImg: function () {
    var e = this;
    wx.downloadFile({
      url: this.data.imageList[this.data.index],
      success: function (i) {
        var ServicesOrder = this;
        wx.saveImageToPhotosAlbum({
          filePath: i.tempFilePath,
          success: function () {
            if (
              (ServicesUserLog.servicesUserLog.setUserHandleLog(
                "order" == e.data.printType ? 214 : 505,
              ),
              e.data.index == e.data.imageList.length - 1)
            )
              return (
                wx.showToast({
                  title: "保存成功",
                  icon: "success",
                  duration: 2e3,
                }),
                void (e.data.index = 0)
              );
            ((e.data.index = e.data.index + 1), e.sampleSaveImg());
          },
          fail: function (e) {
            "saveImageToPhotosAlbum:fail auth deny" === e.errMsg &&
              wx.showModal({
                title: "提示",
                content: "您拒绝了保存权限，请打开保存权限",
                success: function (e) {
                  e.confirm &&
                    wx.openSetting({
                      success: function (e) {
                        e.authSetting = {
                          "scope.writePhotosAlbum": !0,
                        };
                      },
                      fail: function (e) {
                        ServicesOrder.setData({
                          showAuth: !0,
                        });
                      },
                    });
                },
              });
          },
        });
      },
      fail: function () {
        wx.showToast({
          title: "保存失败",
          icon: "error",
          duration: 2e3,
        });
      },
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
