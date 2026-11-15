// 发布需求：承接既有跳转参数，调用 packageA/services 既有 demandDetail 方法，不新增端点、不伪造数据。
// 字段清单取自 demand 族相邻范式页回包；失败由传输层外显，本页另记日志并提供重试入口。
var service = require("../../../../services/services-demand").ServicesDemand;
var FIELDS = [{"key":"askNo","label":"需求编号"},{"key":"text","label":"需求描述"},{"key":"num","label":"数量"},{"key":"price","label":"预算价"},{"key":"province","label":"省份"},{"key":"city","label":"城市"},{"key":"createTime","label":"发布时间"},{"key":"lastTime","label":"截止时间"}];

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
    service.demandDetail({ id: this.data.itemId })
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
        console.warn("[发布需求] demandDetail 请求失败", err);
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
