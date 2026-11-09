var t = require("../../../../@babel/runtime/helpers/interopRequireDefault").default,
  e = require("../../../../@babel/runtime/helpers/defineProperty"),
  n =
    (t(require("../../../../miniprogram_npm/@vant/weapp/toast/toast")),
    require("../../../services/services-demand")),
  i =
    (require("../../../../libs/services/orderPrint"),
    t(require("../../../../utils/mta_analysis")),
    t(require("../../../../utils/throttle"))),
  app = getApp();
Page({
  data: {
    type: "",
    printConfig: {},
    showTitsPopular: !1,
    customerId: "",
    startTime: "",
    endTime: "",
    isInit: !1,
    footerMaxLeng: 50,
    remarkMaxLeng: 50,
    printPaymentType: "0",
    hasBankInfo: "0",
    printerName: "",
    printCopies: "1",
    billingIds: [],
    onlyDebt: "",
    printFlag: !1,
  },
  onLoad: function (t) {
    (console.log("view"),
      console.log(t),
      t && t.customerId
        ? this.setData({
            type: 1,
            onlyDebt: t.onlyDebt,
            billingIds: t.billingIds,
            customerId: t.customerId,
            startTime: t.startTime,
            endTime: t.endTime,
          })
        : this.setData({
            type: 0,
          }),
      this.setData({
        userAuthList: app.userAuthList,
      }));
  },
  onReady: function () {},
  onShow: function () {
    this.getPrintInfo();
  },
  onHide: function () {},
  onUnload: function () {},
  onPullDownRefresh: function () {},
  onReachBottom: function () {},
  onShareAppMessage: function () {},
  handlePintPreview: function () {
    var t = this.data,
      e = t.billingIds,
      n = t.customerId,
      i = t.printPaymentType,
      app = t.printCopies,
      o = t.startTime,
      r = t.endTime,
      s = t.onlyDebt,
      d = t.printConfig,
      c = t.orderByFlag;
    d.orderByFlag = c;
    var p = "customerId="
        .concat(n, "&printPaymentType=")
        .concat(i, "&printCopies=")
        .concat(app, "&startTime=")
        .concat(o, "&endTime=")
        .concat(r, "&onlyDebt=")
        .concat(s, "&billingIds=")
        .concat(e, "&printConfig=")
        .concat(JSON.stringify(d)),
      l = "../print-preview/print-preview?".concat(p);
    wx.navigateTo({
      url: l,
    });
  },
  getPrintInfo: function () {
    var t = this;
    (wx.showLoading({
      title: "加载中",
    }),
      n.ServicesDemand.getPrintSetting({}).then(function (e) {
        if ((wx.hideLoading(), 0 === e.code)) {
          var n = e.data,
            i = n.hasBankInfo,
            app = n.printPaymentType,
            o = n.printerName,
            r = n.printCopies;
          t.data.isInit
            ? (0 == t.data.printPaymentType &&
                t.setData({
                  printPaymentType: app,
                }),
              t.setData({
                printConfig: e.data,
                printerName: o,
              }))
            : t.setData({
                printConfig: e.data,
                printPaymentType: app,
                printerName: o,
                hasBankInfo: i,
                printCopies: r,
                isInit: !0,
              });
        } else
          wx.showToast({
            title: e.msg || "加载失败",
            icon: "none",
            duration: 3e3,
          });
      }));
  },
  handleUpdateVal: function (t) {
    var n = t.currentTarget.dataset.key,
      i = t.detail.value;
    this.setData({
      n: i.replace(/[^\d]/g, ""),
    });
  },
  closeTitsPopular: function () {
    this.setData({
      showTitsPopular: !1,
    });
  },
  toAddCard: function () {
    (this.setData({
      showTitsPopular: !1,
    }),
      wx.navigateTo({
        url: "/packageB/pages/personal-center/bank-card/bank-card",
      }));
  },
  handleCheckbox: function (t) {
    var n = this.data.hasBankInfo,
      i = t.currentTarget.dataset,
      app = i.key,
      o = i.value;
    0 != n
      ? this.setData({
          app: Number(o),
        })
      : this.setData({
          showTitsPopular: !0,
        });
  },
  handlePrint: i.default.throttle(function () {
    var t = this.data,
      e = (t.footerMaxLeng, t.remarkMaxLeng, t.billingIds),
      i = t.customerId,
      app = t.startTime,
      o = t.endTime,
      r = t.onlyDebt,
      s = t.printerName,
      d = (t.printPaymentType, t.printCopies),
      c = [];
    if (
      ("" === s && c.push("请先连接打印机"),
      "" === d && c.push("请输入打印份数"),
      0 === d && c.push("打印份数不能为 0"),
      0 === c.length)
    ) {
      var p = {
        printCopies: d,
        startTime: app && app + " 00:00:00",
        endTime: o && o + " 23:59:59",
        billingIds: e,
        onlyDebt: r,
      };
      (wx.showLoading({
        title: "打印中",
      }),
        1 == this.data.type
          ? n.ServicesDemand.printDue(i, p)
              .then(function (t) {
                0 === t.code
                  ? setTimeout(function () {
                      (wx.showToast({
                        title: "打印成功",
                        icon: "none",
                        duration: 3e3,
                      }),
                        wx.hideLoading());
                    }, 2500)
                  : (wx.hideLoading(),
                    wx.showToast({
                      title: t.msg || "打印失败",
                      icon: "none",
                      duration: 3e3,
                    }));
              })
              .catch(function (t) {
                wx.hideLoading();
              })
          : n.ServicesDemand.printAllDue(this.data.printConfig)
              .then(function (t) {
                0 === t.code
                  ? setTimeout(function () {
                      wx.hideLoading();
                    }, 2500)
                  : (wx.hideLoading(),
                    wx.showToast({
                      title: t.msg || "打印失败",
                      icon: "none",
                      duration: 3e3,
                    }));
              })
              .catch(function (t) {
                wx.hideLoading();
              }));
    } else
      wx.showToast({
        title: c[0],
        icon: "none",
        duration: 3e3,
      });
  }),
});
