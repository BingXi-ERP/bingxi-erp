var t = require("../../../@babel/runtime/helpers/interopRequireDefault").default,
  e = require("../../../@babel/runtime/helpers/defineProperty"),
  createForOfIteratorHelper = require("../../../@babel/runtime/helpers/createForOfIteratorHelper"),
  mta_analysis = t(require("../../utils/mta_analysis.js")),
  app = getApp(),
  login = require("../../libs/utils/login.js").login,
  releaseCargoPass = require("../../libs/services/releaseCargoPass.js").servicesCargoPass,
  n =
    (require("../../libs/utils/util.js").utils,
    require("../../libs/services/ServicesShop.js").servicesShop,
    require("../../libs/services/ServicesUserLog.js").servicesUserLog);
Page({
  data: {
    showTips: !1,
    hasOperate: !1,
    userAuthList: {},
    input: {
      text: "请输入色卡编号/品名搜索",
    },
    footerBar: [
      {
        name: "新增放货",
        icon: "".concat(app.config.imgHost, "/img/customer/ic_tianjia@2x.png"),
        action: "add",
      },
    ],
    noColorCardBg: "".concat(app.config.imgHost, "/img/customer/img_wuxinx@3x.png"),
    shopId: "",
    isLoad: !1,
    cargoPassList: [],
    colorCardCount: {
      inTransitCount: "",
      breakCount: "",
      inReviewCount: "",
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
      settingIcon: "".concat(app.config.imgHost, "/img/customer/Icon_Settings@2x.png"),
      tips: "".concat(app.config.imgHost, "/img/v2.14.0/Tips_Close@2x.png"),
      def_img: "".concat(app.config.imgHost, "/img/customer/img_def.png"),
      color_def: "".concat(app.config.imgHost, "/img/customer/color_def.png"),
      color_def2: "".concat(app.config.imgHost, "/img/customer/color_def2.png"),
      color_icon: "".concat(app.config.imgHost, "/img/customer/color_icon.png"),
      set_icon: "".concat(app.config.imgHost, "/img/customer/set_icon.png"),
      set_search: "".concat(app.config.imgHost, "/img/customer/duibuIcon/icon/set_search.png"),
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
  handerListBg: function () {
    this.setData({
      hasOperate: !1,
    });
  },
  handOperate: function () {
    this.setData({
      hasOperate: !this.data.hasOperate,
    });
  },
  closeOperate: function () {
    this.setData({
      hasOperate: !1,
    });
  },
  closeTips: function () {
    (this.setData({
      showTips: !1,
    }),
      wx.setStorageSync("printTips", "1"));
  },
  toSearch: function () {
    (this.setData({
      hasOperate: !1,
    }),
      wx.navigateTo({
        url: "/pages/search/search?type=cargoPass",
      }));
  },
  toSetting: function () {
    (this.setData({
      hasOperate: !1,
    }),
      wx.navigateTo({
        url: "/packageB/pages/personal-center/edit-shop/edit-shop",
      }));
  },
  getCargoList: function () {
    var t = this,
      e = arguments.length > 0 && void 0 !== arguments[0] ? arguments[0] : "",
      mta_analysis = !(arguments.length > 1 && void 0 !== arguments[1]) || arguments[1],
      app = arguments.length > 2 && void 0 !== arguments[2] && arguments[2],
      login = !(arguments.length > 3 && void 0 !== arguments[3]) || arguments[3];
    return (
      login &&
        wx.showLoading({
          title: "拼命加载中...",
        }),
      new Promise(function (n, c) {
        var g = t.data,
          d = g.saleStatus,
          u = (g.filterKey, g.pageNum),
          l = g.pageSize,
          h = g.cargoPassList,
          p = {
            productStatus: d,
            page: u,
            size: l,
            searchFiled: e,
          };
        releaseCargoPass.releaseCargoPassList(p).then(function (e) {
          if (0 === e.code) {
            var releaseCargoPass = e.data.content || [],
              c = Math.ceil(e.data.total / l) || 1;
            if (
              (t.setData({
                "colorCardCount.inTransitCount": e.data.inTransitCount,
                "colorCardCount.breakCount": e.data.breakCount,
                "colorCardCount.inReviewCount": e.data.inReviewCount,
              }),
              mta_analysis)
            ) {
              var g,
                d = createForOfIteratorHelper(releaseCargoPass);
              try {
                for (d.s(); !(g = d.n()).done;) {
                  var p = g.value;
                  c >= u && h.push(p);
                }
              } catch (t) {
                d.e(t);
              } finally {
                d.f();
              }
            }
            (app && (h = releaseCargoPass),
              t.setData({
                cargoPassList: h,
                isLoad: !1,
              }),
              0 == releaseCargoPass.length &&
                u > 1 &&
                t.setData({
                  isDone: !0,
                }),
              n(e));
          } else
            (wx.showToast({
              title: e.msg,
              icon: "none",
            }),
              t.setData({
                isLoad: !1,
              }),
              n(e));
          (wx.removeStorageSync("baseListId"), login && wx.hideLoading());
        });
      })
    );
  },
  revokeApply: function (t) {
    var e = this,
      createForOfIteratorHelper = t.detail,
      mta_analysis = createForOfIteratorHelper.status,
      app = createForOfIteratorHelper.id;
    releaseCargoPass[
      ["", "releaseCargoPassSuspend", "releaseCargoPassRestart", "releaseCargoPassRevoke"][
        mta_analysis
      ]
    ]({
      productId: app,
    }).then(function (t) {
      0 === t.code &&
        (wx.showToast({
          title: ["", "暂停成功", "放货成功", "撤销成功"][mta_analysis],
          icon: "none",
        }),
        e.setData({
          pageNum: 1,
        }),
        e.getCargoList("", !1, !0, !1));
    });
  },
  changeTab: function (t) {
    var e = t.detail.saleStatus;
    (this.setData({
      hasOperate: !1,
      isLoad: !0,
      pageNum: 1,
      saleStatus: e,
      filterKey: 0,
      cargoPassList: [],
      isDone: !1,
    }),
      wx.showLoading({
        title: "加载中",
      }),
      this.getCargoList());
  },
  reset: function () {
    this.setData({
      filterKey: 0,
      pageNum: 1,
      cargoPassList: [],
      isDone: !1,
    });
  },
  onOrOff: function (t) {
    var e = this,
      createForOfIteratorHelper = t.detail,
      mta_analysis = createForOfIteratorHelper.goodsid,
      app = createForOfIteratorHelper.operateType,
      login = createForOfIteratorHelper.idx,
      releaseCargoPass = this.data.cargoPassList;
    console.log(login);
    var c = "";
    (0 == app
      ? ("下架成功", (c = servicesCard.batchSetOffSale))
      : 1 == app && ("上架成功", (c = servicesCard.batchSetOnSale)),
      c({
        productIds: mta_analysis.split(","),
        onSale: Number(app),
      }).then(function (t) {
        0 === t.code
          ? (n.setUserHandleLog(0 == app ? 115 : 116),
            releaseCargoPass.splice(login, 1),
            e.setData({
              cargoPassList: releaseCargoPass,
            }),
            e.setData({
              "colorCardCount.inTransitCount":
                0 == app
                  ? e.data.colorCardCount.inTransitCount - 1
                  : e.data.colorCardCount.inTransitCount + 1,
              "colorCardCount.breakCount":
                0 == app
                  ? e.data.colorCardCount.breakCount + 1
                  : e.data.colorCardCount.breakCount - 1,
              "colorCardCount.inReviewCount": e.data.colorCardCount.inReviewCount,
            }),
            e.setData({
              pageNum: 1,
            }),
            e.getCargoList("", !1, !0))
          : wx.showToast({
              title: t.msg,
              icon: "none",
            });
      }));
  },
  toAddColorCard: function () {
    (wx.removeStorageSync("bottomCardInfo"),
      wx.navigateTo({
        url: "/packageB/pages/release-cargo-pass/new-cargo-pass/new-cargo-pass",
      }));
  },
  footerBarTap: function (t) {
    switch (t.currentTarget.dataset.action) {
      case "add":
        (wx.removeStorageSync("goodsPriceJson"),
          wx.removeStorageSync("sureCategoryGoodsList"),
          wx.removeStorageSync("checkCategoryName"),
          wx.removeStorageSync("colorColorList"),
          wx.removeStorageSync("colorColorId"),
          wx.removeStorageSync("unitName"),
          wx.removeStorageSync("miniNum"),
          wx.removeStorageSync("maxNum"),
          wx.removeStorageSync("priceType"),
          wx.removeStorageSync("baseListId"),
          wx.removeStorageSync("checkColorItem"),
          wx.removeStorageSync("commodityType"),
          wx.removeStorageSync("bottomCardInfo"),
          wx.navigateTo({
            url: "/packageB/pages/color-card-management/add-color-card/add-color-card?type=0",
          }));
        break;
      case "more":
        wx.navigateTo({
          url: "/packageB/pages/color-card-management/batch-management/batch-management?saleStatus=".concat(
            this.data.saleStatus,
          ),
        });
        break;
      case "type":
        wx.navigateTo({
          url: "/packageB/pages/color-card-management/type-management/type-management",
        });
    }
  },
  closePopup: function () {
    this.setData({
      "popupInit.canvas.show": !1,
    });
  },
  colorSetting: function () {
    "colorCard" === this.data.popupInit.canvas.type
      ? ((this.data.colorCardInfo.setting.price = this.data.shareFriendData.price),
        (this.data.colorCardInfo.setting.unit = this.data.shareFriendData.unit),
        console.log(this.data.colorCardInfo.setting),
        wx.navigateTo({
          url: "/packageB/pages/color-card-management/color-card-setting/color-card-setting?colorCardInfo=".concat(
            JSON.stringify(this.data.colorCardInfo.setting),
          ),
        }))
      : wx.navigateTo({
          url: "/packageB/pages/color-card-management/product-share-setting/product-share-setting?shareInfo=".concat(
            JSON.stringify(this.data.shareProdInfo.setting),
          ),
        });
  },
  isUpdate: function (t) {
    var e = this;
    if (
      (this.setData({
        hasOperate: !1,
      }),
      "string" == typeof t)
    ) {
      var createForOfIteratorHelper = JSON.parse(t);
      (this.data.cargoPassList.forEach(function (t, o) {
        t.id == createForOfIteratorHelper.id &&
          (e.data.cargoPassList[o] = Object.assign(
            e.data.cargoPassList[o],
            createForOfIteratorHelper,
          ));
      }),
        this.setData({
          cargoPassList: this.data.cargoPassList,
        }));
    }
  },
  deleteItem: function () {
    (wx.hideShareMenu(),
      wx.showLoading({
        title: "加载中",
      }),
      this.setData({
        cargoPassList: [],
        pageNum: 1,
        isDone: !1,
      }),
      Promise.all([this.getCargoList()]).then(function (t) {
        (wx.removeStorageSync("baseListId"), wx.hideLoading());
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
      wx.getStorageSync("printTips") ||
        this.setData({
          showTips: !0,
        }),
      this.initMeth());
  },
  initMeth: function () {
    var t = this;
    (this.footerBarAuth(),
      this.getCargoList(),
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
    (wx.removeStorageSync("creterColor"), wx.removeStorageSync("creterProdShare"));
  },
  onShow: function () {
    var t = wx.getStorageSync("creterColor"),
      e = wx.getStorageSync("creterProdShare");
    (t &&
      (this.shareColorCard({
        detail: {
          goodsid: t,
        },
      }),
      wx.removeStorageSync("creterColor")),
      e &&
        (this.shareM({
          detail: {
            goodsid: e,
          },
        }),
        wx.removeStorageSync("creterProdShare")));
  },
  onHide: function () {},
  onUnload: function () {},
  onPullDownRefresh: function () {},
  onReachBottom: function () {
    var t = this.data,
      e = t.pageNum;
    t.isDone
      ? wx.showToast({
          title: "数据已全部加载完毕",
          icon: "none",
        })
      : (e++,
        this.setData({
          pageNum: e,
        }),
        this.getCargoList());
  },
  onShareAppMessage: function () {
    var t = "/packageB/pages/color-card-management/preview/preview?goodsId=".concat(
      this.data.shareFriendData.goodsid,
    );
    return {
      title: this.data.shareFriendData.name,
      path: t,
      imageUrl: this.data.shareFriendData.img,
    };
  },
});
