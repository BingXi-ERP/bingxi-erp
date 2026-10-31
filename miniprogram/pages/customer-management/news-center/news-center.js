var e = require("../../../@babel/runtime/helpers/interopRequireDefault").default,
  createForOfIteratorHelper = require("../../../@babel/runtime/helpers/createForOfIteratorHelper"),
  ServicesUserLog = require("../../../libs/services/ServicesUserLog.js"),
  mta_analysis = e(require("../../../utils/mta_analysis.js")),
  app = getApp(),
  ServicesCustomer = require("../../../libs/services/ServicesCustomer.js").servicesCustomer,
  util = require("../../../libs/utils/util.js").utils;
Page({
  data: {
    customerHeadImg: "",
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
    return new Promise(function (a, n) {
      var r = {
          pageSize: e.data.pageSize,
          page: e.data.pageNum,
        },
        g = e.data.newsList;
      (wx.showLoading({
        title: "玩命加载中",
      }),
        ServicesCustomer.shopNews(r)
          .then(function (n) {
            if (0 === n.code) {
              wx.hideLoading();
              var ServicesCustomer,
                r = createForOfIteratorHelper(n.data.content);
              try {
                for (r.s(); !(o = r.n()).done;) {
                  var u = ServicesCustomer.value;
                  ((4 != u.msgType && 6 != u.msgType) ||
                    (u.goodsImgPath = "".concat(
                      app.config.imgHost,
                      "/img/customer/ic_chakanseka@3x.png",
                    )),
                    (2 != u.msgType && 3 != u.msgType) || (u.importantImg = !0),
                    (u.tag = "未查看的信息"),
                    (u.defaultHeadImg = util.addDefaultAvatar(u.headImg)),
                    g.push(u));
                }
              } catch (e) {
                r.e(e);
              } finally {
                r.f();
              }
              (e.setData({
                newsList: g,
              }),
                0 === n.data.content.length &&
                  e.data.pageNum > 1 &&
                  e.setData({
                    isDone: !0,
                  }),
                a(n));
            } else
              (wx.showToast({
                title: n.msg,
                icon: "none",
              }),
                a(n));
          })
          .catch(function (e) {
            n(e);
          }));
    });
  },
  tabBlock: function (e) {
    var createForOfIteratorHelper = e.currentTarget.dataset.cid;
    wx.navigateTo({
      url: "/pages/customer-management/all-customer-detail/all-customer-detail?customerId=".concat(
        createForOfIteratorHelper,
      ),
    });
  },
  onLoad: function (e) {
    (mta_analysis.default.Page.init(),
      ServicesUserLog.servicesUserLog.setUserHandleLog(603),
      wx.hideShareMenu(),
      this.getShopNews());
  },
  onReady: function () {},
  onShow: function () {
    util.addDefaultAvatar(app.globalData.userInfo.headImg);
  },
  onHide: function () {},
  onUnload: function () {
    wx.removeStorageSync("unReadMessageCount");
  },
  onPullDownRefresh: function () {},
  onReachBottom: function () {
    var e = this.data,
      createForOfIteratorHelper = e.pageNum;
    e.isDone
      ? wx.showToast({
          title: "数据已全部加载完毕",
          icon: "none",
        })
      : (createForOfIteratorHelper++,
        this.setData({
          pageNum: createForOfIteratorHelper,
        }),
        this.getShopNews());
  },
  onShareAppMessage: function () {},
});
