var e = (0, require("../../../../@babel/runtime/helpers/interopRequireDefault").default)(
    require("../../../../utils/mta_analysis.js"),
  ),
  ServicesIndex = require("../../../../libs/services/ServicesIndex.js").ServicesIndex,
  util = require("../../../../libs/utils/util").utils;
Page({
  data: {
    colorCardDetail: {},
    listInfo: {},
    pageNum: 1,
    pageSize: 20,
    isDone: !1,
    goodsId: "",
    list: [],
  },
  onLoad: function (t) {
    (e.default.Page.init(),
      wx.hideShareMenu(),
      console.log(t.goodsId),
      this.setData({
        goodsId: t.goodsId,
      }),
      this.colorCardReceiveDetail(t.goodsId),
      this.storeDetail(t.goodsId));
  },
  colorCardReceiveDetail: function (e) {
    var o = this,
      i = e,
      s = this.data.list;
    wx.showLoading();
    var n = {
      pageSize: this.data.pageSize,
      pageNum: this.data.pageNum,
      goodsId: i,
    };
    ServicesIndex.storeReceiveList(n).then(function (e) {
      (wx.hideLoading(),
        0 === e.code
          ? (e.data.list.length > 0
              ? e.data.list.map(function (e) {
                  ((e.accessTime = util.formatDateTime(e.accessTime, !0)),
                    console.log(e.accessTime),
                    s.push(e));
                })
              : 0 == e.data.list.length &&
                o.data.pagNum > 1 &&
                o.setData({
                  isDone: !0,
                }),
            o.setData({
              listInfo: e.data,
              list: s,
            }))
          : wx.showToast({
              title: e.msg,
              icon: "none",
            }));
    });
  },
  storeDetail: function (e) {
    var util = this,
      o = {
        goodsId: e,
      };
    ServicesIndex.storeDetail(o).then(function (e) {
      0 === e.code
        ? ((util.data.colorCardDetail = e.data),
          util.setData({
            colorCardDetail: util.data.colorCardDetail,
          }))
        : wx.showToast({
            title: e.msg,
            icon: "none",
          });
    });
  },
  onReady: function () {},
  onShow: function () {},
  onHide: function () {},
  onUnload: function () {},
  onPullDownRefresh: function () {},
  onReachBottom: function () {
    var e = this.data,
      ServicesIndex = e.pageNum,
      util = e.isDone,
      o = e.goodsId;
    util
      ? wx.showToast({
          title: "数据已全部加载完毕",
          icon: "none",
        })
      : (ServicesIndex++,
        this.setData({
          pageNum: ServicesIndex,
        }),
        this.colorCardReceiveDetail(o));
  },
  onShareAppMessage: function () {},
});
