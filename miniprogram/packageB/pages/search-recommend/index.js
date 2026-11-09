var ServicesSearch = require("../../libs/services/ServicesSearch"),
  app = getApp();
Page({
  data: {
    noDataBg: "".concat(app.config.imgHost, "/img/customer/img_wuxinx@3x.png"),
    searchBotData: [],
    formInline: {
      page: 1,
      size: 10,
      totalPage: 0,
      searchField: "",
      searchId: "",
      parentId: "",
      searchSortType: 0,
    },
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
    moreRecommendParent: {},
  },
  onSwitchSearchType: function (e) {
    var app = e.currentTarget.dataset.type;
    (this.setData({
      searchBotData: [],
      "formInline.totalPage": 0,
      "formInline.page": 1,
      "formInline.searchSortType": app,
    }),
      this.onGetRecommendList());
  },
  handleConfirm: function (e) {
    var app = e.detail;
    (this.setData({
      searchBotData: [],
      "formInline.page": 1,
      "formInline.totalPage": 0,
      "formInline.searchField": app,
    }),
      this.onGetRecommendList());
  },
  handleInput: function (e) {
    var app = e.detail;
    this.setData({
      "formInline.searchField": app,
    });
  },
  onGetRecommendList: function () {
    var app = this,
      a = this.data.formInline,
      n = a.page,
      o = a.totalPage;
    n > o && 0 !== o
      ? (n = o)
      : (wx.showLoading({
          title: "拼命加载中...",
        }),
        ServicesSearch.ServicesSearch.getSimilarityResult(this.data.formInline).then(function (e) {
          if (0 === e.code) {
            ++n;
            var a = e.data.content || [];
            app.setData({
              searchBotData: 1 === n ? a : app.data.searchBotData.concat(a),
              "formInline.page": n,
              "formInline.totalPage": e.data.totalPage,
              triggeredPull: !1,
              scrollTop: 0,
            });
          }
          wx.hideLoading();
        }));
  },
  onScrollLower: function () {
    this.onGetRecommendList();
  },
  onLoad: function (e) {
    if (e.searchId && e.parentId) {
      var app = wx.getStorageSync("moreRecommendParent");
      (this.setData({
        moreRecommendParent: app,
        "formInline.searchId": e.searchId,
        "formInline.parentId": e.parentId,
      }),
        this.onGetRecommendList());
    }
  },
  onReady: function () {},
  onShow: function () {},
  onHide: function () {},
  onUnload: function () {},
  onPullDownRefresh: function () {},
  onReachBottom: function () {},
  onShareAppMessage: function () {},
});
