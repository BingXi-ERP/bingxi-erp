require("../../../@babel/runtime/helpers/Arrayincludes");
var createClass = require("../../../@babel/runtime/helpers/createClass"),
  classCallCheck = require("../../../@babel/runtime/helpers/classCallCheck"),
  app = getApp(),
  r = createClass(function e(r) {
    var o = this;
    (classCallCheck(this, e),
      (this.formatTime = function (e) {
        var classCallCheck = e.getFullYear(),
          app = e.getMonth() + 1,
          r = e.getDate(),
          o = e.getHours(),
          i = e.getMinutes(),
          s = e.getSeconds();
        return (
          [classCallCheck, app, r].map(formatNumber).join("-") +
          " " +
          [o, i, s].map(formatNumber).join(":")
        );
      }),
      (this.replImage = function (e, t) {
        if (!e) return "";
        var r = new RegExp("^http(s)?://");
        (e.includes("?x-oss-process") && (e = e.split("?x-oss-process")[0]),
          e.includes("http:") && (e = e.replace("http:", "https:")));
        var o = t ? "?x-oss-process=image/resize,m_fill,h_" + t + ",w_" + t : "";
        return e && r.test(e)
          ? e + o
          : app.config.imgOssHost + "".concat(e.startsWith("/") ? e.substr(1) : e) + o;
      }),
      (this.rounded = function (e, t) {
        e = Number(e);
        var app = Math.pow(10, t);
        return Math.round(e * app) / app;
      }),
      (this.formatNumber = function (e) {
        return (e = e.toString())[1] ? e : "0" + e;
      }),
      (this.formatDateTime = function (e) {
        var classCallCheck = arguments.length > 1 && void 0 !== arguments[1] && arguments[1],
          app = new Date();
        app.setTime(e);
        var r = app.getFullYear(),
          o = app.getMonth() + 1;
        o = o < 10 ? "0" + o : o;
        var i = app.getDate();
        i = i < 10 ? "0" + i : i;
        var s = app.getHours();
        s = s < 10 ? "0" + s : s;
        var u = app.getMinutes(),
          l = app.getSeconds();
        return (
          (u = u < 10 ? "0" + u : u),
          (l = l < 10 ? "0" + l : l),
          classCallCheck
            ? r + "-" + o + "-" + i
            : r + "-" + o + "-" + i + " " + s + ":" + u + ":" + l
        );
      }),
      (this.getParam = function (e, t, n) {
        var r = e.q;
        (r && (r = decodeURIComponent(e.q)), console.log("url:", r));
        var i = e.scene;
        (null != i && null != i && (i = decodeURIComponent(e.scene)), console.log("scene:", i));
        var s = n || "";
        return (
          (s =
            null ==
            (s =
              null != r && null != r
                ? o.getQueryString(r, t)
                : null != i && null != i
                  ? o.getQueryString(i, t)
                  : e[t])
              ? n
              : s),
          console.log("result", s),
          s
        );
      }),
      (this.getParam2 = function (e) {
        var classCallCheck = e.q,
          app = {};
        return (
          classCallCheck &&
            ((t = decodeURIComponent(e.q)), (n = o.getQueryString2(classCallCheck))),
          app
        );
      }),
      (this.getQueryString2 = function (e) {
        for (
          var classCallCheck = e.substr(e.indexOf("?") + 1).split("&"), app = {}, r = 0;
          r < classCallCheck.length;
          r++
        ) {
          var o = classCallCheck[r].split("=");
          app[o[0]] = o[1];
        }
        return app;
      }),
      (this.getQueryString = function (e, t) {
        if (null == e || null == e) return null;
        var app = new RegExp("(^|\\?|&)" + t + "=([^&]*)(&|$)"),
          r = e.match(app),
          o = null;
        return (null != r && (o = unescape(r[2])), o);
      }),
      (this.formatUrlQuery = function (e) {
        for (var classCallCheck in e)
          ("null" !== e[classCallCheck] && "undefined" !== e[classCallCheck]) ||
            (e[classCallCheck] = "");
        return e;
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
            var o = decodeURIComponent(t),
              i = decodeURIComponent(r);
            return ((i = String(i)), (app[o] = i), e);
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
      (this.getResList = function (e) {
        for (var classCallCheck = {}, app = 0; app < e.length; app++) classCallCheck[e[app]] = !0;
        return classCallCheck;
      }),
      (this.getshopApplyLog = function (e) {
        wx.login({
          success: function (t) {
            if (t.code) {
              var app = {
                code: t.code,
                mobile: e.mobile,
                visitPage: e.visitPage,
              };
              servicesShop.shopApplyLog(app).then(function (e) {
                0 === e.code ||
                  wx.showToast({
                    title: JSON.parse(e.msg).message,
                    icon: "none",
                  });
              });
            } else console.log("登录失败！" + t.errMsg);
          },
        });
      }));
  });
module.exports = {
  utils: new r(),
};
