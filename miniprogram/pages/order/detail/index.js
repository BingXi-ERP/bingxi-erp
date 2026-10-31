var e = require("../../../@babel/runtime/helpers/interopRequireDefault").default,
  o = require("../../../@babel/runtime/helpers/defineProperty"),
  mta_analysis = e(require("../../../utils/mta_analysis")),
  toast = e(require("../../../miniprogram_npm/@vant/weapp/toast/toast")),
  throttle = e(require("../../../utils/throttle")),
  getWxInfo = e(require("../../../libs/utils/getWxInfo")),
  ServicesBase = require("../../../libs/services/ServicesBase.js"),
  orderCreate = require("../../../libs/services/orderCreate"),
  ServicesUserLog = require("../../../libs/services/ServicesUserLog"),
  app = getApp(),
  ServicesOrder = require("../../../libs/services/ServicesOrder").ServicesOrder,
  util = require("../../../libs/utils/util").utils;
Page({
  data: {
    globalApp: app,
    curCancelId: "",
    showCancelComfirm: !1,
    showOtherSpend: !1,
    userAuthList: {},
    orderId: "",
    orderColor: "",
    orderImg: "",
    orderCondition: "",
    orderConditionExplain: "",
    orderDetailInfo: {},
    paymentRecord: [],
    showDyelot: 1,
    showShareImage: !1,
    closeReason: "",
    closeOrAbolish: 1,
    modalExplain: "请输入关闭订单的理由",
    deviationList: ["", "X", "+", "-"],
    icon: {
      header: "".concat(app.config.imgHost, "/img/customer/duibuIcon/header@2x.png"),
      editorOk: "".concat(app.config.imgHost, "/img/customer/duibuIcon/editor_ok@2x.png"),
      editorGray: "".concat(app.config.imgHost, "/img/customer/duibuIcon/ok_gray@2x.png"),
      informations: "".concat(app.config.imgHost, "/img/v2.15.0/Icon_Informations_Blue@2x.png"),
      timeball: "".concat(app.config.imgHost, "/img/customer/time_ball.png"),
      order_close: "".concat(app.config.imgHost, "/img/customer/order_close.png"),
      order_ban: "".concat(app.config.imgHost, "/img/customer/order_ban.png"),
      order_complete: "".concat(app.config.imgHost, "/img/customer/order_complete.png"),
      order_await: "".concat(app.config.imgHost, "/img/customer/order_await.png"),
      down: "".concat(app.config.imgHost, "/img/customer/duibuIcon/color_down@2x.png"),
      up: "".concat(app.config.imgHost, "/img/customer/duibuIcon/color_up@2x.png"),
      copy: "".concat(app.config.imgHost, "/img/customer/duibuIcon/order_copy@2x.png"),
    },
    saleOrderLifeCycleOption: [
      {
        label: "提交订单",
        value: "SUBMIT_ORDER",
        status: 0,
      },
      {
        label: "关闭订单",
        value: "CLOSE_ORDER",
        status: 10,
      },
      {
        label: "开单",
        value: "CREATE_ORDER",
        status: 20,
      },
      {
        label: "挂单",
        value: "WAIT_CONTINUE_ORDER",
        status: 30,
      },
      {
        label: "收款",
        value: "PAYMENT",
        status: 40,
      },
      {
        label: "退款",
        value: "REFUND",
        status: 50,
      },
      {
        label: "退货",
        value: "RETURN_OF_GOODS",
        status: 60,
      },
      {
        label: "作废",
        value: "ALREADY_CANCEL",
        status: -20,
      },
    ],
    orderStatusOptions: [],
  },
  getDictData: function () {
    var e = this;
    ServicesBase.servicesBase
      .getDictDataByType({
        value: "sales_order_status",
      })
      .then(function (o) {
        0 === o.code &&
          e.setData({
            orderStatusOptions: o.data,
          });
      });
  },
  toggleOtherSpend: function () {
    this.setData({
      showOtherSpend: !this.data.showOtherSpend,
    });
  },
  previewImage: function (e) {
    var o = e.target.dataset.src;
    wx.previewImage({
      current: o,
      urls: this.data.orderDetailInfo.billingPurchaseImgList,
    });
  },
  handleInputReason: function (e) {
    var o = e.detail.value;
    this.setData({
      closeReason: o,
    });
  },
  hanleCloseOrder: function (e) {
    var o = e.currentTarget.dataset,
      mta_analysis = o.id;
    (1 == o.type
      ? this.setData({
          modalExplain: "请输入关闭订单的理由",
          closeOrAbolish: 1,
        })
      : this.setData({
          modalExplain: "请输入作废订单的理由",
          closeOrAbolish: 2,
        }),
      this.setData({
        show: !0,
        className: "text-gray",
        closeId: mta_analysis,
      }));
  },
  closeCanelPopular: function () {
    this.setData({
      curCancelId: "",
      showCancelComfirm: !1,
    });
  },
  comfirmCancel: function () {
    (this.setData({
      modalExplain: "请输入作废订单的理由",
      closeOrAbolish: 2,
      show: !0,
      className: "text-gray",
      closeReason: "",
      closeId: this.data.curCancelId,
    }),
      this.closeCanelPopular());
  },
  handleCancleOrder: function (e) {
    var o = e.currentTarget.dataset.id;
    this.setData({
      curCancelId: o,
      showCancelComfirm: !0,
    });
  },
  closeDialog: function () {
    this.data.closing ||
      this.setData({
        show: !1,
      });
  },
  handleCloseOrder: function (e) {
    if (!this.data.closing) {
      if ("" === this.data.closeReason && 1 == this.data.closeOrAbolish)
        return (
          console.log(e),
          void wx.showToast({
            title: "关闭订单理由不能为空",
            icon: "none",
          })
        );
      if ("" !== this.data.closeReason || 2 != this.data.closeOrAbolish) {
        var o = this.data.closeId,
          mta_analysis = this.data.closeReason;
        (1 == this.data.closeOrAbolish && this.closeOrder(o, mta_analysis),
          2 == this.data.closeOrAbolish && this.orderCancel(o, mta_analysis),
          this.setData({
            show: !1,
          }));
      } else
        wx.showToast({
          title: "废除订单理由不能为空",
          icon: "none",
        });
    }
  },
  handleCloseOrderNoreason: function () {
    var e = this.data.closeId;
    (1 == this.data.closeOrAbolish && this.closeOrder(e, ""),
      2 == this.data.closeOrAbolish && this.orderCancel(e, ""),
      this.data.closing ||
        this.setData({
          show: !1,
        }));
  },
  closeOrder: function (e, o) {
    var mta_analysis = this,
      toast = {
        billingId: e,
        closeReason: o,
      };
    (wx.showLoading({
      title: "提交中",
    }),
      ServicesOrder.closeOrder(toast).then(function (e) {
        (wx.hideLoading(),
          0 === e.code
            ? (ServicesUserLog.servicesUserLog.setUserHandleLog(205), mta_analysis.getOrderDetail())
            : wx.showToast({
                title: e.msg,
                icon: "none",
              }));
      }));
  },
  orderCancel: function (e, o) {
    var mta_analysis = {
      billingId: e,
      cancelReason: o,
    };
    (wx.showLoading({
      title: "提交中",
    }),
      ServicesOrder.orderCancel(mta_analysis).then(function (e) {
        if ((wx.hideLoading(), 0 === e.code)) {
          (ServicesUserLog.servicesUserLog.setUserHandleLog(206),
            wx.showToast({
              title: "作废销售单成功",
              icon: "success",
            }));
          var o = setTimeout(function () {
            (wx.reLaunch({
              url: "/pages/order/list/index",
            }),
              clearTimeout(o));
          }, 1500);
        } else
          wx.showToast({
            title: e.msg,
            icon: "none",
          });
      }));
  },
  goRecords: function () {
    var e = this.data.orderId,
      o = "/packageA/pages/new-data-center/order-deposit-records/index?orderId=".concat(
        e,
        "&page=order",
      );
    wx.navigateTo({
      url: o,
    });
  },
  goRemarks: function () {
    var e = this.data.orderDetailInfo.id,
      o = this.data.orderDetailInfo.billingRemark,
      mta_analysis = "/pages/order/remark/index?id=".concat(e, "&&remark=").concat(o);
    wx.navigateTo({
      url: mta_analysis,
    });
  },
  goImages: function () {
    var e = this.data.orderDetailInfo.id,
      o = this.data.orderDetailInfo.billingPurchaseImgList,
      mta_analysis = "/pages/order/image-remark/index?id=".concat(e, "&&list=").concat(o);
    wx.navigateTo({
      url: mta_analysis,
    });
  },
  handleReturn: function () {
    var e = this.data.orderDetailInfo,
      o = e.customerId,
      mta_analysis = e.billingUserId,
      toast = e.id,
      throttle = e.billingStatus,
      getWxInfo = "/packageB/pages/sales-return/sales-return-select-code-list/index?id="
        .concat(this.data.orderId, "&&customerId=")
        .concat(o, "&&billingUserId=")
        .concat(mta_analysis, "&&saleBillingId=")
        .concat(toast, "&&billingStatus=")
        .concat(throttle);
    wx.navigateTo({
      url: getWxInfo,
    });
  },
  goRefundList: function () {
    var e = "/packageB/pages/sales-return/sales-return-list/index?id=".concat(this.data.orderId);
    wx.navigateTo({
      url: e,
    });
  },
  onLoad: function (e) {
    (mta_analysis.default.Page.init(),
      this.setData({
        userAuthList: app.userAuthList,
        orderId: e.orderId,
      }),
      this.getDictData());
  },
  onShow: function () {
    this.getOrderDetail();
  },
  hanleOrderCreate: throttle.default.throttle(function (e) {
    getWxInfo.default
      .wxSubscription([
        "ALvdDpDgXPaXX4pJMVLwPjEo_vxdxvFmwRJxfP9mW-c",
        "aQ2Lau609g2t4ThsXJGmOxkxp2tdyjYEPX1dZfUIeS8",
      ])
      .then(function () {
        var o = e.currentTarget.dataset,
          mta_analysis = o.id,
          toast = o.orderNo,
          throttle = "/pages/order-create/offline/create?id=&orderNo="
            .concat(toast, "&orderId=")
            .concat(mta_analysis, "&onlineOrder=")
            .concat(1);
        wx.navigateTo({
          url: throttle,
        });
      });
  }),
  copyText: function (e) {
    var o = e.currentTarget.dataset.text;
    wx.setClipboardData({
      data: o,
    });
  },
  getOrderDetail: function () {
    var e = this,
      o = this,
      mta_analysis = {
        orderId: this.data.orderId,
      };
    (wx.showLoading(),
      ServicesOrder.orderDetail(mta_analysis).then(function (t) {
        if ((wx.hideLoading(), 0 === t.code)) {
          o.data.orderDetailInfo = t.data || {};
          var toast = o.data.orderDetailInfo,
            throttle = e.data.showDyelot;
          switch (
            ((toast.billingRemark =
              toast.billingRemark && "" !== toast.billingRemark ? toast.billingRemark : "无"),
            toast.billingGoodsDetailModelList &&
              toast.billingGoodsDetailModelList.length > 0 &&
              toast.billingGoodsDetailModelList.forEach(function (e, o) {
                ((e.goodsImgPath = e.goodsImgPath
                  ? util.replImage(e.goodsImgPath, 90)
                  : "".concat(app.config.imgHost, "/img/customer/duibuIcon/icon/symbols-edit.png")),
                  (toast.billingGoodsDetailModelList[o].display = !1),
                  (toast.billingGoodsDetailModelList[o].choosedDetailModelList = []),
                  toast.billingGoodsDetailModelList[o].billingGoodsColorModels.forEach(
                    function (e, t) {
                      var getWxInfo = toast.billingGoodsDetailModelList[o].billingGoodsColorModels;
                      ((toast.billingGoodsDetailModelList[o].billingGoodsColorModels[
                        t
                      ].choosedColorItem = 0),
                        (toast.billingGoodsDetailModelList[o].tabCurrentColorId =
                          getWxInfo[0].goodsColorId),
                        (toast.billingGoodsDetailModelList[o].tabCurrentColor =
                          getWxInfo[0].colorNo),
                        (toast.billingGoodsDetailModelList[o].tabCurrentColorName =
                          getWxInfo[0].colorName),
                        (toast.billingGoodsDetailModelList[o].tabCurrentColorList =
                          getWxInfo[0].dyelotModelList[0].quantityModelList ||
                          getWxInfo[0].dyelotModelList[0].refundableQuantityModelList),
                        (toast.billingGoodsDetailModelList[o].tabCurrentDyelot =
                          getWxInfo[0].dyelotModelList),
                        (toast.billingGoodsDetailModelList[o].tabCurrentDyelotId =
                          getWxInfo[0].dyelotModelList[0].dyelot),
                        (toast.billingGoodsDetailModelList[o].tabCurrentAmount =
                          toast.billingGoodsDetailModelList[o].tabCurrentColorList.reduce(function (
                            e,
                            o,
                          ) {
                            return e + Number(o.colorAmount || 0);
                          }, 0)),
                        (i = getWxInfo[0].noDyelotStyleFlag));
                    },
                  ));
              }),
            o.setData({
              orderDetailInfo: o.data.orderDetailInfo,
              showDyelot: throttle,
            }),
            o.data.orderDetailInfo.billingStatus)
          ) {
            case -10:
              o.setData({
                orderColor: "#5D5D5D",
                orderImg: e.data.icon.editorGray,
                orderCondition: "已关闭",
                orderConditionExplain: "您的订单已关闭",
              });
              break;
            case -20:
              o.setData({
                orderColor: "#5D5D5D",
                orderImg: e.data.icon.editorGray,
                orderCondition: "已作废",
                orderConditionExplain: "您的订单已作废",
              });
              break;
            case 10:
              o.setData({
                orderColor: "#5D5D5D",
                orderImg: e.data.icon.editorGray,
                orderCondition: "待处理",
                orderConditionExplain: "该订单尚未开单，请及时处理",
              });
              break;
            case 30:
              o.setData({
                orderColor: "#5D5D5D",
                orderImg: e.data.icon.editorGray,
                orderCondition: "挂单中",
                orderConditionExplain: "",
              });
              break;
            case 40:
            case 45:
              (o.setData({
                orderColor: "#EA0A0A",
                orderImg: e.data.icon.editorGray,
                orderCondition: "未结算",
                orderConditionExplain: "该销售单尚未完成结算",
              }),
                e.paymentList());
              break;
            case 50:
              (o.setData({
                orderColor: "#05BA12",
                orderImg: e.data.icon.editorOK,
                orderCondition: "已结算",
                orderConditionExplain: "该销售单已结算完成",
              }),
                e.paymentList());
          }
        } else
          wx.showToast({
            title: t.msg,
            icon: "none",
          });
      }));
  },
  paymentList: function () {
    var e = this,
      o = {
        orderId: this.data.orderId,
      };
    ServicesOrder.paymentList(o).then(function (o) {
      0 === o.code
        ? ((e.data.paymentRecord = o.data),
          e.setData({
            paymentRecord: e.data.paymentRecord,
          }))
        : wx.showToast({
            title: o.msg,
            icon: "none",
          });
    });
  },
  handleRefund: function (e) {
    var o = {
      billingId: this.data.orderDetailInfo.id,
    };
    wx.navigateTo({
      url: "/packageA/pages/new-data-center/customer-balance-receivables/customer-balance-receivables?query=".concat(
        JSON.stringify(o),
        "&&orderType=1",
      ),
    });
  },
  hanlePay: function (e) {
    var o = e.currentTarget.dataset.item;
    wx.navigateTo({
      url: "/pages/order/receipt/index?id=".concat(o.id),
    });
  },
  detailDisplay: function (e) {
    var o = e.currentTarget.dataset.index;
    ((this.data.orderDetailInfo.billingGoodsDetailModelList[o].display =
      !this.data.orderDetailInfo.billingGoodsDetailModelList[o].display),
      this.setData({
        orderDetailInfo: this.data.orderDetailInfo,
      }));
  },
  detailTableDisplay: function (e) {
    var o = this.data.orderDetailInfo.billingGoodsDetailModelList,
      mta_analysis = e.currentTarget.dataset,
      toast = mta_analysis.index,
      throttle = mta_analysis.productId,
      getWxInfo = o.find(function (e) {
        return e.id === throttle;
      }),
      ServicesBase = this.data.showDyelot;
    ((getWxInfo.tabCurrentColorId = getWxInfo.billingGoodsColorModels[toast].goodsColorId),
      (getWxInfo.tabCurrentColor = getWxInfo.billingGoodsColorModels[toast].colorNo),
      (getWxInfo.tabCurrentColorName = getWxInfo.billingGoodsColorModels[toast].colorName),
      (getWxInfo.tabCurrentDyelot = getWxInfo.billingGoodsColorModels[toast].dyelotModelList),
      (getWxInfo.tabCurrentDyelotId =
        getWxInfo.billingGoodsColorModels[toast].dyelotModelList[0].dyelot),
      (getWxInfo.tabCurrentColorList =
        getWxInfo.billingGoodsColorModels[toast].dyelotModelList[0].quantityModelList),
      (getWxInfo.tabCurrentAmount = getWxInfo.tabCurrentColorList.reduce(function (e, o) {
        return e + Number(o.colorAmount || 0);
      }, 0)),
      (n = getWxInfo.billingGoodsColorModels[toast].noDyelotStyleFlag),
      this.setData({
        orderDetailInfo: this.data.orderDetailInfo,
        showDyelot: ServicesBase,
      }));
  },
  changeCurrentDyelot: function (e) {
    var o = e.currentTarget.dataset,
      mta_analysis = o.index,
      toast = o.productId,
      throttle = o.productItem.tabCurrentColorId,
      getWxInfo = this.data.orderDetailInfo.billingGoodsDetailModelList.find(function (e) {
        return e.id === toast;
      }),
      ServicesBase = getWxInfo.billingGoodsColorModels.find(function (e) {
        return e.goodsColorId === throttle;
      });
    ((getWxInfo.tabCurrentDyelot = ServicesBase.dyelotModelList),
      (getWxInfo.tabCurrentDyelotId = ServicesBase.dyelotModelList[mta_analysis].dyelot),
      (getWxInfo.tabCurrentColorList =
        ServicesBase.dyelotModelList[mta_analysis].quantityModelList),
      this.setData({
        orderDetailInfo: this.data.orderDetailInfo,
      }));
  },
  handleOrderPrint: function () {
    var e = this.data.orderId,
      o = this.data.orderDetailInfo.mobile,
      mta_analysis = this.data.orderDetailInfo.id,
      toast = [
        function () {
          wx.navigateTo({
            url: "/pages/printing/order/index?orderId=".concat(e, "&printType=order"),
          });
        },
        function () {
          wx.navigateTo({
            url: "/pages/color-card-management/print-cloth-head/print-format/print-format?orderId="
              .concat(e, "&customMobile=")
              .concat(o, "&&billingId=")
              .concat(mta_analysis),
          });
        },
      ];
    wx.showActionSheet({
      itemList: ["打印码单", "打印布头"],
      success: function (e) {
        toast[e.tapIndex]();
      },
      fail: function (e) {
        console.log(e.errMsg);
      },
    });
  },
  hanleConcatCustom: function () {
    var e = this.data.orderDetailInfo.mobile;
    e
      ? (ServicesUserLog.servicesUserLog.setUserHandleLog(209),
        wx.makePhoneCall({
          phoneNumber: e,
        }))
      : wx.showToast({
          title: "电话号码为空",
          icon: "none",
        });
  },
  handleShowShareOrder: function (e) {
    var o = this,
      mta_analysis = e.currentTarget.dataset.id;
    (wx.showLoading({
      title: "正在生成图片",
    }),
      (0, orderCreate.getQRCode)(mta_analysis, app.envVersion)
        .then(function (e) {
          (wx.hideLoading(),
            0 === e.code
              ? (ServicesUserLog.servicesUserLog.setUserHandleLog(207),
                o.setData({
                  QRCode: e.data,
                  showShareImage: !0,
                }))
              : (0, toast.default)({
                  message: e.msg || "生成失败, 请重试",
                }));
        })
        .catch(function (e) {
          (console.log(e), wx.hideLoading());
        }));
  },
  handleCloseShareOrder: function () {
    this.setData({
      showShareImage: !1,
    });
  },
  handleDownload: function () {
    var e = this;
    this.handleCloseShareOrder();
    var o = this.data.QRCode;
    wx.downloadFile({
      url: o,
      success: function (o) {
        wx.saveImageToPhotosAlbum({
          filePath: o.tempFilePath,
          success: function () {
            (ServicesUserLog.servicesUserLog.setUserHandleLog(208),
              wx.showToast({
                title: "保存成功",
                icon: "success",
                duration: 2e3,
              }));
          },
          fail: function (o) {
            "saveImageToPhotosAlbum:fail auth deny" === o.errMsg &&
              wx.showModal({
                title: "提示",
                content: "您拒绝了保存权限，请打开保存权限",
                success: function (o) {
                  o.confirm &&
                    wx.openSetting({
                      success: function (e) {
                        e.authSetting = {
                          "scope.writePhotosAlbum": !0,
                        };
                      },
                      fail: function (o) {
                        e.setData({
                          showAuth: !0,
                        });
                      },
                    });
                },
              });
          },
        });
      },
      fail: function (e) {},
    });
  },
  handleCloseAuthDialog: function () {
    this.setData({
      showAuth: !1,
    });
  },
  hanleConcatCustom: function (e) {
    var o = e.currentTarget.dataset.mobild;
    o
      ? (ServicesUserLog.servicesUserLog.setUserHandleLog(209),
        wx.makePhoneCall({
          phoneNumber: o,
        }))
      : wx.showToast({
          title: "电话号码为空",
          icon: "none",
        });
  },
  againOrderCreate: function (e) {
    var o = e.currentTarget.dataset,
      mta_analysis = o.id,
      toast = o.orderNo,
      throttle = "/pages/order-create/offline/create?id=&orderNo="
        .concat(toast, "&orderId=&reBillingId=")
        .concat(mta_analysis);
    wx.navigateTo({
      url: throttle,
    });
  },
  delCancelOrder: function (e) {
    var o = e.currentTarget.dataset.id;
    (console.log(o),
      this.setData({
        showDelPopular: !0,
        curDelId: o,
      }));
  },
  closeDelPopular: function () {
    this.setData({
      showDelPopular: !1,
      curDelId: "",
    });
  },
  comfirmDel: function () {
    var e = this;
    (wx.showLoading({
      title: "提交中",
    }),
      ServicesOrder.deleteOrder(this.data.curDelId).then(function (o) {
        (wx.hideLoading(),
          0 == o.code &&
            (e.setData({
              showDelPopular: !1,
              curDelId: "",
            }),
            wx.reLaunch({
              url: "/pages/order/list/index",
            })));
      }));
  },
});
