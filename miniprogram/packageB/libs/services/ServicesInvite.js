(Object.defineProperty(exports, "__esModule", {
  value: !0,
}),
  (exports.default = void 0));
var createClass = require("../../../@babel/runtime/helpers/createClass"),
  classCallCheck = require("../../../@babel/runtime/helpers/classCallCheck"),
  request = require("./request"),
  app = getApp(),
  n = createClass(function e(n) {
    (classCallCheck(this, e),
      (this.inviteData = function (e) {
        return request.request.GET("".concat(app.config.bingxiHost, "/app-api/user/invite/data"), e);
      }),
      (this.inviteList = function (e) {
        return request.request.GET(
          "".concat(app.config.bingxiHost, "/app-api/user/invite/data/list"),
          e,
        );
      }),
      (this.inviteImage = function (e) {
        return request.request.GET(
          "".concat(app.config.bingxiHost, "/app-api/user/invite/shareImg"),
          e,
        );
      }),
      (this.inviteCode = function (e) {
        return request.request.GET(
          "".concat(app.config.bingxiHost, "/app-api/user/invite/sendCode"),
          e,
        );
      }),
      (this.checkInviteCode = function (e) {
        return request.request.GET(
          "".concat(app.config.bingxiHost, "/app-api/user/invite/checkCode"),
          e,
        );
      }),
      (this.inviteUserImg = function (e) {
        var classCallCheck = e.userId;
        return request.request.GET(
          ""
            .concat(app.config.bingxiHost, "/app-api/user/invite/getUserHeadImg/")
            .concat(classCallCheck),
        );
      }),
      (this.countInvite = function (e) {
        var classCallCheck = e.type;
        return request.request.GET("".concat(app.config.bingxiHost, "/app-api/loss/operateAccess"), {
          type: classCallCheck,
        });
      }));
  });
exports.default = n = new n();
