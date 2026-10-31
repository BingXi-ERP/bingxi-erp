var e = require("../../../../@babel/runtime/helpers/interopRequireDefault").default,
  toConsumableArray = require("../../../../@babel/runtime/helpers/toConsumableArray"),
  objectSpread2 = require("../../../../@babel/runtime/helpers/objectSpread2"),
  orderTime = e(require("../../../utils/orderTime")),
  ServicesDemandOrder = e(require("../../../services/ServicesDemandOrder")),
  app = getApp();
Page({
  data: {
    userTab: ["已报单", "已取消"],
    icon: "".concat(app.config.imgHost, "/img/pay/order-cancel.png"),
    demandOrderList: [],
    demandOrderStatus: 1,
    orderIndex: 0,
    pageNum: 0,
    pageSize: 10,
    isAll: !1,
  },
  changeVanTab: function (e) {
    var toConsumableArray = e.currentTarget.dataset.index;
    if (this.data.orderIndex !== toConsumableArray) {
      this.cancelCount();
      (this.setData({
        orderIndex: toConsumableArray,
        demandOrderStatus: [1, -1][toConsumableArray],
        pageNum: 0,
        pageSize: 10,
        demandOrderList: [],
        isAll: !1,
      }),
        this.getDemandOrder());
    }
  },
  _reFresh: function () {
    (this.setData({
      pageNum: 0,
      pageSize: 10,
      demandOrderList: [],
      isAll: !1,
    }),
      this.getDemandOrder());
  },
  toPath: function (e) {
    var toConsumableArray = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: "/packageA/pages/demand/demand-order/demand-order-detail/index?itemId=".concat(
        toConsumableArray,
      ),
    });
  },
  getDemandOrder: function () {
    var e = this,
      orderTime = arguments.length > 0 && void 0 !== arguments[0] && arguments[0],
      app = this.data,
      i = app.pageNum,
      o = app.pageSize,
      s = app.demandOrderStatus,
      u = app.isAll,
      m = app.demandOrderList;
    if (!u) {
      (wx.showNavigationBarLoading(), orderTime && i++);
      var c = s;
      ServicesDemandOrder.default
        .orderList({
          pageNum: i,
          pageSize: o,
          orderStatus: c,
        })
        .then(function (r) {
          if ((wx.stopPullDownRefresh(), 0 === r.code)) {
            var ServicesDemandOrder = r.data.list.map(function (e) {
              return objectSpread2(
                objectSpread2({}, e),
                {},
                {
                  goodsPrice: e.goodsPrice && e.goodsPrice.toFixed(2),
                  orderAmountNum: e.orderAmount.toFixed(2).split(".")[0],
                  orderAmountDecimals: e.orderAmount.toFixed(2).split(".")[1],
                },
              );
            });
            ((m = [].concat(toConsumableArray(m), toConsumableArray(ServicesDemandOrder))),
              e.setData({
                demandOrderList: m,
                pageNum: i,
                isAll: r.data.isLastPage,
              }));
          }
          (e.timeCount(), wx.hideNavigationBarLoading());
        });
    }
  },
  timeCount: function () {
    var e = this;
    (e.data.demandOrderList.forEach(function (e, t) {
      e.lastTimeStr = new orderTime.default().dateFormat(Number(e.lastPayTime));
      var objectSpread2 = Date.now(),
        ServicesDemandOrder = new Date(objectSpread2 + Number(e.lastPayTime)).getTime();
      ((e.countdownTime = objectSpread2), (e.countdownEndTime = ServicesDemandOrder));
    }),
      e.setData({
        demandOrderList: e.data.demandOrderList,
      }),
      e.data.timerId && clearInterval(e.data.timerId));
    var toConsumableArray = setInterval(this.countdown, 350);
    e.setData({
      timerId: toConsumableArray,
    });
  },
  countdown: function () {
    var e = this;
    (e.data.demandOrderList.forEach(function (e) {
      var toConsumableArray = e.countdownEndTime - Date.now();
      e.lastTimeStr = new orderTime.default().dateFormat(toConsumableArray);
    }),
      e.setData({
        demandOrderList: e.data.demandOrderList,
      }));
  },
  cancelCount: function () {
    clearInterval(this.data.timerId);
  },
  onLoad: function (e) {
    (this.getDemandOrder(),
      this.setData({
        isBack: e.isBack || !1,
      }));
  },
  onUnload: function () {
    (this.cancelCount(),
      "order" === this.data.isBack &&
        wx.reLaunch({
          url: "/pages/personal-center/personal-center",
        }));
  },
  onPullDownRefresh: function () {
    this._reFresh();
  },
  onReachBottom: function () {
    this.getDemandOrder(!0);
  },
});
