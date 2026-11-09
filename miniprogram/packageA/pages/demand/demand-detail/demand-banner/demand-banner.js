var app = getApp();
Page({
  data: {
    url: "".concat(app.config.rootHost, "/html/static/goodsAsk/subsidies-rules.html"),
  },
  onLoad: function () {
    wx.hideShareMenu();
  },
});
