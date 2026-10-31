var toConsumableArray = require("../../../../../@babel/runtime/helpers/toConsumableArray"),
  ServicesMoney = require("../../../../libs/services/ServicesMoney");
Page({
  data: {
    recordList: [],
    pageNum: 0,
    pageSize: 10,
    isAll: !1,
  },
  getRecord: function () {
    var n = this,
      t = this.data,
      i = t.pageNum,
      a = t.pageSize,
      r = t.isAll,
      s = t.recordList;
    r ||
      (i++,
      ServicesMoney.ServicesMoney.getMoneyRecord({
        pageNum: i,
        pageSize: a,
      }).then(function (o) {
        if (0 === o.code) {
          var t = o.data.list;
          n.setData({
            pageNum: i,
            recordList: [].concat(toConsumableArray(s), toConsumableArray(t)),
            isAll: o.data.isLastPage,
          });
        }
      }));
  },
  onLoad: function (e) {
    this.getRecord();
  },
  onReady: function () {},
  onShow: function () {},
  onHide: function () {},
  onUnload: function () {},
  onPullDownRefresh: function () {},
  onReachBottom: function () {
    this.getRecord();
  },
  onShareAppMessage: function () {},
});
