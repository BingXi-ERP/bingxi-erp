var t = require("../../../@babel/runtime/helpers/interopRequireDefault").default,
  objectSpread2 = require("../../../@babel/runtime/helpers/objectSpread2"),
  a = require("../../../@babel/runtime/helpers/defineProperty"),
  dialog = t(require("../../../miniprogram_npm/@vant/weapp/dialog/dialog")),
  toast = t(require("../../../miniprogram_npm/@vant/weapp/toast/toast")),
  orderCreate = require("../../../libs/services/orderCreate"),
  util = require("../../../libs/utils/util"),
  mta_analysis = t(require("../../../utils/mta_analysis")),
  ServicesUserLog = require("../../../libs/services/ServicesUserLog"),
  number = t(require("../../../utils/number")),
  m = "orderCreateInfo",
  app = getApp();
Page({
  data: {
    isFromPin: "0",
    orderId: "",
    openType: "offline",
    orderInfo: null,
    total: "0.00",
    totalB: "0.00",
    unpay: "",
    discount: "",
    otherCost: "",
    payment: "0.00",
    icon: {
      weixin: "".concat(app.config.imgHost, "/img/customer/duibuIcon/weixin@2x.png"),
      zhifubao: "".concat(app.config.imgHost, "/img/customer/duibuIcon/zhifubao@2x.png"),
      xianjin: "".concat(app.config.imgHost, "/img/customer/duibuIcon/xianjin@2x.png"),
      shuaka: "".concat(app.config.imgHost, "/img/customer/duibuIcon/shuaka@2x.png"),
      huikuan: "".concat(app.config.imgHost, "/img/customer/duibuIcon/huikuan@2x.png"),
    },
    paymentWechat: "",
    paymentAlipay: "",
    paymentCash: "",
    paymentCard: "",
    paymentRemit: "",
    countModeArray: ["默认", "四舍五入", "去尾数", "进一取整"],
    countModeIndex: 0,
  },
  onLoad: function (t) {
    var objectSpread2 = this;
    (mta_analysis.default.Page.init(),
      this.setData({
        isFromPin: t.isFromPin,
        openType: t.openType,
        orderId: t.orderId,
      }),
      wx.getStorage({
        key: m,
        success: function (t) {
          objectSpread2.setData({
            total: t.data.orderAmount,
            totalB: t.data.orderAmount,
            unpay: t.data.orderAmount,
            orderInfo: t.data,
          });
        },
        fail: function () {},
      }));
  },
  onReady: function () {
    this.getUnpay();
  },
  onShow: function () {},
  onHide: function () {},
  onUnload: function () {
    wx.removeStorage({
      key: m,
    });
  },
  onPullDownRefresh: function () {},
  onReachBottom: function () {},
  onShareAppMessage: function () {},
  bindCountMode: function (t) {
    var objectSpread2 = this.data,
      a = objectSpread2.total,
      dialog = objectSpread2.discount,
      toast = t.detail.value;
    this.setData({
      countModeIndex: toast,
    });
    var orderCreate =
        toast > 0 ? Math[["", "round", "floor", "ceil"][toast]](Number(a)) : Number(a).toFixed(2),
      util = number.default.operation(Number(orderCreate), Number(a), "subtract");
    ((i = number.default.operation(Number(orderCreate), Number(dialog || 0), "subtract")),
      this.setData({
        unpay: orderCreate,
        otherCost: util,
      }));
  },
  handleInputOtherCost: function (t) {
    var objectSpread2 = this.handleInputDecimalLeng(t),
      a = this.data,
      dialog = a.totalB,
      orderCreate = a.discount,
      util = void 0 === orderCreate ? 0 : orderCreate,
      mta_analysis =
        (Number(dialog),
        Number(objectSpread2),
        Number(dialog) + Number(objectSpread2) - Number(util));
    return (
      (u = Number(mta_analysis).toFixed(2)),
      this.setData({
        otherCost: objectSpread2,
        unpay: mta_analysis,
        countModeIndex: 0,
      }),
      Number(this.data.discount) > Number(this.data.total) &&
        ((0, toast.default)({
          message: "优惠金额不能大于订单金额",
          duration: 1e3,
        }),
        this.setData({
          total: Number(dialog).toFixed(2),
          unpay: Number(dialog).toFixed(2),
          discount: "",
          otherCost: "",
        })),
      objectSpread2
    );
  },
  handleInputDiscount: function (t) {
    var objectSpread2 = this.handleInputDecimalLeng(t),
      a = this.data.total,
      dialog = this.data.otherCost;
    if (Number(objectSpread2) > Number(this.data.total) + Number(this.data.otherCost))
      return (
        (0, toast.default)({
          message: "优惠金额不能大于订单金额",
          duration: 1e3,
        }),
        this.setData({
          unpay: "0.00",
          discount: a,
        }),
        a
      );
    var orderCreate = this.data,
      util = orderCreate.total,
      mta_analysis = orderCreate.countModeIndex,
      ServicesUserLog =
        mta_analysis > 0
          ? Math[["", "round", "floor", "ceil"][mta_analysis]](Number(util))
          : Number(util).toFixed(2),
      m = a ? Number(ServicesUserLog) + Number(dialog) : Number(ServicesUserLog),
      app = number.default.operation(Number(m), Number(objectSpread2), "subtract");
    return (
      this.setData({
        unpay: app,
        discount: objectSpread2,
      }),
      objectSpread2
    );
  },
  getUnpay: function () {
    var t = this.data,
      objectSpread2 = t.total,
      a = t.discount,
      dialog = Number(objectSpread2) - Number(a);
    ((n = Number(dialog).toFixed(2)),
      this.setData({
        unpay: dialog,
      }));
  },
  handleBlurInput: function (t) {
    var objectSpread2 = t.detail.value,
      dialog = t.target.dataset.key;
    ("." == objectSpread2.substr(objectSpread2.length - 1) &&
      this.setData({
        dialog: 0 == objectSpread2 ? "" : Number(objectSpread2),
      }),
      this.totalPay());
  },
  totalPay: function () {
    var t = this.data,
      objectSpread2 = t.paymentWechat,
      a = t.paymentAlipay,
      dialog = t.paymentCash,
      toast = t.paymentCard,
      orderCreate = t.paymentRemit,
      util =
        Number(objectSpread2) + Number(a) + Number(dialog) + Number(toast) + Number(orderCreate);
    this.setData({
      payment: util.toFixed(2),
    });
  },
  handleSubmit: function () {
    var t = this,
      objectSpread2 = this.data,
      a = (objectSpread2.orderInfo, objectSpread2.total, objectSpread2.unpay),
      orderCreate = (objectSpread2.discount, objectSpread2.otherCost, objectSpread2.payment),
      util = objectSpread2.paymentWechat,
      mta_analysis = objectSpread2.paymentAlipay,
      ServicesUserLog = objectSpread2.paymentCash,
      number = objectSpread2.paymentCard,
      m = objectSpread2.paymentRemit;
    Number(orderCreate) - Number(a) > 0
      ? (0, toast.default)("本次收款金额不得大于待收金额")
      : "" === util && "" === mta_analysis && "" === ServicesUserLog && "" === number && "" === m
        ? dialog.default
            .confirm({
              message: "收款方式为空，确定开单？",
            })
            .then(function () {
              t.submitOrder();
            })
            .catch(function () {})
        : this.submitOrder();
  },
  submitOrder: function () {
    var t = this,
      a = this.data,
      dialog = a.orderId,
      mta_analysis = a.orderInfo,
      number = a.total,
      m = a.discount,
      app = a.otherCost,
      l = a.paymentWechat,
      p = a.paymentAlipay,
      h = a.paymentCash,
      b = a.paymentCard,
      y = a.paymentRemit,
      g = a.isFromPin,
      f = a.countModeIndex;
    wx.showLoading({
      title: "开单中",
    });
    var N = objectSpread2(
      objectSpread2(
        {
          orderId: dialog,
        },
        mta_analysis,
      ),
      {},
      {
        otherCost: app,
        calMethod: f,
        billingPayment: {
          paymentType: "0",
          totalAmount: number,
          discountAmount: m,
          wxAmount: l,
          alipayAmount: p,
          cashAmount: h,
          cardAmount: b,
          remitAmount: y,
        },
      },
    );
    (0, orderCreate.paymentOrder)(N)
      .then(function (e) {
        wx.hideLoading();
        var a = e.data,
          dialog = a.billingId,
          orderCreate = void 0 === dialog ? "" : dialog,
          mta_analysis = a.billingNo,
          number = void 0 === mta_analysis ? "" : mta_analysis,
          m = a.orderAmount,
          l = void 0 === m ? "" : m,
          p = a.totalAmount,
          h = void 0 === p ? "" : p,
          b = a.discountAmount,
          y = void 0 === b ? "" : b,
          f = a.paymentTerm,
          v = void 0 === f ? "" : f,
          x = a.customerName,
          I = void 0 === x ? "" : x;
        if (0 === e.code) {
          (ServicesUserLog.servicesUserLog.setUserHandleLog("1" === N.saleType ? 201 : 202),
            wx.showToast({
              title: "开单成功",
            }));
          var A = {
              isFromPin: g,
              billingId: orderCreate,
              billingNo: number,
              orderAmount: l,
              totalAmount: h,
              discountAmount: y,
              paymentTerm: v,
              customerName: I,
              otherCost: app,
              openType: t.data.openType,
            },
            C = "/pages/order-create/success/index?".concat(util.utils.serialize(A));
          wx.redirectTo({
            url: C,
          });
        } else
          (0, toast.default)({
            message: e.msg || "收款失败",
            duration: "3000",
          });
      })
      .catch(function (t) {
        wx.hideLoading();
      });
  },
  handleValUpdate: function (t) {
    var objectSpread2 = this.handleInputDecimalLeng(t),
      dialog = t.target.dataset.key;
    (this.setData({
      dialog: objectSpread2,
    }),
      this.totalPay());
  },
  handleInputDecimalLeng: function (t) {
    var objectSpread2 = /^(\.*)(\d+)(\.?)(\d{0,2}).*$/g,
      a = t.detail.value;
    return objectSpread2.test(a) ? a.replace(objectSpread2, "$2$3$4") : "";
  },
});
