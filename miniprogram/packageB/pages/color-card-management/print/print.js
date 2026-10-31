var t = require("../../../../@babel/runtime/helpers/interopRequireDefault").default,
  e = require("../../../../@babel/runtime/helpers/defineProperty");
require("../../../../@babel/runtime/helpers/Arrayincludes");
var objectSpread2 = require("../../../../@babel/runtime/helpers/objectSpread2"),
  a =
    (t(require("../../../../miniprogram_npm/@vant/weapp/toast/toast.js")),
    t(require("../../../../utils/mta_analysis.js"))),
  i =
    (require("../../../../libs/utils/cpcl-exp.js"),
    require("../../../../libs/services/ServicesCard.js").servicesCard),
  app = getApp(),
  r = {
    printGoodsNo: 1,
    printGoodsName: 2,
    printGramWeight: 3,
    printIngredient: 4,
    printBreadth: 5,
    printPrice: 6,
    printMeterLong: 7,
    printDeviation: 8,
    printShrinkage: 9,
  },
  s = [
    "printCode",
    "printGoodsName",
    "printGoodsNo",
    "printGramWeight",
    "printIngredient",
    "printBreadth",
    "printPrice",
    "printShrinkage",
    "printMeterLong",
    "printDeviation",
    "printColorNo",
    "labelType",
  ],
  d = ["printColorNo", "labelType", "printCode"];
Page({
  data: {
    erCodeArr: [
      {
        name: "商品二维码",
        code: 1,
        qrCodeContent: "",
        qrCodeUrl: "",
      },
      {
        name: "微信好友码",
        code: 2,
        qrCodeContent: "",
        qrCodeUrl: "",
      },
      {
        name: "不打印",
        code: 0,
      },
    ],
    showBottom: !1,
    fileList: [],
    image: {
      topStaff: "".concat(app.config.imgHost, "/img/customer/duibuIcon/icon/chi2@2x.png"),
      leftStaff: "".concat(app.config.imgHost, "/img/customer/duibuIcon/icon/chi1@2x.png"),
      unSelect: "/assets/images/icon2nd/symbols-no-select.png",
      select: "/assets/images/icon2nd/symbols-select.png",
    },
    wxcodeUrl: "",
    showCode: !1,
    nowList: [],
    qrCodeContent: "",
    qrCodeUrl: "",
    qrCode: "商品二维码",
    selectSortList: [],
    selectDict: {
      printSortingList: [],
      labelRemark: "",
    },
    miniCodeImgPath: "",
    goodsId: "",
    count: 0,
    detailsData: {},
    input_val: 1,
    labelType: 0,
    array: ["70*40mm", "38*30mm", "60*40mm"],
    remark: "",
    remarkLimit: 18,
    newPrintType: null,
    remarkFocus: !1,
    langType: "1",
    showLoading: !0,
  },
  onLoad: function (t) {
    a.default.Page.init();
    var e = wx.getSystemInfoSync();
    (this.setData({
      sysInfo: e,
      goodsId: t.goodsId,
      newPrintType: t.newPrintType,
    }),
      wx.hideShareMenu());
  },
  bindPickerChange: function (t) {
    2 != this.data.nowList.langType || 1 != t.detail.value
      ? this.ChangePrintDetailsData("labelType", t.detail.value)
      : wx.showToast({
          icon: "none",
          title: "英文仅支持60*40和70*40的标签纸规格",
        });
  },
  inputVal: function (t) {
    var e = t.detail.value.replace(/[^\d]/g, "");
    this.setData({
      input_val: e,
    });
  },
  onShow: function () {
    (this.getPrintDetailsData(),
      this.getCreateQRcodeData(),
      this.getCardDetailsData(),
      this.getPrintType());
  },
  getPrintType: function () {
    var t = this;
    i.newLabelPrint({}).then(function (e) {
      0 === e.code
        ? (null !== e.data &&
            t.setData({
              newPrintType: e.data.mpNewLabelPrint,
            }),
          wx.hideLoading())
        : wx.showToast({
            title: e.msg,
            icon: "none",
          });
    });
  },
  printLink: function () {
    var t, e;
    if (
      ((e = 1 == this.data.nowList.langType ? (1 == this.data.nowList.labelType ? 6 : 18) : 36),
      (null === (t = this.data.nowList) ||
      void 0 === t ||
      null === (t = t.labelRemark) ||
      void 0 === t
        ? void 0
        : t.length) > e)
    )
      wx.showToast({
        title: "备注不得超出" + e + "个字",
        icon: "none",
      });
    else {
      var objectSpread2 = this.data.nowList;
      if (
        0 == objectSpread2.printGoodsName &&
        0 == objectSpread2.printGoodsNo &&
        0 == objectSpread2.printGramWeight &&
        0 == objectSpread2.printIngredient &&
        0 == objectSpread2.printBreadth &&
        0 == objectSpread2.printPrice &&
        0 == objectSpread2.printMeterLong &&
        0 == objectSpread2.printDeviation &&
        0 == objectSpread2.printShrinkage &&
        1 == objectSpread2.printColorNo
      ) {
        var a = this;
        wx.showModal({
          title: "提示",
          content: "是否仅需打印“色号”信息？",
          success: function (t) {
            t.confirm && a.sureColor();
          },
        });
      } else this.printCheck();
    }
  },
  printCheck: function () {
    var t = this,
      e = this.data.nowList,
      objectSpread2 = {
        labelType: Number(e.labelType),
        langType: e.langType,
        printCode: e.printCode,
        printGoodsName: e.printGoodsName,
        printGoodsNo: e.printGoodsNo,
        printGramWeight: e.printGramWeight,
        printIngredient: e.printIngredient,
        printBreadth: e.printBreadth,
        printPrice: e.printPrice,
        printMeterLong: e.printMeterLong,
        printDeviation: e.printDeviation,
        printColorNo: e.printColorNo,
        labelRemark: e.labelRemark,
        printSortingList: e.printSortingList,
        printShrinkage: e.printShrinkage,
        qrCodeContent: this.data.qrCodeContent,
        qrCodeUrl: this.data.qrCodeUrl,
      };
    (wx.showLoading({
      title: "加载中",
    }),
      i.updatePrintInfo(objectSpread2).then(function (e) {
        if (0 == e.code) {
          var a = {
            goodsId: t.data.goodsId,
            copies: t.data.input_val,
            labelType: t.data.array[objectSpread2.labelType],
            langType: "1" === objectSpread2.langType ? "中文" : "英文",
            printType: 1,
          };
          i.printCommand(a).then(function (e) {
            (0 === e.code
              ? (wx.setStorageSync("printCommand", e.data.printCommand),
                wx.setStorageSync("printCommandGp", e.data.printCommandGp),
                wx.setStorageSync("printCommandTTR", e.data.printCommandTTR),
                wx.setStorageSync("printParams", a),
                t.data.newPrintType && 1 == t.data.newPrintType
                  ? wx.navigateTo({
                      url: "/packageB/pages/color-card-management/printing-new/printing-new",
                    })
                  : wx.navigateTo({
                      url: "/packageB/pages/color-card-management/printing/printing",
                    }))
              : wx.showToast({
                  title: e.msg,
                  icon: "none",
                }),
              wx.hideLoading());
          });
        } else
          wx.showToast({
            title: e.msg.result,
            icon: "none",
          });
      }));
  },
  cancel: function () {
    this.setData({
      showBottom: !1,
    });
  },
  getPrintDetailsData: function () {
    var t = this;
    wx.showLoading({
      title: "加载中",
    });
    var e = {
      goodsId: this.data.goodsId,
    };
    i.getPrintInfo(e).then(function (e) {
      if (0 === e.code) {
        if (null !== e.data) {
          var objectSpread2 = e.data;
          objectSpread2.langType =
            objectSpread2.langType && "" != objectSpread2.langType ? objectSpread2.langType : 1;
          var a = "";
          t.data.erCodeArr.map(function (t) {
            objectSpread2.printCode == t.code && (a = t.name);
          });
          var i = !1;
          (2 === objectSpread2.printCode
            ? ((i = !0),
              t.setData({
                "erCodeArr[1].qrCodeContent": objectSpread2.qrCodeContent,
                "erCodeArr[1].qrCodeUrl": objectSpread2.qrCodeUrl,
              }))
            : 1 === objectSpread2.printCode
              ? ((i = !1),
                t.setData({
                  "erCodeArr[0].qrCodeContent": objectSpread2.qrCodeContent,
                  "erCodeArr[0].qrCodeUrl": objectSpread2.qrCodeUrl,
                  fileList: [],
                }))
              : (i = !1),
            t.setData({
              nowList: objectSpread2,
              selectDict: objectSpread2,
              labelType: objectSpread2.labelType,
              qrCode: a,
              showCode: i,
              "fileList[0].url": objectSpread2.qrCodeUrl,
              qrCodeContent: objectSpread2.qrCodeContent,
              qrCodeUrl: objectSpread2.qrCodeUrl,
            }),
            t.getCount());
        }
        wx.hideLoading();
      } else wx.hideLoading();
    });
  },
  changeStatus: function (t) {
    var e = t.currentTarget.id,
      objectSpread2 = 1 == this.data.nowList[e] ? 0 : 1,
      a = r[e];
    (a && this.printSort(1 === objectSpread2, a), this.ChangePrintDetailsData(e, objectSpread2));
  },
  printSort: function (t, e) {
    var objectSpread2 = this.data.nowList.printSortingList || [];
    if (t)
      (null == objectSpread2 ? void 0 : objectSpread2.length) < 6 &&
        (null == objectSpread2 ? void 0 : objectSpread2.indexOf(e)) < 0 &&
        objectSpread2.push(e);
    else {
      var a = objectSpread2.indexOf(e);
      objectSpread2.splice(a, 1);
    }
    this.getPreviewList(objectSpread2);
  },
  afterRead: function (t) {
    var e = t.detail.file,
      a = this;
    wx.uploadFile({
      url: "".concat(app.config.bingxiHost, "/app-api/file/uploadQrCode"),
      filePath: e.tempFilePath,
      name: "file",
      header: {
        "Content-Type": "multipart/form-data",
        Authorization: wx.getStorageSync("token"),
        terminalSource: 6,
        terminalType: 81,
      },
      formData: {
        filePath: "/bdd/pay",
      },
      success: function (t) {
        var i = JSON.parse(t.data);
        if (0 === i.code) {
          var app = i.data.qrCodeContent || i.data.uploadQrCode || "",
            r = i.data.qrCodeUrl || "",
            s = [
              objectSpread2(
                objectSpread2({}, e),
                {},
                {
                  url: r,
                  qrCodeUrl: r,
                  isImage: !0,
                },
              ),
            ];
          (a.setData({
            fileList: s,
            qrCodeContent: app,
            qrCodeUrl: r,
            "nowList.printCode": 2,
            "nowList.qrCodeContent": app,
            "nowList.qrCodeUrl": r,
            qrCode: "微信好友码",
            showCode: !0,
            "erCodeArr[1].qrCodeContent": app,
            "erCodeArr[1].qrCodeUrl": r,
          }),
            wx.showToast({
              title: "上传成功",
              icon: "success",
            }));
        } else
          (wx.showToast({
            title: i.msg || "上传失败",
            icon: "none",
          }),
            a.setData({
              showCode: 2 === a.data.nowList.printCode,
              fileList: [],
              qrCodeContent: "",
              qrCodeUrl: "",
            }));
      },
      fail: function (t) {
        (console.error("上传二维码失败:", t),
          wx.showToast({
            title: "上传失败",
            icon: "none",
          }));
      },
    });
  },
  deletePic: function () {
    this.setData({
      fileList: [],
    });
  },
  ChangePrintDetailsData: function (t, e) {
    if (this.data.cout >= 6 && 1 == e && !d.includes(t))
      wx.showToast({
        icon: "none",
        title: "勾选选项不能超过6个(色号/备注除外)",
      });
    else if (s.includes(t)) {
      var objectSpread2 = JSON.parse(JSON.stringify(this.data.nowList));
      ((objectSpread2[t] = e),
        this.setData({
          nowList: objectSpread2,
        }),
        this.getCount());
    }
  },
  getCreateQRcodeData: function () {
    var t = this;
    wx.showLoading({
      title: "加载中",
    });
    var e = {
      productId: this.data.goodsId,
      companyId: app.globalData.userInfo.companyId,
      envVersion: app.envVersion,
    };
    i.getQRcode(e).then(function (e) {
      0 === e.code
        ? (null !== e.data &&
            t.setData({
              miniCodeImgPath: e.data,
            }),
          wx.hideLoading())
        : (wx.hideLoading(),
          wx.showToast({
            title: e.msg.result,
            icon: "none",
          }));
    });
  },
  getCardDetailsData: function () {
    var t = this;
    wx.showLoading({
      title: "加载中",
    });
    i.ColorCardDetail({}, this.data.goodsId).then(function (e) {
      if (0 === e.code) {
        if (null !== e.data) {
          var objectSpread2 = e.data;
          (t.setData({
            detailsData: objectSpread2,
            "swiper.background": objectSpread2.goodsImgList,
          }),
            t.getPreviewList(t.data.selectDict.printSortingList));
        }
      } else
        (wx.hideLoading(),
          wx.showToast({
            title: e.msg.result,
            icon: "none",
          }));
    });
  },
  getCount: function () {
    var t = this,
      e = 0;
    ([
      "printGoodsName",
      "printGoodsNo",
      "printGramWeight",
      "printIngredient",
      "printBreadth",
      "printPrice",
      "printMeterLong",
      "printDeviation",
    ].forEach(function (n) {
      1 == t.data.nowList[n] && e++;
    }),
      this.setData({
        cout: e,
      }));
  },
  getPreviewList: function (t) {
    var e;
    this.setData({
      showLoading: !0,
    });
    var objectSpread2 = [],
      a = this.data.detailsData,
      i = a.price ? a.price + "/" + a.priceUnit : "-",
      app =
        a.clothWidth && 0 != a.clothWidth && "" != a.clothWidth
          ? a.clothWidth + a.clothWidthUnit
          : " - ",
      r =
        a.gramWeight && 0 != a.gramWeight && "" != a.gramWeight
          ? a.gramWeight + a.weightUnit
          : " - ",
      s =
        a.englishProductName && "" != a.englishProductName
          ? a.englishProductName
          : a.businessProductName,
      d = a.shrinkage,
      l =
        null === (e = a.materialList) || void 0 === e
          ? void 0
          : e
              .filter(function (t) {
                return t;
              })
              .map(function (t) {
                return (t.enName || "") + t.ratio + "%";
              }),
      p = [
        {
          label: "编号",
          EnLabel: "ART.NO.",
          value: a.spuNumber,
          enValue: a.spuNumber,
        },
        {
          label: "品名",
          EnLabel: "DESC",
          value: a.businessProductName,
          enValue: s,
        },
        {
          label: "克重",
          EnLabel: "Weight",
          value: r,
          enValue: r,
        },
        {
          label: "成分",
          EnLabel: "COMP",
          value: a.materialNew || "-",
          enValue: l || "-",
        },
        {
          label: "幅宽",
          EnLabel: "Width",
          value: app,
          enValue: app,
        },
        {
          label: "价格",
          EnLabel: "Price",
          value: i,
          enValue: i,
        },
        {
          label: "米长",
          EnLabel: "Length",
          value: a.meterLength,
          enValue: a.meterLength,
        },
        {
          label: "空差",
          EnLabel: "Shortage",
          value: a.clothEnough,
          enValue: a.clothEnough,
        },
        {
          label: "缩水率",
          EnLabel: "Shrinkage",
          value: d,
          enValue: d,
        },
      ];
    if (t && t.length > 0) for (var c = 0; c < t.length; c++) objectSpread2.push(p[t[c] - 1]);
    this.setData({
      selectSortList: objectSpread2,
      showLoading: !1,
    });
  },
  inputgetName: function (t) {
    (1 == this.data.nowList.labelType &&
      t.detail.value.length > 6 &&
      this.setData({
        remarkFocus: !0,
      }),
      this.setData({
        [t.currentTarget.dataset.name]: t.detail.value,
      }));
  },
  changeLang: function (t) {
    1 != this.data.nowList.labelType
      ? this.setData({
          "nowList.langType": t.currentTarget.id,
        })
      : wx.showToast({
          icon: "none",
          title: "英文仅支持60*40和70*40的标签纸规格",
        });
  },
  sureColor: function () {
    wx.navigateTo({
      url: "/packageB/pages/color-card-management/print-color-num/index?goodsId=".concat(
        this.data.goodsId,
      ),
    });
  },
  changeQRCode: function () {
    this.setData({
      showBottom: !0,
    });
  },
  setQRCode: function (t) {
    var e = t.target.dataset.item;
    (2 === e.code
      ? this.setData({
          showCode: !0,
          qrCodeContent: this.data.erCodeArr[1].qrCodeContent || "",
          qrCodeUrl: this.data.erCodeArr[1].qrCodeUrl || "",
          fileList: this.data.erCodeArr[1].qrCodeUrl
            ? [
                {
                  url: this.data.erCodeArr[1].qrCodeUrl,
                },
              ]
            : [],
        })
      : this.setData({
          showCode: !1,
          qrCodeContent: this.data.nowList.qrCodeContent,
          qrCodeUrl: this.data.nowList.qrCodeUrl,
        }),
      this.setData({
        "nowList.printCode": e.code,
        qrCode: e.name,
      }),
      this.cancel());
  },
});
