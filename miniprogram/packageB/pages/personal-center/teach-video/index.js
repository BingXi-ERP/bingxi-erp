var ServicesTouch = require("../../../libs/services/ServicesTouch"),
  app = getApp();
Page({
  data: {
    params: {
      page: 1,
      size: 20,
      totalPage: 0,
      type: 2,
    },
    noDataBg: "".concat(app.config.imgHost, "/img/customer/duibuIcon/dz@2x.png"),
    touchList: [],
    showVideo: !1,
    viewVideoSrc: "",
  },
  onCloseOverlay: function () {
    this.setData({
      showVideo: !1,
    });
  },
  onViewTeachVideo: function (t) {
    var a = t.currentTarget.dataset.src;
    ((a = app.config.imgOssHost + a),
      this.setData({
        showVideo: !0,
        viewVideoSrc: a,
      }));
  },
  getTouchList: function () {
    var a = this,
      e = this.data.params,
      i = e.page,
      n = e.totalPage;
    ++i > n && 0 !== n
      ? (i = n)
      : (wx.showLoading({
          title: "拼命加载中...",
        }),
        ServicesTouch.ServicesTouch.getTouch(this.data.params)
          .then(function (t) {
            0 === t.code &&
              ((t.data.content || []).forEach(function (t) {
                t.imagePath = t.imagePath ? app.config.imgOssHost + t.imagePath : "";
              }),
              a.setData({
                page: i,
                touchList: t.data.content || [],
                "formInline.totalPage": t.data.totalPage,
              }));
            wx.hideLoading();
          })
          .catch(function () {
            wx.hideLoading();
          }));
  },
  onScrollLower: function () {
    this.getTouchList();
  },
  onLoad: function (t) {
    this.getTouchList();
  },
  onReady: function () {},
  onShow: function () {},
  onHide: function () {},
  onUnload: function () {},
  onPullDownRefresh: function () {},
  onReachBottom: function () {},
  onShareAppMessage: function () {},
});
