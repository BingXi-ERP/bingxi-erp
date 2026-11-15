var createClass = require("../../../@babel/runtime/helpers/createClass"),
  classCallCheck = require("../../../@babel/runtime/helpers/classCallCheck"),
  app = getApp(),
  request = require("./request.js").request,
  i = createClass(function e(i) {
    (classCallCheck(this, e),
      (this.getTouch = function (e) {
        return request.POST("".concat(app.config.bingxiHost, "/app-api/video/pageList"), e);
      }));
  });
module.exports = {
  ServicesTouch: new i(),
};
