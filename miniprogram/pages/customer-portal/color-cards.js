var servicesCustomerPortal =
    require("../../libs/services/ServicesCustomerPortal.js").servicesCustomerPortal,
  perm = require("../../libs/utils/perm.js"),
  util = require("../../libs/utils/util.js").utils,
  app = getApp();
Page({
  data: {
    items: [],
    page: 1,
    pageSize: 10,
    total: 0,
    loading: false,
    finished: false,
    error: "",
  },
  onLoad: function () {
    app.userAuthList = util.getResList(wx.getStorageSync("resCodeList"));
    if (!perm.requireEntry("customerPortal:view")) return;
    this.loadColorCards();
  },
  loadColorCards: function () {
    if (this.data.loading || this.data.finished) return;
    var self = this;
    self.setData({ loading: true, error: "" });
    servicesCustomerPortal
      .colorCards({ page: self.data.page, page_size: self.data.pageSize })
      .then(function (resp) {
        if (
          0 !== resp.code ||
          !resp.data ||
          !Array.isArray(resp.data.items) ||
          typeof resp.data.total !== "number"
        ) {
          console.error("customer portal color cards invalid response", resp);
          self.setData({ loading: false, error: "色卡读取失败" });
          wx.showToast({ title: "色卡读取失败", icon: "none" });
          return;
        }
        console.info(
          "customer portal color cards loaded",
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
        console.error("customer portal color cards failed", err);
        self.setData({ loading: false, error: "色卡读取失败" });
        wx.showToast({ title: "色卡读取失败", icon: "none" });
      });
  },
  onReachBottom: function () {
    this.loadColorCards();
  },
  onPullDownRefresh: function () {
    this.setData({ page: 1, items: [], total: 0, finished: false });
    this.loadColorCards();
    wx.stopPullDownRefresh();
  },
});
