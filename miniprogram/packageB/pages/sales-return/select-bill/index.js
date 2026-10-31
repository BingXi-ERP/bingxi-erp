var toConsumableArray = require("../../../../@babel/runtime/helpers/toConsumableArray"),
  ServicesReturn = require("../../../../libs/services/ServicesReturn"),
  app = getApp();
Page({
  data: {
    customerId: "",
    initImgApp: app,
    icon: {
      noImg: "".concat(app.config.imgHost, "/img/v2.8.0/Defaultpage_NoMessages@2x.png"),
    },
    pageNum: 0,
    pageSize: 10,
    totalPage: 1,
    isAll: !1,
    orderConditon: {
      10: "待处理 ",
      30: "挂单中",
      40: "未结算",
      45: "未结算",
      50: "已结算",
      "-10": "已关闭",
      "-20": "已作废",
    },
    selectedId: "",
    list: [],
  },
  selectItem: function (e) {
    var ServicesReturn = e.currentTarget.dataset,
      app = ServicesReturn.id,
      i = ServicesReturn.billingNo;
    this.setData({
      selectedId: app,
      billingNo: i,
    });
  },
  goback: function () {
    var toConsumableArray = getCurrentPages(),
      ServicesReturn = toConsumableArray.find(function (e) {
        return "packageB/pages/sales-return/index" === e.route;
      });
    ServicesReturn &&
      (ServicesReturn.updateSalesBill(this.data.selectedId, this.data.billingNo),
      wx.navigateBack({
        delta: 1,
      }));
  },
  getRelateBilling: function () {
    var app = this,
      i = this.data,
      n = i.pageNum,
      o = i.pageSize,
      s = (i.isAll, i.customerId),
      l = i.totalPage;
    if (l > n) {
      (n++, wx.showNavigationBarLoading());
      var r = {
        pageNum: n,
        pageSize: o,
        customerId: s,
      };
      ServicesReturn.ServicesReturn.relatableOrders(r).then(function (t) {
        if (0 === t.code) {
          var i = app.data.list,
            o = t.data.content;
          app.setData({
            list: l > n && 1 !== n ? [].concat(toConsumableArray(i), toConsumableArray(o)) : o,
            totalPage: t.data.totalPage,
            pageNum: n,
            isAll: l === n,
          });
        }
        wx.hideNavigationBarLoading();
      });
    }
  },
  onLoad: function (e) {
    (e.customerId &&
      (console.log(e.customerId),
      this.setData({
        customerId: e.customerId,
      })),
      this.getRelateBilling());
  },
  onReady: function () {},
  onShow: function () {},
  onHide: function () {},
  onUnload: function () {},
  onPullDownRefresh: function () {},
  onReachBottom: function () {
    this.getRelateBilling(!0);
  },
  onShareAppMessage: function () {},
});
