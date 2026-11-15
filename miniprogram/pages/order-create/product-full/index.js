var t = require("../../../@babel/runtime/helpers/interopRequireDefault").default,
  e = require("../../../@babel/runtime/helpers/defineProperty"),
  toConsumableArray = require("../../../@babel/runtime/helpers/toConsumableArray"),
  objectSpread2 = require("../../../@babel/runtime/helpers/objectSpread2"),
  dialog = t(require("../../../miniprogram_npm/@vant/weapp/dialog/dialog")),
  toast = t(require("../../../miniprogram_npm/@vant/weapp/toast/toast")),
  orderCreate = require("../../../libs/services/orderCreate"),
  mta_analysis = t(require("../../../utils/mta_analysis")),
  util = require("../../../libs/utils/util"),
  s = "orderCreateColors",
  app = getApp();
Page({
  data: {
    addnewproduct: !1,
    differenceNum: "",
    differenceSymbol: "",
    largeCargo: 0,
    arrayCargo: ["米", "公斤", "码", "吨", "条", "盎司", "个", "千克"],
    timer: null,
    isFromCreate: !1,
    openType: "",
    productType: "",
    isExpanded: !1,
    isEdit: !1,
    isFocus: !1,
    showPickerColorSelect: !1,
    showDialogColorFineCode: !1,
    showChoosedCode: !1,
    codePop: !1,
    isKeyboardActived: !0,
    colorCardId: "",
    colorCardName: "",
    colorCardNO: "",
    colorCardImage: "",
    priceUnit: "",
    addColors: 0,
    addDyelot: 0,
    addColorList: 0,
    colorList: [],
    colors: [],
    tabCurrentColorId: "",
    tabCurrentColor: "",
    tabCurrentColorName: "",
    tabCurrentDyelot: [],
    tabCurrentDyelotId: "",
    tabCurrentOldDyelotId: "",
    tabCurrentColorList: [],
    totalQuantity: "0",
    totalPrice: "0.00",
    totalNum: "0",
    totalCodeNum: [],
    willAddColorId: "",
    willAddColor: "",
    willAddColorName: "",
    willAddColorBasePrice: "",
    willAddColorCodes: [],
    colorUnitPrice: "",
    willAddDyelot: [],
    formErrorMsg: [],
    chooseInfo: [
      {
        type: 1,
        title: "颜色",
        detail: "选择颜色",
        btn: "handleShowPickerColorSelect",
        checked: !0,
      },
      {
        type: 2,
        title: "缸号",
        detail: "添加缸号",
        btn: "handleShowDyelot",
        checked: !1,
      },
      {
        type: 3,
        title: "细码",
        detail: "添加细码",
        btn: "handleShowColorList",
        checked: !1,
      },
    ],
    icon: {
      addBlue: "".concat(app.config.imgHost, "/img/v2.8.0/Icon_Add_Blue@2x.png"),
      addGray: "".concat(app.config.imgHost, "/img/customer/Icon_Add_Gray@2x.png"),
      cross: "".concat(app.config.imgHost, "/img/customer/Icon_Add_cross.png"),
      tipsToMove: "".concat(app.config.imgHost, "/img/v2.8.0/tipsMove.png"),
      minusNor: "".concat(app.config.imgHost, "/img/v2.8.0/Icon_Minus_nor@2x.png"),
      minusPre: "".concat(app.config.imgHost, "/img/v2.8.0/Icon_Minus_pre@2x.png"),
      multiplyNor: "".concat(app.config.imgHost, "/img/v2.8.0/Icon_Multiply_nor@2x.png "),
      multiplyPre: "".concat(app.config.imgHost, "/img/v2.8.0/Icon_Multiply_pre@2x.png"),
      plusNor: "".concat(app.config.imgHost, "/img/v2.8.0/Icon_Plus_nor@2x.png "),
      plusPre: "".concat(app.config.imgHost, "/img/v2.8.0/Icon_Plus_pre@2x.png"),
      iconn: "".concat(app.config.imgHost, "/img/customer/duibuIcon/icon/icon.png"),
      delete: "".concat(app.config.imgHost, "/img/customer/duibuIcon/icon2nd/deltel@2x.png"),
    },
    differenceCountData: [
      {
        title: "multiply",
        id: 1,
        pre: "".concat(app.config.imgHost, "/img/customer/duibuIcon/color_multiply_active@2x.png"),
        nor: "".concat(app.config.imgHost, "/img/customer/duibuIcon/color_multiply@2x.png"),
        click: !1,
      },
      {
        title: "plus",
        id: 2,
        pre: "".concat(app.config.imgHost, "/img/customer/duibuIcon/color_add_active@2x.png"),
        nor: "".concat(app.config.imgHost, "/img/customer/duibuIcon/color_add@2x.png"),
        click: !1,
      },
      {
        title: "minus",
        id: 3,
        pre: "".concat(app.config.imgHost, "/img/customer/duibuIcon/color_minus_active@2x.png"),
        nor: "".concat(app.config.imgHost, "/img/customer/duibuIcon/color_minus@2x.png"),
        click: !1,
      },
      {
        title: "divide",
        id: 4,
        pre: "".concat(app.config.imgHost, "/img/customer/duibuIcon/color_divide_active@2x.png"),
        nor: "".concat(app.config.imgHost, "/img/customer/duibuIcon/color_divide@2x.png"),
        click: !1,
      },
    ],
    dyelot: "",
    dyelotLength: 0,
    colorFineCodeItem: [
      {
        inputVal: "",
        priceUnit: "米",
      },
    ],
    initPriceUnit: "米",
    scrollTop: 0,
  },
  autoScroll: function () {
    var t = this,
      e = wx.createSelectorQuery();
    (e.select(".scroll").boundingClientRect(function (e) {
      t.setData({
        scrollTop: 100 * e.height,
      });
    }),
      e.exec(function (t) {}));
  },
  getSymbol: function (t) {
    var e = this,
      toConsumableArray = this.data.differenceCountData.map(function (e) {
        return e.id === t
          ? objectSpread2(
              objectSpread2({}, e),
              {},
              {
                click: !e.click,
              },
            )
          : objectSpread2(
              objectSpread2({}, e),
              {},
              {
                click: !1,
              },
            );
      });
    (this.setData({
      differenceSymbol: toConsumableArray[t - 1].click ? t : "",
      differenceCountData: toConsumableArray,
    }),
      setTimeout(function () {
        e.totalPriceQuantity();
      }, 300));
  },
  chooseSymbol: function (t) {
    var e = t.currentTarget.dataset.id,
      toConsumableArray = this.data.differenceCountData.map(function (t) {
        return t.id === e
          ? objectSpread2(
              objectSpread2({}, t),
              {},
              {
                click: !t.click,
              },
            )
          : objectSpread2(
              objectSpread2({}, t),
              {},
              {
                click: !1,
              },
            );
      });
    (this.setData({
      differenceSymbol: toConsumableArray[e - 1].click ? e : "",
      differenceCountData: toConsumableArray,
    }),
      this.totalPriceQuantity());
  },
  toDifferenceNum: function () {
    this.totalPriceQuantity();
  },
  showCodePop: function () {
    this.setData({
      codePop: !this.data.codePop,
    });
  },
  changeLargeCargo: function (t) {
    (this.setData({
      isFocus: !1,
    }),
      wx.hideKeyboard());
    var e = t.currentTarget.dataset.key,
      toConsumableArray = this.data.arrayCargo,
      objectSpread2 = t.detail.value,
      dialog = this.data.colorFineCodeItem;
    ("colorFineCodeItem" === e
      ? this.setData({
          "colorFineCodeItem[0].priceUnit": toConsumableArray[objectSpread2],
        })
      : dialog.map(function (t, i) {
          i === e && (t.priceUnit = toConsumableArray[objectSpread2]);
        }),
      this.setData({
        largeCargo: objectSpread2,
        colorFineCodeItem: dialog,
      }));
  },
  onLoad: function (t) {
    mta_analysis.default.Page.init();
    var e = t.productType,
      toConsumableArray = t.openType,
      objectSpread2 = t.colorCardId,
      dialog = t.fromCreate;
    ("open" === t.to &&
      this.setData({
        addnewproduct: !0,
      }),
      this.setData({
        productType: e,
        openType: toConsumableArray,
        colorCardId: objectSpread2,
        isFromCreate: 1 == dialog,
      }));
  },
  onReady: function () {
    "" !== this.data.colorCardId
      ? Promise.all([this.getColorCard(), this.getColorsFromStorage()])
      : (0, toast.default)({
          message: "ID 不存在",
          duration: 1500,
        });
  },
  onShow: function () {
    var t = this,
      e = wx.getStorageSync("colorColorList");
    "" != e &&
      null != e &&
      (e.forEach(function (e) {
        e.color = e.colorVal;
        var toConsumableArray = t.data.colors.findIndex(function (t) {
          return e.color === t.color;
        });
        e.disabled = toConsumableArray > -1;
      }),
      this.setData({
        tabCurrentDyelotId: Number(this.data.tabCurrentDyelot.length),
        colorList: e,
      }),
      this.editPordColor());
  },
  onHide: function () {
    this.setData({
      isEdit: !1,
    });
  },
  onUnload: function () {
    (wx.removeStorageSync(s),
      wx.removeStorageSync("colorColorList"),
      wx.removeStorageSync("goodsPriceJson"));
  },
  editPordColor: function () {
    var t = this;
    (0, orderCreate.editColor)({
      colorList: this.data.colorList,
      id: this.data.colorCardId,
    }).then(function (e) {
      t.getColorCard();
    });
  },
  getColorsFromStorage: function () {
    var t = this;
    wx.getStorage({
      key: s,
      success: function (e) {
        var toConsumableArray = e.data,
          objectSpread2 = toConsumableArray.differenceSymbol,
          dialog = toConsumableArray.differenceNum;
        (e.data.colors.length > 0 &&
          e.data.colors[0].dyelotArr.forEach(function (t, e) {
            t.index = e;
          }),
          t.setData({
            colors: e.data.colors,
            tabCurrentDyelotId: e.data.colors[0].dyelotArr.length || 0,
          }),
          dialog &&
            objectSpread2 &&
            (t.getSymbol(objectSpread2),
            t.setData({
              differenceNum: dialog,
            })),
          t.data.colors.length > 0 && t.getCurrentColor(t.data.colors[0]));
      },
    });
  },
  getColorCard: function () {
    var t = this;
    (wx.showLoading(),
      (0, orderCreate.getColorCard)(this.data.colorCardId)
        .then(function (e) {
          if ((wx.hideLoading(), 0 === e.code)) {
            var toConsumableArray,
              objectSpread2,
              dialog,
              orderCreate,
              mta_analysis,
              util = e.data;
            if (1 == util.priceType)
              (null === (o = util.priceResp) ||
                void 0 === toConsumableArray ||
                null === (o = toConsumableArray.shearingPriceResps) ||
                void 0 === toConsumableArray ||
                toConsumableArray.map(function (t) {
                  t.priceType = 1;
                }),
                wx.setStorageSync(
                  "goodsPriceJson",
                  null === (r = util.priceResp) || void 0 === objectSpread2
                    ? void 0
                    : objectSpread2.shearingPriceResps,
                ));
            else
              (null === (i = util.colorList) ||
                void 0 === dialog ||
                dialog.map(function (t) {
                  ((t.bulkNumUnit = util.priceUnit),
                    (t.bulkSaleUnit = "元/" + util.priceUnit),
                    (t.priceType = 2));
                }),
                wx.setStorageSync(
                  "goodsPriceJson",
                  (null === (n = util.priceResp) || void 0 === orderCreate
                    ? void 0
                    : orderCreate.bulkPriceResps.length) > 0
                    ? null === (l = util.priceResp) || void 0 === mta_analysis
                      ? void 0
                      : mta_analysis.bulkPriceResps
                    : util.colorList,
                ));
            var s = e.data.colorList;
            (s &&
              s.length &&
              s.forEach(function (e) {
                e.color = e.colorVal;
                var toConsumableArray = t.data.colors.findIndex(function (t) {
                  return e.color === t.color;
                });
                e.disabled = toConsumableArray > -1;
              }),
              (s = s.sort(function (t, e) {
                return t.colorVal.match(/\d+(\.\d+)?/g) - e.colorVal.match(/\d+(\.\d+)?/g);
              })),
              wx.setStorageSync("colorColorList", s));
            var app = t.data.colors,
              c = 0 !== app.length ? app[0] : s[0],
              C = c.id,
              h = c.color,
              f = c.colorName,
              m = e.data.priceUnit || "米",
              g = t.data.arrayCargo.indexOf(m);
            (t.setData({
              colorCardName: e.data.businessProductName,
              colorCardNO: e.data.spuNumber,
              colorCardImage: e.data.mainImgPath,
              priceUnit: e.data.priceUnit,
              colorList: s,
              tabCurrentColorId: C,
              tabCurrentColor: h,
              tabCurrentColorName: f,
              largeCargo: g,
              "colorFineCodeItem[0].priceUnit": m,
            }),
              wx.setNavigationBarTitle({
                title: t.data.colorCardName,
              }),
              t.totalPriceQuantity());
          } else
            (0, toast.default)({
              message: e.msg || "获取失败",
              duration: 1500,
            });
        })
        .catch(function (t) {
          wx.hideLoading();
        }));
  },
  changeCurrentDyelot: function (t) {
    var e = t.currentTarget.dataset,
      toConsumableArray = (e.id, e.index),
      objectSpread2 = this.data.tabCurrentDyelot;
    this.setData({
      tabCurrentDyelotId: objectSpread2[toConsumableArray].index,
      tabCurrentColorList: objectSpread2[toConsumableArray].list,
    });
  },
  handleSwitchColor: function (t) {
    var e = t.currentTarget.dataset,
      toConsumableArray = (e.id, e.index);
    this.getCurrentColor(this.data.colors[toConsumableArray]);
  },
  getCurrentColor: function (t) {
    if (t) {
      var e = this.data.colorList[0],
        objectSpread2 = t && t.id ? t.id : e.id,
        dialog = t && t.color ? t.color : e.color,
        toast = t ? t.colorName : e.colorName,
        orderCreate = t ? toConsumableArray(t.dyelotArr[0].list) : [];
      this.setData({
        tabCurrentColorId: objectSpread2,
        tabCurrentColor: dialog,
        tabCurrentColorName: toast,
        tabCurrentColorList: orderCreate,
        tabCurrentDyelot: t.dyelotArr,
        tabCurrentDyelotId: t.dyelotArr[0].index,
      });
    }
  },
  getWillAddColor: function () {
    var t = this,
      e = this.data.colors.find(function (e) {
        return e.id === t.data.tabCurrentColorId;
      });
    if (e)
      this.setData({
        willAddColorId: e.id,
        willAddColor: e.color,
        willAddColorName: e.colorName,
        willAddColorBasePrice: "",
        willAddColorCodes: toConsumableArray(e.dyelotArr),
      });
    else {
      var objectSpread2 = this.data,
        dialog = objectSpread2.tabCurrentColorId,
        toast = objectSpread2.tabCurrentColor,
        orderCreate = objectSpread2.tabCurrentColorName,
        mta_analysis = objectSpread2.tabCurrentColorList;
      this.setData({
        willAddColorId: dialog,
        willAddColor: toast,
        willAddColorName: orderCreate,
        willAddColorBasePrice: "",
        dyelot: "",
        willAddColorCodes: toConsumableArray(mta_analysis),
      });
    }
  },
  handleToggleExpanded: function () {
    this.setData({
      isExpanded: !this.data.isExpanded,
    });
  },
  handleToggleEdit: function () {
    this.setData({
      isEdit: !this.data.isEdit,
    });
  },
  handleShowPickerColorSelect: function () {
    var t = this;
    (this.getWillAddColor(),
      this.data.colorList.forEach(function (e) {
        var toConsumableArray = t.data.colors.findIndex(function (t) {
          return t.color === e.color;
        });
        e.disabled = toConsumableArray > -1;
      }),
      this.setData({
        colorList: this.data.colorList,
        addColors: 1,
        showPickerColorSelect: !0,
      }));
  },
  reChooseColor: function () {
    this.setData({
      showDialogColorFineCode: !1,
      showPickerColorSelect: !0,
    });
  },
  handleHidePickerColorSelect: function () {
    this.setData({
      addColors: 0,
      addDyelot: 0,
      addColorList: 0,
      showPickerColorSelect: !1,
    });
  },
  handleShowDyelot: function () {
    var t = this.data,
      e = (t.willAddColorName, t.tabCurrentColorName);
    t.tabCurrentColorList;
    (this.handleHidePickerColorSelect(),
      this.setData({
        tabCurrentOldDyelotId: this.data.tabCurrentDyelotId,
        addDyelot: 1,
        tabCurrentDyelotId: Number(this.data.tabCurrentDyelotId) + 1,
        showDialogColorFineCode: !0,
        willAddColorName: e,
      }));
  },
  handleShowColorList: function () {
    var t = this,
      e = this.data,
      toConsumableArray = (e.willAddColorName, e.tabCurrentColorName),
      objectSpread2 = e.colorFineCodeItem;
    (this.handleHidePickerColorSelect(),
      this.setData({
        addColorList: 1,
        showDialogColorFineCode: !0,
        showChoosedCode: !0,
        willAddColorName: toConsumableArray,
      }),
      this.data.tabCurrentDyelot.forEach(function (e) {
        e.index === t.data.tabCurrentDyelotId &&
          t.setData({
            tabCurrentDyelotName: e.dyelotName,
            dyelot: e.dyelotName,
            willAddColorBasePrice: e.list ? e.list[0].price : "",
            "colorFineCodeItem[0].priceUnit": e.list
              ? e.list[0].priceUnit
              : objectSpread2[0].priceUnit,
          });
      }));
  },
  hasSelect: function (t) {
    var e = this,
      toConsumableArray = this.data.colors.filter(function (t) {
        return t.id === e.data.willAddColorId;
      });
    return toConsumableArray.length > 0;
  },
  handleShowDialogColorFineCode: function () {
    var t = this;
    this.data.colors.filter(function (e) {
      return e.id === t.data.willAddColorId;
    }).length ||
      (this.setData({
        showPickerColorSelect: !1,
      }),
      this.setData({
        showDialogColorFineCode: !0,
      }));
  },
  handleHideDialogColorFineCode: function () {
    var t = this;
    (wx.hideKeyboard(),
    this.setData({
      addColors: 0,
      addDyelot: 0,
      addColorList: 0,
      isFocus: !1,
      showDialogColorFineCode: !1,
      showChoosedCode: !1,
      formErrorMsg: [],
      willAddColorId: "",
      willAddColor: "",
      willAddColorName: "",
      willAddColorBasePrice: "",
      dyelot: "",
      willAddColorCodes: [],
      colorFineCodeItem: [
        {
          inputVal: null,
          priceUnit: this.data.arrayCargo[this.data.largeCargo],
        },
      ],
    }),
    this.data.tabCurrentOldDyelotId && this.data.tabCurrentDyelot.length) &&
      (this.data.tabCurrentDyelot.find(function (e) {
        return e.index === t.data.tabCurrentDyelotId;
      }) ||
        this.setData({
          tabCurrentDyelotId: this.data.tabCurrentOldDyelotId,
        }));
  },
  handleDelTabColor: function (t) {
    var e = this;
    dialog.default
      .confirm({
        message: "确认删除？",
      })
      .then(function () {
        e.dealDelTabColor(t);
      })
      .catch(function (t) {
        (0, toast.default)({
          duration: 1e3,
          message: "已取消",
        });
      });
  },
  dealDelTabColor: function (t) {
    var e = t.currentTarget.dataset.id,
      objectSpread2 = this.data.colors.filter(function (t) {
        return t.id !== e;
      });
    (this.setData({
      colors: toConsumableArray(objectSpread2),
    }),
      this.getCurrentColor(this.data.colors[0]),
      (0, toast.default)({
        duration: 1e3,
        message: "删除成功",
      }),
      this.totalPriceQuantity(),
      0 === this.data.colors.length &&
        this.setData({
          isEdit: !1,
        }));
  },
  deleteDylot: function (t) {
    var e = this,
      objectSpread2 = t.currentTarget.dataset.id,
      dialog = this.data.colors.find(function (t) {
        return t.id === e.data.tabCurrentColorId;
      });
    if (
      ((dialog.dyelotArr = dialog.dyelotArr.filter(function (t) {
        return t.id !== objectSpread2;
      })),
      0 === dialog.dyelotArr.length)
    ) {
      var toast = this.data.colors.filter(function (t) {
        return t.id !== e.data.tabCurrentColorId;
      });
      (this.setData({
        colors: toConsumableArray(toast),
      }),
        this.getCurrentColor(this.data.colors[0]));
    } else this.getCurrentColor(dialog);
    (this.totalPriceQuantity(),
      0 === this.data.colors.length &&
        this.setData({
          isEdit: !1,
        }));
  },
  handleRemoveFineCode: function (t) {
    var e = this,
      objectSpread2 = t.currentTarget.dataset.index,
      dialog = this.data,
      toast = dialog.tabCurrentColorId,
      orderCreate = dialog.tabCurrentColorList,
      mta_analysis = dialog.tabCurrentDyelotId,
      util = dialog.colors.find(function (t) {
        return t.id === toast;
      }),
      s = util.dyelotArr.find(function (t) {
        return t.index === mta_analysis;
      }).list;
    if ((s.splice(objectSpread2, 1), (n = s), 0 === s.length)) {
      if (
        ((util.dyelotArr = util.dyelotArr.filter(function (t) {
          return t.index !== mta_analysis;
        })),
        0 === util.dyelotArr.length)
      ) {
        var app = this.data.colors.filter(function (t) {
          return t.id !== e.data.tabCurrentColorId;
        });
        (this.setData({
          colors: toConsumableArray(app),
          codePop: !1,
        }),
          this.getCurrentColor(this.data.colors[0]));
      } else
        (this.setData({
          codePop: !1,
        }),
          this.getCurrentColor(util));
    } else
      this.setData({
        tabCurrentColorList: orderCreate,
      });
    (this.totalPriceQuantity(),
      0 === this.data.colors.length &&
        this.setData({
          isEdit: !1,
        }));
  },
  addItem: function () {
    if (!this.data.colorFineCodeItem[0].inputVal || !this.data.willAddColorBasePrice) return !1;
    if (0 != this.data.colorFineCodeItem[0].inputVal) {
      if (this.data.colorFineCodeItem[0].inputVal) {
        this.pushFinecCodeToColor(!1);
        var t = [
          {
            inputVal: null,
            priceUnit: this.data.arrayCargo[this.data.largeCargo],
          },
        ];
        (this.setData({
          colorFineCodeItem: t,
          showChoosedCode: !0,
        }),
          this.setData({
            isFocus: !0,
          }),
          wx.showToast({
            title: "添加成功",
            icon: "success",
          }),
          this.autoScroll());
      } else
        wx.showToast({
          title: "请填写细码",
          icon: "none",
        });
    } else {
      wx.showToast({
        title: "细码不能为0",
        icon: "none",
      });
      var e = [
        {
          inputVal: 1,
          priceUnit: this.data.arrayCargo[this.data.largeCargo],
        },
      ];
      this.setData({
        colorFineCodeItem: e,
        showChoosedCode: !0,
      });
    }
  },
  handleFinishedAddColorDetail: function () {
    if (!(
      0 !== this.data.tabCurrentColorList.length ||
      (this.data.colorFineCodeItem[0].inputVal && this.data.willAddColorBasePrice)
    ))
      return !1;
    var t = this.data,
      e = t.willAddColorBasePrice,
      toConsumableArray = (t.dyelot, t.willAddColorCodes),
      objectSpread2 = t.colorFineCodeItem;
    if ("" == e && 0 === objectSpread2.length)
      return (
        this.setData({
          isFocus: !1,
        }),
        wx.hideKeyboard(),
        void this.handleHideDialogColorFineCode()
      );
    var dialog = [];
    if ("" === e)
      return (
        dialog.push("价格不能为空"),
        void this.setData({
          formErrorMsg: dialog,
        })
      );
    if (0 === objectSpread2.length && 0 === toConsumableArray.length)
      return (
        dialog.push("细码不能为空"),
        void this.setData({
          formErrorMsg: dialog,
        })
      );
    if (0 != this.data.colorFineCodeItem[0].inputVal) {
      if (0 != e) {
        (this.pushFinecCodeToColor(!1), this.handleHideDialogColorFineCode());
      } else
        (0, toast.default)({
          message: "单价或细码值不能为0",
          duration: 2e3,
        });
    } else {
      wx.showToast({
        title: "细码不能为0",
        icon: "none",
      });
      var orderCreate = [
        {
          inputVal: 1,
          priceUnit: this.data.arrayCargo[this.data.largeCargo],
        },
      ];
      this.setData({
        colorFineCodeItem: orderCreate,
        showChoosedCode: !0,
      });
    }
  },
  handleAddColorDetail: function () {
    var t = this.data,
      e = (t.colors, t.colorUnitPrice, t.willAddColorCodes),
      toConsumableArray = t.willAddColorBasePrice,
      objectSpread2 = [];
    if (0 === e.length && "" === toConsumableArray)
      return (
        objectSpread2.push("价格不能为空"),
        void this.setData({
          formErrorMsg: objectSpread2,
        })
      );
    if (0 === colorFineCodeItem.length)
      return (
        objectSpread2.push("细码不能为空"),
        void this.setData({
          formErrorMsg: objectSpread2,
        })
      );
    if (0 != toConsumableArray) {
      this.pushFinecCodeToColor(!0);
    } else
      (0, toast.default)({
        message: "单价或细码值不能为0",
        duration: 2e3,
      });
  },
  colorHasDyelot: function () {
    var t,
      e = this,
      objectSpread2 = !(arguments.length > 0 && void 0 !== arguments[0]) || arguments[0],
      dialog = this.data,
      toast = dialog.willAddColorBasePrice,
      orderCreate = dialog.colorFineCodeItem,
      mta_analysis = dialog.dyelot,
      util = dialog.tabCurrentDyelot,
      s = dialog.tabCurrentDyelotId,
      app = mta_analysis || "无缸号",
      c = util.find(function (t) {
        return t.index === s;
      }),
      C =
        c && c.index > -1
          ? c.index
          : util.find(function (t) {
              return t.dyelotName === app;
            }).index,
      h = this.data.colors.find(function (t) {
        return t.id === e.data.tabCurrentColorId;
      }),
      f = h.dyelotArr.find(function (t) {
        return t.index === C;
      });
    if (f) {
      ((f.id = app), (f.dyelotName = app));
      var m = h.dyelotArr.filter(function (t) {
        return t.dyelotName === f.dyelotName;
      });
      if (m.length > 1) {
        var g = h.dyelotArr.findIndex(function (t) {
          return (
            t.index ===
            m.filter(function (t) {
              return t.index !== s;
            })[0].index
          );
        });
        if (g > -1) {
          h.dyelotArr[g].list = [].concat(
            toConsumableArray(h.dyelotArr[g].list),
            toConsumableArray(f.list),
          );
          var y = C;
          ((C = h.dyelotArr[g].index),
            (h.dyelotArr = h.dyelotArr.filter(function (t) {
              return t.index !== y;
            })),
            (f = h.dyelotArr.find(function (t) {
              return t.index === C;
            })));
        }
      }
    }
    var p = orderCreate.map(function (t) {
      return {
        price: Number(toast),
        quantity: Number(t.inputVal),
        priceUnit: t.priceUnit,
      };
    });
    (p[0].quantity > 0 && (t = f.list).push.apply(t, toConsumableArray(p)),
      f.list.forEach(function (t, e) {
        p.forEach(function (o) {
          o.priceUnit === t.priceUnit && (f.list[e].price = Number(toast));
        });
      }));
    var b = f.list.filter(function (t) {
      return t.quantity > 0;
    });
    (this.setData({
      isFocus: objectSpread2,
      formErrorMsg: [],
      willAddDyelot: toConsumableArray(h.dyelotArr),
      tabCurrentColorList: toConsumableArray(b),
      tabCurrentDyelot: toConsumableArray(h.dyelotArr),
      willAddColorCodes: toConsumableArray(b),
      tabCurrentDyelotId: C,
    }),
      this.totalPriceQuantity());
  },
  pushFinecCodeToColor: function () {
    var t = this,
      e = !(arguments.length > 0 && void 0 !== arguments[0]) || arguments[0],
      objectSpread2 = this.data,
      dialog = objectSpread2.willAddColorId,
      toast = objectSpread2.willAddColor,
      orderCreate = objectSpread2.willAddColorName,
      mta_analysis = objectSpread2.willAddColorBasePrice,
      util = objectSpread2.dyelot,
      s = objectSpread2.colorFineCodeItem,
      app = objectSpread2.willAddColorCodes,
      c = (objectSpread2.willAddDyelot, util || "无缸号"),
      C = this.data.dyelotLength + 1;
    if (1 === this.data.addColors) {
      var h = s.map(function (t) {
          return {
            price: Number(mta_analysis),
            quantity: Number(t.inputVal),
            priceUnit: t.priceUnit,
          };
        }),
        f = {
          id: dialog,
          color: toast,
          colorName: orderCreate,
          basePrice: mta_analysis,
          dyelotArr: [
            {
              id: c,
              index: C,
              dyelotName: util || "无缸号",
              list: toConsumableArray(h),
            },
          ],
        };
      (this.data.colors.push(f),
        this.setData({
          isFocus: e,
          formErrorMsg: [],
          colors: toConsumableArray(this.data.colors),
          tabCurrentColorId: dialog,
          tabCurrentColor: toast,
          tabCurrentColorName: orderCreate,
          dyelotLength: C + 1,
          tabCurrentDyelotId: C,
          tabCurrentDyelot: toConsumableArray(f.dyelotArr),
          willAddDyelot: toConsumableArray(f.dyelotArr),
          tabCurrentColorList: toConsumableArray(h),
          willAddColorCodes: toConsumableArray(h),
          addColors: 0,
          addDyelot: 1,
        }));
    } else if (1 === this.data.addDyelot) {
      var m = this.data.colors.find(function (e) {
        return e.id === t.data.tabCurrentColorId;
      });
      if (
        m.dyelotArr.find(function (t) {
          return t.dyelotName === c;
        })
      )
        return void this.colorHasDyelot(e);
      var g = s.map(function (t) {
          return {
            price: Number(mta_analysis),
            quantity: Number(t.inputVal),
            priceUnit: t.priceUnit,
          };
        }),
        y = {
          id: c,
          index: C,
          dyelotName: util || "无缸号",
          list: toConsumableArray(g),
        };
      (m.dyelotArr.push(y),
        app.push(y),
        this.setData({
          isFocus: e,
          formErrorMsg: [],
          colors: toConsumableArray(this.data.colors),
          dyelotLength: C + 1,
          tabCurrentDyelotId: C,
          tabCurrentDyelot: toConsumableArray(m.dyelotArr),
          willAddDyelot: toConsumableArray(m.dyelotArr),
          tabCurrentColorList: toConsumableArray(g),
          willAddColorCodes: toConsumableArray(g),
        }));
    } else 1 === this.data.addColorList && this.colorHasDyelot(e);
    (this.setData({
      isFocus: !1,
    }),
      this.totalPriceQuantity());
  },
  selectColor: function (t) {
    var e = t.currentTarget.dataset,
      toConsumableArray = e.id,
      objectSpread2 = e.color,
      dialog = e.colorName,
      toast =
        (e.index,
        this.data.colors.find(function (t) {
          return t.id === toConsumableArray;
        }));
    (this.setData({
      willAddColorId: toConsumableArray,
      willAddColor: objectSpread2,
      willAddColorName: dialog,
      willAddColorBasePrice: toast ? util.utils.rounded(Number(toast.basePrice), 2) : "",
      willAddColorCodes: [],
    }),
      this.handleShowDialogColorFineCode());
  },
  handleInputColorPrice: function (t) {
    var toConsumableArray = this.handleInputDecimalLengFn(t),
      objectSpread2 = t.target.dataset.key;
    this.setData({
      objectSpread2: toConsumableArray,
    });
  },
  handleBlurColorPrice: function (t) {
    var objectSpread2 = t.detail.value,
      dialog = t.target.dataset,
      toast = dialog.key,
      orderCreate = dialog.tabCurrentColorId,
      mta_analysis = objectSpread2.substr(objectSpread2.length - 1);
    ((0 != objectSpread2 && "" != objectSpread2) || (r = this.data.tabCurrentColorList[0].price),
      "." == mta_analysis && (r = Number(objectSpread2)),
      this.setData({
        toast: objectSpread2,
      }),
      this.data.colors.forEach(function (t) {
        t.id == orderCreate &&
          ((t.basePrice = objectSpread2),
          t.list.forEach(function (t) {
            t.price = objectSpread2;
          }));
      }),
      this.data.tabCurrentColorList.forEach(function (t) {
        t.price = objectSpread2;
      }),
      this.setData({
        colors: toConsumableArray(this.data.colors),
        tabCurrentColorList: toConsumableArray(this.data.tabCurrentColorList),
      }),
      this.totalPriceQuantity());
  },
  totalPriceQuantity: function () {
    var t = this;
    if (0 !== this.data.colors.length) {
      var e = null,
        toConsumableArray = null,
        objectSpread2 = 0,
        dialog = [];
      (this.data.colors.forEach(function (a) {
        a.dyelotArr.forEach(function (a) {
          a.list.forEach(function (a) {
            ((e += t.totalPriceCount(a.price, a.quantity)),
              (o += Number(a.quantity)),
              objectSpread2++,
              (i = t.getTotalCodeNum(dialog, a)));
          });
        });
      }),
        this.setData({
          totalNum: objectSpread2,
          totalCodeNum: dialog,
          totalPrice: util.utils.rounded(e, 2),
          totalQuantity: util.utils.rounded(Number(toConsumableArray), 2),
        }));
    } else
      this.setData({
        totalPrice: "0.00",
        totalQuantity: "0",
      });
  },
  totalPriceCount: function (t, e) {
    var toConsumableArray = this.data,
      objectSpread2 = toConsumableArray.differenceNum,
      dialog = toConsumableArray.differenceSymbol,
      toast = {
        1: Number(t) * util.utils.rounded(Number(e) * Number(objectSpread2), 2),
        2: Number(t) * util.utils.rounded(Number(e) + Number(objectSpread2), 2),
        3:
          Number(t) *
          util.utils.rounded(
            Number(e) - Number(objectSpread2) < 0 ? 0 : Number(e) - Number(objectSpread2),
            2,
          ),
        4: Number(objectSpread2)
          ? Number(t) * util.utils.rounded(Number(e) / Number(objectSpread2), 2)
          : util.utils.rounded(Number(t) * Number(e), 2),
      };
    return "number" == typeof dialog && "" !== objectSpread2
      ? util.utils.rounded(toast[dialog], 2)
      : util.utils.rounded(Number(t) * Number(e), 2);
  },
  getTotalCodeNum: function (t, e) {
    if (0 === t.length) {
      var toConsumableArray = objectSpread2(
        objectSpread2({}, e),
        {},
        {
          differenceQuantity: this.countDifferenceQuantity(e.quantity, e.quantity),
        },
      );
      t.push(toConsumableArray);
    } else {
      var dialog = t.findIndex(function (t) {
        return t.priceUnit === e.priceUnit;
      });
      if (dialog >= 0) {
        var toast = Number(t[dialog].quantity) + Number(e.quantity),
          orderCreate = e.price * toast,
          mta_analysis =
            Number(t[dialog].differenceQuantity) +
            Number(this.countDifferenceQuantity(e.quantity, e.quantity)),
          s = {
            priceUnit: t[dialog].priceUnit,
            price: orderCreate,
            quantity: toast,
            differenceQuantity: util.utils.rounded(mta_analysis, 2),
          };
        t[dialog] = s;
      } else {
        var app = objectSpread2(
          objectSpread2({}, e),
          {},
          {
            differenceQuantity: this.countDifferenceQuantity(e.quantity, e.quantity),
          },
        );
        t.push(app);
      }
    }
    return t;
  },
  countDifferenceQuantity: function (t, e) {
    var toConsumableArray = this.data,
      objectSpread2 = toConsumableArray.differenceNum,
      dialog = toConsumableArray.differenceSymbol,
      toast = {
        1: Number(t) * Number(objectSpread2),
        2: Number(t) + Number(objectSpread2),
        3: Number(t) - Number(objectSpread2) < 0 ? 0 : Number(t) - Number(objectSpread2),
        4: Number(objectSpread2) ? Number(t) / Number(objectSpread2) : Number(t),
      };
    return "number" == typeof dialog && "" !== objectSpread2
      ? util.utils.rounded(toast[dialog], 2)
      : e;
  },
  handleNextStep: function () {
    var t = this.data,
      e = t.differenceNum,
      toConsumableArray = t.differenceSymbol;
    if ("salesReturn" !== t.openType) {
      if (e && "" === toConsumableArray)
        return void wx.showToast({
          title: "请选择空差计算方式",
          icon: "none",
        });
      if (toConsumableArray && "" === e)
        return void wx.showToast({
          title: "请输入优惠数量",
          icon: "none",
        });
    }
    this.updateProductToOrderCreate();
    var objectSpread2 = this.data.isFromCreate ? 1 : 2;
    (this.data.addnewproduct && (r = 3),
      wx.nextTick(function () {
        wx.navigateBack({
          delta: objectSpread2,
        });
      }));
  },
  updateProductToOrderCreate: function () {
    var t = this.data,
      e = t.colorCardId,
      toConsumableArray = t.colorCardName,
      objectSpread2 = t.colorCardImage,
      dialog = t.priceUnit,
      toast = t.totalQuantity,
      orderCreate = t.totalPrice,
      mta_analysis = t.colors,
      s = t.tabCurrentColorId,
      app = t.tabCurrentColorList,
      c = t.tabCurrentDyelot,
      C = t.tabCurrentDyelotId,
      h = t.differenceNum,
      f = t.differenceSymbol,
      m = t.totalCodeNum,
      g = t.totalNum;
    mta_analysis.forEach(function (t) {
      t.dyelotArr.forEach(function (t, e) {
        t.list.forEach(function (t) {
          var e = {
              1: Number(t.price) * util.utils.rounded(Number(t.quantity) * Number(h), 1),
              2: Number(t.price) * util.utils.rounded(Number(t.quantity) + Number(h), 1),
              3:
                Number(t.price) *
                util.utils.rounded(
                  Number(t.quantity) - Number(h) < 0 ? 0 : Number(t.quantity) - Number(h),
                  1,
                ),
              4: Number(h)
                ? Number(t.price) * util.utils.rounded(Number(t.quantity) / Number(h), 2)
                : util.utils.rounded(Number(t.price) * Number(t.quantity), 2),
            },
            toConsumableArray = {
              1: Number(t.quantity) * Number(h),
              2: Number(t.quantity) + Number(h),
              3: Number(t.quantity) - Number(h) < 0 ? 0 : Number(t.quantity) - Number(h),
              4: Number(h) ? Number(t.quantity) / Number(h) : Number(t.quantity),
            };
          "number" == typeof f && "" !== h
            ? ((t.total = util.utils.rounded(e[f], 2)),
              (t.deviationQuantity = util.utils.rounded(toConsumableArray[f], 1)))
            : ((t.total = util.utils.rounded(
                Number(t.price) * util.utils.rounded(Number(t.quantity), 1),
                2,
              )),
              (t.deviationQuantity = util.utils.rounded(t.quantity, 1)));
        });
      });
    });
    var y = getCurrentPages(),
      p = {
        online: "pages/order-create/online/create",
        offline: "pages/order-create/offline/create",
        salesReturn: "packageB/pages/sales-return/index",
      }[this.data.openType],
      b = y.find(function (t) {
        return t.route === p;
      });
    if (b) {
      var D = {
        id: e,
        name: toConsumableArray,
        image: objectSpread2,
        goodsUnit: dialog,
        totalQuantity: toast,
        totalPrice: orderCreate,
        colors: mta_analysis,
        isOpened: !1,
        tabCurrentColorId: s,
        tabCurrentColor: mta_analysis[0].color,
        tabCurrentColorName: mta_analysis[0].colorName,
        tabCurrentColorList: app,
        tabCurrentDyelot: c,
        tabCurrentDyelotId: C,
        totalNum: g,
        totalCodeNum: m,
        differenceNum: h,
        differenceSymbol: f,
      };
      b.updateProduct(D);
    }
  },
  handleUpdateColorFineCode: function (t) {
    var e = this.data,
      objectSpread2 = e.tabCurrentColorId,
      dialog = (e.tabCurrentColorList, e.tabCurrentDyelotId),
      orderCreate = e.colors,
      mta_analysis = t.detail.value,
      util = t.currentTarget.dataset,
      s = util.index,
      app = util.key;
    ("" != mta_analysis && 0 != mta_analysis) ||
      ((0, toast.default)({
        message: "数值不能为空或0",
        duration: 1500,
      }),
      (l = 1));
    var c = orderCreate
      .find(function (t) {
        return t.id === objectSpread2;
      })
      .dyelotArr.find(function (t) {
        return t.index === dialog;
      }).list;
    if (
      ("quantity" === app &&
        ((c[s].quantity = mta_analysis),
        this.setData({
          tabCurrentColorList: toConsumableArray(c),
        })),
      "price" === app)
    ) {
      var C = c[s].priceUnit;
      (c.forEach(function (t, e) {
        C === t.priceUnit && (c[e].price = mta_analysis);
      }),
        this.setData({
          tabCurrentColorList: toConsumableArray(c),
        }));
    }
    this.totalPriceQuantity();
  },
  handleValUpdate: function (t) {
    if ("" !== t.detail.value) {
      var toConsumableArray = Number(t.detail.value),
        objectSpread2 = t.target.dataset,
        dialog = objectSpread2.key;
      objectSpread2.leng;
      this.setData({
        dialog: toConsumableArray,
      });
    }
  },
  changeUnit: function (t) {
    var e = this.data,
      objectSpread2 = e.tabCurrentColorId,
      dialog = (e.tabCurrentColorList, e.tabCurrentDyelotId),
      toast = e.colors,
      orderCreate = t.currentTarget.dataset.key,
      mta_analysis = this.data.arrayCargo,
      util = t.detail.value,
      s =
        (this.data.colorFineCodeItem,
        toast
          .find(function (t) {
            return t.id === objectSpread2;
          })
          .dyelotArr.find(function (t) {
            return t.index === dialog;
          }).list);
    ((s[orderCreate].priceUnit = mta_analysis[util]),
      this.setData({
        tabCurrentColorList: toConsumableArray(s),
      }),
      this.totalPriceQuantity());
  },
  handleBlurInput: function (t) {
    var toConsumableArray = t.detail.value,
      dialog = t.target.dataset,
      toast = dialog.key,
      orderCreate = dialog.index,
      mta_analysis = dialog.input,
      util = toConsumableArray.substr(toConsumableArray.length - 1);
    if (
      ((o = 0 == toConsumableArray ? "" : toConsumableArray),
      "." == util && (o = Number(toConsumableArray)),
      toast &&
        this.setData({
          toast: toConsumableArray,
        }),
      "colorFineCodeItem" === mta_analysis &&
        this.setData({
          "colorFineCodeItem[0].inputVal": toConsumableArray,
        }),
      void 0 !== orderCreate)
    ) {
      var s = this.data.colorFineCodeItem.map(function (t, e) {
        return e === orderCreate
          ? objectSpread2(
              objectSpread2({}, t),
              {},
              {
                inputVal: toConsumableArray,
              },
            )
          : t;
      });
      this.setData({
        colorFineCodeItem: s,
      });
    }
  },
  handleInputDecimalLeng: function (t) {
    var toConsumableArray = t.currentTarget.dataset.key,
      objectSpread2 = /^(\.*)(\d+)(\.?)(\d{0,2}).*$/g,
      dialog = t.detail.value,
      toast = objectSpread2.test(dialog) ? dialog.replace(objectSpread2, "$2$3$4") : "";
    return (
      this.setData({
        toConsumableArray: toast,
      }),
      toast
    );
  },
  limitInputDecimalLeng4: function (t) {
    var toConsumableArray = t.currentTarget.dataset.key,
      objectSpread2 = /^(\.*)(\d+)(\.?)(\d{0,4}).*$/g,
      dialog = t.detail.value,
      toast = objectSpread2.test(dialog) ? dialog.replace(objectSpread2, "$2$3$4") : "";
    return (
      this.setData({
        toConsumableArray: toast,
      }),
      toast
    );
  },
  handleDyelotInput: function (t) {
    var toConsumableArray = t.currentTarget.dataset.key,
      objectSpread2 = t.detail.value;
    this.setData({
      toConsumableArray: objectSpread2,
    });
  },
  handleInputDecimalLengOne: function (t) {
    var toConsumableArray = t.currentTarget.dataset,
      dialog = toConsumableArray.key,
      toast = toConsumableArray.index,
      orderCreate = toConsumableArray.input,
      mta_analysis = /^(\.*)(\d+)(\.?)(\d{0,1}).*$/g,
      util = t.detail.value,
      s = mta_analysis.test(util) ? util.replace(mta_analysis, "$2$3$4") : "";
    if (
      (orderCreate &&
        this.setData({
          "colorFineCodeItem[0].inputVal": s,
        }),
      dialog &&
        this.setData({
          dialog: s,
        }),
      void 0 !== toast)
    ) {
      var app = this.data.colorFineCodeItem.map(function (t, e) {
        return e === toast
          ? objectSpread2(
              objectSpread2({}, t),
              {},
              {
                inputVal: s,
              },
            )
          : t;
      });
      this.setData({
        colorFineCodeItem: app,
      });
    }
    return s;
  },
  handleInputDecimalLengFn: function (t) {
    var e = /^(\.*)(\d+)(\.?)(\d{0,2}).*$/g,
      toConsumableArray = t.detail.value;
    return e.test(toConsumableArray) ? toConsumableArray.replace(e, "$2$3$4") : "";
  },
  closeColor: function () {
    this.setData({
      showPickerColorSelect: !1,
    });
  },
  addColor: function () {
    wx.navigateTo({
      url: "/packageB/pages/color-card-management/add-color-card/add-color/add-color",
    });
  },
});
