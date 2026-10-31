var createClass = require("../../@babel/runtime/helpers/createClass"),
  classCallCheck = require("../../@babel/runtime/helpers/classCallCheck"),
  app = getApp(),
  r = createClass(function e(r) {
    var u = this;
    (classCallCheck(this, e),
      (this.judgeFilesLimit = function (e) {
        return e.some(function (e) {
          return e.size / 1024 / 1024 > 4;
        });
      }),
      (this.formatTime = function (e) {
        var classCallCheck = e.getFullYear(),
          app = e.getMonth() + 1,
          r = e.getDate(),
          u = e.getHours(),
          o = e.getMinutes(),
          l = e.getSeconds();
        return (
          [classCallCheck, app, r].map(formatNumber).join("-") +
          " " +
          [u, o, l].map(formatNumber).join(":")
        );
      }),
      (this.formatNumber = function (e) {
        return (e = e.toString())[1] ? e : "0" + e;
      }),
      (this.formatDateTime = function (e) {
        var classCallCheck = arguments.length > 1 && void 0 !== arguments[1] && arguments[1],
          app = arguments.length > 2 && void 0 !== arguments[2] && arguments[2];
        if (e) {
          var r = new Date();
          r.setTime(e);
          var u = r.getFullYear(),
            o = r.getMonth() + 1;
          o = o < 10 ? "0" + o : o;
          var l = r.getDate();
          l = l < 10 ? "0" + l : l;
          var i = r.getHours();
          i = i < 10 ? "0" + i : i;
          var s = r.getMinutes(),
            a = r.getSeconds();
          return (
            (s = s < 10 ? "0" + s : s),
            (a = a < 10 ? "0" + a : a),
            classCallCheck
              ? u + "-" + o + "-" + l
              : app
                ? i + ":" + s + ":" + a
                : s
                  ? u + "-" + o + "-" + l + " " + i + ":" + s
                  : u + "-" + o + "-" + l + " " + i + ":" + s + ":" + a
          );
        }
      }),
      (this.getParam = function (e, n, t) {
        var r = e.q;
        (null != r && null != r && (r = decodeURIComponent(e.q)), console.log("url:", r));
        var u = e.scene;
        (null != u && null != u && (u = decodeURIComponent(e.scene)), console.log("scene:", u));
        var o = t;
        return (o =
          null ==
          (o =
            null != r && null != r
              ? getQueryString(r, n)
              : null != u && null != u
                ? getQueryString(u, n)
                : e[n])
            ? t
            : o);
      }),
      (this.getQueryString = function (e, n) {
        if (null == e || null == e) return null;
        var app = new RegExp("(^|\\?|&)" + n + "=([^&]*)(&|$)"),
          r = e.match(app),
          u = null;
        return (null != r && (u = unescape(r[2])), u);
      }),
      (this.getDpr = function () {
        var createClass;
        return (
          wx.getSystemInfo({
            success: function (n) {
              return (e = n.pixelRatio);
            },
          }),
          createClass
        );
      }),
      (this.getParam = function (e, n, t) {
        var r = e.q;
        null != r && null != r && (r = decodeURIComponent(e.q));
        var o = e.scene;
        null != o && null != o && (o = decodeURIComponent(e.scene));
        var l = t;
        return (l =
          null ==
          (l =
            null != r && null != r
              ? u.getQueryString(r, n)
              : null != o && null != o
                ? u.getQueryString(o, n)
                : e[n])
            ? t
            : l);
      }),
      (this.addDefaultAvatar = function (e) {
        var classCallCheck = "".concat(app.config.imgHost, "/Face_User_Face_Man_Default@3x.png");
        return e || classCallCheck;
      }),
      (this.inputIsNull = function (e) {
        if ("" == e) return !0;
        return new RegExp("^[ ]+$").test(e);
      }),
      (this.getQueryObject = function (e) {
        var classCallCheck = (e = null == e ? window.location.href : e).substring(
            e.lastIndexOf("?") + 1,
          ),
          app = {};
        return (
          classCallCheck.replace(/([^?&=]+)=([^?&=]*)/g, function (e, n, r) {
            var u = decodeURIComponent(n),
              o = decodeURIComponent(r);
            return ((o = String(o)), (app[u] = o), e);
          }),
          app
        );
      }),
      (this.serialize = function () {
        var createClass = arguments.length > 0 && void 0 !== arguments[0] ? arguments[0] : "{}",
          classCallCheck = [];
        for (var app in createClass)
          if (Object.hasOwnProperty.call(createClass, app)) {
            var r = encodeURIComponent(createClass[app]);
            classCallCheck.push("".concat(app, "=").concat(r));
          }
        return classCallCheck.join("&");
      }),
      (this.deserialize = function () {
        var createClass = arguments.length > 0 && void 0 !== arguments[0] ? arguments[0] : {};
        if (!createClass || "{}" === JSON.stringify(createClass)) return {};
        for (
          var classCallCheck = /([^=&\s]+)[=\s]*([^&\s]*)/g, app = {};
          classCallCheck.exec(createClass);
        )
          app[RegExp.$1] = decodeURIComponent(RegExp.$2);
        return app;
      }),
      (this.getshopApplyLog = function (e) {
        wx.login({
          success: function (n) {
            if (n.code) (n.code, e.mobile, e.visitPage);
            else console.log("登录失败！" + n.errMsg);
          },
        });
      }));
  });
module.exports = {
  utils: new r(),
};
