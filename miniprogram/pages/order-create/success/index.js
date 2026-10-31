var e = require("../../../@babel/runtime/helpers/interopRequireDefault").default,
  toast = e(require("../../../miniprogram_npm/@vant/weapp/toast/toast")),
  orderCreate = require("../../../libs/services/orderCreate"),
  mta_analysis = e(require("../../../utils/mta_analysis")),
  ServicesUserLog = require("../../../libs/services/ServicesUserLog"),
  app = getApp();
Page({
  data: {
    icon: {
      editorOk: "".concat(app.config.imgHost, "/img/customer/duibuIcon/editor_ok@2x.png"),
      weixin: "".concat(app.config.imgHost, "/img/customer/duibuIcon/weixin@2x.png"),
    },
    isFromPin: "0",
    showShareImage: !1,
    showAuth: !1,
    orderId: "",
    orderNo: "-",
    orderAccount: "0.00",
    currentAccount: "0.00",
    currentDiscount: "0.00",
    otherCost: "",
    paymentText: "-",
    customerName: "-",
    openType: "offline",
    QRCode: "",
  },
  onLoad: function (e) {
    mta_analysis.default.Page.init();
    var toast = e.billingId,
      orderCreate = e.billingNo,
      ServicesUserLog = e.orderAmount,
      app = e.totalAmount,
      i = e.discountAmount,
      s = e.paymentTerm,
      c = e.customerName,
      d = e.otherCost,
      u = e.openType,
      l = void 0 === u ? "offline" : u,
      g = e.isFromPin,
      h = void 0 === g ? "0" : g;
    this.setData({
      isFromPin: h,
      orderId: toast,
      orderNo: orderCreate,
      otherCost: d ? Number(d).toFixed(2) : "0.00",
      orderAccount: ServicesUserLog ? Number(ServicesUserLog).toFixed(2) : "-",
      currentAccount: app ? Number(app).toFixed(2) : "-",
      currentDiscount: i ? Number(i).toFixed(2) : "-",
      paymentText: s ? decodeURIComponent(s) : "-",
      customerName: c ? decodeURIComponent(c) : "-",
      openType: l,
    });
  },
  onReady: function () {},
  onShow: function () {
    this.drawShareImage();
  },
  onHide: function () {},
  onUnload: function () {
    var e = getCurrentPages(),
      toast = {
        online: "pages/order-create/online/create",
        offline: "pages/order-create/offline/create",
      }[this.data.openType],
      orderCreate = e.find(function (e) {
        return e.route === toast;
      });
    orderCreate && (orderCreate.resetData(), "1" == this.data.isFromPin && orderCreate.goback());
  },
  onPullDownRefresh: function () {},
  onReachBottom: function () {},
  onShareAppMessage: function () {},
  handleToOrderDetail: function (e) {
    var toast = e.currentTarget.dataset.id,
      orderCreate = "/pages/order/detail/index?orderId=".concat(toast);
    wx.navigateTo({
      url: orderCreate,
    });
  },
  handleShowShareOrder: function (e) {
    var mta_analysis = this,
      i = e.currentTarget.dataset.id;
    (wx.showLoading({
      title: "正在生成图片",
    }),
      (0, orderCreate.getQRCode)(i, app.envVersion)
        .then(function (e) {
          var orderCreate = e.data,
            app = e.data.split(":");
          ("http" === app[0] && (o = "https:" + app[1]),
            wx.hideLoading(),
            0 === e.code
              ? (ServicesUserLog.servicesUserLog.setUserHandleLog(207),
                mta_analysis.setData({
                  QRCode: orderCreate,
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
    var toast = this.data.QRCode;
    wx.downloadFile({
      url: toast,
      success: function (t) {
        wx.saveImageToPhotosAlbum({
          filePath: t.tempFilePath,
          success: function () {
            (ServicesUserLog.servicesUserLog.setUserHandleLog(208),
              wx.showToast({
                title: "保存成功",
                icon: "success",
                duration: 2e3,
              }));
          },
          fail: function (t) {
            "saveImageToPhotosAlbum:fail auth deny" === t.errMsg &&
              wx.showModal({
                title: "提示",
                content: "您拒绝了保存权限，请打开保存权限",
                success: function (t) {
                  t.confirm &&
                    wx.openSetting({
                      success: function (e) {
                        e.authSetting = {
                          "scope.writePhotosAlbum": !0,
                        };
                      },
                      fail: function (t) {
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
    });
  },
  handleCloseAuthDialog: function () {
    this.setData({
      showAuth: !1,
    });
  },
  handleOrderCreate: function () {
    ServicesUserLog.servicesUserLog.setUserHandleLog(204);
    var e = "1" == this.data.isFromPin ? 2 : 1;
    wx.navigateBack({
      delta: e,
    });
  },
  handleOrderPrint: function (e) {
    var toast = e.currentTarget.dataset.id,
      orderCreate = "orderId=".concat(toast),
      mta_analysis = "/pages/printing/order/index?".concat(orderCreate, "&printType=order");
    wx.navigateTo({
      url: mta_analysis,
    });
  },
  drawShareImage: function () {
    var e = "".concat(app.config.imgHost, "/img/customer/img_fenxiangdingdan@2x.png"),
      toast = wx.createCanvasContext("orderCanvas");
    (toast.setFillStyle("red"),
      toast.fillRect(0, 0, 150, 75),
      toast.drawImage(e, 0, 0, 260.8, 213.6),
      toast.draw());
  },
});
