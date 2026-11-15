var t = {
  app_id: "",
  event_id: "",
  api_base: "https://pingtas.qq.com/pingd",
  prefix: "_mta_",
  version: "1.3.6",
  stat_share_app: !1,
  stat_pull_down_fresh: !1,
  stat_reach_bottom: !1,
  stat_param: !0,
};
function a() {
  try {
    var a = "s" + e();
    return (wx.setStorageSync(t.prefix + "ssid", a), a);
  } catch (t) {}
}
function e(t) {
  for (var a = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], e = 10; 1 < e; e--) {
    var n = Math.floor(10 * Math.random()),
      r = a[n];
    ((a[n] = a[e - 1]), (a[e - 1] = r));
  }
  for (e = n = 0; 5 > e; e++) n = 10 * n + a[e];
  return (t || "") + (n + "") + +new Date();
}
function n() {
  try {
    var t = getCurrentPages(),
      a = "/";
    return (0 < t.length && (a = t.pop().__route__), a);
  } catch (t) {
    console.log("get current page path error:" + t);
  }
}
function r() {
  var r,
    o = {
      dm: "wechat.apps.xx",
      url: encodeURIComponent(n() + s(u.Data.pageQuery)),
      pvi: "",
      si: "",
      ty: 0,
    };
  return (
    (o.pvi =
      ((r = (function () {
        try {
          return wx.getStorageSync(t.prefix + "auid");
        } catch (t) {}
      })()) ||
        ((r = (function () {
          try {
            var a = e();
            return (wx.setStorageSync(t.prefix + "auid", a), a);
          } catch (t) {}
        })()),
        (o.ty = 1)),
      r)),
    (o.si = (function () {
      var e = (function () {
        try {
          return wx.getStorageSync(t.prefix + "ssid");
        } catch (t) {}
      })();
      return (e || (e = a()), e);
    })()),
    o
  );
}
function o() {
  var a = (function () {
    var t = wx.getSystemInfoSync();
    return {
      adt: encodeURIComponent(t.model),
      scl: t.pixelRatio,
      scr: t.windowWidth + "x" + t.windowHeight,
      lg: t.language,
      fl: t.version,
      jv: encodeURIComponent(t.system),
      tz: encodeURIComponent(t.platform),
    };
  })();
  return (
    (function (t) {
      wx.getNetworkType({
        success: function (a) {
          t(a.networkType);
        },
      });
    })(function (a) {
      try {
        wx.setStorageSync(t.prefix + "ntdata", a);
      } catch (t) {}
    }),
    (a.ct = wx.getStorageSync(t.prefix + "ntdata") || "4g"),
    a
  );
}
function i() {
  var a,
    e = u.Data.userInfo,
    n = [];
  for (a in e) e.hasOwnProperty(a) && n.push(a + "=" + e[a]);
  return (
    (e = n.join(";")),
    {
      r2: t.app_id,
      r4: "wx",
      ext: "v=" + t.version + (null !== e && "" !== e ? ";ui=" + encodeURIComponent(e) : ""),
    }
  );
}
function s(a) {
  if (!t.stat_param || !a) return "";
  a = (function (a) {
    if (1 > t.ignore_params.length) return a;
    var e,
      n = {};
    for (e in a) 0 <= t.ignore_params.indexOf(e) || (n[e] = a[e]);
    return n;
  })(a);
  var e,
    n = [];
  for (e in a) n.push(e + "=" + a[e]);
  return 0 < n.length ? "?" + n.join("&") : "";
}
var u = {
  App: {
    init: function (e) {
      ("appID" in e && (t.app_id = e.appID),
        "eventID" in e && (t.event_id = e.eventID),
        "statShareApp" in e && (t.stat_share_app = e.statShareApp),
        "statPullDownFresh" in e && (t.stat_pull_down_fresh = e.statPullDownFresh),
        "statReachBottom" in e && (t.stat_reach_bottom = e.statReachBottom),
        "ignoreParams" in e && (t.ignore_params = e.ignoreParams),
        "statParam" in e && (t.stat_param = e.statParam),
        a());
      try {
        "lauchOpts" in e && ((u.Data.lanchInfo = e.lauchOpts), (u.Data.lanchInfo.landing = 1));
      } catch (t) {}
      "autoReport" in e &&
        e.autoReport &&
        (function () {
          var t = Page;
          Page = function (a) {
            var e = a.onLoad;
            ((a.onLoad = function (t) {
              (e && e.call(this, t),
                (u.Data.lastPageQuery = u.Data.pageQuery),
                (u.Data.pageQuery = t),
                (u.Data.lastPageUrl = u.Data.pageUrl),
                (u.Data.pageUrl = n()),
                (u.Data.show = !1),
                u.Page.init());
            }),
              t(a));
          };
        })();
    },
  },
  Page: {
    init: function () {
      var a,
        e = getCurrentPages()[getCurrentPages().length - 1];
      (e.onShow &&
        ((a = e.onShow),
        (e.onShow = function () {
          if (!0 === u.Data.show) {
            var t = u.Data.lastPageQuery;
            ((u.Data.lastPageQuery = u.Data.pageQuery),
              (u.Data.pageQuery = t),
              (u.Data.lastPageUrl = u.Data.pageUrl),
              (u.Data.pageUrl = n()));
          }
          ((u.Data.show = !0),
            setTimeout(function () {
              u.Page.stat();
            }, 500),
            a.apply(this, arguments));
        })),
        t.stat_pull_down_fresh &&
          e.onPullDownRefresh &&
          (function () {
            var a = e.onPullDownRefresh;
            e.onPullDownRefresh = function () {
              (u.Event.stat(t.prefix + "pulldownfresh", {
                url: e.__route__,
              }),
                a.apply(this, arguments));
            };
          })(),
        t.stat_reach_bottom &&
          e.onReachBottom &&
          (function () {
            var a = e.onReachBottom;
            e.onReachBottom = function () {
              (u.Event.stat(t.prefix + "reachbottom", {
                url: e.__route__,
              }),
                a.apply(this, arguments));
            };
          })(),
        t.stat_share_app &&
          e.onShareAppMessage &&
          (function () {
            var a = e.onShareAppMessage;
            e.onShareAppMessage = function () {
              return (
                u.Event.stat(t.prefix + "shareapp", {
                  url: e.__route__,
                }),
                a.apply(this, arguments)
              );
            };
          })());
    },
    multiStat: function (t, a) {
      if (1 == a) u.Page.stat(t);
      else {
        var e = getCurrentPages()[getCurrentPages().length - 1];
        e.onShow &&
          (function () {
            var a = e.onShow;
            e.onShow = function () {
              (u.Page.stat(t), a.call(this, arguments));
            };
          })();
      }
    },
    stat: function (a) {
      if ("" != t.app_id) {
        var e = [],
          n = i();
        if ((a && (n.r2 = a), (a = [r(), n, o()]), u.Data.lanchInfo)) {
          (a.push({
            ht: u.Data.lanchInfo.scene,
          }),
            u.Data.pageQuery &&
              u.Data.pageQuery._mta_ref_id &&
              a.push({
                rarg: u.Data.pageQuery._mta_ref_id,
              }));
          try {
            1 == u.Data.lanchInfo.landing && ((n.ext += ";lp=1"), (u.Data.lanchInfo.landing = 0));
          } catch (t) {}
        }
        (a.push({
          rdm: "/",
          rurl: encodeURIComponent(u.Data.lastPageUrl + s(u.Data.lastPageQuery)),
        }),
          a.push({
            rand: +new Date(),
          }),
          (n = 0));
        for (var p = a.length; n < p; n++)
          for (var c in a[n])
            a[n].hasOwnProperty(c) && e.push(c + "=" + (void 0 === a[n][c] ? "" : a[n][c]));
        wx.request({
          url: t.api_base + "?" + e.join("&").toLowerCase(),
        });
      }
    },
  },
  Event: {
    stat: function (a, e) {
      if ("" != t.event_id) {
        var n = [],
          s = r(),
          u = i();
        ((s.dm = "wxapps.click"), (s.url = a), (u.r2 = t.event_id));
        var p,
          c = void 0 === e ? {} : e,
          l = [];
        for (p in c)
          c.hasOwnProperty(p) && l.push(encodeURIComponent(p) + "=" + encodeURIComponent(c[p]));
        for (
          c = l.join(";"),
            u.r5 = c,
            c = 0,
            u = (s = [
              s,
              u,
              o(),
              {
                rand: +new Date(),
              },
            ]).length;
          c < u;
          c++
        )
          for (var h in s[c])
            s[c].hasOwnProperty(h) && n.push(h + "=" + (void 0 === s[c][h] ? "" : s[c][h]));
        wx.request({
          url: t.api_base + "?" + n.join("&").toLowerCase(),
        });
      }
    },
  },
  Data: {
    userInfo: null,
    lanchInfo: null,
    pageQuery: null,
    lastPageQuery: null,
    pageUrl: "",
    lastPageUrl: "",
    show: !1,
  },
};
module.exports = u;
