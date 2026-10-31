var e = require("../../../../../@babel/runtime/helpers/defineProperty"),
  ServicesReturn = require("../../../../libs/services/ServicesReturn"),
  ServicesUserLog = require("../../../../libs/services/ServicesUserLog"),
  app = getApp();
Page({
  data: {
    globalapp: app,
    showCancelComfirm: !1,
    orderType: "saleReturn",
    userAuthList: {},
    orderRemark: "",
    saleBillingNo: "",
    orderId: "",
    orderCondition: "",
    orderDetailInfo: {},
    paymentRecord: [],
    showShareImage: !1,
    isShow: !1,
    closeReason: "",
    orderCondition: "已退货",
    orderConditionExplain: "",
    closeOrAbolish: 1,
    modalExplain: "请输入关闭订单的理由",
    icon: {
      header: "".concat(app.config.imgHost, "/img/customer/duibuIcon/header@2x.png"),
      okgray: "".concat(app.config.imgHost, "/img/customer/duibuIcon/ok_gray@2x.png"),
      tdetail: "".concat(app.config.imgHost, "/img/customer/duibuIcon/detail_tuihuo@2x.png"),
      down: "".concat(app.config.imgHost, "/img/customer/duibuIcon/color_down@2x.png"),
      up: "".concat(app.config.imgHost, "/img/customer/duibuIcon/color_up@2x.png"),
    },
  },
  onLoad: function (e) {
    this.setData({
      userAuthList: app.userAuthList,
      orderId: e.id,
    });
  },
  onShow: function () {
    this.getRefundDetail();
  },
  previewImage: function (e) {
    var ServicesReturn = e.target.dataset.src;
    wx.previewImage({
      current: ServicesReturn,
      urls: this.data.orderDetailInfo.refundImgPathList,
    });
  },
  toReturnDetail: function () {},
  goRemarks: function () {
    console.log("修改备注跳转");
    var e = this.data,
      ServicesReturn = e.orderType,
      ServicesUserLog = e.orderId,
      app = e.orderRemark;
    "无" == app && (r = "");
    var a = "/pages/order/remark/index?orderType="
      .concat(ServicesReturn, "&&id=")
      .concat(ServicesUserLog, "&remark=")
      .concat(app);
    wx.navigateTo({
      url: a,
    });
  },
  goImages: function () {
    console.log("修改采购记录跳转");
    var e = this.data,
      ServicesReturn = e.orderType,
      ServicesUserLog = e.orderId,
      app = e.orderDetailInfo,
      a = app.refundImgPathList ? app.refundImgPathList : "",
      d = "/pages/order/image-remark/index?orderType="
        .concat(ServicesReturn, "&&id=")
        .concat(ServicesUserLog, "&&list=")
        .concat(a);
    wx.navigateTo({
      url: d,
    });
  },
  getRefundDetail: function () {
    var e = this,
      ServicesUserLog = this.data.orderId;
    ServicesReturn.ServicesReturn.refundDetail({
      refundId: ServicesUserLog,
    }).then(function (o) {
      var ServicesUserLog = o.data;
      ((ServicesUserLog.billingRemark =
        ServicesUserLog.billingRemark && "" !== ServicesUserLog.billingRemark
          ? ServicesUserLog.billingRemark
          : "无"),
        ServicesUserLog.refundGoodsDetailModels &&
          ServicesUserLog.refundGoodsDetailModels.length > 0 &&
          ServicesUserLog.refundGoodsDetailModels.forEach(function (e, o) {
            ((ServicesUserLog.refundGoodsDetailModels[o].display = !1),
              (ServicesUserLog.refundGoodsDetailModels[o].choosedDetailModelList = []),
              ServicesUserLog.refundGoodsDetailModels[o].refundGoodsColorModels.forEach(
                function (e, r) {
                  var a = ServicesUserLog.refundGoodsDetailModels[o].refundGoodsColorModels;
                  ((ServicesUserLog.refundGoodsDetailModels[o].refundGoodsColorModels[
                    r
                  ].choosedColorItem = 0),
                    (ServicesUserLog.refundGoodsDetailModels[o].tabCurrentColorId =
                      a[0].goodsColorId),
                    (ServicesUserLog.refundGoodsDetailModels[o].tabCurrentColor = a[0].colorNo),
                    (ServicesUserLog.refundGoodsDetailModels[o].tabCurrentColorName =
                      a[0].colorName),
                    (ServicesUserLog.refundGoodsDetailModels[o].tabCurrentColorList =
                      a[0].dyelotModelList[0].quantityModelList),
                    (ServicesUserLog.refundGoodsDetailModels[o].tabCurrentDyelot =
                      a[0].dyelotModelList),
                    (ServicesUserLog.refundGoodsDetailModels[o].tabCurrentDyelotId =
                      a[0].dyelotModelList[0].dyelot));
                },
              ));
          }),
        e.setData({
          orderDetailInfo: ServicesUserLog,
          orderRemark: ServicesUserLog.billingRemark,
        }),
        console.log(e.data.orderDetailInfo));
    });
  },
  toSalesDetail: function () {
    var e = this.data.orderDetailInfo.saleBillingId;
    Number(e) &&
      (console.log(e),
      wx.redirectTo({
        url: "/pages/order/detail/index?orderId=".concat(e),
      }));
  },
  copyText: function (e) {
    var ServicesReturn = e.currentTarget.dataset.text;
    wx.setClipboardData({
      data: ServicesReturn,
    });
  },
  detailDisplay: function (e) {
    var ServicesReturn = e.currentTarget.dataset.index;
    ((this.data.orderDetailInfo.refundGoodsDetailModels[ServicesReturn].display =
      !this.data.orderDetailInfo.refundGoodsDetailModels[ServicesReturn].display),
      this.setData({
        orderDetailInfo: this.data.orderDetailInfo,
      }));
  },
  detailTableDisplay: function (e) {
    var ServicesReturn = this.data.orderDetailInfo.refundGoodsDetailModels,
      ServicesUserLog = e.currentTarget.dataset,
      app = ServicesUserLog.index,
      a = ServicesUserLog.productId,
      d = ServicesReturn.find(function (e) {
        return e.id === a;
      });
    ((d.tabCurrentColorId = d.refundGoodsColorModels[app].goodsColorId),
      (d.tabCurrentColor = d.refundGoodsColorModels[app].colorNo),
      (d.tabCurrentColorName = d.refundGoodsColorModels[app].colorName),
      (d.tabCurrentDyelot = d.refundGoodsColorModels[app].dyelotModelList),
      (d.tabCurrentDyelotId = d.refundGoodsColorModels[app].dyelotModelList[0].dyelot),
      (d.tabCurrentColorList = d.refundGoodsColorModels[app].dyelotModelList[0].quantityModelList),
      this.setData({
        orderDetailInfo: this.data.orderDetailInfo,
      }));
  },
  changeCurrentDyelot: function (e) {
    var ServicesReturn = e.currentTarget.dataset,
      ServicesUserLog = ServicesReturn.index,
      app = ServicesReturn.productId,
      a = ServicesReturn.productItem.tabCurrentColorId,
      d = this.data.orderDetailInfo.refundGoodsDetailModels.find(function (e) {
        return e.id === app;
      }),
      n = d.refundGoodsColorModels.find(function (e) {
        return e.goodsColorId === a;
      });
    ((d.tabCurrentDyelot = n.dyelotModelList),
      (d.tabCurrentDyelotId = n.dyelotModelList[ServicesUserLog].dyelot),
      (d.tabCurrentColorList = n.dyelotModelList[ServicesUserLog].quantityModelList),
      this.setData({
        orderDetailInfo: this.data.orderDetailInfo,
      }));
  },
  closeDialog: function () {
    this.setData({
      isShow: !1,
    });
  },
  comfirmCancel: function () {
    this.setData({
      showCancelComfirm: !1,
      isShow: !0,
    });
  },
  handleInputReason: function (e) {
    this.setData({
      closeReason: e.detail.value,
    });
  },
  refundCancel: function (e) {
    var app = this;
    "" === this.data.closeReason && e.currentTarget.dataset.bool
      ? wx.showToast({
          title: "作废订单理由不能为空",
          icon: "none",
        })
      : (wx.showLoading({
          title: "提交中",
        }),
        ServicesReturn.ServicesReturn.refundCancel({
          refundId: this.data.orderDetailInfo.id,
          cancelReason: e.currentTarget.dataset.bool ? this.data.closeReason : "",
        }).then(function (e) {
          (wx.hideLoading(),
            0 === e.code &&
              (ServicesUserLog.servicesUserLog.setUserHandleLog(503),
              app.handleCancel(),
              wx.navigateBack({
                delta: 1,
                success: function () {
                  var e = getCurrentPages(),
                    ServicesReturn = e.find(function (e) {
                      return "packageB/pages/sales-return/sales-return-list/index" === e.route;
                    });
                  ServicesReturn && (ServicesReturn.resetList(), ServicesReturn.getRefundList());
                },
              })));
        }));
  },
  handleCancel: function () {
    this.setData({
      showCancelComfirm: !this.data.showCancelComfirm,
    });
  },
  handleOrderPrint: function () {
    var e = this.data.orderId,
      ServicesReturn = this.data.orderDetailInfo.mobile ? this.data.orderDetailInfo.mobile : "";
    wx.navigateTo({
      url: "/pages/printing/order/index?orderId="
        .concat(e, "&printType=return&&customMobile=")
        .concat(ServicesReturn),
    });
  },
  hanleConcatCustom: function () {
    var e = this.data.orderDetailInfo.mobile;
    e
      ? (ServicesUserLog.servicesUserLog.setUserHandleLog(504),
        wx.makePhoneCall({
          phoneNumber: e,
        }))
      : wx.showToast({
          title: "电话号码为空",
          icon: "none",
        });
  },
  hanleConcatCustom: function (e) {
    var ServicesReturn = e.currentTarget.dataset.mobild;
    ServicesReturn
      ? (ServicesUserLog.servicesUserLog.setUserHandleLog(504),
        wx.makePhoneCall({
          phoneNumber: ServicesReturn,
        }))
      : wx.showToast({
          title: "电话号码为空",
          icon: "none",
        });
  },
});
