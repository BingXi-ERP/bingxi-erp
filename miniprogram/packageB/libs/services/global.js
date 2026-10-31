var request = require("./request.js").request,
  app = getApp();
module.exports = {
  saveFormId: function () {
    return "".concat(app.config.bingxiHost, "/app-api/pubMsg/saveFormId");
  },
  saveFormIds: function (t) {
    var r;
    wx.login({
      success: function (s) {
        r = s.code;
        var n = Object.assign({}, t, {
          code: r,
        });
        return request.POST("".concat(app.config.bingxiHost, "/app-api/pubMsg/saveFormIds"), n, {
          headers: {
            Authorization: wx.getStorageSync("token"),
            terminalSource: 6,
            "Content-Type": "application/json",
          },
        });
      },
    });
  },
  getAddressIdList: function (t) {
    return request.POST("".concat(app.config.bingxiHost, "/app-api/shopArea/getAddressIdList"), t, {
      headers: {
        "content-type": "application/x-www-form-urlencoded",
      },
    });
  },
};
