var objectSpread2 = require("../../../@babel/runtime/helpers/objectSpread2"),
  ServicesSearch = require("../../libs/services/ServicesSearch"),
  util = require("../../libs/utils/util.js").utils,
  app = getApp();
Page({
  data: {
    moreRecommendParent: {},
    searchData: [],
    formInline: {
      searchField: "",
      searchId: "",
      duiBuCode: "",
      mode: 1,
      page: 1,
      size: 10,
      totalPage: 0,
    },
    isUseFilter: !1,
    searchFilterVal: "",
    showSearchFilter: !1,
    lastFilterQuery: {},
    scrollTop: 0,
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
  handleColorCard: function (t) {
    var util = this,
      app = t.currentTarget.dataset.item.productId;
    ServicesSearch.ServicesSearch.getColorChartPicture([app]).then(function (t) {
      if (0 === t.code) {
        var ServicesSearch,
          app,
          i = t.data[0];
        if (!(
          i &&
          ((null != i &&
            null !== (e = i.skuColorList) &&
            void 0 !== ServicesSearch &&
            ServicesSearch.length) ||
            (null != i && null !== (r = i.colorChartPaths) && void 0 !== app && app.length))
        ))
          return void wx.showToast({
            title: "暂无电子色卡",
            icon: "none",
          });
        for (var o = i.skuColorList || [], n = [], l = 0, s = o.length; l < s; l += 24)
          n.push(o.slice(l, l + 24));
        (console.log(n),
          util.setData({
            colorChartPaths: i.colorChartPaths || [],
            colorList: n,
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
    var objectSpread2 = wx.getStorageSync("resCodeList");
    this.setData({
      userAuthList: util.getResList(objectSpread2),
    });
  },
  handleSearchInput: function (t) {
    var ServicesSearch = t.detail;
    this.setData({
      "formInline.searchField": ServicesSearch,
    });
  },
  onClearSearchInput: function () {
    this.selectComponent("#searchNewBar").onClearInput();
  },
  handleSearchConfirm: function (t) {
    var ServicesSearch = t.detail;
    (this.setData({
      searchData: [],
      "formInline.page": 1,
      "formInline.totalPage": 0,
      "formInline.searchField": ServicesSearch,
      scrollTop: 0,
    }),
      this.onResetFilterParams(),
      this.getSearchFamilyResult());
  },
  onResetFilterParams: function () {
    this.selectComponent("#searchFilter").initFilterParam();
  },
  handleShowFilter: function () {
    this.setData({
      showSearchFilter: !0,
    });
  },
  getFilterSearchResult: function () {
    var objectSpread2 = this;
    (wx.showLoading({
      title: "拼命加载中...",
    }),
      ServicesSearch.ServicesSearch.getPlatFilterResult(this.data.lastFilterQuery).then(
        function (e) {
          if (0 === e.code) {
            var util = e.data ? e.data.content : [],
              app = objectSpread2.data,
              i = app.searchData,
              o = app.lastFilterQuery;
            ((i = 1 === o.page ? util : searchFilterData.concat(util)),
              (o.totalPage = e.data.totalPage),
              objectSpread2.setData({
                searchData: i,
                lastFilterQuery: o,
              }));
          }
          wx.hideLoading();
        },
      ));
  },
  onConfirmFilter: function (e) {
    (this.data.formInline.searchField && this.onClearSearchInput(),
      this.setData({
        "formInline.searchField": "",
        lastFilterQuery: objectSpread2(
          objectSpread2({}, e.detail),
          {},
          {
            duiBuCode: this.data.formInline.duiBuCode,
          },
        ),
        scrollTop: 0,
      }),
      this.getFilterSearchResult());
  },
  getSearchFamilyResult: function () {
    var objectSpread2 = this,
      util = this.data.formInline,
      app = util.page,
      i = util.totalPage;
    app > i && 0 !== i
      ? (r = i)
      : (wx.showLoading({
          title: "拼命加载中...",
        }),
        ServicesSearch.ServicesSearch.getPlatFamily(this.data.formInline).then(function (e) {
          if (0 === e.code) {
            ++app;
            var util = e.data.content || [];
            objectSpread2.setData({
              "formInline.page": app,
              searchData: 1 === app ? util : objectSpread2.data.searchData.concat(util),
              "formInline.totalPage": e.data.totalPage,
            });
          }
          wx.hideLoading();
        }));
  },
  onScrollLower: function () {
    var objectSpread2 = this.data,
      ServicesSearch = objectSpread2.isUseFilter,
      util = objectSpread2.lastFilterQuery;
    if (ServicesSearch) {
      if (util.page === util.totalPage || util.page >= util.totalPage) return;
      (++util.page,
        this.setData({
          lastFilterQuery: util,
        }),
        this.getFilterSearchResult());
    } else this.getSearchFamilyResult();
  },
  onLoad: function (t) {
    var ServicesSearch = t.id,
      util = t.duiBuCode,
      app = t.clusterName,
      i = wx.getStorageSync("moreRecommendParent");
    (wx.setNavigationBarTitle({
      title: util + "".concat(app ? "/" + app : ""),
    }),
      this.setData({
        moreRecommendParent: i,
        "formInline.searchId": ServicesSearch,
        "formInline.duiBuCode": util,
      }),
      this.getPermissions(),
      this.getSearchFamilyResult());
  },
  onReady: function () {},
  onShow: function () {},
  onHide: function () {},
  onUnload: function () {},
  onPullDownRefresh: function () {},
  onReachBottom: function () {},
  onShareAppMessage: function () {},
});
