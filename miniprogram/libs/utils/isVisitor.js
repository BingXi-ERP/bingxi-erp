(Object.defineProperty(exports, "__esModule", {
  value: !0,
}),
  (exports.default = void 0));
var classCallCheck = require("../../@babel/runtime/helpers/classCallCheck"),
  createClass = require("../../@babel/runtime/helpers/createClass"),
  app = getApp(),
  n = (function () {
    return createClass(
      function t() {
        classCallCheck(this, t);
      },
      [
        {
          key: "isVisitor",
          value: function () {
            (app.userAuthList, app.globalData.userInfo.type);
            return new Promise(function (e, t) {
              wx.getStorageSync("token")
                ? e()
                : wx.showModal({
                    title: "登录提示",
                    confirmText: "登录",
                    content: "此功能需登录后使用，是否立即前往登录？",
                    success: function (e) {
                      e.confirm &&
                        wx.navigateTo({
                          url: "/pages/register/login/login",
                        });
                    },
                    fail: function () {
                      t();
                    },
                  });
            });
          },
        },
      ],
    );
  })();
exports.default = new n();
