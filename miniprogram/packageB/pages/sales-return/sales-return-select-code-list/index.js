var toConsumableArray = require("../../../../@babel/runtime/helpers/toConsumableArray"),
  util = require("../../../../libs/utils/util"),
  ServicesReturn = require("../../../libs/services/ServicesReturn"),
  ServicesUserLog = require("../../../libs/services/ServicesUserLog"),
  app = getApp();
Page({
  data: {
    hasReq: !1,
    showHandleTips: !1,
    setTimeOpen: !1,
    setTimeComfirm: !1,
    selected: !0,
    totalAccount: 0,
    totalNum: 0,
    showPop: !1,
    pageNum: 1,
    pageSize: 10,
    isAll: !1,
    comfirmPop: !1,
    orderInfo: {},
    showRefundTips: !0,
    isRefund: !1,
    icon: {
      checked: "".concat(app.config.imgHost, "/img/customer/duibuIcon/phone_check@2x.png"),
      noCheck: "".concat(app.config.imgHost, "/img/customer/duibuIcon/phone_uncheck@2x.png"),
      popHeader: "".concat(app.config.imgHost, "/img/v2.8.0/Popup_Announcement20190328@2x.png"),
      informations: "".concat(app.config.imgHost, "/img/v2.15.0/Icon_Informations_Blue@2x.png"),
      tips: "".concat(app.config.imgHost, "/img/v2.15.0/Tips_hxysk@2x.png?imageView2/2/w/600"),
    },
    list: [],
  },
  handleTips: function () {
    this.setData({
      showRefundTips: !this.data.showRefundTips,
    });
  },
  handleRefund: function () {
    this.setData({
      isRefund: !this.data.isRefund,
    });
  },
  toSelectCode: function (t) {
    var util = t.currentTarget.dataset,
      ServicesReturn = util.id,
      ServicesUserLog = util.item;
    (wx.setStorageSync("return_sales_rowdata", ServicesUserLog),
      wx.navigateTo({
        url: "./select-detail-code/index?id=".concat(ServicesReturn),
      }));
  },
  getQuery: function () {
    var toConsumableArray = this.data.orderInfo,
      util = {
        customerId: toConsumableArray.customerId,
        billingUserId: toConsumableArray.billingUserId,
        saleBillingId: toConsumableArray.saleBillingId,
        refundGoodsDetailModelList: [],
      },
      ServicesReturn = [];
    return (
      this.data.list.forEach(function (t) {
        if ((console.log(t), t.selectCodeArr && t.selectCodeArr.length > 0)) {
          var ServicesUserLog = {
              goodsId: t.goodsId,
              billingGoodsId: t.id,
              refundGoodsColorList: [],
            },
            app = t.selectCodeArr.map(function (t) {
              return {
                goodsColorId: t.goodsColorId,
                billingGoodsColorId: t.id,
                colorPrice: t.colorPrice,
                totalQuantity: t.fixedQuantity || t.refundableQuantity,
                quantityUnit: t.quantityUnit,
                dyelot: t.dyelot,
              };
            });
          ((ServicesUserLog.refundGoodsColorList = app), ServicesReturn.push(ServicesUserLog));
        }
        util.refundGoodsDetailModelList = ServicesReturn;
      }),
      util
    );
  },
  saveRutenRequest: function () {
    var toConsumableArray = this;
    if (!this.data.hasReq) {
      (this.setData({
        hasReq: !0,
      }),
        wx.showLoading({
          mask: !0,
        }));
      var util = this.getQuery();
      ((util.refundAmountFlag = this.data.isRefund ? "1" : "0"),
        ServicesReturn.ServicesReturn.saveBillingRefund(util).then(function (e) {
          (wx.hideLoading(),
            0 === e.code
              ? (ServicesUserLog.servicesUserLog.setUserHandleLog(212),
                toConsumableArray.closeComfirmPop(),
                wx.redirectTo({
                  url: "/packageB/pages/sales-return/sales-return-list/sales-return-list-detail/index?id=".concat(
                    e.data.refundId,
                  ),
                }))
              : (toConsumableArray.setData({
                  hasReq: !1,
                }),
                wx.showToast({
                  title: e.msg,
                  icon: "none",
                })));
        }));
    }
  },
  showComfirmPop: function () {
    var toConsumableArray = this.data.list.filter(function (t) {
      return t.selectedColor && t.selectedColor.length > 0;
    });
    if (0 !== toConsumableArray.length) {
      if (this.data.list.length === toConsumableArray.length) this.saveRutenRequest();
      else {
        var util = this.data.list.length - toConsumableArray.length;
        this.setData({
          noChecked: util,
          comfirmPop: !0,
        });
      }
    } else
      wx.showToast({
        title: "请选择退货商品",
        icon: "none",
      });
  },
  closeComfirmPop: function () {
    this.setData({
      comfirmPop: !1,
    });
  },
  updateReturnCode: function (t) {
    var util = this.data.list.map(function (e) {
      return e.id === t.id ? t : e;
    });
    (this.setData({
      list: util,
    }),
      this.getTotalAccount());
  },
  getTotalAccount: function () {
    var util = [],
      ServicesReturn = 0;
    this.data.list.forEach(function (i) {
      i.selectCodeArr &&
        i.selectCodeArr.length > 0 &&
        (console.log(i),
        (o += i.selectCodeArr.length),
        util.push.apply(util, toConsumableArray(i.totalReturnNum)));
    });
    var ServicesUserLog = 0;
    (util.length > 0 &&
      util.forEach(function (t) {
        i = Number(t.totalPrice) + Number(ServicesUserLog);
      }),
      this.setData({
        totalAccount: ServicesUserLog,
        totalNum: ServicesReturn,
      }),
      console.log(ServicesUserLog),
      console.log(ServicesReturn));
  },
  closePop: function () {
    this.setData({
      showPop: !1,
    });
  },
  getRefundableGoodsList: function () {
    var ServicesUserLog = this,
      app = arguments.length > 0 && void 0 !== arguments[0] && arguments[0],
      s = this.data,
      a = s.pageNum,
      l = s.pageSize,
      r = s.isAll,
      d = s.orderId;
    if (!r) {
      (app && a++, wx.showNavigationBarLoading());
      var c = {
        page: a,
        size: l,
        billingId: d,
      };
      ServicesReturn.ServicesReturn.refundableGoodsList(c).then(function (o) {
        if (0 === o.code) {
          var app,
            s = ServicesUserLog.data.list;
          if (o.data.isFirstPage) s = o.data.content;
          else (n = s).push.apply(app, toConsumableArray(o.data.content));
          (s.forEach(function (t) {
            t.goodsImgPath = util.utils.replImage(t.goodsImgPath, 270);
          }),
            ServicesUserLog.setData({
              list: s,
              pageNum: a,
              isAll: o.data.isLastPage,
            }));
        }
        wx.hideNavigationBarLoading();
      });
    }
  },
  onLoad: function (t) {
    var util = wx.getStorageSync("showReturnTips") || !1;
    (console.log(util),
      util ||
        (wx.setStorageSync("showReturnTips", !0),
        this.setData({
          showPop: !0,
        })));
    var ServicesReturn = {
      customerId: t.customerId,
      billingUserId: t.billingUserId,
      saleBillingId: t.saleBillingId,
      billingStatus: t.billingStatus,
    };
    (t.id &&
      this.setData({
        showHandleTips: 50 == ServicesReturn.billingStatus,
        orderId: t.id,
        orderInfo: ServicesReturn,
      }),
      this.getRefundableGoodsList());
  },
  onReady: function () {},
  onShow: function () {},
  onHide: function () {},
  onUnload: function () {},
  onPullDownRefresh: function () {},
  onReachBottom: function () {
    this.getRefundableGoodsList(!0);
  },
  onShareAppMessage: function () {},
});
