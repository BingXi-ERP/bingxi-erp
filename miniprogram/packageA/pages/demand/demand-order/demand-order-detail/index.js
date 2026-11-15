// 需求订单详情：承接既有跳转参数，调用 packageA/services 既有 orderDetail 方法，不新增端点、不伪造数据。
// 字段清单取自 demand 族相邻范式页回包；失败由传输层外显，本页另记日志并提供重试入口。
var service = require("../../../../services/ServicesDemandOrder").default;
var FIELDS = [{"key":"orderNo","label":"订单号"},{"key":"orderAmount","label":"订单金额"},{"key":"goodsPrice","label":"货款"},{"key":"orderStatus","label":"订单状态"},{"key":"createTime","label":"下单时间"}];

Page({
  data: {
    itemId: "",
    rows: [],
    loaded: false,
    error: false,
  },
  onLoad: function (options) {
    this.setData({
      itemId: options.itemId,
    });
    this.load();
  },
  load: function () {
    var page = this;
    this.setData({ loaded: false, error: false });
    service.orderDetail({ itemId: this.data.itemId })
      .then(function (res) {
        page.setData({
          rows: FIELDS.map(function (f) {
          var d = res.data || {};
          return { label: f.label, value: d[f.key] };
        }),
          loaded: true,
        });
      })
      .catch(function (err) {
        console.warn("[需求订单详情] orderDetail 请求失败", err);
        page.setData({ loaded: true, error: true, rows: [] });
      });
  },
  onRetry: function () {
    this.load();
  },
  onPullDownRefresh: function () {
    this.load();
    wx.stopPullDownRefresh();
  },
});
