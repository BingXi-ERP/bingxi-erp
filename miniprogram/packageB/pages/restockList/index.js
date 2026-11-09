var t = require("../../../@babel/runtime/helpers/regeneratorRuntime"),
  e = require("../../../@babel/runtime/helpers/asyncToGenerator"),
  getDictData = require("../../libs/utils/getDictData"),
  app = getApp(),
  releaseCargoPass = require("../../libs/services/releaseCargoPass.js").servicesCargoPass;
Page({
  data: {
    globalApp: app,
    sortConfig: [
      {
        label: "克重",
        sort: 0,
        prop: "gramWeightSort",
      },
    ],
    restockData: [],
    descIcon: "".concat(app.config.imgHost, "/img/customer/duibuIcon/icon/desc.png"),
    ascIcon: "".concat(app.config.imgHost, "/img/customer/duibuIcon/icon/asc.png"),
    iconGramWeight: "".concat(
      app.config.imgHost,
      "/img/customer/duibuIcon/icon/icon_gramweight.png",
    ),
    iconMaterial: "".concat(app.config.imgHost, "/img/customer/duibuIcon/icon/icon_material.png"),
    jhtFilterIcon: "".concat(app.config.imgHost, "/img/customer/duibuIcon/icon/jht_filter.png"),
    jhtListIcon: "".concat(app.config.imgHost, "/img/customer/duibuIcon/icon/jht_list.png"),
    supplierAdrTypeOption: [],
    totalPage: 0,
    formInline: {
      page: 1,
      size: 10,
      gramWeightSort: "desc",
      keyword: "",
    },
    productShowMode: !1,
    showSearchFilter: !1,
    lastFilterQuery: {},
    isAllStation: !0,
    searchNo: "",
    stayTimeSetInter: null,
    stayTimeMinute: 0,
  },
  onShowFilter: function () {
    this.setData({
      showSearchFilter: !0,
    });
  },
  onConfirmFilter: function (t) {
    (console.log(t.detail),
      this.setData({
        lastFilterQuery: t.detail,
      }),
      this.setData({
        formInline: {
          keyword: this.data.formInline.keyword,
          page: 1,
          size: 10,
          clothWidth: t.detail.clothWidth,
          clothWidthDeviation: t.detail.clothWidthDeviation,
          gramWeightSort: "desc",
          gramWeight: t.detail.gramWeight,
          materialNames: t.detail.material,
          gramWeightDeviation: t.detail.gramWeightDeviation,
          region: t.detail.region,
          process: t.detail.process,
          searchNo: this.data.searchNo,
        },
        restockData: [],
      }),
      this.getRestockList());
  },
  onResetFilterParams: function () {
    this.selectComponent("#searchFilter").initFilterParam();
  },
  handleSearch: async function () {
    await getDictData.submitStayTime();
    (getDictData.setData({
      formInline: {
        keyword: getDictData.data.formInline.keyword,
        page: 1,
        size: 10,
        gramWeightSort: "desc",
      },
      restockData: [],
    }),
      getDictData.getRestockList());
  },
  onChangeSearch: function (t) {
    this.setData({
      "formInline.keyword": t.detail,
    });
  },
  onChangeListMode: function () {
    this.setData({
      productShowMode: !this.data.productShowMode,
    });
  },
  onChangeSort: function (t) {
    var e = t.currentTarget.dataset.item;
    (this.setData({
      "formInline.page": 1,
      "formInline.totalPage": 0,
      restockData: [],
      "sortConfig[0].sort": 0 === e.sort ? 1 : 0,
      "formInline.gramWeightSort": 0 === e.sort ? "asc" : "desc",
    }),
      this.getRestockList());
  },
  onScrollLower: function () {
    this.getRestockList();
  },
  submitStayTime: function () {
    var getDictData = this;
    return e(
      t().mark(function e() {
        var app;
        return t().wrap(function (t) {
          for (;;)
            switch ((t.prev = t.next)) {
              case 0:
                if (!(i = wx.getStorageSync("cargoStayTime"))) {
                  t.next = 1;
                  break;
                }
                return (
                  (app.stayTime = getDictData.data.stayTimeMinute),
                  (t.next = 1),
                  releaseCargoPass.saveStayTime(app).then(function (t) {
                    0 === t.code && wx.setStorageSync("cargoStayTime", "");
                  })
                );
              case 1:
              case "end":
                return t.stop();
            }
        }, e);
      }),
    )();
  },
  getRestockList: function () {
    var t = this,
      e = this.data.formInline,
      getDictData = e.page,
      app = e.totalPage;
    getDictData > app && 0 !== app
      ? (a = app)
      : (wx.showLoading({
          title: "拼命加载中...",
        }),
        releaseCargoPass
          .releaseRestockList(this.data.formInline)
          .then(function (e) {
            if (0 === e.code) {
              (1 === getDictData &&
                ((t.data.stayTimeSetInter = null),
                (t.data.stayTimeMinute = 0),
                wx.setStorageSync("cargoStayTime", {
                  searchNo: e.data.searchNo,
                  stayTime: 0,
                }),
                (t.data.stayTimeSetInter = setInterval(function () {
                  t.data.stayTimeMinute++;
                }, 1e3))),
                ++getDictData);
              var app = e.data ? e.data.pageResult.content : [];
              t.setData({
                searchNo: e.data.searchNo,
                "formInline.page": getDictData,
                restockData: 1 === getDictData ? app : t.data.restockData.concat(app),
                "formInline.totalPage": e.data.pageResult.totalPage,
                "formInline.searchNo": e.data.searchNo,
              });
            }
            wx.hideLoading();
          })
          .catch(function () {
            wx.hideLoading();
          }));
  },
  onViewDetail: function (t) {
    var e = t.currentTarget.dataset.item;
    wx.navigateTo({
      url: "../restock-product/index?companyId="
        .concat(e.companyId, "&productId=")
        .concat(e.id, "&searchNo=")
        .concat(this.data.searchNo, "&domain=")
        .concat(e.domain),
    });
  },
  onLoad: function (t) {
    var e = this;
    ((0, getDictData.getDictData)("one_supplier_area").then(function (t) {
      e.setData({
        supplierAdrTypeOption: t,
      });
    }),
      t &&
        (this.setData({
          "formInline.keyword": t.keyword,
        }),
        this.getRestockList()));
  },
  onReady: function () {},
  onShow: function () {
    var t = this,
      e = wx.getStorageSync("cargoStayTime");
    e &&
      ((this.data.stayTimeMinute = e.stayTime),
      (this.data.stayTimeSetInter = setInterval(function () {
        t.data.stayTimeMinute++;
      }, 1e3)));
  },
  pauseStayTime: function () {
    var t = wx.getStorageSync("cargoStayTime");
    t &&
      ((t.stayTime = this.data.stayTimeMinute),
      wx.setStorageSync("cargoStayTime", t),
      clearInterval(this.data.stayTimeSetInter));
  },
  onHide: function () {
    this.pauseStayTime();
  },
  onUnload: function () {
    this.pauseStayTime();
  },
  onPullDownRefresh: function () {},
  onReachBottom: function () {},
  onShareAppMessage: function () {},
});
