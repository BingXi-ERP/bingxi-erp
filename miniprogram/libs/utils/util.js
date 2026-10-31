require("../../@babel/runtime/helpers/Arrayincludes");
var classCallCheck = require("../../@babel/runtime/helpers/classCallCheck"),
  createClass = require("../../@babel/runtime/helpers/createClass"),
  app = getApp(),
  n = (function () {
    return createClass(
      function t(n) {
        var s = this;
        (classCallCheck(this, t),
          (this.formatTime = function (e) {
            var createClass = e.getFullYear(),
              app = e.getMonth() + 1,
              n = e.getDate(),
              s = e.getHours(),
              o = e.getMinutes(),
              u = e.getSeconds();
            return (
              [createClass, app, n].map(formatNumber).join("-") +
              " " +
              [s, o, u].map(formatNumber).join(":")
            );
          }),
          (this.parsePhone = function (e) {
            return e.substr(0, 3) + "****" + e.substr(7);
          }),
          (this.formatNumber = function (e) {
            return (e = e.toString())[1] ? e : "0" + e;
          }),
          (this.formatDateTime = function (e) {
            var createClass = arguments.length > 1 && void 0 !== arguments[1] && arguments[1],
              app = new Date();
            app.setTime(e);
            var n = app.getFullYear(),
              s = app.getMonth() + 1;
            s = s < 10 ? "0" + s : s;
            var o = app.getDate();
            o = o < 10 ? "0" + o : o;
            var u = app.getHours();
            u = u < 10 ? "0" + u : u;
            var i = app.getMinutes(),
              a = app.getSeconds();
            return (
              (i = i < 10 ? "0" + i : i),
              (a = a < 10 ? "0" + a : a),
              createClass
                ? n + "-" + s + "-" + o
                : n + "-" + s + "-" + o + " " + u + ":" + i + ":" + a
            );
          }),
          (this.getQueryString = function (e, t) {
            if (null == e || null == e) return null;
            var app = new RegExp("(^|\\?|&)" + t + "=([^&]*)(&|$)"),
              n = e.match(app),
              s = null;
            return (null != n && (s = unescape(n[2])), s);
          }),
          (this.getDpr = function () {
            var classCallCheck;
            return (
              wx.getSystemInfo({
                success: function (t) {
                  return (e = t.pixelRatio);
                },
              }),
              classCallCheck
            );
          }),
          (this.getParam = function (e, t, r) {
            var n = e.q;
            null != n && null != n && (n = decodeURIComponent(e.q));
            var o = e.scene;
            null != o && null != o && (o = decodeURIComponent(e.scene));
            var u = r || "";
            return (u =
              null ==
              (u =
                null != n && null != n
                  ? s.getQueryString(n, t)
                  : null != o && null != o
                    ? s.getQueryString(o, t)
                    : e[t])
                ? r
                : u);
          }),
          (this.formatUrlQuery = function (e) {
            for (var createClass in e)
              ("null" !== e[createClass] && "undefined" !== e[createClass]) ||
                (e[createClass] = "");
            return e;
          }),
          (this.addDefaultAvatar = function (e) {
            var createClass = "".concat(app.config.imgHost, "/Face_User_Face_Man_Default@3x.png");
            return "" == e || null == e ? createClass : e;
          }),
          (this.replImage = function (e, t) {
            if (!e) return "";
            var n = new RegExp("^http(s)?://");
            (e.includes("?x-oss-process") && (e = e.split("?x-oss-process")[0]),
              e.includes("http:") && (e = e.replace("http:", "https:")));
            var s = t ? "?x-oss-process=image/resize,m_fill,h_" + t + ",w_" + t : "";
            return e && n.test(e)
              ? e + s
              : app.config.imgOssHost + "".concat(e.startsWith("/") ? e.substr(1) : e) + s;
          }),
          (this.moveImageOssSize = function (e) {
            return e ? (e.includes("?x-oss-process") && (e = e.split("?x-oss-process")[0]), e) : "";
          }),
          (this.replImageRote = function (e, t) {
            if (!e) return "";
            var n = new RegExp("^http(s)?://");
            e.includes("?x-oss-process") && (e = e.split("?x-oss-process")[0]);
            var s = t ? "x-oss-process=image/rotate,0" + t + ",w_" + t : "";
            return e && n.test(e)
              ? e + s + "?x-oss-process=image/rotate,0"
              : app.config.imgOssHost +
                  "".concat(e.startsWith("/") ? e.substr(1) : e) +
                  s +
                  "?x-oss-process=image/rotate,0";
          }),
          (this.judgeFilesLimit = function (e) {
            return e.some(function (e) {
              return e.size / 1024 / 1024 > 4;
            });
          }),
          (this.getResList = function (e) {
            // 原实现把 permissions 清单按精确键铺成 map，admin 的 `*:*` 通配与
            // read/view、update/edit 等价一概不认，且视图消费的厂商入口键
            // （order:saveBilling 等）根本不在后端词表里，等于门形同虚设。
            // 现在唯一判据走 libs/utils/perm.js（与 Web router hasRoutePermission
            // 及后端 matches_permission 同源），入口键在 permEntries.js 单点登记。
            return require("./perm.js").buildAuthMap(Array.isArray(e) ? e : []);
          }),
          (this.inputIsNull = function (e) {
            if ("" == e) return !0;
            return new RegExp("^[ ]+$").test(e);
          }),
          (this.getQueryObject = function (e) {
            var createClass = (e = null == e ? window.location.href : e).substring(
                e.lastIndexOf("?") + 1,
              ),
              app = {};
            return (
              createClass.replace(/([^?&=]+)=([^?&=]*)/g, function (e, t, n) {
                var s = decodeURIComponent(t),
                  o = decodeURIComponent(n);
                return ((o = String(o)), (app[s] = o), e);
              }),
              app
            );
          }),
          (this.serialize = function () {
            var classCallCheck =
                arguments.length > 0 && void 0 !== arguments[0] ? arguments[0] : "{}",
              createClass = [];
            for (var app in classCallCheck)
              if (Object.hasOwnProperty.call(classCallCheck, app)) {
                var n = encodeURIComponent(classCallCheck[app]);
                createClass.push("".concat(app, "=").concat(n));
              }
            return createClass.join("&");
          }),
          (this.rounded = function (e, t) {
            e = Number(e);
            var app = Math.pow(10, t);
            return Math.round(e * app) / app;
          }),
          (this.deserialize = function () {
            var classCallCheck =
              arguments.length > 0 && void 0 !== arguments[0] ? arguments[0] : {};
            if (!classCallCheck || "{}" === JSON.stringify(classCallCheck)) return {};
            for (
              var createClass = /([^=&\s]+)[=\s]*([^&\s]*)/g, app = {};
              createClass.exec(classCallCheck);
            )
              app[RegExp.$1] = decodeURIComponent(RegExp.$2);
            return app;
          }),
          (this.getshopApplyLog = function (e) {
            wx.login({
              success: function (t) {
                if (t.code) (t.code, e.mobile, e.visitPage);
                else console.log("登录失败！" + t.errMsg);
              },
            });
          }));
      },
      [
        {
          key: "getNow",
          value: function (e) {
            var createClass = new Date(),
              app = createClass.getFullYear(),
              n = createClass.getMonth() + 1;
            n = n < 10 ? "0" + n : n;
            var s = createClass.getDate();
            s = s < 10 ? "0" + s : s;
            var o = createClass.getHours();
            o = o < 10 ? "0" + o : o;
            var u = createClass.getMinutes();
            u = u < 10 ? "0" + u : u;
            var i = createClass.getSeconds();
            return app + "-" + n + "-" + s + " " + o + ":" + u + ":" + (i = i < 10 ? "0" + i : i);
          },
        },
        {
          key: "getNowDate",
          value: function () {
            var classCallCheck = new Date(),
              createClass = classCallCheck.getFullYear(),
              app = classCallCheck.getMonth() + 1;
            r = app < 10 ? "0" + app : app;
            var n = classCallCheck.getDate();
            return createClass + "-" + app + "-" + (n = n < 10 ? "0" + n : n);
          },
        },
        {
          key: "getLast",
          value: function () {
            ((e = (e = new Date()).getTime()), (e -= 2592e5));
            var classCallCheck,
              createClass = (e = new Date(classCallCheck)).getFullYear(),
              app = classCallCheck.getMonth() + 1;
            r = app < 10 ? "0" + app : app;
            var n = classCallCheck.getDate();
            n = n < 10 ? "0" + n : n;
            var s = classCallCheck.getHours();
            s = s < 10 ? "0" + s : s;
            var o = classCallCheck.getMinutes();
            o = o < 10 ? "0" + o : o;
            var u = classCallCheck.getSeconds();
            return (
              createClass +
              "-" +
              app +
              "-" +
              n +
              " " +
              s +
              ":" +
              o +
              ":" +
              (u = u < 10 ? "0" + u : u)
            );
          },
        },
      ],
    );
  })();
module.exports = {
  utils: new n(),
};
