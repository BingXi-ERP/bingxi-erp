var t = require("../../@babel/runtime/helpers/interopRequireDefault").default,
  toConsumableArray = require("../../@babel/runtime/helpers/toConsumableArray");
require("../../@babel/runtime/helpers/Arrayincludes");
var a = require("../../@babel/runtime/helpers/regeneratorRuntime"),
  o = require("../../@babel/runtime/helpers/asyncToGenerator"),
  r = require("../../@babel/runtime/helpers/defineProperty"),
  createForOfIteratorHelper = require("../../@babel/runtime/helpers/createForOfIteratorHelper"),
  mta_analysis = t(require("../../utils/mta_analysis.js")),
  app = getApp(),
  login = require("../../libs/utils/login.js").login,
  ServicesCard = require("../../libs/services/ServicesCard.js").servicesCard,
  util = require("../../libs/utils/util.js").utils,
  ServicesShop = require("../../libs/services/ServicesShop.js").servicesShop,
  ServicesUserLog = require("../../libs/services/ServicesUserLog.js").servicesUserLog,
  u = "printTips",
  f = "colorCaraSetting",
  m = "creterColor",
  p = "creterProdShare",
  w = "baseListId",
  I = 0,
  C = 1,
  v = 114,
  x = 115,
  S = 116;
Page({
  data: {
    showTips: !1,
    userAuthList: {},
    input: {
      text: "请输入色卡编号/品名搜索",
    },
    footerBar: [
      {
        name: "新增面料",
        icon: "".concat(app.config.imgHost, "/img/customer/ic_tianjia@2x.png"),
        action: "add",
      },
      {
        name: "批量管理",
        icon: "".concat(app.config.imgHost, "/img/customer/ic_piliangguanli@2x.png"),
        action: "more",
      },
      {
        name: "分类管理",
        icon: "".concat(app.config.imgHost, "/img/customer/ic_fenleiguanli@4.5x.png"),
        action: "type",
      },
    ],
    noColorCardBg: "".concat(app.config.imgHost, "/img/customer/img_wuxinx@3x.png"),
    shopId: "",
    isLoad: !1,
    colorCardList: [],
    colorCardCount: {
      on: "",
      off: "",
    },
    shareFriendData: {},
    popupInit: {
      canvasHeight2: 550,
      canvasHeight: 550,
      canvas: {
        show: !1,
        notice: !1,
        type: "",
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
    saleStatus: 1,
    filterKey: 0,
    isDone: !1,
    allowUpdate: !0,
    color_icon: "",
    icon: {
      search: "".concat(app.config.imgHost, "/img/v2.7.4/Icon_Nav_Search_Dark@2x.png"),
      pringRecode: "".concat(app.config.imgHost, "/img/v2.14.0/Icon_Print_Record@2x.png"),
      tips: "".concat(app.config.imgHost, "/img/v2.14.0/Tips_Close@2x.png"),
      def_img: "".concat(app.config.imgHost, "/img/customer/img_def.png"),
      color_def: "".concat(app.config.imgHost, "/img/customer/color_def.png"),
      color_def2: "".concat(app.config.imgHost, "/img/customer/color_def2.png"),
      color_icon: "".concat(app.config.imgHost, "/img/customer/color_icon.png"),
      save: "".concat(app.config.imgHost, "/img/customer/duibuIcon/icon/color_save.png"),
      set: "".concat(app.config.imgHost, "/img/customer/duibuIcon/icon/color_set.png"),
    },
    printType: null,
    shareColorList: [],
    swiper: {
      indicatorDots: !0,
      indicatorColor: "#D9D9D9",
      indicatorActiveColor: "#4177F5",
      autoplay: !1,
      circular: !0,
      indicatorcolor: "#000",
      duration: 150,
      current: 0,
    },
    settingAllHide: !1,
    hasDetailImage: !0,
    colorCardInfo: {
      imageTwo0: "",
      imageTwoBack0: "",
      clothImage1: "",
      clothImage2: "",
      color_def: "",
      setting: {
        showContacts: 1,
        showPrice: 1,
        showProductName: 1,
        showQrcode: 1,
        showRemark: 1,
      },
    },
    shareProdInfo: {
      setting: {
        showPrice: 1,
        showMaterial: 1,
        showProductName: 1,
        showQrcode: 1,
        showShelvesNumber: 1,
      },
    },
  },
  closeTips: function () {
    (this.setData({
      showTips: !1,
    }),
      wx.setStorageSync(u, "1"));
  },
  toSearch: function () {
    wx.navigateTo({
      url: "/pages/search/search?type=colorCard",
    });
  },
  toPringRecode: function () {
    (this.closeTips(),
      wx.navigateTo({
        url: "/pages/color-card-management/print-record/print-record",
      }));
  },
  getCardList: function () {
    var t = this,
      toConsumableArray = arguments.length > 0 && void 0 !== arguments[0] ? arguments[0] : "",
      a = !(arguments.length > 1 && void 0 !== arguments[1]) || arguments[1],
      o = arguments.length > 2 && void 0 !== arguments[2] && arguments[2];
    return (
      wx.showLoading({
        title: "拼命加载中...",
      }),
      new Promise(function (r, s) {
        var login = t.data,
          util = login.saleStatus,
          ServicesShop = login.filterKey,
          ServicesUserLog = login.pageNum,
          u = login.pageSize,
          f = login.colorCardList,
          m = {
            onSale: util,
            filterKey: ServicesShop,
            page: ServicesUserLog,
            size: u,
            searchFiled: toConsumableArray,
          };
        ServicesCard.colorCardList(m).then(function (e) {
          if (0 === e.code) {
            if (
              (t.setData({
                "colorCardCount.off": e.data.unSaleCount,
                "colorCardCount.on": e.data.saleCount,
                concats: e.data.concats,
                phone: e.data.phone,
              }),
              a)
            ) {
              var mta_analysis,
                login = createForOfIteratorHelper(e.data.content);
              try {
                for (login.s(); !(s = login.n()).done;) {
                  var ServicesCard = mta_analysis.value;
                  (1 == ServicesCard.onSale
                    ? (ServicesCard.onOrOff = {
                        name: "下架",
                        icon: "".concat(app.config.imgHost, "/img/v2.7.4/Icon_Off_Shelves@2x.png"),
                      })
                    : 0 == ServicesCard.onSale &&
                      (ServicesCard.onOrOff = {
                        name: "上架",
                        icon: "".concat(app.config.imgHost, "/img/v2.7.4/Icon_Shelves@2x.png"),
                      }),
                    e.data.totalPage >= ServicesUserLog && f.push(ServicesCard));
                }
              } catch (t) {
                login.e(t);
              } finally {
                login.f();
              }
            }
            (o && (f = e.data.content),
              t.setData({
                colorCardList: f,
                isLoad: !1,
              }),
              0 == e.data.content.length &&
                ServicesUserLog > 1 &&
                t.setData({
                  isDone: !0,
                }),
              r(e));
          } else
            (wx.showToast({
              title: e.msg,
              icon: "none",
            }),
              t.setData({
                isLoad: !1,
              }),
              r(e));
          (wx.removeStorageSync(w), wx.hideLoading());
        });
      })
    );
  },
  queryColorCardCount: function () {
    var t = this;
    return new Promise(function (e, a) {
      ServicesCard.queryColorCardCount().then(function (a) {
        0 === a.code
          ? (t.setData({
              "colorCardCount.off": a.data.offSaleCount,
              "colorCardCount.on": a.data.onSaleCount,
            }),
            e(a))
          : (wx.showToast({
              title: a.msg,
              icon: "none",
            }),
            e(a));
      });
    });
  },
  changeTab: function (t) {
    var toConsumableArray = t.detail.saleStatus;
    (this.setData({
      isLoad: !0,
      pageNum: 1,
      saleStatus: 1 === toConsumableArray ? 0 : 1,
      filterKey: 0,
      colorCardList: [],
      isDone: !1,
    }),
      wx.showLoading({
        title: "加载中",
      }),
      this.getCardList());
  },
  reset: function () {
    this.setData({
      filterKey: 0,
      pageNum: 1,
      colorCardList: [],
      isDone: !1,
    });
  },
  filterConfirm: function (t) {
    var toConsumableArray = t.detail.filterKey;
    (this.setData({
      filterKey: toConsumableArray,
      colorCardList: [],
      isLoad: !0,
      pageNum: 1,
      isDone: !1,
    }),
      wx.showLoading({
        title: "加载中",
      }),
      this.getCardList());
  },
  getPrintType: function () {
    var t = this;
    ServicesCard.newLabelPrint({}).then(function (e) {
      if (0 === e.code && null !== e.data) {
        var a = e.data.mpNewLabelPrint;
        t.setData({
          printType: a,
        });
      } else
        0 !== e.code &&
          wx.showToast({
            title: e.msg,
            icon: "none",
          });
    });
  },
  onOrOff: function (t) {
    var toConsumableArray = this,
      a = t.detail,
      o = a.goodsid,
      createForOfIteratorHelper = a.operateType,
      mta_analysis = a.idx,
      app = this.data.colorCardList,
      login = {
        I: {
          msg: "下架成功",
          method: ServicesCard.batchSetOffSale,
          logType: x,
        },
        C: {
          msg: "上架成功",
          method: ServicesCard.batchSetOnSale,
          logType: S,
        },
      }[createForOfIteratorHelper];
    if (login) {
      var util = {
        productIds: o.split(","),
        onSale: Number(createForOfIteratorHelper),
      };
      login.method(util).then(function (t) {
        0 === t.code
          ? (ServicesUserLog.setUserHandleLog(login.logType),
            app.splice(mta_analysis, 1),
            toConsumableArray.setData({
              colorCardList: app,
              "colorCardCount.off":
                createForOfIteratorHelper == I
                  ? toConsumableArray.data.colorCardCount.off + 1
                  : toConsumableArray.data.colorCardCount.off - 1,
              "colorCardCount.on":
                createForOfIteratorHelper == I
                  ? toConsumableArray.data.colorCardCount.on - 1
                  : toConsumableArray.data.colorCardCount.on + 1,
              pageNum: 1,
            }),
            toConsumableArray.getCardList("", !1, !0))
          : wx.showToast({
              title: t.msg,
              icon: "none",
            });
      });
    }
  },
  clearAddColorCardStorage: function () {
    [
      "goodsPriceJson",
      "sureCategoryGoodsList",
      "checkCategoryName",
      "colorColorList",
      "colorColorId",
      "unitName",
      "miniNum",
      "maxNum",
      "priceType",
      "checkColorItem",
      "commodityType",
      "bottomCardInfo",
      w,
    ].forEach(function (t) {
      return wx.removeStorageSync(t);
    });
  },
  toAddColorCard: function () {
    (this.clearAddColorCardStorage(),
      wx.navigateTo({
        url: "/pages/color-card-management/add-color-card/add-color-card?type=0",
      }));
  },
  footerBarTap: function (t) {
    var toConsumableArray = this,
      a = {
        add: function () {
          (toConsumableArray.clearAddColorCardStorage(),
            wx.navigateTo({
              url: "/pages/color-card-management/add-color-card/add-color-card?type=0",
            }));
        },
        more: function () {
          wx.navigateTo({
            url: "/pages/color-card-management/batch-management/batch-management?saleStatus=".concat(
              toConsumableArray.data.saleStatus,
            ),
          });
        },
        type: function () {
          wx.navigateTo({
            url: "/pages/color-card-management/type-management/type-management",
          });
        },
      }[t.currentTarget.dataset.action];
    a && a();
  },
  closePopup: function () {
    this.setData({
      "popupInit.canvas.show": !1,
      "popupInit.canvas.type": "",
      shareColorList: [],
    });
  },
  doNothing: function () {},
  formatPrice: function (t) {
    var toConsumableArray = arguments.length > 1 && void 0 !== arguments[1] ? arguments[1] : "";
    return t && 0 != t && "0.0" != t
      ? toConsumableArray
        ? "¥ ".concat(t, "/").concat(toConsumableArray)
        : "¥ ".concat(t)
      : "面议";
  },
  truncateString: function (t, e) {
    var a = arguments.length > 2 && void 0 !== arguments[2] ? arguments[2] : "...";
    return !t || t.length <= e ? t : t.substring(0, e) + a;
  },
  colorSetting: function () {
    "colorCard" === this.data.popupInit.canvas.type
      ? ((this.data.colorCardInfo.setting.price = this.data.shareFriendData.price),
        (this.data.colorCardInfo.setting.unit = this.data.shareFriendData.unit),
        wx.navigateTo({
          url: "/pages/color-card-management/color-card-setting/color-card-setting",
        }))
      : wx.navigateTo({
          url: "/pages/color-card-management/product-share-setting/product-share-setting",
        });
  },
  getQRCode: function (t) {
    var toConsumableArray = this;
    return new Promise(function (a, o) {
      var r = {
        productId: t,
        companyId: app.globalData.userInfo.companyId,
        envVersion: app.envVersion,
      };
      ServicesCard.getQRcode(r).then(function (t) {
        if (0 === t.code) {
          var o = t.data;
          wx.getImageInfo({
            src: o,
            success: function (t) {
              (console.log("res3", t),
                toConsumableArray.setData({
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
      var o = util.replImage(t.data.shareProdInfo.mainImgPath) || t.data.icon.def_img;
      wx.getImageInfo({
        src: o,
        success: function (a) {
          "getImageInfo:ok" === a.errMsg
            ? (t.setData({
                "tempImgUrl.goodUrl": a.path,
              }),
              e())
            : (e(
                t.getImageInfo(
                  "".concat(app.config.imgHost, "/img/customer/share-product-bg-n.png"),
                ),
              ),
              wx.hideLoading());
        },
      });
    });
  },
  shareM: async function () {
    (toConsumableArray.setData({
      shareFriendData: t.detail,
      "popupInit.canvas.type": "",
    }),
      wx.showLoading({
        title: "正在生成图片...",
        mask: !0,
      }),
      ServicesCard.shareProductDetails({
        productId: t.detail.goodsid,
      }).then(function (r) {
        0 === r.code &&
          ((r.data.setting.productId = t.detail.goodsid),
          toConsumableArray.setData({
            shareProdInfo: r.data,
          }),
          Promise.all([
            toConsumableArray.getCanvasImg(),
            toConsumableArray.getQRCode(t.detail.goodsid),
          ]).then(
            o(
              a().mark(function t() {
                var o, r, createForOfIteratorHelper, mta_analysis;
                return a().wrap(function (t) {
                  for (;;)
                    switch ((t.prev = t.next)) {
                      case 0:
                        return (
                          (o = toConsumableArray.data.popupInit.canvas.canvasId.shareCanvas),
                          (r = toConsumableArray.data.popupInit.canvas.canvasId.photoCanvas),
                          (n = wx.createCanvasContext(o)),
                          (s = wx.createCanvasContext(r)),
                          (t.next = 1),
                          toConsumableArray.drawProdShare(createForOfIteratorHelper, 1)
                        );
                      case 1:
                        return ((t.next = 2), toConsumableArray.drawProdShare(mta_analysis, 2));
                      case 2:
                        (toConsumableArray.setData({
                          "popupInit.canvas.show": !0,
                          "popupInit.canvas.notice": !0,
                        }),
                          wx.hideLoading());
                      case 3:
                      case "end":
                        return t.stop();
                    }
                }, t);
              }),
            ),
          ));
      }),
      ServicesShop.operateAccess({
        type: "101",
      }),
      ServicesUserLog.setUserHandleLog(v));
  },
  drawProdShare: function (t) {
    var toConsumableArray = arguments.length > 1 && void 0 !== arguments[1] ? arguments[1] : 1,
      a = this.data.shareProdInfo.setting,
      o =
        (1 === a.showProductName ? this.data.shareProdInfo.businessProductName : "") +
        (1 === a.showShelvesNumber
          ? ""
              .concat(1 === a.showProductName && this.data.shareProdInfo.spuNumber ? "-" : "")
              .concat(this.data.shareProdInfo.spuNumber)
          : ""),
      r = this.formatPrice(this.data.shareProdInfo.price),
      createForOfIteratorHelper = this.data.tempImgUrl.goodUrl,
      mta_analysis = this.data.tempImgUrl.qrUrl,
      app = this.data.shareProdInfo.material;
    (t.setFillStyle("white"),
      this.roundRect(
        t,
        0 * toConsumableArray,
        0 * toConsumableArray,
        300 * toConsumableArray,
        450 * toConsumableArray,
        8 * toConsumableArray,
        "#ffffff",
      ),
      this.drawProdImage(
        t,
        0 * toConsumableArray,
        0 * toConsumableArray,
        300 * toConsumableArray,
        300 * toConsumableArray,
        8 * toConsumableArray,
        createForOfIteratorHelper,
        "top",
      ),
      1 === a.showQrcode &&
        (t.drawImage(
          mta_analysis,
          190 * toConsumableArray,
          300 * toConsumableArray,
          100 * toConsumableArray,
          100 * toConsumableArray,
        ),
        t.setFontSize(10 * toConsumableArray),
        t.setFillStyle("#333333"),
        t.setTextAlign("center"),
        t.fillText("长按识别", 238 * toConsumableArray, 418 * toConsumableArray),
        t.setFontSize(10 * toConsumableArray),
        t.setFillStyle("#333333"),
        t.setTextAlign("center"),
        t.fillText("查看更多商品", 238 * toConsumableArray, 435 * toConsumableArray)));
    var login = o.length > 13 ? o.substring(0, 13) : o;
    if (o.length > 13) {
      c = o.substring(0, 13);
      var ServicesCard = o.substring(13, o.length),
        util = ServicesCard.length > 11 ? ServicesCard.substring(0, 11) + "..." : ServicesCard;
      (t.setFontSize(14 * toConsumableArray),
        t.setFillStyle("#000000"),
        t.setTextAlign("left"),
        t.fillText(util, 15 * toConsumableArray, 340 * toConsumableArray));
    }
    if (
      (t.setFontSize(14 * toConsumableArray),
      t.setFillStyle("#000000"),
      t.setTextAlign("left"),
      t.fillText(login, 15 * toConsumableArray, 320 * toConsumableArray),
      1 === a.showPrice &&
        (t.setFontSize(18 * toConsumableArray),
        t.setFillStyle("#ff0000"),
        t.setTextAlign("left"),
        t.fillText(r, 15 * toConsumableArray, 385 * toConsumableArray)),
      1 === a.showMaterial)
    ) {
      var ServicesShop = app.length > 13 ? app.substring(0, 13) + "..." : app;
      (t.setFontSize(14 * toConsumableArray),
        t.setFillStyle("#666666"),
        t.setTextAlign("left"),
        t.fillText(ServicesShop, 15 * toConsumableArray, 425 * toConsumableArray));
    }
    (t.stroke(), t.draw());
  },
  getColorCardImg: function (t) {
    var toConsumableArray = this;
    return new Promise(function (a, o) {
      var createForOfIteratorHelper = "";
      if (t.includes("clothImage")) {
        var mta_analysis = toConsumableArray.data.colorCardInfo.imageInfoList
          ? toConsumableArray.data.colorCardInfo.imageInfoList.slice(0, 2)
          : [];
        mta_analysis &&
          mta_analysis.length &&
          (mta_analysis[0] &&
            mta_analysis[0].storagePath &&
            "clothImage1" === t &&
            (n = util.replImage(mta_analysis[0].storagePath)),
          mta_analysis[1] &&
            mta_analysis[1].storagePath &&
            "clothImage2" === t &&
            (n = util.replImage(mta_analysis[1].storagePath)));
      } else
        n =
          (toConsumableArray.data.colorCardInfo.detailImage &&
            util.replImage(toConsumableArray.data.colorCardInfo.detailImage[t])) ||
          toConsumableArray.data.icon.def_img;
      ("color_def" === t && (n = toConsumableArray.data.icon.color_def),
        "color_def2" === t && (n = toConsumableArray.data.icon.color_def2),
        createForOfIteratorHelper || (n = toConsumableArray.data.icon.def_img),
        wx.getImageInfo({
          src: createForOfIteratorHelper,
          success: function (o) {
            if ("getImageInfo:ok" === o.errMsg) {
              console.log(o.path);
              var createForOfIteratorHelper = "colorCardInfo." + t;
              (toConsumableArray.setData({
                createForOfIteratorHelper: o.path,
              }),
                a());
            } else (a(toConsumableArray.data.icon.def_img), wx.hideLoading());
          },
        }));
    });
  },
  isSettingHide: function (t) {
    var toConsumableArray = t.showContacts,
      a = t.showPrice,
      o = t.showProductName,
      r = t.showQrcode,
      createForOfIteratorHelper = t.showRemark,
      mta_analysis = t.showClothEnough,
      app = t.showClothWidth,
      login = t.showGramWeight,
      ServicesCard = t.showMaterial,
      util = t.showShelvesNumber,
      ServicesShop = !(
        0 !== toConsumableArray ||
        0 !== a ||
        0 !== o ||
        0 !== util ||
        0 !== r ||
        0 !== createForOfIteratorHelper ||
        0 !== mta_analysis ||
        0 !== app ||
        0 !== login ||
        0 !== ServicesCard
      );
    this.setData({
      settingAllHide: ServicesShop,
    });
  },
  getCanvasColorImg: function (t) {
    return new Promise(function (e, a) {
      wx.getImageInfo({
        src: t,
        success: function (t) {
          "getImageInfo:ok" === t.errMsg ? e(t.path) : e("");
        },
      });
    });
  },
  shareColorCard: function (t) {
    var a = this;
    (this.setData({
      shareFriendData: t.detail,
      "popupInit.canvas.type": "colorCard",
      shareColorList: [],
    }),
      wx.showLoading({
        title: "正在生成图片...",
        mask: !0,
      }),
      ServicesCard.colorCardDetails({
        productId: t.detail.goodsid,
      }).then(function (o) {
        if (0 === o.code) {
          ((o.data.setting.productId = t.detail.goodsid), a.isSettingHide(o.data.setting));
          var r = o.data.colorList || [];
          ((a.data.shareColorList = r),
            (o.data.setting.colorValCount = r.filter(function (t) {
              return t.colorValue;
            }).length));
          var createForOfIteratorHelper = o.data.setting.shape,
            mta_analysis = 0 === o.data.setting.showImageTwo ? 130 : 0,
            app = 0 === o.data.setting.showRemark ? 20 : 0,
            login = a.data.shareColorList.filter(function (t) {
              return t.colorImagePath;
            }),
            ServicesCard =
              Math.ceil(a.data.shareColorList.length / 4) *
                (2 === createForOfIteratorHelper ? 120 : 82) +
              355 +
              (login.length / 4) * 8 -
              mta_analysis -
              app -
              (a.data.settingAllHide ? 140 : 0);
          (console.log("shareColorList", a.data.shareColorList),
            console.log("length", a.data.shareColorList.length));
          var util = Math.ceil(Number(a.data.shareColorList.length) / 4);
          console.log("一共多少行色块", util);
          var ServicesShop = 320 + 90 * util + 50;
          (console.log("真实高度", ServicesShop),
            console.log("_height", ServicesCard),
            console.log(
              "录得高度",
              ServicesCard < 550 ? (login.length > 8 ? 650 : 550) : ServicesCard,
            ),
            a.setData({
              shareColorList: a.data.shareColorList,
              colorCardInfo: o.data,
              "popupInit.canvasHeight": ServicesCard < 550 ? 650 : ServicesShop,
              "popupInit.canvasHeight2": ServicesCard < 550 ? 1050 : 2 * ServicesCard,
            }),
            wx.setStorageSync(f, o.data.setting));
          var ServicesUserLog = [
            a.getColorCardImg("color_def"),
            a.getColorCardImg("color_def2"),
            a.getQRCode(t.detail.goodsid),
          ];
          if (1 === o.data.setting.showImageTwo) {
            var u = [a.getColorCardImg("imageTwo0"), a.getColorCardImg("imageTwoBack0")];
            h = [].concat(toConsumableArray(ServicesUserLog), u);
          }
          if (0 === o.data.setting.showImageTwo) {
            var m = [a.getColorCardImg("clothImage1"), a.getColorCardImg("clothImage2")];
            h = [].concat(toConsumableArray(ServicesUserLog), m);
          }
          Promise.all(ServicesUserLog).then(function () {
            a.drawShareImg(a.data.shareColorList, 0);
          });
        } else
          wx.showToast({
            title: o.msg,
            icon: "none",
          });
      }),
      ServicesShop.operateAccess({
        type: "101",
      }),
      ServicesUserLog.setUserHandleLog(v));
  },
  drawShareImg: function (t, e) {
    var r = this;
    return o(
      a().mark(function o() {
        var createForOfIteratorHelper, mta_analysis, app, login;
        return a().wrap(function (a) {
          for (;;)
            switch ((a.prev = a.next)) {
              case 0:
                return (
                  (n = r.data.popupInit.canvas.canvasId.shareCanvas + e),
                  (s = r.data.popupInit.canvas.canvasId.photoCanvas + e),
                  (i = wx.createCanvasContext(createForOfIteratorHelper)),
                  (c = wx.createCanvasContext(mta_analysis)),
                  (a.next = 1),
                  r.drawColorShare(app, t, 1)
                );
              case 1:
                return ((a.next = 2), r.drawColorShare(login, t, 2));
              case 2:
                (r.setData({
                  "popupInit.canvas.show": !0,
                  "popupInit.canvas.notice": !0,
                }),
                  wx.hideLoading());
              case 3:
              case "end":
                return a.stop();
            }
        }, o);
      }),
    )();
  },
  drawColorShare: function (t, e) {
    var r = arguments,
      createForOfIteratorHelper = this;
    return o(
      a().mark(function o() {
        var mta_analysis,
          app,
          login,
          ServicesCard,
          ServicesShop,
          ServicesUserLog,
          u,
          f,
          m,
          p,
          w,
          I,
          C,
          v,
          x,
          S,
          T,
          P,
          y,
          L,
          b,
          A,
          F,
          D,
          _,
          M,
          N,
          k,
          H,
          U,
          z,
          R,
          q,
          O,
          B,
          Q,
          V,
          j,
          K,
          W,
          E,
          G,
          J,
          X,
          Y,
          Z,
          $,
          tt,
          et,
          at;
        return a().wrap(function (a) {
          for (;;)
            switch ((a.prev = a.next)) {
              case 0:
                ((s = r.length > 2 && void 0 !== r[2] ? r[2] : 1),
                  (i = createForOfIteratorHelper.data.colorCardInfo),
                  (c = app.businessProductName),
                  (l = app.companyName),
                  (g = app.price),
                  (h = app.priceUnit),
                  (u = app.imageTwo0),
                  (f = app.imageTwoBack0),
                  (m = app.clothImage1),
                  (p = app.clothImage2),
                  (w = app.concats),
                  (I = app.phone),
                  (C = app.material),
                  (v = app.clothEnough),
                  (x = app.clothWidth),
                  (S = app.gramWeight),
                  (T = app.shelvesNumber),
                  (P = login || "-"),
                  (y = createForOfIteratorHelper.truncateString(ServicesCard || "-", 17)),
                  (L = T || "-"),
                  (b = createForOfIteratorHelper.formatPrice(ServicesShop, ServicesUserLog)),
                  (A = createForOfIteratorHelper.data.colorCardInfo.remark || ""),
                  (F = createForOfIteratorHelper.data.tempImgUrl.qrUrl),
                  (D = u),
                  (_ = f),
                  (M = m),
                  (N = p),
                  (k = createForOfIteratorHelper.data.colorCardInfo.color_def),
                  (H = createForOfIteratorHelper.data.colorCardInfo.color_def2),
                  (U = createForOfIteratorHelper.truncateString(w, 10)),
                  (z = I || ""),
                  (R = "克重：" + (S || "-")),
                  (q = "幅宽：" + (x || "-")),
                  (O = "空差：" + (v || "-")),
                  (B = createForOfIteratorHelper.data.colorCardInfo.setting),
                  (Q = createForOfIteratorHelper.data.settingAllHide ? 140 * mta_analysis : 0),
                  t.setFillStyle("white"),
                  createForOfIteratorHelper.roundRect(
                    t,
                    0 * mta_analysis,
                    0 * mta_analysis,
                    305 * mta_analysis,
                    createForOfIteratorHelper.data.popupInit.canvasHeight * mta_analysis,
                    8,
                    "#ffffff",
                  ),
                  t.setFillStyle("#000000"),
                  (t.font = "normal bold ".concat(16 * mta_analysis, "px Arial, sans-serif")),
                  t.setTextAlign("center"),
                  t.fillText(y, 155 * mta_analysis, 30 * mta_analysis),
                  1 === B.showQrcode &&
                    t.drawImage(
                      F,
                      210 * mta_analysis,
                      62 * mta_analysis,
                      80 * mta_analysis,
                      80 * mta_analysis,
                    ),
                  1 === B.showProductName &&
                    (t.setFontSize(14 * mta_analysis),
                    t.setFillStyle("#000000"),
                    (t.font = "normal 400 ".concat(14 * mta_analysis, "px Arial, sans-serif")),
                    t.setTextAlign("left"),
                    t.fillText(
                      P.length > 19 ? P.substring(0, 19) + "..." : P,
                      20 * mta_analysis,
                      55 * mta_analysis,
                    )),
                  1 === B.showShelvesNumber &&
                    (t.setFillStyle("#000000"),
                    (t.font = "normal bold ".concat(14 * mta_analysis, "px Arial, sans-serif")),
                    t.setTextAlign("left"),
                    t.fillText(L, 20 * mta_analysis, 75 * mta_analysis)),
                  1 === B.showPrice &&
                    (t.setFillStyle("#FF2332"),
                    (t.font = "normal bold ".concat(14 * mta_analysis, "px Arial, sans-serif")),
                    t.setTextAlign("left"),
                    t.fillText(b, 20 * mta_analysis, 95 * mta_analysis)),
                  1 === B.showMaterial &&
                    ((j = (V = "成分：" + (C || "-")).length > 15 ? V.substring(0, 15) : V),
                    (K = V.length > 15 ? V.substring(15, 28) + "..." : ""),
                    t.setFillStyle("#808080"),
                    (t.font = "normal 400 ".concat(14 * mta_analysis, "px Arial, sans-serif")),
                    t.setTextAlign("left"),
                    t.fillText(j, 20 * mta_analysis, 115 * mta_analysis),
                    "" != K &&
                      (t.setFillStyle("#808080"),
                      (t.font = "normal 400 ".concat(14 * mta_analysis, "px Arial, sans-serif")),
                      t.setTextAlign("left"),
                      t.fillText(K, 20 * mta_analysis, 131 * mta_analysis))),
                  1 === B.showGramWeight &&
                    (t.setFontSize(14),
                    t.setFillStyle("#808080"),
                    (t.font = "normal 400 ".concat(14 * mta_analysis, "px Arial, sans-serif")),
                    t.setTextAlign("left"),
                    t.fillText(R, 20 * mta_analysis, 147 * mta_analysis)),
                  1 === B.showClothWidth &&
                    (t.setFontSize(14),
                    t.setFillStyle("#808080"),
                    (t.font = "normal 400 ".concat(14 * mta_analysis, "px Arial, sans-serif")),
                    t.setTextAlign("left"),
                    t.fillText(q, 20 * mta_analysis, 166 * mta_analysis)),
                  1 === B.showClothEnough &&
                    (t.setFontSize(14),
                    t.setFillStyle("#808080"),
                    (t.font = "normal 400 ".concat(14 * mta_analysis, "px Arial, sans-serif")),
                    t.setTextAlign("left"),
                    t.fillText(O, 20 * mta_analysis, 185 * mta_analysis)),
                  1 === B.showRemark &&
                    (t.setFontSize(12 * mta_analysis),
                    t.setFillStyle("#c1c1c1"),
                    t.setTextAlign("left"),
                    t.fillText(
                      A && A.length < 20 ? A : A.substring(0, 20),
                      20 * mta_analysis,
                      210 * mta_analysis,
                    ),
                    A.length > 20 &&
                      (t.setFontSize(12 * mta_analysis),
                      t.setFillStyle("#c1c1c1"),
                      t.setTextAlign("left"),
                      t.fillText(
                        A.substring(20, A.length),
                        20 * mta_analysis,
                        215 * mta_analysis,
                      ))),
                  1 === B.showContacts &&
                    (t.setFontSize(12 * mta_analysis),
                    t.setFillStyle("#808080"),
                    t.setTextAlign("right"),
                    (t.font = "normal 400 ".concat(12 * mta_analysis, "px Arial, sans-serif")),
                    t.fillText(U, 290 * mta_analysis, 160 * mta_analysis),
                    t.setFontSize(12 * mta_analysis),
                    t.setFillStyle("#808080"),
                    t.setTextAlign("right"),
                    (t.font = "normal 400 ".concat(12 * mta_analysis, "px Arial, sans-serif")),
                    t.fillText(z, 290 * mta_analysis, 175 * mta_analysis)),
                  (W = 0 === B.showRemark ? 200 : 230),
                  B.showImageTwo >= 0 &&
                    (createForOfIteratorHelper.drawProdImage(
                      t,
                      16 * mta_analysis,
                      W * mta_analysis - Q,
                      131 * mta_analysis,
                      102 * mta_analysis,
                      4 * mta_analysis,
                      1 === B.showImageTwo ? D : M,
                    ),
                    (t.globalAlpha = 0.3),
                    (t.globalAlpha = 1),
                    t.setFontSize(10 * mta_analysis),
                    t.setFillStyle("#000000"),
                    t.setTextAlign("center"),
                    t.fillText(
                      "".concat(1 === B.showImageTwo ? "正面细节图" : ""),
                      80 * mta_analysis,
                      (W + 117) * mta_analysis - Q,
                    ),
                    createForOfIteratorHelper.drawProdImage(
                      t,
                      160 * mta_analysis,
                      W * mta_analysis - Q,
                      131 * mta_analysis,
                      102 * mta_analysis,
                      4 * mta_analysis,
                      1 === B.showImageTwo ? _ : N,
                    ),
                    (t.globalAlpha = 0.3),
                    (t.globalAlpha = 1),
                    t.setFontSize(10 * mta_analysis),
                    t.setFillStyle("#000000"),
                    t.setTextAlign("center"),
                    t.fillText(
                      "".concat(1 === B.showImageTwo ? "背面细节图" : ""),
                      225 * mta_analysis,
                      (W + 117) * mta_analysis - Q,
                    )),
                  (E = 1),
                  (G = -56 * mta_analysis),
                  (J = 0),
                  (X = 0),
                  (Y = 0 === B.showRemark ? 30 : 0),
                  (Z = 0));
              case 1:
                if (!(Z < e.length)) {
                  a.next = 5;
                  break;
                }
                if (
                  (($ = e[Z]),
                  (G += (71 + (2 === B.shape ? 3 : 0)) * mta_analysis),
                  (J =
                    E * (82 * mta_analysis + (2 === B.shape ? 10 * mta_analysis : 0)) +
                    ((2 === B.shape ? 265 * mta_analysis - X - Y : 275 * mta_analysis - X - Y) -
                      Q)),
                  (tt = $.colorVal || ""),
                  (et = $.colorName || ""),
                  $.colorImagePath)
                ) {
                  a.next = 2;
                  break;
                }
                (2 === B.shape
                  ? $.colorValue
                    ? createForOfIteratorHelper.roundRect(
                        t,
                        G,
                        J,
                        48 * mta_analysis,
                        48 * mta_analysis,
                        24 * mta_analysis,
                        $.colorValue || "",
                      )
                    : createForOfIteratorHelper.drawProdImage(
                        t,
                        G,
                        J,
                        48 * mta_analysis,
                        48 * mta_analysis,
                        24 * mta_analysis,
                        H,
                      )
                  : $.colorValue
                    ? createForOfIteratorHelper.roundRect(
                        t,
                        G,
                        J,
                        62 * mta_analysis,
                        38 * mta_analysis,
                        4 * mta_analysis,
                        $.colorValue || "",
                      )
                    : createForOfIteratorHelper.drawProdImage(
                        t,
                        G,
                        J,
                        62 * mta_analysis,
                        38 * mta_analysis,
                        4 * mta_analysis,
                        k,
                      ),
                  (at = createForOfIteratorHelper.data.color_icon),
                  createForOfIteratorHelper.drawProdImage(
                    t,
                    G +
                      30 * mta_analysis +
                      (2 === B.shape ? -8 * mta_analysis : 0) -
                      (3 * tt.length + 9) * mta_analysis,
                    J + 44 * mta_analysis + (2 === B.shape ? 8 * mta_analysis : 0),
                    10 * mta_analysis,
                    10 * mta_analysis,
                    0 * mta_analysis,
                    at,
                  ),
                  (a.next = 3));
                break;
              case 2:
                return (
                  (a.next = 3),
                  createForOfIteratorHelper
                    .getCanvasColorImg(util.replImage($.colorImagePath, 122))
                    .then(function (e) {
                      2 === B.shape
                        ? createForOfIteratorHelper.drawProdImage(
                            t,
                            G - 6,
                            J,
                            60 * mta_analysis,
                            60 * mta_analysis,
                            30 * mta_analysis,
                            e,
                          )
                        : createForOfIteratorHelper.drawProdImage(
                            t,
                            G,
                            J,
                            62 * mta_analysis,
                            41 * mta_analysis,
                            4 * mta_analysis,
                            e,
                          );
                    })
                );
              case 3:
                (t.setFontSize(10 * mta_analysis),
                  t.setFillStyle("#333333"),
                  t.setTextAlign("center"),
                  t.fillText(
                    tt,
                    G + 30 * mta_analysis + (2 === B.shape ? -8 * mta_analysis : 0),
                    J +
                      52 * mta_analysis +
                      (2 === B.shape
                        ? $.colorImagePath
                          ? 18 * mta_analysis
                          : 8 * mta_analysis
                        : 0),
                  ),
                  t.setFontSize(10 * mta_analysis),
                  t.setFillStyle("#333333"),
                  t.setTextAlign("center"),
                  t.fillText(
                    et,
                    G + 30 * mta_analysis + (2 === B.shape ? -8 * mta_analysis : 0),
                    J +
                      64 * mta_analysis +
                      (2 === B.shape
                        ? $.colorImagePath
                          ? 18 * mta_analysis
                          : 8 * mta_analysis
                        : 0),
                  ),
                  (Z + 1) % 4 == 0 && ((E += 1), (G = -56 * mta_analysis)));
              case 4:
                (Z++, (a.next = 1));
                break;
              case 5:
                ("秉羲工作台·技术支持",
                  t.setFontSize(10 * mta_analysis),
                  t.setFillStyle("#d8d8d8"),
                  t.setTextAlign("center"),
                  t.fillText(
                    "秉羲工作台·技术支持",
                    160 * mta_analysis,
                    createForOfIteratorHelper.data.popupInit.canvasHeight * mta_analysis - 10,
                  ),
                  t.stroke(),
                  t.draw());
              case 6:
              case "end":
                return a.stop();
            }
        }, o);
      }),
    )();
  },
  drawProdImage: function (t, e, a, o, r, n, s, i) {
    s &&
      (t.save(),
      t.beginPath(),
      "top" === i
        ? (t.arc(e + n, a + n, n, Math.PI, 1.5 * Math.PI),
          t.arc(e + o - n, a + n, n, 1.5 * Math.PI, 2 * Math.PI),
          t.arc(e + o - n, a + r - n, n, 0, 0),
          t.arc(e + n, a + r - n, n, Math.PI, Math.PI))
        : (t.arc(e + n, a + n, n, Math.PI, 1.5 * Math.PI),
          t.arc(e + o - n, a + n, n, 1.5 * Math.PI, 2 * Math.PI),
          t.arc(e + o - n, a + r - n, n, 0, 0.5 * Math.PI),
          t.arc(e + n, a + r - n, n, 0.5 * Math.PI, Math.PI)),
      t.clip(),
      t.drawImage(s, e, a, o, r),
      t.restore(),
      (t.strokeStyle = "#fff"));
  },
  roundRect: function (t, e, a, o, r, n, s) {
    (t.setLineDash(),
      t.beginPath(),
      t.setFillStyle(s),
      t.setStrokeStyle("#ffffff"),
      t.arc(e + n, a + n, n, Math.PI, 1.5 * Math.PI),
      t.arc(e + o - n, a + n, n, 1.5 * Math.PI, 2 * Math.PI),
      t.arc(e + o - n, a + r - n, n, 0, 0.5 * Math.PI),
      t.arc(e + n, a + r - n, n, 0.5 * Math.PI, Math.PI),
      t.lineTo(e, a + n),
      t.fill(),
      t.stroke(),
      t.closePath());
  },
  saveColorCardImg: function () {
    "colorCard" === this.data.popupInit.canvas.type
      ? this.saveCanvas(0)
      : this.saveCanvas({
          type: "prod",
        });
  },
  saveCanvas: function (t) {
    var toConsumableArray = this;
    return o(
      a().mark(function o() {
        var r, createForOfIteratorHelper, mta_analysis;
        return a().wrap(function (a) {
          for (;;)
            switch ((a.prev = a.next)) {
              case 0:
                ((r = toConsumableArray),
                  (n = ""),
                  (n =
                    null == t || t.type
                      ? toConsumableArray.data.popupInit.canvas.canvasId.shareCanvas
                      : toConsumableArray.data.popupInit.canvas.canvasId.shareCanvas + t),
                  wx.showLoading({
                    title: "正在保存图片...",
                    mask: !0,
                  }),
                  (s = setTimeout(function () {
                    wx.canvasToTempFilePath(
                      {
                        x: 0,
                        y: 0,
                        canvasId: createForOfIteratorHelper,
                        success: function (t) {
                          (wx.hideLoading(),
                            wx.saveImageToPhotosAlbum({
                              filePath: t.tempFilePath,
                              success: function () {
                                (wx.showToast({
                                  title: "图片已保存到相册",
                                  icon: "success",
                                }),
                                  toConsumableArray.closePopup());
                              },
                              fail: function (t) {
                                "saveImageToPhotosAlbum:fail auth deny" === t.errMsg &&
                                  wx.showModal({
                                    title: "提示",
                                    content: "您拒绝了保存权限，请打开保存权限",
                                    success: function (t) {
                                      t.confirm &&
                                        wx.openSetting({
                                          success: function (t) {
                                            t.authSetting = {
                                              "scope.writePhotosAlbum": !0,
                                            };
                                          },
                                          fail: function () {
                                            toConsumableArray.setData({
                                              showAuth: !0,
                                            });
                                          },
                                        });
                                    },
                                  });
                              },
                            }),
                            clearTimeout(mta_analysis));
                        },
                      },
                      r,
                    );
                  }, 1e3)));
              case 1:
              case "end":
                return a.stop();
            }
        }, o);
      }),
    )();
  },
  isUpdate: function (t) {
    var toConsumableArray = this;
    if ("string" == typeof t) {
      var a = JSON.parse(t);
      (this.data.colorCardList.forEach(function (t, o) {
        t.id === a.id &&
          (toConsumableArray.data.colorCardList[o] = Object.assign(
            toConsumableArray.data.colorCardList[o],
            a,
          ));
      }),
        this.setData({
          colorCardList: this.data.colorCardList,
        }));
    }
  },
  deleteItem: function () {
    (wx.hideShareMenu(),
      wx.showLoading({
        title: "加载中",
      }),
      this.setData({
        colorCardList: [],
        pageNum: 1,
        isDone: !1,
      }),
      Promise.all([this.getCardList()]).then(function () {
        (wx.removeStorageSync(w), wx.hideLoading());
      }));
  },
  footerBarAuth: function () {
    if (!this.data.userAuthList["goods:add"]) {
      var t = this.data.footerBar.filter(function (t) {
        return "新增面料" !== t.name;
      });
      this.setData({
        footerBar: t,
      });
    }
  },
  onLoad: function (t) {
    (mta_analysis.default.Page.init(),
      login.getUserInfo(),
      this.setData({
        userAuthList: app.userAuthList,
      }),
      wx.hideShareMenu(),
      wx.getStorageSync(u) ||
        this.setData({
          showTips: !0,
        }),
      this.initMeth());
  },
  initMeth: function () {
    var t = this;
    (this.footerBarAuth(),
      this.getPrintType(),
      this.getCardList(),
      wx.getImageInfo({
        src: this.data.icon.color_icon,
        success: function (e) {
          "getImageInfo:ok" === e.errMsg &&
            (console.log(e.path),
            t.setData({
              color_icon: e.path,
            }));
        },
      }));
  },
  onReady: function () {},
  onUnload: function () {
    (wx.removeStorageSync(m), wx.removeStorageSync(p));
  },
  onShow: function () {
    var t = wx.getStorageSync(m),
      toConsumableArray = wx.getStorageSync(p);
    (t &&
      (this.closePopup(),
      this.shareColorCard({
        detail: {
          goodsid: t,
        },
      }),
      wx.removeStorageSync(m)),
      toConsumableArray &&
        (this.shareM({
          detail: {
            goodsid: toConsumableArray,
          },
        }),
        wx.removeStorageSync(p)));
    var a = wx.getStorageSync(f);
    a &&
      this.setData({
        "colorCardInfo.setting": a,
        "shareProdInfo.setting": a,
      });
  },
  onReachBottom: function () {
    var t = this.data,
      toConsumableArray = t.pageNum;
    t.isDone
      ? wx.showToast({
          title: "数据已全部加载完毕",
          icon: "none",
        })
      : (this.setData({
          pageNum: toConsumableArray + 1,
        }),
        this.getCardList());
  },
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
