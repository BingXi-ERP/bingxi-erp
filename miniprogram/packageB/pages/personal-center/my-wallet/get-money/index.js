var t = require("../../../../../@babel/runtime/helpers/defineProperty"),
  ServicesMoney = require("../../../../libs/services/ServicesMoney"),
  app = getApp();
Page({
  data: {
    moneyInfoList: {},
    icon: {
      info: "".concat(app.config.imgHost, "/img/customer/Informations_Blue.png"),
    },
    moneyNum: "",
    wxAccount: "",
    showPop: !1,
  },
  userInput: function (e) {
    var app = e.currentTarget.dataset.item;
    "moneyNum" === app
      ? this.limitInput(e.detail.value)
      : this.setData({
          app: e.detail.value.replace(/[ ]/g, ""),
        });
  },
  limitInput: function (t) {
    var ServicesMoney,
      app = this.data.moneyInfoList;
    ((e = /^(\d?)+(\.\d{0,2})?$/.test(t) ? t : t.substring(0, t.length - 1)),
      this.setData({
        moneyNum: ServicesMoney,
      }),
      ServicesMoney > Number(app.balanceAmount) &&
        this.setData({
          moneyNum: app.balanceAmount,
        }));
  },
  showService: function () {
    this.setData({
      showPop: !0,
    });
  },
  cancleService: function () {
    this.setData({
      showPop: !1,
    });
  },
  moneyConfirm: function () {
    if (1 !== app.globalData.userInfo.freezedStatus) {
      var t = this.data,
        o = t.moneyInfoList,
        i = t.moneyNum,
        a = t.wxAccount,
        s = {
          accountId: o.id,
          optAmount: i,
          receiptAccount: a,
          balanceAmount: o.balanceAmount,
        };
      Number(o.balanceAmount) <= 0
        ? wx.showToast({
            title: "余额不足",
            icon: "none",
          })
        : (wx.showLoading({
            title: "正在提交中",
            mask: !0,
          }),
          clearTimeout(this.data.setTime),
          (this.datasetTime = setTimeout(function () {
            ServicesMoney.ServicesMoney.getMoney(s).then(function (t) {
              0 === t.code
                ? wx.showToast({
                    title: "提现申请已提交",
                    icon: "success",
                    mask: !0,
                    complete: function (t) {
                      setTimeout(function () {
                        wx.navigateBack({
                          delta: 1,
                        });
                      }, 1e3);
                    },
                  })
                : wx.showToast({
                    title: t.msg,
                    icon: "none",
                    mask: !0,
                    complete: function (t) {
                      setTimeout(function () {
                        wx.navigateBack({
                          delta: 1,
                        });
                      }, 1e3);
                    },
                  });
            });
          }, 500)));
    } else this.showService();
  },
  moneyRecord: function () {
    wx.navigateTo({
      url: "/packageB/pages/personal-center/my-wallet/money-record/index",
    });
  },
  onLoad: function (t) {
    this.setData({
      moneyInfoList: JSON.parse(t.moneyInfoList),
    });
  },
  onReady: function () {},
  onShow: function () {
    this.setData({
      wxAccount: this.data.moneyInfoList.receiptAccount,
    });
  },
  onHide: function () {},
  onUnload: function () {},
  onPullDownRefresh: function () {},
  onReachBottom: function () {},
  onShareAppMessage: function () {},
});
