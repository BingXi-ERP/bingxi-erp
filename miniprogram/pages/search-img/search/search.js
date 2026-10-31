var t = require("../../../@babel/runtime/helpers/interopRequireDefault").default,
  createForOfIteratorHelper = require("../../../@babel/runtime/helpers/createForOfIteratorHelper"),
  mta_analysis = t(require("../../../utils/mta_analysis.js")),
  app = getApp(),
  ServicesCard = require("../../../libs/services/ServicesCard.js").servicesCard,
  util = require("../../../libs/utils/util.js").utils;
Page({
  data: {
    searchImgUrl: "",
    searchList: [],
    shareFriendData: {},
    noColorCardBg: "".concat(app.config.imgHost, "/img/customer/img_wuxinx@3x.png"),
    noColorCardShow: !1,
    popupInit: {
      canvas: {
        show: !1,
        notice: !1,
        canvasId: {
          shareCanvas: "shareCanvas",
          photoCanvas: "photoCanvas",
        },
      },
    },
    tempImgUrl: {
      goodUrl: "",
      qrUrl: "",
    },
    pageNum: 1,
    pageSize: 10,
    saleStatus: 0,
    filterKey: 2,
    isDone: !1,
  },
  getSearchList: function () {
    var t = this,
      mta_analysis = this.data.searchImgUrl;
    (wx.showLoading({
      title: "搜索中",
    }),
      wx.uploadFile({
        url: "".concat(app.config.bingxiHost, "/app-api/goods/imgSearch/goodsImgSearch"),
        filePath: mta_analysis,
        name: "file",
        header: {
          "content-type": "multipart/form-data;charset=utf-8",
          Authorization: wx.getStorageSync("token"),
          terminalSource: 6,
          terminalType: 81,
        },
        formData: {
          filePath: "/bdd/imgSearch",
        },
        success: function (a) {
          var ServicesCard = a.data && JSON.parse(a.data),
            util = t.data.searchList,
            o = ServicesCard.data || [];
          if (200 == a.statusCode) {
            var r,
              l = createForOfIteratorHelper(o);
            try {
              for (l.s(); !(r = l.n()).done;) {
                var c = r.value;
                (1 == c.onSale
                  ? (c.onOrOff = {
                      name: "下架",
                      icon: "".concat(app.config.imgHost, "/img/customer/ic_xiajiaseka@4.5x.png"),
                    })
                  : 0 == c.onSale &&
                    (c.onOrOff = {
                      name: "上架",
                      icon: "".concat(
                        app.config.imgHost,
                        "/img/customer/ic_shangjiazhong@4.5x.png",
                      ),
                    }),
                  util.push(c));
              }
            } catch (t) {
              l.e(t);
            } finally {
              l.f();
            }
            (t.setData({
              searchList: util,
            }),
              wx.hideLoading(),
              0 == o.length &&
                t.setData({
                  noColorCardShow: !0,
                }));
          } else
            (wx.showToast({
              title: ServicesCard.msg,
              icon: "none",
            }),
              wx.hideLoading());
        },
      }));
  },
  onOrOff: function (t) {
    var createForOfIteratorHelper = this,
      mta_analysis = t.detail,
      app = mta_analysis.goodsid,
      util = mta_analysis.operateType,
      o = "";
    (0 == util
      ? ("下架成功", (o = ServicesCard.batchSetOffSale))
      : 1 == util && ("上架成功", (o = ServicesCard.batchSetOnSale)),
      o({
        productIds: app.split(","),
        onSale: Number(util),
      }).then(function (t) {
        0 === t.code
          ? (wx.showLoading(),
            createForOfIteratorHelper.setData({
              searchList: [],
            }),
            wx.showToast({
              title: "成功",
            }),
            createForOfIteratorHelper.getSearchList())
          : wx.showToast({
              title: t.msg,
              icon: "none",
            });
      }));
  },
  closePopup: function () {
    this.setData({
      "popupInit.canvas.show": !1,
    });
  },
  getQRCode: function (t) {
    var createForOfIteratorHelper = this;
    return new Promise(function (a, n) {
      var o = {
        productId: t,
        companyId: app.globalData.userInfo.companyId,
        envVersion: app.envVersion,
      };
      ServicesCard.getQRcode(o).then(function (t) {
        if (0 === t.code) {
          var app = t.data;
          wx.getImageInfo({
            src: app,
            success: function (t) {
              (createForOfIteratorHelper.setData({
                "tempImgUrl.qrUrl": t.path,
              }),
                a());
            },
          });
        } else
          (wx.showToast({
            title: t.msg,
            icon: "none",
          }),
            a());
      });
    });
  },
  shareF: function (t) {
    this.setData({
      shareFriendData: t.detail,
    });
  },
  getCanvasImg: function () {
    var t = this;
    return new Promise(function (e, a) {
      var app = t.data.shareFriendData.img;
      wx.getImageInfo({
        src: app,
        success: function (a) {
          (t.setData({
            "tempImgUrl.goodUrl": a.path,
          }),
            e());
        },
      });
    });
  },
  shareM: function (t) {
    var createForOfIteratorHelper = this;
    (this.setData({
      shareFriendData: t.detail,
    }),
      wx.showLoading({
        title: "正在生成图片...",
        mask: !0,
      }),
      Promise.all([this.getCanvasImg(), this.getQRCode(t.detail.goodsid)]).then(function () {
        var t = createForOfIteratorHelper.data.popupInit.canvas.canvasId.shareCanvas,
          mta_analysis = createForOfIteratorHelper.data.popupInit.canvas.canvasId.photoCanvas,
          app = wx.createCanvasContext(t),
          ServicesCard = wx.createCanvasContext(mta_analysis),
          util = createForOfIteratorHelper.data.shareFriendData.name,
          o = "¥ "
            .concat(createForOfIteratorHelper.data.shareFriendData.price, "/")
            .concat(createForOfIteratorHelper.data.shareFriendData.unit),
          r = "长按识别",
          l = "查看更多商品",
          c = createForOfIteratorHelper.data.tempImgUrl.goodUrl,
          h = createForOfIteratorHelper.data.tempImgUrl.qrUrl;
        (app.setFillStyle("white"),
          app.fillRect(0, 0, 250, 450),
          app.drawImage(c, 25, 40, 200, 267),
          app.drawImage(h, 140, 345, 100, 100),
          app.setFontSize(14),
          app.setFillStyle("#333333"),
          app.setTextAlign("left"),
          app.fillText(util, 25, 330),
          app.setFontSize(14),
          app.setFillStyle("#ff0000"),
          app.setTextAlign("left"),
          app.fillText(o, 25, 355),
          app.setFontSize(10),
          app.setFillStyle("#333333"),
          app.setTextAlign("left"),
          app.fillText(r, 25, 395),
          app.setFontSize(10),
          app.setFillStyle("#333333"),
          app.setTextAlign("left"),
          app.fillText(l, 25, 415),
          app.stroke(),
          app.draw(),
          ServicesCard.setFillStyle("white"),
          ServicesCard.fillRect(0, 0, 500, 900),
          ServicesCard.drawImage(c, 50, 80, 400, 534),
          ServicesCard.drawImage(h, 280, 690, 200, 200),
          ServicesCard.setFontSize(28),
          ServicesCard.setFillStyle("#333333"),
          ServicesCard.setTextAlign("left"),
          ServicesCard.fillText(util, 50, 660),
          ServicesCard.setFontSize(28),
          ServicesCard.setFillStyle("#ff0000"),
          ServicesCard.setTextAlign("left"),
          ServicesCard.fillText(o, 50, 710),
          ServicesCard.setFontSize(20),
          ServicesCard.setFillStyle("#333333"),
          ServicesCard.setTextAlign("left"),
          ServicesCard.fillText(r, 50, 790),
          ServicesCard.setFontSize(20),
          ServicesCard.setFillStyle("#333333"),
          ServicesCard.setTextAlign("left"),
          ServicesCard.fillText(l, 50, 830),
          ServicesCard.stroke(),
          ServicesCard.draw(),
          createForOfIteratorHelper.setData({
            "popupInit.canvas.show": !0,
            "popupInit.canvas.notice": !0,
          }),
          wx.hideLoading());
      }));
  },
  saveCanvas: function () {
    var t = this,
      createForOfIteratorHelper = this.data.popupInit.canvas.canvasId.photoCanvas;
    wx.showLoading({
      title: "正在保存图片...",
      mask: !0,
    });
    var mta_analysis = setTimeout(function () {
      wx.canvasToTempFilePath({
        x: 0,
        y: 0,
        width: 750,
        height: 1350,
        destWidth: 750 * util.getDpr(),
        destHeight: 1350 * util.getDpr(),
        quality: 1,
        canvasId: createForOfIteratorHelper,
        success: function (e) {
          (wx.hideLoading(),
            wx.saveImageToPhotosAlbum({
              filePath: e.tempFilePath,
              success: function () {
                (wx.showToast({
                  title: "图片已保存到相册",
                  icon: "success",
                }),
                  t.setData({
                    "popupInit:canvas.show": !1,
                  }),
                  clearTimeout(mta_analysis));
              },
              fail: function (e) {
                "saveImageToPhotosAlbum:fail auth deny" === e.errMsg &&
                  wx.showModal({
                    title: "提示",
                    content: "您拒绝了保存权限，请打开保存权限",
                    success: function (e) {
                      e.confirm &&
                        wx.openSetting({
                          success: function (t) {
                            t.authSetting = {
                              "scope.writePhotosAlbum": !0,
                            };
                          },
                          fail: function (e) {
                            t.setData({
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
    }, 3e3);
  },
  onLoad: function (t) {
    (mta_analysis.default.Page.init(),
      t.imgUrl &&
        null != t.imgUrl &&
        this.setData({
          searchImgUrl: t.imgUrl,
        }),
      wx.hideShareMenu(),
      this.setData({
        searchList: [],
      }),
      this.getSearchList());
  },
  onReady: function () {},
  onShow: function () {},
  onHide: function () {},
  onUnload: function () {},
  onPullDownRefresh: function () {},
  onReachBottom: function () {},
  onShareAppMessage: function () {
    var t = "/pages/color-card-management/preview/preview?goodsId=".concat(
      this.data.shareFriendData.goodsid,
    );
    return {
      title: this.data.shareFriendData.name,
      path: t,
      imageUrl: this.data.shareFriendData.img,
    };
  },
});
