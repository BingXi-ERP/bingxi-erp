var servicesCustomerPortal =
    require("../../../libs/services/ServicesCustomerPortal.js").servicesCustomerPortal,
  perm = require("../../libs/utils/perm.js"),
  util = require("../../libs/utils/util.js").utils,
  app = getApp();
Page({
  data: {
    items: [],
    page: 1,
    pageSize: 10,
    total: 0,
    keyword: "",
    loading: false,
    finished: false,
    error: "",
  },
  onLoad: function () {
    app.userAuthList = util.getResList(wx.getStorageSync("resCodeList"));
    if (!perm.requireEntry("customerPortal:view")) return;
    this.loadOrders();
  },
  onKeyword: function (event) {
    this.setData({ keyword: event.detail.value });
  },
  search: function () {
    this.setData({ page: 1, items: [], total: 0, finished: false });
    this.loadOrders();
  },
  loadOrders: function () {
    if (this.data.loading || this.data.finished) return;
    var self = this,
      params = { page: self.data.page, page_size: self.data.pageSize };
    if (self.data.keyword) params.order_no = self.data.keyword;
    self.setData({ loading: true, error: "" });
    servicesCustomerPortal
      .orders(params)
      .then(function (resp) {
        if (
          0 !== resp.code ||
          !resp.data ||
          !Array.isArray(resp.data.items) ||
          typeof resp.data.total !== "number"
        ) {
          console.error("customer portal orders invalid response", resp);
          self.setData({ loading: false, error: "订单读取失败" });
          wx.showToast({ title: "订单读取失败", icon: "none" });
          return;
        }
        console.info(
          "customer portal orders loaded",
          resp.data.total,
          resp.data.items.length,
        );
        var allItems = self.data.items.concat(resp.data.items);
        self.setData({
          loading: false,
          items: allItems,
          total: resp.data.total,
          page: self.data.page + 1,
          finished: allItems.length >= resp.data.total,
        });
      })
      .catch(function (err) {
        console.error("customer portal orders failed", err);
        self.setData({ loading: false, error: "订单读取失败" });
        wx.showToast({ title: "订单读取失败", icon: "none" });
      });
  },
  onReachBottom: function () {
    this.loadOrders();
  },
  onPullDownRefresh: function () {
    this.setData({ page: 1, items: [], total: 0, finished: false });
    this.loadOrders();
    wx.stopPullDownRefresh();
  },
});
