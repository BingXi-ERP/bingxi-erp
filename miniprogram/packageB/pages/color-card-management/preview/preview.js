var e = require("../../../../@babel/runtime/helpers/interopRequireDefault").default,
  toConsumableArray = require("../../../../@babel/runtime/helpers/toConsumableArray"),
  ServicesUserLog = require("../../../../libs/services/ServicesUserLog.js"),
  mta_analysis = e(require("../../../../utils/mta_analysis.js")),
  dialog = e(require("../../../../miniprogram_npm/@vant/weapp/dialog/dialog")),
  app = getApp(),
  ServicesCard = require("../../../../libs/services/ServicesCard.js").servicesCard,
  util = require("../../../../libs/utils/util.js").utils,
  ServicesShop = require("../../../../libs/services/ServicesShop.js").servicesShop;
Page({
  data: {
    globalApp: {},
    goodsId: "",
    goodsInfo: {},
    icon: {
      noColorBg: "".concat(app.config.imgHost, "/img/customer/duibuIcon/icon2nd/emptyColor@2x.png"),
      share: "".concat(app.config.imgHost, "/img/customer/share.png"),
      rightArrow: "".concat(app.config.imgHost, "/img/customer/ic_jinru.png"),
      baozhuang: "".concat(
        app.config.imgHost,
        "/img/customer/duibuIcon/icon/ic_baozhuang@4.5x.png",
      ),
      delete: "".concat(app.config.imgHost, "/img/customer/duibuIcon/icon/del@2x.png"),
    },
    swiper: {
      indicatorDots: !1,
      autoplay: !1,
      circular: !0,
      indicatorcolor: "#000",
      interval: 2e3,
      duration: 100,
    },
    popupShow: !1,
    shareFriendData: {},
    popupInit: {
      canvas: {
        show: !1,
        notice: !1,
        canvasId: {
          shareCanvas: "shareCanvas",
          photoCanvas: "photoCanvas",
        },
      },
      share: {
        show: !1,
      },
    },
    tempImgUrl: {
      goodUrl: "",
      qrUrl: "",
    },
    showPropoty: !1,
    showChooseAttr: !1,
    showOther: !1,
    duibuImgFields: ["imageTwo0", "imageTwoBack0", "imageFive0", "imageFiveBack0"],
    topShowImage: [],
    botShowImage: [],
    detailTypeImage: [
      {
        title: "轮播图",
        field: "topShowImage",
        type: 1,
        images: [],
      },
      {
        title: "商品图",
        field: "imageInfoList",
        type: 2,
        images: [],
      },
      {
        title: "盒子图",
        field: "duibuImages",
        type: 3,
        images: [],
      },
    ],
    isShowShare: !0,
    searchId: "",
    userAuthList: {},
  },
  hasPower: function () {
    var e = wx.getStorageSync("resCodeList");
    ((app.userAuthList = util.getResList(e)),
      this.setData({
        userAuthList: app.userAuthList,
      }));
  },
  colorCardDetail: function () {
    var e = this,
      ServicesUserLog = this.data,
      mta_analysis = ServicesUserLog.goodsId,
      dialog = ServicesUserLog.goodsInfo,
      app = ServicesUserLog.duibuImgFields,
      ServicesShop = ServicesUserLog.detailTypeImage;
    ServicesCard.ColorCardDetail({}, mta_analysis).then(function (a) {
      if (0 === a.code) {
        var mta_analysis = a.data.detailImage || {};
        (ServicesShop.forEach(function (e) {
          (1 === e.type &&
            (e.images = [].concat(
              toConsumableArray(a.data.imageDetailList),
              toConsumableArray(a.data.imageSampleList),
            )),
            2 === e.type && (e.images = a.data.imageInfoList),
            3 === e.type &&
              (e.images = app
                .map(function (e) {
                  return {
                    storagePath: mta_analysis[e],
                  };
                })
                .filter(function (e) {
                  return e.storagePath;
                })),
            e.images.forEach(function (e) {
              e.storagePath = util.replImage(e.storagePath);
            }),
            e.type > 1 &&
              0 === ServicesShop[0].images.length &&
              (ServicesShop[0].images = ServicesShop[0].images.concat(e.images)));
        }),
          Object.assign(dialog, a.data),
          e.setData({
            goodsInfo: dialog,
            detailTypeImage: ServicesShop,
          }));
      } else
        wx.showToast({
          title: a.msg,
          icon: "none",
        });
    });
  },
  previewImg: function (e) {
    var toConsumableArray = e.currentTarget.dataset,
      ServicesUserLog = toConsumableArray.detailtype,
      mta_analysis = toConsumableArray.url,
      dialog = this.data.detailTypeImage[Number(ServicesUserLog) - 1].images.map(function (e) {
        return e.storagePath;
      });
    wx.previewImage({
      current: mta_analysis,
      urls: dialog,
    });
  },
  popupShow: function () {
    this.setData({
      "popupInit.share.show": !0,
    });
  },
  popupHide: function () {
    this.setData({
      "popupInit.share.show": !1,
    });
  },
  closePopup: function () {
    this.setData({
      "popupInit.canvas.show": !1,
    });
  },
  getQRCode: function () {
    var e = this;
    return new Promise(function (t) {
      var ServicesUserLog = {
        productId: e.data.goodsId,
        companyId: app.globalData.userInfo.companyId,
        envVersion: app.envVersion,
      };
      ServicesCard.getQRcode(ServicesUserLog).then(function (a) {
        0 === a.code
          ? wx.getImageInfo({
              src: a.data,
              success: function (a) {
                (e.setData({
                  "tempImgUrl.qrUrl": a.path,
                }),
                  t());
              },
            })
          : (wx.showToast({
              title: a.msg,
              icon: "none",
            }),
            t());
      });
    });
  },
  getCanvasImg: function () {
    var e = this;
    return new Promise(function (t) {
      var ServicesUserLog = e.data.detailTypeImage[0].images.length
          ? e.data.detailTypeImage[0].images[0].storagePath
          : "",
        mta_analysis = util.replImage(ServicesUserLog);
      wx.getImageInfo({
        src: mta_analysis + "?x-oss-process=image/auto-orient,1",
        success: function (a) {
          (e.setData({
            "tempImgUrl.goodUrl": a.path,
          }),
            t());
        },
      });
    });
  },
  drawCanvas: function (e, t) {
    var ServicesUserLog = t.goodTempUrl,
      mta_analysis = t.qrTempUrl,
      dialog = t.item_name,
      app = t.item_price,
      ServicesCard = t.notice_txt,
      util = t.notice_txt2,
      ServicesShop = t.canvasWidth,
      g = t.canvasHeight,
      u = t.imgX,
      l = t.imgY,
      h = t.imgWidth,
      p = t.imgHeight,
      d = t.qrX,
      m = t.qrY,
      f = t.qrSize,
      v = t.fontSize,
      w = t.titleY,
      I = t.priceY,
      x = t.noticeY1,
      S = t.noticeY2;
    (e.setFillStyle("white"),
      e.fillRect(0, 0, ServicesShop, g),
      e.drawImage(ServicesUserLog, u, l, h, p),
      e.drawImage(mta_analysis, d, m, f, f),
      e.setFontSize(v),
      e.setFillStyle("#333333"),
      e.setTextAlign("left"),
      e.fillText(dialog, u, w),
      e.setFontSize(v),
      e.setFillStyle("#ff0000"),
      e.setTextAlign("left"),
      e.fillText(app, u, I),
      e.setFontSize(0.7 * v),
      e.setFillStyle("#333333"),
      e.setTextAlign("left"),
      e.fillText(ServicesCard, u, x),
      e.fillText(util, u, S),
      e.stroke(),
      e.draw());
  },
  shareM: function () {
    var e = this;
    (wx.showLoading({
      title: "正在生成图片...",
      mask: !0,
    }),
      Promise.all([this.getCanvasImg(), this.getQRCode()]).then(function () {
        var toConsumableArray = e.data.popupInit.canvas.canvasId,
          ServicesUserLog = toConsumableArray.shareCanvas,
          mta_analysis = toConsumableArray.photoCanvas,
          dialog = wx.createCanvasContext(ServicesUserLog),
          app = wx.createCanvasContext(mta_analysis),
          ServicesCard = e.data.goodsInfo.businessProductName,
          util = e.getPriceText(),
          ServicesShop = "长按识别",
          g = "查看更多商品",
          u = e.data.tempImgUrl.goodUrl,
          l = e.data.tempImgUrl.qrUrl;
        (e.drawCanvas(dialog, {
          goodTempUrl: u,
          qrTempUrl: l,
          item_name: ServicesCard,
          item_price: util,
          notice_txt: ServicesShop,
          notice_txt2: g,
          canvasWidth: 250,
          canvasHeight: 450,
          imgX: 25,
          imgY: 40,
          imgWidth: 200,
          imgHeight: 267,
          qrX: 140,
          qrY: 345,
          qrSize: 100,
          fontSize: 14,
          titleY: 330,
          priceY: 355,
          noticeY1: 395,
          noticeY2: 415,
        }),
          e.drawCanvas(app, {
            goodTempUrl: u,
            qrTempUrl: l,
            item_name: ServicesCard,
            item_price: util,
            notice_txt: ServicesShop,
            notice_txt2: g,
            canvasWidth: 500,
            canvasHeight: 900,
            imgX: 50,
            imgY: 80,
            imgWidth: 400,
            imgHeight: 534,
            qrX: 280,
            qrY: 690,
            qrSize: 200,
            fontSize: 28,
            titleY: 660,
            priceY: 710,
            noticeY1: 790,
            noticeY2: 830,
          }),
          e.setData({
            "popupInit.canvas.show": !0,
            "popupInit.canvas.notice": !0,
          }),
          wx.hideLoading());
      }),
      ServicesShop.operateAccess({
        type: "101",
      }).then(function () {}),
      ServicesUserLog.servicesUserLog.setUserHandleLog(114));
  },
  getPriceText: function () {
    var e = this.data.goodsInfo,
      toConsumableArray = e.price,
      ServicesUserLog = e.priceUnit;
    return toConsumableArray && "0" !== toConsumableArray && "0.0" !== toConsumableArray
      ? "¥ ".concat(toConsumableArray, "/").concat(ServicesUserLog)
      : "面议";
  },
  saveCanvas: function () {
    var e = this,
      toConsumableArray = this.data.popupInit.canvas.canvasId.photoCanvas;
    (wx.showLoading({
      title: "正在保存图片...",
      mask: !0,
    }),
      setTimeout(function () {
        wx.canvasToTempFilePath({
          x: 0,
          y: 0,
          width: 750,
          height: 1350,
          destWidth: 750 * util.getDpr(),
          destHeight: 1350 * util.getDpr(),
          quality: 1,
          canvasId: toConsumableArray,
          success: function (t) {
            (wx.hideLoading(),
              wx.saveImageToPhotosAlbum({
                filePath: t.tempFilePath,
                success: function () {
                  (wx.showToast({
                    title: "图片已保存到相册",
                    icon: "success",
                  }),
                    e.setData({
                      "popupInit.canvas.show": !1,
                      mask: !1,
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
                            fail: function () {
                              e.setData({
                                showAuth: !0,
                              });
                            },
                          });
                      },
                    });
                },
              }));
          },
        });
      }, 3e3));
  },
  handleClosePopup: function () {
    this.setData({
      showPropoty: !1,
      showChooseAttr: !1,
      showOther: !1,
    });
  },
  attributeDetail: function () {
    this.setData({
      showPropoty: !0,
    });
  },
  handleShowPopup: function () {
    this.setData({
      showChooseAttr: !0,
    });
  },
  serviceDetail: function () {
    this.setData({
      showOther: !0,
    });
  },
  supplierDetail: function () {
    var e = this.data,
      toConsumableArray = e.userAuthList,
      ServicesUserLog = e.searchId,
      mta_analysis = e.goodsInfo;
    toConsumableArray["search:supplier:view"]
      ? wx.navigateTo({
          url: "../../../packageB/pages/search-supplier/index?searchId="
            .concat(ServicesUserLog, "&uuid=")
            .concat(mta_analysis.uuid, "&spuNumber=")
            .concat(mta_analysis.platformSpuNumber),
        })
      : dialog.default.alert({
          message: "您好，您的平台检索结果暂时无法提供商家信息，请联系平台工作人员为您提供服务~",
        });
  },
  onLoad: function (e) {
    mta_analysis.default.Page.init();
    var toConsumableArray = util.formatUrlQuery(e);
    (this.setData({
      globalApp: app,
      goodsId: toConsumableArray.goodsId,
      searchId: toConsumableArray.searchId,
      isShowShare: "1" === toConsumableArray.showShare,
    }),
      wx.hideShareMenu(),
      this.colorCardDetail());
  },
  onReady: function () {},
  onShow: function () {
    (ServicesUserLog.servicesUserLog.setUserHandleLog(113), this.hasPower());
  },
  onHide: function () {},
  onUnload: function () {},
  onPullDownRefresh: function () {},
  onReachBottom: function () {},
  onShareAppMessage: function () {
    var e = this.data,
      toConsumableArray = e.goodsId,
      ServicesUserLog = e.goodsInfo,
      mta_analysis = "/packageB/pages/color-card-management/preview/preview?goodsId=".concat(
        toConsumableArray,
      );
    return {
      title: ServicesUserLog.goodsName,
      path: mta_analysis,
      imageUrl: ServicesUserLog.imageSampleList[0],
    };
  },
});
