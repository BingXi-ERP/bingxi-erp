var t = require("../../@babel/runtime/helpers/interopRequireDefault").default,
  e = require("../../@babel/runtime/helpers/regeneratorRuntime"),
  a = require("../../@babel/runtime/helpers/asyncToGenerator"),
  toConsumableArray = require("../../@babel/runtime/helpers/toConsumableArray"),
  s = require("../../@babel/runtime/helpers/defineProperty");
require("../../@babel/runtime/helpers/Arrayincludes");
var objectSpread2 = require("../../@babel/runtime/helpers/objectSpread2"),
  createForOfIteratorHelper = require("../../@babel/runtime/helpers/createForOfIteratorHelper"),
  ServicesUserLog = require("../../libs/services/ServicesUserLog.js"),
  mta_analysis = t(require("../../utils/mta_analysis.js")),
  app = getApp(),
  ServicesCustomer = require("../../libs/services/ServicesCustomer.js").servicesCustomer,
  ServicesCard = require("../../libs/services/ServicesCard.js").servicesCard,
  releaseCargoPass = require("../../libs/services/releaseCargoPass.js").servicesCargoPass,
  util = require("../../libs/utils/util.js").utils,
  f = getCurrentPages();
f[f.length - 2];
Page({
  data: {
    input: {
      placeholder: "",
      value: "",
    },
    color_icon: "",
    icon: {
      noData: "".concat(app.config.imgHost, "/img/customer/img_wuxinx@3x.png"),
      del: "".concat(app.config.imgHost, "/img/customer/icon_trash.png"),
      def_img: "".concat(app.config.imgHost, "/img/customer/img_def.png"),
      color_def: "".concat(app.config.imgHost, "/img/customer/color_def.png"),
      color_def2: "".concat(app.config.imgHost, "/img/customer/color_def2.png"),
      color_icon: "".concat(app.config.imgHost, "/img/customer/color_icon.png"),
      save: "".concat(app.config.imgHost, "/img/customer/duibuIcon/icon/color_save.png"),
      set: "".concat(app.config.imgHost, "/img/customer/duibuIcon/icon/color_set.png"),
    },
    noData: !1,
    searchType: "",
    customerList: [],
    cargoPassList: [],
    colorCardList: [],
    historyList: [],
    pageNum: 1,
    pageSize: 15,
    isDone: !1,
    shareFriendData: {},
    popupInit: {
      canvasHeight2: 550,
      canvasHeight: 550,
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
    shareColorList: [],
    swiper: {
      indicatorDots: !0,
      indicatorColor: "#D9D9D9",
      indicatorActiveColor: "#4177F5",
      autoplay: !1,
      circular: !0,
      indicatorcolor: "#000",
      duration: 500,
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
    searchRange: [
      {
        label: "底卡",
        checked: !1,
        prop: "isBottomCard",
      },
    ],
    searchRangeMap: {},
  },
  getValue: function (t) {
    var e = t.detail.value;
    ("" == e &&
      this.setData({
        cargoPassList: [],
        customerList: [],
        colorCardList: [],
        noData: !1,
      }),
      this.setData({
        "input.value": e,
      }));
  },
  delHistory: function () {
    ("cargoPass" === this.data.searchType
      ? wx.removeStorageSync(app.environment + "searchListCargo")
      : wx.removeStorageSync("searchList"),
      this.setData({
        historyList: [],
      }));
  },
  historyTap: function (t) {
    var e = t.currentTarget.dataset.keyword;
    (this.setData({
      "input.value": e,
    }),
      "cargoPass" == this.data.searchType
        ? this.getCargoPass(e)
        : "colorCard" == this.data.searchType && this.getCardList(e));
  },
  navBeforeHandleRange: function () {
    var t = this;
    ((this.data.searchRangeMap = {}),
      this.data.searchRange.forEach(function (e) {
        t.data.searchRangeMap[e.prop] = e.checked ? 1 : 0;
      }),
      wx.setStorageSync("searchRangeMap", this.data.searchRangeMap));
  },
  searchRangeTap: function (t) {
    var e = t.currentTarget.dataset.item,
      a = this.data.searchRange.find(function (t) {
        return t.prop === e.prop;
      });
    a &&
      ((a.checked = !a.checked),
      this.setData({
        searchRange: this.data.searchRange,
      }));
  },
  search: function () {
    var t = this;
    this.setData({
      isDone: !1,
      pageNum: 1,
    });
    var e = this.data.input.value,
      a = [];
    switch (this.data.searchType) {
      case "customer":
        (this.setData({
          customerList: [],
        }),
          this.getCustomer());
        break;
      case "cargoPass":
        if (util.inputIsNull(e))
          return (
            this.setData({
              cargoPassList: [],
            }),
            void this.getCargoPass()
          );
        ((a = wx.getStorageSync(app.environment + "searchListCargo")),
          this.setData({
            cargoPassList: [],
          }),
          this.getCargoPass(e).then(function () {
            if (a && a.length > 0)
              (-1 != (a = a.slice(0, 5)).indexOf(e)
                ? (a.splice(a.indexOf(e), 1), a.unshift(e))
                : a.unshift(e),
                a.length > 5 && a.pop(),
                wx.setStorageSync(app.environment + "searchListCargo", a),
                t.setData({
                  historyList: a,
                }));
            else {
              var toConsumableArray = [];
              (toConsumableArray.unshift(e),
                wx.setStorageSync(app.environment + "searchListCargo", toConsumableArray),
                t.setData({
                  historyList: toConsumableArray,
                }));
            }
          }));
        break;
      case "colorCard":
        if (util.inputIsNull(e))
          return (
            this.setData({
              colorCardList: [],
            }),
            void this.getCardList()
          );
        ((a = wx.getStorageSync("searchList")),
          this.setData({
            colorCardList: [],
          }),
          this.getCardList(e).then(function () {
            if (a && a.length > 0)
              (-1 != a.indexOf(e) ? (a.splice(a.indexOf(e), 1), a.unshift(e)) : a.unshift(e),
                a.length > 30 && a.pop(),
                wx.setStorageSync("searchList", a),
                t.setData({
                  historyList: a,
                }));
            else {
              var toConsumableArray = [];
              (toConsumableArray.unshift(e),
                wx.setStorageSync("searchList", toConsumableArray),
                t.setData({
                  historyList: toConsumableArray,
                }));
            }
          }));
    }
  },
  revokeApply: function (t) {
    var e = this,
      a = t.detail,
      toConsumableArray = a.status,
      s = a.id;
    releaseCargoPass[
      ["", "releaseCargoPassSuspend", "releaseCargoPassRestart", "releaseCargoPassRevoke"][
        toConsumableArray
      ]
    ]({
      productId: s,
    }).then(function (t) {
      0 === t.code &&
        (e.setData({
          cargoPassList: [],
          noData: 1,
        }),
        wx.hideLoading(),
        wx.showToast({
          title: ["", "暂停成功", "放货成功", "撤销成功"][toConsumableArray],
          icon: "none",
        }),
        e.getCargoPass(e.data.input.value, !1));
    });
  },
  getCargoPass: function () {
    var t = this,
      e = arguments.length > 0 && void 0 !== arguments[0] ? arguments[0] : "",
      a = !(arguments.length > 1 && void 0 !== arguments[1]) || arguments[1];
    return (
      a &&
        wx.showLoading({
          title: "拼命加载中...",
        }),
      new Promise(function (o, s) {
        var objectSpread2 = t.data,
          ServicesUserLog = objectSpread2.pageNum,
          mta_analysis = objectSpread2.pageSize,
          app = objectSpread2.cargoPassList,
          ServicesCustomer = {
            productStatus: -1,
            page: ServicesUserLog,
            size: mta_analysis,
            searchField: e,
          };
        releaseCargoPass.releaseCargoPassList(ServicesCustomer).then(function (e) {
          if (0 === e.code) {
            var s = e.data.content || [];
            if (s.length > 0) {
              var objectSpread2,
                ServicesUserLog = createForOfIteratorHelper(s);
              try {
                for (ServicesUserLog.s(); !(r = ServicesUserLog.n()).done;) {
                  var mta_analysis = objectSpread2.value;
                  app.push(mta_analysis);
                }
              } catch (t) {
                ServicesUserLog.e(t);
              } finally {
                ServicesUserLog.f();
              }
              (t.setData({
                cargoPassList: app,
                noData: !1,
              }),
                o(e));
            }
            0 == s.length && 1 == t.data.pageNum
              ? (t.setData({
                  noData: !0,
                }),
                o(e))
              : 0 == s.length &&
                t.data.pageNum > 1 &&
                t.setData({
                  isDone: !0,
                });
          } else
            wx.showToast({
              title: e.msg,
              icon: "none",
            });
          a && wx.hideLoading();
        });
      })
    );
  },
  getCustomer: function () {
    var t = this,
      e = this.data.customerList,
      a = {
        pageSize: this.data.pageSize,
        pageNum: this.data.pageNum,
        keyword: this.data.input.value,
      };
    ServicesCustomer.allCustomerList(a).then(function (a) {
      if (0 === a.code) {
        var toConsumableArray,
          s =
            (null === (o = a.data.pageResult) || void 0 === toConsumableArray
              ? void 0
              : toConsumableArray.content) || [];
        if (0 == s.length)
          return void wx.showToast({
            title: "没有此用户",
            icon: "none",
          });
        var objectSpread2,
          ServicesUserLog = createForOfIteratorHelper(s);
        try {
          for (ServicesUserLog.s(); !(r = ServicesUserLog.n()).done;) {
            var mta_analysis = objectSpread2.value;
            ((mta_analysis.headImg = util.addDefaultAvatar(mta_analysis.avatar)),
              e.push(mta_analysis));
          }
        } catch (t) {
          ServicesUserLog.e(t);
        } finally {
          ServicesUserLog.f();
        }
        (t.setData({
          customerList: e,
          noData: !1,
        }),
          0 == s.length && 1 == t.data.pageNum
            ? t.setData({
                noData: !0,
              })
            : 0 == s.length &&
              t.data.pageNum > 1 &&
              t.setData({
                isDone: !0,
              }));
      } else
        wx.showToast({
          title: a.msg,
          icon: "none",
        });
    });
  },
  toCustomDetail: function (t) {
    var e = t.detail.id;
    wx.navigateTo({
      url: "/pages/customer-management/all-customer-detail/all-customer-detail?customerId=".concat(
        e,
      ),
    });
  },
  getCardList: function () {
    var t = this,
      e = arguments.length > 0 && void 0 !== arguments[0] ? arguments[0] : "";
    return (
      wx.showLoading({
        title: "拼命加载中...",
      }),
      new Promise(function (a, o) {
        var s = t.data,
          mta_analysis = s.pageNum,
          ServicesCustomer = s.pageSize,
          releaseCargoPass = s.colorCardList,
          util = {
            filterKey: 1,
            page: mta_analysis,
            size: ServicesCustomer,
            searchFiled: e,
          };
        (t.navBeforeHandleRange(),
          t.data.searchRangeMap &&
            Object.keys(t.data.searchRangeMap).length &&
            (u = objectSpread2(objectSpread2({}, util), t.data.searchRangeMap)),
          ServicesCard.colorCardList(util).then(function (e) {
            if (0 === e.code) {
              ServicesUserLog.servicesUserLog.setUserHandleLog(117);
              var toConsumableArray = e.data.content || [];
              if (toConsumableArray.length > 0) {
                var s,
                  objectSpread2 = createForOfIteratorHelper(toConsumableArray);
                try {
                  for (objectSpread2.s(); !(s = objectSpread2.n()).done;) {
                    var mta_analysis = s.value;
                    (1 == mta_analysis.onSale
                      ? (mta_analysis.onOrOff = {
                          name: "下架",
                          icon: "".concat(
                            app.config.imgHost,
                            "/img/v2.7.4/Icon_Off_Shelves@2x.png",
                          ),
                        })
                      : 0 == mta_analysis.onSale &&
                        (mta_analysis.onOrOff = {
                          name: "上架",
                          icon: "".concat(app.config.imgHost, "/img/v2.7.4/Icon_Shelves@2x.png"),
                        }),
                      releaseCargoPass.push(mta_analysis));
                  }
                } catch (t) {
                  objectSpread2.e(t);
                } finally {
                  objectSpread2.f();
                }
                t.setData({
                  colorCardList: releaseCargoPass,
                  noData: !1,
                });
              }
              0 == toConsumableArray.length && 1 == t.data.pageNum
                ? t.setData({
                    noData: !0,
                  })
                : 0 == toConsumableArray.length &&
                  t.data.pageNum > 1 &&
                  t.setData({
                    isDone: !0,
                  });
            } else
              wx.showToast({
                title: e.msg,
                icon: "none",
              });
            (a(e), wx.hideLoading());
          }));
      })
    );
  },
  onOrOff: function (t) {
    var e = this,
      a = t.detail,
      toConsumableArray = a.goodsid,
      s = a.operateType,
      objectSpread2 = "",
      createForOfIteratorHelper = "";
    (0 == s
      ? ((r = "下架成功"), (i = ServicesCard.batchSetOffSale))
      : 1 == s && ((r = "上架成功"), (i = ServicesCard.batchSetOnSale)),
      createForOfIteratorHelper({
        productIds: toConsumableArray.split(","),
        onSale: Number(s),
      }).then(function (t) {
        0 === t.code
          ? (ServicesUserLog.servicesUserLog.setUserHandleLog(0 == s ? 115 : 116),
            wx.showLoading(),
            e.setData({
              colorCardList: [],
              pageNum: 1,
              isDone: !1,
            }),
            wx.hideLoading(),
            wx.showToast({
              title: objectSpread2,
            }),
            util.inputIsNull(e.data.input.value)
              ? e.getCardList()
              : e.getCardList(e.data.input.value))
          : wx.showToast({
              title: t.msg,
              icon: "none",
            });
      }));
  },
  closePopup: function () {
    this.setData({
      "popupInit.canvas.show": !1,
      "popupInit.canvas.type": "",
      shareColorList: [],
    });
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
    var e = this;
    return new Promise(function (a, o) {
      var s = {
        productId: t,
        companyId: app.globalData.userInfo.companyId,
        envVersion: app.envVersion,
      };
      ServicesCard.getQRcode(s).then(function (t) {
        if (0 === t.code) {
          var toConsumableArray = t.data;
          wx.getImageInfo({
            src: toConsumableArray,
            success: function (t) {
              (e.setData({
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
      var toConsumableArray =
        util.replImage(t.data.shareProdInfo.mainImgPath) || t.data.icon.def_img;
      wx.getImageInfo({
        src: toConsumableArray,
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
  shareM: function (t) {
    var e = this;
    (this.setData({
      shareFriendData: t.detail,
      "popupInit.canvas.type": "",
    }),
      wx.showLoading({
        title: "正在生成图片...",
        mask: !0,
      }),
      ServicesCard.shareProductDetails({
        productId: t.detail.goodsid,
      }).then(function (a) {
        0 === a.code &&
          ((a.data.setting.productId = t.detail.goodsid),
          e.setData({
            shareProdInfo: a.data,
          }),
          Promise.all([e.getCanvasImg(), e.getQRCode(t.detail.goodsid)]).then(function () {
            var t = e.data.popupInit.canvas.canvasId.shareCanvas,
              a = e.data.popupInit.canvas.canvasId.photoCanvas,
              toConsumableArray = wx.createCanvasContext(t),
              s = wx.createCanvasContext(a);
            (e.drawProdShare(toConsumableArray, 1),
              e.drawProdShare(s, 2),
              e.setData({
                "popupInit.canvas.show": !0,
                "popupInit.canvas.notice": !0,
              }),
              wx.hideLoading());
          }));
      }),
      ServicesUserLog.servicesUserLog.setUserHandleLog(114));
  },
  drawProdShare: function (t) {
    var e = arguments.length > 1 && void 0 !== arguments[1] ? arguments[1] : 1,
      a = this.data.shareProdInfo.setting,
      toConsumableArray =
        (1 === a.showProductName ? this.data.shareProdInfo.businessProductName : "") +
        (1 === a.showShelvesNumber
          ? ""
              .concat(1 === a.showProductName && this.data.shareProdInfo.spuNumber ? "-" : "")
              .concat(this.data.shareProdInfo.spuNumber)
          : ""),
      s = "";
    s =
      0 != this.data.shareProdInfo.price &&
      "0.0" != this.data.shareProdInfo.price &&
      this.data.shareProdInfo.price
        ? this.data.shareProdInfo.price
          ? "¥ ".concat(this.data.shareProdInfo.price)
          : ""
        : "面议";
    var objectSpread2 = this.data.tempImgUrl.goodUrl,
      createForOfIteratorHelper = this.data.tempImgUrl.qrUrl,
      ServicesUserLog = this.data.shareProdInfo.material;
    (t.setFillStyle("white"),
      this.roundRect(t, 0 * e, 0 * e, 300 * e, 450 * e, 8 * e, "#ffffff"),
      this.drawProdImage(t, 0 * e, 0 * e, 300 * e, 300 * e, 8 * e, objectSpread2, "top"),
      1 === a.showQrcode &&
        (t.drawImage(createForOfIteratorHelper, 190 * e, 300 * e, 100 * e, 100 * e),
        t.setFontSize(10 * e),
        t.setFillStyle("#333333"),
        t.setTextAlign("center"),
        t.fillText("长按识别", 238 * e, 418 * e),
        t.setFontSize(10 * e),
        t.setFillStyle("#333333"),
        t.setTextAlign("center"),
        t.fillText("查看更多商品", 238 * e, 435 * e)));
    var mta_analysis =
      toConsumableArray.length > 13 ? toConsumableArray.substring(0, 13) : toConsumableArray;
    if (toConsumableArray.length > 13) {
      c = toConsumableArray.substring(0, 13);
      var app = toConsumableArray.substring(13, toConsumableArray.length),
        ServicesCustomer = app.length > 11 ? app.substring(0, 11) + "..." : app;
      (t.setFontSize(14 * e),
        t.setFillStyle("#000000"),
        t.setTextAlign("left"),
        t.fillText(ServicesCustomer, 15 * e, 340 * e));
    }
    if (
      (t.setFontSize(14 * e),
      t.setFillStyle("#000000"),
      t.setTextAlign("left"),
      t.fillText(mta_analysis, 15 * e, 320 * e),
      1 === a.showPrice &&
        (t.setFontSize(18 * e),
        t.setFillStyle("#ff0000"),
        t.setTextAlign("left"),
        t.fillText(s, 15 * e, 385 * e)),
      1 === a.showMaterial)
    ) {
      var ServicesCard =
        ServicesUserLog.length > 13 ? ServicesUserLog.substring(0, 13) + "..." : ServicesUserLog;
      (t.setFontSize(14 * e),
        t.setFillStyle("#666666"),
        t.setTextAlign("left"),
        t.fillText(ServicesCard, 15 * e, 425 * e));
    }
    (t.stroke(), t.draw());
  },
  getColorCardImg: function (t) {
    var e = this;
    return new Promise(function (a, o) {
      var objectSpread2 = "";
      if (t.includes("clothImage")) {
        var createForOfIteratorHelper = e.data.colorCardInfo.imageInfoList
          ? e.data.colorCardInfo.imageInfoList.slice(0, 2)
          : [];
        createForOfIteratorHelper &&
          createForOfIteratorHelper.length &&
          (createForOfIteratorHelper[0] &&
            createForOfIteratorHelper[0].storagePath &&
            "clothImage1" === t &&
            (r = util.replImage(createForOfIteratorHelper[0].storagePath)),
          createForOfIteratorHelper[1] &&
            createForOfIteratorHelper[1].storagePath &&
            "clothImage2" === t &&
            (r = util.replImage(createForOfIteratorHelper[1].storagePath)));
      } else
        r =
          (e.data.colorCardInfo.detailImage &&
            util.replImage(e.data.colorCardInfo.detailImage[t])) ||
          e.data.icon.def_img;
      ("color_def" === t && (r = e.data.icon.color_def),
        "color_def2" === t && (r = e.data.icon.color_def2),
        objectSpread2 || (r = e.data.icon.def_img),
        wx.getImageInfo({
          src: objectSpread2,
          success: function (o) {
            if ("getImageInfo:ok" === o.errMsg) {
              var objectSpread2 = "colorCardInfo." + t;
              (e.setData({
                objectSpread2: o.path,
              }),
                a());
            } else (a(e.data.icon.def_img), wx.hideLoading());
          },
        }));
    });
  },
  isSettingHide: function (t) {
    var e = t.showContacts,
      a = t.showPrice,
      toConsumableArray = t.showProductName,
      s = t.showQrcode,
      objectSpread2 = t.showRemark,
      createForOfIteratorHelper = t.showClothEnough,
      ServicesUserLog = t.showClothWidth,
      mta_analysis = t.showGramWeight,
      app = t.showMaterial,
      ServicesCustomer = t.showShelvesNumber,
      ServicesCard = !(
        0 !== e ||
        0 !== a ||
        0 !== toConsumableArray ||
        0 !== ServicesCustomer ||
        0 !== s ||
        0 !== objectSpread2 ||
        0 !== createForOfIteratorHelper ||
        0 !== ServicesUserLog ||
        0 !== mta_analysis ||
        0 !== app
      );
    this.setData({
      settingAllHide: ServicesCard,
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
    var e = this;
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
      }).then(function (a) {
        if (0 === a.code) {
          ((a.data.setting.productId = t.detail.goodsid), e.isSettingHide(a.data.setting));
          var s = a.data.colorList || [];
          e.data.shareColorList = s;
          var objectSpread2 = a.data.setting.shape,
            createForOfIteratorHelper = 0 === a.data.setting.showImageTwo ? 130 : 0,
            ServicesUserLog = 0 === a.data.setting.showRemark ? 20 : 0,
            mta_analysis =
              Math.ceil(e.data.shareColorList.length / 4) * (2 === objectSpread2 ? 92 : 82) +
              355 -
              createForOfIteratorHelper -
              ServicesUserLog -
              (e.data.settingAllHide ? 140 : 0);
          (console.log("shareColorList", e.data.shareColorList),
            console.log("length", e.data.shareColorList.length));
          var app = Math.ceil(Number(e.data.shareColorList.length) / 4);
          console.log("一共多少行色块", app);
          var ServicesCustomer = 320 + 90 * app + 50;
          (console.log("真实高度", ServicesCustomer),
            console.log("_height", mta_analysis),
            console.log("录得高度", mta_analysis < 550 ? 650 : ServicesCustomer),
            e.setData({
              shareColorList: e.data.shareColorList,
              colorCardInfo: a.data,
              "popupInit.canvasHeight": mta_analysis < 550 ? 650 : ServicesCustomer,
              "popupInit.canvasHeight2": mta_analysis < 550 ? 1050 : 2 * mta_analysis,
            }),
            wx.setStorageSync("colorCaraSetting", a.data.setting));
          var ServicesCard = [
            e.getColorCardImg("color_def"),
            e.getColorCardImg("color_def2"),
            e.getQRCode(t.detail.goodsid),
          ];
          if (1 === a.data.setting.showImageTwo) {
            var releaseCargoPass = [
              e.getColorCardImg("imageTwo0"),
              e.getColorCardImg("imageTwoBack0"),
            ];
            g = [].concat(toConsumableArray(ServicesCard), releaseCargoPass);
          }
          if (0 === a.data.setting.showImageTwo) {
            var util = [e.getColorCardImg("clothImage1"), e.getColorCardImg("clothImage2")];
            g = [].concat(toConsumableArray(ServicesCard), util);
          }
          Promise.all(ServicesCard).then(function () {
            e.drawShareImg(e.data.shareColorList, 0);
          });
        } else
          wx.showToast({
            title: a.msg,
            icon: "none",
          });
      }),
      ServicesUserLog.servicesUserLog.setUserHandleLog(114));
  },
  drawShareImg: function (t, o) {
    var s = this;
    return a(
      e().mark(function a() {
        var objectSpread2, createForOfIteratorHelper, ServicesUserLog, mta_analysis;
        return e().wrap(function (e) {
          for (;;)
            switch ((e.prev = e.next)) {
              case 0:
                return (
                  (r = s.data.popupInit.canvas.canvasId.shareCanvas + o),
                  (i = s.data.popupInit.canvas.canvasId.photoCanvas + o),
                  (n = wx.createCanvasContext(objectSpread2)),
                  (c = wx.createCanvasContext(createForOfIteratorHelper)),
                  (e.next = 1),
                  s.drawColorShare(ServicesUserLog, t, 1)
                );
              case 1:
                return ((e.next = 2), s.drawColorShare(mta_analysis, t, 2));
              case 2:
                (s.setData({
                  "popupInit.canvas.show": !0,
                  "popupInit.canvas.notice": !0,
                }),
                  wx.hideLoading());
              case 3:
              case "end":
                return e.stop();
            }
        }, a);
      }),
    )();
  },
  drawColorShare: function (t, o) {
    var s = arguments,
      objectSpread2 = this;
    return a(
      e().mark(function a() {
        var createForOfIteratorHelper,
          ServicesUserLog,
          mta_analysis,
          app,
          ServicesCustomer,
          ServicesCard,
          releaseCargoPass,
          f,
          p,
          m,
          v,
          w,
          I,
          C,
          x,
          S,
          P,
          y,
          L,
          T,
          D,
          b,
          F,
          A,
          M,
          k,
          R,
          N,
          _,
          H,
          U,
          z,
          O,
          q,
          j,
          B,
          Q,
          V,
          E,
          W,
          G,
          J,
          K,
          X,
          Y,
          Z,
          $,
          tt,
          et,
          at;
        return e().wrap(function (e) {
          for (;;)
            switch ((e.prev = e.next)) {
              case 0:
                ((i = s.length > 2 && void 0 !== s[2] ? s[2] : 1),
                  (n = objectSpread2.data.colorCardInfo),
                  (c = ServicesUserLog.businessProductName),
                  (l = ServicesUserLog.companyName),
                  (h = ServicesUserLog.price),
                  (g = ServicesUserLog.priceUnit),
                  (d = ServicesUserLog.imageTwo0),
                  (f = ServicesUserLog.imageTwoBack0),
                  (p = ServicesUserLog.clothImage1),
                  (m = ServicesUserLog.clothImage2),
                  (v = ServicesUserLog.concats),
                  (w = ServicesUserLog.phone),
                  (I = ServicesUserLog.material),
                  (C = ServicesUserLog.clothEnough),
                  (x = ServicesUserLog.clothWidth),
                  (S = ServicesUserLog.gramWeight),
                  (P = ServicesUserLog.shelvesNumber),
                  (y = mta_analysis || "-"),
                  (L = (L = app || "-").length > 17 ? L.substring(0, 17) + "..." : L),
                  (T = P || "-"),
                  (D = ""),
                  "",
                  0 != ServicesCustomer && "0.0" != ServicesCustomer && ServicesCustomer
                    ? (D = ServicesCustomer
                        ? "¥ ".concat(ServicesCustomer, "/").concat(ServicesCard)
                        : "")
                    : ((D = "面议"), ""),
                  (b = objectSpread2.data.colorCardInfo.remark || ""),
                  objectSpread2.data.tempImgUrl.goodUrl,
                  (F = objectSpread2.data.tempImgUrl.qrUrl),
                  (A = releaseCargoPass),
                  (M = f),
                  (k = p),
                  (R = m),
                  (N = objectSpread2.data.colorCardInfo.color_def),
                  (_ = objectSpread2.data.colorCardInfo.color_def2),
                  (H = v > 10 ? v.substring(0, 10) + "..." : v),
                  (U = w || ""),
                  (z = "克重：" + (S || "-")),
                  (O = "幅宽：" + (x || "-")),
                  (q = "空差：" + (C || "-")),
                  (j = objectSpread2.data.colorCardInfo.setting),
                  (B = objectSpread2.data.settingAllHide ? 140 * createForOfIteratorHelper : 0),
                  t.setFillStyle("white"),
                  objectSpread2.roundRect(
                    t,
                    0 * createForOfIteratorHelper,
                    0 * createForOfIteratorHelper,
                    305 * createForOfIteratorHelper,
                    objectSpread2.data.popupInit.canvasHeight * createForOfIteratorHelper,
                    8,
                    "#ffffff",
                  ),
                  t.setFillStyle("#000000"),
                  (t.font = "normal bold ".concat(
                    16 * createForOfIteratorHelper,
                    "px Arial, sans-serif",
                  )),
                  t.setTextAlign("center"),
                  t.fillText(L, 155 * createForOfIteratorHelper, 30 * createForOfIteratorHelper),
                  1 === j.showQrcode &&
                    t.drawImage(
                      F,
                      210 * createForOfIteratorHelper,
                      62 * createForOfIteratorHelper,
                      80 * createForOfIteratorHelper,
                      80 * createForOfIteratorHelper,
                    ),
                  1 === j.showProductName &&
                    (t.setFontSize(14 * createForOfIteratorHelper),
                    t.setFillStyle("#000000"),
                    (t.font = "normal 400 ".concat(
                      14 * createForOfIteratorHelper,
                      "px Arial, sans-serif",
                    )),
                    t.setTextAlign("left"),
                    t.fillText(
                      y.length > 19 ? y.substring(0, 19) + "..." : y,
                      20 * createForOfIteratorHelper,
                      55 * createForOfIteratorHelper,
                    )),
                  1 === j.showShelvesNumber &&
                    (t.setFillStyle("#000000"),
                    (t.font = "normal bold ".concat(
                      14 * createForOfIteratorHelper,
                      "px Arial, sans-serif",
                    )),
                    t.setTextAlign("left"),
                    t.fillText(T, 20 * createForOfIteratorHelper, 75 * createForOfIteratorHelper)),
                  1 === j.showPrice &&
                    (t.setFillStyle("#FF2332"),
                    (t.font = "normal bold ".concat(
                      14 * createForOfIteratorHelper,
                      "px Arial, sans-serif",
                    )),
                    t.setTextAlign("left"),
                    t.fillText(D, 20 * createForOfIteratorHelper, 95 * createForOfIteratorHelper)),
                  1 === j.showMaterial &&
                    ((V = (Q = "成分：" + (I || "-")).length > 15 ? Q.substring(0, 15) : Q),
                    (E = Q.length > 15 ? Q.substring(15, 28) + "..." : ""),
                    t.setFillStyle("#808080"),
                    (t.font = "normal 400 ".concat(
                      14 * createForOfIteratorHelper,
                      "px Arial, sans-serif",
                    )),
                    t.setTextAlign("left"),
                    t.fillText(V, 20 * createForOfIteratorHelper, 115 * createForOfIteratorHelper),
                    "" != E &&
                      (t.setFillStyle("#808080"),
                      (t.font = "normal 400 ".concat(
                        14 * createForOfIteratorHelper,
                        "px Arial, sans-serif",
                      )),
                      t.setTextAlign("left"),
                      t.fillText(
                        E,
                        20 * createForOfIteratorHelper,
                        131 * createForOfIteratorHelper,
                      ))),
                  1 === j.showGramWeight &&
                    (t.setFontSize(14),
                    t.setFillStyle("#808080"),
                    (t.font = "normal 400 ".concat(
                      14 * createForOfIteratorHelper,
                      "px Arial, sans-serif",
                    )),
                    t.setTextAlign("left"),
                    t.fillText(z, 20 * createForOfIteratorHelper, 147 * createForOfIteratorHelper)),
                  1 === j.showClothWidth &&
                    (t.setFontSize(14),
                    t.setFillStyle("#808080"),
                    (t.font = "normal 400 ".concat(
                      14 * createForOfIteratorHelper,
                      "px Arial, sans-serif",
                    )),
                    t.setTextAlign("left"),
                    t.fillText(O, 20 * createForOfIteratorHelper, 166 * createForOfIteratorHelper)),
                  1 === j.showClothEnough &&
                    (t.setFontSize(14),
                    t.setFillStyle("#808080"),
                    (t.font = "normal 400 ".concat(
                      14 * createForOfIteratorHelper,
                      "px Arial, sans-serif",
                    )),
                    t.setTextAlign("left"),
                    t.fillText(q, 20 * createForOfIteratorHelper, 185 * createForOfIteratorHelper)),
                  1 === j.showRemark &&
                    (t.setFontSize(12 * createForOfIteratorHelper),
                    t.setFillStyle("#c1c1c1"),
                    t.setTextAlign("left"),
                    t.fillText(
                      b && b.length < 20 ? b : b.substring(0, 20),
                      20 * createForOfIteratorHelper,
                      210 * createForOfIteratorHelper,
                    ),
                    b.length > 20 &&
                      (t.setFontSize(12 * createForOfIteratorHelper),
                      t.setFillStyle("#c1c1c1"),
                      t.setTextAlign("left"),
                      t.fillText(
                        b.substring(20, b.length),
                        20 * createForOfIteratorHelper,
                        215 * createForOfIteratorHelper,
                      ))),
                  1 === j.showContacts &&
                    (t.setFontSize(12 * createForOfIteratorHelper),
                    t.setFillStyle("#808080"),
                    t.setTextAlign("right"),
                    (t.font = "normal 400 ".concat(
                      12 * createForOfIteratorHelper,
                      "px Arial, sans-serif",
                    )),
                    t.fillText(H, 290 * createForOfIteratorHelper, 160 * createForOfIteratorHelper),
                    t.setFontSize(12 * createForOfIteratorHelper),
                    t.setFillStyle("#808080"),
                    t.setTextAlign("right"),
                    (t.font = "normal 400 ".concat(
                      12 * createForOfIteratorHelper,
                      "px Arial, sans-serif",
                    )),
                    t.fillText(
                      U,
                      290 * createForOfIteratorHelper,
                      175 * createForOfIteratorHelper,
                    )),
                  (W = 0 === j.showRemark ? 200 : 230),
                  j.showImageTwo >= 0 &&
                    (objectSpread2.drawProdImage(
                      t,
                      16 * createForOfIteratorHelper,
                      W * createForOfIteratorHelper - B,
                      131 * createForOfIteratorHelper,
                      102 * createForOfIteratorHelper,
                      4 * createForOfIteratorHelper,
                      1 === j.showImageTwo ? A : k,
                    ),
                    (t.globalAlpha = 0.3),
                    (t.globalAlpha = 1),
                    t.setFontSize(10 * createForOfIteratorHelper),
                    t.setFillStyle("#000000"),
                    t.setTextAlign("center"),
                    t.fillText(
                      "".concat(1 === j.showImageTwo ? "正面细节图" : ""),
                      80 * createForOfIteratorHelper,
                      (W + 117) * createForOfIteratorHelper - B,
                    ),
                    objectSpread2.drawProdImage(
                      t,
                      160 * createForOfIteratorHelper,
                      W * createForOfIteratorHelper - B,
                      131 * createForOfIteratorHelper,
                      102 * createForOfIteratorHelper,
                      4 * createForOfIteratorHelper,
                      1 === j.showImageTwo ? M : R,
                    ),
                    (t.globalAlpha = 0.3),
                    (t.globalAlpha = 1),
                    t.setFontSize(10 * createForOfIteratorHelper),
                    t.setFillStyle("#000000"),
                    t.setTextAlign("center"),
                    t.fillText(
                      "".concat(1 === j.showImageTwo ? "背面细节图" : ""),
                      225 * createForOfIteratorHelper,
                      (W + 117) * createForOfIteratorHelper - B,
                    )),
                  (G = 1),
                  (J = -56 * createForOfIteratorHelper),
                  (K = 0),
                  (X = 0),
                  (Y = 0 === j.showRemark ? 30 * createForOfIteratorHelper : 0),
                  (Z = 0));
              case 1:
                if (!(Z < o.length)) {
                  e.next = 5;
                  break;
                }
                if (
                  (($ = o[Z]),
                  (J += (71 + (2 === j.shape ? 3 : 0)) * createForOfIteratorHelper),
                  (K =
                    G *
                      (82 * createForOfIteratorHelper +
                        (2 === j.shape ? 10 * createForOfIteratorHelper : 0)) +
                    ((2 === j.shape
                      ? 265 * createForOfIteratorHelper - X - Y
                      : 275 * createForOfIteratorHelper - X - Y) -
                      B)),
                  (tt = $.colorVal || ""),
                  (et = $.colorName || ""),
                  $.colorImagePath)
                ) {
                  e.next = 2;
                  break;
                }
                (2 === j.shape
                  ? $.colorValue
                    ? objectSpread2.roundRect(
                        t,
                        J,
                        K,
                        48 * createForOfIteratorHelper,
                        48 * createForOfIteratorHelper,
                        24 * createForOfIteratorHelper,
                        $.colorValue || "",
                      )
                    : objectSpread2.drawProdImage(
                        t,
                        J,
                        K,
                        48 * createForOfIteratorHelper,
                        48 * createForOfIteratorHelper,
                        24 * createForOfIteratorHelper,
                        _,
                      )
                  : $.colorValue
                    ? objectSpread2.roundRect(
                        t,
                        J,
                        K,
                        62 * createForOfIteratorHelper,
                        38 * createForOfIteratorHelper,
                        4 * createForOfIteratorHelper,
                        $.colorValue || "",
                      )
                    : objectSpread2.drawProdImage(
                        t,
                        J,
                        K,
                        62 * createForOfIteratorHelper,
                        38 * createForOfIteratorHelper,
                        4 * createForOfIteratorHelper,
                        N,
                      ),
                  (at = objectSpread2.data.color_icon),
                  objectSpread2.drawProdImage(
                    t,
                    J +
                      30 * createForOfIteratorHelper +
                      (2 === j.shape ? -8 * createForOfIteratorHelper : 0) -
                      (3 * tt.length + 9) * createForOfIteratorHelper,
                    K +
                      44 * createForOfIteratorHelper +
                      (2 === j.shape ? 8 * createForOfIteratorHelper : 0),
                    10 * createForOfIteratorHelper,
                    10 * createForOfIteratorHelper,
                    0 * createForOfIteratorHelper,
                    at,
                  ),
                  (e.next = 3));
                break;
              case 2:
                return (
                  (e.next = 3),
                  objectSpread2
                    .getCanvasColorImg(util.replImage($.colorImagePath, 122))
                    .then(function (e) {
                      2 === j.shape
                        ? objectSpread2.drawProdImage(
                            t,
                            J - 6,
                            K,
                            60 * createForOfIteratorHelper,
                            60 * createForOfIteratorHelper,
                            30 * createForOfIteratorHelper,
                            e,
                          )
                        : objectSpread2.drawProdImage(
                            t,
                            J,
                            K,
                            62 * createForOfIteratorHelper,
                            41 * createForOfIteratorHelper,
                            4 * createForOfIteratorHelper,
                            e,
                          );
                    })
                );
              case 3:
                (t.setFontSize(10 * createForOfIteratorHelper),
                  t.setFillStyle("#333333"),
                  t.setTextAlign("center"),
                  t.fillText(
                    tt,
                    J +
                      30 * createForOfIteratorHelper +
                      (2 === j.shape ? -8 * createForOfIteratorHelper : 0),
                    K +
                      52 * createForOfIteratorHelper +
                      (2 === j.shape
                        ? $.colorImagePath
                          ? 18 * createForOfIteratorHelper
                          : 8 * createForOfIteratorHelper
                        : 0),
                  ),
                  t.setFontSize(10 * createForOfIteratorHelper),
                  t.setFillStyle("#333333"),
                  t.setTextAlign("center"),
                  t.fillText(
                    et,
                    J +
                      30 * createForOfIteratorHelper +
                      (2 === j.shape ? -8 * createForOfIteratorHelper : 0),
                    K +
                      64 * createForOfIteratorHelper +
                      (2 === j.shape
                        ? $.colorImagePath
                          ? 18 * createForOfIteratorHelper
                          : 8 * createForOfIteratorHelper
                        : 0),
                  ),
                  (Z + 1) % 4 == 0 && ((G += 1), (J = -56 * createForOfIteratorHelper)));
              case 4:
                (Z++, (e.next = 1));
                break;
              case 5:
                ("秉羲工作台·技术支持",
                  t.setFontSize(10 * createForOfIteratorHelper),
                  t.setFillStyle("#d8d8d8"),
                  t.setTextAlign("center"),
                  t.fillText(
                    "秉羲工作台·技术支持",
                    160 * createForOfIteratorHelper,
                    objectSpread2.data.popupInit.canvasHeight * createForOfIteratorHelper - 10,
                  ),
                  t.stroke(),
                  t.draw());
              case 6:
              case "end":
                return e.stop();
            }
        }, a);
      }),
    )();
  },
  drawProdImage: function (t, e, a, o, s, r, i, n) {
    i &&
      (t.save(),
      t.beginPath(),
      "top" === n
        ? (t.arc(e + r, a + r, r, Math.PI, 1.5 * Math.PI),
          t.arc(e + o - r, a + r, r, 1.5 * Math.PI, 2 * Math.PI),
          t.arc(e + o - r, a + s - r, r, 0, 0),
          t.arc(e + r, a + s - r, r, Math.PI, Math.PI))
        : (t.arc(e + r, a + r, r, Math.PI, 1.5 * Math.PI),
          t.arc(e + o - r, a + r, r, 1.5 * Math.PI, 2 * Math.PI),
          t.arc(e + o - r, a + s - r, r, 0, 0.5 * Math.PI),
          t.arc(e + r, a + s - r, r, 0.5 * Math.PI, Math.PI)),
      t.clip(),
      t.drawImage(i, e, a, o, s),
      t.restore(),
      (t.strokeStyle = "#fff"));
  },
  roundRect: function (t, e, a, o, s, r, i) {
    (t.setLineDash(),
      t.beginPath(),
      t.setFillStyle(i),
      t.setStrokeStyle("#ffffff"),
      t.arc(e + r, a + r, r, Math.PI, 1.5 * Math.PI),
      t.arc(e + o - r, a + r, r, 1.5 * Math.PI, 2 * Math.PI),
      t.arc(e + o - r, a + s - r, r, 0, 0.5 * Math.PI),
      t.arc(e + r, a + s - r, r, 0.5 * Math.PI, Math.PI),
      t.lineTo(e, a + r),
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
    var e = this,
      a = "";
    ((a =
      null == t || t.type
        ? this.data.popupInit.canvas.canvasId.shareCanvas
        : this.data.popupInit.canvas.canvasId.shareCanvas + t),
      wx.showLoading({
        title: "正在保存图片...",
        mask: !0,
      }));
    var toConsumableArray = setTimeout(function () {
      wx.canvasToTempFilePath({
        x: 0,
        y: 0,
        canvasId: a,
        success: function (t) {
          (wx.hideLoading(),
            wx.saveImageToPhotosAlbum({
              filePath: t.tempFilePath,
              success: function () {
                (wx.showToast({
                  title: "图片已保存到相册",
                  icon: "success",
                }),
                  e.closePopup());
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
                          fail: function (t) {
                            e.setData({
                              showAuth: !0,
                            });
                          },
                        });
                    },
                  });
              },
            }),
            clearTimeout(toConsumableArray));
        },
      });
    }, 1e3);
  },
  isUpdate: function (t) {
    var e = this;
    if ("string" == typeof t) {
      var a = JSON.parse(t);
      (this.data.colorCardList.forEach(function (t, o) {
        t.id == a.id && (e.data.colorCardList[o] = Object.assign(e.data.colorCardList[o], a));
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
      this.getCardList().then(function (t) {
        (wx.removeStorageSync("baseListId"), wx.hideLoading());
      }));
  },
  calculateSearchRange: function () {
    var t = wx.getStorageSync("searchRangeMap");
    t &&
      Object.keys(t).length > 0 &&
      (this.data.searchRange.forEach(function (e) {
        Object.prototype.hasOwnProperty.call(t, e.prop) && (e.checked = 1 === t[e.prop]);
      }),
      this.setData({
        searchRange: this.data.searchRange,
      }));
  },
  onLoad: function (t) {
    var e = this;
    switch ((mta_analysis.default.Page.init(), wx.hideShareMenu(), t.type)) {
      case "customer":
        this.setData({
          searchType: t.type,
          "input.placeholder": "请输入要搜索的客户名称",
        });
        break;
      case "cargoPass":
        this.setData({
          searchType: t.type,
          "input.placeholder": "搜索品名/色卡编号",
        });
        break;
      case "colorCard":
        (this.setData({
          searchType: t.type,
          "input.placeholder": "请输入色卡编号/品名搜索",
        }),
          this.calculateSearchRange());
    }
    wx.getImageInfo({
      src: this.data.icon.color_icon,
      success: function (t) {
        "getImageInfo:ok" === t.errMsg &&
          e.setData({
            color_icon: t.path,
          });
      },
    });
  },
  usePreFunction: function () {
    var t = getCurrentPages(),
      e =
        "cargoPass" === this.data.searchType
          ? "packageB/pages/release-cargo-pass/index"
          : "pages/color-card-management/color-card-management",
      a = t.find(function (t) {
        return t.route === e;
      });
    a &&
      a.reset &&
      (a.reset(), "cargoPass" === this.data.searchType ? a.getCargoList() : a.getCardList());
  },
  ontoProductCard: function (t) {
    var e = t.detail,
      a = this;
    wx.showModal({
      title: "温馨提示",
      content: "是否移出底卡，移出后该底卡会转为主产品？",
      success: function (t) {
        t.confirm &&
          ServicesCard.saveBottomCardToProduct(e.id).then(function (t) {
            if (0 === t.code) {
              var toConsumableArray = a.data.colorCardList.findIndex(function (t) {
                return t.id === e.id;
              });
              -1 !== toConsumableArray &&
                a.setData({
                  ["colorCardList[".concat(toConsumableArray, "].parentId")]: 0,
                });
            }
          });
      },
    });
  },
  onShow: function () {
    var t =
      "cargoPass" === this.data.searchType
        ? wx.getStorageSync(app.environment + "searchListCargo")
        : wx.getStorageSync("searchList");
    t &&
      t.length > 0 &&
      ("cargoPass" === this.data.searchType && (t = t.slice(0, 5)),
      this.setData({
        historyList: t,
      }));
    var e = wx.getStorageSync("creterColor"),
      a = wx.getStorageSync("creterProdShare");
    (e &&
      (this.closePopup(),
      this.shareColorCard({
        detail: {
          goodsid: e,
        },
      }),
      wx.removeStorageSync("creterColor")),
      a &&
        (this.shareM({
          detail: {
            goodsid: a,
          },
        }),
        wx.removeStorageSync("creterProdShare")));
    var toConsumableArray = wx.getStorageSync("colorCaraSetting");
    toConsumableArray &&
      this.setData({
        "colorCardInfo.setting": toConsumableArray,
        "shareProdInfo.setting": toConsumableArray,
      });
  },
  onUnload: function () {
    (this.usePreFunction(),
      wx.removeStorageSync("creterColor"),
      wx.removeStorageSync("creterProdShare"));
  },
  onReachBottom: function () {
    var t = this.data,
      e = t.pageNum,
      a = t.isDone,
      toConsumableArray = t.customerList,
      s = t.colorCardList,
      objectSpread2 = t.cargoPassList;
    a
      ? wx.showToast({
          title: "数据已全部加载完毕",
          icon: "none",
        })
      : (e++,
        this.setData({
          pageNum: e,
        }),
        toConsumableArray.length > 0
          ? this.getCustomer()
          : objectSpread2.length > 0
            ? this.getCargoPass()
            : s.length > 0 &&
              (util.inputIsNull(this.data.input.value)
                ? this.getCardList()
                : this.getCardList(this.data.input.value)));
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
