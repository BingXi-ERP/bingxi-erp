require("../../../@babel/runtime/helpers/Arrayincludes");
var t = require("../../../@babel/runtime/helpers/regeneratorRuntime"),
  e = require("../../../@babel/runtime/helpers/asyncToGenerator"),
  app = getApp(),
  ServicesUser = require("../../../libs/services/ServicesUser.js").servicesUser,
  releaseCargoPass = require("../../libs/services/releaseCargoPass.js").servicesCargoPass,
  util = require("../../libs/utils/util.js").utils,
  r = "purchasing:model:consulting:buy",
  c = "purchasing:model:company:detail",
  s = {
    LIST: ["imageInfoList", "imageSampleList", "imageDetailList"],
    DUIBU: ["imageTwo0", "imageTwoBack0", "imageFive0", "imageFiveBack0"],
  };
Page({
  data: {
    domain: "",
    orderBtn: !1,
    supplierShow: !0,
    showPhone: !1,
    globalApp: app,
    companyId: "",
    swiper: {
      indicatorDots: !1,
      autoplay: !1,
      circular: !0,
      indicatorcolor: "#000",
      interval: 2e3,
      duration: 100,
    },
    searchNo: "",
    productId: "",
    productData: {},
    detailImage: [],
    bannerImage: [],
    colorImage: [],
    tabsActive: 0,
    supplierData: {},
    propertyConfig: [
      {
        label: "克重",
        icon: "iconGramWeight",
        prop: "gramWeight",
        unitProp: "weightUnit",
      },
      {
        label: "幅宽",
        icon: "iconClothwidth",
        prop: "clothWidth",
        unitProp: "clothWidthUnit",
      },
      {
        label: "空差",
        icon: "iconEngeith",
        prop: "clothEnough",
      },
      {
        label: "成分",
        icon: "iconMaterial",
        prop: "material",
      },
    ],
    showColor: !1,
    iconList: {
      jthViewIcon: "".concat(app.config.imgHost, "/img/customer/duibuIcon/icon/jht_view.png"),
      jhtTimeIcon: "".concat(app.config.imgHost, "/img/customer/duibuIcon/icon/jht_time.png"),
      jhtNoneIcon: "",
      iconGramWeight: "".concat(
        app.config.imgHost,
        "/img/customer/duibuIcon/icon/icon_gramweight.png",
      ),
      iconMaterial: "".concat(app.config.imgHost, "/img/customer/duibuIcon/icon/icon_material.png"),
      iconEngeith: "".concat(app.config.imgHost, "/img/customer/duibuIcon/icon/icon_engeith.png"),
      iconClothwidth: "".concat(
        app.config.imgHost,
        "/img/customer/duibuIcon/icon/icon_clothwidth.png",
      ),
      defaultAvatar: "".concat(app.config.imgHost, "/img/customer/default_shop.png"),
    },
    stayTimeSetInter: null,
    stayTimeMinute: 0,
  },
  onChangeTabs: function (t) {
    var e = t.detail.name;
    1 === e ? this.getProductData() : 2 === e && this.getSupplierData();
  },
  onShowColor: function () {
    this.data.productData.colorList && this.data.productData.colorList.length
      ? this.setData({
          showColor: !0,
        })
      : wx.showToast({
          title: "暂无颜色信息",
          icon: "none",
        });
  },
  onCloseColorPopup: function () {
    this.setData({
      showColor: !1,
    });
  },
  contact: function () {
    this.setData({
      showPhone: !0,
    });
  },
  callPhone: function (t) {
    var e = t.target.dataset.phone;
    e
      ? wx.makePhoneCall({
          phoneNumber: e,
          fail: function () {
            wx.showToast({
              title: "拨打电话失败",
              icon: "none",
            });
          },
        })
      : wx.showToast({
          title: "电话号码不存在",
          icon: "none",
        });
  },
  cancel: function () {
    this.setData({
      showPhone: !1,
    });
  },
  entryShop: function () {
    var t = this.data,
      e = t.productData,
      app = t.supplierData,
      ServicesUser = t.searchNo,
      releaseCargoPass = t.productId,
      util = t.domain;
    e.companyId
      ? wx.navigateTo({
          url: "/packageB/pages/restock-product/shop/index?companyId="
            .concat(e.companyId, "&companyName=")
            .concat(app.companyName || "", "&searchNo=")
            .concat(ServicesUser, "&productId=")
            .concat(releaseCargoPass, "&domain=")
            .concat(util),
        })
      : wx.showToast({
          title: "店铺信息不存在",
          icon: "none",
        });
  },
  processImages: function (t, e, a, o) {
    (s.LIST.forEach(function (a) {
      t[a] &&
        Array.isArray(t[a]) &&
        t[a].forEach(function (t) {
          t.storagePath && e.push(util.replImage(t.storagePath, 750));
        });
    }),
      t.detailImage &&
        s.DUIBU.forEach(function (a) {
          t.detailImage[a] && e.push(util.replImage(t.detailImage[a], 750));
        }),
      t.imageInfoList &&
        Array.isArray(t.imageInfoList) &&
        t.imageInfoList.forEach(function (t) {
          t.storagePath && a.push(util.replImage(t.storagePath, 750));
        }),
      t.imageColorList &&
        Array.isArray(t.imageColorList) &&
        t.imageColorList.forEach(function (t) {
          t.storagePath && o.push(util.replImage(t.storagePath, 750));
        }));
  },
  getProductData: function () {
    var app = this;
    return e(
      t().mark(function e() {
        var ServicesUser, util, r, c, s, u, l, h;
        return t().wrap(
          function (t) {
            for (;;)
              switch ((t.prev = t.next)) {
                case 0:
                  if (((o = app.data.productData), !Object.keys(ServicesUser).length)) {
                    t.next = 1;
                    break;
                  }
                  return t.abrupt("return");
                case 1:
                  return (
                    (i = []),
                    (r = []),
                    (c = []),
                    wx.showLoading({
                      title: "拼命加载中...",
                    }),
                    (t.prev = 2),
                    (t.next = 3),
                    releaseCargoPass.getRestockProduct(
                      app.data.productId,
                      app.data.searchNo,
                      app.data.domain,
                    )
                  );
                case 3:
                  ((s = t.sent),
                    (u = s.code),
                    (l = s.data),
                    0 === u && l
                      ? (app.setData({
                          productData: l,
                        }),
                        app.processImages(l, util, r, c),
                        app.setData({
                          detailImage: util,
                          bannerImage: r,
                          colorImage: c,
                        }))
                      : wx.showToast({
                          title: "加载失败",
                          icon: "none",
                        }),
                    (t.next = 5));
                  break;
                case 4:
                  ((t.prev = 4),
                    (h = t.catch(2)),
                    console.error("获取产品数据失败:", h),
                    wx.showToast({
                      title: "加载失败",
                      icon: "none",
                    }));
                case 5:
                  return ((t.prev = 5), wx.hideLoading(), t.finish(5));
                case 6:
                case "end":
                  return t.stop();
              }
          },
          e,
          null,
          [[2, 4, 5, 6]],
        );
      }),
    )();
  },
  getSupplierData: function () {
    var app = this;
    return e(
      t().mark(function e() {
        var ServicesUser, util, r, c, s, u, l, h;
        return t().wrap(
          function (t) {
            for (;;)
              switch ((t.prev = t.next)) {
                case 0:
                  if (app.data.supplierShow) {
                    t.next = 1;
                    break;
                  }
                  return t.abrupt("return");
                case 1:
                  if (
                    ((o = app.data),
                    (i = ServicesUser.supplierData),
                    (r = ServicesUser.productData),
                    !Object.keys(util).length)
                  ) {
                    t.next = 2;
                    break;
                  }
                  return t.abrupt("return");
                case 2:
                  return (
                    wx.showLoading({
                      title: "拼命加载中...",
                    }),
                    (t.prev = 3),
                    (c = {
                      companyId: r.companyId || app.data.companyId,
                      searchNo: app.data.searchNo,
                      productId: app.data.productId,
                    }),
                    (t.next = 4),
                    releaseCargoPass.getRestockCompany(c, app.data.domain)
                  );
                case 4:
                  ((s = t.sent),
                    (u = s.code),
                    (l = s.data),
                    0 === u && l
                      ? app.setData({
                          supplierData: l,
                        })
                      : wx.showToast({
                          title: "加载失败",
                          icon: "none",
                        }),
                    (t.next = 6));
                  break;
                case 5:
                  ((t.prev = 5),
                    (h = t.catch(3)),
                    console.error("获取供应商信息失败:", h),
                    wx.showToast({
                      title: "加载失败",
                      icon: "none",
                    }));
                case 6:
                  return ((t.prev = 6), wx.hideLoading(), t.finish(6));
                case 7:
                case "end":
                  return t.stop();
              }
          },
          e,
          null,
          [[3, 5, 6, 7]],
        );
      }),
    )();
  },
  onViewColorImage: function (t) {
    var e = t.currentTarget.dataset.item;
    if (e && e.colorImagePath) {
      var app = util.replImage(e.colorImagePath);
      wx.previewImage({
        urls: [app],
        current: app,
        fail: function (t) {
          (console.error("预览图片失败:", t),
            wx.showToast({
              title: "预览图片失败",
              icon: "none",
            }));
        },
      });
    } else
      wx.showToast({
        title: "图片不存在",
        icon: "none",
      });
  },
  onViewDetailImage: function (t) {
    var e = t.currentTarget.dataset.index;
    this.data.detailImage && this.data.detailImage.length
      ? wx.previewImage({
          urls: this.data.detailImage,
          current: this.data.detailImage[e],
          fail: function () {
            wx.showToast({
              title: "预览图片失败",
              icon: "none",
            });
          },
        })
      : wx.showToast({
          title: "暂无图片",
          icon: "none",
        });
  },
  onViewCarouselColorImage: function (t) {
    var e = t.currentTarget.dataset.index;
    this.data.colorImage && this.data.colorImage.length
      ? wx.previewImage({
          urls: this.data.colorImage,
          current: this.data.colorImage[e],
          fail: function (t) {
            (console.error("预览图片失败:", t),
              wx.showToast({
                title: "预览图片失败",
                icon: "none",
              }));
          },
        })
      : wx.showToast({
          title: "暂无图片",
          icon: "none",
        });
  },
  checkUserPermissions: function () {
    var app = this;
    return e(
      t().mark(function e() {
        var releaseCargoPass, util, s;
        return t().wrap(
          function (t) {
            for (;;)
              switch ((t.prev = t.next)) {
                case 0:
                  return ((t.prev = 0), (t.next = 1), ServicesUser.getUserInfo());
                case 1:
                  (0 === (n = t.sent).code &&
                    releaseCargoPass.data &&
                    releaseCargoPass.data.perms &&
                    ((i = releaseCargoPass.data.perms),
                    app.setData({
                      orderBtn: util.includes(r),
                      supplierShow: util.includes(c),
                    })),
                    (t.next = 3));
                  break;
                case 2:
                  ((t.prev = 2), (s = t.catch(0)), console.error("获取用户权限失败:", s));
                case 3:
                case "end":
                  return t.stop();
              }
          },
          e,
          null,
          [[0, 2]],
        );
      }),
    )();
  },
  pauseStayTime: function () {
    var t = wx.getStorageSync("cargoStayTime");
    (t && ((t.stayTime = this.data.stayTimeMinute), wx.setStorageSync("cargoStayTime", t)),
      this.data.stayTimeSetInter &&
        (clearInterval(this.data.stayTimeSetInter),
        this.setData({
          stayTimeSetInter: null,
        })));
  },
  startStayTime: function () {
    var t = this,
      e = wx.getStorageSync("cargoStayTime");
    if (e) {
      this.data.stayTimeMinute = e.stayTime || 0;
      var app = setInterval(function () {
        t.data.stayTimeMinute++;
      }, 1e3);
      this.setData({
        stayTimeSetInter: app,
      });
    }
  },
  onLoad: function (t) {
    (this.setData({
      companyId: t.companyId,
      productId: t.productId,
      searchNo: t.searchNo,
      domain: t.domain,
    }),
      this.getProductData(),
      this.checkUserPermissions());
  },
  onReady: function () {},
  onShow: function () {
    this.startStayTime();
  },
  onHide: function () {
    this.pauseStayTime();
  },
  onUnload: function () {
    this.pauseStayTime();
  },
  onPullDownRefresh: function () {},
  onReachBottom: function () {},
  onShareAppMessage: function () {},
});
