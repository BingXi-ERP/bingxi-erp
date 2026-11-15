var toConsumableArray = require("../../../../@babel/runtime/helpers/toConsumableArray"),
  ServicesReturn = require("../../../libs/services/ServicesReturn"),
  app = getApp();
Page({
  data: {
    initImgApp: app,
    pageNum: 1,
    pageSize: 10,
    orderId: "",
    isAll: !1,
    icon: {
      noImg: "".concat(app.config.imgHost, "/img/v2.8.0/Defaultpage_NoMessages@2x.png"),
      cancelIcon: "".concat(app.config.imgHost, "/img/v2.8.0/Icon_Yzf@2x.png"),
    },
    salesReturnList: [],
  },
  toDetail: function (e) {
    var ServicesReturn = e.currentTarget.dataset.id;
    (console.log(ServicesReturn),
      wx.navigateTo({
        url: "./sales-return-list-detail/index?id=".concat(ServicesReturn),
      }));
  },
  resetList: function () {
    this.setData({
      pageNum: 1,
      isAll: !1,
      salesReturnList: [],
    });
  },
  getRefundList: function () {
    var app = this,
      n = arguments.length > 0 && void 0 !== arguments[0] && arguments[0],
      a = this.data,
      s = a.pageNum,
      o = a.pageSize,
      r = a.isAll,
      u = a.orderId;
    if (!r) {
      (n && s++, wx.showNavigationBarLoading());
      var g = {
        page: s,
        size: o,
        saleBillingId: u,
      };
      ServicesReturn.ServicesReturn.refundList(g).then(function (t) {
        if (0 === t.code) {
          var n,
            a = app.data.salesReturnList;
          if (t.data.isFirstPage) a = t.data.content;
          else (n = a).push.apply(n, toConsumableArray(t.data.content));
          app.setData({
            salesReturnList: a,
            pageNum: s,
            isAll: s >= t.data.totalPage,
          });
        }
        wx.hideNavigationBarLoading();
      });
    }
  },
  onLoad: function (e) {
    (e.id &&
      this.setData({
        orderId: e.id,
      }),
      this.getRefundList());
  },
  onReady: function () {},
  onShow: function () {},
  onHide: function () {},
  onUnload: function () {
    this.resetList();
  },
  onPullDownRefresh: function () {},
  onReachBottom: function () {
    this.getRefundList(!0);
  },
  onShareAppMessage: function () {},
});
