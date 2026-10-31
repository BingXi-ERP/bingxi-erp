var request = require("./request.js").request,
  app = getApp();
module.exports = {
  saveFormId: function () {
    return "".concat(app.config.bingxiHost, "/app-api/pubMsg/saveFormId");
  },
  saveFormIds: function (e) {
    var n;
    wx.login({
      success: function (r) {
        n = r.code;
        var a = Object.assign({}, e, {
          code: n,
        });
        return request.POST("".concat(app.config.bingxiHost, "/app-api/pubMsg/saveFormIds"), a, {
          headers: {
            Authorization: wx.getStorageSync("token"),
            terminalSource: 6,
            "Content-Type": "application/json",
          },
        });
      },
    });
  },
  getAddressIdList: function (e) {
    return request.POST("".concat(app.config.bingxiHost, "/app-api/shopArea/getAddressIdList"), e, {
      headers: {
        "content-type": "application/x-www-form-urlencoded",
      },
    });
  },
  getProvince: function () {
    return request.GET("".concat(app.config.bingxiHost, "/app-api/shopArea/province"));
  },
  getCity: function (e) {
    return request.GET("".concat(app.config.bingxiHost, "/app-api/shopArea/city/").concat(e));
  },
  getArea: function (e) {
    return request.GET("".concat(app.config.bingxiHost, "/app-api/shopArea/area/").concat(e));
  },
};
