var t = require("../../../@babel/runtime/helpers/interopRequireDefault").default,
  a = require("../../../@babel/runtime/helpers/defineProperty"),
  toast = t(require("../../../miniprogram_npm/@vant/weapp/toast/toast")),
  number = t(require("../../../utils/number")),
  mta_analysis = t(require("../../../utils/mta_analysis.js")),
  ServicesUserLog = require("../../../libs/services/ServicesUserLog"),
  ServicesOrder = require("../../../libs/services/ServicesOrder").ServicesOrder,
  app = getApp();
Page({
  data: {
    total: "",
    actualPay: "",
    payed: "",
    unpay: "",
    unpayTemp: "",
    discount: "",
    payment: "0.00",
    paymentWechat: "",
    paymentAlipay: "",
    paymentCash: "",
    paymentCard: "",
    paymentRemit: "",
    choosedItemId: "",
    paymentRecord: [],
    icon: {
      nodata: "".concat(app.config.imgHost, "/img/customer/duibuIcon/no-data2@2x.png"),
      weixin: "".concat(app.config.imgHost, "/img/customer/duibuIcon/weixin@2x.png"),
      zhifubao: "".concat(app.config.imgHost, "/img/customer/duibuIcon/zhifubao@2x.png"),
      xianjin: "".concat(app.config.imgHost, "/img/customer/duibuIcon/xianjin@2x.png"),
      shuaka: "".concat(app.config.imgHost, "/img/customer/duibuIcon/shuaka@2x.png"),
      huikuan: "".concat(app.config.imgHost, "/img/customer/duibuIcon/huikuan@2x.png"),
    },
  },
  onLoad: function (t) {
    mta_analysis.default.Page.init();
    var a = t.id;
    this.setData({
      choosedItemId: a,
    });
  },
  paymentDetail: function () {
    var t = this,
      a = {
        billingId: this.data.choosedItemId,
      };
    ServicesOrder.paymentDetail(a)
      .then(function (a) {
        0 === a.code &&
          t.setData({
            total: a.data.orderAmount,
            actualPay: a.data.paymentAmount,
            payed: a.data.receivedAmount,
            unpay: a.data.payableAmount,
            unpayTemp: a.data.payableAmount,
          });
      })
      .catch(function (t) {
        console.log(t);
      });
  },
  paymentList: function () {
    var t = this,
      a = {
        orderId: this.data.choosedItemId,
      };
    (wx.showLoading({
      title: "加载中",
    }),
      ServicesOrder.paymentList(a)
        .then(function (a) {
          (wx.hideLoading(),
            0 === a.code
              ? t.setData({
                  paymentRecord: a.data,
                })
              : wx.showToast({
                  title: a.msg,
                  icon: "none",
                }));
        })
        .catch(function (t) {
          (console.log(t), wx.hideLoading());
        }));
  },
  savePayment: function () {
    var t = this,
      a = this.data,
      number = a.unpay,
      mta_analysis = (a.unpayTemp, a.payment);
    if (0 != mta_analysis) {
      if (Number(mta_analysis) - Number(number) > 0)
        (0, toast.default)({
          message: "本次收款金额不得大于待收金额",
          duration: 1500,
        });
      else {
        wx.showLoading({
          title: "提交中",
        });
        var app = {
          billingId: this.data.choosedItemId,
          paymentType: 0,
          discountAmount: this.data.discount,
          wxAmount: this.data.paymentWechat,
          alipayAmount: this.data.paymentAlipay,
          cashAmount: this.data.paymentCash,
          cardAmount: this.data.paymentCard,
          remitAmount: this.data.paymentRemit,
          totalAmount: this.data.payment,
        };
        ServicesOrder.savePayment(app)
          .then(function (a) {
            if ((wx.hideLoading(), 0 === a.code)) {
              ServicesUserLog.servicesUserLog.setUserHandleLog(210);
              var toast = a.data;
              ((toast.unpay = t.data.unpayTemp),
                (e = JSON.stringify(toast)),
                wx.navigateTo({
                  url: "/pages/order/receipt-success/index?data=".concat(toast),
                }));
            } else
              (wx.hideLoading(),
                wx.showToast({
                  title: a.msg,
                  icon: "none",
                }));
          })
          .catch(function (t) {
            wx.hideToast();
          });
      }
    } else
      (0, toast.default)({
        message: "收款不能为空",
        duration: 1500,
      });
  },
  onReady: function () {},
  onShow: function () {
    (this.paymentDetail(), this.paymentList(), this.resetData());
  },
  onHide: function () {},
  onUnload: function () {},
  onPullDownRefresh: function () {},
  onReachBottom: function () {},
  onShareAppMessage: function () {},
  handleInputDiscount: function (t) {
    var a = this.handleInputDecimalLeng(t);
    if (Number(a) > Number(this.data.unpayTemp))
      return (
        (0, toast.default)({
          message: "优惠金额不能大于待收",
          duration: 1e3,
        }),
        this.setData({
          discount: "",
          unpay: this.data.unpayTemp,
        }),
        ""
      );
    var mta_analysis = this.data,
      ServicesUserLog = mta_analysis.actualPay,
      ServicesOrder = mta_analysis.payed,
      app = number.default.operation(Number(ServicesUserLog), Number(ServicesOrder), "subtract");
    return (
      (u = number.default.operation(Number(app), Number(a), "subtract")),
      (u = Number(app)),
      this.setData({
        unpay: app,
        discount: a,
      }),
      a
    );
  },
  totalPay: function () {
    var t = this.data,
      a = t.paymentWechat,
      toast = t.paymentAlipay,
      number = t.paymentCash,
      mta_analysis = t.paymentCard,
      ServicesUserLog = t.paymentRemit,
      ServicesOrder =
        Number(a) + Number(toast) + Number(number) + Number(mta_analysis) + Number(ServicesUserLog);
    this.setData({
      payment: ServicesOrder.toFixed(2),
    });
  },
  resetData: function () {
    this.setData({
      discount: "",
      payment: "0.00",
      paymentWechat: "",
      paymentAlipay: "",
      paymentCash: "",
      paymentCard: "",
      paymentRemit: "",
    });
  },
  handleBlurInput: function (t) {
    var toast = t.detail.value,
      number = t.target.dataset.key;
    ("." == toast.substr(toast.length - 1) &&
      this.setData({
        number: 0 == toast ? "" : Number(toast),
      }),
      this.setData({
        number: "" !== toast ? Number(toast) : "",
      }),
      this.totalPay());
  },
  handleValUpdatePay: function (t) {
    var toast = this.handleInputDecimalLeng(t),
      number = t.target.dataset.key;
    (this.setData({
      number: toast,
    }),
      this.totalPay());
  },
  handleInputDecimalLeng: function (t) {
    var a = /^(\.*)(\d+)(\.?)(\d{0,2}).*$/g,
      toast = t.detail.value;
    return a.test(toast) ? toast.replace(a, "$2$3$4") : "";
  },
});
