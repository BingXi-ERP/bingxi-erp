var app = getApp();
Page({
  data: {
    introImage: {
      word: "".concat(app.config.imgHost, "/img/customer/banner_word.png"),
      background: "".concat(app.config.imgHost, "/img/customer/bannerbg.png"),
      wx: "".concat(app.config.imgHost, "/img/customer/bddgzh.png"),
      dy: "".concat(app.config.imgHost, "/img/customer/bdddy.jpg"),
      video: "".concat(app.config.imgHost, "/img/customer/20231220-171043.mp4"),
      apply: "".concat(app.config.imgHost, "/img/customer/banner_apply.png"),
      videoPoster: "".concat(
        app.config.imgHost,
        "/img/customer/20231220-171043.mp4?x-oss-process=video/snapshot,t_1,m_fast",
      ),
    },
  },
  onNavTo: function () {
    wx.navigateToMiniProgram({
      appId: "wxd947200f82267e58",
      path: "pages/wjxqList/wjxqList?activityId=YaB2caM",
    });
  },
  onLoad: function (o) {},
  onReady: function () {},
  onShow: function () {},
  onHide: function () {},
  onUnload: function () {},
  onPullDownRefresh: function () {},
  onReachBottom: function () {},
  onShareAppMessage: function () {},
});
