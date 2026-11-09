var t = require("../../../@babel/runtime/helpers/interopRequireDefault").default,
  a =
    (t(require("../../../miniprogram_npm/@vant/weapp/dialog/dialog")),
    t(require("../../../miniprogram_npm/@vant/weapp/toast/toast"))),
  ServicesUserLog = require("../../../libs/services/ServicesUserLog"),
  app = getApp(),
  ServicesOrder = require("../../../libs/services/ServicesOrder").ServicesOrder;
require("../../../libs/utils/time").parseTime;
Page({
  data: {
    noDataBg: "".concat(app.config.imgHost, "/img/customer/img_wuxinx@3x.png"),
    className: "",
    show: !1,
    closing: !1,
    closeId: null,
    list: [],
    initImgApp: app,
    closeReason: "",
    nowPageNum: 1,
    ishasNextPage: !0,
    draftcount: 0,
  },
  onLoad: function (e) {
    this.setData({
      userAuthList: app.userAuthList,
    });
  },
  onReady: function () {},
  onShow: function () {
    (this.getOrdersPin(), this.getDraftCount());
  },
  onHide: function () {},
  onUnload: function () {},
  onPullDownRefresh: function () {},
  onReachBottom: function () {
    if (this.data.ishasNextPage) {
      var e = this.data.nowPageNum;
      this.getOrdersPin(e, !0);
    }
  },
  onShareAppMessage: function () {},
  getDraftCount: function () {
    var e = this;
    ServicesOrder.draftCount({}).then(function (t) {
      if (0 === t.code) {
        ((e.data.draftCount = t.data),
          e.setData({
            draftCount: e.data.draftCount,
          }));
        var a = t.data;
        0 !== a &&
          wx.setNavigationBarTitle({
            title: "挂单中(".concat(a, ")"),
          });
      } else
        wx.showToast({
          title: t.msg,
          icon: "none",
        });
    });
  },
  getOrdersPin: function () {
    var e = this,
      t = arguments.length > 1 && void 0 !== arguments[1] && arguments[1],
      a = this,
      ServicesUserLog = {
        status: 30,
        saleType: 0,
        keyword: "",
        page: arguments.length > 0 && void 0 !== arguments[0] ? arguments[0] : 1,
        size: 10,
      };
    (wx.showLoading(),
      ServicesOrder.shopOrderList(ServicesUserLog).then(function (o) {
        if ((wx.hideLoading(), 0 === o.code)) {
          var app = o.data.content || [];
          (t
            ? app &&
              app.length > 0 &&
              app.forEach(function (e) {
                a.data.list.push(e);
              })
            : (a.data.list = app),
            (e.data.nowPageNum = o.data.pageNo),
            o.data.hasNextPage
              ? ((e.data.nowPageNum = e.data.nowPageNum + 1),
                (e.data.ishasNextPage = o.data.totalPage > o.data.pageNo))
              : (e.data.ishasNextPage = o.data.hasNextPage),
            a.setData({
              list: a.data.list,
            }));
        } else
          wx.showToast({
            title: o.msg,
            icon: "none",
          });
      }));
  },
  closeOrder: function (e, t) {
    var a = this,
      app = {
        billingId: e,
        closeReason: t,
      };
    ServicesOrder.closeOrder(app).then(function (e) {
      0 === e.code
        ? (ServicesUserLog.servicesUserLog.setUserHandleLog(205), a.getOrdersPin())
        : wx.showToast({
            title: e.msg,
            icon: "none",
          });
    });
  },
  hanleConcatCustom: function (e) {
    var t = e.currentTarget.dataset.mobild;
    "" == t
      ? wx.showToast({
          title: "没有客户电话号码",
          icon: "none",
        })
      : (ServicesUserLog.servicesUserLog.setUserHandleLog(209),
        wx.makePhoneCall({
          phoneNumber: t,
        }));
  },
  hanleCloseOrder: function (e) {
    var t = e.currentTarget.dataset.id;
    this.setData({
      show: !0,
      className: "text-gray",
      closeId: t,
    });
  },
  closeDialog: function () {
    this.data.closing ||
      this.setData({
        show: !1,
      });
  },
  handleCloseOrder: function (e) {
    if (this.data.closing) e.detail.dialog.stopLoading();
    else {
      if ("" === this.data.closeReason)
        return (
          (0, a.default)({
            message: "关闭订单理由不能为空",
            duration: 1e3,
          }),
          void e.detail.dialog.stopLoading()
        );
      var t = this.data.closeId,
        ServicesUserLog = this.data.closeReason;
      (this.closeOrder(t, ServicesUserLog),
        this.setData({
          show: !1,
        }));
    }
  },
  handleCloseOrderNoreason: function () {
    var t = this.data.closeId,
      a = this.data.closeReason;
    (this.closeOrder(t, a),
      this.data.closing
        ? e.detail.dialog.stopLoading()
        : this.setData({
            show: !1,
          }));
  },
  hanleCreateOrder: function (e) {
    var t = e.currentTarget.dataset,
      a = t.id,
      ServicesUserLog = t.orderNo,
      app = "/pages/order-create/offline/create?id="
        .concat(a, "&orderNo=")
        .concat(ServicesUserLog, "&orderId=&isFromPin=1");
    wx.navigateTo({
      url: app,
    });
  },
  handleInputReason: function (e) {
    var t = e.detail.value;
    this.setData({
      closeReason: t,
    });
  },
});
