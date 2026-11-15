// 报价信息：承接既有跳转参数，调用 packageA/services 既有 matchDetail 方法，不新增端点、不伪造数据。
// 字段清单取自 demand 族相邻范式页回包；失败由传输层外显，本页另记日志并提供重试入口。
var service = require("../../../../services/services-demand").ServicesDemand;
var FIELDS = [{"key":"replyNo","label":"回复编号"},{"key":"matchStatusName","label":"匹配状态"},{"key":"partPrice","label":"剪样价"},{"key":"partPriceUnit","label":"剪样价单位"},{"key":"bulkPrice","label":"大货价"},{"key":"bulkPriceUnit","label":"大货价单位"},{"key":"stockGoods","label":"现货"},{"key":"remark","label":"备注"},{"key":"auditNoPassReason","label":"审核不通过原因"}];

Page({
  data: {
    listId: "",
    askNo: "",
    replyId: "",
    rows: [],
    loaded: false,
    error: false,
  },
  onLoad: function (options) {
    this.setData({
      listId: options.listId,
      askNo: options.askNo,
      replyId: options.replyId,
    });
    this.load();
  },
  load: function () {
    var page = this;
    this.setData({ loaded: false, error: false });
    service.matchDetail({ replyId: this.data.replyId })
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
        console.warn("[报价信息] matchDetail 请求失败", err);
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
