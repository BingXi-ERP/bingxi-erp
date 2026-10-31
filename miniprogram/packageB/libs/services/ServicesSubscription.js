var e = require("../../../@babel/runtime/helpers/interopRequireDefault").default,
  createClass = require("../../../@babel/runtime/helpers/createClass"),
  classCallCheck = require("../../../@babel/runtime/helpers/classCallCheck"),
  getWxInfo = e(require("../utils/getWxInfo")),
  app = getApp(),
  request = require("./request.js").request,
  u = createClass(function e(r) {
    (classCallCheck(this, e),
      (this.saveWxOpenId = function () {
        if (!app.globalData.userOpenIdFlag)
          return wx.getStorageSync("wxOpenId")
            ? void (app.globalData.userOpenIdFlag = "1")
            : getWxInfo.default.getWxCode().then(function (e) {
                var createClass = {
                  code: e,
                };
                return request
                  .POST(
                    "".concat(app.config.bingxiHost, "/app-api/wx/maMsg/saveWxOpenId"),
                    createClass,
                  )
                  .then(function (e) {
                    0 === e.code &&
                      e.msg &&
                      "success" == e.msg &&
                      (app.globalData.userOpenIdFlag = "1");
                  });
              });
      }),
      (this.addSubscribeLog = function (e) {
        return request._POST(
          "".concat(app.config.bingxiHost, "/app-api/access/wx/maMsg/addSubscribeLog"),
          e,
        );
      }));
  });
module.exports = {
  ServiceSubscribeLog: new u(),
};
