var t = require("../../../../../@babel/runtime/helpers/interopRequireDefault").default,
  objectSpread2 = require("../../../../../@babel/runtime/helpers/objectSpread2"),
  e = require("../../../../../@babel/runtime/helpers/defineProperty"),
  mta_analysis = t(require("../../../../../utils/mta_analysis.js")),
  ServicesPrint = require("../../../../../libs/services/ServicesPrint"),
  util = require("../../../../../libs/utils/util"),
  ServicesCard = require("../../../../../libs/services/ServicesCard.js").servicesCard,
  app = getApp();
Page({
  data: {
    userAuthList: {},
    curDate: "",
    date: "",
    labelType: 0,
    array: ["60*80mm", "80*100mm"],
    icon: {
      checked: "".concat(app.config.imgHost, "/img/customer/duibuIcon/phone_check@2x.png"),
      noCheck: "".concat(app.config.imgHost, "/img/customer/duibuIcon/phone_uncheck@2x.png"),
      rightArrow: "".concat(app.config.imgHost, "/img/customer/ic_jinru.png"),
    },
    remarks: "如发现产品质量问题，请于三天内通知本行，逾期裁剪或在产品上附加工艺，本行概不负责！",
    customMobile: "",
    customerInfo: {
      id: void 0,
    },
    goodsId: null,
    orderId: null,
    colorDetailModels: null,
    billingId: "",
    colorCardInfo: {
      printCustomer: !1,
      printGoodsName: !1,
      printGoodsNo: !1,
      printColorName: !1,
      printDyelot: !1,
      printBreath: !1,
      printGramWeight: !1,
      printCustomerTel: !1,
      printCustomerAddress: !1,
      printShopTel: !1,
      printShopAddress: !1,
      printDate: !1,
      printShopName: !1,
      printQrCode: !1,
      printRemarkTag: !1,
    },
    autoFocus: !0,
    remaskareaDispaly: !0,
    backImg: "".concat(app.config.imgHost, "/img/customer/model@2x.png"),
  },
  inputgetName: function (t) {
    var objectSpread2 = t.detail.value.replace(/[\n]/g, "");
    this.setData({
      [t.currentTarget.dataset.name]: objectSpread2,
    });
  },
  handlelSelectCustomer: function () {
    wx.navigateTo({
      url: "/pages/customer-management/all-customer-list-choose/all-customer-list-choose",
    });
  },
  bindPickerChange: function (t) {
    this.setData({
      labelType: t.detail.value,
    });
  },
  printLink: function () {
    var t = this,
      e = {
        printType: Number(this.data.labelType) + 1,
        printGoodsName: this.data.colorCardInfo.printGoodsName ? 1 : 0,
        printGoodsNo: this.data.colorCardInfo.printGoodsNo ? 1 : 0,
        printColorName: this.data.colorCardInfo.printColorName ? 1 : 0,
        printDyelot: this.data.colorCardInfo.printDyelot ? 1 : 0,
        printBreadth: this.data.colorCardInfo.printBreadth ? 1 : 0,
        printGramWeight: this.data.colorCardInfo.printGramWeight ? 1 : 0,
        printCustomerTel: this.data.colorCardInfo.printCustomerTel ? 1 : 0,
        printCustomerAddress: this.data.colorCardInfo.printCustomerAddress ? 1 : 0,
        printShopTel: this.data.colorCardInfo.printShopTel ? 1 : 0,
        printShopAddress: this.data.colorCardInfo.printShopAddress ? 1 : 0,
        printShopName: this.data.colorCardInfo.printShopName ? 1 : 0,
        printQrCode: this.data.colorCardInfo.printQrCode ? 1 : 0,
        printDate: this.data.colorCardInfo.printDate ? 1 : 0,
        printRemarkTag: this.data.colorCardInfo.printRemarkTag ? 1 : 0,
      };
    (this.data.billingId || (e.printRemark = this.data.remarks),
      this.data.date &&
        (e = objectSpread2(
          {
            printTime: this.data.date + " 00:00:00",
          },
          e,
        )),
      (0, ServicesPrint.saveNeadendPrintSetting)(e).then(function (o) {
        if (0 === o.code) {
          if (t.data.goodsId && "" !== t.data.goodsId) {
            var util = {
              colorDetailModels: t.data.colorDetailModels,
              customerId: t.data.customerInfo.id,
              goodsId: t.data.goodsId,
              printQrCode: e.printQrCode,
              labelType: t.data.array[t.data.labelType],
            };
            (t.data.date &&
              (n = objectSpread2(
                {
                  printTime: t.data.date + " 00:00:00",
                },
                util,
              )),
              util.customerId || (util.customerId = ""),
              (util.printCustomer = util.customerId ? 1 : 0),
              (0, ServicesPrint.neadendPrintCommand)(util).then(function (a) {
                var e;
                0 === a.code
                  ? (wx.setStorageSync("printCommand", a.data.printCommand),
                    wx.setStorageSync("printCommandGp", a.data.printCommandGp),
                    wx.setStorageSync("printCommandTTR", a.data.printCommandTTR),
                    wx.setStorageSync("printParams", util),
                    t.data.newPrintType && 1 == t.data.newPrintType
                      ? (console.log("新打印面料布头"),
                        (e =
                          "/packageB/pages/color-card-management/printing-new/printing-new?printType=2&headType=1"))
                      : (console.log("旧打印面料布头"),
                        (e =
                          "/packageB/pages/color-card-management/printing/printing?printType=2&headType=1")),
                    wx.navigateTo({
                      url: e,
                    }))
                  : wx.showToast({
                      title: a.msg,
                      icon: "none",
                    });
              }));
          } else {
            var ServicesCard = {
              billingId: t.data.orderId,
              printCustomer: t.data.colorCardInfo.printCustomer ? 1 : 0,
              printQrCode: t.data.colorCardInfo.printQrCode ? 1 : 0,
              labelType: t.data.array[t.data.labelType],
            };
            (t.data.date &&
              (i = objectSpread2(
                {
                  printTime: t.data.date + " 00:00:00",
                },
                ServicesCard,
              )),
              t.data.billingId &&
                (i = objectSpread2(
                  objectSpread2({}, ServicesCard),
                  {},
                  {
                    billingPrintRemark: t.data.remarks,
                  },
                )),
              (0, ServicesPrint.orderPrintCommand)(ServicesCard).then(function (a) {
                var e;
                0 === a.code
                  ? (wx.setStorageSync("printCommand", a.data.printCommand),
                    wx.setStorageSync("printCommandGp", a.data.printCommandGp),
                    wx.setStorageSync("printCommandTTR", a.data.printCommandTTR),
                    wx.setStorageSync("printParams", ServicesCard),
                    t.data.newPrintType && 1 == t.data.newPrintType
                      ? (console.log("新打印订单布头"),
                        (e =
                          "/packageB/pages/color-card-management/printing-new/printing-new?printType=2&headType=2"))
                      : (console.log("旧打印订单布头"),
                        (e =
                          "/packageB/pages/color-card-management/printing/printing?printType=2&headType=2")),
                    wx.navigateTo({
                      url: e,
                    }))
                  : wx.showToast({
                      title: a.msg,
                      icon: "none",
                    });
              }));
          }
        } else
          wx.showToast({
            title: o.msg,
            icon: "none",
          });
      }));
  },
  updateCustomer: function (t) {
    (this.setData({
      customerInfo: t,
    }),
      console.log(this.data.customerInfo));
  },
  radioChange: function (t) {
    ("colorCardInfo.printCustomer" != t.currentTarget.dataset.name ||
    this.data.colorCardInfo.printCustomer
      ? "colorCardInfo.printCustomer" == t.currentTarget.dataset.name &&
        this.data.colorCardInfo.printCustomer
        ? this.setData({
            "customerInfo.id": null,
            "colorCardInfo.printCustomerTel": !1,
            "colorCardInfo.printCustomerAddress": !1,
          })
        : "colorCardInfo.printDate" === t.currentTarget.dataset.name &&
          this.setData({
            date: this.data.colorCardInfo.printDate ? "" : util.utils.getNowDate(),
          })
      : this.setData({
          "customerInfo.id": "",
        }),
      this.setData({
        [t.currentTarget.dataset.name]: !t.currentTarget.dataset.nowinfo,
      }));
  },
  remaskDisplay: function () {
    this.setData({
      remaskareaDispaly: !this.data.remaskareaDispaly,
    });
  },
  onLoad: function (t) {
    var e = this;
    if (
      (console.log("options", t),
      this.setData({
        userAuthList: app.userAuthList,
      }),
      mta_analysis.default.Page.init(),
      this.setData({
        newPrintType: t.newPrintType,
        customMobile: t.customMobile ? t.customMobile : "",
        goodsId: t.goodsId ? t.goodsId : "",
        orderId: t.orderId ? t.orderId : "",
        billingId: t.billingId ? t.billingId : "",
        colorDetailModels:
          t.colorDetailModels && void 0 !== t.colorDetailModels
            ? JSON.parse(t.colorDetailModels)
            : null,
      }),
      this.data.customMobile)
    ) {
      var util = objectSpread2(
        objectSpread2({}, this.data.customerInfo),
        {},
        {
          mobile: this.data.customMobile,
        },
      );
      this.setData({
        customerInfo: util,
      });
    }
    var ServicesCard = {};
    (this.data.billingId &&
      (i = {
        billingId: this.data.billingId,
      }),
      (0, ServicesPrint.neadendPrintSetting)(ServicesCard).then(function (t) {
        0 === t.code
          ? (0 != t.data.printType && 1 == t.data.printType
              ? e.setData({
                  labelType: 0,
                })
              : 0 != t.data.printType &&
                2 == t.data.printType &&
                e.setData({
                  labelType: 1,
                }),
            0 != t.data.printType &&
              e.setData({
                remarks: t.data.printRemark,
              }),
            1 == t.data.printQrCode &&
              e.setData({
                "colorCardInfo.printQrCode": !0,
              }),
            1 == t.data.printGoodsName &&
              e.setData({
                "colorCardInfo.printGoodsName": !0,
              }),
            1 == t.data.printGoodsNo &&
              e.setData({
                "colorCardInfo.printGoodsNo": !0,
              }),
            1 == t.data.printColorName &&
              e.setData({
                "colorCardInfo.printColorName": !0,
              }),
            1 == t.data.printDyelot &&
              e.setData({
                "colorCardInfo.printDyelot": !0,
              }),
            1 == t.data.printBreadth &&
              e.setData({
                "colorCardInfo.printBreadth": !0,
              }),
            1 == t.data.printGramWeight &&
              e.setData({
                "colorCardInfo.printGramWeight": !0,
              }),
            1 == t.data.printCustomerTel &&
              e.setData({
                "colorCardInfo.printCustomerTel": !0,
              }),
            1 == t.data.printCustomerAddress &&
              e.setData({
                "colorCardInfo.printGramWeight": !0,
              }),
            1 == t.data.printShopAddress &&
              e.setData({
                "colorCardInfo.printShopAddress": !0,
              }),
            1 == t.data.printShopTel &&
              e.setData({
                "colorCardInfo.printShopTel": !0,
              }),
            1 == t.data.printDate &&
              t.data.printTime &&
              e.setData({
                "colorCardInfo.printDate": !0,
              }),
            1 == t.data.printRemarkTag &&
              e.setData({
                "colorCardInfo.printRemarkTag": !0,
              }),
            1 == t.data.printShopName &&
              e.setData({
                "colorCardInfo.printShopName": !0,
              }))
          : wx.showToast({
              title: t.msg,
              icon: "none",
            });
      }));
  },
  bindDateChange: function (t) {
    this.setData({
      date: t.detail.value,
      "colorCardInfo.printDate": !0,
    });
  },
  getCurDate: function () {
    var t = new Date();
    util.utils.formatDateTime(t, !0);
  },
  getPrintType: function () {
    var t = this;
    (console.log("获取打印方式"),
      ServicesCard.newLabelPrint({}).then(function (a) {
        if ((console.log("获取打印方式:", a), 0 === a.code)) {
          if (null !== a.data) {
            var e = a.data.mpNewLabelPrint;
            (console.log(e),
              t.setData({
                newPrintType: e,
              }));
          }
          wx.hideLoading();
        } else
          wx.showToast({
            title: a.msg,
            icon: "none",
          });
      }));
  },
  onReady: function () {},
  onShow: function () {
    this.getPrintType();
  },
  onHide: function () {},
  onUnload: function () {},
  onPullDownRefresh: function () {},
  onReachBottom: function () {},
  onShareAppMessage: function () {},
});
