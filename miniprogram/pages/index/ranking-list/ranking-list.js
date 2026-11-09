var t = (0, require("../../../@babel/runtime/helpers/interopRequireDefault").default)(
    require("../../../utils/mta_analysis.js"),
  ),
  ServicesIndex = require("../../../libs/services/ServicesIndex.js").ServicesIndex,
  app = getApp();
Page({
  data: {
    pageNum: 1,
    shopId: null,
    userId: null,
    colorCardReceiveList: [],
    listUpDowm: 0,
    defBg: "".concat(app.config.imgHost, "/img/customer/duibuIcon/no_img.png"),
    noDataBg: "".concat(app.config.imgHost, "/img/customer/img_wuxinx@3x.png"),
    colorCardOrder: {
      up: "../../../assets/images/icon2nd/ic_shangxuan01@2x.png",
      dowm: "../../../assets/images/icon2nd/ic_xiaxuan01@2x.png",
    },
    globalApp: {},
  },
  toDetail: function (t) {
    var ServicesIndex = t.currentTarget.dataset.goodsid;
    wx.navigateTo({
      url: "/pages/index/ranking-list/ranking-list-detail/ranking-list-detail?goodsId=".concat(
        ServicesIndex,
      ),
    });
  },
  onLoad: function (a) {
    (t.default.Page.init(),
      this.setData({
        globalApp: app,
        shopId: a.shopId,
        userId: a.userId,
      }),
      console.log(a),
      wx.hideShareMenu(),
      this.ranking(a.shopId));
  },
  ranking: function (t) {
    var app = arguments.length > 1 && void 0 !== arguments[1] && arguments[1],
      i = this,
      n = {
        companyId: this.data.shopId,
        userId: this.data.userId,
        topType: 0,
        size: 20,
        page: this.data.pageNum,
        sort: i.data.listUpDowm,
      };
    (wx.showLoading(),
      ServicesIndex.ranking(n).then(function (t) {
        if ((wx.hideLoading(), 0 === t.code)) {
          var ServicesIndex = t.data.content;
          app
            ? ServicesIndex &&
              ServicesIndex.length > 0 &&
              (ServicesIndex.map(function (t) {
                i.data.colorCardReceiveList.push(t);
              }),
              i.setData({
                colorCardReceiveList: i.data.colorCardReceiveList,
              }))
            : i.setData({
                colorCardReceiveList: ServicesIndex,
              });
        } else
          wx.showToast({
            title: t.msg,
            icon: "none",
          });
      }));
  },
  ListUpDowm: function () {
    (this.setData({
      listUpDowm: 0 == this.data.listUpDowm ? 1 : 0,
      pageNum: 1,
      colorCardReceiveList: [],
    }),
      this.ranking(this.data.shopId));
  },
  onReady: function () {},
  onShow: function () {},
  onHide: function () {},
  onUnload: function () {},
  onPullDownRefresh: function () {},
  onReachBottom: function () {
    (console.log("到底了"),
      this.setData({
        pageNum: this.data.pageNum + 1,
      }),
      this.ranking(this.data.shopId, !0));
  },
  onShareAppMessage: function () {},
});
