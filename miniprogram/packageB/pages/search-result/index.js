var ServicesSearch = require("../../libs/services/ServicesSearch"),
  util = require("../../libs/utils/util.js").utils,
  app = getApp();
Page({
  data: {
    searchData: {},
    searchTopData: {},
    searchBotData: [],
    searchFilterData: [],
    searchTypeOpt: [
      {
        value: 0,
        label: "纹路相似检索",
        disabled: !1,
      },
      {
        value: 1,
        label: "颜色相似检索",
        disabled: !1,
      },
    ],
    formInline: {
      searchId: "",
      sortType: 0,
      deltaInterval: "0,3",
    },
    resultPagInline: {
      page: 1,
      size: 10,
      totalPage: 0,
    },
    isUseFilter: !1,
    isAllStation: !1,
    showSearch: !1,
    searchFilterVal: "",
    isSelectedFamily: !1,
    showSearchFilter: !1,
    lastFilterQuery: {},
    scrollTop: 0,
    scrollviewHeight: "",
    statusBarHeight: "",
    triggeredPull: !1,
    isRefresher: !0,
    userAuthList: {},
    icon: {
      colorCard: "".concat(app.config.imgHost, "/img/customer/duibuIcon/icon/img-color-card.png"),
    },
    hasColorCard: !1,
    swiper: {
      indicatorDots: !0,
      indicatorColor: "#D9D9D9",
      indicatorActiveColor: "#4177F5",
      autoplay: !1,
      circular: !0,
      duration: 150,
      current: 0,
    },
    globalApp: "",
    colorList: [],
    colorChartPaths: [],
  },
  handleColorCard: function (e) {
    var app = this,
      r = e.currentTarget.dataset.item.productId;
    ServicesSearch.ServicesSearch.getColorChartPicture([r]).then(function (t) {
      if (0 === t.code) {
        var util,
          r,
          i = t.data[0];
        if (!(
          i &&
          ((null != i && null !== (e = i.skuColorList) && void 0 !== util && util.length) ||
            (null != i && null !== (r = i.colorChartPaths) && void 0 !== r && r.length))
        ))
          return void wx.showToast({
            title: "暂无电子色卡",
            icon: "none",
          });
        for (var s = i.skuColorList || [], l = [], o = 0, n = s.length; o < n; o += 24)
          l.push(s.slice(o, o + 24));
        (console.log(l),
          app.setData({
            colorChartPaths: i.colorChartPaths || [],
            colorList: l,
            hasColorCard: !0,
          }));
      }
    });
  },
  closePopup: function () {
    this.setData({
      hasColorCard: !1,
    });
  },
  getPermissions: function () {
    var ServicesSearch = wx.getStorageSync("resCodeList");
    this.setData({
      userAuthList: util.getResList(ServicesSearch),
    });
  },
  onSwitchSearchType: function (t) {
    var util = this,
      app = t.currentTarget.dataset.type;
    (1 !== app || this.data.searchTopData.color1) &&
      this.setData(
        {
          "formInline.sortType": app,
          scrollTop: 0,
        },
        function () {
          util.getSearchResult();
        },
      );
  },
  handleShowFilter: function () {
    this.setData({
      showSearchFilter: !0,
    });
  },
  onSearchInput: function (t) {
    this.setData({
      searchFilterVal: t.detail.value,
    });
  },
  onSearchConfirm: function () {
    var ServicesSearch = this.data,
      util = ServicesSearch.lastFilterQuery,
      app = ServicesSearch.formInline,
      r = ServicesSearch.searchFilterVal,
      i = ServicesSearch.isAllStation,
      s = ServicesSearch.searchData;
    if (
      ((e = {
        mode: i ? 1 : 0,
        page: 1,
        size: 10,
        totalPage: 0,
        searchField: r,
        searchId: app.searchId,
        deltaInterval: "0,3",
      }),
      i)
    ) {
      var l,
        o,
        n,
        c,
        h = s.records;
      util.duiBuCodeOrSpuNumbers = {
        duiBuCodes:
          null !==
            (l =
              null ===
                (o = h.filter(function (t) {
                  return t.duiBuCode;
                })) || void 0 === o
                ? void 0
                : o.map(function (t) {
                    return t.duiBuCode;
                  })) && void 0 !== l
            ? l
            : [],
        spuNumbers:
          null !==
            (n =
              null ===
                (c = h.filter(function (t) {
                  return !t.duiBuCode;
                })) || void 0 === c
                ? void 0
                : c.map(function (t) {
                    return t.spuNumber;
                  })) && void 0 !== n
            ? n
            : [],
      };
    }
    (this.setData({
      lastFilterQuery: util,
    }),
      this.getFilterSearchResult());
  },
  handleShowSearchBar: function () {
    this.setData({
      showSearch: !this.data.showSearch,
      isRefresher: this.data.showSearch,
      isUseFilter: !1,
      searchFilterVal: "",
      searchBotData: this.data.isAllStation
        ? this.data.searchData.records
        : this.data.searchData.atRecords,
      scrollTop: 0,
    });
  },
  onConfirmFilter: function (t) {
    (this.setData({
      lastFilterQuery: t.detail,
    }),
      this.getFilterSearchResult());
  },
  onResetFilterParams: function () {
    this.selectComponent("#searchFilter").initFilterParam();
  },
  handleSwithStation: function (t) {
    var util = t.currentTarget.dataset.station;
    (this.setData({
      searchBotData: [],
      isAllStation: "2" === util,
      isUseFilter: !1,
      resultPagInline: {
        page: 1,
        size: 10,
        totalPage: 0,
      },
      scrollTop: 0,
    }),
      this.onResetFilterParams(),
      this.resultPaging());
  },
  getFilterSearchResult: function () {
    var util = this,
      app = this.data,
      r = app.isAllStation,
      i = app.lastFilterQuery;
    (wx.showLoading({
      title: "拼命加载中...",
    }),
      ServicesSearch.ServicesSearch[r ? "getPlatFilterResult" : "getFilterResult"](i).then(
        function (t) {
          if (0 === t.code) {
            var app = t.data ? t.data.content : [],
              r = util.data,
              i = r.searchFilterData,
              s = r.searchBotData,
              l = r.lastFilterQuery;
            (1 === l.page ? ((i = app), (s = app)) : ((i = i.concat(app)), (s = s.concat(app))),
              (l.totalPage = t.data.totalPage),
              util.setData({
                searchFilterData: i,
                searchBotData: s,
                lastFilterQuery: l,
                triggeredPull: !1,
                isUseFilter: !0,
              }));
          }
          wx.hideLoading();
        },
      ));
  },
  resultPaging: function (t) {
    var util = this.data,
      app = util.resultPagInline,
      r = util.searchBotData,
      i = util.isAllStation,
      s = util.searchData;
    if (!(app.page > app.totalPage && 0 !== app.totalPage)) {
      var l = t || (i ? s.records || [] : s.atRecords || []),
        o = (app.page - 1) * app.size,
        n = o + app.size,
        c = l.length < n ? l.length : n,
        h = r.concat(l.slice(o, c));
      (++app.page,
        this.setData({
          searchBotData: h,
          resultPagInline: app,
        }));
    }
  },
  getSearchResult: function () {
    var util = this;
    (wx.showLoading({
      title: "拼命加载中...",
    }),
      ServicesSearch.ServicesSearch.getResult(this.data.formInline).then(function (t) {
        if (0 === t.code) {
          var app = (util.data.isAllStation ? t.data.records : t.data.atRecords) || [],
            r = Math.round(app.length / util.data.resultPagInline.size);
          (util.setData({
            searchTopData: t.data.originRecord || {},
            "resultPagInline.totalPage": r,
            searchData: t.data,
            triggeredPull: !1,
            scrollTop: 0,
          }),
            util.resultPaging(app));
        }
        wx.hideLoading();
      }));
  },
  onRefresh: function () {
    if (!this.data.triggeredPull && this.data.isRefresher) {
      if (
        (this.setData({
          triggeredPull: !0,
          searchBotData: [],
          resultPagInline: {
            page: 1,
            size: 10,
            totalPage: 0,
          },
        }),
        this.data.isUseFilter)
      )
        return (
          this.setData({
            "lastFilterQuery.page": 1,
            "lastFilterQuery.totalPage": 0,
          }),
          void this.getFilterSearchResult()
        );
      this.getSearchResult();
    }
  },
  onScrollTolower: function () {
    var ServicesSearch = this.data,
      util = ServicesSearch.isUseFilter,
      app = ServicesSearch.lastFilterQuery;
    if (util) {
      if (app.page === app.totalPage || app.page >= app.totalPage) return;
      (++app.page,
        this.setData({
          lastFilterQuery: app,
        }),
        this.getFilterSearchResult());
    } else this.resultPaging();
  },
  onLoad: function (t) {
    var util = this;
    wx.getSystemInfo({
      success: function (t) {
        ((util.statusBarHeight = t.statusBarHeight),
          (util.scrollviewHeight = "calc(100vh - 350rpx - ".concat(util.statusBarHeight, "rpx)")));
      },
    });
    var r = t.id;
    (wx.setNavigationBarTitle({
      title: r,
    }),
      this.getPermissions(),
      this.setData({
        globalApp: app,
        "formInline.searchId": r,
      }),
      this.getSearchResult());
  },
  onReady: function () {},
  onShow: function () {},
  onHide: function () {},
  onUnload: function () {},
  onPullDownRefresh: function () {},
  onReachBottom: function () {},
  onShareAppMessage: function () {},
});
