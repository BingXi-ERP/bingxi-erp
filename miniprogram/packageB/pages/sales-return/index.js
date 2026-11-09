var t = require("../../../@babel/runtime/helpers/interopRequireDefault").default,
  e = require("../../../@babel/runtime/helpers/defineProperty"),
  toConsumableArray = require("../../../@babel/runtime/helpers/toConsumableArray"),
  mta_analysis = t(require("../../../utils/mta_analysis")),
  time = require("../../../libs/utils/time"),
  dialog = t(require("../../../miniprogram_npm/@vant/weapp/dialog/dialog")),
  ServicesReturn = require("../../libs/services/ServicesReturn"),
  ServicesUserLog = require("../../libs/services/ServicesUserLog"),
  login = require("../../libs/utils/login"),
  app = getApp(),
  d = "orderCreateColors",
  u = (0, time.parseTime)((0, time.getPrevMonthFirstDay)().getTime(), "{y}-{m}-{d}"),
  h = (0, time.parseTime)(new Date().getTime(), "{y}-{m}-{d}");
Page({
  data: {
    globalApp: app,
    setTimeOpen: !1,
    remarksFocus: !1,
    id: "",
    purchaseImg: [],
    recordArr: [],
    onlineOrder: "",
    orderId: "",
    orderNo: "",
    customerId: "",
    customerName: "",
    customerMobile: "",
    minDate: u,
    maxDate: h,
    billingPurchaseImgList: [],
    oldId: "",
    createDate: h,
    createDateTimestamp: new Date(),
    productType: "full",
    icon: {
      cross: "".concat(app.config.imgHost, "/img/customer/Icon_Add_cross.png"),
      del: "".concat(app.config.imgHost, "/img/customer/duibuIcon/color_delete@2x.png"),
      edit: "".concat(app.config.imgHost, "/img/customer/duibuIcon/color_editor@2x.png"),
    },
    selectSalesBillId: "",
    salesList: {
      salesId: "",
      salesName: "",
      salesMobile: "",
    },
    products: [],
    cost: "",
    remarks: "",
    totalAccount: "0.00",
    productsDeclaration: [],
    buyerRemarks: "",
    orderTime: null,
    getIndentifyType: 0,
    picker: {
      createDate: !1,
    },
  },
  getUserId: function () {
    if (app.globalData.userInfo) {
      var t = app.globalData.userInfo,
        e = t.id,
        toConsumableArray = t.nickName,
        mta_analysis = t.fullName,
        time = t.mobile,
        dialog = t.type,
        ServicesReturn = {
          salesId: e,
          salesName: toConsumableArray || mta_analysis,
          salesMobile: time,
        };
      this.setData({
        salesList: ServicesReturn,
        getIndentifyType: dialog,
      });
    }
  },
  uoloadImg: function (t) {
    var e = t.detail.showImgList;
    (this.setData({
      billingPurchaseImgList: e,
    }),
      console.log(this.data.billingPurchaseImgList));
  },
  delImg: function (t) {
    var e = t.detail.showImgList;
    (this.setData({
      billingPurchaseImgList: e,
    }),
      console.log(this.data.billingPurchaseImgList));
  },
  addItem: function (t) {
    var e = "full",
      toConsumableArray = t.currentTarget.dataset.id,
      mta_analysis = "/pages/order-create/product-full/index?productType="
        .concat(e, "&openType=")
        .concat("salesReturn", "&colorCardId=")
        .concat(toConsumableArray, "&fromCreate=1");
    wx.navigateTo({
      url: mta_analysis,
    });
  },
  onLoad: function (t) {
    (mta_analysis.default.Page.init(), login.login.getUserInfo(), this.getUserId());
    var e = t.id,
      toConsumableArray = void 0 === e ? "" : e,
      time = t.orderId,
      dialog = void 0 === time ? "" : time,
      ServicesReturn = t.orderNo,
      ServicesUserLog = void 0 === ServicesReturn ? "" : ServicesReturn;
    (t.reBillingId, t.onlineOrder);
    this.setData({
      id: toConsumableArray,
      orderId: dialog,
      orderNo: ServicesUserLog,
      onlineOrder: dialog,
    });
  },
  onReady: function () {},
  onShow: function () {
    (wx.removeStorageSync(d), wx.removeStorageSync("orderCreateInfo"), this.totalProductAccount());
  },
  onHide: function () {},
  onUnload: function () {},
  onPullDownRefresh: function () {},
  onReachBottom: function () {},
  onShareAppMessage: function () {},
  handlelSelectCustomer: function () {
    wx.navigateTo({
      url: "/pages/customer-management/all-customer-list-choose/all-customer-list-choose",
    });
  },
  updateCustomer: function (t) {
    this.setData({
      customerId: t.id,
      customerName: t.fullname,
      customerMobile: t.mobile,
    });
  },
  handlelSelectSales: function () {
    3 === this.data.getIndentifyType &&
      wx.navigateTo({
        url: "./select-sales/index",
      });
  },
  updateSales: function (t) {
    var e = {
      salesId: t.salesId,
      salesName: t.salesName,
      salesMobile: t.salesMobile,
    };
    this.setData({
      salesList: e,
    });
  },
  handlelSelectBill: function () {
    var t = this.data.customerId;
    t
      ? wx.navigateTo({
          url: "./select-bill/index?customerId=".concat(t),
        })
      : wx.showToast({
          title: "请先选择客户",
          icon: "none",
        });
  },
  updateSalesBill: function (t, e) {
    (ServicesUserLog.servicesUserLog.setUserHandleLog(501),
      this.setData({
        selectSalesBillId: t,
        selectSalesBillNo: e,
      }));
  },
  handleToggle: function (t) {
    var e = t.currentTarget.dataset.id,
      toConsumableArray = this.data.products.find(function (t) {
        return t.id === e;
      });
    ((toConsumableArray.isOpened = !toConsumableArray.isOpened),
      this.setData({
        products: this.data.products,
      }));
  },
  handleProductDel: function (t) {
    var e = this;
    dialog.default
      .confirm({
        message: "确认删除？",
      })
      .then(function () {
        var toConsumableArray = t.currentTarget.dataset.id,
          mta_analysis = e.data.products.filter(function (t) {
            return t.id !== toConsumableArray;
          });
        (e.setData({
          products: mta_analysis,
        }),
          e.totalProductAccount());
      })
      .catch(function () {});
  },
  handleProductEdit: function (t) {
    var e = t.currentTarget.dataset.id,
      toConsumableArray = this.data.productType,
      mta_analysis = this.data.products.find(function (t) {
        return t.id === e;
      }),
      time = "/pages/order-create/product-full/index?productType="
        .concat(toConsumableArray, "&openType=")
        .concat("salesReturn", "&colorCardId=")
        .concat(e, "&fromCreate=1");
    (wx.setStorage({
      key: d,
      data: mta_analysis,
    }),
      wx.navigateTo({
        url: time,
      }));
  },
  addProduct: function () {
    if ("" !== this.data.productType) {
      var t = this.data.products.map(function (t) {
          return t.id;
        }),
        e = "productType="
          .concat(this.data.productType, "&openType=salesReturn&ids=")
          .concat(t.join(",")),
        toConsumableArray = "/pages/order-create/color-card/select?".concat(e);
      wx.navigateTo({
        url: toConsumableArray,
      });
    } else
      wx.showToast({
        title: "请先选择货品类型",
        icon: "none",
      });
  },
  reChoose: function (t) {
    if ("" !== this.data.productType) {
      var e = t.currentTarget.dataset,
        toConsumableArray = e.oldId;
      e.expiredFlag;
      this.data.oldId = toConsumableArray;
      var mta_analysis = "productType="
          .concat(this.data.productType, "&openType=salesReturn&ids=")
          .concat(""),
        time = "/pages/order-create/color-card/select?".concat(mta_analysis);
      wx.navigateTo({
        url: time,
      });
    } else
      wx.showToast({
        title: "请先选择货品类型",
        icon: "none",
      });
  },
  updateProduct: function (t) {
    var e = this;
    if (this.data.oldId) {
      var mta_analysis = this.data.products.filter(function (t) {
        return t.id !== e.data.oldId;
      });
      this.setData({
        products: mta_analysis,
      });
    }
    var time = this.data.products.find(function (e) {
      return e.id === t.id;
    });
    if (time)
      ((time.colors = toConsumableArray(t.colors)),
        (time.totalQuantity = t.totalQuantity),
        (time.totalPrice = t.totalPrice),
        (time.tabCurrentColorId = t.tabCurrentColorId),
        (time.tabCurrentColor = t.tabCurrentColor),
        (time.tabCurrentColorName = t.tabCurrentColorName),
        (time.tabCurrentColorList = toConsumableArray(t.tabCurrentColorList)),
        (time.tabCurrentDyelot = t.tabCurrentDyelot),
        (time.tabCurrentDyelotId = t.tabCurrentDyelotId),
        (time.billingStatus = null),
        this.setData({
          products: this.data.products,
        }));
    else {
      var dialog = this.data.products.concat(t);
      this.setData({
        products: dialog,
      });
    }
    var ServicesReturn = this.data.productsDeclaration.filter(function (e) {
      return e.goodsId !== t.id;
    });
    (this.setData({
      productsDeclaration: ServicesReturn,
    }),
      this.totalProductAccount());
  },
  totalProductAccount: function () {
    console.log("合计商品价格 + 其他费用");
    var t = this.data,
      e = t.products,
      toConsumableArray = t.cost,
      mta_analysis = Number(toConsumableArray);
    (e.forEach(function (t) {
      o += Number(t.totalPrice);
    }),
      this.setData({
        totalAccount: mta_analysis.toFixed(2),
      }));
  },
  handleSwitchColor: function (t) {
    var e = t.currentTarget.dataset,
      toConsumableArray = e.index,
      mta_analysis = e.productId,
      time = this.data.products.find(function (t) {
        return t.id === mta_analysis;
      });
    (console.log(time.colors[toConsumableArray]),
      (time.tabCurrentColorId = time.colors[toConsumableArray].id),
      (time.tabCurrentColor = time.colors[toConsumableArray].color),
      (time.tabCurrentColorName = time.colors[toConsumableArray].colorName),
      (time.tabCurrentDyelot = time.colors[toConsumableArray].dyelotArr),
      (time.tabCurrentDyelotId = time.colors[toConsumableArray].dyelotArr[0].id),
      (time.tabCurrentColorList = time.colors[toConsumableArray].dyelotArr[0].list),
      this.setData({
        products: this.data.products,
      }));
  },
  changeCurrentDyelot: function (t) {
    var e = t.currentTarget.dataset,
      toConsumableArray = e.index,
      mta_analysis = e.productId,
      time = e.productItem.tabCurrentColorId,
      dialog = this.data.products.find(function (t) {
        return t.id === mta_analysis;
      }),
      ServicesReturn = dialog.colors.find(function (t) {
        return t.id === time;
      });
    ((dialog.tabCurrentDyelot = ServicesReturn.dyelotArr),
      (dialog.tabCurrentDyelotId = ServicesReturn.dyelotArr[toConsumableArray].id),
      (dialog.tabCurrentColorList = ServicesReturn.dyelotArr[toConsumableArray].list),
      this.setData({
        products: this.data.products,
      }));
  },
  resetData: function () {
    this.setData({
      createDate: h,
      products: [],
      cost: "",
      remarks: "",
      totalAccount: "0.00",
    });
  },
  goback: function () {
    wx.navigateBack();
  },
  handleUpdateVal: function (t) {
    var toConsumableArray = t.currentTarget.dataset.key,
      mta_analysis = t.detail.value;
    (this.setData({
      toConsumableArray: mta_analysis,
    }),
      "cost" === toConsumableArray && this.totalProductAccount());
  },
  handleUpdateCostVal: function (t) {
    var toConsumableArray = t.currentTarget.dataset.key,
      mta_analysis = /^(\.*)(\d+)(\.?)(\d{0,2}).*$/g,
      time = t.detail.value,
      dialog = mta_analysis.test(time) ? time.replace(mta_analysis, "$2$3$4") : "";
    return (
      this.setData({
        toConsumableArray: dialog,
      }),
      dialog
    );
  },
  handleBlurCostVal: function (t) {
    var toConsumableArray = t.detail.value,
      mta_analysis = t.target.dataset.key,
      time = toConsumableArray.substr(toConsumableArray.length - 1);
    ((a =
      "" != (a = 0 == toConsumableArray ? "" : toConsumableArray) ? Number(toConsumableArray) : ""),
      "." == time && (a = Number(toConsumableArray)),
      this.setData({
        mta_analysis: toConsumableArray,
      }),
      this.totalProductAccount());
  },
  handleInputDecimalLeng: function (t) {
    var e = /^(\.*)(\d+)(\.?)(\d{0,2}).*$/g,
      toConsumableArray = t.detail.value;
    return e.test(toConsumableArray) ? toConsumableArray.replace(e, "$2$3$4") : "";
  },
  handleDateChange: function (t) {
    (console.log("picker发送选择改变，携带值为", t.detail.value),
      this.setData({
        createDate: t.detail.value,
      }));
  },
  handleToggleDeclarationDetail: function (t) {
    var e = t.currentTarget.dataset.index,
      toConsumableArray = this.data.productsDeclaration;
    ((toConsumableArray[e].isOpened = !toConsumableArray[e].isOpened),
      this.setData({
        productsDeclaration: this.data.productsDeclaration,
      }));
  },
  showDatetimePicker: function () {
    this.setData({
      picker: {
        createDate: !0,
      },
    });
  },
  hideDatetimePicker: function () {
    this.setData({
      picker: {
        createDate: !1,
      },
    });
  },
  handleShowTextarea: function () {
    this.setData({
      remarksFocus: !0,
    });
  },
  handleHideTextarea: function () {
    this.setData({
      remarksFocus: !1,
    });
  },
  handleEntryReturnList: function () {
    (ServicesUserLog.servicesUserLog.setUserHandleLog(502),
      wx.navigateTo({
        url: "./sales-return-list/index",
      }));
  },
  getOrderPinParams: function () {
    var t = this.data,
      e = (t.id, t.orderId, t.orderNo, t.customerId),
      toConsumableArray = (t.customerName, t.createDate),
      mta_analysis = t.products,
      time = t.salesList,
      dialog = t.selectSalesBillId,
      ServicesReturn = t.remarks,
      ServicesUserLog = (t.totalAccount, t.billingPurchaseImgList),
      login = [];
    return (
      mta_analysis.forEach(function (t) {
        var e = [];
        t.colors.forEach(function (t) {
          t.dyelotArr.forEach(function (a) {
            a.list.forEach(function (o) {
              var time = {
                goodsColorId: t.id || "",
                colorNo: t.color || "",
                colorName: t.colorName || "",
                colorPrice: o.price || "",
                dyelot: a.id,
                quantityUnit: o.priceUnit,
                colorAmount: o.total || "",
                totalQuantity: o.quantity || "",
              };
              e.push(time);
            });
          });
        });
        var toConsumableArray = {
          goodsId: t.id || "",
          goodsName: t.name || "",
          goodsNo: t.No || "",
          goodsImgPath: t.image || "",
          goodsUnit: t.unit || "",
          colorCount: t.colorCount || "",
          itemCount: t.itemCount || "",
          totalQuantity: t.totalQuantity || "",
          goodsAmount: t.totalPrice || "",
          refundGoodsColorList: e,
          deviation: t.differenceNum ? t.differenceNum : "",
          deviationType: t.differenceSymbol ? t.differenceSymbol : "",
        };
        login.push(toConsumableArray);
      }),
      {
        billingDate: toConsumableArray || "",
        billingUserId: time.salesId,
        customerId: e,
        refundGoodsDetailModelList: login,
        refundImgPathList: ServicesUserLog,
        saleBillingId: dialog,
        billingRemark: ServicesReturn,
      }
    );
  },
  saveRutenRequest: function () {
    var t = this.data,
      e = t.customerId,
      toConsumableArray = t.products,
      mta_analysis = [];
    if (
      (e && "" !== e
        ? 0 === toConsumableArray.length && mta_analysis.push("请添加商品")
        : mta_analysis.push("请选择客户"),
      0 === mta_analysis.length)
    ) {
      (wx.showLoading({
        title: "保存中",
        mask: !0,
      }),
        clearTimeout(this.data.setTimeOpen));
      var time = this.getOrderPinParams();
      this.data.setTimeOpen = setTimeout(function () {
        ServicesReturn.ServicesReturn.saveRefundBilling(time).then(function (t) {
          0 === t.code
            ? (ServicesUserLog.servicesUserLog.setUserHandleLog(500),
              wx.hideLoading(),
              wx.redirectTo({
                url: "./sales-return-list/sales-return-list-detail/index?id=".concat(
                  t.data.refundId,
                ),
              }))
            : (wx.showToast({
                title: t.msg,
                icon: "none",
              }),
              wx.hideLoading());
        });
      }, 500);
    } else
      wx.showToast({
        title: mta_analysis[0],
        icon: "none",
      });
  },
});
