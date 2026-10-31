var t = require("../../../@babel/runtime/helpers/interopRequireDefault").default,
  e = require("../../../@babel/runtime/helpers/regeneratorRuntime"),
  a = require("../../../@babel/runtime/helpers/asyncToGenerator"),
  o = require("../../../@babel/runtime/helpers/defineProperty");
require("../../../@babel/runtime/helpers/Arrayincludes");
var toConsumableArray = require("../../../@babel/runtime/helpers/toConsumableArray"),
  mta_analysis = t(require("../../../utils/mta_analysis.js")),
  util = require("../../../libs/utils/util"),
  r =
    (require("../../../libs/utils/cpcl-exp.js"),
    require("../../../libs/services/ServicesCard.js").servicesCard),
  app = getApp();
Page({
  data: {
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
    settingAllHide: !1,
    hasDetailImage: !0,
    image: {
      topStaff: "".concat(app.config.imgHost, "/img/customer/duibuIcon/icon/chi2@2x.png"),
      leftStaff: "".concat(app.config.imgHost, "/img/customer/duibuIcon/icon/chi1@2x.png"),
      unSelect: "/assets/images/icon2nd/symbols-no-select.png",
      select: "/assets/images/icon2nd/symbols-select.png",
    },
    nowList: [],
    selectSortList: [],
    miniCodeImgPath: "",
    customColorImage: "",
    productId: "",
    count: 0,
    detailsData: {},
    input_val: 1,
    labelType: 0,
    remark: "",
    remarkLimit: 18,
    newPrintType: null,
    remarkFocus: !1,
    langType: "1",
    showLoading: !0,
    showCreateColorCard: !1,
    dateLayTime: 0,
    delaySetInterval: null,
    delImgIcon: "".concat(app.config.imgHost, "/img/customer/Icon_Delete.png?imageView2/2/w/50"),
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
    shareColorList: [],
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
  },
  onLoad: function (t) {
    (console.log(t, "options"), mta_analysis.default.Page.init());
    var e = t.productId;
    (this.setData({
      productId: e,
    }),
      wx.hideShareMenu());
  },
  onShow: function () {
    (wx.removeStorageSync("creterColor"), this.getColorCardDetails());
  },
  deleteImage: function (t) {
    var e = this;
    wx.showModal({
      title: "提示",
      content: "确定要删除此图片吗？",
      success: function (t) {
        if (t.confirm)
          e.setData({
            customColorImage: "",
            "nowList.isRepeatUpload": !1,
          });
        else if (t.cancel) return !1;
      },
    });
  },
  goodsColorImgTap: function (t) {
    var e = t.currentTarget.dataset.src;
    wx.previewImage({
      current: e,
      urls: [e],
    });
  },
  chooseImage: function (t) {
    var e = this;
    wx.chooseMedia({
      sourceType: ["camera", "album"],
      sizeType: ["compressed", "original"],
      count: 1,
      mediaType: ["image"],
      success: function (t) {
        setTimeout(function () {
          wx.showLoading({
            title: "上传中",
          });
        }, 500);
        var a = 0;
        t.tempFiles.map(function (o) {
          wx.uploadFile({
            header: {
              "Content-Type": "multipart/form-data",
              Authorization: wx.getStorageSync("token"),
              terminalSource: 6,
              terminalType: 81,
            },
            formData: {
              type: 4,
            },
            url: "".concat(app.config.bingxiHost, "/app-api/oss/upload"),
            filePath: o.tempFilePath,
            name: "file",
            success: function (o) {
              try {
                var toConsumableArray = JSON.parse(o.data);
                if (0 === toConsumableArray.code) {
                  var mta_analysis = toConsumableArray.data;
                  (e.setData({
                    customColorImage: util.utils.replImage(mta_analysis, 300),
                    "nowList.customColorImage": mta_analysis,
                    "nowList.isRepeatUpload": !0,
                  }),
                    e.onSubColorSettingData());
                } else
                  401 === toConsumableArray.code
                    ? wx.showToast({
                        icon: "none",
                        title: "token失效,请重新上传",
                      })
                    : wx.showToast({
                        icon: "none",
                        title: e.data.msg,
                      });
              } catch (t) {
                wx.showToast({
                  icon: "none",
                  title: "上传图片失败",
                });
              }
              (a += 1) &&
                a === t.tempFiles.length &&
                setTimeout(function () {
                  (console.log("上传完成"), wx.hideLoading());
                }, 500);
            },
            fail: function (t) {},
          });
        });
      },
    });
  },
  onCloseCreateCard: function () {
    var t = this;
    (clearInterval(this.data.delaySetInterval),
      this.setData({
        showCreateColorCard: !1,
        delaySetInterval: null,
      }));
    var e = this.data.colorCardInfo;
    ((e.setting.productId = this.data.productId), this.isSettingHide(e.setting));
    var a = e.colorList || [];
    ((this.data.shareColorList = a),
      (e.setting.colorValCount = a.filter(function (t) {
        return t.colorValue;
      }).length));
    var o = e.setting.shape,
      mta_analysis = 0 === e.setting.showImageTwo ? 130 : 0,
      util = 0 === e.setting.showRemark ? 20 : 0,
      r = this.data.shareColorList.filter(function (t) {
        return t.colorImagePath;
      }),
      app =
        Math.ceil(this.data.shareColorList.length / 4) * (2 === o ? 92 : 82) +
        355 +
        (r.length / 4) * 8 -
        mta_analysis -
        util -
        (this.data.settingAllHide ? 140 : 0);
    (this.setData({
      "popupInit.canvasHeight": app < 550 ? (r.length > 8 ? 650 : 550) : app,
      "popupInit.canvasHeight2": app < 550 ? (r.length > 8 ? 1150 : 1050) : 2 * app,
    }),
      wx.setStorageSync("colorCaraSetting", e.setting));
    var c = [
      this.getColorCardImg("color_def"),
      this.getColorCardImg("color_def2"),
      this.getQRCode(this.data.productId),
    ];
    if (1 === e.setting.showImageTwo) {
      var h = [this.getColorCardImg("imageTwo0"), this.getColorCardImg("imageTwoBack0")];
      c = [].concat(toConsumableArray(c), h);
    }
    if (0 === e.setting.showImageTwo) {
      var g = [this.getColorCardImg("clothImage1"), this.getColorCardImg("clothImage2")];
      c = [].concat(toConsumableArray(c), g);
    }
    Promise.all(c).then(function () {
      t.drawShareImg(t.data.shareColorList, 0);
    });
  },
  carterColorCard: function () {
    if (2 !== this.data.nowList.colorImage || this.data.customColorImage) {
      if (
        (wx.setStorageSync("creterColor", this.data.productId),
        2 === this.data.nowList.colorImage &&
          this.data.nowList.customColorImage &&
          this.data.nowList.isRepeatUpload)
      ) {
        var t = this;
        this.data.nowList.colorValCount > 0 &&
          (this.setData({
            showCreateColorCard: !0,
            dateLayTime: 3 * this.data.nowList.colorValCount,
          }),
          (this.data.delaySetInterval = setInterval(function () {
            (t.setData({
              dateLayTime: t.data.dateLayTime - 1,
            }),
              0 === t.data.dateLayTime && t.onCloseCreateCard());
          }, 1e3)));
      } else this.onCloseCreateCard();
    } else
      wx.showToast({
        title: "自定义图片不能为空",
        icon: "error",
      });
  },
  closePopup: function () {
    this.setData({
      "popupInit.canvas.show": !1,
      "popupInit.canvas.type": "",
      shareColorList: [],
    });
  },
  getColorCardImg: function (t) {
    var e = this;
    return new Promise(function (a, s) {
      var mta_analysis = "";
      if (t.includes("clothImage")) {
        var r = e.data.colorCardInfo.imageInfoList
          ? e.data.colorCardInfo.imageInfoList.slice(0, 2)
          : [];
        r &&
          r.length &&
          (r[0] &&
            r[0].storagePath &&
            "clothImage1" === t &&
            (n = util.utils.replImage(r[0].storagePath)),
          r[1] &&
            r[1].storagePath &&
            "clothImage2" === t &&
            (n = util.utils.replImage(r[1].storagePath)));
      } else
        n =
          (e.data.colorCardInfo.detailImage &&
            util.utils.replImage(e.data.colorCardInfo.detailImage[t])) ||
          e.data.icon.def_img;
      ("color_def" === t && (n = e.data.icon.color_def),
        "color_def2" === t && (n = e.data.icon.color_def2),
        mta_analysis || (n = e.data.icon.def_img),
        wx.getImageInfo({
          src: mta_analysis,
          success: function (s) {
            if ("getImageInfo:ok" === s.errMsg) {
              console.log(s.path);
              var mta_analysis = "colorCardInfo." + t;
              (e.setData({
                mta_analysis: s.path,
              }),
                a());
            } else (a(e.data.icon.def_img), wx.hideLoading());
          },
        }));
    });
  },
  saveColorCardImg: function () {
    "colorCard" === this.data.popupInit.canvas.type
      ? this.saveCanvas(0)
      : this.saveCanvas({
          type: "prod",
        });
  },
  getQRCode: function (t) {
    var e = this;
    return new Promise(function (a, o) {
      var toConsumableArray = {
        productId: t,
        companyId: app.globalData.userInfo.companyId,
        envVersion: app.envVersion,
      };
      r.getQRcode(toConsumableArray).then(function (t) {
        if (0 === t.code) {
          var o = t.data;
          wx.getImageInfo({
            src: o,
            success: function (t) {
              (console.log("res3", t),
                e.setData({
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
  isSettingHide: function (t) {
    var e = t.showContacts,
      a = t.showPrice,
      o = t.showProductName,
      toConsumableArray = t.showQrcode,
      mta_analysis = t.showRemark,
      util = t.showClothEnough,
      r = t.showClothWidth,
      app = t.showGramWeight,
      c = t.showMaterial,
      h = t.showShelvesNumber,
      g = !(
        0 !== e ||
        0 !== a ||
        0 !== o ||
        0 !== h ||
        0 !== toConsumableArray ||
        0 !== mta_analysis ||
        0 !== util ||
        0 !== r ||
        0 !== app ||
        0 !== c
      );
    this.setData({
      settingAllHide: g,
    });
  },
  getColorCardDetails: function () {
    var t = this;
    wx.showLoading({
      title: "加载中",
    });
    var e = {
      productId: this.data.productId,
    };
    (this.setData({
      "popupInit.canvas.type": "colorCard",
      shareColorList: [],
    }),
      r.colorCardDetails(e).then(function (e) {
        if ((console.log("获取色卡设置信息"), console.log(e), 0 === e.code)) {
          var a = e.data.setting;
          t.setData({
            colorCardInfo: e.data,
            nowList: a,
            customColorImage: a.customColorImage
              ? util.utils.replImage(a.customColorImage, 300)
              : "",
            labelType: e.data.labelType,
          });
        }
        wx.hideLoading();
      }));
  },
  drawShareImg: function (t, o) {
    var toConsumableArray = this;
    return a(
      e().mark(function a() {
        var mta_analysis, util, r, app;
        return e().wrap(function (e) {
          for (;;)
            switch ((e.prev = e.next)) {
              case 0:
                return (
                  (n = toConsumableArray.data.popupInit.canvas.canvasId.shareCanvas + o),
                  (i = toConsumableArray.data.popupInit.canvas.canvasId.photoCanvas + o),
                  (r = wx.createCanvasContext(mta_analysis)),
                  (l = wx.createCanvasContext(util)),
                  (e.next = 1),
                  toConsumableArray.drawColorShare(r, t, 1)
                );
              case 1:
                return ((e.next = 2), toConsumableArray.drawColorShare(app, t, 2));
              case 2:
                (toConsumableArray.setData({
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
  inputgetName: function (t) {
    (this.setData({
      [t.currentTarget.dataset.name]: t.detail.value,
    }),
      this.onChangeSetting("remark", t.detail.value));
  },
  changeStatus: function (t) {
    var e,
      a = this.data.nowList;
    switch (t.currentTarget.id) {
      case "shape":
        ((e = 1 == a.shape ? 0 : 1), this.onChangeSetting("shape", e));
        break;
      case "shape2":
        ((e = 2 == a.shape ? 0 : 2), this.onChangeSetting("shape", e));
        break;
      case "colorImage":
        ((e = 1 == a.colorImage ? 0 : 1), this.onChangeSetting("colorImage", e));
        break;
      case "colorImage2":
        ((e = 2 == a.colorImage ? 0 : 2), this.onChangeSetting("colorImage", e));
        break;
      case "showImageTwo":
        ((e = 1 == a.showImageTwo ? 0 : 1), this.onChangeSetting("showImageTwo", e));
        break;
      case "showImageTwo2":
        ((e = 0 == a.showImageTwo ? 1 : 0), this.onChangeSetting("showImageTwo", e));
        break;
      case "showQrcode":
        ((e = 1 == a.showQrcode ? 0 : 1), this.onChangeSetting("showQrcode", e));
        break;
      case "showProductName":
        ((e = 1 == a.showProductName ? 0 : 1), this.onChangeSetting("showProductName", e));
        break;
      case "showShelvesNumber":
        ((e = 1 == a.showShelvesNumber ? 0 : 1), this.onChangeSetting("showShelvesNumber", e));
        break;
      case "showPrice":
        ((e = 1 == a.showPrice ? 0 : 1), this.onChangeSetting("showPrice", e));
        break;
      case "showContacts":
        ((e = 1 == a.showContacts ? 0 : 1), this.onChangeSetting("showContacts", e));
        break;
      case "showRemark":
        ((e = 1 == a.showRemark ? 0 : 1), this.onChangeSetting("showRemark", e));
        break;
      case "showMaterial":
        ((e = 1 == a.showMaterial ? 0 : 1), this.onChangeSetting("showMaterial", e));
        break;
      case "showGramWeight":
        ((e = 1 == a.showGramWeight ? 0 : 1), this.onChangeSetting("showGramWeight", e));
        break;
      case "showClothWidth":
        ((e = 1 == a.showClothWidth ? 0 : 1), this.onChangeSetting("showClothWidth", e));
        break;
      case "showClothEnough":
        ((e = 1 == a.showClothEnough ? 0 : 1), this.onChangeSetting("showClothEnough", e));
    }
  },
  onChangeSetting: function (t, e) {
    ((this.data.nowList[t] = e),
      this.setData({
        nowList: this.data.nowList,
      }),
      ("colorImage" !== t || 2 !== e || this.data.customColorImage) &&
        this.onSubColorSettingData());
  },
  drawColorShare: function (t, o) {
    var toConsumableArray = arguments,
      mta_analysis = this;
    return a(
      e().mark(function a() {
        var r,
          app,
          c,
          h,
          g,
          d,
          m,
          u,
          f,
          p,
          w,
          I,
          C,
          v,
          S,
          x,
          T,
          b,
          P,
          y,
          k,
          A,
          L,
          F,
          D,
          M,
          _,
          H,
          R,
          N,
          z,
          q,
          V,
          W,
          U,
          Q,
          E,
          G,
          j,
          B,
          J,
          O,
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
                ((r =
                  toConsumableArray.length > 2 && void 0 !== toConsumableArray[2]
                    ? toConsumableArray[2]
                    : 1),
                  (l = mta_analysis.data.colorCardInfo),
                  (c = app.businessProductName),
                  (h = app.companyName),
                  (g = app.price),
                  (d = app.priceUnit),
                  (m = app.imageTwo0),
                  (u = app.imageTwoBack0),
                  (f = app.clothImage1),
                  (p = app.clothImage2),
                  (w = app.concats),
                  (I = app.phone),
                  (C = app.material),
                  (v = app.clothEnough),
                  (S = app.clothWidth),
                  (x = app.gramWeight),
                  (T = app.shelvesNumber),
                  (b = c || "-"),
                  (P = (P = h || "-").length > 17 ? P.substring(0, 17) + "..." : P),
                  (y = T || "-"),
                  (k = ""),
                  "",
                  0 != g && "0.0" != g && g
                    ? (k = g ? "¥ ".concat(g, "/").concat(d) : "")
                    : ((k = "面议"), ""),
                  (A = mta_analysis.data.colorCardInfo.remark || ""),
                  mta_analysis.data.tempImgUrl.goodUrl,
                  (L = mta_analysis.data.tempImgUrl.qrUrl),
                  (F = m),
                  (D = u),
                  (M = f),
                  (_ = p),
                  (H = mta_analysis.data.colorCardInfo.color_def),
                  (R = mta_analysis.data.colorCardInfo.color_def2),
                  (N = w > 10 ? w.substring(0, 10) + "..." : w),
                  (z = I || ""),
                  (q = "克重：" + (x || "-")),
                  (V = "幅宽：" + (S || "-")),
                  (W = "空差：" + (v || "-")),
                  (U = mta_analysis.data.colorCardInfo.setting),
                  (Q = mta_analysis.data.settingAllHide ? 140 * r : 0),
                  t.setFillStyle("white"),
                  mta_analysis.roundRect(
                    t,
                    0 * r,
                    0 * r,
                    305 * r,
                    mta_analysis.data.popupInit.canvasHeight * r,
                    8,
                    "#ffffff",
                  ),
                  t.setFillStyle("#000000"),
                  (t.font = "normal bold ".concat(16 * r, "px Arial, sans-serif")),
                  t.setTextAlign("center"),
                  t.fillText(P, 155 * r, 30 * r),
                  1 === U.showQrcode && t.drawImage(L, 210 * r, 62 * r, 80 * r, 80 * r),
                  1 === U.showProductName &&
                    (t.setFontSize(14 * r),
                    t.setFillStyle("#000000"),
                    (t.font = "normal 400 ".concat(14 * r, "px Arial, sans-serif")),
                    t.setTextAlign("left"),
                    t.fillText(b.length > 19 ? b.substring(0, 19) + "..." : b, 20 * r, 55 * r)),
                  1 === U.showShelvesNumber &&
                    (t.setFillStyle("#000000"),
                    (t.font = "normal bold ".concat(14 * r, "px Arial, sans-serif")),
                    t.setTextAlign("left"),
                    t.fillText(y, 20 * r, 75 * r)),
                  1 === U.showPrice &&
                    (t.setFillStyle("#FF2332"),
                    (t.font = "normal bold ".concat(14 * r, "px Arial, sans-serif")),
                    t.setTextAlign("left"),
                    t.fillText(k, 20 * r, 95 * r)),
                  1 === U.showMaterial &&
                    ((G = (E = "成分：" + (C || "-")).length > 15 ? E.substring(0, 15) : E),
                    (j = E.length > 15 ? E.substring(15, 28) + "..." : ""),
                    t.setFillStyle("#808080"),
                    (t.font = "normal 400 ".concat(14 * r, "px Arial, sans-serif")),
                    t.setTextAlign("left"),
                    t.fillText(G, 20 * r, 115 * r),
                    "" != j &&
                      (t.setFillStyle("#808080"),
                      (t.font = "normal 400 ".concat(14 * r, "px Arial, sans-serif")),
                      t.setTextAlign("left"),
                      t.fillText(j, 20 * r, 131 * r))),
                  1 === U.showGramWeight &&
                    (t.setFontSize(14),
                    t.setFillStyle("#808080"),
                    (t.font = "normal 400 ".concat(14 * r, "px Arial, sans-serif")),
                    t.setTextAlign("left"),
                    t.fillText(q, 20 * r, 147 * r)),
                  1 === U.showClothWidth &&
                    (t.setFontSize(14),
                    t.setFillStyle("#808080"),
                    (t.font = "normal 400 ".concat(14 * r, "px Arial, sans-serif")),
                    t.setTextAlign("left"),
                    t.fillText(V, 20 * r, 166 * r)),
                  1 === U.showClothEnough &&
                    (t.setFontSize(14),
                    t.setFillStyle("#808080"),
                    (t.font = "normal 400 ".concat(14 * r, "px Arial, sans-serif")),
                    t.setTextAlign("left"),
                    t.fillText(W, 20 * r, 185 * r)),
                  1 === U.showRemark &&
                    (t.setFontSize(12 * r),
                    t.setFillStyle("#c1c1c1"),
                    t.setTextAlign("left"),
                    t.fillText(A && A.length < 20 ? A : A.substring(0, 20), 20 * r, 210 * r),
                    A.length > 20 &&
                      (t.setFontSize(12 * r),
                      t.setFillStyle("#c1c1c1"),
                      t.setTextAlign("left"),
                      t.fillText(A.substring(20, A.length), 20 * r, 215 * r))),
                  1 === U.showContacts &&
                    (t.setFontSize(12 * r),
                    t.setFillStyle("#808080"),
                    t.setTextAlign("right"),
                    (t.font = "normal 400 ".concat(12 * r, "px Arial, sans-serif")),
                    t.fillText(N, 290 * r, 160 * r),
                    t.setFontSize(12 * r),
                    t.setFillStyle("#808080"),
                    t.setTextAlign("right"),
                    (t.font = "normal 400 ".concat(12 * r, "px Arial, sans-serif")),
                    t.fillText(z, 290 * r, 175 * r)),
                  (B = 0 === U.showRemark ? 200 : 230),
                  U.showImageTwo >= 0 &&
                    (mta_analysis.drawProdImage(
                      t,
                      16 * r,
                      B * r - Q,
                      131 * r,
                      102 * r,
                      4 * r,
                      1 === U.showImageTwo ? F : M,
                    ),
                    (t.globalAlpha = 0.3),
                    (t.globalAlpha = 1),
                    t.setFontSize(10 * r),
                    t.setFillStyle("#000000"),
                    t.setTextAlign("center"),
                    t.fillText(
                      "".concat(1 === U.showImageTwo ? "正面细节图" : ""),
                      80 * r,
                      (B + 117) * r - Q,
                    ),
                    mta_analysis.drawProdImage(
                      t,
                      160 * r,
                      B * r - Q,
                      131 * r,
                      102 * r,
                      4 * r,
                      1 === U.showImageTwo ? D : _,
                    ),
                    (t.globalAlpha = 0.3),
                    (t.globalAlpha = 1),
                    t.setFontSize(10 * r),
                    t.setFillStyle("#000000"),
                    t.setTextAlign("center"),
                    t.fillText(
                      "".concat(1 === U.showImageTwo ? "背面细节图" : ""),
                      225 * r,
                      (B + 117) * r - Q,
                    )),
                  (J = 1),
                  (O = -56 * r),
                  (K = 0),
                  (X = 0),
                  (Y = 0 === U.showRemark ? 30 : 0),
                  (Z = 0));
              case 1:
                if (!(Z < o.length)) {
                  e.next = 5;
                  break;
                }
                if (
                  (($ = o[Z]),
                  (O += (71 + (2 === U.shape ? 3 : 0)) * r),
                  (K =
                    J * (82 * r + (2 === U.shape ? 10 * r : 0)) +
                    ((2 === U.shape ? 265 * r - X - Y : 275 * r - X - Y) - Q)),
                  (tt = $.colorVal || ""),
                  (et = $.colorName || ""),
                  $.colorImagePath)
                ) {
                  e.next = 2;
                  break;
                }
                (2 === U.shape
                  ? $.colorValue
                    ? mta_analysis.roundRect(t, O, K, 48 * r, 48 * r, 24 * r, $.colorValue || "")
                    : mta_analysis.drawProdImage(t, O, K, 48 * r, 48 * r, 24 * r, R)
                  : $.colorValue
                    ? mta_analysis.roundRect(t, O, K, 62 * r, 38 * r, 4 * r, $.colorValue || "")
                    : mta_analysis.drawProdImage(t, O, K, 62 * r, 38 * r, 4 * r, H),
                  (at = mta_analysis.data.color_icon),
                  mta_analysis.drawProdImage(
                    t,
                    O + 30 * r + (2 === U.shape ? -8 * r : 0) - (3 * tt.length + 9) * r,
                    K + 44 * r + (2 === U.shape ? 8 * r : 0),
                    10 * r,
                    10 * r,
                    0 * r,
                    at,
                  ),
                  (e.next = 3));
                break;
              case 2:
                return (
                  (e.next = 3),
                  mta_analysis
                    .getCanvasColorImg(util.utils.replImage($.colorImagePath, 122))
                    .then(function (e) {
                      2 === U.shape
                        ? mta_analysis.drawProdImage(t, O - 6, K, 60 * r, 60 * r, 30 * r, e)
                        : mta_analysis.drawProdImage(t, O, K, 62 * r, 41 * r, 4 * r, e);
                    })
                );
              case 3:
                (t.setFontSize(10 * r),
                  t.setFillStyle("#333333"),
                  t.setTextAlign("center"),
                  t.fillText(
                    tt,
                    O + 30 * r + (2 === U.shape ? -8 * r : 0),
                    K + 52 * r + (2 === U.shape ? ($.colorImagePath ? 18 * r : 8 * r) : 0),
                  ),
                  t.setFontSize(10 * r),
                  t.setFillStyle("#333333"),
                  t.setTextAlign("center"),
                  t.fillText(
                    et,
                    O + 30 * r + (2 === U.shape ? -8 * r : 0),
                    K + 64 * r + (2 === U.shape ? ($.colorImagePath ? 18 * r : 8 * r) : 0),
                  ),
                  (Z + 1) % 4 == 0 && ((J += 1), (O = -56 * r)));
              case 4:
                (Z++, (e.next = 1));
                break;
              case 5:
                ("秉羲工作台·技术支持",
                  t.setFontSize(10 * r),
                  t.setFillStyle("#d8d8d8"),
                  t.setTextAlign("center"),
                  t.fillText(
                    "秉羲工作台·技术支持",
                    160 * r,
                    mta_analysis.data.popupInit.canvasHeight * r - 10,
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
  drawProdImage: function (t, e, a, o, s, n, i, r) {
    i &&
      (t.save(),
      t.beginPath(),
      "top" === r
        ? (t.arc(e + n, a + n, n, Math.PI, 1.5 * Math.PI),
          t.arc(e + o - n, a + n, n, 1.5 * Math.PI, 2 * Math.PI),
          t.arc(e + o - n, a + s - n, n, 0, 0),
          t.arc(e + n, a + s - n, n, Math.PI, Math.PI))
        : (t.arc(e + n, a + n, n, Math.PI, 1.5 * Math.PI),
          t.arc(e + o - n, a + n, n, 1.5 * Math.PI, 2 * Math.PI),
          t.arc(e + o - n, a + s - n, n, 0, 0.5 * Math.PI),
          t.arc(e + n, a + s - n, n, 0.5 * Math.PI, Math.PI)),
      t.clip(),
      t.drawImage(i, e, a, o, s),
      t.restore(),
      (t.strokeStyle = "#fff"));
  },
  roundRect: function (t, e, a, o, s, n, i) {
    (t.setLineDash(),
      t.beginPath(),
      t.setFillStyle(i),
      t.setStrokeStyle("#ffffff"),
      t.arc(e + n, a + n, n, Math.PI, 1.5 * Math.PI),
      t.arc(e + o - n, a + n, n, 1.5 * Math.PI, 2 * Math.PI),
      t.arc(e + o - n, a + s - n, n, 0, 0.5 * Math.PI),
      t.arc(e + n, a + s - n, n, 0.5 * Math.PI, Math.PI),
      t.lineTo(e, a + n),
      t.fill(),
      t.stroke(),
      t.closePath());
  },
  onSubColorSettingData: function () {
    var t = this;
    r.colorCardSetting(this.data.nowList).then(function (e) {
      0 === e.code && wx.setStorageSync("colorCaraSetting", t.data.nowList);
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
  saveCanvas: function (t) {
    var o = this;
    return a(
      e().mark(function a() {
        var toConsumableArray, mta_analysis, util, c;
        return e().wrap(function (e) {
          for (;;)
            switch ((e.prev = e.next)) {
              case 0:
                ((s = o),
                  (n = o.data.productId),
                  (i = ""),
                  (i =
                    null == t || t.type
                      ? o.data.popupInit.canvas.canvasId.shareCanvas
                      : o.data.popupInit.canvas.canvasId.shareCanvas + t),
                  wx.showLoading({
                    title: "正在保存图片...",
                    mask: !0,
                  }),
                  (c = setTimeout(function () {
                    wx.canvasToTempFilePath(
                      {
                        x: 0,
                        y: 0,
                        canvasId: util,
                        success: function (t) {
                          (wx.hideLoading(),
                            wx.saveImageToPhotosAlbum({
                              filePath: t.tempFilePath,
                              success: function () {
                                (wx.showToast({
                                  title: "图片已保存到相册",
                                  icon: "success",
                                }),
                                  o.closePopup());
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
                                            o.setData({
                                              showAuth: !0,
                                            });
                                          },
                                        });
                                    },
                                  });
                              },
                            }),
                            clearTimeout(c),
                            wx.uploadFile({
                              header: {
                                "Content-Type": "multipart/form-data",
                                Authorization: wx.getStorageSync("token"),
                                terminalSource: 6,
                                terminalType: 81,
                              },
                              formData: {
                                type: 4,
                              },
                              url: "".concat(app.config.bingxiHost, "/app-api/oss/upload"),
                              filePath: t.tempFilePath,
                              name: "file",
                              success: function (t) {
                                try {
                                  var e = JSON.parse(t.data);
                                  if ((console.log(e, "fileRepData"), 0 === e.code)) {
                                    var a = {
                                      productId: mta_analysis,
                                      shareColorImg: e.data,
                                    };
                                    r.saveColorCardImage(a);
                                  }
                                } catch (t) {
                                  console.log(t, "err");
                                }
                              },
                              fail: function (t) {
                                console.log("err", t);
                              },
                            }));
                        },
                      },
                      toConsumableArray,
                    );
                  }, 1e3)));
              case 1:
              case "end":
                return e.stop();
            }
        }, a);
      }),
    )();
  },
});
