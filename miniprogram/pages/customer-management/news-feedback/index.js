var e = require("../../../@babel/runtime/helpers/interopRequireDefault").default,
  toConsumableArray = require("../../../@babel/runtime/helpers/toConsumableArray"),
  formatRichText = require("../../../utils/formatRichText.js"),
  mta_analysis = e(require("../../../utils/mta_analysis.js")),
  app = getApp(),
  ServicesCustomer = require("../../../libs/services/ServicesCustomer.js").servicesCustomer;
Page({
  data: {
    newsList: [],
    pageNum: 1,
    pageSize: 5,
    isDone: !1,
    icon: {
      bg: "".concat(app.config.imgHost, "/img/customer/shop-news-bg.png?imageView2/2/w/750"),
      noData: "".concat(app.config.imgHost, "/img/customer/img_wuxinx@3x.png?imageView2/2/w/750"),
    },
  },
  getShopNews: function () {
    var e = this;
    return new Promise(function (a, i) {
      var s = {
          size: e.data.pageSize,
          page: e.data.pageNum,
        },
        c = e.data.newsList;
      (wx.showLoading({
        title: "玩命加载中",
      }),
        ServicesCustomer.sysFeedbackList(s)
          .then(function (i) {
            if (0 === i.code) {
              wx.hideLoading();
              var ServicesCustomer = i.data.content;
              (ServicesCustomer.forEach(function (e) {
                e.content = (0, formatRichText.formatRichText)(e.content);
              }),
                (c = [].concat(toConsumableArray(c), toConsumableArray(ServicesCustomer))),
                e.setData({
                  newsList: c,
                }),
                ((0 === i.data.content.length && e.data.pageNum > 1) ||
                  e.data.pageNum >= i.data.totalPage) &&
                  e.setData({
                    isDone: !0,
                  }),
                a(i));
            } else
              (wx.showToast({
                title: i.msg,
                icon: "none",
              }),
                a(i));
          })
          .catch(function (e) {
            i(e);
          }));
    });
  },
  onLoad: function (e) {
    (mta_analysis.default.Page.init(), wx.hideShareMenu(), this.getShopNews());
  },
  onReady: function () {},
  onShow: function () {},
  onHide: function () {},
  onUnload: function () {},
  onPullDownRefresh: function () {},
  onReachBottom: function () {
    var e = this.data,
      toConsumableArray = e.pageNum;
    e.isDone
      ? wx.showToast({
          title: "数据已全部加载完毕",
          icon: "none",
        })
      : (toConsumableArray++,
        this.setData({
          pageNum: toConsumableArray,
        }),
        this.getShopNews());
  },
  onShareAppMessage: function () {},
});
