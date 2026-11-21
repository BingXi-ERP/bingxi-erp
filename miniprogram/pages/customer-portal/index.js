var servicesCustomerPortal =
    require("../../libs/services/ServicesCustomerPortal.js").servicesCustomerPortal,
  perm = require("../../libs/utils/perm.js"),
  util = require("../../libs/utils/util.js").utils,
  app = getApp();
Page({
  data: {
    loading: true,
    error: "",
    summary: null,
    entries: [
      { title: "我的订单", url: "/pages/customer-portal/orders" },
      { title: "我的对账", url: "/pages/customer-portal/reconciliations" },
      { title: "我的色卡", url: "/pages/customer-portal/color-cards" },
    ],
  },
  onLoad: function () {
    app.userAuthList = util.getResList(wx.getStorageSync("resCodeList"));
    if (!perm.requireEntry("customerPortal:view")) return;
    this.loadDashboard();
  },
  loadDashboard: function () {
    var self = this;
    self.setData({ loading: true, error: "" });
    servicesCustomerPortal
      .dashboard()
      .then(function (resp) {
        if (
          0 !== resp.code ||
          !resp.data ||
          typeof resp.data.order_count !== "number"
        ) {
          console.error("customer portal dashboard invalid response", resp);
          self.setData({ loading: false, error: "汇总读取失败" });
          wx.showToast({ title: "汇总读取失败", icon: "none" });
          return;
        }
        console.info("customer portal dashboard loaded", resp.data);
        self.setData({ loading: false, summary: resp.data });
      })
      .catch(function (err) {
        console.error("customer portal dashboard failed", err);
        self.setData({ loading: false, error: "汇总读取失败" });
        wx.showToast({ title: "汇总读取失败", icon: "none" });
      });
  },
  onPullDownRefresh: function () {
    this.loadDashboard();
    wx.stopPullDownRefresh();
  },
  openPage: function (event) {
    wx.navigateTo({ url: event.currentTarget.dataset.url });
  },
});
