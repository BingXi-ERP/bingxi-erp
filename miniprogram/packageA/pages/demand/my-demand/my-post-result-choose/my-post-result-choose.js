// 选择匹配结果：承接既有跳转参数，调用 packageA/services 既有 matchList 方法，不新增端点、不伪造数据。
// 字段清单取自 demand 族相邻范式页回包；失败由传输层外显，本页另记日志并提供重试入口。
var service = require("../../../../services/services-demand").ServicesDemand;
var FIELDS = [{"key":"id","label":"编号"},{"key":"matchStatusName","label":"匹配状态"},{"key":"partPrice","label":"剪样价"},{"key":"bulkPrice","label":"大货价"},{"key":"detailText","label":"明细"},{"key":"pushTime","label":"推送时间"}];

Page({
  data: {
    listId: "",
    replyId: "",
    itemType: "",
    type: "",
    rows: [],
    loaded: false,
    error: false,
  },
  onLoad: function (options) {
    this.setData({
      listId: options.listId,
      replyId: options.replyId,
      itemType: options.itemType,
      type: options.type,
    });
    this.load();
  },
  load: function () {
    var page = this;
    this.setData({ loaded: false, error: false });
    service.matchList({ id: this.data.listId })
      .then(function (res) {
        page.setData({
          rows: (res.data && res.data.list || []).map(function (item) {
          return FIELDS.map(function (f) {
            return { label: f.label, value: item[f.key] };
          });
        }),
          loaded: true,
        });
      })
      .catch(function (err) {
        console.warn("[选择匹配结果] matchList 请求失败", err);
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
