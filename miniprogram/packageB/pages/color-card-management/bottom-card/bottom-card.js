var t = (0, require("../../../../@babel/runtime/helpers/interopRequireDefault").default)(
    require("../../../../utils/mta_analysis.js"),
  ),
  ServicesCardType = require("../../../../libs/services/ServicesCardType.js").ServicesCardType,
  ServicesCard = require("../../../../libs/services/ServicesCard.js").servicesCard,
  app = getApp();
Page({
  data: {
    priceUnitChange: {
      0: "米",
      1: "码",
      2: "公斤",
    },
    baseList: [],
    pageNum: 1,
    goodsId: "",
    list: "",
    gbcIdList: "",
    globalApp: {},
  },
  searchList: function () {
    wx.showLoading({
      title: "加载中",
    });
    var t,
      ServicesCard = this,
      app = this.data,
      n = app.goodsId,
      s = app.gbcIdList;
    if (!n && !s)
      return (
        ServicesCard.setData({
          baseList: [wx.getStorageSync("bottomCardInfo")],
        }),
        console.log(this.data.baseList),
        void wx.hideLoading()
      );
    ((t = {
      id: n || s,
    }),
      ServicesCardType.baseCardList(t).then(function (t) {
        0 === t.code
          ? (ServicesCard.setData({
              baseList: t.data,
            }),
            wx.hideLoading(),
            console.log(ServicesCard.data.baseList),
            wx.setStorageSync("bottomCardList", ServicesCard.data.baseList))
          : (wx.hideLoading(),
            wx.showToast({
              title: t.msg,
              icon: "none",
            }));
      }));
  },
  toEdit: function (t) {
    (console.log(t),
      wx.navigateTo({
        url: "/packageB/pages/color-card-management/add-bottom-card/add-bottom-card?id="
          .concat(t.currentTarget.dataset.id, "&goodsId=")
          .concat(this.data.goodsId),
      }));
  },
  ontoProductCard: function (t) {
    var ServicesCardType = this,
      app = t.currentTarget.dataset.item;
    wx.showModal({
      title: "温馨提示",
      content: "是否移出底卡，移出后该底卡会转为主产品？",
      success: function (t) {
        t.confirm &&
          ServicesCard.saveBottomCardToProduct(app.id).then(function (t) {
            0 === t.code && ServicesCardType.searchList();
          });
      },
    });
  },
  printTap: function (t) {
    var ServicesCardType = t.currentTarget.dataset.goodsid;
    wx.showActionSheet({
      itemList: ["打印标签", "打印色号", "打印布头"],
      itemColor: "#4C7CF9",
      success: function (t) {
        0 == t.tapIndex
          ? (console.log("打印标签"),
            wx.navigateTo({
              url: "/packageB/pages/color-card-management/print/print?goodsId=".concat(
                ServicesCardType,
                "&&newPrintType=1",
              ),
            }))
          : 2 == t.tapIndex
            ? (console.log("打印布头"),
              wx.navigateTo({
                url: "/packageB/pages/color-card-management/print-cloth-head/print-cloth-head?goodsId=".concat(
                  ServicesCardType,
                  "&&newPrintType=1",
                ),
              }))
            : 1 == t.tapIndex &&
              (console.log("打印色号"),
              wx.navigateTo({
                url: "/packageB/pages/color-card-management/print-color-num/index?goodsId=".concat(
                  ServicesCardType,
                  "&&newPrintType=1",
                ),
              }));
      },
      fail: function (t) {
        console.log(t.errMsg);
      },
    });
  },
  toAdd: function (t) {
    (wx.removeStorageSync("colorColorCardList"),
      wx.removeStorageSync("commodityType"),
      wx.navigateTo({
        url: "/packageB/pages/color-card-management/add-bottom-card/add-bottom-card?goodsId=".concat(
          this.data.goodsId,
        ),
      }));
  },
  onLoad: function (a) {
    if (
      (t.default.Page.init(),
      console.log(a),
      a.goodsId &&
        this.setData({
          globalApp: app,
          goodsId: a.goodsId,
        }),
      a.gbcIdList)
    ) {
      var ServicesCard = [a.gbcIdList];
      this.setData({
        gbcIdList: ServicesCard,
      });
    }
    wx.hideShareMenu();
  },
  onReady: function () {},
  onShow: function () {
    var t = getCurrentPages(),
      ServicesCardType = t[t.length - 2],
      ServicesCard = wx.getStorageSync("baseListId");
    this.data.goodsId;
    "packageB/pages/color-card-management/add-color-card/add-color-card" === ServicesCardType.route
      ? (this.setData({
          gbcIdList: ServicesCard,
        }),
        this.searchList())
      : "packageB/pages/color-card-management/color-card-management" === ServicesCardType.route ||
          "packageB/pages/color-card-management/type-management/batch-management/batch-management" ===
            ServicesCardType.route ||
          "pages/search/search" === ServicesCardType.route ||
          "pages/search-img/search/search" === ServicesCardType.route
        ? (this.setData({
            gbcIdList: "",
          }),
          this.searchList())
        : this.setData({
            baseList: [],
          });
  },
  onHide: function () {},
  onUnload: function () {},
  onPullDownRefresh: function () {},
  onReachBottom: function () {},
  onShareAppMessage: function () {},
});
