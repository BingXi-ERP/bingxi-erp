var servicesCustomerPortal =
  require("../../../libs/services/ServicesCustomerPortal.js").servicesCustomerPortal;
Page({
  data: {
    items: [],
    page: 1,
    pageSize: 10,
    total: 0,
    loading: false,
    error: "",
  },
  onLoad: function () {
    this.loadReconciliations();
  },
  loadReconciliations: function () {
    if (
      this.data.loading ||
      (this.data.total > 0 && this.data.items.length >= this.data.total)
    )
      return;
    var self = this;
    self.setData({ loading: true, error: "" });
    servicesCustomerPortal
      .reconciliations({ page: self.data.page, page_size: self.data.pageSize })
      .then(function (resp) {
        if (
          0 !== resp.code ||
          !resp.data ||
          !Array.isArray(resp.data.items) ||
          typeof resp.data.total !== "number"
        ) {
          console.error(
            "customer portal reconciliations invalid response",
            resp,
          );
          self.setData({ loading: false, error: "对账读取失败" });
          wx.showToast({ title: "对账读取失败", icon: "none" });
          return;
        }
        console.info(
          "customer portal reconciliations loaded",
          resp.data.total,
          resp.data.items.length,
        );
        self.setData({
          loading: false,
          items: self.data.items.concat(resp.data.items),
          total: resp.data.total,
          page: self.data.page + 1,
        });
      })
      .catch(function (err) {
        console.error("customer portal reconciliations failed", err);
        self.setData({ loading: false, error: "对账读取失败" });
        wx.showToast({ title: "对账读取失败", icon: "none" });
      });
  },
  onReachBottom: function () {
    this.loadReconciliations();
  },
  onPullDownRefresh: function () {
    this.setData({ page: 1, items: [], total: 0 });
    this.loadReconciliations();
    wx.stopPullDownRefresh();
  },
});
