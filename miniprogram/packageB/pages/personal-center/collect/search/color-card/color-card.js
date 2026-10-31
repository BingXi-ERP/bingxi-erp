var ServicesCard = require("../../../../../libs/services/ServicesCard.js").servicesCard;
getApp();
Page({
  data: {
    image: {
      search: "../../../../../assets/images/icon2nd/symbols-search.png",
      clearicon: "../../../../../assets/images/icon2nd/symbols-search.png",
      colorNull: "../../../../../assets/images/icon2nd/symbols-color-null.png",
    },
    colorList: [],
    pageNum: 1,
    pageSize: 10,
    total: 0,
    searchKey: "",
    searchType: "colorIndex",
    shopId: "",
    userMobile: !0,
  },
  onLoad: function (a) {
    var e = wx.getStorageSync("searchData");
    (this.setData({
      searchIndex: a.id,
      searchType: a.pageType,
      searchKey: e[a.id - 1].name,
    }),
      wx.hideShareMenu());
  },
  onShow: function () {
    var ServicesCard,
      e = this;
    ("colorIndex1" === e.data.searchType
      ? ((a = wx.getStorageSync("myShopId")),
        e.setData({
          shopId: wx.getStorageSync("myShopId"),
        }))
      : "colorIndex" === e.data.searchType &&
        ((a = wx.getStorageSync("searchIndexShopId")),
        e.setData({
          shopId: wx.getStorageSync("searchIndexShopId"),
        })),
      e.getColorList("", ServicesCard),
      ("" !== getApp().globalData.userInfo.mobile &&
        null !== getApp().globalData.userInfo.mobile) ||
        e.setData({
          userMobile: !1,
        }));
  },
  getColorList: function (e, t) {
    var o = this,
      s = {
        keyword: wx.getStorageSync("searchData")[o.data.searchIndex - 1].name,
        shopId: t,
        onSale: 1,
        page: o.data.pageNum,
        size: o.data.pageSize,
      };
    ServicesCard.colorCardList(s).then(function (a) {
      if (0 === a.code) {
        var t;
        "pull" === e && (wx.hideNavigationBarLoading(), wx.stopPullDownRefresh());
        var s = a.data.pageNum;
        ("bottom" === e
          ? ((t = o.data.colorList),
            a.data.content.length > 0 ? (t = t.concat(a.data.content)) : (s -= 1))
          : (t = a.data.content),
          o.setData({
            colorList: t,
            total: a.data.total,
            pageNum: s,
            pageSize: a.data.pageSize,
          }));
      } else
        wx.showToast({
          title: a.msg,
          icon: "none",
        });
    });
  },
  onPullDownRefresh: function () {
    wx.showNavigationBarLoading();
    var ServicesCard = this;
    ServicesCard.setData({
      pageNum: 1,
    });
    ServicesCard.getColorList("pull", ServicesCard.data.shopId);
  },
  onReachBottom: function () {
    var ServicesCard = this;
    ServicesCard.setData({
      pageNum: ServicesCard.data.pageNum + 1,
    });
    ServicesCard.getColorList("bottom", ServicesCard.data.shopId);
  },
  toSearch: function (a) {
    wx.navigateTo({
      url: "/packageB/pages/personal-center/collect/search/search?pageType=" + a.currentTarget.id,
    });
  },
  onJump: function (a) {
    var e = a.currentTarget.dataset.goodsId;
    wx.navigateTo({
      url: "/pages/color-card-management/preview/preview?goodsId=" + e,
    });
  },
});
