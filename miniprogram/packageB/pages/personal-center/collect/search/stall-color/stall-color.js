var ServicesCard = require("../../../../../libs/services/ServicesCard.js").servicesCard;
getApp();
Page({
  data: {
    scrollTop: 0,
    height: 600,
    tabArr: {
      curHdIndex: 0,
      curBdIndex: 0,
    },
    imageData: {
      search: "../../../../../assets/images/icon2nd/symbols-search.png",
      clearicon: "../../../../../assets/images/icon2nd/symbols-search.png",
      colorNull: "../../../../../assets/images/icon2nd/symbols-color-null.png",
    },
    pageType: "",
    pageNum: 1,
    pageSize: 25,
    pageNum1: 1,
    pageSize1: 25,
    colorList: [],
    total: 0,
    shopList: [],
    searchKey: "",
    searchIndex: "",
    userMobile: !0,
  },
  changeActive: function (a) {
    var e,
      t = a.currentTarget.id,
      o = {};
    ("1" === t
      ? (this.setData({
          pageType: "stallSearch",
        }),
        (e = "档口收藏搜索"),
        this.getStallList())
      : (this.setData({
          pageType: "colorSearch",
        }),
        (e = "色卡收藏搜索"),
        this.getColorList()),
      wx.setNavigationBarTitle({
        title: e,
      }),
      (o.curHdIndex = t),
      (o.curBdIndex = t),
      this.setData({
        tabArr: o,
      }));
  },
  toSearch: function (a) {
    wx.navigateTo({
      url: "/packageB/pages/personal-center/collect/search/search?pageType=" + a.currentTarget.id,
    });
  },
  onLoad: function (a) {
    var e = wx.getStorageSync("searchData");
    (this.setData({
      searchIndex: a.id,
      pageType: a.pageType,
      searchKey: e[a.id - 1].name,
    }),
      wx.hideShareMenu());
  },
  onShow: function () {
    var ServicesCard,
      e = this;
    (console.log(e.data.pageType),
      "colorSearch" === e.data.pageType
        ? (e.getColorList(), (a = "色卡收藏搜索"))
        : (e.getStallList(),
          e.setData({
            "tabArr.curHdIndex": 1,
            "tabArr.curBdIndex": 1,
          }),
          (a = "档口收藏搜索")),
      wx.setNavigationBarTitle({
        title: ServicesCard,
      }),
      ("" !== getApp().globalData.userInfo.mobile &&
        null !== getApp().globalData.userInfo.mobile) ||
        e.setData({
          userMobile: !1,
        }));
  },
  getColorList: function (e) {
    var t = this,
      o =
        (wx.getStorageSync("searchData"),
        {
          keyword: t.data.searchKey,
          pageNum: t.data.pageNum,
          pageSize: t.data.pageSize,
        });
    ServicesCard.colorCardCollectList(o).then(function (a) {
      if (0 === a.code) {
        var o;
        "pull" === e && (wx.hideNavigationBarLoading(), wx.stopPullDownRefresh());
        var s = a.data.pageNum;
        ("bottom" === e
          ? ((o = t.data.colorList),
            a.data.list.length > 0 ? (o = o.concat(a.data.list)) : (s -= 1))
          : (o = a.data.list),
          t.setData({
            colorList: o,
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
  getStallList: function (e) {
    var t = this,
      o =
        (wx.getStorageSync("searchData"),
        {
          keyword: t.data.searchKey,
          pageNum: t.data.pageNum1,
          pageSize: t.data.pageSize1,
        });
    ServicesCard.shopCollectList(o).then(function (a) {
      if (0 === a.code) {
        var o;
        "pull" === e && (wx.hideNavigationBarLoading(), wx.stopPullDownRefresh());
        var s = a.data.pageNum;
        ("bottom" === e
          ? ((o = t.data.colorList),
            a.data.list.length > 0 ? (o = o.concat(a.data.list)) : (s -= 1))
          : (o = a.data.list),
          t.setData({
            shopList: o,
            total: a.data.total,
            pageNum1: s,
            pageSize1: a.data.pageSize,
          }));
      } else
        wx.showToast({
          title: a.msg,
          icon: "none",
        });
    });
  },
  onJump: function (a) {
    var e = a.currentTarget.dataset.goodsId;
    wx.navigateTo({
      url: "/pages/color-card-management/preview/preview?goodsId=" + e,
    });
  },
  onPullDownRefresh: function () {
    wx.showNavigationBarLoading();
    var ServicesCard = this;
    if ("colorSearch" === ServicesCard.data.pageType) {
      ServicesCard.setData({
        pageNum: 1,
      });
      ServicesCard.getColorList("pull");
    } else {
      ServicesCard.setData({
        pageNum1: 1,
      });
      ServicesCard.getStallList("pull");
    }
  },
  toShop: function (a) {
    (wx.removeStorageSync("paramShopId"),
      wx.setStorageSync("paramShopId", a.currentTarget.id),
      wx.switchTab({
        url: "/pages/index/index",
        success: function (a) {},
      }));
  },
  onReachBottom: function () {
    var ServicesCard = this,
      e = "bottom";
    "colorSearch" === ServicesCard.data.pageType
      ? (ServicesCard.setData({
          pageNum: ServicesCard.data.pageNum + 1,
        }),
        ServicesCard.getColorList(e))
      : (ServicesCard.setData({
          pageNum1: ServicesCard.data.pageNum1 + 1,
        }),
        ServicesCard.getStallList(e));
  },
});
