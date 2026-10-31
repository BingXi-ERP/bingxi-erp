var createClass = require("../../@babel/runtime/helpers/createClass"),
  classCallCheck = require("../../@babel/runtime/helpers/classCallCheck"),
  app = getApp(),
  request = require("./request.js").request,
  i = createClass(function e(i) {
    (classCallCheck(this, e),
      (this.setUserHandleLog = function (e) {
        return request.PUT(
          "".concat(app.config.bingxiHost, "/app-api/shopBuryingPoint/pushOne/").concat(e),
        );
      }));
  });
module.exports = {
  servicesUserLog: new i(),
};
