var createClass = require("../../@babel/runtime/helpers/createClass"),
  classCallCheck = require("../../@babel/runtime/helpers/classCallCheck"),
  app = getApp(),
  r = createClass(function e(r) {
    var i = this;
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
          i = e.getHours(),
          u = e.getMinutes(),
          o = e.getSeconds();
        return (
          [classCallCheck, app, r].map(formatNumber).join("-") +
          " " +
          [i, u, o].map(formatNumber).join(":")
        );
      }),
      (this.formatNumber = function (e) {
        return (e = e.toString())[1] ? e : "0" + e;
      }),
      (this.formatDateTime = function (e) {
        var classCallCheck = arguments.length > 1 && void 0 !== arguments[1] && arguments[1],
          app = arguments.length > 2 && void 0 !== arguments[2] && arguments[2],
          r = new Date();
        r.setTime(e);
        var i = r.getFullYear(),
          u = r.getMonth() + 1;
        u = u < 10 ? "0" + u : u;
        var o = r.getDate();
        o = o < 10 ? "0" + o : o;
        var l = r.getHours();
        l = l < 10 ? "0" + l : l;
        var s = r.getMinutes(),
          a = r.getSeconds();
        return (
          (s = s < 10 ? "0" + s : s),
          (a = a < 10 ? "0" + a : a),
          classCallCheck
            ? i + "-" + u + "-" + o
            : app
              ? l + ":" + s + ":" + a
              : i + "-" + u + "-" + o + " " + l + ":" + s + ":" + a
        );
      }),
      (this.getQueryString = function (e, t) {
        if (null == e || null == e) return null;
        var app = new RegExp("(^|\\?|&)" + t + "=([^&]*)(&|$)"),
          r = e.match(app),
          i = null;
        return (null != r && (i = unescape(r[2])), i);
      }),
      (this.getDpr = function () {
        var createClass;
        return (
          wx.getSystemInfo({
            success: function (t) {
              return (e = t.pixelRatio);
            },
          }),
          createClass
        );
      }),
      (this.getParam = function (e, t, n) {
        var r = e.q;
        null != r && null != r && (r = decodeURIComponent(e.q));
        var u = e.scene;
        null != u && null != u && (u = decodeURIComponent(e.scene));
        var o = n;
        return (o =
          null ==
          (o =
            null != r && null != r
              ? i.getQueryString(r, t)
              : null != u && null != u
                ? i.getQueryString(u, t)
                : e[t])
            ? n
            : o);
      }),
      (this.addDefaultAvatar = function (e) {
        var classCallCheck = "".concat(app.config.imgHost, "/Face_User_Face_Man_Default@3x.png");
        return "" == e || null == e ? classCallCheck : e;
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
          classCallCheck.replace(/([^?&=]+)=([^?&=]*)/g, function (e, t, r) {
            var i = decodeURIComponent(t),
              u = decodeURIComponent(r);
            return ((u = String(u)), (app[i] = u), e);
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
          success: function (t) {
            if (t.code) (t.code, e.mobile, e.visitPage);
            else console.log("登录失败！" + t.errMsg);
          },
        });
      }));
  });
module.exports = {
  utils: new r(),
};
