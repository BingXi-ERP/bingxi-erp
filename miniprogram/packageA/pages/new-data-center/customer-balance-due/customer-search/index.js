var toConsumableArray = require("../../../../../@babel/runtime/helpers/toConsumableArray"),
  services_demand = require("../../../../services/services-demand.js"),
  ServicesUserLog = require("../../../../services/ServicesUserLog.js"),
  app = getApp();
Page({
  data: {
    app: app,
    icon: {
      noData: "".concat(app.config.imgHost, "/img/v2.15.0/DefaultPage.png"),
      del: "".concat(app.config.imgHost, "/img/customer/icon_trash.png"),
      delete: "".concat(app.config.imgHost, "/img/customer/duibuIcon/icon/del@2x.png"),
    },
    searchData: [],
    showNoData: !1,
    isAll: !1,
    pageParams: {
      customerName: "",
      page: 0,
      Size: 10,
      orderByFlag: 1,
    },
  },
  getValue: function (a) {
    var services_demand = a.detail.value;
    this.setData({
      "pageParams.customerName": services_demand,
    });
  },
  searchCancel: function () {
    this.setData({
      "pageParams.customerName": "",
      "pageParams.page": 0,
      showNoData: !1,
      isAll: !1,
      searchData: [],
    });
  },
  backPage: function () {
    wx.navigateBack();
  },
  gotoDetail: function (a) {
    var services_demand = a.currentTarget.dataset.custId,
      app = a.currentTarget.dataset.custName,
      o = a.currentTarget.dataset.shopId;
    (ServicesUserLog.servicesUserLog.setUserHandleLog(403),
      wx.navigateTo({
        url: "/packageA/pages/new-data-center/customer-balance-detail/customer-balance-detail?custId="
          .concat(services_demand, "&&shopId=")
          .concat(o, "&&custName=")
          .concat(app),
      }));
  },
  search: function () {
    "" != this.data.pageParams.customerName.trim() &&
      (this.setData({
        "pageParams.page": 0,
        showNoData: !1,
        isAll: !1,
        searchData: [],
      }),
      ServicesUserLog.servicesUserLog.setUserHandleLog(401),
      this.getList());
  },
  getList: function () {
    var ServicesUserLog = this,
      app = this.data,
      o = app.isAll,
      n = app.searchData,
      c = app.pageParams;
    o ||
      (c.page++,
      console.log(c),
      services_demand.ServicesDemand.getCrmBalanceDueList(c).then(function (e) {
        if (0 === e.code) {
          var app = [].concat(toConsumableArray(n), toConsumableArray(e.data.content));
          ServicesUserLog.setData({
            pageParams: c,
            searchData: app,
            isAll: e.data.isLastPage,
            showNoData: 0 === app.length,
          });
        }
      }));
  },
  onLoad: function (a) {},
  onReady: function () {},
  onShow: function () {},
  onHide: function () {},
  onUnload: function () {},
  onPullDownRefresh: function () {},
  onReachBottom: function () {
    this.getList();
  },
  onShareAppMessage: function () {},
});
