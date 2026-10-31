var createForOfIteratorHelper = require("../../../../../@babel/runtime/helpers/createForOfIteratorHelper"),
  toConsumableArray = require("../../../../../@babel/runtime/helpers/toConsumableArray"),
  app = getApp(),
  ServicesCardType = require("../../../../../libs/services/ServicesCardType.js").ServicesCardType,
  ServicesCard = require("../../../../../libs/services/ServicesCard.js").servicesCard,
  util = require("../../../../../libs/utils/util.js").utils;
Page({
  data: {
    userAuthList: {},
    input: {
      value: "",
    },
    listTotle: "0",
    categoryId: "",
    footerBar: [
      {
        name: "增加商品",
        icon: "".concat(app.config.imgHost, "/img/customer/ic_tianjiaseka@2x.png"),
        action: "add",
      },
      {
        name: "批量管理",
        icon: "".concat(app.config.imgHost, "/img/customer/ic_piliangguanli@2x.png"),
        action: "more",
      },
    ],
    colorCardList: [],
    colorCardCount: {
      on: "",
      off: "",
    },
    noColorCardBg: "".concat(app.config.imgHost, "/img/customer/img_wuxinx@3x.png"),
    hideFilter: !1,
    pageNum: 1,
    pageSize: 10,
    saleStatus: 1,
    filterKey: 7,
    isDone: !1,
    inputValue: "",
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
    },
    tempImgUrl: {
      goodUrl: "",
      qrUrl: "",
    },
  },
  changeItems: function (t, a, o) {
    ((t[a] = t.splice(o, 1, t[a])[0]),
      this.setData({
        colorCardList: toConsumableArray(t),
      }),
      console.log(this.data.colorCardList));
  },
  changeList: function (t) {
    var toConsumableArray = t.currentGoodsId,
      app = this.data.colorCardList,
      ServicesCardType = "";
    if (
      (app.forEach(function (t, a) {
        t.id === toConsumableArray && (o = a);
      }),
      2 === t.sortType)
    ) {
      if ("" !== ServicesCardType && ServicesCardType == app.length - 1) return;
      this.changeItems(app, ServicesCardType, ServicesCardType + 1);
    } else {
      if ("" !== ServicesCardType && 0 == ServicesCardType) return;
      this.changeItems(app, ServicesCardType, ServicesCardType - 1);
    }
  },
  moveitem: function (t) {
    var toConsumableArray = this,
      app = t.detail,
      ServicesCard = {
        classifyId: app.categoryId,
        productId: app.currentGoodsId,
        type: app.sortType,
      };
    ServicesCardType.sortGoods(ServicesCard).then(function (t) {
      0 === t.code
        ? toConsumableArray.changeList(app)
        : wx.showToast({
            title: t.msg,
            icon: "none",
          });
    });
  },
  getValue: function (t) {
    var toConsumableArray = t.detail.value;
    (this.setData({
      "input.value": toConsumableArray,
    }),
      "" == toConsumableArray &&
        (this.setData({
          colorCardList: [],
          pageNum: 1,
          pageSize: 10,
          hideFilter: !1,
        }),
        this.getCardList()));
  },
  footerBarAuth: function () {
    if (!this.data.userAuthList["goods:add"]) {
      var createForOfIteratorHelper = this.data.footerBar.filter(function (t) {
        return "增加商品" !== t.name;
      });
      this.setData({
        footerBar: createForOfIteratorHelper,
      });
    }
  },
  footerBarTap: function (t) {
    switch (t.currentTarget.dataset.action) {
      case "add":
        wx.navigateTo({
          url: "/packageB/pages/color-card-management/add-color-card/add-color-card?type=0",
        });
        break;
      case "more":
        wx.navigateTo({
          url: "/packageB/pages/color-card-management/batch-management/batch-management?saleStatus="
            .concat(this.data.saleStatus, "&id=")
            .concat(this.data.categoryId),
        });
    }
  },
  keyboardConfirm: function () {
    var createForOfIteratorHelper = this.data.input.value;
    (this.setData({
      pageNum: 1,
      pageSize: 10,
      colorCardList: [],
    }),
      this.getCardList(createForOfIteratorHelper));
  },
  search: function () {
    var createForOfIteratorHelper = this.data.input.value;
    (console.log(createForOfIteratorHelper, "12331"),
      this.setData({
        pageNum: 1,
        pageSize: 10,
        colorCardList: [],
      }),
      this.getCardList(createForOfIteratorHelper));
  },
  getCardList: function () {
    var toConsumableArray = this,
      ServicesCard = arguments.length > 0 && void 0 !== arguments[0] ? arguments[0] : "",
      util = this;
    return new Promise(function (s, r) {
      wx.showLoading();
      var c = toConsumableArray.data,
        l = c.saleStatus,
        d = c.filterKey,
        u = c.pageNum,
        g = c.pageSize,
        h = c.colorCardList,
        f = {
          classifyId: util.data.categoryId,
          onSale: Number(l),
          filterKey: d,
          page: u,
          size: g,
          searchFiled: ServicesCard,
        };
      ServicesCardType.goodsManagerList(f).then(function (o) {
        if (0 === o.code) {
          toConsumableArray.setData({
            "colorCardCount.off": o.data.unSaleCount,
            "colorCardCount.on": o.data.saleCount,
          });
          var ServicesCard,
            util = createForOfIteratorHelper(o.data.content);
          try {
            for (util.s(); !(i = util.n()).done;) {
              var r = ServicesCard.value;
              (0 == r.onSale
                ? (r.onOrOff = {
                    name: "下架",
                    icon: "".concat(app.config.imgHost, "/img/customer/ic_xiajiaseka@4.5x.png"),
                  })
                : 1 == r.onSale &&
                  (r.onOrOff = {
                    name: "上架",
                    icon: "".concat(app.config.imgHost, "/img/customer/ic_shangjiazhong@4.5x.png"),
                  }),
                h.push(r));
            }
          } catch (t) {
            util.e(t);
          } finally {
            util.f();
          }
          (toConsumableArray.setData({
            colorCardList: h,
            listTotle: Number(o.data.total) - 1,
          }),
            console.log(h),
            0 == o.data.content.length &&
              u > 1 &&
              toConsumableArray.setData({
                isDone: !0,
              }),
            console.log(toConsumableArray.data),
            wx.hideLoading(),
            s(o));
        } else
          (wx.showToast({
            title: o.msg,
            icon: "none",
          }),
            wx.hideLoading(),
            s(o));
      });
    });
  },
  changeTab: function (t) {
    var toConsumableArray = this.data.input.value,
      app = t.detail.saleStatus;
    ((1 == app || 0 == app) &&
      this.setData({
        pageNum: 1,
      }),
      this.setData({
        saleStatus: 1 === app ? 0 : 1,
        colorCardList: [],
      }),
      this.getCardList(toConsumableArray));
  },
  onOrOff: function (t) {
    var toConsumableArray = t.detail,
      app = (toConsumableArray.goodsid, toConsumableArray.operateType);
    (toConsumableArray.idx, this.data.colorCardList);
    console.log(app);
    0 == app ? 0 : 1 == app && 1;
  },
  queryColorCardCount: function () {
    var createForOfIteratorHelper = this,
      toConsumableArray = {
        categoryId: this.data.categoryId,
      };
    return new Promise(function (a, i) {
      ServicesCardType.goodsSaleCount(toConsumableArray).then(function (e) {
        0 === e.code
          ? (createForOfIteratorHelper.setData({
              "colorCardCount.off": e.data.offSaleCount,
              "colorCardCount.on": e.data.onSaleCount,
            }),
            a(e))
          : (wx.showToast({
              title: e.msg,
              icon: "none",
            }),
            a(e));
      });
    });
  },
  toAddColorCard: function () {
    wx.navigateTo({
      url: "/packageB/pages/color-card-management/add-color-card/add-color-card?categoryId=".concat(
        this.data.categoryId,
        "&type=0",
      ),
    });
  },
  closePopup: function () {
    this.setData({
      "popupInit.canvas.show": !1,
    });
  },
  getQRCode: function (t) {
    var toConsumableArray = this;
    return new Promise(function (o, n) {
      var s = {
        productId: t,
        companyId: app.globalData.userInfo.companyId,
        envVersion: app.envVersion,
      };
      ServicesCard.getQRcode(s).then(function (t) {
        if (0 === t.code) {
          var app = t.data;
          wx.getImageInfo({
            src: app,
            success: function (t) {
              (toConsumableArray.setData({
                "tempImgUrl.qrUrl": t.path,
              }),
                o());
            },
          });
        } else
          (wx.showToast({
            title: t.msg,
            icon: "none",
          }),
            o());
      });
    });
  },
  shareF: function (t) {
    this.setData({
      shareFriendData: t.detail,
    });
  },
  getCanvasImg: function () {
    var createForOfIteratorHelper = this;
    return new Promise(function (e, a) {
      var ServicesCardType = createForOfIteratorHelper.data.shareFriendData.img;
      wx.getImageInfo({
        src: ServicesCardType,
        success: function (a) {
          (createForOfIteratorHelper.setData({
            "tempImgUrl.goodUrl": a.path,
          }),
            e());
        },
      });
    });
  },
  shareM: function (t) {
    var toConsumableArray = this;
    (this.setData({
      shareFriendData: t.detail,
    }),
      wx.showLoading({
        title: "正在生成图片...",
        mask: !0,
      }),
      Promise.all([this.getCanvasImg(), this.getQRCode(t.detail.goodsid)]).then(function () {
        var createForOfIteratorHelper =
            toConsumableArray.data.popupInit.canvas.canvasId.shareCanvas,
          app = toConsumableArray.data.popupInit.canvas.canvasId.photoCanvas,
          ServicesCardType = wx.createCanvasContext(createForOfIteratorHelper),
          ServicesCard = wx.createCanvasContext(app),
          util = toConsumableArray.data.shareFriendData.businessProductName,
          s = "¥ "
            .concat(toConsumableArray.data.shareFriendData.price, "/")
            .concat(toConsumableArray.data.shareFriendData.priceUnit),
          r = "长按识别",
          c = "查看更多商品",
          l = toConsumableArray.data.tempImgUrl.goodUrl,
          d = toConsumableArray.data.tempImgUrl.qrUrl;
        (ServicesCardType.setFillStyle("white"),
          ServicesCardType.fillRect(0, 0, 250, 450),
          ServicesCardType.drawImage(l, 25, 40, 200, 267),
          ServicesCardType.drawImage(d, 140, 345, 100, 100),
          ServicesCardType.setFontSize(14),
          ServicesCardType.setFillStyle("#333333"),
          ServicesCardType.setTextAlign("left"),
          ServicesCardType.fillText(util, 25, 330),
          ServicesCardType.setFontSize(14),
          ServicesCardType.setFillStyle("#ff0000"),
          ServicesCardType.setTextAlign("left"),
          ServicesCardType.fillText(s, 25, 355),
          ServicesCardType.setFontSize(10),
          ServicesCardType.setFillStyle("#333333"),
          ServicesCardType.setTextAlign("left"),
          ServicesCardType.fillText(r, 25, 395),
          ServicesCardType.setFontSize(10),
          ServicesCardType.setFillStyle("#333333"),
          ServicesCardType.setTextAlign("left"),
          ServicesCardType.fillText(c, 25, 415),
          ServicesCardType.stroke(),
          ServicesCardType.draw(),
          ServicesCard.setFillStyle("white"),
          ServicesCard.fillRect(0, 0, 500, 900),
          ServicesCard.drawImage(l, 50, 80, 400, 534),
          ServicesCard.drawImage(d, 280, 690, 200, 200),
          ServicesCard.setFontSize(28),
          ServicesCard.setFillStyle("#333333"),
          ServicesCard.setTextAlign("left"),
          ServicesCard.fillText(util, 50, 660),
          ServicesCard.setFontSize(28),
          ServicesCard.setFillStyle("#ff0000"),
          ServicesCard.setTextAlign("left"),
          ServicesCard.fillText(s, 50, 710),
          ServicesCard.setFontSize(20),
          ServicesCard.setFillStyle("#333333"),
          ServicesCard.setTextAlign("left"),
          ServicesCard.fillText(r, 50, 790),
          ServicesCard.setFontSize(20),
          ServicesCard.setFillStyle("#333333"),
          ServicesCard.setTextAlign("left"),
          ServicesCard.fillText(c, 50, 830),
          ServicesCard.stroke(),
          ServicesCard.draw(),
          toConsumableArray.setData({
            "popupInit.canvas.show": !0,
            "popupInit.canvas.notice": !0,
          }),
          wx.hideLoading());
      }));
  },
  saveCanvas: function () {
    var createForOfIteratorHelper = this,
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
          success: function (e) {
            (wx.hideLoading(),
              wx.saveImageToPhotosAlbum({
                filePath: e.tempFilePath,
                success: function () {
                  (wx.showToast({
                    title: "图片已保存到相册",
                    icon: "success",
                  }),
                    createForOfIteratorHelper.setData({
                      "popupInit:canvas.show": !1,
                    }));
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
                              createForOfIteratorHelper.setData({
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
  filterConfirm: function (t) {
    var toConsumableArray = t.detail.filterKey;
    (this.setData({
      filterKey: toConsumableArray,
      colorCardList: [],
      pageNum: 1,
      isDone: !1,
    }),
      this.getCardList());
  },
  onLoad: function (t) {
    (this.setData({
      userAuthList: app.userAuthList,
    }),
      (this.data.categoryId = t.id),
      this.setData({
        categoryId: t.id,
      }),
      t.typename &&
        null != t.typename &&
        wx.setNavigationBarTitle({
          title: t.typename,
        }),
      wx.hideShareMenu(),
      console.log(t),
      this.footerBarAuth());
  },
  onReady: function () {},
  onShow: function () {
    (wx.showLoading({
      title: "加载中",
    }),
      this.setData({
        colorCardList: [],
        pageNum: 1,
      }),
      Promise.all([this.getCardList()]).then(function (t) {
        (wx.removeStorageSync("baseListId"), wx.hideLoading());
      }));
  },
  onHide: function () {},
  onUnload: function () {},
  onPullDownRefresh: function () {},
  onReachBottom: function () {
    var createForOfIteratorHelper = this.data,
      toConsumableArray = createForOfIteratorHelper.pageNum;
    createForOfIteratorHelper.isDone
      ? wx.showToast({
          title: "数据已全部加载完毕",
          icon: "none",
        })
      : (toConsumableArray++,
        this.setData({
          pageNum: toConsumableArray,
        }),
        this.getCardList());
  },
  onShareAppMessage: function () {},
});
