var t = require("../../../@babel/runtime/helpers/interopRequireDefault").default,
  orderCreate = require("../../../libs/services/orderCreate"),
  ServicesReturn = require("../../../libs/services/ServicesReturn"),
  ServicesCard = require("../../../libs/services/ServicesCard"),
  toast = t(require("../../../miniprogram_npm/@vant/weapp/toast/toast")),
  mta_analysis = t(require("../../../utils/mta_analysis")),
  app = getApp();
Page({
  data: {
    titleType: [],
    productIds: [],
    productType: "",
    openType: "",
    keywords: "",
    app: {},
    page: 1,
    isLast: !1,
    checkedId: null,
    result: null,
    setTimeOpen: !1,
    curIndex: -1,
    noDataBg: "".concat(app.config.imgHost, "/img/customer/duibuIcon/dz@2x.png"),
  },
  onLoad: function (t) {
    mta_analysis.default.Page.init();
    var orderCreate = t.productType,
      ServicesReturn = t.openType,
      ServicesCard = t.ids;
    (this.getShopProuductListFn(),
      this.setData({
        productIds: ServicesCard ? ServicesCard.split(",") : "",
        productType: orderCreate,
        openType: ServicesReturn,
        app: app,
      }),
      "salesReturn" === ServicesReturn ? this.getReturn() : this.getColors());
  },
  onReachBottom: function () {
    this.handleScrolltolower();
  },
  getValue: function (t) {
    (console.log(t.detail.value),
      this.setData({
        keywords: t.detail.value,
      }));
  },
  getReturn: function () {
    var t = this;
    wx.showLoading({
      title: "加载中",
    });
    var orderCreate = {
      searchFiled: this.data.keywords,
      page: this.data.page,
      size: 10,
    };
    ServicesReturn.ServicesReturn.goodsList(orderCreate)
      .then(function (e) {
        if (0 === e.code) {
          var ServicesReturn = e.data.content || [];
          try {
            ServicesReturn.forEach(function (e) {
              var ServicesReturn = t.data.productIds.includes(e.id);
              e.isAdded = ServicesReturn;
            });
            var ServicesCard = t.data.result || [];
            ((o = ServicesCard.concat(ServicesReturn)),
              t.setData({
                result: ServicesCard,
              }),
              e.data.pageNo < e.data.totalPage || e.data.content.length > 0
                ? t.setData({
                    page: t.data.page + 1,
                  })
                : t.setData({
                    isLast: !0,
                  }));
          } catch (t) {
            console.log(t);
          }
        } else
          wx.showToast({
            title: e.msg,
            icon: "none",
          });
        wx.hideLoading();
      })
      .catch(function (t) {
        (wx.hideLoading(), console.log(t));
      });
  },
  add: function () {
    wx.navigateTo({
      url: "/pages/color-card-management/add-color-card/add-color-card?add=true&type=0&productType=".concat(
        this.data.productType,
      ),
    });
  },
  getColors: function () {
    var t = this,
      ServicesReturn = arguments.length > 0 && void 0 !== arguments[0] ? arguments[0] : void 0;
    wx.showLoading({
      title: "加载中",
    });
    var ServicesCard = {
      classifyId: ServicesReturn,
      keyword: this.data.keywords,
      searchFiled: this.data.keywords,
      page: this.data.page,
      size: 10,
      onSale: 1,
    };
    (0, orderCreate.getColorCards)(ServicesCard)
      .then(function (e) {
        if (0 === e.code)
          try {
            e.data.content.forEach(function (e) {
              var ServicesReturn = t.data.productIds.includes(e.id);
              e.isAdded = ServicesReturn;
            });
            var ServicesReturn = t.data.result || [];
            ((a = ServicesReturn.concat(e.data.content)),
              t.setData({
                result: ServicesReturn,
              }),
              e.data.pageNo < e.data.totalPage || e.data.content.length > 0
                ? t.setData({
                    page: t.data.page + 1,
                  })
                : t.setData({
                    isLast: !0,
                  }));
          } catch (t) {
            console.log(t);
          }
        else
          wx.showToast({
            title: e.msg,
            icon: "none",
          });
        wx.hideLoading();
      })
      .catch(function (t) {
        (wx.hideLoading(), console.log(t));
      });
  },
  handleScrolltolower: function () {
    this.data.isLast ||
      ("salesReturn" === this.data.openType ? this.getReturn() : this.getColors());
  },
  handleSelect: function (t) {
    var orderCreate = this,
      ServicesReturn = t.currentTarget.dataset,
      ServicesCard = ServicesReturn.id;
    ServicesReturn.added
      ? (0, toast.default)({
          message: "您已添加，请选择其他商品！",
          duration: 1500,
        })
      : (clearTimeout(this.data.setTimeOpen),
        (this.data.setTimeOpen = setTimeout(function () {
          orderCreate.handleConfirmSelect(ServicesCard);
        }, 500)),
        this.setData({
          checkedId: ServicesCard,
        }));
  },
  goback: function () {
    (this.setData({
      checkedId: null,
    }),
      wx.navigateBack({
        delta: 1,
      }));
  },
  handleConfirmSelect: function (t) {
    var orderCreate = this.data,
      ServicesReturn = orderCreate.productType,
      ServicesCard = orderCreate.openType,
      toast = "/pages/order-create/product-full/index?productType="
        .concat(ServicesReturn, "&openType=")
        .concat(ServicesCard, "&colorCardId=")
        .concat(t);
    wx.navigateTo({
      url: toast,
    });
  },
  handleConfirm: function (t) {
    (console.log(1),
      this.setData({
        result: null,
        checkedId: null,
        isLast: !1,
        keyword: t.detail,
        page: 1,
      }),
      "salesReturn" === this.data.openType ? this.getReturn() : this.getColors());
  },
  getShopProuductListFn: function () {
    var t = this;
    ServicesCard.servicesCard.categoryList().then(function (e) {
      0 === e.code &&
        t.setData({
          titleType: e.data,
          "loadParams.classifyId": e.data[0].id,
        });
    });
  },
  handleType: function (t) {
    var orderCreate = t.target.dataset.id;
    (this.setData({
      page: 1,
      result: [],
      curIndex: t.target.dataset.index,
    }),
      this.getColors(orderCreate));
  },
  handleAll: function () {
    (this.setData({
      curIndex: -1,
    }),
      this.getColors());
  },
});
