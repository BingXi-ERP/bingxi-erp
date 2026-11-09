var createClass = require("../../@babel/runtime/helpers/createClass"),
  classCallCheck = require("../../@babel/runtime/helpers/classCallCheck"),
  app = getApp(),
  request = require("./request.js").request,
  t = createClass(function e(t) {
    (classCallCheck(this, e),
      (this.releaseCargoPassList = function (e) {
        return request.POST("".concat(app.config.bingxiHost, "/app-api/releaseCargoPass/list"), e);
      }),
      (this.notPlatformList = function (e) {
        return request.POST(
          "".concat(app.config.bingxiHost, "/app-api/releaseCargoPass/notPlatformList"),
          e,
        );
      }),
      (this.releaseCargoPassAdd = function (e) {
        return request.POST("".concat(app.config.bingxiHost, "/app-api/releaseCargoPass/add"), e);
      }),
      (this.releaseCargoPassSuspend = function (e) {
        return request.POST("".concat(app.config.bingxiHost, "/app-api/releaseCargoPass/suspend"), e);
      }),
      (this.releaseCargoPassRestart = function (e) {
        return request.POST("".concat(app.config.bingxiHost, "/app-api/releaseCargoPass/restart"), e);
      }),
      (this.releaseCargoPassRevoke = function (e) {
        return request.POST("".concat(app.config.bingxiHost, "/app-api/releaseCargoPass/revoke"), e);
      }));
  });
module.exports = {
  servicesCargoPass: new t(),
};
