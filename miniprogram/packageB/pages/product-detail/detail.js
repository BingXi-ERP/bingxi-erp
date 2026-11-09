var e = require("../../../@babel/runtime/helpers/defineProperty"),
  t = require("../../../@babel/runtime/helpers/regeneratorRuntime"),
  a = require("../../../@babel/runtime/helpers/asyncToGenerator"),
  app = getApp(),
  i =
    (require("../../../libs/services/ServicesUser.js").servicesUser,
    require("../../libs/services/releaseCargoPass.js").servicesCargoPass),
  util = require("../../libs/utils/util.js").utils;
Page({
  data: {
    orderBtn: !1,
    supplierShow: !0,
    showPhone: !1,
    globalApp: app,
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
        label: "成分",
        icon: "iconMaterial",
        prop: "material",
      },
      {
        label: "克重",
        icon: "iconGramWeight",
        prop: "gramWeight",
        unitProp: "weightUnit",
      },
      {
        label: "门幅",
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
        label: "工艺",
        icon: "iconMaterial",
        prop: "predictPostProcess",
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
  },
  onShowColor: function () {
    this.data.productData.colorList
      ? this.setData({
          showColor: !0,
        })
      : wx.showToast({
          title: "无颜色",
          icon: "error",
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
  callPhone: function (e) {
    var t = e.target.dataset.phone;
    wx.makePhoneCall({
      phoneNumber: t,
    });
  },
  cancel: function () {
    this.setData({
      showPhone: !1,
    });
  },
  getProductData: function () {
    var e = this;
    return a(
      t().mark(function a() {
        var app, r, c, s, g, l, u, m, h, d;
        return t().wrap(function (t) {
          for (;;)
            switch ((t.prev = t.next)) {
              case 0:
                if (
                  ((o = e.data),
                  (r = app.detailImage),
                  (c = app.bannerImage),
                  (s = app.productData),
                  (g = app.colorImage),
                  !Object.keys(s).length)
                ) {
                  t.next = 1;
                  break;
                }
                return t.abrupt("return");
              case 1:
                return (
                  wx.showLoading({
                    title: "拼命加载中...",
                  }),
                  console.log(e.data, "这里11"),
                  (t.next = 2),
                  i.getProductInfo(e.data.productId, e.data.searchNo)
                );
              case 2:
                if (((l = t.sent), (u = l.code), (m = l.data), 0 !== u)) {
                  t.next = 4;
                  break;
                }
                if ((wx.hideLoading(), m)) {
                  t.next = 3;
                  break;
                }
                return t.abrupt("return");
              case 3:
                (e.setData({
                  productData: m,
                }),
                  (h = [
                    "imageTwo0",
                    "imageTwoBack0",
                    "imageFive0",
                    "imageFiveBack0",
                    "imageFive0",
                  ]),
                  ["imageInfoList", "imageSampleList", "imageDetailList"].forEach(function (e) {
                    var t;
                    m[e] &&
                      (console.log(m[e], "data[f]---"),
                      null === (t = m[e]) ||
                        void 0 === t ||
                        t.forEach(function (e) {
                          r.push(util.replImage(e.storagePath, 750));
                        }));
                  }),
                  (d = m.detailImage.imageTwo0),
                  m.detailImage &&
                    h.forEach(function (e) {
                      m.detailImage[e] &&
                        (console.log(m.detailImage[e], "data.detailImage[f]"),
                        r.push(util.replImage(m.detailImage[e], 750)));
                    }),
                  m.imageInfoList &&
                    m.imageInfoList.forEach(function (e) {
                      c.push(util.replImage(e.storagePath, 750));
                    }),
                  m.imageColorList &&
                    m.imageColorList.forEach(function (e) {
                      g.push(util.replImage(e.storagePath, 750));
                    }),
                  0 === c.length && c.push(util.replImage(d, 750)),
                  e.setData({
                    detailImage: r,
                    bannerImage: c,
                    colorImage: g,
                  }));
              case 4:
              case "end":
                return t.stop();
            }
        }, a);
      }),
    )();
  },
  onViewColorImage: function (e) {
    var t = e.currentTarget.dataset.item;
    wx.previewImage({
      urls: [util.replImage(t.colorImagePath)],
      current: util.replImage(t.colorImagePath),
      fail: function () {
        wx.showToast({
          title: "预览图片失败",
          icon: "none",
        });
      },
    });
  },
  onViewDetailImage: function (e) {
    var t = e.currentTarget.dataset.index;
    wx.previewImage({
      urls: this.data.detailImage,
      current: this.data.detailImage[t],
      fail: function () {
        wx.showToast({
          title: "预览图片失败",
          icon: "none",
        });
      },
    });
  },
  onViewColorImage: function (e) {
    var t = e.currentTarget.dataset.index;
    wx.previewImage({
      urls: this.data.colorImage,
      current: this.data.colorImage[t],
      fail: function () {
        wx.showToast({
          title: "预览图片失败",
          icon: "none",
        });
      },
    });
  },
  onLoad: function (e) {
    (console.log(e, "1122"),
      this.setData({
        productId: e.domainProductId,
        searchNo: e.appId,
      }),
      this.getProductData());
  },
  onReady: function () {},
  pauseStayTime: function () {
    var e = wx.getStorageSync("cargoStayTime");
    e &&
      ((e.stayTime = this.data.stayTimeMinute),
      wx.setStorageSync("cargoStayTime", e),
      clearInterval(this.data.stayTimeSetInter));
  },
  onShow: function () {
    var e = this,
      t = wx.getStorageSync("cargoStayTime");
    t &&
      ((this.data.stayTimeMinute = t.stayTime),
      (this.data.stayTimeSetInter = setInterval(function () {
        e.data.stayTimeMinute++;
      }, 1e3)));
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
