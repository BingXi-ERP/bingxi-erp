var e = require("../../../@babel/runtime/helpers/interopRequireDefault").default,
  t = require("../../../@babel/runtime/helpers/defineProperty"),
  toast = e(require("../../../miniprogram_npm/@vant/weapp/toast/toast")),
  orderPrint = require("../../../libs/services/orderPrint"),
  mta_analysis = e(require("../../../utils/mta_analysis")),
  throttle = e(require("../../../utils/throttle")),
  app = getApp();
Page({
  data: {
    userType: "",
    printSelectText: ["不显示", "打印银行账户", "打印收款码", "打印收款码和银行账号"],
    printType: "1",
    showSelect: !1,
    userAuthList: {},
    showArea: !1,
    isInit: !1,
    orderId: "",
    footerMaxLeng: 50,
    remarkMaxLeng: 30,
    printCustomerTel: 1,
    refundPrintTel: "",
    printerSale: 0,
    printPaymentType: "0",
    hasBankInfo: 0,
    printerName: "",
    printCopies: "1",
    printUserName: "",
    billingFooter: "",
    printRemark: "",
    billingDeliveryman: "",
    creatorList: [],
    curCreator: "",
    showTipsText: "您还没有添加银行卡",
    icon: {
      checked: "".concat(app.config.imgHost, "/img/customer/duibuIcon/phone_check@2x.png"),
      noCheck: "./../../assets/imaphone_uncheck@2x.png",
    },
    printSelectArr: [
      {
        id: "2",
        text: "打印收款码",
      },
      {
        id: "1",
        text: "打印银行账户",
      },
      {
        id: "3",
        text: "打印收款码和银行账号",
      },
      {
        id: "0",
        text: "不显示",
      },
    ],
  },
  openShow: function () {
    this.setData({
      showArea: !0,
    });
  },
  closeShow: function () {
    this.setData({
      showArea: !1,
    });
  },
  onLoad: function (e) {
    (mta_analysis.default.Page.init(),
      this.setData({
        userAuthList: app.userAuthList,
        userType: app.globalData.userInfo.type,
        orderId: e.orderId,
        userAuthList: app.userAuthList,
        customMobile: e.customMobile ? e.customMobile : "",
        printType: e.printType,
      }),
      "return" == e.printType &&
        wx.setNavigationBarTitle({
          title: "打印退货单",
        }),
      this.getCreatorList());
  },
  onShow: function () {
    "order" == this.data.printType ? this.getPrintInfoMeth() : this.getRefundInfo();
  },
  handlePintPreview: function () {
    var e = this.data,
      t = e.orderId,
      toast = e.billingFooter,
      orderPrint = e.refundBillingFooter,
      mta_analysis = e.printPaymentType,
      throttle = e.hasBankInfo,
      app = e.printCopies,
      s = e.billingDeliveryman,
      l = e.printUserName,
      p = e.printRemark,
      d = e.printCustomerTel,
      u = e.refundPrintTel,
      c = e.printType,
      h = e.printerSale,
      g = "orderId="
        .concat(t, "&billingFooter=")
        .concat(toast, "&refundBillingFooter=")
        .concat(orderPrint, "&hasBankInfo=")
        .concat(throttle, "&printPaymentType=")
        .concat(mta_analysis, "&printCopies=")
        .concat(app, "&printRemark=")
        .concat(p, "&billingDeliveryman=")
        .concat(s, "&printerSale=")
        .concat(h),
      f = "/pages/printing/order-preview/index?"
        .concat(g, "&printCustomerTel=")
        .concat(d, "&refundPrintTel=")
        .concat(u, "&printType=")
        .concat(c, "&printUserName=")
        .concat(l);
    wx.navigateTo({
      url: f,
    });
  },
  selectCreatorCancek: function () {
    this.setData({
      showSelect: !1,
    });
  },
  getCreatorList: function () {
    var e = this;
    (0, orderPrint.shopUserList)().then(function (t) {
      if (0 == t.code) {
        var toast = t.data.map(function (e) {
          return {
            creatorId: e.userId,
            creatorName: e.userName,
            creatorMobile: e.mobile,
            text: e.userName,
            id: e.userId,
          };
        });
        e.setData({
          creatorList: toast,
        });
      }
    });
  },
  selectCreator: function (e) {
    var t = this.data.creatorList[e.detail.index];
    (this.setData({
      curCreator: t,
      printUserName: t.creatorName,
    }),
      this.showSelectPopup());
  },
  showSelectPopup: function () {
    this.setData({
      showSelect: !this.data.showSelect,
      showArea: !1,
    });
  },
  getPrintInfoMeth: function () {
    var e = this;
    (wx.showLoading({
      title: "加载中",
    }),
      (0, orderPrint.getPrintInfo)({
        billingId: this.data.orderId,
      })
        .then(function (t) {
          if ((wx.hideLoading(), 0 === t.code)) {
            var orderPrint = t.data,
              mta_analysis = orderPrint.printPaymentType,
              throttle = orderPrint.hasBankInfo,
              app = orderPrint.hasMoneyCodeInfo,
              s = orderPrint.billingFooter,
              l = orderPrint.printerName,
              p = orderPrint.printCopies,
              d = orderPrint.printUserName,
              u = orderPrint.printRemark,
              c = orderPrint.billingDeliveryman,
              h = orderPrint.printCustomerTel,
              g = orderPrint.printerSale;
            e.data.isInit
              ? (0 == e.data.hasBankInfo &&
                  e.setData({
                    hasBankInfo: throttle,
                  }),
                e.setData({
                  printerName: l,
                }))
              : e.setData({
                  printPaymentType: null === mta_analysis ? "" : mta_analysis,
                  hasBankInfo: throttle,
                  hasMoneyCodeInfo: app,
                  billingFooter:
                    null != s && s.length
                      ? s
                      : "*若发现产品质量问题，请于三天内与本行联系，逾期、裁剪。或是在本产品上附任何工艺，本行概不负责！",
                  printerName: l,
                  printCopies: p,
                  printUserName: d,
                  printRemark: u,
                  billingDeliveryman: c,
                  printCustomerTel: h || 0,
                  isInit: !0,
                  printerSale: g,
                });
          } else
            (0, toast.default)({
              message: t.msg || "加载失败",
              duration: 1500,
              position: "bottom",
              zIndex: 1e5,
            });
        })
        .catch(function (e) {
          wx.hideLoading();
        }));
  },
  getRefundInfo: function () {
    var e = this;
    (wx.showLoading({
      title: "加载中",
    }),
      (0, orderPrint.getRefundInfo)({
        refundId: this.data.orderId,
      })
        .then(function (t) {
          if ((wx.hideLoading(), 0 === t.code)) {
            var orderPrint = t.data,
              mta_analysis = orderPrint.hasBankInfo,
              throttle = orderPrint.hasMoneyCodeInfo,
              app = orderPrint.printPaymentType,
              s = orderPrint.billingFooter,
              l = orderPrint.printerName,
              p = orderPrint.printCopies,
              d = orderPrint.printUserName,
              u = orderPrint.printRemark,
              c = orderPrint.billingDeliveryman,
              h = orderPrint.printCustomerTel,
              g = orderPrint.printerSale;
            e.data.isInit
              ? (0 == e.data.hasBankInfo &&
                  e.setData({
                    hasBankInfo: mta_analysis,
                  }),
                e.setData({
                  printerName: l,
                }))
              : e.setData({
                  hasBankInfo: mta_analysis,
                  hasMoneyCodeInfo: throttle,
                  printPaymentType: null === app ? "" : app,
                  billingFooter: s,
                  refundBillingFooter:
                    t.data.billingFooter && t.data.billingFooter.length ? t.data.billingFooter : "",
                  printerName: l,
                  printCopies: p,
                  printUserName: d,
                  printRemark: u,
                  billingDeliveryman: c,
                  refundPrintTel: t.data.refundPrintTel ? t.data.refundPrintTel : "",
                  printCustomerTel: h || 0,
                  isInit: !0,
                  printerSale: g,
                });
          } else
            (0, toast.default)({
              message: t.msg || "加载失败",
              duration: 1500,
              position: "bottom",
              zIndex: 1e5,
            });
        })
        .catch(function (e) {
          (console.log(e), wx.hideLoading());
        }));
  },
  handleUpdateVal: function (e) {
    var toast = e.currentTarget.dataset.key,
      orderPrint = e.detail.value;
    this.setData({
      toast: "billingDeliveryman" === toast ? orderPrint : orderPrint.replace(/[^\d]/g, ""),
    });
  },
  handleUpdateFooter: function (e) {
    var toast = "";
    n = "order" == this.data.printType ? e.currentTarget.dataset.key : "refundBillingFooter";
    var orderPrint = e.detail.value;
    (orderPrint.trim().length,
      this.data.footerMaxLeng,
      this.setData({
        toast: orderPrint,
      }));
  },
  handleUpdateRemark: function (e) {
    var toast = e.currentTarget.dataset.key,
      orderPrint = e.detail.value;
    (orderPrint.trim().length,
      this.data.remarkMaxLeng,
      this.setData({
        toast: orderPrint,
      }));
  },
  phoneCheckbox: function (e) {
    var toast = "";
    n = "order" == this.data.printType ? e.currentTarget.dataset.key : "refundPrintTel";
    var orderPrint = e.currentTarget.dataset.value;
    this.setData({
      toast: Number(orderPrint),
    });
  },
  saleOrderCheckbox: function (e) {
    var toast = e.currentTarget.dataset,
      orderPrint = toast.value,
      mta_analysis = toast.key;
    this.setData({
      mta_analysis: Number(orderPrint),
    });
  },
  handleCheckbox: function (e) {
    wx.navigateTo({
      url: "/packageB/pages/personal-center/bank-card/bank-card",
    });
  },
  handlePrint: throttle.default.throttle(function () {
    var e = this.data,
      t = e.footerMaxLeng,
      mta_analysis = e.remarkMaxLeng,
      throttle = e.orderId,
      app = e.printerName,
      s = e.billingFooter,
      l = e.refundBillingFooter,
      p = e.printPaymentType,
      d = e.hasBankInfo,
      u = e.billingDeliveryman,
      c = e.printCopies,
      h = e.printCustomerTel,
      g = e.refundPrintTel,
      f = e.printUserName,
      m = e.printRemark,
      T = e.printerSale,
      y = [];
    if (
      ("" === app && y.push("请先连接打印机"),
      "" === c && y.push("请输入打印份数"),
      0 === c && y.push("打印份数不能为 0"),
      s.length > t && y.push("自定义页脚字数已超出限制"),
      m.length > mta_analysis && y.push("备注字数已超出限制"),
      0 === y.length)
    ) {
      var I = {
        billingFooter: s,
        refundBillingFooter: l,
        printPaymentType: p,
        hasBankInfo: d,
        printCopies: c,
        printRemark: m,
        billingDeliveryman: u,
        printCustomerTel: h,
        refundPrintTel: g,
        printUserName: f,
        printerSale: T,
      };
      (wx.showLoading({
        title: "打印中",
      }),
        "order" == this.data.printType
          ? (0, orderPrint.printOrder)(throttle, I)
              .then(function (e) {
                0 === e.code
                  ? setTimeout(function () {
                      ((0, toast.default)({
                        message: "打印成功",
                        duration: 2e3,
                      }),
                        wx.hideLoading());
                    }, 2500)
                  : (wx.hideLoading(),
                    (0, toast.default)({
                      message: e.msg || "打印失败",
                      duration: 1500,
                      position: "bottom",
                      zIndex: 1e5,
                    }));
              })
              .catch(function (e) {
                wx.hideLoading();
              })
          : (0, orderPrint.printRefundOrder)(throttle, I)
              .then(function (e) {
                0 === e.code
                  ? setTimeout(function () {
                      ((0, toast.default)({
                        message: "打印成功",
                        duration: 2e3,
                      }),
                        wx.hideLoading());
                    }, 2500)
                  : (wx.hideLoading(),
                    (0, toast.default)({
                      message: e.msg || "打印失败",
                      duration: 1500,
                      position: "bottom",
                      zIndex: 1e5,
                    }));
              })
              .catch(function (e) {
                wx.hideLoading();
              }));
    } else
      (0, toast.default)({
        message: y[0],
        duration: 1500,
        position: "bottom",
        zIndex: 1e5,
      });
  }),
  showPrintSelectPopup: function () {
    this.setData({
      printSelectPopup: !0,
      showArea: !1,
    });
  },
  closePrintSelectPopup: function () {
    this.setData({
      printSelectPopup: !1,
    });
  },
  popupClickCancek: function () {
    this.setData({
      printSelectPopup: !1,
    });
  },
  popupClick: function (e) {
    var t = this.data.printSelectArr[e.detail.index].id;
    if (
      ("1" == t && 0 == this.data.hasBankInfo) ||
      (("2" == t || "3" == t) && 0 == this.data.hasMoneyCodeInfo)
    )
      return (
        this.setData({
          showTitsPopular: !0,
          curRadio: t,
          showTipsText: "2" == t || "3" == t ? "您没有添加收款码" : "您没有添加银行卡",
        }),
        void this.closePrintSelectPopup()
      );
    ("2" != t && "3" != t) || 1 != this.data.hasMoneyCodeInfo
      ? (this.setData({
          printPaymentType: t,
        }),
        this.closePrintSelectPopup())
      : wx.showToast({
          title: "二维码已上传,待审核中！",
          icon: "none",
        });
  },
  closeTitsPopular: function () {
    this.setData({
      showTitsPopular: !1,
    });
  },
  toAddCard: function () {
    ("1" == this.data.curRadio
      ? wx.navigateTo({
          url: "/packageB/pages/personal-center/bank-card/bank-card",
        })
      : wx.navigateTo({
          url: "/packageB/pages/personal-center/setting/accountsetting/QR-code/index",
        }),
      this.closeTitsPopular());
  },
});
