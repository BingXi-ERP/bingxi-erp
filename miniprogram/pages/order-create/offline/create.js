var t = require("../../../@babel/runtime/helpers/interopRequireDefault").default,
  e = require("../../../@babel/runtime/helpers/defineProperty"),
  toConsumableArray = require("../../../@babel/runtime/helpers/toConsumableArray"),
  objectSpread2 = require("../../../@babel/runtime/helpers/objectSpread2"),
  time = require("../../../libs/utils/time"),
  dialog = t(require("../../../miniprogram_npm/@vant/weapp/dialog/dialog")),
  toast = t(require("../../../miniprogram_npm/@vant/weapp/toast/toast")),
  orderCreate = require("../../../libs/services/orderCreate"),
  ServicesUserLog = require("../../../libs/services/ServicesUserLog"),
  ServicesBase = require("../../../libs/services/ServicesBase.js"),
  login = require("../../../libs/utils/login.js"),
  app = getApp(),
  m = "orderCreateColors",
  f = "orderCreateInfo",
  p = (0, time.parseTime)((0, time.getPrevMonthFirstDay)().getTime(), "{y}-{m}-{d}"),
  h = (0, time.parseTime)(new Date().getTime(), "{y}-{m}-{d}"),
  y = h;
Page({
  data: {
    showDialog: !1,
    msg: "",
    userAuthList: app.userAuthList,
    active: "1",
    remarksFocus: !1,
    isFromPin: "0",
    id: "",
    purchaseImg: [],
    recordArr: [],
    onlineOrder: "",
    orderId: "",
    orderNo: "",
    customerId: "",
    customerName: "",
    customerMobile: "",
    minDate: p,
    maxDate: y,
    billingPurchaseImgList: [],
    oldId: "",
    createDate: h,
    createDateTimestamp: new Date(),
    productType: "full",
    icon: {
      cross: "/assets/icons/color_add@2x.png",
      del: "/assets/icons/color_delete@2x.png",
      edit: "/assets/icons/color_editor@2x.png",
      down: "/assets/icons/color_down@2x.png",
      up: "/assets/icons/color_up@2x.png",
      upload: "/packageB/assets/icons/upload@2x.png",
    },
    globalApp: {},
    products: [],
    cost: "",
    remarks: "",
    totalAccount: "0.00",
    productsDeclaration: [],
    buyerRemarks: "",
    orderTime: null,
    picker: {
      createDate: !1,
    },
    isIPhoneX: !1,
    expiredFlagText: [
      "",
      "商品已过期，请重新选择",
      "商品已被删除，请重新选择",
      "商品已下架，请重新选择",
    ],
    hasDateShow: !1,
    orderDetailInfo: {},
    timeIcon: {
      informations: "/assets/icons/news@2x.png",
      timeball: "/assets/icons/no_img.png",
      order_close: "/assets/icons/Icon_Delete.png",
      order_ban: "/assets/icons/order_copy@2x.png",
      order_complete: "/assets/icons/order_copy@2x.png",
      order_await: "/assets/icons/order_copy@2x.png",
    },
    saleOrderLifeCycleOption: [
      {
        label: "提交订单",
        value: "SUBMIT_ORDER",
        status: 0,
      },
      {
        label: "关闭订单",
        value: "CLOSE_ORDER",
        status: 10,
      },
      {
        label: "开单",
        value: "CREATE_ORDER",
        status: 20,
      },
      {
        label: "挂单",
        value: "WAIT_CONTINUE_ORDER",
        status: 30,
      },
      {
        label: "收款",
        value: "PAYMENT",
        status: 40,
      },
      {
        label: "退款",
        value: "REFUND",
        status: 50,
      },
      {
        label: "退货",
        value: "RETURN_OF_GOODS",
        status: 60,
      },
      {
        label: "作废",
        value: "ALREADY_CANCEL",
        status: -20,
      },
    ],
    orderStatusOptions: [],
  },
  getDictData: function () {
    var t = this;
    ServicesBase.servicesBase
      .getDictDataByType({
        value: "sales_order_status",
      })
      .then(function (e) {
        0 === e.code &&
          t.setData({
            orderStatusOptions: e.data,
          });
      });
  },
  uoloadImg: function (t) {
    var e = t.detail.showImgList;
    this.setData({
      billingPurchaseImgList: e,
    });
  },
  addItem: function (t) {
    var e = "full",
      toConsumableArray = t.currentTarget.dataset.id,
      objectSpread2 = "/pages/order-create/product-full/index?productType="
        .concat(e, "&openType=")
        .concat("offline", "&colorCardId=")
        .concat(toConsumableArray, "&fromCreate=1");
    wx.navigateTo({
      url: objectSpread2,
    });
  },
  onLoad: function (t) {
    (this.getIsIPhoneX(),
      login.login.getUserInfo(),
      this.getDictData());
    var e = t.id,
      toConsumableArray = void 0 === e ? "" : e,
      objectSpread2 = t.orderId,
      time = void 0 === objectSpread2 ? "" : objectSpread2,
      dialog = t.orderNo,
      toast = void 0 === dialog ? "" : dialog,
      orderCreate = t.isFromPin,
      ServicesUserLog = void 0 === orderCreate ? "0" : orderCreate,
      ServicesBase = t.reBillingId,
      m = void 0 === ServicesBase ? "" : ServicesBase;
    t.onlineOrder;
    (this.setData({
      isFromPin: ServicesUserLog,
      id: toConsumableArray,
      orderId: time,
      orderNo: toast,
      onlineOrder: time,
      globalApp: app,
    }),
      void 0 !== toConsumableArray && "" !== toConsumableArray
        ? this.getOrderDetail(toConsumableArray)
        : void 0 !== time && "" !== time
          ? this.getOrderDetail(time)
          : void 0 !== m && "" !== m && this.getOldOrderDetail(m));
  },
  onShow: function () {
    (wx.removeStorageSync(m), wx.removeStorageSync(f), this.totalProductAccount());
  },
  getIsIPhoneX: function () {
    var t = this.data.isIPhoneX,
      e = this;
    wx.getSystemInfo({
      successsuccess: function (o) {
        console.log(o);
        var objectSpread2 = o.model,
          mpValue = o.screenHeight,
          time = /iphone x/i.test(objectSpread2),
          dialog = /iPhone11/i.test(objectSpread2) && 812 === mpValue,
          toast = /iPhone12/i.test(objectSpread2);
        ((t = time || dialog || toast),
          e.setData({
            isIPhoneX: t,
          }));
      },
      fail: function (t) {
        console.log(t);
      },
    });
  },
  getOrderDetail: function (t) {
    var e = this;
    (wx.showLoading({
      title: "加载中",
    }),
      (0, orderCreate.getOrderDetail)({
        orderId: t,
      })
        .then(function (t) {
          if ((wx.hideLoading(), 0 === t.code)) {
            var toConsumableArray = t.data,
              mpValue = [];
            toConsumableArray.billingGoodsDetailModelList &&
              toConsumableArray.billingGoodsDetailModelList.forEach(function (t) {
                var time,
                  dialog = [];
                e.data.onlineOrder ||
                  null === (i = t.billingGoodsColorModels) ||
                  void 0 === time ||
                  time.forEach(function (t) {
                    var e,
                      toConsumableArray = [];
                    t.dyelotModelList &&
                      (null === (e = t.dyelotModelList) ||
                        void 0 === e ||
                        e.forEach(function (t) {
                          var e = [];
                          (t.quantityModelList || t.refundableQuantityModelList).forEach(
                            function (t) {
                              var toConsumableArray = {
                                price: t.colorPrice,
                                quantity: t.totalQuantity,
                                total: t.colorAmount,
                                priceUnit: t.quantityUnit,
                              };
                              e.push(toConsumableArray);
                            },
                          );
                          var objectSpread2 = {
                            id: t.dyelot,
                            dyelotName: t.dyelot,
                            list: e,
                          };
                          toConsumableArray.push(objectSpread2);
                        }));
                    var objectSpread2 = {
                      id: t.goodsColorId || "",
                      color: t.colorNo,
                      colorName: t.colorName,
                      dyelotArr: toConsumableArray,
                    };
                    dialog.push(objectSpread2);
                  });
                var toast = {
                  id: t.goodsId,
                  name: t.goodsName,
                  image: t.goodsImgPath,
                  goodsUnit: t.goodsUnit,
                  totalPrice: t.goodsAmount,
                  totalQuantity: t.totalQuantity,
                  expiredFlag: t.expiredFlag,
                  isOpened: !1,
                  colors: dialog,
                  billingStatus:
                    10 === toConsumableArray.billingStatus ? toConsumableArray.billingStatus : "",
                  differenceNum: t.deviation ? t.deviation : "",
                  differenceSymbol: t.deviationType ? t.deviationType : "",
                  goodsPriceQuantityInfo: t.goodsPriceQuantityInfo ? t.goodsPriceQuantityInfo : "0",
                  goodsQuantityInfo: t.goodsQuantityInfo ? t.goodsQuantityInfo : "0",
                  totalNum: t.itemCount ? t.itemCount : "0",
                };
                (e.data.onlineOrder ||
                  (d = objectSpread2(
                    objectSpread2({}, toast),
                    {},
                    {
                      tabCurrentColorId: dialog[0].id,
                      tabCurrentColor: dialog[0].color,
                      tabCurrentColorName: dialog[0].colorName,
                      tabCurrentColorList: dialog[0].dyelotArr[0].list,
                      tabCurrentDyelot: dialog[0].dyelotArr,
                      tabCurrentDyelotId: dialog[0].dyelotArr[0].id,
                    },
                  )),
                  mpValue.push(toast));
              });
            (e.setData({
              customerId: toConsumableArray.customerId,
              customerName: toConsumableArray.fullname || toConsumableArray.contacts,
              customerMobile: toConsumableArray.mobile,
              createDate: toConsumableArray.billingDate ? toConsumableArray.billingDate : h,
              productType: {
                1: "full",
                2: "cut",
                "-1": "full",
              }[toConsumableArray.saleType],
              remarks: toConsumableArray.billingRemark,
              products: mpValue,
              productsDeclaration: [],
              billingPurchaseImgList: toConsumableArray.billingPurchaseImgList,
              buyerRemarks: toConsumableArray.remark || "-",
              orderTime: toConsumableArray.orderTime ? toConsumableArray.orderTime : "",
              orderId: toConsumableArray.orderId || "",
              orderDetailInfo: toConsumableArray,
            }),
              e.totalProductAccount());
          } else
            (0, toast.default)({
              message: "数据加载失败，请返回重试",
            });
        })
        .catch(function (t) {
          (console.log("getOrderDetail err", t), wx.hideLoading());
        }));
  },
  getOldOrderDetail: function (t) {
    var e = this;
    wx.showLoading({
      title: "加载中",
    });
    var toConsumableArray = {
      billingId: t,
    };
    (0, orderCreate.reBillingDetail)(toConsumableArray)
      .then(function (t) {
        if ((wx.hideLoading(), 0 === t.code)) {
          var toConsumableArray = t.data,
            objectSpread2 = [];
          toConsumableArray.billingGoodsDetailModelList &&
            toConsumableArray.billingGoodsDetailModelList.forEach(function (t) {
              var mpValue,
                time = [];
              e.data.onlineOrder ||
                null === (r = t.billingGoodsColorModels) ||
                void 0 === mpValue ||
                mpValue.forEach(function (t) {
                  var e,
                    toConsumableArray = [];
                  t.dyelotModelList &&
                    (null === (e = t.dyelotModelList) ||
                      void 0 === e ||
                      e.forEach(function (t) {
                        var e = [];
                        (t.quantityModelList || t.refundableQuantityModelList).forEach(
                          function (t) {
                            var toConsumableArray = {
                              price: t.colorPrice,
                              quantity: t.totalQuantity,
                              total: t.colorAmount,
                              priceUnit: t.quantityUnit,
                            };
                            e.push(toConsumableArray);
                          },
                        );
                        var objectSpread2 = {
                          id: t.dyelot,
                          dyelotName: t.dyelot,
                          list: e,
                        };
                        toConsumableArray.push(objectSpread2);
                      }));
                  var objectSpread2 = {
                    id: t.goodsColorId || "",
                    color: t.colorNo,
                    colorName: t.colorName,
                    basePrice: toConsumableArray[0].list[0]
                      ? toConsumableArray[0].list[0].price
                      : "",
                    dyelotArr: toConsumableArray,
                  };
                  time.push(objectSpread2);
                });
              var dialog = {};
              ((n = e.data.onlineOrder
                ? {
                    id: t.goodsId,
                    name: t.goodsName,
                    image: t.goodsImgPath,
                    goodsUnit: t.goodsUnit,
                    totalPrice: t.goodsAmount,
                    totalQuantity: t.totalQuantity,
                    expiredFlag: t.expiredFlag,
                    isOpened: !1,
                    colors: time,
                    billingStatus:
                      10 === toConsumableArray.billingStatus ? toConsumableArray.billingStatus : "",
                    differenceNum: t.deviation ? t.deviation : "",
                    differenceSymbol: t.deviationType ? t.deviationType : "",
                    goodsPriceQuantityInfo: t.goodsPriceQuantityInfo
                      ? t.goodsPriceQuantityInfo
                      : "0",
                    goodsQuantityInfo: t.goodsQuantityInfo ? t.goodsQuantityInfo : "0",
                    totalNum: t.itemCount ? t.itemCount : "0",
                  }
                : {
                    id: t.goodsId,
                    name: t.goodsName,
                    image: t.goodsImgPath,
                    goodsUnit: t.goodsUnit,
                    totalPrice: t.goodsAmount,
                    totalQuantity: t.totalQuantity,
                    expiredFlag: t.expiredFlag,
                    isOpened: !1,
                    colors: time,
                    tabCurrentColorId: time[0].id,
                    tabCurrentColor: time[0].color,
                    tabCurrentColorName: time[0].colorName,
                    tabCurrentColorList: time[0].dyelotArr[0].list,
                    tabCurrentDyelot: time[0].dyelotArr,
                    tabCurrentDyelotId: time[0].dyelotArr[0].id,
                    billingStatus:
                      10 === toConsumableArray.billingStatus ? toConsumableArray.billingStatus : "",
                    differenceNum: t.deviation ? t.deviation : "",
                    differenceSymbol: t.deviationType ? t.deviationType : "",
                    goodsPriceQuantityInfo: t.goodsPriceQuantityInfo
                      ? t.goodsPriceQuantityInfo
                      : "0",
                    goodsQuantityInfo: t.goodsQuantityInfo ? t.goodsQuantityInfo : "0",
                    totalNum: t.itemCount ? t.itemCount : "0",
                  }),
                objectSpread2.push(dialog));
            });
          var mpValue = [];
          (toConsumableArray.orderGoodsDetailModelList &&
            toConsumableArray.orderGoodsDetailModelList.forEach(function (t) {
              ((t.isOpened = !1), mpValue.push(t));
            }),
            e.setData({
              customerId: toConsumableArray.customerId,
              customerName: toConsumableArray.fullname || toConsumableArray.contacts,
              customerMobile: toConsumableArray.mobile,
              createDate: toConsumableArray.billingDate ? toConsumableArray.billingDate : h,
              productType: {
                1: "full",
                2: "cut",
                "-1": "full",
              }[toConsumableArray.saleType],
              remarks: toConsumableArray.billingRemark,
              products: objectSpread2,
              productsDeclaration: mpValue,
              buyerRemarks: toConsumableArray.remark || "-",
              orderTime: toConsumableArray.orderTime ? toConsumableArray.orderTime : "",
              billingPurchaseImgList: toConsumableArray.billingPurchaseImgList,
              orderId: toConsumableArray.orderId || "",
            }),
            e.totalProductAccount());
        } else
          (0, toast.default)({
            message: "数据加载失败，请返回重试",
          });
      })
      .catch(function (t) {
        (console.log("getOrderDetail err", t), wx.hideLoading());
      });
  },
  handlelSelectCustomer: function () {
    wx.navigateTo({
      url: "/pages/customer-management/all-customer-list-choose/all-customer-list-choose",
    });
  },
  updateCustomer: function (t) {
    this.setData({
      customerId: t.id.toString(),
      customerName: t.fullname,
      customerMobile: t.mobile,
    });
  },
  handleChangeProductType: function (t) {
    this.data.products.length
      ? (0, toast.default)({
          message: "已有商品, 不能切换",
          duration: 1e3,
        })
      : this.setData({
          productType: t.detail.value,
        });
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
          objectSpread2 = e.data.products.filter(function (t) {
            return t.id !== toConsumableArray;
          });
        (e.setData({
          products: objectSpread2,
        }),
          e.totalProductAccount());
      })
      .catch(function () {});
  },
  handleProductEdit: function (t) {
    var e = t.currentTarget.dataset.id,
      toConsumableArray = this.data.productType,
      objectSpread2 = this.data.products.find(function (t) {
        return t.id === e;
      }),
      mpValue = "/pages/order-create/product-full/index?productType="
        .concat(toConsumableArray, "&openType=")
        .concat("offline", "&colorCardId=")
        .concat(e, "&fromCreate=1");
    (wx.setStorage({
      key: m,
      data: objectSpread2,
    }),
      wx.navigateTo({
        url: mpValue,
      }));
  },
  addProduct: function () {
    if ("" !== this.data.productType) {
      var t = this.data.products.map(function (t) {
          return t.id;
        }),
        e = "productType="
          .concat(this.data.productType, "&openType=offline&ids=")
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
      var objectSpread2 = "productType="
          .concat(this.data.productType, "&openType=offline&ids=")
          .concat(""),
        mpValue = "/pages/order-create/color-card/select?".concat(objectSpread2);
      wx.navigateTo({
        url: mpValue,
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
      var objectSpread2 = this.data.products.filter(function (t) {
        return t.id !== e.data.oldId;
      });
      this.setData({
        products: objectSpread2,
      });
    }
    var mpValue = this.data.products.find(function (e) {
      return e.id === t.id;
    });
    if (mpValue)
      ((mpValue.colors = toConsumableArray(t.colors)),
        (mpValue.totalQuantity = t.totalQuantity),
        (mpValue.totalPrice = t.totalPrice),
        (mpValue.tabCurrentColorId = t.tabCurrentColorId),
        (mpValue.tabCurrentColor = t.tabCurrentColor),
        (mpValue.tabCurrentColorName = t.tabCurrentColorName),
        (mpValue.tabCurrentColorList = toConsumableArray(t.tabCurrentColorList)),
        (mpValue.tabCurrentDyelot = t.tabCurrentDyelot),
        (mpValue.tabCurrentDyelotId = t.tabCurrentDyelotId),
        (mpValue.billingStatus = null),
        (mpValue.differenceNum = t.differenceNum),
        (mpValue.differenceSymbol = t.differenceSymbol),
        (mpValue.totalNum = t.totalNum),
        (mpValue.totalCodeNum = t.totalCodeNum),
        this.setData({
          products: this.data.products,
        }));
    else {
      var time = this.data.products.concat(t);
      this.setData({
        products: time,
      });
    }
    var dialog = this.data.productsDeclaration.filter(function (e) {
      return e.goodsId !== t.id;
    });
    (this.setData({
      productsDeclaration: dialog,
    }),
      this.totalProductAccount());
  },
  totalProductAccount: function () {
    var t = this.data,
      e = t.products,
      toConsumableArray = t.cost,
      objectSpread2 = Number(toConsumableArray);
    (e.forEach(function (t) {
      a += Number(t.totalPrice);
    }),
      this.setData({
        totalAccount: objectSpread2.toFixed(2),
      }));
  },
  handleCloseDialog: function () {
    this.setData({
      showDialog: !1,
    });
  },
  handleOrderPin: function () {
    var t = this.data,
      e = t.customerId,
      toConsumableArray = t.productType,
      objectSpread2 = t.products;
    if (e && "" !== e) {
      if ("" !== toConsumableArray) {
        if (0 !== objectSpread2.length) {
          wx.showLoading({
            title: "挂单中",
          });
          var mpValue = this.getOrderPinParams();
          (0, orderCreate.draftOrder)(mpValue)
            .then(function (t) {
              (wx.hideLoading(),
                0 === t.code
                  ? (ServicesUserLog.servicesUserLog.setUserHandleLog(203),
                    wx.showToast({
                      title: "挂单成功",
                    }),
                    setTimeout(function () {
                      wx.redirectTo({
                        url: "/pages/order/pin/index",
                      });
                    }, 1e3))
                  : (0, toast.default)({
                      message: t.msg || "挂单失败",
                      duration: 1500,
                    }));
            })
            .catch(function (t) {
              (console.log("err =>>", t), wx.hideLoading());
            });
        } else
          (0, toast.default)({
            message: "请添加商品",
            duration: 1e3,
          });
      } else
        (0, toast.default)({
          message: "请选择货品类型",
          duration: 1e3,
        });
    } else
      this.setData({
        showDialog: !0,
        msg: "请添加客户",
      });
  },
  getOrderPinParams: function () {
    var t = this.data,
      e = t.id,
      toConsumableArray = t.orderId,
      objectSpread2 = t.orderNo,
      mpValue = t.customerId,
      time = t.customerName,
      dialog = t.createDate,
      toast = t.productType,
      orderCreate = t.products,
      ServicesUserLog = (t.cost, t.remarks),
      ServicesBase = t.totalAccount,
      login = t.billingPurchaseImgList,
      app = [];
    orderCreate.forEach(function (t) {
      var e = [];
      t.colors.forEach(function (t) {
        t.dyelotArr.forEach(function (o) {
          o.list.forEach(function (a) {
            var mpValue = {
              goodsColorId: t.id || "",
              colorNo: t.color || "",
              colorName: t.colorName || "",
              colorPrice: a.price || "",
              dyelot: o.id,
              quantityUnit: a.priceUnit,
              colorAmount: a.total || "",
              totalQuantity: a.quantity || "",
            };
            e.push(mpValue);
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
        billingGoodsColors: e,
        deviation: t.differenceNum ? t.differenceNum : "",
        deviationType: t.differenceSymbol ? t.differenceSymbol : "",
        goodsPriceQuantityInfo: t.goodsPriceQuantityInfo ? t.goodsPriceQuantityInfo : "0",
        goodsQuantityInfo: t.goodsQuantityInfo ? t.goodsQuantityInfo : "0",
        totalNum: t.itemCount ? t.itemCount : "0",
      };
      app.push(toConsumableArray);
    });
    return {
      id: e,
      orderId: toConsumableArray,
      orderNo: objectSpread2,
      customerId: mpValue,
      userId: "",
      fullname: time,
      billingDate: dialog || "",
      saleType:
        {
          full: "1",
          cut: "2",
        }[toast] || "",
      billingRemark: ServicesUserLog,
      orderAmount: ServicesBase,
      billingGoodsDetailModelList: app,
      billingPurchaseImgList: login,
    };
  },
  handleStepNext: function () {
    var t = this,
      e = this.data,
      toConsumableArray = e.isFromPin,
      objectSpread2 = e.id,
      mpValue = e.orderId,
      time = e.orderNo,
      dialog = e.customerId,
      toast = e.productType,
      orderCreate = e.products;
    if (dialog && "" !== dialog) {
      if ("" !== toast) {
        if (0 !== orderCreate.length) {
          this.data.products.forEach(function (e) {
            e.expiredFlag && 0 !== e.expiredFlag
              ? t.setData({
                  showDialog: !0,
                  msg: "请删除错误商品",
                })
              : e.billingStatus &&
                10 === e.billingStatus &&
                t.setData({
                  showDialog: !0,
                  msg: "请添加细码",
                });
          });
          var ServicesUserLog = this.getOrderPinParams();
          wx.setStorage({
            key: f,
            data: ServicesUserLog,
          });
          var ServicesBase = "openType=offline&id="
              .concat(objectSpread2, "&orderId=")
              .concat(mpValue, "&orderNo=")
              .concat(time, "&isFromPin=")
              .concat(toConsumableArray),
            login = "/pages/order-create/receipt/index?".concat(ServicesBase);
          wx.navigateTo({
            url: login,
          });
        } else
          this.setData({
            showDialog: !0,
            msg: "请添加商品",
          });
      } else
        this.setData({
          showDialog: !0,
          msg: "请选择货品类型",
        });
    } else
      this.setData({
        showDialog: !0,
        msg: "请添加客户",
      });
  },
  handleSwitchColor: function (t) {
    var e = t.currentTarget.dataset,
      toConsumableArray = e.index,
      objectSpread2 = e.productId,
      mpValue = this.data.products.find(function (t) {
        return t.id === objectSpread2;
      });
    ((mpValue.tabCurrentColorId = mpValue.colors[toConsumableArray].id),
      (mpValue.tabCurrentColor = mpValue.colors[toConsumableArray].color),
      (mpValue.tabCurrentColorName = mpValue.colors[toConsumableArray].colorName),
      (mpValue.tabCurrentDyelot = mpValue.colors[toConsumableArray].dyelotArr),
      (mpValue.tabCurrentDyelotId = mpValue.colors[toConsumableArray].dyelotArr[0].id),
      (mpValue.tabCurrentColorList = mpValue.colors[toConsumableArray].dyelotArr[0].list),
      this.setData({
        products: this.data.products,
      }));
  },
  changeCurrentDyelot: function (t) {
    var e = t.currentTarget.dataset,
      toConsumableArray = e.index,
      objectSpread2 = e.productId,
      mpValue = e.productItem.tabCurrentColorId,
      time = this.data.products.find(function (t) {
        return t.id === objectSpread2;
      }),
      dialog = time.colors.find(function (t) {
        return t.id === mpValue;
      });
    ((time.tabCurrentDyelot = dialog.dyelotArr),
      (time.tabCurrentDyelotId = dialog.dyelotArr[toConsumableArray].id),
      (time.tabCurrentColorList = dialog.dyelotArr[toConsumableArray].list),
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
      objectSpread2 = t.detail.value;
    (this.setData({
      toConsumableArray: objectSpread2,
    }),
      "cost" === toConsumableArray && this.totalProductAccount());
  },
  handleUpdateCostVal: function (t) {
    var toConsumableArray = t.currentTarget.dataset.key,
      objectSpread2 = /^(\.*)(\d+)(\.?)(\d{0,2}).*$/g,
      mpValue = t.detail.value,
      time = objectSpread2.test(mpValue) ? mpValue.replace(objectSpread2, "$2$3$4") : "";
    return (
      this.setData({
        toConsumableArray: time,
      }),
      time
    );
  },
  handleBlurCostVal: function (t) {
    var toConsumableArray = t.detail.value,
      objectSpread2 = t.target.dataset.key,
      mpValue = toConsumableArray.substr(toConsumableArray.length - 1);
    ((o =
      "" != (o = 0 == toConsumableArray ? "" : toConsumableArray) ? Number(toConsumableArray) : ""),
      "." == mpValue && (o = Number(toConsumableArray)),
      this.setData({
        objectSpread2: toConsumableArray,
      }),
      this.totalProductAccount());
  },
  handleInputDecimalLeng: function (t) {
    var e = /^(\.*)(\d+)(\.?)(\d{0,2}).*$/g,
      toConsumableArray = t.detail.value;
    return e.test(toConsumableArray) ? toConsumableArray.replace(e, "$2$3$4") : "";
  },
  handleDateChange: function (t) {
    this.setData({
      createDate: t.detail.value,
    });
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
});
