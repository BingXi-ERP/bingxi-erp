var t = require("../../../../@babel/runtime/helpers/interopRequireDefault").default,
  orderCreate = require("../../../../libs/services/orderCreate"),
  dialog = t(require("../../../../miniprogram_npm/@vant/weapp/dialog/dialog")),
  mta_analysis = t(require("../../../../utils/mta_analysis")),
  app = getApp();
Page({
  data: {
    productIds: [],
    keyword: "",
    globalApp: app,
    page: 1,
    isLast: !1,
    checkedId: null,
    result: null,
    setTimeOpen: !1,
    icon: {
      checked: "".concat(app.config.imgHost, "/img/v2.7.4/Control_Choiced@2x.png"),
      noCheck: "".concat(app.config.imgHost, "/img/v2.7.4/Control_NotChoice@2x.png"),
    },
  },
  onLoad: function (t) {
    mta_analysis.default.Page.init();
    var orderCreate = wx.getStorageSync("changeBottomCard");
    (this.setData({
      productIds: orderCreate.map(function (t) {
        return t.goodsid;
      }),
    }),
      this.getColors());
  },
  onReady: function () {},
  onShow: function () {},
  onHide: function () {},
  onUnload: function () {
    this.usePreFunction();
  },
  onPullDownRefresh: function () {},
  onReachBottom: function () {},
  getColors: function () {
    var t = this;
    wx.showLoading({
      title: "加载中",
    });
    var dialog = this.data,
      mta_analysis = {
        searchFiled: dialog.keyword,
        page: dialog.page,
        size: 10,
        excludeProductIds: dialog.productIds,
      };
    (0, orderCreate.getColorCards)(mta_analysis)
      .then(function (e) {
        if (0 === e.code)
          try {
            var dialog = t.data.result || [];
            ((a = dialog.concat(e.data.content)),
              t.setData({
                result: dialog,
              }),
              e.data.pageNo < e.data.totalPage
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
    this.data.isLast || this.getColors();
  },
  handleSelect: function (t) {
    var orderCreate = t.currentTarget.dataset,
      dialog = orderCreate.id,
      mta_analysis = orderCreate.name;
    this.setData({
      checkedId: dialog,
      checkName: mta_analysis,
    });
  },
  goback: function () {
    (this.setData({
      checkedId: null,
    }),
      wx.navigateBack({
        delta: 1,
      }));
  },
  handleConfirm: function (t) {
    (this.setData({
      result: null,
      checkedId: null,
      isLast: !1,
      keyword: t.detail,
      page: 1,
    }),
      this.getColors());
  },
  onSave: function () {
    var t = this;
    this.data.checkedId
      ? dialog.default
          .confirm({
            title: "提示",
            message: "确定要把这"
              .concat(this.data.productIds.length, "个产品转为")
              .concat(this.data.checkName, "的底卡吗？"),
          })
          .then(function () {
            wx.showLoading({
              title: "保存中",
            });
            var dialog = {
              sourceProductIds: t.data.productIds,
              targetProductId: t.data.checkedId,
            };
            (0, orderCreate.changeBotColorCards)(dialog).then(function (t) {
              0 === t.code &&
                (wx.removeStorageSync("changeBottomCard"),
                wx.hideLoading(),
                wx.showToast({
                  title: "保存成功",
                }),
                wx.redirectTo({
                  url: "/pages/color-card-management/color-card-management",
                }));
            });
          })
      : wx.showToast({
          title: "请选择产品",
          icon: "error",
        });
  },
  usePreFunction: function () {
    var t = getCurrentPages(),
      orderCreate = t.find(function (t) {
        return "pages/color-card-management/batch-management/batch-management" === t.route;
      });
    orderCreate && (orderCreate.reset(), orderCreate.getCardList());
  },
});
