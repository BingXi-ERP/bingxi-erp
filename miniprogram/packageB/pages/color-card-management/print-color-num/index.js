var n = require("../../../../@babel/runtime/helpers/interopRequireDefault").default,
  objectSpread2 = require("../../../../@babel/runtime/helpers/objectSpread2"),
  ServicesCard = require("../../../libs/services/ServicesCard"),
  ServicesPrint = n(require("../../../libs/services/ServicesPrint")),
  app = getApp();
Page({
  data: {
    firstShow: !1,
    curIndex: 0,
    arrangeIndex: 0,
    printImgIndex: 0,
    input_val: 1,
    showTextImg: !1,
    colorSample: [
      {
        index: 0,
        checked: !0,
        value: "一行2个",
      },
      {
        index: 1,
        checked: !1,
        value: "一行3个",
      },
      {
        index: 2,
        checked: !1,
        value: "一行4个",
      },
    ],
    printArrange: [
      {
        index: 0,
        checked: !0,
        value: "色号竖排",
      },
      {
        index: 1,
        checked: !1,
        value: "色号横排",
      },
    ],
    array: ["70*40mm", "38*30mm", "60*40mm"],
    labelType: 0,
    langType: "1",
    iconImg: {
      choosed: "".concat(app.config.imgHost, "/img/v2.7.7/Control_Choiced@2x.png"),
      noChoose: "".concat(app.config.imgHost, "/img/v2.7.7/Control_NotChoice@2x.png"),
      cnExample: "".concat(app.config.imgHost, "/img/v2.7.7/example.png"),
      enExample: "".concat(app.config.imgHost, "/img/v2.12.0/en_example.png"),
    },
    showPrintImg: [
      "".concat(app.config.imgHost, "/img/v2.7.7/noIndex_column_2.png"),
      "".concat(app.config.imgHost, "/img/v2.7.7/noIndex_column_3.png"),
      "".concat(app.config.imgHost, "/img/v2.7.7/noIndex_column_4.png"),
      "".concat(app.config.imgHost, "/img/v2.7.7/noIndex_row_2.png"),
      "".concat(app.config.imgHost, "/img/v2.7.7/noIndex_row_3.png"),
      "".concat(app.config.imgHost, "/img/v2.7.7/noIndex_row_4.png"),
    ],
    showIndexPrintImg: [
      "".concat(app.config.imgHost, "/img/v2.7.7/index_column_2.png"),
      "".concat(app.config.imgHost, "/img/v2.7.7/index_column_3.png"),
      "".concat(app.config.imgHost, "/img/v2.7.7.1/index_column_4.png"),
      "".concat(app.config.imgHost, "/img/v2.7.7/index_row_2.png"),
      "".concat(app.config.imgHost, "/img/v2.7.7/index_row_3.png"),
      "".concat(app.config.imgHost, "/img/v2.7.7.1/index_row_4.png"),
    ],
    enPrintImg: [
      "".concat(app.config.imgHost, "/img/v2.12.0/noIndex_column_2.png"),
      "".concat(app.config.imgHost, "/img/v2.12.0/noIndex_column_3.png"),
      "",
      "".concat(app.config.imgHost, "/img/v2.12.0/noIndex_row_2.png"),
      "".concat(app.config.imgHost, "/img/v2.12.0/noIndex_row_3.png"),
      "",
    ],
    enIndexPrintImg: [
      "".concat(app.config.imgHost, "/img/v2.12.0/column_2.png"),
      "".concat(app.config.imgHost, "/img/v2.12.0/column_3.png"),
      "",
      "".concat(app.config.imgHost, "/img/v2.12.0/row_2.png"),
      "".concat(app.config.imgHost, "/img/v2.12.0/row_3.png"),
      "",
    ],
    initPrintArr: [],
  },
  inputVal: function (n) {
    var objectSpread2 = n.detail.value;
    ((t = objectSpread2.replace(/[^\d]/g, "")),
      this.setData({
        input_val: objectSpread2,
      }));
  },
  printArrangeChange: function (n) {
    var ServicesCard = this.data,
      ServicesPrint = ServicesCard.arrangeIndex,
      app = ServicesCard.printImgIndex;
    if (ServicesPrint !== n.currentTarget.dataset.index) {
      var o =
          0 === (i = n.currentTarget.dataset.index)
            ? app > 2
              ? app - 3
              : app + 3
            : app <= 2
              ? app + 3
              : app - 3,
        r = this.data.printArrange.map(function (n) {
          return n.index === ServicesPrint
            ? objectSpread2(
                objectSpread2({}, n),
                {},
                {
                  checked: !0,
                },
              )
            : objectSpread2(
                objectSpread2({}, n),
                {},
                {
                  checked: !1,
                },
              );
        });
      this.setData({
        printArrange: r,
        arrangeIndex: ServicesPrint,
        printImgIndex: o,
      });
    }
  },
  colorSampleChange: function (n) {
    var ServicesCard = this.data.arrangeIndex,
      ServicesPrint = n.currentTarget.dataset.index;
    if (2 != this.data.langType || 2 != ServicesPrint) {
      var app = this.data.colorSample.map(function (n) {
        return n.index === ServicesPrint
          ? objectSpread2(
              objectSpread2({}, n),
              {},
              {
                checked: !0,
              },
            )
          : objectSpread2(
              objectSpread2({}, n),
              {},
              {
                checked: !1,
              },
            );
      });
      this.setData({
        colorSample: app,
        curIndex: ServicesPrint,
        printImgIndex: 0 === ServicesCard ? ServicesPrint : ServicesPrint + 3,
      });
    } else
      wx.showToast({
        icon: "none",
        title: "位置过窄无法支持打印，请重新选择！",
      });
  },
  swiperTouch: function (n) {},
  firstShowChange: function (n) {
    this.setData({
      firstShow: n.detail,
    });
  },
  showText: function () {
    this.setData({
      showTextImg: !this.data.showTextImg,
    });
  },
  bindPickerChange: function (n) {
    2 != this.data.langType || 1 != n.detail.value
      ? this.setData({
          labelType: n.detail.value,
        })
      : wx.showToast({
          icon: "none",
          title: "位置过窄无法支持打印，请重新选择！",
        });
  },
  getGoodS: function () {
    var n = this;
    (wx.showLoading({
      title: "加载中",
      mask: !0,
    }),
      ServicesCard.servicesCard.colorCardDetail({}, this.data.goodsId).then(function (t) {
        if (0 === t.code) {
          var ServicesCard = t.data.goodsColorPriceList;
          if (ServicesCard && ServicesCard.length > 0) {
            var ServicesPrint = ServicesCard.map(function (n) {
              return {
                num: n.color + n.colorName,
              };
            });
            n.setData({
              initPrintArr: ServicesPrint,
            });
          }
        }
        wx.hideLoading();
      }));
  },
  getPrintDetailsData: function () {
    var n = this;
    wx.showLoading({
      title: "加载中",
    });
    var ServicesPrint = {
      id: this.data.goodsId,
    };
    ServicesCard.servicesCard.getPrintInfo(ServicesPrint).then(function (e) {
      if (0 === e.code) {
        if (null !== e.data) {
          var ServicesPrint = e.data,
            app = ServicesPrint.colorLayType ? ServicesPrint.colorLayType - 1 : 1,
            o = ServicesPrint.colorSortType ? ServicesPrint.colorSortType - 1 : 0,
            r = 1 == ServicesPrint.printColorFirstDesc,
            c = n.data.colorSample.map(function (n) {
              return n.index === app
                ? objectSpread2(
                    objectSpread2({}, n),
                    {},
                    {
                      checked: !0,
                    },
                  )
                : objectSpread2(
                    objectSpread2({}, n),
                    {},
                    {
                      checked: !1,
                    },
                  );
            }),
            g = n.data.printArrange.map(function (n) {
              return n.index === o
                ? objectSpread2(
                    objectSpread2({}, n),
                    {},
                    {
                      checked: !0,
                    },
                  )
                : objectSpread2(
                    objectSpread2({}, n),
                    {},
                    {
                      checked: !1,
                    },
                  );
            }),
            d = 0 === o ? app : app + 3;
          n.setData({
            colorLayType: app,
            curIndex: app,
            arrangeIndex: o,
            firstShow: r,
            printImgIndex: d,
            labelType: ServicesPrint.labelType,
            colorSample: c,
            printArrange: g,
            langType: ServicesPrint.langType ? ServicesPrint.langType : "1",
          });
        }
        wx.hideLoading();
      } else
        (wx.hideLoading(),
          wx.showToast({
            title: e.msg.result,
            icon: "none",
          }));
    });
  },
  printLink: function () {
    var n = this,
      objectSpread2 = this.data,
      ServicesPrint = objectSpread2.curIndex,
      app = {
        printCode: 0,
        printGoodsName: 0,
        printGoodsNo: 0,
        printGramWeight: 0,
        printIngredient: 0,
        printBreadth: 0,
        printPrice: 0,
        printMeterLong: 0,
        printDeviation: 0,
        printLabelRemark: 0,
        labelRemark: 0,
        printColorNo: 1,
        labelType: objectSpread2.labelType,
        colorLayType: ServicesPrint + 1,
        colorSortType: objectSpread2.arrangeIndex + 1,
        printColorFirstDesc: objectSpread2.firstShow ? 1 : 0,
        printSortingList: [],
        langType: objectSpread2.langType,
      };
    ServicesCard.servicesCard.updatePrintInfo(app).then(function (t) {
      0 === t.code
        ? n.getPrint()
        : wx.showToast({
            title: resp.msg,
            icon: "none",
          });
    });
  },
  getPrint: function () {
    var n = this,
      objectSpread2 = {
        goodsId: this.data.goodsId,
        copies: this.data.input_val,
        labelType: this.data.array[this.data.labelType],
        langType: 1 === this.data.langType ? "中文" : "英文",
        printType: 2,
        showType: this.data.colorSample[this.data.curIndex].value,
        printSort: this.data.printArrange[this.data.arrangeIndex].value,
      };
    (wx.showLoading({
      title: "正在设置中",
    }),
      ServicesPrint.default.getColorNumOrder(objectSpread2).then(function (e) {
        var ServicesPrint;
        0 === e.code
          ? (wx.setStorageSync("printCommand", e.data.printCommand),
            wx.setStorageSync("printCommandGp", e.data.printCommandGp),
            wx.setStorageSync("printCommandTTR", e.data.printCommandTtr),
            wx.setStorageSync("printParams", objectSpread2),
            n.data.newPrintType && 1 == n.data.newPrintType
              ? (console.log("新打印"),
                (i = "/pages/color-card-management/printing-new/printing-new"))
              : (console.log("旧打印"), (i = "/pages/color-card-management/printing/printing")),
            wx.navigateTo({
              url: ServicesPrint,
              complete: function () {
                wx.hideLoading();
              },
            }))
          : wx.showToast({
              title: e.msg,
              icon: "none",
            });
      }));
  },
  onLoad: function (n) {
    var objectSpread2 = n.goodsId,
      ServicesCard = n.newPrintType;
    (objectSpread2 &&
      (this.setData({
        goodsId: objectSpread2,
      }),
      this.getGoodS()),
      ServicesCard &&
        this.setData({
          newPrintType: ServicesCard,
        }),
      this.getPrintDetailsData());
  },
  getPrintType: function () {
    var n = this;
    ServicesCard.servicesCard.newLabelPrint({}).then(function (t) {
      if ((console.log("获取打印方式:", t), 0 === t.code)) {
        if (null !== t.data) {
          var ServicesCard = t.data.mpNewLabelPrint;
          n.setData({
            newPrintType: ServicesCard,
          });
        }
        wx.hideLoading();
      } else
        wx.showToast({
          title: t.msg,
          icon: "none",
        });
    });
  },
  changeLang: function (n) {
    2 != n.currentTarget.id ||
    (1 != this.data.labelType && 2 != this.data.printImgIndex && 5 != this.data.printImgIndex)
      ? this.setData({
          langType: n.currentTarget.id,
        })
      : wx.showToast({
          icon: "none",
          title: "位置过窄无法支持打印，请重新选择！",
        });
  },
  onShow: function () {
    this.getPrintType();
  },
});
