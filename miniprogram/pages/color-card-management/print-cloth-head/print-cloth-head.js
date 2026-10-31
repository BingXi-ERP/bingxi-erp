var t = require("../../../@babel/runtime/helpers/interopRequireDefault").default,
  a = require("../../../@babel/runtime/helpers/defineProperty"),
  mta_analysis = t(require("../../../utils/mta_analysis.js")),
  ServicesPrint = require("../../../libs/services/ServicesPrint");
getApp();
Page({
  data: {
    icon: {
      banAdd: "${app.config.imgHost}/img/customer/duibuIcon/icon/banAdd.png",
    },
    isFocus: !1,
    isEdit: !1,
    showPickerColorSelect: !1,
    showDialogColorFineCode: !1,
    colorFineCode: "",
    colorList: [],
    selectedColorList: [],
    selectedColorItem: {},
    selectColorFineCode: [],
    colorCardId: null,
    tabCurrentColorId: "",
    priceUnit: null,
    colorFineCodeList: [],
    ischeckFineCode: !1,
    unit: ["米", "公斤", "码", "吨", "盎司", "个"],
    unitIndex: 0,
    jarNum: "",
    colorJarNumFineCodeList: [],
    selectedjarNumList: [],
    jarNumFineCodeList: [],
    modalJarNumList: [],
    tabCurrentColor: 0,
    tabCurrentJarNum: 0,
    isAddJarNum: !1,
    isAddFineCode: !1,
    isFocusFineCode: !1,
    modalAloneJarNumList: [],
    placeHolder: "请输入细码",
  },
  inputgetName: function (t) {
    (console.log(t.currentTarget.dataset.name),
      this.setData({
        [t.currentTarget.dataset.name]: t.detail.value.replace(/(^\s*)|(\s*$)/g, ""),
      }));
  },
  handleShowPickerColorSelect: function () {
    this.setData({
      showPickerColorSelect: !0,
      isAddJarNum: !1,
      isAddFineCode: !1,
      tabCurrentJarNum: 0,
      placeHolder: "请输入细码",
    });
  },
  handleHidePickerColorSelect: function () {
    this.setData({
      showPickerColorSelect: !1,
    });
  },
  handleShowDialogColorFineCode: function () {
    var t = this;
    (this.handleHidePickerColorSelect(),
      this.setData({
        showDialogColorFineCode: !0,
      }),
      this.data.selectedColorList.map(function (a) {
        a.colorId == t.data.selectedColorItem.id && (t.data.colorFineCodeList = a.quantities);
      }),
      this.setData({
        colorFineCodeList: t.data.colorFineCodeList,
      }),
      this.setData({
        modalJarNumList: [],
        ischeckFineCode: !1,
      }));
  },
  selectColor: function (t) {
    (console.log(t.currentTarget.dataset),
      this.setData({
        selectedColorItem: t.currentTarget.dataset,
      }),
      this.handleShowDialogColorFineCode());
  },
  handleFinishedAddColorDetail: function () {
    var t = this,
      a = setTimeout(function () {
        (clearTimeout(a), t.finishedAddColorDetail());
      }, 350);
  },
  finishedAddColorDetail: function () {
    var t = this;
    (this.setData({
      placeHolder: "",
      isFocusFineCode: !1,
    }),
      wx.hideKeyboard(),
      this.setData({
        isFocusFineCode: !1,
      }),
      ("" != this.data.jarNum &&
        "" == this.data.colorFineCode &&
        this.data.modalJarNumList.length < 1) ||
      ("" != this.data.jarNum &&
        "" == this.data.colorFineCode &&
        this.data.modalAloneJarNumList.length < 1 &&
        this.data.isAddJarNum)
        ? this.setData({
            ischeckFineCode: !0,
          })
        : "" == this.data.colorFineCode && this.data.modalJarNumList.length < 1
          ? this.setData({
              showDialogColorFineCode: !1,
              ischeckFineCode: !0,
            })
          : (this.setData({
              ischeckFineCode: !1,
            }),
            this.data.colorFineCode.includes(".") &&
              this.data.colorFineCode.indexOf(".") == this.data.colorFineCode.length - 1 &&
              (this.data.colorFineCode = this.data.colorFineCode.substr(
                0,
                this.data.colorFineCode.length - 1,
              )),
            "" == this.data.colorFineCode || 0 != this.data.colorFineCode
              ? (this.data.isAddJarNum &&
                  ("" != this.data.colorFineCode && t.checkAddColorDetail(),
                  (this.data.colorJarNumFineCodeList[this.data.tabCurrentColor].dyelotDetailModels =
                    this.data.modalJarNumList)),
                this.data.isAddFineCode &&
                  ("" != this.data.colorFineCode && t.checkAddColorDetail(),
                  (this.data.colorJarNumFineCodeList[this.data.tabCurrentColor].dyelotDetailModels[
                    this.data.tabCurrentJarNum
                  ] = this.data.modalJarNumList[0])),
                this.data.isAddJarNum ||
                  this.data.isAddFineCode ||
                  ("" != this.data.colorFineCode &&
                    (this.setData({
                      showDialogColorFineCode: !1,
                    }),
                    t.checkAddColorDetail()),
                  this.data.colorJarNumFineCodeList.push({
                    color: t.data.selectedColorItem.color,
                    colorName: t.data.selectedColorItem.colorName,
                    colorId: t.data.selectedColorItem.id,
                    dyelotDetailModels: t.data.modalJarNumList,
                  }),
                  this.setData({
                    tabCurrentColor: t.data.colorJarNumFineCodeList.length - 1,
                  })),
                this.data.colorList.forEach(function (a, e) {
                  a.id == t.data.selectedColorItem.id && (t.data.colorList[e].isSelected = !0);
                }),
                this.setData({
                  selectedColorItem: {},
                  colorList: t.data.colorList,
                  colorJarNumFineCodeList: t.data.colorJarNumFineCodeList,
                  selectedjarNumList:
                    t.data.colorJarNumFineCodeList[t.data.tabCurrentColor].dyelotDetailModels,
                  colorFineCodeList: t.data.modalJarNumList[0].quantityDetailModels,
                  jarNum: "",
                  showDialogColorFineCode: !1,
                  colorFineCodeList:
                    t.data.colorJarNumFineCodeList[t.data.tabCurrentColor].dyelotDetailModels[
                      t.data.tabCurrentJarNum
                    ].quantityDetailModels,
                }))
              : wx.showToast({
                  title: "细码不能为0",
                  icon: "none",
                })));
  },
  handleAddColorDetail: function () {
    var t = this;
    if ("" != this.data.colorFineCode) {
      if (
        (this.setData({
          ischeckFineCode: !1,
        }),
        this.data.colorFineCode.includes(".") &&
          this.data.colorFineCode.indexOf(".") == this.data.colorFineCode.length - 1 &&
          (this.data.colorFineCode = this.data.colorFineCode.substr(
            0,
            this.data.colorFineCode.length - 1,
          )),
        0 != this.data.colorFineCode)
      ) {
        if (this.data.isAddFineCode)
          this.data.modalJarNumList[0].quantityDetailModels.push({
            quantity: t.data.colorFineCode,
            quantityUnit: t.data.unit[t.data.unitIndex],
          });
        else {
          var a,
            mta_analysis = !1;
          (t.data.modalJarNumList.forEach(function (o, i) {
            o.dyelot == t.data.jarNum && ((a = i), (e = !0));
          }),
            mta_analysis
              ? t.data.modalJarNumList[a].quantityDetailModels.push({
                  quantity: t.data.colorFineCode,
                  quantityUnit: t.data.unit[t.data.unitIndex],
                })
              : t.data.modalJarNumList.push({
                  dyelot: t.data.jarNum,
                  quantityDetailModels: [
                    {
                      quantity: t.data.colorFineCode,
                      quantityUnit: t.data.unit[t.data.unitIndex],
                    },
                  ],
                }));
        }
        (this.aloneAddColorDetail(),
          this.setData({
            colorFineCode: "",
          }),
          this.setData({
            isFocusFineCode: !0,
            modalJarNumList: t.data.modalJarNumList,
          }));
      } else
        wx.showToast({
          title: "细码不能为0",
          icon: "none",
        });
    } else
      this.setData({
        ischeckFineCode: !0,
      });
  },
  handleSwitchColor: function (t) {
    var a = t.currentTarget.dataset.index,
      mta_analysis = JSON.parse(
        JSON.stringify(
          this.data.colorJarNumFineCodeList[a].dyelotDetailModels[0].quantityDetailModels,
        ),
      );
    this.setData({
      tabCurrentColor: a,
      selectedjarNumList: this.data.colorJarNumFineCodeList[a].dyelotDetailModels,
      tabCurrentJarNum: 0,
      colorFineCodeList: mta_analysis,
    });
  },
  handleSwitchJarNum: function (t) {
    var a = t.currentTarget.dataset.index;
    this.setData({
      tabCurrentJarNum: a,
      colorFineCodeList:
        this.data.colorJarNumFineCodeList[this.data.tabCurrentColor].dyelotDetailModels[a]
          .quantityDetailModels,
    });
  },
  handleDelTabColorTab: function (t) {
    var a = this,
      mta_analysis = t.currentTarget.dataset.id,
      ServicesPrint = t.currentTarget.dataset.index;
    wx.showModal({
      content: "该颜色下的所有细码将被删除，确认此操作？",
      success: function (t) {
        t.confirm
          ? (a.data.colorJarNumFineCodeList.splice(ServicesPrint, 1),
            a.data.colorList.forEach(function (t, o) {
              t.id == mta_analysis && (a.data.colorList[o].isSelected = !1);
            }),
            a.data.colorJarNumFineCodeList.length > 0
              ? a.setData({
                  colorJarNumFineCodeList: a.data.colorJarNumFineCodeList,
                  colorList: a.data.colorList,
                  tabCurrentColor: 0,
                  tabCurrentJarNum: 0,
                  selectedjarNumList: [a.data.colorJarNumFineCodeList[0].dyelotDetailModels[0]],
                  colorFineCodeList:
                    a.data.colorJarNumFineCodeList[0].dyelotDetailModels[0].quantityDetailModels,
                })
              : a.setData({
                  colorJarNumFineCodeList: [],
                  colorList: a.data.colorList,
                  tabCurrentColor: 0,
                  tabCurrentJarNum: 0,
                  selectedjarNumList: [],
                  colorFineCodeList: [],
                }))
          : t.cancel && console.log("用户点击取消");
      },
    });
  },
  handleDelTabJarNum: function (t) {
    var a = this,
      mta_analysis = t.currentTarget.dataset.index;
    wx.showModal({
      content: "该缸号下的所有细码将被删除，确认此操作？",
      success: function (t) {
        t.confirm
          ? (a.data.colorJarNumFineCodeList[a.data.tabCurrentColor].dyelotDetailModels.splice(
              mta_analysis,
              1,
            ),
            a.data.colorJarNumFineCodeList[a.data.tabCurrentColor].dyelotDetailModels.length < 1
              ? a.setData({
                  colorJarNumFineCodeList: a.data.colorJarNumFineCodeList,
                  tabCurrentJarNum: 0,
                  selectedjarNumList:
                    a.data.colorJarNumFineCodeList[a.data.tabCurrentColor].dyelotDetailModels,
                  colorFineCodeList: [],
                })
              : a.setData({
                  colorJarNumFineCodeList: a.data.colorJarNumFineCodeList,
                  tabCurrentJarNum: 0,
                  selectedjarNumList:
                    a.data.colorJarNumFineCodeList[a.data.tabCurrentColor].dyelotDetailModels,
                  colorFineCodeList:
                    a.data.colorJarNumFineCodeList[a.data.tabCurrentColor].dyelotDetailModels[0]
                      .quantityDetailModels,
                }))
          : t.cancel && console.log("用户点击取消");
      },
    });
  },
  handleDelFineCode: function (t) {
    var a = this,
      mta_analysis = this,
      ServicesPrint = t.currentTarget.dataset.index;
    (wx.showModal({
      content: "确定删除细码？",
      success: function (t) {
        t.confirm
          ? (mta_analysis.data.colorJarNumFineCodeList[
              mta_analysis.data.tabCurrentColor
            ].dyelotDetailModels[mta_analysis.data.tabCurrentJarNum].quantityDetailModels.splice(
              ServicesPrint,
              1,
            ),
            mta_analysis.setData({
              colorJarNumFineCodeList: mta_analysis.data.colorJarNumFineCodeList,
              colorFineCodeList:
                mta_analysis.data.colorJarNumFineCodeList[mta_analysis.data.tabCurrentColor]
                  .dyelotDetailModels[mta_analysis.data.tabCurrentJarNum].quantityDetailModels,
            }))
          : t.cancel && console.log("用户点击取消");
      },
    }),
      this.data.selectedColorList.map(function (t, e) {
        if (t.colorId != a.data.selectedColorItem.id);
        else if (
          (a.data.selectedColorList[e].quantities.splice(itemIndex, 1),
          a.setData({
            selectedColorList: a.data.selectedColorList,
            selectColorFineCode: a.data.selectedColorList[e].quantities,
          }),
          0 == a.data.selectedColorList[e].quantities.length &&
            (a.data.selectedColorList.splice(e, 1),
            a.setData({
              selectedColorList: a.data.selectedColorList,
            }),
            a.data.selectedColorList.length > 0))
        ) {
          a.setData({
            tabCurrentColorId: a.data.selectedColorList[0].colorId,
            selectColorFineCode: a.data.selectedColorList[0].quantities,
          });
          var ServicesPrint = a.data.selectedColorList[0].colorId;
          a.data.colorList.forEach(function (t) {
            t.id == ServicesPrint &&
              a.setData({
                selectedColorItem: t,
              });
          });
        }
      }));
  },
  handleToggleEdit: function () {
    this.setData({
      isEdit: !this.data.isEdit,
    });
  },
  handleInputDecimalLengOne: function (t) {
    t.currentTarget.dataset.key;
    var mta_analysis = /^(\.*)(\d+)(\.?)(\d{0,1}).*$/g,
      ServicesPrint = t.detail.value,
      i = mta_analysis.test(ServicesPrint) ? ServicesPrint.replace(mta_analysis, "$2$3$4") : "";
    return (
      this.setData({
        [t.currentTarget.dataset.name]: i,
      }),
      i
    );
  },
  jarNumEnter: function (t) {},
  toPrintFormat: function () {
    if (!(this.data.colorJarNumFineCodeList.length < 1 || this.data.isEdit)) {
      var t = this.data.colorCardId,
        a = JSON.stringify(this.data.colorJarNumFineCodeList),
        mta_analysis = this.data.newPrintType;
      wx.navigateTo({
        url: "/pages/color-card-management/print-cloth-head/print-format/print-format?goodsId="
          .concat(t, "&&colorDetailModels=")
          .concat(a, "&&newPrintType=")
          .concat(mta_analysis),
      });
    }
  },
  changeUnit: function (t) {
    this.setData({
      unitIndex: t.detail.value,
    });
  },
  closeKybo: function () {
    wx.hideKeyboard();
  },
  addJarNum: function () {
    if (
      (this.setData({
        colorFineCode: "",
        modalAloneJarNumList: [],
        placeHolder: "请输入细码",
      }),
      !(this.data.colorJarNumFineCodeList.length < 1))
    ) {
      this.setData({
        isAddJarNum: !0,
        isAddFineCode: !1,
        showDialogColorFineCode: !0,
        ischeckFineCode: !1,
        modalJarNumList: JSON.parse(JSON.stringify(this.data.selectedjarNumList)),
      });
    }
  },
  addFineCode: function () {
    if (
      (this.setData({
        isFocusFineCode: !1,
        colorFineCode: "",
        placeHolder: "请输入细码",
      }),
      !(this.data.selectedjarNumList.length < 1))
    ) {
      var t = [];
      (t.push(JSON.parse(JSON.stringify(this.data.selectedjarNumList[this.data.tabCurrentJarNum]))),
        this.setData({
          isAddJarNum: !1,
          isAddFineCode: !0,
          showDialogColorFineCode: !0,
          modalJarNumList: t,
        }));
    }
  },
  checkAddColorDetail: function () {
    var t = this;
    if ("" != this.data.colorFineCode) {
      if (this.data.isAddFineCode)
        this.data.modalJarNumList[0].quantityDetailModels.push({
          quantity: t.data.colorFineCode,
          quantityUnit: t.data.unit[t.data.unitIndex],
        });
      else {
        var a,
          mta_analysis = !1;
        (t.data.modalJarNumList.forEach(function (o, i) {
          o.dyelot == t.data.jarNum && ((a = i), (e = !0));
        }),
          mta_analysis
            ? t.data.modalJarNumList[a].quantityDetailModels.push({
                quantity: t.data.colorFineCode,
                quantityUnit: t.data.unit[t.data.unitIndex],
              })
            : t.data.modalJarNumList.push({
                dyelot: t.data.jarNum,
                quantityDetailModels: [
                  {
                    quantity: t.data.colorFineCode,
                    quantityUnit: t.data.unit[t.data.unitIndex],
                  },
                ],
              }));
      }
      (this.setData({
        modalJarNumList: t.data.modalJarNumList,
      }),
        this.setData({
          colorFineCode: "",
          ischeckFineCode: !1,
        }));
    } else
      this.setData({
        ischeckFineCode: !0,
      });
  },
  aloneAddColorDetail: function () {
    var t = this;
    if (this.data.isAddJarNum) {
      if (this.data.isAddFineCode)
        this.data.modalAloneJarNumList[0].quantityDetailModels.push({
          quantity: t.data.colorFineCode,
          quantityUnit: t.data.unit[t.data.unitIndex],
        });
      else {
        var a,
          mta_analysis = !1;
        (t.data.modalAloneJarNumList.forEach(function (o, i) {
          o.dyelot == t.data.jarNum && ((a = i), (e = !0));
        }),
          mta_analysis
            ? t.data.modalAloneJarNumList[a].quantityDetailModels.push({
                quantity: t.data.colorFineCode,
                quantityUnit: t.data.unit[t.data.unitIndex],
              })
            : t.data.modalAloneJarNumList.push({
                dyelot: t.data.jarNum,
                quantityDetailModels: [
                  {
                    quantity: t.data.colorFineCode,
                    quantityUnit: t.data.unit[t.data.unitIndex],
                  },
                ],
              }));
      }
      this.setData({
        modalAloneJarNumList: t.data.modalAloneJarNumList,
      });
    }
  },
  onLoad: function (t) {
    var a = this;
    (mta_analysis.default.Page.init(),
      this.setData({
        colorCardId: t.goodsId,
        newPrintType: t.newPrintType,
      }),
      (0, ServicesPrint.getColorCard)(t.goodsId).then(function (t) {
        0 === t.code
          ? a.setData({
              colorList: t.data.colorList,
              selectedColorItem: t.data.colorList[0],
              priceUnit: t.data.priceUnit,
            })
          : wx.showToast({
              title: t.msg,
              icon: "none",
            });
      }));
  },
  onReady: function () {},
  onShow: function () {},
  onHide: function () {},
  onUnload: function () {},
  onPullDownRefresh: function () {},
  onReachBottom: function () {},
  onShareAppMessage: function () {},
});
