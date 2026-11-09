var toConsumableArray = require("../../../../@babel/runtime/helpers/toConsumableArray"),
  objectSpread2 = require("../../../../@babel/runtime/helpers/objectSpread2"),
  ServicesMoney = require("../../../libs/services/ServicesMoney"),
  app = getApp();
Page({
  data: {
    ChooseType: !1,
    icon: {
      recode: "".concat(app.config.imgHost, "/img/customer/Icon_DataCenter_Sales.png"),
      info: "".concat(app.config.imgHost, "/img/customer/Informations_Blue.png"),
      noImg: "".concat(app.config.imgHost, "/img/customer/Defaultpage_NoRecord_Color.png"),
    },
    moneyInfoList: {
      accountId: "",
      totalAmount: "0.00",
      balanceAmount: "",
      freezeAamount: "",
      receiptAmount: "",
      receiptAccount: "",
    },
    awardList: [],
    pageNum: 0,
    pageSize: 10,
    isAll: !1,
  },
  showChooseType: function () {
    this.setData({
      ChooseType: !this.data.ChooseType,
    });
  },
  toPath: function () {
    wx.navigateTo({
      url: "/packageB/pages/personal-center/my-wallet/get-money/index?moneyInfoList=".concat(
        JSON.stringify(this.data.moneyInfoList),
      ),
    });
  },
  toDetail: function (e) {
    var objectSpread2 = e.currentTarget.dataset,
      ServicesMoney = objectSpread2.askId,
      app = objectSpread2.replyId,
      a = objectSpread2.type,
      i = objectSpread2.inviteUserId;
    200 == a
      ? wx.navigateTo({
          url: "/packageA/pages/demand/demand-detail/demand-detail?replyId="
            .concat(app, "&listId=")
            .concat(ServicesMoney, "&pageReply=1"),
        })
      : 210 == a &&
        wx.navigateTo({
          url: "/packageB/pages/personal-center/invitation/index?inviteUserId=".concat(i),
        });
  },
  showRule: function () {
    wx.navigateTo({
      url: "/packageB/pages/personal-center/my-wallet/money-rule/index",
    });
  },
  getMoneyInfo: function () {
    var toConsumableArray = this;
    ServicesMoney.ServicesMoney.myMoneyInfo().then(function (o) {
      if (0 === o.code) {
        var app = o.data;
        app &&
          toConsumableArray.setData({
            moneyInfoList: objectSpread2(
              objectSpread2({}, app),
              {},
              {
                balanceAmount: app.balanceAmount ? app.balanceAmount.toFixed(2) : "0.00",
                freezeAmount: app.freezeAmount ? app.freezeAmount.toFixed(2) : "0.00",
                receiptAmount: app.receiptAmount ? app.receiptAmount.toFixed(2) : "0.00",
                totalAmount: app.totalAmount ? app.totalAmount.toFixed(2) : "0.00",
              },
            ),
          });
      }
    });
  },
  getAwardRecord: function () {
    var objectSpread2 = this,
      app = this.data,
      a = app.pageNum,
      i = app.pageSize,
      c = app.isAll,
      r = app.awardList;
    c ||
      (a++,
      ServicesMoney.ServicesMoney.awardRecord({
        pageNum: a,
        pageSize: i,
      }).then(function (o) {
        if (0 === o.code) {
          var app = o.data.list;
          (0 === r.length
            ? (r = [].concat(toConsumableArray(r), toConsumableArray(app)))
            : (r.forEach(function (t) {
                app.forEach(function (o) {
                  var app;
                  ((o.check = !0), t.rewardMonthTime === o.rewardMonthTime) &&
                    (n = t.rewardList).push.apply(app, toConsumableArray(o.rewardList));
                });
              }),
              app.forEach(function (e) {
                e.check || (console.log(e), r.push(e));
              })),
            console.log(r),
            objectSpread2.setData({
              awardList: r,
              pageNum: a,
              isAll: o.data.isLastPage,
            }));
        }
      }));
  },
  onLoad: function (e) {
    this.getAwardRecord();
  },
  onReady: function () {},
  onShow: function () {
    this.getMoneyInfo();
  },
  onHide: function () {},
  onUnload: function () {},
  onPullDownRefresh: function () {},
  onReachBottom: function () {
    this.getAwardRecord();
  },
  onShareAppMessage: function () {},
});
