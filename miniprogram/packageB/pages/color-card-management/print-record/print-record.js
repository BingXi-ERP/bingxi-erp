var t = require("../../../../@babel/runtime/helpers/interopRequireDefault").default,
  e = require("../../../../@babel/runtime/helpers/defineProperty"),
  ServicesPrint = require("../../../../libs/services/ServicesPrint"),
  app = getApp();
Page({
  data: {
    globalApp: {},
    moreIcon: !1,
    recordList: [],
    nowPageNum: 1,
    searchKey: "",
    noDataBg: "/assets/icons/img_wuxinx@3x.png",
    rightArrow: "/assets/icons/ic_jinru.png",
  },
  onLoad: function (t) {
    (this.setData({
        globalApp: app,
      }),
      this.recordList());
  },
  recordList: function () {
    var t = this,
      e = arguments.length > 0 && void 0 !== arguments[0] && arguments[0],
      mpValue = this,
      app = {
        keyword: this.data.searchKey,
        page: this.data.nowPageNum,
        size: 10,
      };
    (wx.showLoading(),
      (0, ServicesPrint.logList)(app).then(function (o) {
        0 === o.code
          ? (t.data.nowPageNum === o.data.totalPage ? t._closeMore() : t._showMore(),
            e
              ? (o.data.content.forEach(function (t) {
                  mpValue.data.recordList.push(t);
                }),
                t.setData({
                  recordList: mpValue.data.recordList,
                }))
              : ((t.data.recordList = o.data.content),
                t.setData({
                  recordList: o.data.content,
                })))
          : wx.showToast({
              title: o.msg,
              icon: "none",
            });
      }),
      wx.hideLoading());
  },
  searchList: function () {
    (this.setData({
      nowPageNum: 1,
    }),
      this.recordList());
  },
  inputgetName: function (t) {
    this.setData({
      [t.currentTarget.dataset.name]: t.detail.value,
    });
  },
  toDetail: function (t) {
    var e = JSON.stringify(t.currentTarget.dataset.item);
    wx.navigateTo({
      url: "/packageB/pages/color-card-management/print-record-detail/print-record-detail?item=".concat(e),
    });
  },
  _showMore: function () {
    this.setData({
      moreIcon: !0,
    });
  },
  _closeMore: function () {
    this.setData({
      moreIcon: !1,
    });
  },
  onReady: function () {},
  onShow: function () {},
  onHide: function () {},
  onUnload: function () {},
  onPullDownRefresh: function () {},
  onReachBottom: function () {
    (this.setData({
      nowPageNum: this.data.nowPageNum + 1,
    }),
      this.recordList(!0));
  },
  onShareAppMessage: function () {},
});
