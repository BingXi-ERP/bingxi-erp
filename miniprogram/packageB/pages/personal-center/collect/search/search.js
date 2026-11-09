var app = getApp();
Page({
  data: {
    image: {
      search: "../../../../../assets/images/icon2nd/symbols-search.png",
      clearicon: "".concat(app.config.imgHost, "/img/customer/duibuIcon/icon/del@2x.png"),
    },
    sercherStorage: [],
    StorageFlag: !1,
    search_name: "",
    pageType: "",
  },
  clearSearchStorage: function () {
    (wx.removeStorageSync("searchData"),
      this.setData({
        sercherStorage: [],
        StorageFlag: !1,
      }));
  },
  openLocationsercher: function () {
    this.setData({
      sercherStorage: wx.getStorageSync("searchData") || [],
      StorageFlag: !0,
      listFlag: !0,
    });
  },
  inputTyping: function (a) {
    var e = a.detail.value;
    this.setData({
      search_name: e,
    });
  },
  canleSearch: function () {
    wx.navigateBack({
      delta: 1,
    });
  },
  tapSercherStorage: function (a) {
    var e,
      t = a.currentTarget.dataset.pageType;
    "colorIndexNew" === t
      ? (wx.setStorageSync("keyWord", a.currentTarget.dataset.name),
        wx.navigateBack({
          delta: 1,
        }))
      : "colorIndex" === t || "colorIndex1" === t
        ? ((e = "/packageB/pages/personal-center/collect/search/color-card/color-card"),
          wx.navigateTo({
            url: e + "?id=" + a.target.id + "&pageType=" + t,
          }))
        : ((e = "/packageB/pages/personal-center/collect/search/stall-color/stall-color"),
          wx.navigateTo({
            url: e + "?id=" + a.target.id + "&pageType=" + t,
          }));
  },
  onShow: function (a) {
    var e = this;
    if (0 != (t = this).data.search_name.length) {
      var t = this;
      if (void 0 !== a && "" != this.data.search_name) {
        var r,
          c = a.currentTarget.dataset.pageType,
          o = t.data.sercherStorage,
          n = !1,
          s = o.length + 1;
        (o.map(function (a) {
          (console.log(a), a.name === e.data.search_name && ((n = !0), (s = a.id)));
        }),
          !1 === n &&
            o.push({
              id: s,
              name: t.data.search_name,
            }),
          wx.setStorageSync("searchData", o),
          console.log(wx.getStorageSync("searchData")),
          t.setData({
            StorageFlag: !1,
          }),
          "colorIndexNew" === c
            ? (wx.setStorageSync("keyWord", this.data.search_name),
              wx.navigateBack({
                delta: 1,
              }))
            : "colorIndex" === c || "colorIndex1" === c
              ? ((r = "/packageB/pages/personal-center/collect/search/color-card/color-card"),
                wx.navigateTo({
                  url: r + "?id=" + s + "&pageType=" + c,
                }))
              : ((r = "/packageB/pages/personal-center/collect/search/stall-color/stall-color"),
                wx.navigateTo({
                  url: r + "?id=" + s + "&pageType=" + c,
                })));
      }
    }
  },
  onLoad: function (a) {
    (console.log(a),
      this.setData({
        pageType: a.pageType,
      }),
      this.openLocationsercher(),
      wx.hideShareMenu());
  },
});
