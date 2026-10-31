var t = require("../../../../@babel/runtime/helpers/interopRequireDefault").default,
  e = require("../../../../@babel/runtime/helpers/defineProperty"),
  ServicesUserLog = require("../../../services/ServicesUserLog"),
  services_demand = require("../../../services/services-demand"),
  toast = t(require("@vant/weapp/toast/toast")),
  app = getApp();
Page({
  data: {
    orderType: "",
    typeText: "收款",
    parentMsg: {},
    btnDisabled: !1,
    moneyNum: "",
    customerId: "",
    billingId: "",
    billingIdList: [],
    icon: {
      checked: "".concat(app.config.imgHost, "/img/customer/duibuIcon/ok_yellow.png"),
      noCheck: "../../../../assets/images/ok_gray.png",
    },
    payWay: 0,
    wayArray: [
      {
        icon: "".concat(app.config.imgHost, "/img/customer/duibuIcon/weixin@2x.png"),
        value: "1",
        label: "微信",
      },
      {
        icon: "".concat(app.config.imgHost, "/img/customer/duibuIcon/zhifubao@2x.png"),
        value: "2",
        label: "支付宝",
      },
      {
        icon: "".concat(app.config.imgHost, "/img/customer/duibuIcon/xianjin@2x.png"),
        value: "3",
        label: "现金",
      },
      {
        icon: "".concat(app.config.imgHost, "/img/customer/duibuIcon/shuaka@2x.png"),
        value: "4",
        label: "刷卡",
      },
      {
        icon: "".concat(app.config.imgHost, "/img/customer/duibuIcon/huikuan@2x.png"),
        value: "5",
        label: "汇款",
      },
    ],
    selectedIndex: 0,
    popup: {
      showPopup: !1,
      popupRadio: "",
    },
    refundRemark: "",
  },
  onLoad: function (t) {
    var e = JSON.parse(t.query);
    ((this.data.parentMsg = e),
      1 == t.orderType
        ? (this.setData({
            typeText: "退款",
            orderType: 1,
            billingId: e.billingId,
            customerId: e.customerId,
          }),
          wx.setNavigationBarTitle({
            title: "退款",
          }))
        : (this.setData({
            typeText: "收款",
            parentMsg: e,
            moneyNum: e.total,
            customerId: e.customerId,
            billingIdList: e.selectedList,
          }),
          wx.setNavigationBarTitle({
            title: "收款",
          })));
  },
  onShow: function () {
    wx.removeStorageSync("due-change");
  },
  numInput: function (t) {
    var ServicesUserLog = t.currentTarget.dataset.item;
    "moneyNum" === ServicesUserLog
      ? this.limitInput(t.detail.value)
      : this.setData({
          ServicesUserLog: t.detail.value.replace(/[ ]/g, ""),
        });
  },
  limitInput: function (t) {
    var e;
    ((e = /^(\d?)+(\.\d{0,2})?$/.test(t) ? t : t.substring(0, t.length - 1)),
      this.data.parentMsg.total && e > 0 && e > Number(this.data.parentMsg.total)
        ? this.setData({
            moneyNum: this.data.parentMsg.total,
            btnDisabled: !1,
          })
        : this.setData({
            moneyNum: e,
            btnDisabled: !1,
          }));
  },
  chooseWay: function () {
    this.setData({
      "popup.showPopup": !0,
    });
  },
  wayTap: function (t) {
    var e = t.currentTarget.dataset.index;
    (this.setData({
      selectedIndex: e,
    }),
      this.popupClose());
  },
  popupClose: function () {
    this.setData({
      "popup.showPopup": !1,
    });
  },
  inputgetName: function (t) {
    this.setData({
      refundRemark: t.detail.value,
    });
  },
  confirm: function () {
    this.setData({
      btnDisabled: !0,
    });
    var t = {
      customerId: this.data.customerId,
      totalAmount: this.data.moneyNum,
      paymentMethod: this.data.wayArray[this.data.selectedIndex].value,
    };
    if (!this.data.moneyNum || "" === this.data.moneyNum || 0 === this.data.moneyNum)
      return (
        wx.showToast({
          title: "请输入" + this.data.typeText + "金额!",
          icon: "none",
          duration: 1500,
        }),
        void this.setData({
          moneyNum: "",
        })
      );
    1 == this.data.orderType
      ? ((t.remark = this.data.refundRemark),
        this.data.billingId ? this.billingRefund(t) : this.refundMoney(t))
      : ((t.billingIdList = this.data.billingIdList), this.receivableMony(t));
  },
  billingRefund: function (t) {
    var e = this,
      app = {
        billingId: this.data.billingId,
        paymentMethod: t.paymentMethod,
        remark: t.remark,
        totalAmount: t.totalAmount,
      };
    services_demand.ServicesDemand.saveRefundment(app).then(function (t) {
      0 === t.code
        ? (ServicesUserLog.servicesUserLog.setUserHandleLog(211),
          clearTimeout(e.data.timer),
          (0, toast.default)({
            message: "退款成功",
            type: "success",
            duration: 1e3,
          }),
          (e.data.timer = setTimeout(function () {
            wx.navigateBack({
              delta: 1,
            });
          }, 1e3)))
        : wx.showToast({
            title: t.msg,
            icon: "none",
            duration: 1500,
          });
      var services_demand = e;
      setTimeout(function () {
        services_demand.setData({
          btnDisabled: !1,
        });
      }, 2e3);
    });
  },
  receivableMony: function (t) {
    var e = this;
    services_demand.ServicesDemand.batchPayment(t).then(function (t) {
      0 === t.code
        ? (clearTimeout(e.data.timer),
          wx.showLoading({
            title: "收款成功跳转中",
          }),
          (e.data.timer = setTimeout(function () {
            (wx.setStorageSync("due-change", !0), wx.navigateBack());
          }, 500)))
        : wx.showToast({
            title: t.msg,
            icon: "none",
            duration: 1500,
          });
      var ServicesUserLog = e;
      setTimeout(function () {
        ServicesUserLog.setData({
          btnDisabled: !1,
        });
      }, 2e3);
    });
  },
  refundMoney: function (t) {
    var e = this;
    services_demand.ServicesDemand.batchRefundment(t).then(function (t) {
      0 === t.code
        ? (clearTimeout(e.data.timer),
          wx.showLoading({
            title: "退款成功跳转中",
          }),
          (e.data.timer = setTimeout(function () {
            (wx.setStorageSync("due-change", !0), wx.navigateBack());
          }, 500)))
        : wx.showToast({
            title: t.msg,
            icon: "none",
            duration: 1500,
          });
      var ServicesUserLog = e;
      setTimeout(function () {
        ServicesUserLog.setData({
          btnDisabled: !1,
        });
      }, 2e3);
    });
  },
});
