(Object.defineProperty(exports, "__esModule", {
  value: !0,
}),
  (exports.default = void 0),
  require("../../@babel/runtime/helpers/Arrayincludes"));
var classCallCheck = require("../../@babel/runtime/helpers/classCallCheck"),
  createClass = require("../../@babel/runtime/helpers/createClass"),
  o = (require("../services/ServicesSubscription"), getApp()),
  r = (function () {
    return createClass(
      function s() {
        classCallCheck(this, s);
      },
      [
        {
          key: "getWxInfo",
          value: function () {
            return new Promise(function (e, s) {
              wx.getSetting({
                success: function (o) {
                  o.authSetting["scope.userInfo"] &&
                    wx.getUserInfo({
                      success: function (s) {
                        e(s);
                      },
                      fail: function (e) {
                        s(e);
                      },
                    });
                },
              });
            });
          },
        },
        {
          key: "getWxCode",
          value: function () {
            return new Promise(function (e, s) {
              wx.login({
                success: function (r) {
                  r.code ? ((o.globalData.wxCode = r.code), e(r.code)) : s();
                },
              });
            });
          },
        },
        {
          key: "wxSubscription",
          value: function (e) {
            console.log(o.globalData.mobileInfo);
            var createClass = o.globalData.mobileInfo,
              r = {
                templateIdList: e,
                subscribeResultList: [],
                subscribeType: 1,
                errorMsg: "",
                wxVersion: createClass.version,
                mobileModel: createClass.model,
                systemVersion: createClass.system,
              };
            return new Promise(function (s, o) {
              wx.requestSubscribeMessage
                ? wx.requestSubscribeMessage({
                    tmplIds: e,
                    success: function (o) {
                      console.log("======success========");
                      var t = Object.keys(o);
                      (console.log(t),
                        e.forEach(function (e) {
                          t.includes(e)
                            ? (console.log(o[e]), r.subscribeResultList.push(o[e]))
                            : r.subscribeResultList.push("");
                        }),
                        (r.errorMsg = o.errMsg),
                        (r.requestStatus = "1"),
                        console.log(r),
                        s());
                    },
                    fail: function (e) {
                      (console.log("======fail========"),
                        (r.errorMsg = e.errMsg),
                        (r.requestStatus = "2"),
                        console.log(r),
                        s());
                    },
                  })
                : s();
            });
          },
        },
      ],
    );
  })();
exports.default = new r();
