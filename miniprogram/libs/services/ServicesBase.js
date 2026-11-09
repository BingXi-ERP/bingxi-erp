var createClass = require("../../@babel/runtime/helpers/createClass"),
  classCallCheck = require("../../@babel/runtime/helpers/classCallCheck"),
  app = getApp(),
  request = require("./request.js").request,
  a = createClass(function e(a) {
    (classCallCheck(this, e),
      (this.upLoadImg = function (e) {
        return request.POST("".concat(app.config.bingxiHost, "/app-api/file/upload"), e);
      }),
      (this.getDictDataByType = function (e) {
        return request.POST("".concat(app.config.bingxiHost, "/app-api/sys/dictData/queryAll"), e);
      }));
  });
module.exports = {
  servicesBase: new a(),
};
