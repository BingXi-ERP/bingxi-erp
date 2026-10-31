var createClass = require("../../@babel/runtime/helpers/createClass"),
  classCallCheck = require("../../@babel/runtime/helpers/classCallCheck"),
  util = require("../utils/util"),
  app = getApp(),
  request = require("./request.js").request,
  u = createClass(function e(u) {
    (classCallCheck(this, e),
      (this.setUserHandleLog = function (e, r) {
        return request.PUT(
          ""
            .concat(app.config.bingxiHost, "/app-api/shopBuryingPoint/pushOne/")
            .concat(e, "?")
            .concat(r ? util.utils.serialize(r) : ""),
        );
      }));
  });
module.exports = {
  servicesUserLog: new u(),
};
