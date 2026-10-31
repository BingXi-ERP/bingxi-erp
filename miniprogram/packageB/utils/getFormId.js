var createClass = require("../../@babel/runtime/helpers/createClass"),
  classCallCheck = require("../../@babel/runtime/helpers/classCallCheck"),
  app = getApp(),
  r = createClass(function e(r) {
    (classCallCheck(this, e),
      (this.getformId = function (e) {
        var classCallCheck = "".concat(app.config.bingxiHost, "/app-api/pubMsg/saveFormId");
        e &&
          wx.login({
            success: function (o) {
              var r = {
                formId: e,
                code: o.code,
              };
              wx.request({
                url: classCallCheck,
                method: "POST",
                data: r,
                header: {
                  Authorization: wx.getStorageSync("token"),
                  terminalSource: 6,
                  "content-type": "application/x-www-form-urlencoded",
                },
                success: function (e) {},
              });
            },
          });
      }));
  });
module.exports = {
  saveFormId: new r(),
};
