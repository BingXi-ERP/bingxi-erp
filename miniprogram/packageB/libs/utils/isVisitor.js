(Object.defineProperty(exports, "__esModule", {
  value: !0,
}),
  (exports.default = void 0));
var classCallCheck = require("../../../@babel/runtime/helpers/classCallCheck"),
  createClass = require("../../../@babel/runtime/helpers/createClass"),
  app = getApp(),
  i = (function () {
    return createClass(
      function r() {
        classCallCheck(this, r);
      },
      [
        {
          key: "isVisitor",
          value: function () {
            app.userAuthList;
            var classCallCheck = app.globalData.userInfo.type;
            return new Promise(function (r, t) {
              5 === classCallCheck
                ? wx.navigateTo({
                    url: "../../../pages/register/login/login",
                  })
                : r();
            });
          },
        },
      ],
    );
  })();
exports.default = new i();
