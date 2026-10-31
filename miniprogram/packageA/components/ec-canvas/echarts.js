var t,
  typeof_ = require("../../../@babel/runtime/helpers/typeof");
((t = function (t) {
  function n(t, e) {
    ("createCanvas" === t && (Jc = null), (Kc[t] = e));
  }
  function i(t) {
    if (null == t || "object" != typeof_(t)) return t;
    var n = t,
      r = Zc.call(t);
    if ("[object Array]" === r) {
      if (!E(t)) {
        n = [];
        for (var o = 0, a = t.length; o < a; o++) n[o] = i(t[o]);
      }
    } else if (Gc[r]) {
      if (!E(t)) {
        var s = t.constructor;
        if (t.constructor.from) n = s.from(t);
        else for (n = new s(t.length), o = 0, a = t.length; o < a; o++) n[o] = i(t[o]);
      }
    } else if (!Wc[r] && !E(t) && !I(t))
      for (var l in ((n = {}), t)) t.hasOwnProperty(l) && (n[l] = i(t[l]));
    return n;
  }
  function r(t, e, n) {
    if (!b(e) || !b(t)) return n ? i(e) : t;
    for (var o in e)
      if (e.hasOwnProperty(o)) {
        var a = t[o],
          s = e[o];
        !b(s) || !b(a) || x(s) || x(a) || I(s) || I(a) || S(s) || S(a) || E(s) || E(a)
          ? (!n && o in t) || (t[o] = i(e[o]))
          : r(a, s, n);
      }
    return t;
  }
  function o(t, e) {
    for (var n = t[0], i = 1, o = t.length; i < o; i++) n = r(n, t[i], e);
    return n;
  }
  function a(t, e) {
    for (var n in e) e.hasOwnProperty(n) && (t[n] = e[n]);
    return t;
  }
  function s(t, e, n) {
    for (var i in e) e.hasOwnProperty(i) && (n ? null != e[i] : null == t[i]) && (t[i] = e[i]);
    return t;
  }
  function l() {
    return (Jc || (Jc = Qc().getContext("2d")), Jc);
  }
  function h(t, e) {
    if (t) {
      if (t.indexOf) return t.indexOf(e);
      for (var n = 0, i = t.length; n < i; n++) if (t[n] === e) return n;
    }
    return -1;
  }
  function u(t, e) {
    function n() {}
    var i = t.prototype;
    for (var r in ((n.prototype = e.prototype), (t.prototype = new n()), i)) t.prototype[r] = i[r];
    ((t.prototype.constructor = t), (t.superClass = e));
  }
  function c(t, e, n) {
    s((t = "prototype" in t ? t.prototype : t), (e = "prototype" in e ? e.prototype : e), n);
  }
  function d(t) {
    if (t) return "string" != typeof t && "number" == typeof t.length;
  }
  function f(t, e, n) {
    if (t && e)
      if (t.forEach && t.forEach === Xc) t.forEach(e, n);
      else if (t.length === +t.length)
        for (var i = 0, r = t.length; i < r; i++) e.call(n, t[i], i, t);
      else for (var o in t) t.hasOwnProperty(o) && e.call(n, t[o], o, t);
  }
  function p(t, e, n) {
    if (t && e) {
      if (t.map && t.map === qc) return t.map(e, n);
      for (var i = [], r = 0, o = t.length; r < o; r++) i.push(e.call(n, t[r], r, t));
      return i;
    }
  }
  function g(t, e, n, i) {
    if (t && e) {
      if (t.reduce && t.reduce === $c) return t.reduce(e, n, i);
      for (var r = 0, o = t.length; r < o; r++) n = e.call(i, n, t[r], r, t);
      return n;
    }
  }
  function m(t, e, n) {
    if (t && e) {
      if (t.filter && t.filter === Yc) return t.filter(e, n);
      for (var i = [], r = 0, o = t.length; r < o; r++) e.call(n, t[r], r, t) && i.push(t[r]);
      return i;
    }
  }
  function v(t, e) {
    var n = jc.call(arguments, 2);
    return function () {
      return t.apply(e, n.concat(jc.call(arguments)));
    };
  }
  function y(t) {
    var typeof_ = jc.call(arguments, 1);
    return function () {
      return t.apply(this, typeof_.concat(jc.call(arguments)));
    };
  }
  function x(t) {
    return "[object Array]" === Zc.call(t);
  }
  function _(t) {
    return "function" == typeof t;
  }
  function w(t) {
    return "[object String]" === Zc.call(t);
  }
  function b(t) {
    var n = typeof_(t);
    return "function" === n || (!!t && "object" === n);
  }
  function S(t) {
    return !!Wc[Zc.call(t)];
  }
  function M(t) {
    return !!Gc[Zc.call(t)];
  }
  function I(t) {
    return (
      "object" == typeof_(t) &&
      "number" == typeof t.nodeType &&
      "object" == typeof_(t.ownerDocument)
    );
  }
  function T(t) {
    return t != t;
  }
  function A(t) {
    for (var typeof_ = 0, n = arguments.length; typeof_ < n; typeof_++)
      if (null != arguments[typeof_]) return arguments[typeof_];
  }
  function C(t, e) {
    return null != t ? t : e;
  }
  function D(t, e, n) {
    return null != t ? t : null != e ? e : n;
  }
  function k() {
    return Function.call.apply(jc, arguments);
  }
  function P(t) {
    if ("number" == typeof t) return [t, t, t, t];
    var typeof_ = t.length;
    return 2 === typeof_ ? [t[0], t[1], t[0], t[1]] : 3 === typeof_ ? [t[0], t[1], t[2], t[1]] : t;
  }
  function L(t, e) {
    if (!t) throw new Error(e);
  }
  function O(t) {
    return null == t
      ? null
      : "function" == typeof t.trim
        ? t.trim()
        : t.replace(/^[\s\uFEFF\xA0]+|[\s\uFEFF\xA0]+$/g, "");
  }
  function z(t) {
    t[td] = !0;
  }
  function E(t) {
    return t[td];
  }
  function N(t) {
    function e(t, e) {
      n ? i.set(t, e) : i.set(e, t);
    }
    var n = x(t);
    this.data = {};
    var i = this;
    t instanceof N ? t.each(e) : t && f(t, e);
  }
  function R(t) {
    return new N(t);
  }
  function B() {}
  function F(t, e) {
    var n = new nd(2);
    return (null == t && (t = 0), null == e && (e = 0), (n[0] = t), (n[1] = e), n);
  }
  function V(t, e) {
    return ((t[0] = e[0]), (t[1] = e[1]), t);
  }
  function H(t) {
    var typeof_ = new nd(2);
    return ((typeof_[0] = t[0]), (typeof_[1] = t[1]), typeof_);
  }
  function W(t, e, n) {
    return ((t[0] = e[0] + n[0]), (t[1] = e[1] + n[1]), t);
  }
  function G(t, e, n, i) {
    return ((t[0] = e[0] + n[0] * i), (t[1] = e[1] + n[1] * i), t);
  }
  function Z(t, e, n) {
    return ((t[0] = e[0] - n[0]), (t[1] = e[1] - n[1]), t);
  }
  function U(t) {
    return Math.sqrt(X(t));
  }
  function X(t) {
    return t[0] * t[0] + t[1] * t[1];
  }
  function Y(t, e, n) {
    return ((t[0] = e[0] * n), (t[1] = e[1] * n), t);
  }
  function j(t, e) {
    var n = U(e);
    return (0 === n ? ((t[0] = 0), (t[1] = 0)) : ((t[0] = e[0] / n), (t[1] = e[1] / n)), t);
  }
  function q(t, e) {
    return Math.sqrt((t[0] - e[0]) * (t[0] - e[0]) + (t[1] - e[1]) * (t[1] - e[1]));
  }
  function $(t, e) {
    return (t[0] - e[0]) * (t[0] - e[0]) + (t[1] - e[1]) * (t[1] - e[1]);
  }
  function K(t, e, n) {
    var i = e[0],
      r = e[1];
    return ((t[0] = n[0] * i + n[2] * r + n[4]), (t[1] = n[1] * i + n[3] * r + n[5]), t);
  }
  function Q(t, e, n) {
    return ((t[0] = Math.min(e[0], n[0])), (t[1] = Math.min(e[1], n[1])), t);
  }
  function J(t, e, n) {
    return ((t[0] = Math.max(e[0], n[0])), (t[1] = Math.max(e[1], n[1])), t);
  }
  function tt() {
    (this.on("mousedown", this._dragStart, this),
      this.on("mousemove", this._drag, this),
      this.on("mouseup", this._dragEnd, this),
      this.on("globalout", this._dragEnd, this));
  }
  function et(t, e) {
    return {
      target: t,
      topTarget: e && e.topTarget,
    };
  }
  function nt(t, e, n, i, r, o) {
    var a = t._$handlers;
    if (("function" == typeof n && ((r = i), (i = n), (n = null)), !i || !e)) return t;
    ((n = (function (t, e) {
      var n = t._$eventProcessor;
      return (null != e && n && n.normalizeQuery && (e = n.normalizeQuery(e)), e);
    })(t, n)),
      a[e] || (a[e] = []));
    for (var s = 0; s < a[e].length; s++) if (a[e][s].h === i) return t;
    var l = {
        h: i,
        one: o,
        query: n,
        ctx: r || t,
        callAtLast: i.zrEventfulCallAtLast,
      },
      h = a[e].length - 1,
      u = a[e][h];
    return (u && u.callAtLast ? a[e].splice(h, 0, l) : a[e].push(l), t);
  }
  function it(t, e, n, i) {
    return (
      (n = n || {}),
      i || !Hc.canvasSupported
        ? rt(t, e, n)
        : Hc.browser.firefox && null != e.layerX && e.layerX !== e.offsetX
          ? ((n.zrX = e.layerX), (n.zrY = e.layerY))
          : null != e.offsetX
            ? ((n.zrX = e.offsetX), (n.zrY = e.offsetY))
            : rt(t, e, n),
      n
    );
  }
  function rt(t, e, n) {
    var i = (function (t) {
      return t.getBoundingClientRect
        ? t.getBoundingClientRect()
        : {
            left: 0,
            top: 0,
          };
    })(t);
    ((n.zrX = e.clientX - i.left), (n.zrY = e.clientY - i.top));
  }
  function ot(t, e, n) {
    if (null != (e = e || window.event).zrX) return e;
    var i = e.type;
    if (i && i.indexOf("touch") >= 0) {
      var r = "touchend" !== i ? e.targetTouches[0] : e.changedTouches[0];
      r && it(t, r, e, n);
    } else (it(t, e, e, n), (e.zrDelta = e.wheelDelta ? e.wheelDelta / 120 : -(e.detail || 0) / 3));
    var o = e.button;
    return (
      null == e.which &&
        void 0 !== o &&
        cd.test(e.type) &&
        (e.which = 1 & o ? 1 : 2 & o ? 3 : 4 & o ? 2 : 0),
      e
    );
  }
  function at(t, e, n) {
    ud ? t.addEventListener(e, n) : t.attachEvent("on" + e, n);
  }
  function st(t, e, n) {
    ud ? t.removeEventListener(e, n) : t.detachEvent("on" + e, n);
  }
  function lt(t) {
    return 2 === t.which || 3 === t.which;
  }
  function ht(t) {
    var typeof_ = t[1][0] - t[0][0],
      n = t[1][1] - t[0][1];
    return Math.sqrt(typeof_ * typeof_ + n * n);
  }
  function ut(t) {
    dd(this.event);
  }
  function ct() {}
  function dt(t, e, n) {
    if (t[t.rectHover ? "rectContain" : "contain"](e, n)) {
      for (var i, r = t; r;) {
        if (r.clipPath && !r.clipPath.contain(e, n)) return !1;
        (r.silent && (i = !0), (r = r.parent));
      }
      return !i || gd;
    }
    return !1;
  }
  function ft() {
    var t = new yd(6);
    return (pt(t), t);
  }
  function pt(t) {
    return ((t[0] = 1), (t[1] = 0), (t[2] = 0), (t[3] = 1), (t[4] = 0), (t[5] = 0), t);
  }
  function gt(t, e) {
    return (
      (t[0] = e[0]),
      (t[1] = e[1]),
      (t[2] = e[2]),
      (t[3] = e[3]),
      (t[4] = e[4]),
      (t[5] = e[5]),
      t
    );
  }
  function mt(t, e, n) {
    var i = e[0] * n[0] + e[2] * n[1],
      r = e[1] * n[0] + e[3] * n[1],
      o = e[0] * n[2] + e[2] * n[3],
      a = e[1] * n[2] + e[3] * n[3],
      s = e[0] * n[4] + e[2] * n[5] + e[4],
      l = e[1] * n[4] + e[3] * n[5] + e[5];
    return ((t[0] = i), (t[1] = r), (t[2] = o), (t[3] = a), (t[4] = s), (t[5] = l), t);
  }
  function vt(t, e, n) {
    return (
      (t[0] = e[0]),
      (t[1] = e[1]),
      (t[2] = e[2]),
      (t[3] = e[3]),
      (t[4] = e[4] + n[0]),
      (t[5] = e[5] + n[1]),
      t
    );
  }
  function yt(t, e, n) {
    var i = e[0],
      r = e[2],
      o = e[4],
      a = e[1],
      s = e[3],
      l = e[5],
      h = Math.sin(n),
      u = Math.cos(n);
    return (
      (t[0] = i * u + a * h),
      (t[1] = -i * h + a * u),
      (t[2] = r * u + s * h),
      (t[3] = -r * h + u * s),
      (t[4] = u * o + h * l),
      (t[5] = u * l - h * o),
      t
    );
  }
  function xt(t, e, n) {
    var i = n[0],
      r = n[1];
    return (
      (t[0] = e[0] * i),
      (t[1] = e[1] * r),
      (t[2] = e[2] * i),
      (t[3] = e[3] * r),
      (t[4] = e[4] * i),
      (t[5] = e[5] * r),
      t
    );
  }
  function _t(t, e) {
    var n = e[0],
      i = e[2],
      r = e[4],
      o = e[1],
      a = e[3],
      s = e[5],
      l = n * a - o * i;
    return l
      ? ((l = 1 / l),
        (t[0] = a * l),
        (t[1] = -o * l),
        (t[2] = -i * l),
        (t[3] = n * l),
        (t[4] = (i * s - a * r) * l),
        (t[5] = (o * r - n * s) * l),
        t)
      : null;
  }
  function wt(t) {
    return t > wd || t < -wd;
  }
  function bt(t) {
    ((this._target = t.target),
      (this._life = t.life || 1e3),
      (this._delay = t.delay || 0),
      (this._initialized = !1),
      (this.loop = null != t.loop && t.loop),
      (this.gap = t.gap || 0),
      (this.easing = t.easing || "Linear"),
      (this.onframe = t.onframe),
      (this.ondestroy = t.ondestroy),
      (this.onrestart = t.onrestart),
      (this._pausedTime = 0),
      (this._paused = !1));
  }
  function St(t) {
    return (t = Math.round(t)) < 0 ? 0 : t > 255 ? 255 : t;
  }
  function Mt(t) {
    return t < 0 ? 0 : t > 1 ? 1 : t;
  }
  function It(t) {
    return St(
      t.length && "%" === t.charAt(t.length - 1) ? (parseFloat(t) / 100) * 255 : parseInt(t, 10),
    );
  }
  function Tt(t) {
    return Mt(t.length && "%" === t.charAt(t.length - 1) ? parseFloat(t) / 100 : parseFloat(t));
  }
  function At(t, e, n) {
    return (
      n < 0 ? (n += 1) : n > 1 && (n -= 1),
      6 * n < 1
        ? t + (e - t) * n * 6
        : 2 * n < 1
          ? e
          : 3 * n < 2
            ? t + (e - t) * (2 / 3 - n) * 6
            : t
    );
  }
  function Ct(t, e, n) {
    return t + (e - t) * n;
  }
  function Dt(t, e, n, i, r) {
    return ((t[0] = e), (t[1] = n), (t[2] = i), (t[3] = r), t);
  }
  function kt(t, e) {
    return ((t[0] = e[0]), (t[1] = e[1]), (t[2] = e[2]), (t[3] = e[3]), t);
  }
  function Pt(t, e) {
    (Ed && kt(Ed, e), (Ed = zd.put(t, Ed || e.slice())));
  }
  function Lt(t, e) {
    if (t) {
      e = e || [];
      var n = zd.get(t);
      if (n) return kt(e, n);
      var i = (t += "").replace(/ /g, "").toLowerCase();
      if (i in Od) return (kt(e, Od[i]), Pt(t, e), e);
      if ("#" !== i.charAt(0)) {
        var r = i.indexOf("("),
          o = i.indexOf(")");
        if (-1 !== r && o + 1 === i.length) {
          var a = i.substr(0, r),
            s = i.substr(r + 1, o - (r + 1)).split(","),
            l = 1;
          switch (a) {
            case "rgba":
              if (4 !== s.length) return void Dt(e, 0, 0, 0, 1);
              l = Tt(s.pop());
            case "rgb":
              return 3 !== s.length
                ? void Dt(e, 0, 0, 0, 1)
                : (Dt(e, It(s[0]), It(s[1]), It(s[2]), l), Pt(t, e), e);
            case "hsla":
              return 4 !== s.length
                ? void Dt(e, 0, 0, 0, 1)
                : ((s[3] = Tt(s[3])), Ot(s, e), Pt(t, e), e);
            case "hsl":
              return 3 !== s.length ? void Dt(e, 0, 0, 0, 1) : (Ot(s, e), Pt(t, e), e);
            default:
              return;
          }
        }
        Dt(e, 0, 0, 0, 1);
      } else {
        if (4 === i.length)
          return (h = parseInt(i.substr(1), 16)) >= 0 && h <= 4095
            ? (Dt(
                e,
                ((3840 & h) >> 4) | ((3840 & h) >> 8),
                (240 & h) | ((240 & h) >> 4),
                (15 & h) | ((15 & h) << 4),
                1,
              ),
              Pt(t, e),
              e)
            : void Dt(e, 0, 0, 0, 1);
        if (7 === i.length) {
          var h = parseInt(i.substr(1), 16);
          return h >= 0 && h <= 16777215
            ? (Dt(e, (16711680 & h) >> 16, (65280 & h) >> 8, 255 & h, 1), Pt(t, e), e)
            : void Dt(e, 0, 0, 0, 1);
        }
      }
    }
  }
  function Ot(t, e) {
    var n = (((parseFloat(t[0]) % 360) + 360) % 360) / 360,
      i = Tt(t[1]),
      r = Tt(t[2]),
      o = r <= 0.5 ? r * (i + 1) : r + i - r * i,
      a = 2 * r - o;
    return (
      Dt(
        (e = e || []),
        St(255 * At(a, o, n + 1 / 3)),
        St(255 * At(a, o, n)),
        St(255 * At(a, o, n - 1 / 3)),
        1,
      ),
      4 === t.length && (e[3] = t[3]),
      e
    );
  }
  function zt(t, e) {
    var n = Lt(t);
    if (n) {
      for (var i = 0; i < 3; i++)
        ((n[i] = e < 0 ? (n[i] * (1 - e)) | 0 : ((255 - n[i]) * e + n[i]) | 0),
          n[i] > 255 ? (n[i] = 255) : t[i] < 0 && (n[i] = 0));
      return Ft(n, 4 === n.length ? "rgba" : "rgb");
    }
  }
  function Et(t) {
    var typeof_ = Lt(t);
    if (typeof_)
      return ((1 << 24) + (typeof_[0] << 16) + (typeof_[1] << 8) + +typeof_[2])
        .toString(16)
        .slice(1);
  }
  function Nt(t, e, n) {
    if (e && e.length && t >= 0 && t <= 1) {
      n = n || [];
      var i = t * (e.length - 1),
        r = Math.floor(i),
        o = Math.ceil(i),
        a = e[r],
        s = e[o],
        l = i - r;
      return (
        (n[0] = St(Ct(a[0], s[0], l))),
        (n[1] = St(Ct(a[1], s[1], l))),
        (n[2] = St(Ct(a[2], s[2], l))),
        (n[3] = Mt(Ct(a[3], s[3], l))),
        n
      );
    }
  }
  function Rt(t, e, n) {
    if (e && e.length && t >= 0 && t <= 1) {
      var i = t * (e.length - 1),
        r = Math.floor(i),
        o = Math.ceil(i),
        a = Lt(e[r]),
        s = Lt(e[o]),
        l = i - r,
        h = Ft(
          [
            St(Ct(a[0], s[0], l)),
            St(Ct(a[1], s[1], l)),
            St(Ct(a[2], s[2], l)),
            Mt(Ct(a[3], s[3], l)),
          ],
          "rgba",
        );
      return n
        ? {
            color: h,
            leftIndex: r,
            rightIndex: o,
            value: i,
          }
        : h;
    }
  }
  function Bt(t, e) {
    if ((t = Lt(t)) && null != e) return ((t[3] = Mt(e)), Ft(t, "rgba"));
  }
  function Ft(t, e) {
    if (t && t.length) {
      var n = t[0] + "," + t[1] + "," + t[2];
      return (
        ("rgba" !== e && "hsva" !== e && "hsla" !== e) || (n += "," + t[3]),
        e + "(" + n + ")"
      );
    }
  }
  function Vt(t, e) {
    return t[e];
  }
  function Ht(t, e, n) {
    t[e] = n;
  }
  function Wt(t, e, n) {
    return (e - t) * n + t;
  }
  function Gt(t, e, n) {
    return n > 0.5 ? e : t;
  }
  function Zt(t, e, n, i, r) {
    var o = t.length;
    if (1 === r) for (s = 0; s < o; s++) i[s] = Wt(t[s], e[s], n);
    else
      for (var a = o && t[0].length, s = 0; s < o; s++)
        for (var l = 0; l < a; l++) i[s][l] = Wt(t[s][l], e[s][l], n);
  }
  function Ut(t, e, n) {
    var i = t.length,
      r = e.length;
    if (i !== r)
      if (i > r) t.length = r;
      else for (a = i; a < r; a++) t.push(1 === n ? e[a] : Fd.call(e[a]));
    for (var o = t[0] && t[0].length, a = 0; a < t.length; a++)
      if (1 === n) isNaN(t[a]) && (t[a] = e[a]);
      else for (var s = 0; s < o; s++) isNaN(t[a][s]) && (t[a][s] = e[a][s]);
  }
  function Xt(t, e, n) {
    if (t === e) return !0;
    var i = t.length;
    if (i !== e.length) return !1;
    if (1 === n) {
      for (o = 0; o < i; o++) if (t[o] !== e[o]) return !1;
    } else
      for (var r = t[0].length, o = 0; o < i; o++)
        for (var a = 0; a < r; a++) if (t[o][a] !== e[o][a]) return !1;
    return !0;
  }
  function Yt(t, e, n, i, r, o, a, s, l) {
    var h = t.length;
    if (1 === l) for (c = 0; c < h; c++) s[c] = jt(t[c], e[c], n[c], i[c], r, o, a);
    else
      for (var u = t[0].length, c = 0; c < h; c++)
        for (var d = 0; d < u; d++) s[c][d] = jt(t[c][d], e[c][d], n[c][d], i[c][d], r, o, a);
  }
  function jt(t, e, n, i, r, o, a) {
    var s = 0.5 * (n - t),
      l = 0.5 * (i - e);
    return (2 * (e - n) + s + l) * a + (-3 * (e - n) - 2 * s - l) * o + s * r + e;
  }
  function qt(t) {
    if (d(t)) {
      var typeof_ = t.length;
      if (d(t[0])) {
        for (var n = [], i = 0; i < typeof_; i++) n.push(Fd.call(t[i]));
        return n;
      }
      return Fd.call(t);
    }
    return t;
  }
  function $t(t) {
    return (
      (t[0] = Math.floor(t[0])),
      (t[1] = Math.floor(t[1])),
      (t[2] = Math.floor(t[2])),
      "rgba(" + t.join(",") + ")"
    );
  }
  function Kt(t, e, n, i, r, o) {
    var a = t._getter,
      s = t._setter,
      l = "spline" === e,
      h = i.length;
    if (h) {
      var u,
        c = d(i[0].value),
        f = !1,
        p = !1,
        g = c
          ? (function (t) {
              var typeof_ = t[t.length - 1].value;
              return d(typeof_ && typeof_[0]) ? 2 : 1;
            })(i)
          : 0;
      (i.sort(function (t, e) {
        return t.time - e.time;
      }),
        (u = i[h - 1].time));
      for (var m = [], v = [], y = i[0].value, x = !0, _ = 0; _ < h; _++) {
        m.push(i[_].time / u);
        var w = i[_].value;
        if (((c && Xt(w, y, g)) || (!c && w === y) || (x = !1), (y = w), "string" == typeof w)) {
          var b = Lt(w);
          b ? ((w = b), (f = !0)) : (p = !0);
        }
        v.push(w);
      }
      if (o || !x) {
        var S = v[h - 1];
        for (_ = 0; _ < h - 1; _++)
          c ? Ut(v[_], S, g) : !isNaN(v[_]) || isNaN(S) || p || f || (v[_] = S);
        c && Ut(a(t._target, r), S, g);
        var M,
          I,
          T,
          A,
          C,
          D = 0,
          k = 0;
        if (f) var P = [0, 0, 0, 0];
        var L = new bt({
          target: t._target,
          life: u,
          loop: t._loop,
          delay: t._delay,
          onframe: function (t, e) {
            var n;
            if (e < 0) n = 0;
            else if (e < k) {
              for (n = Math.min(D + 1, h - 1); n >= 0 && !(m[n] <= e); n--);
              n = Math.min(n, h - 2);
            } else {
              for (n = D; n < h && !(m[n] > e); n++);
              n = Math.min(n - 1, h - 2);
            }
            ((D = n), (k = e));
            var i = m[n + 1] - m[n];
            if (0 !== i)
              if (((M = (e - m[n]) / i), l)) {
                if (
                  ((T = v[n]),
                  (I = v[0 === n ? n : n - 1]),
                  (A = v[n > h - 2 ? h - 1 : n + 1]),
                  (C = v[n > h - 3 ? h - 1 : n + 2]),
                  c)
                )
                  Yt(I, T, A, C, M, M * M, M * M * M, a(t, r), g);
                else {
                  if (f) ((o = Yt(I, T, A, C, M, M * M, M * M * M, P, 1)), (o = $t(P)));
                  else {
                    if (p) return Gt(T, A, M);
                    o = jt(I, T, A, C, M, M * M, M * M * M);
                  }
                  s(t, r, o);
                }
              } else if (c) Zt(v[n], v[n + 1], M, a(t, r), g);
              else {
                var o;
                if (f) (Zt(v[n], v[n + 1], M, P, 1), (o = $t(P)));
                else {
                  if (p) return Gt(v[n], v[n + 1], M);
                  o = Wt(v[n], v[n + 1], M);
                }
                s(t, r, o);
              }
          },
          ondestroy: n,
        });
        return (e && "spline" !== e && (L.easing = e), L);
      }
    }
  }
  function Qt(t, e, n, i, r, o, a, s) {
    (w(i)
      ? ((o = r), (r = i), (i = 0))
      : _(r)
        ? ((o = r), (r = "linear"), (i = 0))
        : _(i)
          ? ((o = i), (i = 0))
          : _(n)
            ? ((o = n), (n = 500))
            : n || (n = 500),
      t.stopAnimation(),
      Jt(t, "", t, e, n, i, s));
    var l = t.animators.slice(),
      h = l.length;
    h || (o && o());
    for (var u = 0; u < l.length; u++)
      l[u]
        .done(function () {
          --h || (o && o());
        })
        .start(r, a);
  }
  function Jt(t, e, n, i, r, o, a) {
    var s = {},
      l = 0;
    for (var h in i)
      i.hasOwnProperty(h) &&
        (null != n[h]
          ? b(i[h]) && !d(i[h])
            ? Jt(t, e ? e + "." + h : h, n[h], i[h], r, o, a)
            : (a ? ((s[h] = n[h]), te(t, e, h, i[h])) : (s[h] = i[h]), l++)
          : null == i[h] || a || te(t, e, h, i[h]));
    l > 0 &&
      t
        .animate(e, !1)
        .when(null == r ? 500 : r, s)
        .delay(o || 0);
  }
  function te(t, e, n, i) {
    if (e) {
      var r = {};
      ((r[e] = {}), (r[e][n] = i), t.attr(r));
    } else t.attr(n, i);
  }
  function ee(t, e, n, i) {
    (n < 0 && ((t += n), (n = -n)),
      i < 0 && ((e += i), (i = -i)),
      (this.x = t),
      (this.y = e),
      (this.width = n),
      (this.height = i));
  }
  function ne(t, e, n, i) {
    var r = e + 1;
    if (r === n) return 1;
    if (i(t[r++], t[e]) < 0) {
      for (; r < n && i(t[r], t[r - 1]) < 0;) r++;
      !(function (t, e, n) {
        for (n--; e < n;) {
          var i = t[e];
          ((t[e++] = t[n]), (t[n--] = i));
        }
      })(t, e, r);
    } else for (; r < n && i(t[r], t[r - 1]) >= 0;) r++;
    return r - e;
  }
  function ie(t, e, n, i, r) {
    for (i === e && i++; i < n; i++) {
      for (var o, a = t[i], s = e, l = i; s < l;)
        r(a, t[(o = (s + l) >>> 1)]) < 0 ? (l = o) : (s = o + 1);
      var h = i - s;
      switch (h) {
        case 3:
          t[s + 3] = t[s + 2];
        case 2:
          t[s + 2] = t[s + 1];
        case 1:
          t[s + 1] = t[s];
          break;
        default:
          for (; h > 0;) ((t[s + h] = t[s + h - 1]), h--);
      }
      t[s] = a;
    }
  }
  function re(t, e, n, i, r, o) {
    var a = 0,
      s = 0,
      l = 1;
    if (o(t, e[n + r]) > 0) {
      for (s = i - r; l < s && o(t, e[n + r + l]) > 0;)
        ((a = l), (l = 1 + (l << 1)) <= 0 && (l = s));
      (l > s && (l = s), (a += r), (l += r));
    } else {
      for (s = r + 1; l < s && o(t, e[n + r - l]) <= 0;)
        ((a = l), (l = 1 + (l << 1)) <= 0 && (l = s));
      l > s && (l = s);
      var h = a;
      ((a = r - l), (l = r - h));
    }
    for (a++; a < l;) {
      var u = a + ((l - a) >>> 1);
      o(t, e[n + u]) > 0 ? (a = u + 1) : (l = u);
    }
    return l;
  }
  function oe(t, e, n, i, r, o) {
    var a = 0,
      s = 0,
      l = 1;
    if (o(t, e[n + r]) < 0) {
      for (s = r + 1; l < s && o(t, e[n + r - l]) < 0;)
        ((a = l), (l = 1 + (l << 1)) <= 0 && (l = s));
      l > s && (l = s);
      var h = a;
      ((a = r - l), (l = r - h));
    } else {
      for (s = i - r; l < s && o(t, e[n + r + l]) >= 0;)
        ((a = l), (l = 1 + (l << 1)) <= 0 && (l = s));
      (l > s && (l = s), (a += r), (l += r));
    }
    for (a++; a < l;) {
      var u = a + ((l - a) >>> 1);
      o(t, e[n + u]) < 0 ? (l = u) : (a = u + 1);
    }
    return l;
  }
  function ae(t, e) {
    function n(n) {
      var s = o[n],
        h = a[n],
        u = o[n + 1],
        c = a[n + 1];
      ((a[n] = h + c), n === l - 3 && ((o[n + 1] = o[n + 2]), (a[n + 1] = a[n + 2])), l--);
      var d = oe(t[u], t, s, h, 0, e);
      ((s += d),
        0 != (h -= d) &&
          0 !== (c = re(t[s + h - 1], t, u, c, c - 1, e)) &&
          (h <= c ? i(s, h, u, c) : r(s, h, u, c)));
    }
    function i(n, i, r, o) {
      var a = 0;
      for (a = 0; a < i; a++) h[a] = t[n + a];
      var l = 0,
        u = r,
        c = n;
      if (((t[c++] = t[u++]), 0 != --o)) {
        if (1 !== i) {
          for (var d, f, p, g = s; ;) {
            ((d = 0), (f = 0), (p = !1));
            do {
              if (e(t[u], h[l]) < 0) {
                if (((t[c++] = t[u++]), f++, (d = 0), 0 == --o)) {
                  p = !0;
                  break;
                }
              } else if (((t[c++] = h[l++]), d++, (f = 0), 1 == --i)) {
                p = !0;
                break;
              }
            } while ((d | f) < g);
            if (p) break;
            do {
              if (0 !== (d = oe(t[u], h, l, i, 0, e))) {
                for (a = 0; a < d; a++) t[c + a] = h[l + a];
                if (((c += d), (l += d), (i -= d) <= 1)) {
                  p = !0;
                  break;
                }
              }
              if (((t[c++] = t[u++]), 0 == --o)) {
                p = !0;
                break;
              }
              if (0 !== (f = re(h[l], t, u, o, 0, e))) {
                for (a = 0; a < f; a++) t[c + a] = t[u + a];
                if (((c += f), (u += f), 0 == (o -= f))) {
                  p = !0;
                  break;
                }
              }
              if (((t[c++] = h[l++]), 1 == --i)) {
                p = !0;
                break;
              }
              g--;
            } while (d >= Kd || f >= Kd);
            if (p) break;
            (g < 0 && (g = 0), (g += 2));
          }
          if (((s = g) < 1 && (s = 1), 1 === i)) {
            for (a = 0; a < o; a++) t[c + a] = t[u + a];
            t[c + o] = h[l];
          } else {
            if (0 === i) throw new Error();
            for (a = 0; a < i; a++) t[c + a] = h[l + a];
          }
        } else {
          for (a = 0; a < o; a++) t[c + a] = t[u + a];
          t[c + o] = h[l];
        }
      } else for (a = 0; a < i; a++) t[c + a] = h[l + a];
    }
    function r(n, i, r, o) {
      var a = 0;
      for (a = 0; a < o; a++) h[a] = t[r + a];
      var l = n + i - 1,
        u = o - 1,
        c = r + o - 1,
        d = 0,
        f = 0;
      if (((t[c--] = t[l--]), 0 != --i)) {
        if (1 !== o) {
          for (var p = s; ;) {
            var g = 0,
              m = 0,
              v = !1;
            do {
              if (e(h[u], t[l]) < 0) {
                if (((t[c--] = t[l--]), g++, (m = 0), 0 == --i)) {
                  v = !0;
                  break;
                }
              } else if (((t[c--] = h[u--]), m++, (g = 0), 1 == --o)) {
                v = !0;
                break;
              }
            } while ((g | m) < p);
            if (v) break;
            do {
              if (0 != (g = i - oe(h[u], t, n, i, i - 1, e))) {
                for (i -= g, f = 1 + (c -= g), d = 1 + (l -= g), a = g - 1; a >= 0; a--)
                  t[f + a] = t[d + a];
                if (0 === i) {
                  v = !0;
                  break;
                }
              }
              if (((t[c--] = h[u--]), 1 == --o)) {
                v = !0;
                break;
              }
              if (0 != (m = o - re(t[l], h, 0, o, o - 1, e))) {
                for (o -= m, f = 1 + (c -= m), d = 1 + (u -= m), a = 0; a < m; a++)
                  t[f + a] = h[d + a];
                if (o <= 1) {
                  v = !0;
                  break;
                }
              }
              if (((t[c--] = t[l--]), 0 == --i)) {
                v = !0;
                break;
              }
              p--;
            } while (g >= Kd || m >= Kd);
            if (v) break;
            (p < 0 && (p = 0), (p += 2));
          }
          if (((s = p) < 1 && (s = 1), 1 === o)) {
            for (f = 1 + (c -= i), d = 1 + (l -= i), a = i - 1; a >= 0; a--) t[f + a] = t[d + a];
            t[c] = h[u];
          } else {
            if (0 === o) throw new Error();
            for (d = c - (o - 1), a = 0; a < o; a++) t[d + a] = h[a];
          }
        } else {
          for (f = 1 + (c -= i), d = 1 + (l -= i), a = i - 1; a >= 0; a--) t[f + a] = t[d + a];
          t[c] = h[u];
        }
      } else for (d = c - (o - 1), a = 0; a < o; a++) t[d + a] = h[a];
    }
    var o,
      a,
      s = Kd,
      l = 0,
      h = [];
    ((o = []),
      (a = []),
      (this.mergeRuns = function () {
        for (; l > 1;) {
          var t = l - 2;
          if ((t >= 1 && a[t - 1] <= a[t] + a[t + 1]) || (t >= 2 && a[t - 2] <= a[t] + a[t - 1]))
            a[t - 1] < a[t + 1] && t--;
          else if (a[t] > a[t + 1]) break;
          n(t);
        }
      }),
      (this.forceMergeRuns = function () {
        for (; l > 1;) {
          var t = l - 2;
          (t > 0 && a[t - 1] < a[t + 1] && t--, n(t));
        }
      }),
      (this.pushRun = function (t, e) {
        ((o[l] = t), (a[l] = e), (l += 1));
      }));
  }
  function se(t, e, n, i) {
    (n || (n = 0), i || (i = t.length));
    var r = i - n;
    if (!(r < 2)) {
      var o = 0;
      if (r < $d) return void ie(t, n, i, n + (o = ne(t, n, i, e)), e);
      var a = new ae(t, e),
        s = (function (t) {
          for (var typeof_ = 0; t >= $d;) ((e |= 1 & t), (t >>= 1));
          return t + typeof_;
        })(r);
      do {
        if ((o = ne(t, n, i, e)) < s) {
          var l = r;
          (l > s && (l = s), ie(t, n, n + l, n + o, e), (o = l));
        }
        (a.pushRun(n, o), a.mergeRuns(), (r -= o), (n += o));
      } while (0 !== r);
      a.forceMergeRuns();
    }
  }
  function le(t, e) {
    return t.zlevel === e.zlevel ? (t.z === e.z ? t.z2 - e.z2 : t.z - e.z) : t.zlevel - e.zlevel;
  }
  function he(t, e, n) {
    var i = null == e.x ? 0 : e.x,
      r = null == e.x2 ? 1 : e.x2,
      o = null == e.y ? 0 : e.y,
      a = null == e.y2 ? 0 : e.y2;
    return (
      e.global ||
        ((i = i * n.width + n.x),
        (r = r * n.width + n.x),
        (o = o * n.height + n.y),
        (a = a * n.height + n.y)),
      (i = isNaN(i) ? 0 : i),
      (r = isNaN(r) ? 1 : r),
      (o = isNaN(o) ? 0 : o),
      (a = isNaN(a) ? 0 : a),
      t.createLinearGradient(i, o, r, a)
    );
  }
  function ue(t, e, n) {
    var i = n.width,
      r = n.height,
      o = Math.min(i, r),
      a = null == e.x ? 0.5 : e.x,
      s = null == e.y ? 0.5 : e.y,
      l = null == e.r ? 0.5 : e.r;
    return (
      e.global || ((a = a * i + n.x), (s = s * r + n.y), (l *= o)),
      t.createRadialGradient(a, s, 0, a, s, l)
    );
  }
  function ce() {
    return !1;
  }
  function de(t, e, n) {
    var i = Qc(),
      r = e.getWidth(),
      o = e.getHeight(),
      a = i.style;
    return (
      a &&
        ((a.position = "absolute"),
        (a.left = 0),
        (a.top = 0),
        (a.width = r + "px"),
        (a.height = o + "px"),
        i.setAttribute("data-zr-dom-id", t)),
      (i.width = r * n),
      (i.height = o * n),
      i
    );
  }
  function fe(t) {
    if ("string" == typeof t) {
      var typeof_ = df.get(t);
      return typeof_ && typeof_.image;
    }
    return t;
  }
  function pe(t, e, n, i, r) {
    if (t) {
      if ("string" == typeof t) {
        if ((e && e.__zrImageSrc === t) || !n) return e;
        var o = df.get(t),
          a = {
            hostEl: n,
            cb: i,
            cbPayload: r,
          };
        return (
          o
            ? !me((e = o.image)) && o.pending.push(a)
            : (((e = new Image()).onload = e.onerror = ge),
              df.put(
                t,
                (e.__cachedImgObj = {
                  image: e,
                  pending: [a],
                }),
              ),
              (e.src = e.__zrImageSrc = t)),
          e
        );
      }
      return t;
    }
    return e;
  }
  function ge() {
    var t = this.__cachedImgObj;
    this.onload = this.onerror = this.__cachedImgObj = null;
    for (var typeof_ = 0; typeof_ < t.pending.length; typeof_++) {
      var n = t.pending[typeof_],
        i = n.cb;
      (i && i(this, n.cbPayload), n.hostEl.dirty());
    }
    t.pending.length = 0;
  }
  function me(t) {
    return t && t.width && t.height;
  }
  function ve(t, e) {
    var n = t + ":" + (e = e || vf);
    if (ff[n]) return ff[n];
    for (var i = (t + "").split("\n"), r = 0, o = 0, a = i.length; o < a; o++)
      r = Math.max(Ae(i[o], e).width, r);
    return (pf > gf && ((pf = 0), (ff = {})), pf++, (ff[n] = r), r);
  }
  function ye(t, e, n, i, r, o, a, s) {
    return a
      ? (function (t, e, n, i, r, o, a, s) {
          var l = De(t, {
              rich: a,
              truncate: s,
              font: e,
              textAlign: n,
              textPadding: r,
              textLineHeight: o,
            }),
            h = l.outerWidth,
            u = l.outerHeight;
          return new ee(xe(0, h, n), _e(0, u, i), h, u);
        })(t, e, n, i, r, a, o, s)
      : (function (t, e, n, i, r, o, a) {
          var s = Ce(t, e, r, o, a),
            l = ve(t, e);
          r && (l += r[1] + r[3]);
          var h = s.outerHeight,
            u = new ee(xe(0, l, n), _e(0, h, i), l, h);
          return ((u.lineHeight = s.lineHeight), u);
        })(t, e, n, i, r, o, s);
  }
  function xe(t, e, n) {
    return ("right" === n ? (t -= e) : "center" === n && (t -= e / 2), t);
  }
  function _e(t, e, n) {
    return ("middle" === n ? (t -= e / 2) : "bottom" === n && (t -= e), t);
  }
  function we(t, e, n) {
    var i = e.x,
      r = e.y,
      o = e.height,
      a = e.width,
      s = o / 2,
      l = "left",
      h = "top";
    switch (t) {
      case "left":
        ((i -= n), (r += s), (l = "right"), (h = "middle"));
        break;
      case "right":
        ((i += n + a), (r += s), (h = "middle"));
        break;
      case "top":
        ((i += a / 2), (r -= n), (l = "center"), (h = "bottom"));
        break;
      case "bottom":
        ((i += a / 2), (r += o + n), (l = "center"));
        break;
      case "inside":
        ((i += a / 2), (r += s), (l = "center"), (h = "middle"));
        break;
      case "insideLeft":
        ((i += n), (r += s), (h = "middle"));
        break;
      case "insideRight":
        ((i += a - n), (r += s), (l = "right"), (h = "middle"));
        break;
      case "insideTop":
        ((i += a / 2), (r += n), (l = "center"));
        break;
      case "insideBottom":
        ((i += a / 2), (r += o - n), (l = "center"), (h = "bottom"));
        break;
      case "insideTopLeft":
        ((i += n), (r += n));
        break;
      case "insideTopRight":
        ((i += a - n), (r += n), (l = "right"));
        break;
      case "insideBottomLeft":
        ((i += n), (r += o - n), (h = "bottom"));
        break;
      case "insideBottomRight":
        ((i += a - n), (r += o - n), (l = "right"), (h = "bottom"));
    }
    return {
      x: i,
      y: r,
      textAlign: l,
      textVerticalAlign: h,
    };
  }
  function be(t, e, n, i, r) {
    if (!e) return "";
    var o = (t + "").split("\n");
    r = Se(e, n, i, r);
    for (var a = 0, s = o.length; a < s; a++) o[a] = Me(o[a], r);
    return o.join("\n");
  }
  function Se(t, e, n, i) {
    (((i = a({}, i)).font = e), (n = C(n, "...")), (i.maxIterations = C(i.maxIterations, 2)));
    var r = (i.minChar = C(i.minChar, 0));
    i.cnCharWidth = ve("国", e);
    var o = (i.ascCharWidth = ve("a", e));
    i.placeholder = C(i.placeholder, "");
    for (var s = (t = Math.max(0, t - 1)), l = 0; l < r && s >= o; l++) s -= o;
    var h = ve(n, e);
    return (
      h > s && ((n = ""), (h = 0)),
      (s = t - h),
      (i.ellipsis = n),
      (i.ellipsisWidth = h),
      (i.contentWidth = s),
      (i.containerWidth = t),
      i
    );
  }
  function Me(t, e) {
    var n = e.containerWidth,
      i = e.font,
      r = e.contentWidth;
    if (!n) return "";
    var o = ve(t, i);
    if (o <= n) return t;
    for (var a = 0; ; a++) {
      if (o <= r || a >= e.maxIterations) {
        t += e.ellipsis;
        break;
      }
      var s =
        0 === a
          ? Ie(t, r, e.ascCharWidth, e.cnCharWidth)
          : o > 0
            ? Math.floor((t.length * r) / o)
            : 0;
      o = ve((t = t.substr(0, s)), i);
    }
    return ("" === t && (t = e.placeholder), t);
  }
  function Ie(t, e, n, i) {
    for (var r = 0, o = 0, a = t.length; o < a && r < e; o++) {
      var s = t.charCodeAt(o);
      r += 0 <= s && s <= 127 ? n : i;
    }
    return o;
  }
  function Te(t) {
    return ve("国", t);
  }
  function Ae(t, e) {
    return yf.measureText(t, e);
  }
  function Ce(t, e, n, i, r) {
    null != t && (t += "");
    var o = C(i, Te(e)),
      a = t ? t.split("\n") : [],
      s = a.length * o,
      l = s;
    if ((n && (l += n[0] + n[2]), t && r)) {
      var h = r.outerHeight,
        u = r.outerWidth;
      if (null != h && l > h) ((t = ""), (a = []));
      else if (null != u)
        for (
          var c = Se(u - (n ? n[1] + n[3] : 0), e, r.ellipsis, {
              minChar: r.minChar,
              placeholder: r.placeholder,
            }),
            d = 0,
            f = a.length;
          d < f;
          d++
        )
          a[d] = Me(a[d], c);
    }
    return {
      lines: a,
      height: s,
      outerHeight: l,
      lineHeight: o,
    };
  }
  function De(t, e) {
    var n = {
      lines: [],
      width: 0,
      height: 0,
    };
    if ((null != t && (t += ""), !t)) return n;
    for (var i, r = (mf.lastIndex = 0); null != (i = mf.exec(t));) {
      var o = i.index;
      (o > r && ke(n, t.substring(r, o)), ke(n, i[2], i[1]), (r = mf.lastIndex));
    }
    r < t.length && ke(n, t.substring(r, t.length));
    var a = n.lines,
      s = 0,
      l = 0,
      h = [],
      u = e.textPadding,
      c = e.truncate,
      d = c && c.outerWidth,
      f = c && c.outerHeight;
    for (
      u && (null != d && (d -= u[1] + u[3]), null != f && (f -= u[0] + u[2])), k = 0;
      k < a.length;
      k++
    ) {
      for (var p = a[k], g = 0, m = 0, v = 0; v < p.tokens.length; v++) {
        var y = ((P = p.tokens[v]).styleName && e.rich[P.styleName]) || {},
          x = (P.textPadding = y.textPadding),
          _ = (P.font = y.font || e.font),
          w = (P.textHeight = C(y.textHeight, Te(_)));
        if (
          (x && (w += x[0] + x[2]),
          (P.height = w),
          (P.lineHeight = D(y.textLineHeight, e.textLineHeight, w)),
          (P.textAlign = (y && y.textAlign) || e.textAlign),
          (P.textVerticalAlign = (y && y.textVerticalAlign) || "middle"),
          null != f && s + P.lineHeight > f)
        )
          return {
            lines: [],
            width: 0,
            height: 0,
          };
        P.textWidth = ve(P.text, _);
        var b = y.textWidth,
          S = null == b || "auto" === b;
        if ("string" == typeof b && "%" === b.charAt(b.length - 1))
          ((P.percentWidth = b), h.push(P), (b = 0));
        else {
          if (S) {
            b = P.textWidth;
            var M = y.textBackgroundColor,
              I = M && M.image;
            I && me((I = fe(I))) && (b = Math.max(b, (I.width * w) / I.height));
          }
          var T = x ? x[1] + x[3] : 0;
          b += T;
          var A = null != d ? d - m : null;
          null != A &&
            A < b &&
            (!S || A < T
              ? ((P.text = ""), (P.textWidth = b = 0))
              : ((P.text = be(P.text, A - T, _, c.ellipsis, {
                  minChar: c.minChar,
                })),
                (P.textWidth = ve(P.text, _)),
                (b = P.textWidth + T)));
        }
        ((m += P.width = b), y && (g = Math.max(g, P.lineHeight)));
      }
      ((p.width = m), (p.lineHeight = g), (s += g), (l = Math.max(l, m)));
    }
    ((n.outerWidth = n.width = C(e.textWidth, l)),
      (n.outerHeight = n.height = C(e.textHeight, s)),
      u && ((n.outerWidth += u[1] + u[3]), (n.outerHeight += u[0] + u[2])));
    for (var k = 0; k < h.length; k++) {
      var P = h[k],
        L = P.percentWidth;
      P.width = (parseInt(L, 10) / 100) * l;
    }
    return n;
  }
  function ke(t, e, n) {
    for (var i = "" === e, r = e.split("\n"), o = t.lines, a = 0; a < r.length; a++) {
      var s = r[a],
        l = {
          styleName: n,
          text: s,
          isLineHolder: !s && !i,
        };
      if (a)
        o.push({
          tokens: [l],
        });
      else {
        var h = (
            o[o.length - 1] ||
            (o[0] = {
              tokens: [],
            })
          ).tokens,
          u = h.length;
        1 === u && h[0].isLineHolder ? (h[0] = l) : (s || !u || i) && h.push(l);
      }
    }
  }
  function Pe(t) {
    var typeof_ =
      (t.fontSize || t.fontFamily) &&
      [t.fontStyle, t.fontWeight, (t.fontSize || 12) + "px", t.fontFamily || "sans-serif"].join(
        " ",
      );
    return (typeof_ && O(typeof_)) || t.textFont || t.font;
  }
  function Le(t, e) {
    var n,
      i,
      r,
      o,
      a,
      s = e.x,
      l = e.y,
      h = e.width,
      u = e.height,
      c = e.r;
    (h < 0 && ((s += h), (h = -h)),
      u < 0 && ((l += u), (u = -u)),
      "number" == typeof c
        ? (n = i = r = o = c)
        : c instanceof Array
          ? 1 === c.length
            ? (n = i = r = o = c[0])
            : 2 === c.length
              ? ((n = r = c[0]), (i = o = c[1]))
              : 3 === c.length
                ? ((n = c[0]), (i = o = c[1]), (r = c[2]))
                : ((n = c[0]), (i = c[1]), (r = c[2]), (o = c[3]))
          : (n = i = r = o = 0),
      n + i > h && ((n *= h / (a = n + i)), (i *= h / a)),
      r + o > h && ((r *= h / (a = r + o)), (o *= h / a)),
      i + r > u && ((i *= u / (a = i + r)), (r *= u / a)),
      n + o > u && ((n *= u / (a = n + o)), (o *= u / a)),
      t.moveTo(s + n, l),
      t.lineTo(s + h - i, l),
      0 !== i && t.arc(s + h - i, l + i, i, -Math.PI / 2, 0),
      t.lineTo(s + h, l + u - r),
      0 !== r && t.arc(s + h - r, l + u - r, r, 0, Math.PI / 2),
      t.lineTo(s + o, l + u),
      0 !== o && t.arc(s + o, l + u - o, o, Math.PI / 2, Math.PI),
      t.lineTo(s, l + n),
      0 !== n && t.arc(s + n, l + n, n, Math.PI, 1.5 * Math.PI));
  }
  function Oe(t) {
    return (ze(t), f(t.rich, ze), t);
  }
  function ze(t) {
    if (t) {
      t.font = Pe(t);
      var typeof_ = t.textAlign;
      ("middle" === typeof_ && (e = "center"),
        (t.textAlign = null == typeof_ || _f[typeof_] ? typeof_ : "left"));
      var n = t.textVerticalAlign || t.textBaseline;
      ("center" === n && (n = "middle"),
        (t.textVerticalAlign = null == n || wf[n] ? n : "top"),
        t.textPadding && (t.textPadding = P(t.textPadding)));
    }
  }
  function Ee(t, e, n, i, r, o) {
    i.rich
      ? (function (t, e, n, i, r, o) {
          o !== nf && (e.__attrCachedBy = ef.NONE);
          var a = t.__textCotentBlock;
          ((a && !t.__dirtyText) || (a = t.__textCotentBlock = De(n, i)),
            (function (t, e, n, i, r) {
              var o = n.width,
                a = n.outerWidth,
                s = n.outerHeight,
                l = i.textPadding,
                h = He(0, i, r),
                u = h.baseX,
                c = h.baseY,
                d = h.textAlign,
                f = h.textVerticalAlign;
              Ne(e, i, r, u, c);
              var p = xe(u, a, d),
                g = _e(c, s, f),
                m = p,
                v = g;
              l && ((m += l[3]), (v += l[0]));
              var y = m + o;
              Be(i) && Fe(t, e, i, p, g, a, s);
              for (var x = 0; x < n.lines.length; x++) {
                for (
                  var _,
                    w = n.lines[x],
                    b = w.tokens,
                    S = b.length,
                    M = w.lineHeight,
                    I = w.width,
                    T = 0,
                    A = m,
                    C = y,
                    D = S - 1;
                  T < S && (!(_ = b[T]).textAlign || "left" === _.textAlign);
                )
                  (Re(t, e, _, i, M, v, A, "left"), (I -= _.width), (A += _.width), T++);
                for (; D >= 0 && "right" === (_ = b[D]).textAlign;)
                  (Re(t, e, _, i, M, v, C, "right"), (I -= _.width), (C -= _.width), D--);
                for (A += (o - (A - m) - (y - C) - I) / 2; T <= D;)
                  (Re(t, e, (_ = b[T]), i, M, v, A + _.width / 2, "center"), (A += _.width), T++);
                v += M;
              }
            })(t, e, a, i, r));
        })(t, e, n, i, r, o)
      : (function (t, e, n, i, r, o) {
          var a,
            s = Be(i),
            l = !1,
            h = e.__attrCachedBy === ef.PLAIN_TEXT;
          o !== nf
            ? (o && ((a = o.style), (l = !s && h && a)),
              (e.__attrCachedBy = s ? ef.NONE : ef.PLAIN_TEXT))
            : h && (e.__attrCachedBy = ef.NONE);
          var u = i.font || xf;
          (l && u === (a.font || xf)) || (e.font = u);
          var c = t.__computedFont;
          t.__styleFont !== u && ((t.__styleFont = u), (c = t.__computedFont = e.font));
          var d = i.textPadding,
            f = i.textLineHeight,
            p = t.__textCotentBlock;
          (p && !t.__dirtyText) || (p = t.__textCotentBlock = Ce(n, c, d, f, i.truncate));
          var g = p.outerHeight,
            m = p.lines,
            v = p.lineHeight,
            y = He(0, i, r),
            x = y.baseX,
            _ = y.baseY,
            w = y.textAlign || "left",
            b = y.textVerticalAlign;
          Ne(e, i, r, x, _);
          var S = _e(_, g, b),
            M = x,
            I = S;
          if (s || d) {
            var T = ve(n, c);
            d && (T += d[1] + d[3]);
            var A = xe(x, T, w);
            (s && Fe(t, e, i, A, S, T, g), d && ((M = Xe(x, w, d)), (I += d[0])));
          }
          for (
            e.textAlign = w, e.textBaseline = "middle", e.globalAlpha = i.opacity || 1, B = 0;
            B < bf.length;
            B++
          ) {
            var C = bf[B],
              D = C[0],
              k = C[1],
              P = i[D];
            (l && P === a[D]) || (e[k] = tf(e, k, P || C[2]));
          }
          I += v / 2;
          var L = i.textStrokeWidth,
            O = l ? a.textStrokeWidth : null,
            z = !l || L !== O,
            E = !l || z || i.textStroke !== a.textStroke,
            N = Ge(i.textStroke, L),
            R = Ze(i.textFill);
          if (
            (N && (z && (e.lineWidth = L), E && (e.strokeStyle = N)),
            R && ((l && i.textFill === a.textFill) || (e.fillStyle = R)),
            1 === m.length)
          )
            (N && e.strokeText(m[0], M, I), R && e.fillText(m[0], M, I));
          else
            for (var B = 0; B < m.length; B++)
              (N && e.strokeText(m[B], M, I), R && e.fillText(m[B], M, I), (I += v));
        })(t, e, n, i, r, o);
  }
  function Ne(t, e, n, i, r) {
    if (n && e.textRotation) {
      var o = e.textOrigin;
      ("center" === o
        ? ((i = n.width / 2 + n.x), (r = n.height / 2 + n.y))
        : o && ((i = o[0] + n.x), (r = o[1] + n.y)),
        t.translate(i, r),
        t.rotate(-e.textRotation),
        t.translate(-i, -r));
    }
  }
  function Re(t, e, n, i, r, o, a, s) {
    var l = i.rich[n.styleName] || {};
    l.text = n.text;
    var h = n.textVerticalAlign,
      u = o + r / 2;
    ("top" === h ? (u = o + n.height / 2) : "bottom" === h && (u = o + r - n.height / 2),
      !n.isLineHolder &&
        Be(l) &&
        Fe(
          t,
          e,
          l,
          "right" === s ? a - n.width : "center" === s ? a - n.width / 2 : a,
          u - n.height / 2,
          n.width,
          n.height,
        ));
    var c = n.textPadding;
    (c && ((a = Xe(a, s, c)), (u -= n.height / 2 - c[2] - n.textHeight / 2)),
      We(e, "shadowBlur", D(l.textShadowBlur, i.textShadowBlur, 0)),
      We(e, "shadowColor", l.textShadowColor || i.textShadowColor || "transparent"),
      We(e, "shadowOffsetX", D(l.textShadowOffsetX, i.textShadowOffsetX, 0)),
      We(e, "shadowOffsetY", D(l.textShadowOffsetY, i.textShadowOffsetY, 0)),
      We(e, "textAlign", s),
      We(e, "textBaseline", "middle"),
      We(e, "font", n.font || xf));
    var d = Ge(l.textStroke || i.textStroke, p),
      f = Ze(l.textFill || i.textFill),
      p = C(l.textStrokeWidth, i.textStrokeWidth);
    (d && (We(e, "lineWidth", p), We(e, "strokeStyle", d), e.strokeText(n.text, a, u)),
      f && (We(e, "fillStyle", f), e.fillText(n.text, a, u)));
  }
  function Be(t) {
    return !!(t.textBackgroundColor || (t.textBorderWidth && t.textBorderColor));
  }
  function Fe(t, e, n, i, r, o, a) {
    var s = n.textBackgroundColor,
      l = n.textBorderWidth,
      h = n.textBorderColor,
      u = w(s);
    if (
      (We(e, "shadowBlur", n.textBoxShadowBlur || 0),
      We(e, "shadowColor", n.textBoxShadowColor || "transparent"),
      We(e, "shadowOffsetX", n.textBoxShadowOffsetX || 0),
      We(e, "shadowOffsetY", n.textBoxShadowOffsetY || 0),
      u || (l && h))
    ) {
      e.beginPath();
      var c = n.textBorderRadius;
      (c
        ? Le(e, {
            x: i,
            y: r,
            width: o,
            height: a,
            r: c,
          })
        : e.rect(i, r, o, a),
        e.closePath());
    }
    if (u)
      (We(e, "fillStyle", s),
        null != n.fillOpacity
          ? ((f = e.globalAlpha),
            (e.globalAlpha = n.fillOpacity * n.opacity),
            e.fill(),
            (e.globalAlpha = f))
          : e.fill());
    else if (b(s)) {
      var d = s.image;
      (d = pe(d, null, t, Ve, s)) && me(d) && e.drawImage(d, i, r, o, a);
    }
    if (l && h)
      if ((We(e, "lineWidth", l), We(e, "strokeStyle", h), null != n.strokeOpacity)) {
        var f = e.globalAlpha;
        ((e.globalAlpha = n.strokeOpacity * n.opacity), e.stroke(), (e.globalAlpha = f));
      } else e.stroke();
  }
  function Ve(t, e) {
    e.image = t;
  }
  function He(t, e, n) {
    var i = e.x || 0,
      r = e.y || 0,
      o = e.textAlign,
      a = e.textVerticalAlign;
    if (n) {
      var s = e.textPosition;
      if (s instanceof Array) ((i = n.x + Ue(s[0], n.width)), (r = n.y + Ue(s[1], n.height)));
      else {
        var l = we(s, n, e.textDistance);
        ((i = l.x), (r = l.y), (o = o || l.textAlign), (a = a || l.textVerticalAlign));
      }
      var h = e.textOffset;
      h && ((i += h[0]), (r += h[1]));
    }
    return {
      baseX: i,
      baseY: r,
      textAlign: o,
      textVerticalAlign: a,
    };
  }
  function We(t, e, n) {
    return ((t[e] = tf(t, e, n)), t[e]);
  }
  function Ge(t, e) {
    return null == t || e <= 0 || "transparent" === t || "none" === t
      ? null
      : t.image || t.colorStops
        ? "#000"
        : t;
  }
  function Ze(t) {
    return null == t || "none" === t ? null : t.image || t.colorStops ? "#000" : t;
  }
  function Ue(t, e) {
    return "string" == typeof t
      ? t.lastIndexOf("%") >= 0
        ? (parseFloat(t) / 100) * e
        : parseFloat(t)
      : t;
  }
  function Xe(t, e, n) {
    return "right" === e ? t - n[1] : "center" === e ? t + n[3] / 2 - n[1] / 2 : t + n[3];
  }
  function Ye(t, e) {
    return (
      null != t &&
      (t || e.textBackgroundColor || (e.textBorderWidth && e.textBorderColor) || e.textPadding)
    );
  }
  function je(t) {
    for (var typeof_ in ((t = t || {}), Ud.call(this, t), t))
      t.hasOwnProperty(typeof_) && "style" !== typeof_ && (this[typeof_] = t[typeof_]);
    ((this.style = new of(t.style, this)), (this._rect = null), (this.__clipPaths = []));
  }
  function qe(t) {
    je.call(this, t);
  }
  function $e(t) {
    return parseInt(t, 10);
  }
  function Ke(t) {
    return "mousewheel" === t && Hc.browser.firefox ? "DOMMouseScroll" : t;
  }
  function Qe(t) {
    ((t._touching = !0),
      clearTimeout(t._touchTimer),
      (t._touchTimer = setTimeout(function () {
        t._touching = !1;
      }, 700)));
  }
  function Je(t) {
    var typeof_ = t.pointerType;
    return "pen" === typeof_ || "touch" === typeof_;
  }
  function tn(t) {
    function e(e, n) {
      f(
        e,
        function (e) {
          at(t, Ke(e), n._handlers[e]);
        },
        n,
      );
    }
    (hd.call(this),
      (this.dom = t),
      (this._touching = !1),
      this._touchTimer,
      (this._handlers = {}),
      (function (t) {
        (f(kf, function (e) {
          t._handlers[e] = v(Of[e], t);
        }),
          f(Lf, function (e) {
            t._handlers[e] = v(Of[e], t);
          }),
          f(Df, function (e) {
            t._handlers[e] = (function (t, e) {
              return function () {
                if (!e._touching) return t.apply(e, arguments);
              };
            })(Of[e], t);
          }));
      })(this),
      Hc.pointerEventsSupported
        ? e(Lf, this)
        : (Hc.touchEventsSupported && e(kf, this), e(Df, this)));
  }
  function en(t, e) {
    var n = new Bf(Vc(), t, e);
    return ((Rf[n.id] = n), n);
  }
  function nn(t, e) {
    Nf[t] = e;
  }
  function rn(t) {
    return t instanceof Array ? t : null == t ? [] : [t];
  }
  function on(t, e, n) {
    if (t) {
      ((t[e] = t[e] || {}), (t.emphasis = t.emphasis || {}), (t.emphasis[e] = t.emphasis[e] || {}));
      for (var i = 0, r = n.length; i < r; i++) {
        var o = n[i];
        !t.emphasis[e].hasOwnProperty(o) && t[e].hasOwnProperty(o) && (t.emphasis[e][o] = t[e][o]);
      }
    }
  }
  function an(t) {
    return !Hf(t) || Wf(t) || t instanceof Date ? t : t.value;
  }
  function sn(t, e) {
    e = (e || []).slice();
    var n = p(t || [], function (t, e) {
      return {
        exist: t,
      };
    });
    return (
      Vf(e, function (t, i) {
        if (Hf(t)) {
          for (r = 0; r < n.length; r++)
            if (!n[r].option && null != t.id && n[r].exist.id === t.id + "")
              return ((n[r].option = t), void (e[i] = null));
          for (var r = 0; r < n.length; r++) {
            var o = n[r].exist;
            if (!(
              n[r].option ||
              (null != o.id && null != t.id) ||
              null == t.name ||
              un(t) ||
              un(o) ||
              o.name !== t.name + ""
            ))
              return ((n[r].option = t), void (e[i] = null));
          }
        }
      }),
      Vf(e, function (t, e) {
        if (Hf(t)) {
          for (var i = 0; i < n.length; i++) {
            var r = n[i].exist;
            if (!n[i].option && !un(r) && null == t.id) {
              n[i].option = t;
              break;
            }
          }
          i >= n.length &&
            n.push({
              option: t,
            });
        }
      }),
      n
    );
  }
  function ln(t) {
    var typeof_ = R();
    (Vf(t, function (t, n) {
      var i = t.exist;
      i && typeof_.set(i.id, t);
    }),
      Vf(t, function (t, n) {
        var i = t.option;
        (L(
          !i || null == i.id || !typeof_.get(i.id) || typeof_.get(i.id) === t,
          "id duplicates: " + (i && i.id),
        ),
          i && null != i.id && typeof_.set(i.id, t),
          !t.keyInfo && (t.keyInfo = {}));
      }),
      Vf(t, function (t, n) {
        var i = t.exist,
          r = t.option,
          o = t.keyInfo;
        if (Hf(r)) {
          if (((o.name = null != r.name ? r.name + "" : i ? i.name : Gf + n), i)) o.id = i.id;
          else if (null != r.id) o.id = r.id + "";
          else {
            var a = 0;
            do {
              o.id = "\0" + o.name + "\0" + a++;
            } while (typeof_.get(o.id));
          }
          typeof_.set(o.id, t);
        }
      }));
  }
  function hn(t) {
    var typeof_ = t.name;
    return !(!typeof_ || !typeof_.indexOf(Gf));
  }
  function un(t) {
    return Hf(t) && t.id && 0 === (t.id + "").indexOf("\0_ec_\0");
  }
  function cn(t, e) {
    return null != e.dataIndexInside
      ? e.dataIndexInside
      : null != e.dataIndex
        ? x(e.dataIndex)
          ? p(e.dataIndex, function (e) {
              return t.indexOfRawIndex(e);
            })
          : t.indexOfRawIndex(e.dataIndex)
        : null != e.name
          ? x(e.name)
            ? p(e.name, function (e) {
                return t.indexOfName(e);
              })
            : t.indexOfName(e.name)
          : void 0;
  }
  function dn() {
    var t = "__\0ec_inner_" + Uf++ + "_" + Math.random().toFixed(5);
    return function (e) {
      return e[t] || (e[t] = {});
    };
  }
  function fn(t, e, n) {
    if (w(e)) {
      var i = {};
      ((i[e + "Index"] = 0), (e = i));
    }
    var r = n && n.defaultMainType;
    !r || pn(e, r + "Index") || pn(e, r + "Id") || pn(e, r + "Name") || (e[r + "Index"] = 0);
    var o = {};
    return (
      Vf(e, function (i, r) {
        if (((i = e[r]), "dataIndex" !== r && "dataIndexInside" !== r)) {
          var a = r.match(/^(\w+)(Index|Id|Name)$/) || [],
            s = a[1],
            l = (a[2] || "").toLowerCase();
          if (!(
            !s ||
            !l ||
            null == i ||
            ("index" === l && "none" === i) ||
            (n && n.includeMainTypes && h(n.includeMainTypes, s) < 0)
          )) {
            var u = {
              mainType: s,
            };
            ("index" === l && "all" === i) || (u[l] = i);
            var c = t.queryComponents(u);
            ((o[s + "Models"] = c), (o[s + "Model"] = c[0]));
          }
        } else o[r] = i;
      }),
      o
    );
  }
  function pn(t, e) {
    return t && t.hasOwnProperty(e);
  }
  function gn(t, e, n) {
    t.setAttribute ? t.setAttribute(e, n) : (t[e] = n);
  }
  function mn(t) {
    return "auto" === t ? (Hc.domSupported ? "html" : "richText") : t || "html";
  }
  function vn(t) {
    var typeof_ = {
      main: "",
      sub: "",
    };
    return (
      t && ((t = t.split(Xf)), (typeof_.main = t[0] || ""), (typeof_.sub = t[1] || "")),
      typeof_
    );
  }
  function yn(t, e) {
    ((t.$constructor = t),
      (t.extend = function (t) {
        var typeof_ = this,
          n = function () {
            t.$constructor ? t.$constructor.apply(this, arguments) : typeof_.apply(this, arguments);
          };
        return (
          a(n.prototype, t),
          (n.extend = this.extend),
          (n.superCall = _n),
          (n.superApply = wn),
          u(n, this),
          (n.superClass = typeof_),
          n
        );
      }));
  }
  function xn(t) {
    var typeof_ = ["__\0is_clz", jf++, Math.random().toFixed(3)].join("_");
    ((t.prototype[typeof_] = !0),
      (t.isInstance = function (t) {
        return !(!t || !t[typeof_]);
      }));
  }
  function _n(t, e) {
    var n = k(arguments, 2);
    return this.superClass.prototype[e].apply(t, n);
  }
  function wn(t, e, n) {
    return this.superClass.prototype[e].apply(t, n);
  }
  function bn(t, e) {
    e = e || {};
    var n = {};
    if (
      ((t.registerClass = function (t, e) {
        return (
          e &&
            ((function (t) {
              L(/^[a-zA-Z0-9_]+([.][a-zA-Z0-9_]+)?$/.test(t), 'componentType "' + t + '" illegal');
            })(e),
            (e = vn(e)).sub
              ? e.sub !== Yf &&
                ((function (t) {
                  var typeof_ = n[t.main];
                  return ((typeof_ && typeof_[Yf]) || ((e = n[t.main] = {})[Yf] = !0), typeof_);
                })(e)[e.sub] = t)
              : (n[e.main] = t)),
          t
        );
      }),
      (t.getClass = function (t, e, i) {
        var r = n[t];
        if ((r && r[Yf] && (r = e ? r[e] : null), i && !r))
          throw new Error(
            e
              ? "Component " + t + "." + (e || "") + " not exists. Load it first."
              : t + ".type should be specified.",
          );
        return r;
      }),
      (t.getClassesByMainType = function (t) {
        t = vn(t);
        var typeof_ = [],
          i = n[t.main];
        return (
          i && i[Yf]
            ? f(i, function (t, n) {
                n !== Yf && typeof_.push(t);
              })
            : typeof_.push(i),
          typeof_
        );
      }),
      (t.hasClass = function (t) {
        return ((t = vn(t)), !!n[t.main]);
      }),
      (t.getAllClassMainTypes = function () {
        var t = [];
        return (
          f(n, function (e, n) {
            t.push(n);
          }),
          t
        );
      }),
      (t.hasSubTypes = function (t) {
        t = vn(t);
        var typeof_ = n[t.main];
        return typeof_ && typeof_[Yf];
      }),
      (t.parseClassType = vn),
      e.registerWhenExtend)
    ) {
      var i = t.extend;
      i &&
        (t.extend = function (e) {
          var n = i.call(this, e);
          return t.registerClass(n, e.type);
        });
    }
    return t;
  }
  function Sn(t) {
    return t > -np && t < np;
  }
  function Mn(t) {
    return t > np || t < -np;
  }
  function In(t, e, n, i, r) {
    var o = 1 - r;
    return o * o * (o * t + 3 * r * e) + r * r * (r * i + 3 * o * n);
  }
  function Tn(t, e, n, i, r) {
    var o = 1 - r;
    return 3 * (((e - t) * o + 2 * (n - e) * r) * o + (i - n) * r * r);
  }
  function An(t, e, n, i, r) {
    var o = 6 * n - 12 * e + 6 * t,
      a = 9 * e + 3 * i - 3 * t - 9 * n,
      s = 3 * e - 3 * t,
      l = 0;
    if (Sn(a)) Mn(o) && (c = -s / o) >= 0 && c <= 1 && (r[l++] = c);
    else {
      var h = o * o - 4 * a * s;
      if (Sn(h)) r[0] = -o / (2 * a);
      else if (h > 0) {
        var u = ep(h),
          c = (-o + u) / (2 * a),
          d = (-o - u) / (2 * a);
        (c >= 0 && c <= 1 && (r[l++] = c), d >= 0 && d <= 1 && (r[l++] = d));
      }
    }
    return l;
  }
  function Cn(t, e, n, i, r, o) {
    var a = (e - t) * r + t,
      s = (n - e) * r + e,
      l = (i - n) * r + n,
      h = (s - a) * r + a,
      u = (l - s) * r + s,
      c = (u - h) * r + h;
    ((o[0] = t),
      (o[1] = a),
      (o[2] = h),
      (o[3] = c),
      (o[4] = c),
      (o[5] = u),
      (o[6] = l),
      (o[7] = i));
  }
  function Dn(t, e, n, i) {
    var r = 1 - i;
    return r * (r * t + 2 * i * e) + i * i * n;
  }
  function kn(t, e, n, i) {
    return 2 * ((1 - i) * (e - t) + i * (n - e));
  }
  function Pn(t, e, n) {
    var i = t + n - 2 * e;
    return 0 === i ? 0.5 : (t - e) / i;
  }
  function Ln(t, e, n, i, r) {
    var o = (e - t) * i + t,
      a = (n - e) * i + e,
      s = (a - o) * i + o;
    ((r[0] = t), (r[1] = o), (r[2] = s), (r[3] = s), (r[4] = a), (r[5] = n));
  }
  function On(t, e, n) {
    if (0 !== t.length) {
      var i,
        r = t[0],
        o = r[0],
        a = r[0],
        s = r[1],
        l = r[1];
      for (i = 1; i < t.length; i++)
        ((r = t[i]), (o = hp(o, r[0])), (a = up(a, r[0])), (s = hp(s, r[1])), (l = up(l, r[1])));
      ((e[0] = o), (e[1] = s), (n[0] = a), (n[1] = l));
    }
  }
  function zn(t, e, n, i, r, o) {
    ((r[0] = hp(t, n)), (r[1] = hp(e, i)), (o[0] = up(t, n)), (o[1] = up(e, i)));
  }
  function En(t, e, n, i, r, o, a, s, l, h) {
    var u,
      c = An,
      d = In,
      f = c(t, n, r, a, vp);
    for (l[0] = 1 / 0, l[1] = 1 / 0, h[0] = -1 / 0, h[1] = -1 / 0, u = 0; u < f; u++) {
      var p = d(t, n, r, a, vp[u]);
      ((l[0] = hp(p, l[0])), (h[0] = up(p, h[0])));
    }
    for (f = c(e, i, o, s, yp), u = 0; u < f; u++) {
      var g = d(e, i, o, s, yp[u]);
      ((l[1] = hp(g, l[1])), (h[1] = up(g, h[1])));
    }
    ((l[0] = hp(t, l[0])),
      (h[0] = up(t, h[0])),
      (l[0] = hp(a, l[0])),
      (h[0] = up(a, h[0])),
      (l[1] = hp(e, l[1])),
      (h[1] = up(e, h[1])),
      (l[1] = hp(s, l[1])),
      (h[1] = up(s, h[1])));
  }
  function Nn(t, e, n, i, r, o, a, s) {
    var l = Pn,
      h = Dn,
      u = up(hp(l(t, n, r), 1), 0),
      c = up(hp(l(e, i, o), 1), 0),
      d = h(t, n, r, u),
      f = h(e, i, o, c);
    ((a[0] = hp(t, r, d)), (a[1] = hp(e, o, f)), (s[0] = up(t, r, d)), (s[1] = up(e, o, f)));
  }
  function Rn(t, e, n, i, r, o, a, s, l) {
    var h = Q,
      u = J,
      c = Math.abs(r - o);
    if (c % fp < 1e-4 && c > 1e-4)
      return ((s[0] = t - n), (s[1] = e - i), (l[0] = t + n), void (l[1] = e + i));
    if (
      ((pp[0] = dp(r) * n + t),
      (pp[1] = cp(r) * i + e),
      (gp[0] = dp(o) * n + t),
      (gp[1] = cp(o) * i + e),
      h(s, pp, gp),
      u(l, pp, gp),
      (r %= fp) < 0 && (r += fp),
      (o %= fp) < 0 && (o += fp),
      r > o && !a ? (o += fp) : r < o && a && (r += fp),
      a)
    ) {
      var d = o;
      ((o = r), (r = d));
    }
    for (var f = 0; f < o; f += Math.PI / 2)
      f > r && ((mp[0] = dp(f) * n + t), (mp[1] = cp(f) * i + e), h(s, mp, s), u(l, mp, l));
  }
  function Bn(t, e, n, i, r, o, a) {
    if (0 === r) return !1;
    var s,
      l = r;
    if (
      (a > e + l && a > i + l) ||
      (a < e - l && a < i - l) ||
      (o > t + l && o > n + l) ||
      (o < t - l && o < n - l)
    )
      return !1;
    if (t === n) return Math.abs(o - t) <= l / 2;
    var h = (s = (e - i) / (t - n)) * o - a + (t * i - n * e) / (t - n);
    return (h * h) / (s * s + 1) <= ((l / 2) * l) / 2;
  }
  function Fn(t, e, n, i, r, o, a, s, l, h, u) {
    if (0 === l) return !1;
    var c = l;
    return (
      !(
        (u > e + c && u > i + c && u > o + c && u > s + c) ||
        (u < e - c && u < i - c && u < o - c && u < s - c) ||
        (h > t + c && h > n + c && h > r + c && h > a + c) ||
        (h < t - c && h < n - c && h < r - c && h < a - c)
      ) &&
      (function (t, e, n, i, r, o, a, s, l, h, u) {
        var c,
          d,
          f,
          p,
          g,
          m = 0.005,
          v = 1 / 0;
        ((ap[0] = l), (ap[1] = h));
        for (var y = 0; y < 1; y += 0.05)
          ((sp[0] = In(t, n, r, a, y)),
            (sp[1] = In(e, i, o, s, y)),
            (p = ad(ap, sp)) < v && ((c = y), (v = p)));
        v = 1 / 0;
        for (var x = 0; x < 32 && !(m < ip); x++)
          ((d = c - m),
            (f = c + m),
            (sp[0] = In(t, n, r, a, d)),
            (sp[1] = In(e, i, o, s, d)),
            (p = ad(sp, ap)),
            d >= 0 && p < v
              ? ((c = d), (v = p))
              : ((lp[0] = In(t, n, r, a, f)),
                (lp[1] = In(e, i, o, s, f)),
                (g = ad(lp, ap)),
                f <= 1 && g < v ? ((c = f), (v = g)) : (m *= 0.5)));
        return (u && ((u[0] = In(t, n, r, a, c)), (u[1] = In(e, i, o, s, c))), ep(v));
      })(t, e, n, i, r, o, a, s, h, u, null) <=
        c / 2
    );
  }
  function Vn(t, e, n, i, r, o, a, s, l) {
    if (0 === a) return !1;
    var h = a;
    return (
      !(
        (l > e + h && l > i + h && l > o + h) ||
        (l < e - h && l < i - h && l < o - h) ||
        (s > t + h && s > n + h && s > r + h) ||
        (s < t - h && s < n - h && s < r - h)
      ) &&
      (function (t, e, n, i, r, o, a, s, l) {
        var h,
          u = 0.005,
          c = 1 / 0;
        ((ap[0] = a), (ap[1] = s));
        for (var d = 0; d < 1; d += 0.05)
          ((sp[0] = Dn(t, n, r, d)),
            (sp[1] = Dn(e, i, o, d)),
            (m = ad(ap, sp)) < c && ((h = d), (c = m)));
        c = 1 / 0;
        for (var f = 0; f < 32 && !(u < ip); f++) {
          var p = h - u,
            g = h + u;
          ((sp[0] = Dn(t, n, r, p)), (sp[1] = Dn(e, i, o, p)));
          var m = ad(sp, ap);
          if (p >= 0 && m < c) ((h = p), (c = m));
          else {
            ((lp[0] = Dn(t, n, r, g)), (lp[1] = Dn(e, i, o, g)));
            var v = ad(lp, ap);
            g <= 1 && v < c ? ((h = g), (c = v)) : (u *= 0.5);
          }
        }
        return (l && ((l[0] = Dn(t, n, r, h)), (l[1] = Dn(e, i, o, h))), ep(c));
      })(t, e, n, i, r, o, s, l, null) <=
        h / 2
    );
  }
  function Hn(t) {
    return ((t %= Lp) < 0 && (t += Lp), t);
  }
  function Wn(t, e, n, i, r, o, a, s, l) {
    if (0 === a) return !1;
    var h = a;
    ((s -= t), (l -= e));
    var u = Math.sqrt(s * s + l * l);
    if (u - h > n || u + h < n) return !1;
    if (Math.abs(i - r) % Op < 1e-4) return !0;
    if (o) {
      var c = i;
      ((i = Hn(r)), (r = Hn(c)));
    } else ((i = Hn(i)), (r = Hn(r)));
    i > r && (r += Op);
    var d = Math.atan2(l, s);
    return (d < 0 && (d += Op), (d >= i && d <= r) || (d + Op >= i && d + Op <= r));
  }
  function Gn(t, e, n, i, r, o) {
    if ((o > e && o > i) || (o < e && o < i)) return 0;
    if (i === e) return 0;
    var a = i < e ? 1 : -1,
      s = (o - e) / (i - e);
    (1 !== s && 0 !== s) || (a = i < e ? 0.5 : -0.5);
    var l = s * (n - t) + t;
    return l === r ? 1 / 0 : l > r ? a : 0;
  }
  function Zn() {
    var t = Bp[0];
    ((Bp[0] = Bp[1]), (Bp[1] = t));
  }
  function Un(t, e, n, i, r, o, a, s, l, h) {
    if ((h > e && h > i && h > o && h > s) || (h < e && h < i && h < o && h < s)) return 0;
    var u = (function (t, e, n, i, r, o) {
      var a = i + 3 * (e - n) - t,
        s = 3 * (n - 2 * e + t),
        l = 3 * (e - t),
        h = t - r,
        u = s * s - 3 * a * l,
        c = s * l - 9 * a * h,
        d = l * l - 3 * s * h,
        f = 0;
      if (Sn(u) && Sn(c)) Sn(s) ? (o[0] = 0) : (M = -l / s) >= 0 && M <= 1 && (o[f++] = M);
      else {
        var p = c * c - 4 * u * d;
        if (Sn(p)) {
          var g = c / u,
            m = -g / 2;
          ((M = -s / a + g) >= 0 && M <= 1 && (o[f++] = M), m >= 0 && m <= 1 && (o[f++] = m));
        } else if (p > 0) {
          var v = ep(p),
            y = u * s + 1.5 * a * (-c + v),
            x = u * s + 1.5 * a * (-c - v);
          (M =
            (-s - ((y = y < 0 ? -tp(-y, op) : tp(y, op)) + (x = x < 0 ? -tp(-x, op) : tp(x, op)))) /
            (3 * a)) >= 0 &&
            M <= 1 &&
            (o[f++] = M);
        } else {
          var _ = (2 * u * s - 3 * a * c) / (2 * ep(u * u * u)),
            w = Math.acos(_) / 3,
            b = ep(u),
            S = Math.cos(w),
            M = (-s - 2 * b * S) / (3 * a),
            I =
              ((m = (-s + b * (S + rp * Math.sin(w))) / (3 * a)),
              (-s + b * (S - rp * Math.sin(w))) / (3 * a));
          (M >= 0 && M <= 1 && (o[f++] = M),
            m >= 0 && m <= 1 && (o[f++] = m),
            I >= 0 && I <= 1 && (o[f++] = I));
        }
      }
      return f;
    })(e, i, o, s, h, Rp);
    if (0 === u) return 0;
    for (var c, d, f = 0, p = -1, g = 0; g < u; g++) {
      var m = Rp[g],
        v = 0 === m || 1 === m ? 0.5 : 1;
      In(t, n, r, a, m) < l ||
        (p < 0 &&
          ((p = An(e, i, o, s, Bp)),
          Bp[1] < Bp[0] && p > 1 && Zn(),
          (c = In(e, i, o, s, Bp[0])),
          p > 1 && (d = In(e, i, o, s, Bp[1]))),
        2 === p
          ? m < Bp[0]
            ? (f += c < e ? v : -v)
            : m < Bp[1]
              ? (f += d < c ? v : -v)
              : (f += s < d ? v : -v)
          : m < Bp[0]
            ? (f += c < e ? v : -v)
            : (f += s < c ? v : -v));
    }
    return f;
  }
  function Xn(t, e, n, i, r, o, a, s) {
    if ((s > e && s > i && s > o) || (s < e && s < i && s < o)) return 0;
    var l = (function (t, e, n, i, r) {
      var o = t - 2 * e + n,
        a = 2 * (e - t),
        s = t - i,
        l = 0;
      if (Sn(o)) Mn(a) && (c = -s / a) >= 0 && c <= 1 && (r[l++] = c);
      else {
        var h = a * a - 4 * o * s;
        if (Sn(h)) (c = -a / (2 * o)) >= 0 && c <= 1 && (r[l++] = c);
        else if (h > 0) {
          var u = ep(h),
            c = (-a + u) / (2 * o),
            d = (-a - u) / (2 * o);
          (c >= 0 && c <= 1 && (r[l++] = c), d >= 0 && d <= 1 && (r[l++] = d));
        }
      }
      return l;
    })(e, i, o, s, Rp);
    if (0 === l) return 0;
    var h = Pn(e, i, o);
    if (h >= 0 && h <= 1) {
      for (var u = 0, c = Dn(e, i, o, h), d = 0; d < l; d++)
        ((f = 0 === Rp[d] || 1 === Rp[d] ? 0.5 : 1),
          (p = Dn(t, n, r, Rp[d])) < a ||
            (Rp[d] < h ? (u += c < e ? f : -f) : (u += o < c ? f : -f)));
      return u;
    }
    var f = 0 === Rp[0] || 1 === Rp[0] ? 0.5 : 1,
      p = Dn(t, n, r, Rp[0]);
    return p < a ? 0 : o < e ? f : -f;
  }
  function Yn(t, e, n, i, r, o, a, s) {
    if ((s -= e) > n || s < -n) return 0;
    ((h = Math.sqrt(n * n - s * s)), (Rp[0] = -h), (Rp[1] = h));
    var l = Math.abs(i - r);
    if (l < 1e-4) return 0;
    if (l % Ep < 1e-4)
      return ((i = 0), (r = Ep), (p = o ? 1 : -1), a >= Rp[0] + t && a <= Rp[1] + t ? p : 0);
    if (o) {
      var h = i;
      ((i = Hn(r)), (r = Hn(h)));
    } else ((i = Hn(i)), (r = Hn(r)));
    i > r && (r += Ep);
    for (var u = 0, c = 0; c < 2; c++) {
      var d = Rp[c];
      if (d + t > a) {
        var f = Math.atan2(s, d),
          p = o ? 1 : -1;
        (f < 0 && (f = Ep + f),
          ((f >= i && f <= r) || (f + Ep >= i && f + Ep <= r)) &&
            (f > Math.PI / 2 && f < 1.5 * Math.PI && (p = -p), (u += p)));
      }
    }
    return u;
  }
  function jn(t, e, n, i, r) {
    for (var o = 0, a = 0, s = 0, l = 0, h = 0, u = 0; u < t.length;) {
      var c = t[u++];
      switch (
        (c === zp.M && u > 1 && (n || (o += Gn(a, s, l, h, i, r))),
        1 === u && ((l = a = t[u]), (h = s = t[u + 1])),
        c)
      ) {
        case zp.M:
          ((a = l = t[u++]), (s = h = t[u++]));
          break;
        case zp.L:
          if (n) {
            if (Bn(a, s, t[u], t[u + 1], e, i, r)) return !0;
          } else o += Gn(a, s, t[u], t[u + 1], i, r) || 0;
          ((a = t[u++]), (s = t[u++]));
          break;
        case zp.C:
          if (n) {
            if (Fn(a, s, t[u++], t[u++], t[u++], t[u++], t[u], t[u + 1], e, i, r)) return !0;
          } else o += Un(a, s, t[u++], t[u++], t[u++], t[u++], t[u], t[u + 1], i, r) || 0;
          ((a = t[u++]), (s = t[u++]));
          break;
        case zp.Q:
          if (n) {
            if (Vn(a, s, t[u++], t[u++], t[u], t[u + 1], e, i, r)) return !0;
          } else o += Xn(a, s, t[u++], t[u++], t[u], t[u + 1], i, r) || 0;
          ((a = t[u++]), (s = t[u++]));
          break;
        case zp.A:
          var d = t[u++],
            f = t[u++],
            p = t[u++],
            g = t[u++],
            m = t[u++],
            v = t[u++];
          u += 1;
          var y = 1 - t[u++],
            x = Math.cos(m) * p + d,
            _ = Math.sin(m) * g + f;
          u > 1 ? (o += Gn(a, s, x, _, i, r)) : ((l = x), (h = _));
          var w = ((i - d) * g) / p + d;
          if (n) {
            if (Wn(d, f, g, m, m + v, y, e, w, r)) return !0;
          } else o += Yn(d, f, g, m, m + v, y, w, r);
          ((a = Math.cos(m + v) * p + d), (s = Math.sin(m + v) * g + f));
          break;
        case zp.R:
          if (((l = a = t[u++]), (h = s = t[u++]), (x = l + t[u++]), (_ = h + t[u++]), n)) {
            if (
              Bn(l, h, x, h, e, i, r) ||
              Bn(x, h, x, _, e, i, r) ||
              Bn(x, _, l, _, e, i, r) ||
              Bn(l, _, l, h, e, i, r)
            )
              return !0;
          } else ((o += Gn(x, h, x, _, i, r)), (o += Gn(l, _, l, h, i, r)));
          break;
        case zp.Z:
          if (n) {
            if (Bn(a, s, l, h, e, i, r)) return !0;
          } else o += Gn(a, s, l, h, i, r);
          ((a = l), (s = h));
      }
    }
    return (
      n ||
        (function (t, e) {
          return Math.abs(t - e) < Np;
        })(s, h) ||
        (o += Gn(a, s, l, h, i, r) || 0),
      0 !== o
    );
  }
  function qn(t) {
    (je.call(this, t), (this.path = null));
  }
  function $n(t, e, n, i, r, o, a, s, l, h, u) {
    var c = l * ($p / 180),
      d = (qp(c) * (t - n)) / 2 + (jp(c) * (e - i)) / 2,
      f = (-1 * jp(c) * (t - n)) / 2 + (qp(c) * (e - i)) / 2,
      p = (d * d) / (a * a) + (f * f) / (s * s);
    p > 1 && ((a *= Yp(p)), (s *= Yp(p)));
    var g =
        (r === o ? -1 : 1) *
          Yp(
            (a * a * (s * s) - a * a * (f * f) - s * s * (d * d)) /
              (a * a * (f * f) + s * s * (d * d)),
          ) || 0,
      m = (g * a * f) / s,
      v = (g * -s * d) / a,
      y = (t + n) / 2 + qp(c) * m - jp(c) * v,
      x = (e + i) / 2 + jp(c) * m + qp(c) * v,
      _ = Jp([1, 0], [(d - m) / a, (f - v) / s]),
      w = [(d - m) / a, (f - v) / s],
      b = [(-1 * d - m) / a, (-1 * f - v) / s],
      S = Jp(w, b);
    (Qp(w, b) <= -1 && (S = $p),
      Qp(w, b) >= 1 && (S = 0),
      0 === o && S > 0 && (S -= 2 * $p),
      1 === o && S < 0 && (S += 2 * $p),
      u.addData(h, y, x, a, s, _, S, c, o));
  }
  function Kn(t, e) {
    var n = (function (t) {
      if (!t) return new Pp();
      for (
        var typeof_, n = 0, i = 0, r = n, o = i, a = new Pp(), s = Pp.CMD, l = t.match(tg), h = 0;
        h < l.length;
        h++
      ) {
        for (
          var u, c = l[h], d = c.charAt(0), f = c.match(eg) || [], p = f.length, g = 0;
          g < p;
          g++
        )
          f[g] = parseFloat(f[g]);
        for (var m = 0; m < p;) {
          var v,
            y,
            x,
            _,
            w,
            b,
            S,
            M = n,
            I = i;
          switch (d) {
            case "l":
              ((n += f[m++]), (i += f[m++]), (u = s.L), a.addData(u, n, i));
              break;
            case "L":
              ((n = f[m++]), (i = f[m++]), (u = s.L), a.addData(u, n, i));
              break;
            case "m":
              ((n += f[m++]),
                (i += f[m++]),
                (u = s.M),
                a.addData(u, n, i),
                (r = n),
                (o = i),
                (d = "l"));
              break;
            case "M":
              ((n = f[m++]),
                (i = f[m++]),
                (u = s.M),
                a.addData(u, n, i),
                (r = n),
                (o = i),
                (d = "L"));
              break;
            case "h":
              ((n += f[m++]), (u = s.L), a.addData(u, n, i));
              break;
            case "H":
              ((n = f[m++]), (u = s.L), a.addData(u, n, i));
              break;
            case "v":
              ((i += f[m++]), (u = s.L), a.addData(u, n, i));
              break;
            case "V":
              ((i = f[m++]), (u = s.L), a.addData(u, n, i));
              break;
            case "C":
              ((u = s.C),
                a.addData(u, f[m++], f[m++], f[m++], f[m++], f[m++], f[m++]),
                (n = f[m - 2]),
                (i = f[m - 1]));
              break;
            case "c":
              ((u = s.C),
                a.addData(
                  u,
                  f[m++] + n,
                  f[m++] + i,
                  f[m++] + n,
                  f[m++] + i,
                  f[m++] + n,
                  f[m++] + i,
                ),
                (n += f[m - 2]),
                (i += f[m - 1]));
              break;
            case "S":
              ((v = n), (y = i));
              var T = a.len(),
                A = a.data;
              (typeof_ === s.C && ((v += n - A[T - 4]), (y += i - A[T - 3])),
                (u = s.C),
                (M = f[m++]),
                (I = f[m++]),
                (n = f[m++]),
                (i = f[m++]),
                a.addData(u, v, y, M, I, n, i));
              break;
            case "s":
              ((v = n),
                (y = i),
                (T = a.len()),
                (A = a.data),
                typeof_ === s.C && ((v += n - A[T - 4]), (y += i - A[T - 3])),
                (u = s.C),
                (M = n + f[m++]),
                (I = i + f[m++]),
                (n += f[m++]),
                (i += f[m++]),
                a.addData(u, v, y, M, I, n, i));
              break;
            case "Q":
              ((M = f[m++]),
                (I = f[m++]),
                (n = f[m++]),
                (i = f[m++]),
                (u = s.Q),
                a.addData(u, M, I, n, i));
              break;
            case "q":
              ((M = f[m++] + n),
                (I = f[m++] + i),
                (n += f[m++]),
                (i += f[m++]),
                (u = s.Q),
                a.addData(u, M, I, n, i));
              break;
            case "T":
              ((v = n),
                (y = i),
                (T = a.len()),
                (A = a.data),
                typeof_ === s.Q && ((v += n - A[T - 4]), (y += i - A[T - 3])),
                (n = f[m++]),
                (i = f[m++]),
                (u = s.Q),
                a.addData(u, v, y, n, i));
              break;
            case "t":
              ((v = n),
                (y = i),
                (T = a.len()),
                (A = a.data),
                typeof_ === s.Q && ((v += n - A[T - 4]), (y += i - A[T - 3])),
                (n += f[m++]),
                (i += f[m++]),
                (u = s.Q),
                a.addData(u, v, y, n, i));
              break;
            case "A":
              ((x = f[m++]),
                (_ = f[m++]),
                (w = f[m++]),
                (b = f[m++]),
                (S = f[m++]),
                $n((M = n), (I = i), (n = f[m++]), (i = f[m++]), b, S, x, _, w, (u = s.A), a));
              break;
            case "a":
              ((x = f[m++]),
                (_ = f[m++]),
                (w = f[m++]),
                (b = f[m++]),
                (S = f[m++]),
                $n((M = n), (I = i), (n += f[m++]), (i += f[m++]), b, S, x, _, w, (u = s.A), a));
          }
        }
        (("z" !== d && "Z" !== d) || ((u = s.Z), a.addData(u), (n = r), (i = o)), (e = u));
      }
      return (a.toStatic(), a);
    })(t);
    return (
      ((e = e || {}).buildPath = function (t) {
        if (t.setData) (t.setData(n.data), (e = t.getContext()) && t.rebuildPath(typeof_));
        else {
          var typeof_ = t;
          n.rebuildPath(typeof_);
        }
      }),
      (e.applyTransform = function (t) {
        (Xp(n, t), this.dirty(!0));
      }),
      e
    );
  }
  function Qn(t, e) {
    return new qn(Kn(t, e));
  }
  function Jn(t, e, n, i, r, o, a) {
    var s = 0.5 * (n - t),
      l = 0.5 * (i - e);
    return (2 * (e - n) + s + l) * a + (-3 * (e - n) - 2 * s - l) * o + s * r + e;
  }
  function ti(t, e, n) {
    var i = e.points,
      r = e.smooth;
    if (i && i.length >= 2) {
      if (r && "spline" !== r) {
        var o = hg(i, r, n, e.smoothConstraint);
        t.moveTo(i[0][0], i[0][1]);
        for (var a = i.length, s = 0; s < (n ? a : a - 1); s++) {
          var l = o[2 * s],
            h = o[2 * s + 1],
            u = i[(s + 1) % a];
          t.bezierCurveTo(l[0], l[1], h[0], h[1], u[0], u[1]);
        }
      } else {
        ("spline" === r && (i = lg(i, n)), t.moveTo(i[0][0], i[0][1]), (s = 1));
        for (var c = i.length; s < c; s++) t.lineTo(i[s][0], i[s][1]);
      }
      n && t.closePath();
    }
  }
  function ei(t, e, n) {
    var i = dg(2 * t);
    return (i + dg(e)) % 2 == 0 ? i / 2 : (i + (n ? 1 : -1)) / 2;
  }
  function ni(t, e, n) {
    var i = t.cpx2,
      r = t.cpy2;
    return null === i || null === r
      ? [(n ? Tn : In)(t.x1, t.cpx1, t.cpx2, t.x2, e), (n ? Tn : In)(t.y1, t.cpy1, t.cpy2, t.y2, e)]
      : [(n ? kn : Dn)(t.x1, t.cpx1, t.x2, e), (n ? kn : Dn)(t.y1, t.cpy1, t.y2, e)];
  }
  function ii(t) {
    (je.call(this, t),
      (this._displayables = []),
      (this._temporaryDisplayables = []),
      (this._cursor = 0),
      (this.notClear = !0));
  }
  function ri(t) {
    return qn.extend(t);
  }
  function oi(t, e, n, i) {
    var r = Qn(t, e);
    return (n && ("center" === i && (n = si(n, r.getBoundingRect())), li(r, n)), r);
  }
  function ai(t, e, n) {
    var i = new qe({
      style: {
        image: t,
        x: e.x,
        y: e.y,
        width: e.width,
        height: e.height,
      },
      onload: function (t) {
        if ("center" === n) {
          var r = {
            width: t.width,
            height: t.height,
          };
          i.setStyle(si(e, r));
        }
      },
    });
    return i;
  }
  function si(t, e) {
    var n,
      i = e.width / e.height,
      r = t.height * i;
    return (
      (n = r <= t.width ? t.height : (r = t.width) / i),
      {
        x: t.x + t.width / 2 - r / 2,
        y: t.y + t.height / 2 - n / 2,
        width: r,
        height: n,
      }
    );
  }
  function li(t, e) {
    if (t.applyTransform) {
      var n = t.getBoundingRect().calculateTransform(e);
      t.applyTransform(n);
    }
  }
  function hi(t) {
    var typeof_ = t.shape,
      n = t.style.lineWidth;
    return (
      Ig(2 * typeof_.x1) === Ig(2 * typeof_.x2) &&
        (typeof_.x1 = typeof_.x2 = ci(typeof_.x1, n, !0)),
      Ig(2 * typeof_.y1) === Ig(2 * typeof_.y2) &&
        (typeof_.y1 = typeof_.y2 = ci(typeof_.y1, n, !0)),
      t
    );
  }
  function ui(t) {
    var typeof_ = t.shape,
      n = t.style.lineWidth,
      i = typeof_.x,
      r = typeof_.y,
      o = typeof_.width,
      a = typeof_.height;
    return (
      (typeof_.x = ci(typeof_.x, n, !0)),
      (typeof_.y = ci(typeof_.y, n, !0)),
      (typeof_.width = Math.max(ci(i + o, n, !1) - typeof_.x, 0 === o ? 0 : 1)),
      (typeof_.height = Math.max(ci(r + a, n, !1) - typeof_.y, 0 === a ? 0 : 1)),
      t
    );
  }
  function ci(t, e, n) {
    var i = Ig(2 * t);
    return (i + Ig(e)) % 2 == 0 ? i / 2 : (i + (n ? 1 : -1)) / 2;
  }
  function di(t) {
    return null != t && "none" !== t;
  }
  function fi(t) {
    var typeof_ = t.__hoverStl;
    if (typeof_ && !t.__highlighted) {
      var n = t.useHoverLayer;
      t.__highlighted = n ? "layer" : "plain";
      var i = t.__zr;
      if (i || !n) {
        var r = t,
          o = t.style;
        (n && (o = (r = i.addHover(t)).style),
          Pi(o),
          n ||
            (function (t) {
              if (t.__hoverStlDirty) {
                t.__hoverStlDirty = !1;
                var typeof_ = t.__hoverStl;
                if (typeof_) {
                  var n = (t.__cachedNormalStl = {});
                  t.__cachedNormalZ2 = t.z2;
                  var i = t.style;
                  for (var r in typeof_) null != typeof_[r] && (n[r] = i[r]);
                  ((n.fill = i.fill), (n.stroke = i.stroke));
                } else t.__cachedNormalStl = t.__cachedNormalZ2 = null;
              }
            })(r),
          o.extendFrom(typeof_),
          pi(o, typeof_, "fill"),
          pi(o, typeof_, "stroke"),
          ki(o),
          n || (t.dirty(!1), (t.z2 += Dg)));
      }
    }
  }
  function pi(t, e, n) {
    !di(e[n]) &&
      di(t[n]) &&
      (t[n] = (function (t) {
        if ("string" != typeof t) return t;
        var typeof_ = kg.get(t);
        return (typeof_ || ((e = zt(t, -0.1)), Pg < 1e4 && (kg.set(t, typeof_), Pg++)), typeof_);
      })(t[n]));
  }
  function gi(t) {
    var typeof_ = t.__highlighted;
    if (typeof_)
      if (((t.__highlighted = !1), "layer" === typeof_)) t.__zr && t.__zr.removeHover(t);
      else if (typeof_) {
        var n = t.style,
          i = t.__cachedNormalStl;
        i && (Pi(n), t.setStyle(i), ki(n));
        var r = t.__cachedNormalZ2;
        null != r && t.z2 - r === Dg && (t.z2 = r);
      }
  }
  function mi(t, e) {
    t.isGroup
      ? t.traverse(function (t) {
          !t.isGroup && e(t);
        })
      : e(t);
  }
  function vi(t, e) {
    ((e = t.__hoverStl = !1 !== e && (e || {})),
      (t.__hoverStlDirty = !0),
      t.__highlighted && ((t.__cachedNormalStl = null), gi(t), fi(t)));
  }
  function yi(t) {
    return t && t.__isEmphasisEntered;
  }
  function xi(t) {
    (this.__hoverSilentOnTouch && t.zrByTouch) || (!this.__isEmphasisEntered && mi(this, fi));
  }
  function _i(t) {
    (this.__hoverSilentOnTouch && t.zrByTouch) || (!this.__isEmphasisEntered && mi(this, gi));
  }
  function wi() {
    ((this.__isEmphasisEntered = !0), mi(this, fi));
  }
  function bi() {
    ((this.__isEmphasisEntered = !1), mi(this, gi));
  }
  function Si(t, e, n) {
    (t.isGroup
      ? t.traverse(function (t) {
          !t.isGroup && vi(t, t.hoverStyle || e);
        })
      : vi(t, t.hoverStyle || e),
      Mi(t, n));
  }
  function Mi(t, e) {
    var n = !1 === e;
    if (
      ((t.__hoverSilentOnTouch = null != e && e.hoverSilentOnTouch), !n || t.__hoverStyleTrigger)
    ) {
      var i = n ? "off" : "on";
      (t[i]("mouseover", xi)[i]("mouseout", _i),
        t[i]("emphasis", wi)[i]("normal", bi),
        (t.__hoverStyleTrigger = !n));
    }
  }
  function Ii(t, e, n, i, r, o, a) {
    var s,
      l = (r = r || Cg).labelFetcher,
      h = r.labelDataIndex,
      u = r.labelDimIndex,
      c = n.getShallow("show"),
      d = i.getShallow("show");
    (c || d) &&
      (l && (s = l.getFormattedLabel(h, "normal", null, u)),
      null == s && (s = _(r.defaultText) ? r.defaultText(h, r) : r.defaultText));
    var f = c ? s : null,
      p = d ? C(l ? l.getFormattedLabel(h, "emphasis", null, u) : null, s) : null;
    ((null == f && null == p) || (Ti(t, n, o, r), Ti(e, i, a, r, !0)), (t.text = f), (e.text = p));
  }
  function Ti(t, e, n, i, r) {
    return (Ai(t, e, i, r), n && a(t, n), t);
  }
  function Ai(t, e, n, i) {
    if ((n = n || Cg).isRectText) {
      var r = e.getShallow("position") || (i ? null : "inside");
      ("outside" === r && (r = "top"),
        (t.textPosition = r),
        (t.textOffset = e.getShallow("offset")));
      var o = e.getShallow("rotate");
      (null != o && (o *= Math.PI / 180),
        (t.textRotation = o),
        (t.textDistance = C(e.getShallow("distance"), i ? null : 5)));
    }
    var a,
      s = e.ecModel,
      l = s && s.option.textStyle,
      h = (function (t) {
        for (var typeof_; t && t !== t.ecModel;) {
          var n = (t.option || Cg).rich;
          if (n) for (var i in ((e = typeof_ || {}), n)) n.hasOwnProperty(i) && (typeof_[i] = 1);
          t = t.parentModel;
        }
        return typeof_;
      })(e);
    if (h)
      for (var u in ((a = {}), h))
        if (h.hasOwnProperty(u)) {
          var c = e.getModel(["rich", u]);
          Ci((a[u] = {}), c, l, n, i);
        }
    return (
      (t.rich = a),
      Ci(t, e, l, n, i, !0),
      n.forceRich && !n.textStyle && (n.textStyle = {}),
      t
    );
  }
  function Ci(t, e, n, i, r, o) {
    ((n = (!r && n) || Cg),
      (t.textFill = Di(e.getShallow("color"), i) || n.color),
      (t.textStroke = Di(e.getShallow("textBorderColor"), i) || n.textBorderColor),
      (t.textStrokeWidth = C(e.getShallow("textBorderWidth"), n.textBorderWidth)),
      (t.insideRawTextPosition = t.textPosition),
      r ||
        (o && ((t.insideRollbackOpt = i), ki(t)), null == t.textFill && (t.textFill = i.autoColor)),
      (t.fontStyle = e.getShallow("fontStyle") || n.fontStyle),
      (t.fontWeight = e.getShallow("fontWeight") || n.fontWeight),
      (t.fontSize = e.getShallow("fontSize") || n.fontSize),
      (t.fontFamily = e.getShallow("fontFamily") || n.fontFamily),
      (t.textAlign = e.getShallow("align")),
      (t.textVerticalAlign = e.getShallow("verticalAlign") || e.getShallow("baseline")),
      (t.textLineHeight = e.getShallow("lineHeight")),
      (t.textWidth = e.getShallow("width")),
      (t.textHeight = e.getShallow("height")),
      (t.textTag = e.getShallow("tag")),
      (o && i.disableBox) ||
        ((t.textBackgroundColor = Di(e.getShallow("backgroundColor"), i)),
        (t.textPadding = e.getShallow("padding")),
        (t.textBorderColor = Di(e.getShallow("borderColor"), i)),
        (t.textBorderWidth = e.getShallow("borderWidth")),
        (t.textBorderRadius = e.getShallow("borderRadius")),
        (t.textBoxShadowColor = e.getShallow("shadowColor")),
        (t.textBoxShadowBlur = e.getShallow("shadowBlur")),
        (t.textBoxShadowOffsetX = e.getShallow("shadowOffsetX")),
        (t.textBoxShadowOffsetY = e.getShallow("shadowOffsetY"))),
      (t.textShadowColor = e.getShallow("textShadowColor") || n.textShadowColor),
      (t.textShadowBlur = e.getShallow("textShadowBlur") || n.textShadowBlur),
      (t.textShadowOffsetX = e.getShallow("textShadowOffsetX") || n.textShadowOffsetX),
      (t.textShadowOffsetY = e.getShallow("textShadowOffsetY") || n.textShadowOffsetY));
  }
  function Di(t, e) {
    return "auto" !== t ? t : e && e.autoColor ? e.autoColor : null;
  }
  function ki(t) {
    var typeof_ = t.insideRollbackOpt;
    if (typeof_ && null == t.textFill) {
      var n,
        i = typeof_.useInsideStyle,
        r = t.insideRawTextPosition,
        o = typeof_.autoColor;
      (!1 !== i &&
      (!0 === i || (typeof_.isRectText && r && "string" == typeof r && r.indexOf("inside") >= 0))
        ? ((n = {
            textFill: null,
            textStroke: t.textStroke,
            textStrokeWidth: t.textStrokeWidth,
          }),
          (t.textFill = "#fff"),
          null == t.textStroke &&
            ((t.textStroke = o), null == t.textStrokeWidth && (t.textStrokeWidth = 2)))
        : null != o &&
          ((n = {
            textFill: null,
          }),
          (t.textFill = o)),
        n && (t.insideRollback = n));
    }
  }
  function Pi(t) {
    var typeof_ = t.insideRollback;
    typeof_ &&
      ((t.textFill = typeof_.textFill),
      (t.textStroke = typeof_.textStroke),
      (t.textStrokeWidth = typeof_.textStrokeWidth),
      (t.insideRollback = null));
  }
  function Li(t, e) {
    var n = e || e.getModel("textStyle");
    return O(
      [
        t.fontStyle || (n && n.getShallow("fontStyle")) || "",
        t.fontWeight || (n && n.getShallow("fontWeight")) || "",
        (t.fontSize || (n && n.getShallow("fontSize")) || 12) + "px",
        t.fontFamily || (n && n.getShallow("fontFamily")) || "sans-serif",
      ].join(" "),
    );
  }
  function Oi(t, e, n, i, r, o) {
    if (("function" == typeof r && ((o = r), (r = null)), i && i.isAnimationEnabled())) {
      var a = t ? "Update" : "",
        s = i.getShallow("animationDuration" + a),
        l = i.getShallow("animationEasing" + a),
        h = i.getShallow("animationDelay" + a);
      ("function" == typeof h &&
        (h = h(r, i.getAnimationDelayParams ? i.getAnimationDelayParams(e, r) : null)),
        "function" == typeof s && (s = s(r)),
        s > 0 ? e.animateTo(n, s, h || 0, l, o, !!o) : (e.stopAnimation(), e.attr(n), o && o()));
    } else (e.stopAnimation(), e.attr(n), o && o());
  }
  function zi(t, e, n, i, r) {
    Oi(!0, t, e, n, i, r);
  }
  function Ei(t, e, n, i, r) {
    Oi(!1, t, e, n, i, r);
  }
  function Ni(t, e) {
    for (var n = pt([]); t && t !== e;) (mt(n, t.getLocalTransform(), n), (t = t.parent));
    return n;
  }
  function Ri(t, e, n) {
    return (e && !d(e) && (e = bd.getLocalTransform(e)), n && (e = _t([], e)), K([], t, e));
  }
  function Bi(t, e, n) {
    var i = 0 === e[4] || 0 === e[5] || 0 === e[0] ? 1 : Math.abs((2 * e[4]) / e[0]),
      r = 0 === e[4] || 0 === e[5] || 0 === e[2] ? 1 : Math.abs((2 * e[4]) / e[2]),
      o = ["left" === t ? -i : "right" === t ? i : 0, "top" === t ? -r : "bottom" === t ? r : 0];
    return (
      (o = Ri(o, e, n)),
      Math.abs(o[0]) > Math.abs(o[1]) ? (o[0] > 0 ? "right" : "left") : o[1] > 0 ? "bottom" : "top"
    );
  }
  function Fi(t, e, n, i) {
    function r(t) {
      var typeof_ = {
        position: H(t.position),
        rotation: t.rotation,
      };
      return (t.shape && (typeof_.shape = a({}, t.shape)), typeof_);
    }
    if (t && e) {
      var o = (function (t) {
        var typeof_ = {};
        return (
          t.traverse(function (t) {
            !t.isGroup && t.anid && (typeof_[t.anid] = t);
          }),
          typeof_
        );
      })(t);
      e.traverse(function (t) {
        if (!t.isGroup && t.anid) {
          var typeof_ = o[t.anid];
          if (typeof_) {
            var i = r(t);
            (t.attr(r(typeof_)), zi(t, i, n, t.dataIndex));
          }
        }
      });
    }
  }
  function Vi(t, e) {
    return p(t, function (t) {
      var n = t[0];
      ((n = Tg(n, e.x)), (n = Ag(n, e.x + e.width)));
      var i = t[1];
      return ((i = Tg(i, e.y)), [n, (i = Ag(i, e.y + e.height))]);
    });
  }
  function Hi(t, e, n) {
    var i = ((e = a(
      {
        rectHover: !0,
      },
      e,
    )).style = {
      strokeNoScale: !0,
    });
    if (
      ((n = n || {
        x: -1,
        y: -1,
        width: 2,
        height: 2,
      }),
      t)
    )
      return 0 === t.indexOf("image://")
        ? ((i.image = t.slice(8)), s(i, n), new qe(e))
        : oi(t.replace("path://", ""), e, n, "center");
  }
  function Wi(t, e, n) {
    ((this.parentModel = e), (this.ecModel = n), (this.option = t));
  }
  function Gi(t, n, i) {
    for (
      var r = 0;
      r < n.length && (!n[r] || null != (t = t && "object" == typeof_(t) ? t[n[r]] : null));
      r++
    );
    return (null == t && i && (t = i.get(n)), t);
  }
  function Zi(t, e) {
    var n = Bg(t).getParent;
    return n ? n.call(t, e) : t.parentModel;
  }
  function Ui(t) {
    return [t || "", Fg++, Math.random().toFixed(5)].join("_");
  }
  function Xi(t, e, n, i) {
    var r = e[1] - e[0],
      o = n[1] - n[0];
    if (0 === r) return 0 === o ? n[0] : (n[0] + n[1]) / 2;
    if (i) {
      if (r > 0) {
        if (t <= e[0]) return n[0];
        if (t >= e[1]) return n[1];
      } else {
        if (t >= e[0]) return n[0];
        if (t <= e[1]) return n[1];
      }
    } else {
      if (t === e[0]) return n[0];
      if (t === e[1]) return n[1];
    }
    return ((t - e[0]) / r) * o + n[0];
  }
  function Yi(t, e) {
    switch (t) {
      case "center":
      case "middle":
        t = "50%";
        break;
      case "left":
      case "top":
        t = "0%";
        break;
      case "right":
      case "bottom":
        t = "100%";
    }
    return "string" == typeof t
      ? (function (t) {
          return t.replace(/^\s+/, "").replace(/\s+$/, "");
        })(t).match(/%$/)
        ? (parseFloat(t) / 100) * e
        : parseFloat(t)
      : null == t
        ? NaN
        : +t;
  }
  function ji(t, e, n) {
    return (
      null == e && (e = 10),
      (e = Math.min(Math.max(0, e), 20)),
      (t = (+t).toFixed(e)),
      n ? t : +t
    );
  }
  function qi(t) {
    return (
      t.sort(function (t, e) {
        return t - e;
      }),
      t
    );
  }
  function $i(t) {
    if (((t = +t), isNaN(t))) return 0;
    for (var typeof_ = 1, n = 0; Math.round(t * typeof_) / typeof_ !== t;) ((e *= 10), n++);
    return n;
  }
  function Ki(t) {
    var typeof_ = t.toString(),
      n = typeof_.indexOf("e");
    if (n > 0) {
      var i = +typeof_.slice(n + 1);
      return i < 0 ? -i : 0;
    }
    var r = typeof_.indexOf(".");
    return r < 0 ? 0 : typeof_.length - 1 - r;
  }
  function Qi(t, e) {
    var n = Math.log,
      i = Math.LN10,
      r = Math.floor(n(t[1] - t[0]) / i),
      o = Math.round(n(Math.abs(e[1] - e[0])) / i),
      a = Math.min(Math.max(-r + o, 0), 20);
    return isFinite(a) ? a : 20;
  }
  function Ji(t, e, n) {
    if (!t[e]) return 0;
    var i = g(
      t,
      function (t, e) {
        return t + (isNaN(e) ? 0 : e);
      },
      0,
    );
    if (0 === i) return 0;
    for (
      var r = Math.pow(10, n),
        o = p(t, function (t) {
          return ((isNaN(t) ? 0 : t) / i) * r * 100;
        }),
        a = 100 * r,
        s = p(o, function (t) {
          return Math.floor(t);
        }),
        l = g(
          s,
          function (t, e) {
            return t + e;
          },
          0,
        ),
        h = p(o, function (t, e) {
          return t - s[e];
        });
      l < a;
    ) {
      for (var u = Number.NEGATIVE_INFINITY, c = null, d = 0, f = h.length; d < f; ++d)
        h[d] > u && ((u = h[d]), (c = d));
      (++s[c], (h[c] = 0), ++l);
    }
    return s[e] / r;
  }
  function tr(t) {
    var typeof_ = 2 * Math.PI;
    return ((t % typeof_) + typeof_) % typeof_;
  }
  function er(t) {
    return t > -Vg && t < Vg;
  }
  function nr(t) {
    if (t instanceof Date) return t;
    if ("string" == typeof t) {
      var typeof_ = Hg.exec(t);
      if (!typeof_) return new Date(NaN);
      if (typeof_[8]) {
        var n = +typeof_[4] || 0;
        return (
          "Z" !== typeof_[8].toUpperCase() && (n -= typeof_[8].slice(0, 3)),
          new Date(
            Date.UTC(
              +typeof_[1],
              +(typeof_[2] || 1) - 1,
              +typeof_[3] || 1,
              n,
              +(typeof_[5] || 0),
              +typeof_[6] || 0,
              +typeof_[7] || 0,
            ),
          )
        );
      }
      return new Date(
        +typeof_[1],
        +(typeof_[2] || 1) - 1,
        +typeof_[3] || 1,
        +typeof_[4] || 0,
        +(typeof_[5] || 0),
        +typeof_[6] || 0,
        +typeof_[7] || 0,
      );
    }
    return null == t ? new Date(NaN) : new Date(Math.round(t));
  }
  function ir(t) {
    return Math.pow(10, rr(t));
  }
  function rr(t) {
    return Math.floor(Math.log(t) / Math.LN10);
  }
  function or(t, e) {
    var n = rr(t),
      i = Math.pow(10, n),
      r = t / i;
    return (
      (t =
        (e
          ? r < 1.5
            ? 1
            : r < 2.5
              ? 2
              : r < 4
                ? 3
                : r < 7
                  ? 5
                  : 10
          : r < 1
            ? 1
            : r < 2
              ? 2
              : r < 3
                ? 3
                : r < 5
                  ? 5
                  : 10) * i),
      n >= -20 ? +t.toFixed(n < 0 ? -n : 0) : t
    );
  }
  function ar(t) {
    return isNaN(t)
      ? "-"
      : (t = (t + "").split("."))[0].replace(/(\d{1,3})(?=(?:\d{3})+(?!\d))/g, "$1,") +
          (t.length > 1 ? "." + t[1] : "");
  }
  function sr(t, e) {
    return (
      (t = (t || "").toLowerCase().replace(/-(.)/g, function (t, e) {
        return e.toUpperCase();
      })),
      e && t && (t = t.charAt(0).toUpperCase() + t.slice(1)),
      t
    );
  }
  function lr(t) {
    return null == t
      ? ""
      : (t + "").replace(Zg, function (t, e) {
          return Ug[e];
        });
  }
  function hr(t, e, n) {
    x(e) || (e = [e]);
    var i = e.length;
    if (!i) return "";
    for (var r = e[0].$vars || [], o = 0; o < r.length; o++) {
      var a = Xg[o];
      t = t.replace(Yg(a), Yg(a, 0));
    }
    for (var s = 0; s < i; s++)
      for (var l = 0; l < r.length; l++) {
        var h = e[s][r[l]];
        t = t.replace(Yg(Xg[l], s), n ? lr(h) : h);
      }
    return t;
  }
  function ur(t, e) {
    var n = (t = w(t)
        ? {
            color: t,
            extraCssText: e,
          }
        : t || {}).color,
      i = t.type,
      r = ((e = t.extraCssText), t.renderMode || "html"),
      o = t.markerId || "X";
    return n
      ? "html" === r
        ? "subItem" === i
          ? '<span style="display:inline-block;vertical-align:middle;margin-right:8px;margin-left:3px;border-radius:4px;width:4px;height:4px;background-color:' +
            lr(n) +
            ";" +
            (e || "") +
            '"></span>'
          : '<span style="display:inline-block;margin-right:5px;border-radius:10px;width:10px;height:10px;background-color:' +
            lr(n) +
            ";" +
            (e || "") +
            '"></span>'
        : {
            renderMode: r,
            content: "{marker" + o + "|}  ",
            style: {
              color: n,
            },
          }
      : "";
  }
  function cr(t, e) {
    return "0000".substr(0, e - (t += "").length) + t;
  }
  function dr(t, e, n) {
    ("week" !== t && "month" !== t && "quarter" !== t && "half-year" !== t && "year" !== t) ||
      (t = "MM-dd\nyyyy");
    var i = nr(e),
      r = n ? "UTC" : "",
      o = i["get" + r + "FullYear"](),
      a = i["get" + r + "Month"]() + 1,
      s = i["get" + r + "Date"](),
      l = i["get" + r + "Hours"](),
      h = i["get" + r + "Minutes"](),
      u = i["get" + r + "Seconds"](),
      c = i["get" + r + "Milliseconds"]();
    return t
      .replace("MM", cr(a, 2))
      .replace("M", a)
      .replace("yyyy", o)
      .replace("yy", o % 100)
      .replace("dd", cr(s, 2))
      .replace("d", s)
      .replace("hh", cr(l, 2))
      .replace("h", l)
      .replace("mm", cr(h, 2))
      .replace("m", h)
      .replace("ss", cr(u, 2))
      .replace("s", u)
      .replace("SSS", cr(c, 3));
  }
  function fr(t) {
    return t ? t.charAt(0).toUpperCase() + t.substr(1) : t;
  }
  function pr(t, e, n, i, r) {
    var o = 0,
      a = 0;
    (null == i && (i = 1 / 0), null == r && (r = 1 / 0));
    var s = 0;
    e.eachChild(function (l, h) {
      var u,
        c,
        d = l.position,
        f = l.getBoundingRect(),
        p = e.childAt(h + 1),
        g = p && p.getBoundingRect();
      if ("horizontal" === t) {
        var m = f.width + (g ? -g.x + f.x : 0);
        (u = o + m) > i || l.newline
          ? ((o = 0), (u = m), (a += s + n), (s = f.height))
          : (s = Math.max(s, f.height));
      } else {
        var v = f.height + (g ? -g.y + f.y : 0);
        (c = a + v) > r || l.newline
          ? ((o += s + n), (a = 0), (c = v), (s = f.width))
          : (s = Math.max(s, f.width));
      }
      l.newline || ((d[0] = o), (d[1] = a), "horizontal" === t ? (o = u + n) : (a = c + n));
    });
  }
  function gr(t, e, n) {
    n = Gg(n || 0);
    var i = e.width,
      r = e.height,
      o = Yi(t.left, i),
      a = Yi(t.top, r),
      s = Yi(t.right, i),
      l = Yi(t.bottom, r),
      h = Yi(t.width, i),
      u = Yi(t.height, r),
      c = n[2] + n[0],
      d = n[1] + n[3],
      f = t.aspect;
    switch (
      (isNaN(h) && (h = i - s - d - o),
      isNaN(u) && (u = r - l - c - a),
      null != f &&
        (isNaN(h) && isNaN(u) && (f > i / r ? (h = 0.8 * i) : (u = 0.8 * r)),
        isNaN(h) && (h = f * u),
        isNaN(u) && (u = h / f)),
      isNaN(o) && (o = i - s - h - d),
      isNaN(a) && (a = r - l - u - c),
      t.left || t.right)
    ) {
      case "center":
        o = i / 2 - h / 2 - n[3];
        break;
      case "right":
        o = i - h - d;
    }
    switch (t.top || t.bottom) {
      case "middle":
      case "center":
        a = r / 2 - u / 2 - n[0];
        break;
      case "bottom":
        a = r - u - c;
    }
    ((o = o || 0),
      (a = a || 0),
      isNaN(h) && (h = i - d - o - (s || 0)),
      isNaN(u) && (u = r - c - a - (l || 0)));
    var p = new ee(o + n[3], a + n[0], h, u);
    return ((p.margin = n), p);
  }
  function mr(t, e, n, i, r) {
    var o = !r || !r.hv || r.hv[0],
      a = !r || !r.hv || r.hv[1],
      l = (r && r.boundingMode) || "all";
    if (o || a) {
      var h;
      if ("raw" === l)
        h = "group" === t.type ? new ee(0, 0, +e.width || 0, +e.height || 0) : t.getBoundingRect();
      else if (((h = t.getBoundingRect()), t.needLocalTransform())) {
        var u = t.getLocalTransform();
        (h = h.clone()).applyTransform(u);
      }
      e = gr(
        s(
          {
            width: h.width,
            height: h.height,
          },
          e,
        ),
        n,
        i,
      );
      var c = t.position,
        d = o ? e.x - h.x : 0,
        f = a ? e.y - h.y : 0;
      t.attr("position", "raw" === l ? [d, f] : [c[0] + d, c[1] + f]);
    }
  }
  function vr(t, e, n) {
    function i(n, i) {
      var a = {},
        l = 0,
        h = {},
        u = 0;
      if (
        (Kg(n, function (e) {
          h[e] = t[e];
        }),
        Kg(n, function (t) {
          (r(e, t) && (a[t] = h[t] = e[t]), o(a, t) && l++, o(h, t) && u++);
        }),
        s[i])
      )
        return (o(e, n[1]) ? (h[n[2]] = null) : o(e, n[2]) && (h[n[1]] = null), h);
      if (2 !== u && l) {
        if (l >= 2) return a;
        for (var c = 0; c < n.length; c++) {
          var d = n[c];
          if (!r(a, d) && r(t, d)) {
            a[d] = t[d];
            break;
          }
        }
        return a;
      }
      return h;
    }
    function r(t, e) {
      return t.hasOwnProperty(e);
    }
    function o(t, e) {
      return null != t[e] && "auto" !== t[e];
    }
    function a(t, e, n) {
      Kg(t, function (t) {
        e[t] = n[t];
      });
    }
    !b(n) && (n = {});
    var s = n.ignoreSize;
    !x(s) && (s = [s, s]);
    var l = i(Jg[0], 0),
      h = i(Jg[1], 1);
    (a(Jg[0], t, l), a(Jg[1], t, h));
  }
  function yr(t) {
    return xr({}, t);
  }
  function xr(t, e) {
    return (
      e &&
        t &&
        Kg(Qg, function (n) {
          e.hasOwnProperty(n) && (t[n] = e[n]);
        }),
      t
    );
  }
  function _r(t) {
    var typeof_ = t.get("coordinateSystem"),
      n = {
        coordSysName: typeof_,
        coordSysDims: [],
        axisMap: R(),
        categoryAxisMap: R(),
      },
      i = lm[typeof_];
    if (i) return (i(t, n, n.axisMap, n.categoryAxisMap), n);
  }
  function wr(t) {
    return "category" === t.get("type");
  }
  function br(t) {
    ((this.fromDataset = t.fromDataset),
      (this.data = t.data || (t.sourceFormat === dm ? {} : [])),
      (this.sourceFormat = t.sourceFormat || fm),
      (this.seriesLayoutBy = t.seriesLayoutBy || gm),
      (this.dimensionsDefine = t.dimensionsDefine),
      (this.encodeDefine = t.encodeDefine && R(t.encodeDefine)),
      (this.startIndex = t.startIndex || 0),
      (this.dimensionsDetectCount = t.dimensionsDetectCount));
  }
  function Sr(t) {
    var typeof_ = t.option,
      n = typeof_.data,
      i = M(n) ? pm : hm,
      r = !1,
      o = typeof_.seriesLayoutBy,
      a = typeof_.sourceHeader,
      s = typeof_.dimensions,
      l = (function (t) {
        var typeof_ = t.option;
        if (!typeof_.data) return t.ecModel.getComponent("dataset", typeof_.datasetIndex || 0);
      })(t);
    if (l) {
      var h = l.option;
      ((n = h.source),
        (i = vm(l).sourceFormat),
        (r = !0),
        (o = o || h.seriesLayoutBy),
        null == a && (a = h.sourceHeader),
        (s = s || h.dimensions));
    }
    var u = (function (t, e, n, i, r) {
        if (!t)
          return {
            dimensionsDefine: Mr(r),
          };
        var o, a, s, l;
        if (e === um)
          ("auto" === i || null == i
            ? Ir(
                function (t) {
                  null != t && "-" !== t && (w(t) ? null == a && (a = 1) : (a = 0));
                },
                n,
                t,
                10,
              )
            : (a = i ? 1 : 0),
            r ||
              1 !== a ||
              ((r = []),
              Ir(
                function (t, e) {
                  r[e] = null != t ? t : "";
                },
                n,
                t,
              )),
            (o = r ? r.length : n === mm ? t.length : t[0] ? t[0].length : null));
        else if (e === cm)
          r ||
            ((r = (function (t) {
              for (var typeof_, n = 0; n < t.length && !(e = t[n++]););
              if (typeof_) {
                var i = [];
                return (
                  f(typeof_, function (t, e) {
                    i.push(e);
                  }),
                  i
                );
              }
            })(t)),
            (s = !0));
        else if (e === dm)
          r ||
            ((r = []),
            (s = !0),
            f(t, function (t, e) {
              r.push(e);
            }));
        else if (e === hm) {
          var h = an(t[0]);
          o = (x(h) && h.length) || 1;
        }
        return (
          s &&
            f(r, function (t, e) {
              "name" === (b(t) ? t.name : t) && (l = e);
            }),
          {
            startIndex: a,
            dimensionsDefine: Mr(r),
            dimensionsDetectCount: o,
            potentialNameDimIndex: l,
          }
        );
      })(n, i, o, a, s),
      c = typeof_.encode;
    (!c &&
      l &&
      (c = (function (t, e, n, i, r, o) {
        var a = _r(t),
          s = {},
          l = [],
          h = [],
          u = t.subType,
          c = R(["pie", "map", "funnel"]),
          d = R([
            "line",
            "bar",
            "pictorialBar",
            "scatter",
            "effectScatter",
            "candlestick",
            "boxplot",
          ]);
        if (a && null != d.get(u)) {
          var p = t.ecModel,
            g = vm(p).datasetMap,
            m = e.uid + "_" + r,
            v =
              g.get(m) ||
              g.set(m, {
                categoryWayDim: 1,
                valueWayDim: 0,
              });
          f(a.coordSysDims, function (t) {
            if (null == a.firstCategoryDimIndex)
              ((e = v.valueWayDim++), (s[t] = typeof_), h.push(typeof_));
            else if (a.categoryAxisMap.get(t)) ((s[t] = 0), l.push(0));
            else {
              var typeof_ = v.categoryWayDim++;
              ((s[t] = typeof_), h.push(typeof_));
            }
          });
        } else if (null != c.get(u)) {
          for (var y, x = 0; x < 5 && null == y; x++)
            Ar(n, i, r, o.dimensionsDefine, o.startIndex, x) || (y = x);
          if (null != y) {
            s.value = y;
            var _ = o.potentialNameDimIndex || Math.max(y - 1, 0);
            (h.push(_), l.push(_));
          }
        }
        return (l.length && (s.itemName = l), h.length && (s.seriesName = h), s);
      })(t, l, n, i, o, u)),
      (vm(t).source = new br({
        data: n,
        fromDataset: r,
        seriesLayoutBy: o,
        sourceFormat: i,
        dimensionsDefine: u.dimensionsDefine,
        startIndex: u.startIndex,
        dimensionsDetectCount: u.dimensionsDetectCount,
        encodeDefine: c,
      })));
  }
  function Mr(t) {
    if (t) {
      var typeof_ = R();
      return p(t, function (t, n) {
        if (
          null ==
          (t = a(
            {},
            b(t)
              ? t
              : {
                  name: t,
                },
          )).name
        )
          return t;
        ((t.name += ""), null == t.displayName && (t.displayName = t.name));
        var i = typeof_.get(t.name);
        return (
          i
            ? (t.name += "-" + i.count++)
            : typeof_.set(t.name, {
                count: 1,
              }),
          t
        );
      });
    }
  }
  function Ir(t, e, n, i) {
    if ((null == i && (i = 1 / 0), e === mm))
      for (o = 0; o < n.length && o < i; o++) t(n[o] ? n[o][0] : null, o);
    else for (var r = n[0] || [], o = 0; o < r.length && o < i; o++) t(r[o], o);
  }
  function Tr(t, e) {
    return Ar(t.data, t.sourceFormat, t.seriesLayoutBy, t.dimensionsDefine, t.startIndex, e);
  }
  function Ar(t, e, n, i, r, o) {
    function a(t) {
      return (null == t || !isFinite(t) || "" === t) && (!(!w(t) || "-" === t) || void 0);
    }
    var s, l;
    if (M(t)) return !1;
    if ((i && (l = b((l = i[o])) ? l.name : l), e === um)) {
      if (n === mm) {
        for (var h = t[o], u = 0; u < (h || []).length && u < 5; u++)
          if (null != (s = a(h[r + u]))) return s;
      } else
        for (u = 0; u < t.length && u < 5; u++) {
          var c = t[r + u];
          if (c && null != (s = a(c[o]))) return s;
        }
    } else if (e === cm) {
      if (!l) return;
      for (u = 0; u < t.length && u < 5; u++) if ((d = t[u]) && null != (s = a(d[l]))) return s;
    } else if (e === dm) {
      if (!l) return;
      if (!(h = t[l]) || M(h)) return !1;
      for (u = 0; u < h.length && u < 5; u++) if (null != (s = a(h[u]))) return s;
    } else if (e === hm)
      for (u = 0; u < t.length && u < 5; u++) {
        var d = t[u],
          f = an(d);
        if (!x(f)) return !1;
        if (null != (s = a(f[o]))) return s;
      }
    return !1;
  }
  function Cr(t) {
    ((this.option = {}),
      (this.option[ym] = 1),
      (this._componentsMap = R({
        series: [],
      })),
      this._seriesIndices,
      this._seriesIndicesMap,
      (function (t, n) {
        var o = t.color && !t.colorLayer;
        f(n, function (n, a) {
          ("colorLayer" === a && o) ||
            im.hasClass(a) ||
            ("object" == typeof_(n)
              ? (t[a] = t[a] ? r(t[a], n, !1) : i(n))
              : null == t[a] && (t[a] = n));
        });
      })(t, this._theme.option),
      r(t, om, !1),
      this.mergeOption(t));
  }
  function Dr(t, e) {
    t._seriesIndicesMap = R(
      (t._seriesIndices =
        p(e, function (t) {
          return t.componentIndex;
        }) || []),
    );
  }
  function kr(t, e) {
    return e.hasOwnProperty("subType")
      ? m(t, function (t) {
          return t.subType === e.subType;
        })
      : t;
  }
  function Pr(t) {
    f(
      _m,
      function (e) {
        this[e] = v(t[e], t);
      },
      this,
    );
  }
  function Lr() {
    this._coordinateSystems = [];
  }
  function Or(t) {
    ((this._api = t),
      (this._timelineOptions = []),
      (this._mediaList = []),
      this._mediaDefault,
      (this._currentMediaIndices = []),
      this._optionBackup,
      this._newBaseOption);
  }
  function zr(t, e, n) {
    var i,
      r,
      o = [],
      a = [],
      s = t.timeline;
    if (
      (t.baseOption && (r = t.baseOption),
      (s || t.options) && ((r = r || {}), (o = (t.options || []).slice())),
      t.media)
    ) {
      r = r || {};
      var l = t.media;
      bm(l, function (t) {
        t && t.option && (t.query ? a.push(t) : i || (i = t));
      });
    }
    return (
      r || (r = t),
      r.timeline || (r.timeline = s),
      bm(
        [r].concat(o).concat(
          p(a, function (t) {
            return t.option;
          }),
        ),
        function (t) {
          bm(e, function (e) {
            e(t, n);
          });
        },
      ),
      {
        baseOption: r,
        timelineOptions: o,
        mediaDefault: i,
        mediaList: a,
      }
    );
  }
  function Er(t, e, n) {
    var i = {
        width: e,
        height: n,
        aspectratio: e / n,
      },
      r = !0;
    return (
      f(t, function (t, e) {
        var n = e.match(Tm);
        if (n && n[1] && n[2]) {
          var o = n[1],
            a = n[2].toLowerCase();
          (function (t, e, n) {
            return "min" === n ? t >= e : "max" === n ? t <= e : t === e;
          })(i[a], t, o) || (r = !1);
        }
      }),
      r
    );
  }
  function Nr(t) {
    var typeof_ = t && t.itemStyle;
    if (typeof_)
      for (var n = 0, i = Dm.length; n < i; n++) {
        var o = Dm[n],
          a = typeof_.normal,
          s = typeof_.emphasis;
        (a &&
          a[o] &&
          ((t[o] = t[o] || {}),
          t[o].normal ? r(t[o].normal, a[o]) : (t[o].normal = a[o]),
          (a[o] = null)),
          s &&
            s[o] &&
            ((t[o] = t[o] || {}),
            t[o].emphasis ? r(t[o].emphasis, s[o]) : (t[o].emphasis = s[o]),
            (s[o] = null)));
      }
  }
  function Rr(t, e, n) {
    if (t && t[e] && (t[e].normal || t[e].emphasis)) {
      var i = t[e].normal,
        r = t[e].emphasis;
      (i && (n ? ((t[e].normal = t[e].emphasis = null), s(t[e], i)) : (t[e] = i)),
        r && ((t.emphasis = t.emphasis || {}), (t.emphasis[e] = r)));
    }
  }
  function Br(t) {
    (Rr(t, "itemStyle"),
      Rr(t, "lineStyle"),
      Rr(t, "areaStyle"),
      Rr(t, "label"),
      Rr(t, "labelLine"),
      Rr(t, "upperLabel"),
      Rr(t, "edgeLabel"));
  }
  function Fr(t, e) {
    var n = Cm(t) && t[e],
      i = Cm(n) && n.textStyle;
    if (i)
      for (var r = 0, o = Zf.length; r < o; r++)
        ((e = Zf[r]), i.hasOwnProperty(e) && (n[e] = i[e]));
  }
  function Vr(t) {
    t && (Br(t), Fr(t, "label"), t.emphasis && Fr(t.emphasis, "label"));
  }
  function Hr(t) {
    return x(t) ? t : t ? [t] : [];
  }
  function Wr(t) {
    return (x(t) ? t[0] : t) || {};
  }
  function Gr(t) {
    f(Pm, function (e) {
      e[0] in t && !(e[1] in t) && (t[e[1]] = t[e[0]]);
    });
  }
  function Zr(t) {
    f(t, function (e, n) {
      var i = [],
        r = [NaN, NaN],
        o = [e.stackResultDimension, e.stackedOverDimension],
        a = e.data,
        s = e.isStackedByIndex,
        l = a.map(o, function (o, l, h) {
          var u,
            c,
            d = a.get(e.stackedDimension, h);
          if (isNaN(d)) return r;
          s ? (c = a.getRawIndex(h)) : (u = a.get(e.stackedByDimension, h));
          for (var f = NaN, p = n - 1; p >= 0; p--) {
            var g = t[p];
            if ((s || (c = g.data.rawIndexOf(g.stackedByDimension, u)), c >= 0)) {
              var m = g.data.getByRawIndex(g.stackResultDimension, c);
              if ((d >= 0 && m > 0) || (d <= 0 && m < 0)) {
                ((d += m), (f = m));
                break;
              }
            }
          }
          return ((i[0] = d), (i[1] = f), i);
        });
      (a.hostModel.setData(l), (e.data = l));
    });
  }
  function Ur(t, e) {
    (br.isInstance(t) || (t = br.seriesDataToSource(t)), (this._source = t));
    var n = (this._data = t.data),
      i = t.sourceFormat;
    (i === pm && ((this._offset = 0), (this._dimSize = e), (this._data = n)),
      a(this, Em[i === um ? i + "_" + t.seriesLayoutBy : i]));
  }
  function Xr() {
    return this._data.length;
  }
  function Yr(t) {
    return this._data[t];
  }
  function jr(t) {
    for (var typeof_ = 0; typeof_ < t.length; typeof_++) this._data.push(t[typeof_]);
  }
  function qr(t, e, n, i) {
    return null != n ? t[n] : t;
  }
  function $r(t, e, n, i) {
    return Kr(t[i], this._dimensionInfos[e]);
  }
  function Kr(t, e) {
    var n = e && e.type;
    if ("ordinal" === n) {
      var i = e && e.ordinalMeta;
      return i ? i.parseAndCollect(t) : t;
    }
    return (
      "time" === n && "number" != typeof t && null != t && "-" !== t && (t = +nr(t)),
      null == t || "" === t ? NaN : +t
    );
  }
  function Qr(t, e, n) {
    if (t) {
      var i = t.getRawDataItem(e);
      if (null != i) {
        var r,
          o,
          a = t.getProvider().getSource().sourceFormat,
          s = t.getDimensionInfo(n);
        return (s && ((r = s.name), (o = s.index)), Nm[a](i, e, o, r));
      }
    }
  }
  function Jr(t, e, n) {
    if (t) {
      var i = t.getProvider().getSource().sourceFormat;
      if (i === hm || i === cm) {
        var r = t.getRawDataItem(e);
        return (i !== hm || b(r) || (r = null), r ? r[n] : void 0);
      }
    }
  }
  function to(t) {
    return new eo(t);
  }
  function eo(t) {
    ((t = t || {}),
      (this._reset = t.reset),
      (this._plan = t.plan),
      (this._count = t.count),
      (this._onDirty = t.onDirty),
      (this._dirty = !0),
      this.context);
  }
  function no(t, e, n, i, r, o) {
    (Hm.reset(n, i, r, o),
      (t._callingProgress = e),
      t._callingProgress(
        {
          start: n,
          end: i,
          count: i - n,
          next: Hm.next,
        },
        t.context,
      ));
  }
  function io(t) {
    var typeof_ = t.name;
    hn(t) ||
      (t.name =
        (function (t) {
          var typeof_ = t.getRawData(),
            n = [];
          return (
            f(typeof_.mapDimension("seriesName", !0), function (t) {
              var i = typeof_.getDimensionInfo(t);
              i.displayName && n.push(i.displayName);
            }),
            n.join(" ")
          );
        })(t) || typeof_);
  }
  function ro(t) {
    return t.model.getRawData().count();
  }
  function oo(t) {
    var typeof_ = t.model;
    return (typeof_.setData(typeof_.getRawData().cloneShallow()), ao);
  }
  function ao(t, e) {
    t.end > e.outputData.count() && e.model.getRawData().cloneShallow(e.outputData);
  }
  function so(t, e) {
    f(t.CHANGABLE_METHODS, function (n) {
      t.wrapMethod(n, y(lo, e));
    });
  }
  function lo(t) {
    var typeof_ = ho(t);
    typeof_ && typeof_.setOutputEnd(this.count());
  }
  function ho(t) {
    var typeof_ = (t.ecModel || {}).scheduler,
      n = typeof_ && typeof_.getPipeline(t.uid);
    if (n) {
      var i = n.currentTask;
      if (i) {
        var r = i.agentStubMap;
        r && (i = r.get(t.uid));
      }
      return i;
    }
  }
  function uo() {
    ((this.group = new qd()),
      (this.uid = Ui("viewChart")),
      (this.renderTask = to({
        plan: po,
        reset: go,
      })),
      (this.renderTask.context = {
        view: this,
      }));
  }
  function co(t, e) {
    if (t && (t.trigger(e), "group" === t.type))
      for (var n = 0; n < t.childCount(); n++) co(t.childAt(n), e);
  }
  function fo(t, e, n) {
    var i = cn(t, e);
    null != i
      ? f(rn(i), function (e) {
          co(t.getItemGraphicEl(e), n);
        })
      : t.eachItemGraphicEl(function (t) {
          co(t, n);
        });
  }
  function po(t) {
    return jm(t.model);
  }
  function go(t) {
    var typeof_ = t.model,
      n = t.ecModel,
      i = t.api,
      r = t.payload,
      o = typeof_.pipelineContext.progressiveRender,
      a = t.view,
      s = r && Ym(r).updateMethod,
      l = o ? "incrementalPrepareRender" : s && a[s] ? s : "render";
    return ("render" !== l && a[l](typeof_, n, i, r), $m[l]);
  }
  function mo(t, e, n) {
    function i() {
      ((u = new Date().getTime()), (c = null), t.apply(a, s || []));
    }
    var r,
      o,
      a,
      s,
      l,
      h = 0,
      u = 0,
      c = null;
    e = e || 0;
    var d = function () {
      ((r = new Date().getTime()), (a = this), (s = arguments));
      var t = l || e,
        d = l || n;
      ((l = null),
        (o = r - (d ? h : u) - t),
        clearTimeout(c),
        d ? (c = setTimeout(i, t)) : o >= 0 ? i() : (c = setTimeout(i, -o)),
        (h = r));
    };
    return (
      (d.clear = function () {
        c && (clearTimeout(c), (c = null));
      }),
      (d.debounceNextCall = function (t) {
        l = t;
      }),
      d
    );
  }
  function vo(t, e, n, i) {
    var r = t[e];
    if (r) {
      var o = r[Km] || r,
        a = r[Jm];
      if (r[Qm] !== n || a !== i) {
        if (null == n || !i) return (t[e] = o);
        (((r = t[e] = mo(o, n, "debounce" === i))[Km] = o), (r[Jm] = i), (r[Qm] = n));
      }
      return r;
    }
  }
  function yo(t, e) {
    var n = t[e];
    n && n[Km] && (t[e] = n[Km]);
  }
  function xo(t, e, n, i) {
    ((this.ecInstance = t),
      (this.api = e),
      this.unfinished,
      (n = this._dataProcessorHandlers = n.slice()),
      (i = this._visualHandlers = i.slice()),
      (this._allHandlers = n.concat(i)),
      (this._stageTaskMap = R()));
  }
  function _o(t, e, n, i, r) {
    function o(t, e) {
      return t.setDirty && (!t.dirtyMap || t.dirtyMap.get(e.__pipeline.id));
    }
    var a;
    ((r = r || {}),
      f(e, function (e, s) {
        if (!r.visualType || r.visualType === e.visualType) {
          var l = t._stageTaskMap.get(e.uid),
            h = l.seriesTaskMap,
            u = l.overallTask;
          if (u) {
            var c,
              d = u.agentStubMap;
            (d.each(function (t) {
              o(r, t) && (t.dirty(), (c = !0));
            }),
              c && u.dirty(),
              ov(u, i));
            var f = t.getPerformArgs(u, r.block);
            (d.each(function (t) {
              t.perform(f);
            }),
              (a |= u.perform(f)));
          } else
            h &&
              h.each(function (s, l) {
                o(r, s) && s.dirty();
                var h = t.getPerformArgs(s, r.block);
                ((h.skip = !e.performRawSeries && n.isSeriesFiltered(s.context.model)),
                  ov(s, i),
                  (a |= s.perform(h)));
              });
        }
      }),
      (t.unfinished |= a));
  }
  function wo(t) {
    t.overallReset(t.ecModel, t.api, t.payload);
  }
  function bo(t, e) {
    return t.overallProgress && So;
  }
  function So() {
    (this.agent.dirty(), this.getDownstream().dirty());
  }
  function Mo() {
    this.agent && this.agent.dirty();
  }
  function Io(t) {
    return t.plan && t.plan(t.model, t.ecModel, t.api, t.payload);
  }
  function To(t) {
    t.useClearVisual && t.data.clearAllVisual();
    var typeof_ = (t.resetDefines = rn(t.reset(t.model, t.ecModel, t.api, t.payload)));
    return typeof_.length > 1
      ? p(typeof_, function (t, e) {
          return Ao(e);
        })
      : av;
  }
  function Ao(t) {
    return function (e, n) {
      var i = n.data,
        r = n.resetDefines[t];
      if (r && r.dataEach) for (var o = e.start; o < e.end; o++) r.dataEach(i, o);
      else r && r.progress && r.progress(e, i);
    };
  }
  function Co(t) {
    return t.data.count();
  }
  function Do(t, e, n) {
    var i = e.uid,
      r = t._pipelineMap.get(i);
    (!r.head && (r.head = n),
      r.tail && r.tail.pipe(n),
      (r.tail = n),
      (n.__idxInPipeline = r.count++),
      (n.__pipeline = r));
  }
  function ko(t) {
    sv = null;
    try {
      t(lv, hv);
    } catch (t) {}
    return sv;
  }
  function Po(t, e) {
    for (var n in e.prototype) t[n] = B;
  }
  function Lo(t) {
    for (
      w(t) && (t = new DOMParser().parseFromString(t, "text/xml")),
        9 === t.nodeType && (t = t.firstChild);
      "svg" !== t.nodeName.toLowerCase() || 1 !== t.nodeType;
    )
      t = t.nextSibling;
    return t;
  }
  function Oo() {
    ((this._defs = {}), (this._root = null), (this._isDefine = !1), (this._isText = !1));
  }
  function zo(t, e) {
    t &&
      t.__inheritedStyle &&
      (e.__inheritedStyle || (e.__inheritedStyle = {}), s(e.__inheritedStyle, t.__inheritedStyle));
  }
  function Eo(t) {
    for (var typeof_ = O(t).split(gv), n = [], i = 0; i < typeof_.length; i += 2) {
      var r = parseFloat(typeof_[i]),
        o = parseFloat(typeof_[i + 1]);
      n.push([r, o]);
    }
    return n;
  }
  function No(t, e, n, i) {
    var r = e.__inheritedStyle || {},
      o = "text" === e.type;
    if (
      1 === t.nodeType &&
      ((function (t, e) {
        var n = t.getAttribute("transform");
        if (n) {
          var i = null,
            r = [];
          (n = n.replace(/,/g, " ")).replace(_v, function (t, e, n) {
            r.push(e, n);
          });
          for (var o = r.length - 1; o > 0; o -= 2) {
            var a = r[o],
              s = r[o - 1];
            switch (((i = i || ft()), s)) {
              case "translate":
                ((a = O(a).split(gv)), vt(i, i, [parseFloat(a[0]), parseFloat(a[1] || 0)]));
                break;
              case "scale":
                ((a = O(a).split(gv)), xt(i, i, [parseFloat(a[0]), parseFloat(a[1] || a[0])]));
                break;
              case "rotate":
                ((a = O(a).split(gv)), yt(i, i, parseFloat(a[0])));
                break;
              case "skew":
                ((a = O(a).split(gv)), console.warn("Skew transform is not supported yet"));
                break;
              case "matrix":
                ((a = O(a).split(gv)),
                  (i[0] = parseFloat(a[0])),
                  (i[1] = parseFloat(a[1])),
                  (i[2] = parseFloat(a[2])),
                  (i[3] = parseFloat(a[3])),
                  (i[4] = parseFloat(a[4])),
                  (i[5] = parseFloat(a[5])));
            }
          }
          e.setLocalTransform(i);
        }
      })(t, e),
      a(
        r,
        (function (t) {
          var typeof_ = t.getAttribute("style"),
            n = {};
          if (!typeof_) return n;
          var i,
            r = {};
          for (wv.lastIndex = 0; null != (i = wv.exec(typeof_));) r[i[1]] = i[2];
          for (var o in yv) yv.hasOwnProperty(o) && null != r[o] && (n[yv[o]] = r[o]);
          return n;
        })(t),
      ),
      !i)
    )
      for (var s in yv)
        if (yv.hasOwnProperty(s)) {
          var l = t.getAttribute(s);
          null != l && (r[yv[s]] = l);
        }
    var h = o ? "textFill" : "fill",
      u = o ? "textStroke" : "stroke";
    e.style = e.style || new of();
    var c = e.style;
    (null != r.fill && c.set(h, Ro(r.fill, n)),
      null != r.stroke && c.set(u, Ro(r.stroke, n)),
      f(
        ["lineWidth", "opacity", "fillOpacity", "strokeOpacity", "miterLimit", "fontSize"],
        function (t) {
          var typeof_ = "lineWidth" === t && o ? "textStrokeWidth" : t;
          null != r[t] && c.set(typeof_, parseFloat(r[t]));
        },
      ),
      (r.textBaseline && "auto" !== r.textBaseline) || (r.textBaseline = "alphabetic"),
      "alphabetic" === r.textBaseline && (r.textBaseline = "bottom"),
      "start" === r.textAlign && (r.textAlign = "left"),
      "end" === r.textAlign && (r.textAlign = "right"),
      f(
        [
          "lineDashOffset",
          "lineCap",
          "lineJoin",
          "fontWeight",
          "fontFamily",
          "fontStyle",
          "textAlign",
          "textBaseline",
        ],
        function (t) {
          null != r[t] && c.set(t, r[t]);
        },
      ),
      r.lineDash && (e.style.lineDash = O(r.lineDash).split(gv)),
      c[u] && "none" !== c[u] && (e[u] = !0),
      (e.__inheritedStyle = r));
  }
  function Ro(t, e) {
    var n = e && t && t.match(xv);
    return n ? e[O(n[1])] : t;
  }
  function Bo(t) {
    return function (e, n, i) {
      ((e = e && e.toLowerCase()), hd.prototype[t].call(this, e, n, i));
    };
  }
  function Fo() {
    hd.call(this);
  }
  function Vo(t, e, n) {
    function r(t, e) {
      return t.__prio - e.__prio;
    }
    ((n = n || {}), "string" == typeof e && (e = Yv[e]), this.id, this.group, (this._dom = t));
    var o = (this._zr = en(t, {
      renderer: n.renderer || "canvas",
      devicePixelRatio: n.devicePixelRatio,
      width: n.width,
      height: n.height,
    }));
    ((this._throttledZrFlush = mo(v(o.flush, o), 17)),
      (e = i(e)) && Om(e, !0),
      (this._theme = e),
      (this._chartsViews = []),
      (this._chartsMap = {}),
      (this._componentsViews = []),
      (this._componentsMap = {}),
      (this._coordSysMgr = new Lr()));
    var a = (this._api = ta(this));
    (se(Xv, r),
      se(Gv, r),
      (this._scheduler = new xo(this, a, Gv, Xv)),
      hd.call(this, (this._ecEventProcessor = new ea())),
      (this._messageCenter = new Fo()),
      this._initEvents(),
      (this.resize = v(this.resize, this)),
      (this._pendingActions = []),
      o.animation.on("frame", this._onframe, this),
      (function (t, e) {
        t.on("rendered", function () {
          (e.trigger("rendered"),
            !t.animation.isFinished() ||
              e[Nv] ||
              e._scheduler.unfinished ||
              e._pendingActions.length ||
              e.trigger("finished"));
        });
      })(o, this),
      z(this));
  }
  function Ho(t, e, n) {
    var i,
      r = this._model,
      o = this._coordSysMgr.getCoordinateSystems();
    e = fn(r, e);
    for (var a = 0; a < o.length; a++) {
      var s = o[a];
      if (s[t] && null != (i = s[t](r, e, n))) return i;
    }
  }
  function Wo(t) {
    var typeof_ = t._model,
      n = t._scheduler;
    (n.restorePipelines(typeof_),
      n.prepareStageTasks(),
      jo(t, "component", typeof_, n),
      jo(t, "chart", typeof_, n),
      n.plan());
  }
  function Go(t, e, n, i, r) {
    function o(i) {
      i && i.__alive && i[e] && i[e](i.__model, a, t._api, n);
    }
    var a = t._model;
    if (i) {
      var s = {};
      ((s[i + "Id"] = n[i + "Id"]),
        (s[i + "Index"] = n[i + "Index"]),
        (s[i + "Name"] = n[i + "Name"]));
      var l = {
        mainType: i,
        query: s,
      };
      r && (l.subType = r);
      var h = n.excludeSeriesId;
      (null != h && (h = R(rn(h))),
        a &&
          a.eachComponent(
            l,
            function (e) {
              (h && null != h.get(e.id)) ||
                o(t["series" === i ? "_chartsMap" : "_componentsMap"][e.__viewId]);
            },
            t,
          ));
    } else Av(t._componentsViews.concat(t._chartsViews), o);
  }
  function Zo(t, e) {
    var n = t._chartsMap,
      i = t._scheduler;
    e.eachSeries(function (t) {
      i.updateStreamModes(t, n[t.__viewId]);
    });
  }
  function Uo(t, e) {
    var n = t.type,
      i = t.escapeConnect,
      r = Hv[n],
      o = r.actionInfo,
      l = (o.update || "update").split(":"),
      h = l.pop();
    ((l = null != l[0] && kv(l[0])), (this[Ev] = !0));
    var u = [t],
      c = !1;
    t.batch &&
      ((c = !0),
      (u = p(t.batch, function (e) {
        return (((e = s(a({}, e), t)).batch = null), e);
      })));
    var d,
      f = [],
      g = "highlight" === n || "downplay" === n;
    (Av(
      u,
      function (t) {
        (((d = (d = r.action(t, this._model, this._api)) || a({}, t)).type = o.event || d.type),
          f.push(d),
          g ? Go(this, h, t, "series") : l && Go(this, h, t, l.main, l.sub));
      },
      this,
    ),
      "none" === h ||
        g ||
        l ||
        (this[Nv] ? (Wo(this), Fv.update.call(this, t), (this[Nv] = !1)) : Fv[h].call(this, t)),
      (d = c
        ? {
            type: o.event || n,
            escapeConnect: i,
            batch: f,
          }
        : f[0]),
      (this[Ev] = !1),
      !e && this._messageCenter.trigger(d.type, d));
  }
  function Xo(t) {
    for (var typeof_ = this._pendingActions; typeof_.length;) {
      var n = typeof_.shift();
      Uo.call(this, n, t);
    }
  }
  function Yo(t) {
    !t && this.trigger("updated");
  }
  function jo(t, e, n, i) {
    function r(t) {
      var typeof_ = "_ec_" + t.id + "_" + t.type,
        r = s[typeof_];
      if (!r) {
        var u = kv(t.type);
        ((r = new (o ? Zm.getClass(u.main, u.sub) : uo.getClass(u.sub))()).init(n, h),
          (s[typeof_] = r),
          a.push(r),
          l.add(r.group));
      }
      ((t.__viewId = r.__id = typeof_),
        (r.__alive = !0),
        (r.__model = t),
        (r.group.__ecComponentInfo = {
          mainType: t.mainType,
          index: t.componentIndex,
        }),
        !o && i.prepareView(r, t, n, h));
    }
    for (
      var o = "component" === e,
        a = o ? t._componentsViews : t._chartsViews,
        s = o ? t._componentsMap : t._chartsMap,
        l = t._zr,
        h = t._api,
        u = 0;
      u < a.length;
      u++
    )
      a[u].__alive = !1;
    for (
      o
        ? n.eachComponent(function (t, e) {
            "series" !== t && r(e);
          })
        : n.eachSeries(r),
        u = 0;
      u < a.length;
    ) {
      var c = a[u];
      c.__alive
        ? u++
        : (!o && c.renderTask.dispose(),
          l.remove(c.group),
          c.dispose(n, h),
          a.splice(u, 1),
          delete s[c.__id],
          (c.__id = c.group.__ecComponentInfo = null));
    }
  }
  function qo(t) {
    (t.clearColorPalette(),
      t.eachSeries(function (t) {
        t.clearColorPalette();
      }));
  }
  function $o(t, e, n, i) {
    ((function (t, e, n, i, r) {
      Av(r || t._componentsViews, function (t) {
        var r = t.__model;
        (t.render(r, e, n, i), Jo(r, t));
      });
    })(t, e, n, i),
      Av(t._chartsViews, function (t) {
        t.__alive = !1;
      }),
      Ko(t, e, 0, i),
      Av(t._chartsViews, function (t) {
        t.__alive || t.remove(e, n);
      }));
  }
  function Ko(t, e, n, i, r) {
    var o,
      a = t._scheduler;
    (e.eachSeries(function (e) {
      var n = t._chartsMap[e.__viewId];
      n.__alive = !0;
      var s = n.renderTask;
      (a.updatePayload(s, i),
        r && r.get(e.uid) && s.dirty(),
        (o |= s.perform(a.getPerformArgs(s))),
        (n.group.silent = !!e.get("silent")),
        Jo(e, n),
        (function (t, e) {
          var n = t.get("blendMode") || null;
          e.group.traverse(function (t) {
            (t.isGroup || (t.style.blend !== n && t.setStyle("blend", n)),
              t.eachPendingDisplayable &&
                t.eachPendingDisplayable(function (t) {
                  t.setStyle("blend", n);
                }));
          });
        })(e, n));
    }),
      (a.unfinished |= o),
      (function (t, e) {
        var n = t.storage,
          i = 0;
        (n.traverse(function (t) {
          t.isGroup || i++;
        }),
          i > e.get("hoverLayerThreshold") &&
            !Hc.node &&
            n.traverse(function (t) {
              t.isGroup || (t.useHoverLayer = !0);
            }));
      })(t._zr, e),
      nv(t._zr.dom, e));
  }
  function Qo(t, e) {
    Av(Uv, function (n) {
      n(t, e);
    });
  }
  function Jo(t, e) {
    var n = t.get("z"),
      i = t.get("zlevel");
    e.group.traverse(function (t) {
      "group" !== t.type && (null != n && (t.z = n), null != i && (t.zlevel = i));
    });
  }
  function ta(t) {
    var typeof_ = t._coordSysMgr;
    return a(new Pr(t), {
      getCoordinateSystems: v(typeof_.getCoordinateSystems, typeof_),
      getComponentByElement: function (e) {
        for (; e;) {
          var n = e.__ecComponentInfo;
          if (null != n) return t._model.getComponent(n.mainType, n.index);
          e = e.parent;
        }
      },
    });
  }
  function ea() {
    this.eventInfo;
  }
  function na(t) {
    $v[t] = !1;
  }
  function ia(t) {
    return qv[
      (function (t, e) {
        return t.getAttribute ? t.getAttribute(e) : t[e];
      })(t, Jv)
    ];
  }
  function ra(t, e) {
    Yv[t] = e;
  }
  function oa(t) {
    Zv.push(t);
  }
  function aa(t, e) {
    ua(Gv, t, e, Pv);
  }
  function sa(t, e, n) {
    "function" == typeof e && ((n = e), (e = ""));
    var i = Dv(t)
      ? t.type
      : [
          t,
          (t = {
            event: e,
          }),
        ][0];
    ((t.event = (t.event || i).toLowerCase()),
      (e = t.event),
      Tv(Rv.test(i) && Rv.test(e)),
      Hv[i] ||
        (Hv[i] = {
          action: n,
          actionInfo: t,
        }),
      (Wv[e] = i));
  }
  function la(t, e) {
    ua(Xv, t, e, Lv, "layout");
  }
  function ha(t, e) {
    ua(Xv, t, e, Ov, "visual");
  }
  function ua(t, e, n, i, r) {
    (Cv(e) || Dv(e)) && ((n = e), (e = i));
    var o = xo.wrapStageHandler(n, r);
    return ((o.__prio = e), (o.__raw = n), t.push(o), o);
  }
  function ca(t, e) {
    jv[t] = e;
  }
  function da(t) {
    return im.extend(t);
  }
  function fa(t) {
    return Zm.extend(t);
  }
  function pa(t) {
    return Gm.extend(t);
  }
  function ga(t) {
    return uo.extend(t);
  }
  function ma(t) {
    return t;
  }
  function va(t, e, n, i, r) {
    ((this._old = t),
      (this._new = e),
      (this._oldKeyGetter = n || ma),
      (this._newKeyGetter = i || ma),
      (this.context = r));
  }
  function ya(t, e, n, i, r) {
    for (var o = 0; o < t.length; o++) {
      var a = "_ec_" + r[i](t[o], o),
        s = e[a];
      null == s ? (n.push(a), (e[a] = o)) : (s.length || (e[a] = s = [s]), s.push(o));
    }
  }
  function xa(t) {
    return t._rawCount > 65535 ? ay : ly;
  }
  function _a(t) {
    var typeof_ = t.constructor;
    return typeof_ === Array ? t.slice() : new typeof_(t);
  }
  function wa(t, e) {
    (f(hy.concat(e.__wrappedMethods || []), function (n) {
      e.hasOwnProperty(n) && (t[n] = e[n]);
    }),
      (t.__wrappedMethods = e.__wrappedMethods),
      f(uy, function (n) {
        t[n] = i(e[n]);
      }),
      (t._calculationInfo = a(e._calculationInfo)));
  }
  function ba(t, e, n, i, r) {
    var o = oy[e.type],
      a = i - 1,
      s = e.name,
      l = t[s][a];
    if (l && l.length < n) {
      for (var h = new o(Math.min(r - a * n, n)), u = 0; u < l.length; u++) h[u] = l[u];
      t[s][a] = h;
    }
    for (var c = i * n; c < r; c += n) t[s].push(new o(Math.min(r - c, n)));
  }
  function Sa(t) {
    var typeof_ = t._invertedIndicesMap;
    f(typeof_, function (n, i) {
      var r = t._dimensionInfos[i].ordinalMeta;
      if (r) {
        for (n = typeof_[i] = new sy(r.categories.length), o = 0; o < n.length; o++) n[o] = iy;
        for (var o = 0; o < t._count; o++) n[t.get(i, o)] = o;
      }
    });
  }
  function Ma(t, e, n) {
    var i;
    if (null != e) {
      var r = t._chunkSize,
        o = Math.floor(n / r),
        a = n % r,
        s = t.dimensions[e],
        l = t._storage[s][o];
      if (l) {
        i = l[a];
        var h = t._dimensionInfos[s].ordinalMeta;
        h && h.categories.length && (i = h.categories[i]);
      }
    }
    return i;
  }
  function Ia(t) {
    return t;
  }
  function Ta(t) {
    return t < this._count && t >= 0 ? this._indices[t] : -1;
  }
  function Aa(t, e) {
    var n = t._idList[e];
    return (null == n && (n = Ma(t, t._idDimIdx, e)), null == n && (n = ry + e), n);
  }
  function Ca(t) {
    return (x(t) || (t = [t]), t);
  }
  function Da(t, e) {
    var n = t.dimensions,
      i = new cy(p(n, t.getDimensionInfo, t), t.hostModel);
    wa(i, t);
    for (var r = (i._storage = {}), o = t._storage, a = 0; a < n.length; a++) {
      var s = n[a];
      o[s] &&
        (h(e, s) >= 0
          ? ((r[s] = ka(o[s])), (i._rawExtent[s] = [1 / 0, -1 / 0]), (i._extent[s] = null))
          : (r[s] = o[s]));
    }
    return i;
  }
  function ka(t) {
    for (var typeof_ = new Array(t.length), n = 0; n < t.length; n++) typeof_[n] = _a(t[n]);
    return typeof_;
  }
  function Pa(t, e, n) {
    function r(t, e, n) {
      null != ey.get(e)
        ? (t.otherDims[e] = n)
        : ((t.coordDim = e), (t.coordDimIndex = n), u.set(e, !0));
    }
    (br.isInstance(e) || (e = br.seriesDataToSource(e)), (n = n || {}), (t = (t || []).slice()));
    for (
      var o = (n.dimsDef || []).slice(),
        l = R(n.encodeDef),
        h = R(),
        u = R(),
        c = [],
        d = (function (t, e, n, i) {
          var r = Math.max(t.dimensionsDetectCount || 1, e.length, n.length, i || 0);
          return (
            f(e, function (t) {
              var typeof_ = t.dimsDef;
              typeof_ && (r = Math.max(r, typeof_.length));
            }),
            r
          );
        })(e, t, o, n.dimCount),
        p = 0;
      p < d;
      p++
    ) {
      var g = (o[p] = a(
          {},
          b(o[p])
            ? o[p]
            : {
                name: o[p],
              },
        )),
        m = g.name,
        v = (c[p] = {
          otherDims: {},
        });
      (null != m && null == h.get(m) && ((v.name = v.displayName = m), h.set(m, p)),
        null != g.type && (v.type = g.type),
        null != g.displayName && (v.displayName = g.displayName));
    }
    l.each(function (t, e) {
      if (1 === (t = rn(t).slice()).length && t[0] < 0) l.set(e, !1);
      else {
        var n = l.set(e, []);
        f(t, function (t, i) {
          (w(t) && (t = h.get(t)), null != t && t < d && ((n[i] = t), r(c[t], e, i)));
        });
      }
    });
    var y = 0;
    f(t, function (t, e) {
      var n, o, a;
      if (w(t)) ((n = t), (t = {}));
      else {
        n = t.name;
        var h = t.ordinalMeta;
        ((t.ordinalMeta = null),
          ((t = i(t)).ordinalMeta = h),
          (o = t.dimsDef),
          (a = t.otherDims),
          (t.name = t.coordDim = t.coordDimIndex = t.dimsDef = t.otherDims = null));
      }
      var u = l.get(n);
      if (!1 !== u) {
        if (!(u = rn(u)).length)
          for (var d = 0; d < ((o && o.length) || 1); d++) {
            for (; y < c.length && null != c[y].coordDim;) y++;
            y < c.length && u.push(y++);
          }
        f(u, function (e, i) {
          var l = c[e];
          if ((r(s(l, t), n, i), null == l.name && o)) {
            var h = o[i];
            (!b(h) &&
              (h = {
                name: h,
              }),
              (l.name = l.displayName = h.name),
              (l.defaultTooltip = h.defaultTooltip));
          }
          a && s(l.otherDims, a);
        });
      }
    });
    var x = n.generateCoord,
      _ = n.generateCoordCount,
      S = null != _;
    _ = x ? _ || 1 : 0;
    for (var M = x || "value", I = 0; I < d; I++)
      (null == (v = c[I] = c[I] || {}).coordDim &&
        ((v.coordDim = La(M, u, S)),
        (v.coordDimIndex = 0),
        (!x || _ <= 0) && (v.isExtraCoord = !0),
        _--),
        null == v.name && (v.name = La(v.coordDim, h)),
        null == v.type && Tr(e, I, v.name) && (v.type = "ordinal"));
    return c;
  }
  function La(t, e, n) {
    if (n || null != e.get(t)) {
      for (var i = 0; null != e.get(t + i);) i++;
      t += i;
    }
    return (e.set(t, !0), t);
  }
  function Oa(t, e, n) {
    var i,
      r,
      o,
      a,
      s = (n = n || {}).byIndex,
      l = n.stackedCoordDimension,
      h = !(!t || !t.get("stack"));
    if (
      (f(e, function (t, n) {
        (w(t) &&
          (e[n] = t =
            {
              name: t,
            }),
          h &&
            !t.isExtraCoord &&
            (s || i || !t.ordinalMeta || (i = t),
            r || "ordinal" === t.type || "time" === t.type || (l && l !== t.coordDim) || (r = t)));
      }),
      !r || s || i || (s = !0),
      r)
    ) {
      ((o = "__\0ecstackresult"), (a = "__\0ecstackedover"), i && (i.createInvertedIndices = !0));
      var u = r.coordDim,
        c = r.type,
        d = 0;
      (f(e, function (t) {
        t.coordDim === u && d++;
      }),
        e.push({
          name: o,
          coordDim: u,
          coordDimIndex: d,
          type: c,
          isExtraCoord: !0,
          isCalculationCoord: !0,
        }),
        d++,
        e.push({
          name: a,
          coordDim: a,
          coordDimIndex: d,
          type: c,
          isExtraCoord: !0,
          isCalculationCoord: !0,
        }));
    }
    return {
      stackedDimension: r && r.name,
      stackedByDimension: i && i.name,
      isStackedByIndex: s,
      stackedOverDimension: a,
      stackResultDimension: o,
    };
  }
  function za(t, e) {
    return !!e && e === t.getCalculationInfo("stackedDimension");
  }
  function Ea(t, e) {
    return za(t, e) ? t.getCalculationInfo("stackResultDimension") : e;
  }
  function Na(t, e, n) {
    ((n = n || {}), br.isInstance(t) || (t = br.seriesDataToSource(t)));
    var i,
      r = e.get("coordinateSystem"),
      o = Lr.get(r),
      a = _r(e);
    (a &&
      (i = p(a.coordSysDims, function (t) {
        var typeof_ = {
            name: t,
          },
          n = a.axisMap.get(t);
        if (n) {
          var i = n.get("type");
          typeof_.type = (function (t) {
            return "category" === t ? "ordinal" : "time" === t ? "time" : "float";
          })(i);
        }
        return typeof_;
      })),
      i ||
        (i = (o && (o.getDimensionsInfo ? o.getDimensionsInfo() : o.dimensions.slice())) || [
          "x",
          "y",
        ]));
    var s,
      l,
      h = py(t, {
        coordDimensions: i,
        generateCoord: n.generateCoord,
      });
    (a &&
      f(h, function (t, e) {
        var n = t.coordDim,
          i = a.categoryAxisMap.get(n);
        (i && (null == s && (s = e), (t.ordinalMeta = i.getOrdinalMeta())),
          null != t.otherDims.itemName && (l = !0));
      }),
      l || null == s || (h[s].otherDims.itemName = 0));
    var u = Oa(e, h),
      c = new cy(h, e);
    c.setCalculationInfo(u);
    var d =
      null != s &&
      (function (t) {
        if (t.sourceFormat === hm) {
          var typeof_ = (function (t) {
            for (var typeof_ = 0; typeof_ < t.length && null == t[typeof_];) typeof_++;
            return t[typeof_];
          })(t.data || []);
          return null != typeof_ && !x(an(typeof_));
        }
      })(t)
        ? function (t, e, n, i) {
            return i === s ? n : this.defaultDimValueGetter(t, e, n, i);
          }
        : null;
    return ((c.hasItemOption = !1), c.initData(t, null, d), c);
  }
  function Ra(t) {
    ((this._setting = t || {}),
      (this._extent = [1 / 0, -1 / 0]),
      (this._interval = 0),
      this.init && this.init.apply(this, arguments));
  }
  function Ba(t) {
    ((this.categories = t.categories || []),
      (this._needCollect = t.needCollect),
      (this._deduplication = t.deduplication),
      this._map);
  }
  function Fa(t) {
    return t._map || (t._map = R(t.categories));
  }
  function Va(t) {
    return b(t) && null != t.value ? t.value : t + "";
  }
  function Ha(t) {
    return Ki(t) + 2;
  }
  function Wa(t, e, n) {
    t[e] = Math.max(Math.min(t[e], n[1]), n[0]);
  }
  function Ga(t, e) {
    (!isFinite(t[0]) && (t[0] = e[0]),
      !isFinite(t[1]) && (t[1] = e[1]),
      Wa(t, 0, e),
      Wa(t, 1, e),
      t[0] > t[1] && (t[0] = t[1]));
  }
  function Za(t) {
    return t.get("stack") || wy + t.seriesIndex;
  }
  function Ua(t) {
    return t.dim + t.index;
  }
  function Xa(t, e) {
    var n = [];
    return (
      e.eachSeriesByType(t, function (t) {
        qa(t) && !$a(t) && n.push(t);
      }),
      n
    );
  }
  function Ya(t) {
    var typeof_ = [];
    return (
      f(t, function (t) {
        var n = t.getData(),
          i = t.coordinateSystem.getBaseAxis(),
          r = i.getExtent(),
          o = "category" === i.type ? i.getBandWidth() : Math.abs(r[1] - r[0]) / n.count(),
          a = Yi(t.get("barWidth"), o),
          s = Yi(t.get("barMaxWidth"), o),
          l = t.get("barGap"),
          h = t.get("barCategoryGap");
        typeof_.push({
          bandWidth: o,
          barWidth: a,
          barMaxWidth: s,
          barGap: l,
          barCategoryGap: h,
          axisKey: Ua(i),
          stackId: Za(t),
        });
      }),
      (function (t) {
        var typeof_ = {};
        f(t, function (t, n) {
          var i = t.axisKey,
            r = t.bandWidth,
            o = typeof_[i] || {
              bandWidth: r,
              remainedWidth: r,
              autoWidthCount: 0,
              categoryGap: "20%",
              gap: "30%",
              stacks: {},
            },
            a = o.stacks;
          typeof_[i] = o;
          var s = t.stackId;
          (a[s] || o.autoWidthCount++,
            (a[s] = a[s] || {
              width: 0,
              maxWidth: 0,
            }));
          var l = t.barWidth;
          l &&
            !a[s].width &&
            ((a[s].width = l), (l = Math.min(o.remainedWidth, l)), (o.remainedWidth -= l));
          var h = t.barMaxWidth;
          h && (a[s].maxWidth = h);
          var u = t.barGap;
          null != u && (o.gap = u);
          var c = t.barCategoryGap;
          null != c && (o.categoryGap = c);
        });
        var n = {};
        return (
          f(typeof_, function (t, e) {
            n[e] = {};
            var i = t.stacks,
              r = t.bandWidth,
              o = Yi(t.categoryGap, r),
              a = Yi(t.gap, 1),
              s = t.remainedWidth,
              l = t.autoWidthCount,
              h = (s - o) / (l + (l - 1) * a);
            ((h = Math.max(h, 0)),
              f(i, function (t, e) {
                var n = t.maxWidth;
                n &&
                  n < h &&
                  ((n = Math.min(n, s)),
                  t.width && (n = Math.min(n, t.width)),
                  (s -= n),
                  (t.width = n),
                  l--);
              }),
              (h = (s - o) / (l + (l - 1) * a)),
              (h = Math.max(h, 0)));
            var u,
              c = 0;
            (f(i, function (t, e) {
              (t.width || (t.width = h), (u = t), (c += t.width * (1 + a)));
            }),
              u && (c -= u.width * a));
            var d = -c / 2;
            f(i, function (t, i) {
              ((n[e][i] = n[e][i] || {
                offset: d,
                width: t.width,
              }),
                (d += t.width * (1 + a)));
            });
          }),
          n
        );
      })(typeof_)
    );
  }
  function ja(t, e, n) {
    if (t && e) {
      var i = t[Ua(e)];
      return (null != i && null != n && (i = i[Za(n)]), i);
    }
  }
  function qa(t) {
    return t.coordinateSystem && "cartesian2d" === t.coordinateSystem.type;
  }
  function $a(t) {
    return t.pipelineContext && t.pipelineContext.large;
  }
  function Ka(t, e, n) {
    var i,
      r,
      o = e.getGlobalExtent();
    o[0] > o[1] ? ((i = o[1]), (r = o[0])) : ((i = o[0]), (r = o[1]));
    var a = e.toGlobalCoord(e.dataToCoord(0));
    return (a < i && (a = i), a > r && (a = r), a);
  }
  function Qa(t, e) {
    return Ly(t, Py(e));
  }
  function Ja(t, e) {
    var n,
      i,
      r,
      o = t.type,
      a = e.getMin(),
      s = e.getMax(),
      l = null != a,
      h = null != s,
      u = t.getExtent();
    ("ordinal" === o
      ? (n = e.getCategories().length)
      : (x((i = e.get("boundaryGap"))) || (i = [i || 0, i || 0]),
        "boolean" == typeof i[0] && (i = [0, 0]),
        (i[0] = Yi(i[0], 1)),
        (i[1] = Yi(i[1], 1)),
        (r = u[1] - u[0] || Math.abs(u[0]))),
      null == a && (a = "ordinal" === o ? (n ? 0 : NaN) : u[0] - i[0] * r),
      null == s && (s = "ordinal" === o ? (n ? n - 1 : NaN) : u[1] + i[1] * r),
      "dataMin" === a
        ? (a = u[0])
        : "function" == typeof a &&
          (a = a({
            min: u[0],
            max: u[1],
          })),
      "dataMax" === s
        ? (s = u[1])
        : "function" == typeof s &&
          (s = s({
            min: u[0],
            max: u[1],
          })),
      (null == a || !isFinite(a)) && (a = NaN),
      (null == s || !isFinite(s)) && (s = NaN),
      t.setBlank(T(a) || T(s) || ("ordinal" === o && !t.getOrdinalMeta().categories.length)),
      e.getNeedCrossZero() && (a > 0 && s > 0 && !l && (a = 0), a < 0 && s < 0 && !h && (s = 0)));
    var c = e.ecModel;
    if (c && "time" === o) {
      var d,
        p = Xa("bar", c);
      if (
        (f(p, function (t) {
          d |= t.getBaseAxis() === e.axis;
        }),
        d)
      ) {
        var g = Ya(p),
          m = (function (t, e, n, i) {
            var r = n.axis.getExtent(),
              o = r[1] - r[0],
              a = ja(i, n.axis);
            if (void 0 === a)
              return {
                min: t,
                max: e,
              };
            var s = 1 / 0;
            f(a, function (t) {
              s = Math.min(t.offset, s);
            });
            var l = -1 / 0;
            (f(a, function (t) {
              l = Math.max(t.offset + t.width, l);
            }),
              (s = Math.abs(s)),
              (l = Math.abs(l)));
            var h = s + l,
              u = e - t,
              c = u / (1 - (s + l) / o) - u;
            return {
              min: (t -= c * (s / h)),
              max: (e += c * (l / h)),
            };
          })(a, s, e, g);
        ((a = m.min), (s = m.max));
      }
    }
    return [a, s];
  }
  function ts(t, e) {
    var n = Ja(t, e),
      i = null != e.getMin(),
      r = null != e.getMax(),
      o = e.get("splitNumber");
    "log" === t.type && (t.base = e.get("logBase"));
    var a = t.type;
    (t.setExtent(n[0], n[1]),
      t.niceExtent({
        splitNumber: o,
        fixMin: i,
        fixMax: r,
        minInterval: "interval" === a || "time" === a ? e.get("minInterval") : null,
        maxInterval: "interval" === a || "time" === a ? e.get("maxInterval") : null,
      }));
    var s = e.get("interval");
    null != s && t.setInterval && t.setInterval(s);
  }
  function es(t, e) {
    if ((e = e || t.get("type")))
      switch (e) {
        case "category":
          return new vy(t.getOrdinalMeta ? t.getOrdinalMeta() : t.getCategories(), [1 / 0, -1 / 0]);
        case "value":
          return new _y();
        default:
          return (Ra.getClass(e) || _y).create(t);
      }
  }
  function ns(t) {
    var typeof_ = t.getLabelModel().get("formatter"),
      n = "category" === t.type ? t.scale.getExtent()[0] : null;
    return "string" == typeof typeof_
      ? (e = (function (e) {
          return function (n) {
            return ((n = t.scale.getLabel(n)), e.replace("{value}", null != n ? n : ""));
          };
        })(typeof_))
      : "function" == typeof typeof_
        ? function (i, r) {
            return (null != n && (r = i - n), typeof_(is(t, i), r));
          }
        : function (e) {
            return t.scale.getLabel(e);
          };
  }
  function is(t, e) {
    return "category" === t.type ? t.scale.getLabel(e) : e;
  }
  function rs(t, e) {
    var n = (e * Math.PI) / 180,
      i = t.plain(),
      r = i.width,
      o = i.height,
      a = r * Math.cos(n) + o * Math.sin(n),
      s = r * Math.sin(n) + o * Math.cos(n);
    return new ee(i.x, i.y, a, s);
  }
  function os(t) {
    var typeof_ = t.get("interval");
    return null == typeof_ ? "auto" : typeof_;
  }
  function as(t) {
    return "category" === t.type && 0 === os(t.getLabelModel());
  }
  function ss(t, e) {
    if ("image" !== this.type) {
      var n = this.style,
        i = this.shape;
      (i && "line" === i.symbolType
        ? (n.stroke = t)
        : this.__isEmptyBrush
          ? ((n.stroke = t), (n.fill = e || "#fff"))
          : (n.fill && (n.fill = t), n.stroke && (n.stroke = t)),
        this.dirty(!1));
    }
  }
  function ls(t, e, n, i, r, o, a) {
    var s,
      l = 0 === t.indexOf("empty");
    return (
      l && (t = t.substr(5, 1).toLowerCase() + t.substr(6)),
      ((s =
        0 === t.indexOf("image://")
          ? ai(t.slice(8), new ee(e, n, i, r), a ? "center" : "cover")
          : 0 === t.indexOf("path://")
            ? oi(t.slice(7), {}, new ee(e, n, i, r), a ? "center" : "cover")
            : new Uy({
                shape: {
                  symbolType: t,
                  x: e,
                  y: n,
                  width: i,
                  height: r,
                },
              })).__isEmptyBrush = l),
      (s.setColor = ss),
      s.setColor(o),
      s
    );
  }
  function hs(t, e) {
    return Math.abs(t - e) < jy;
  }
  function us(t, e, n) {
    var i = 0,
      r = t[0];
    if (!r) return !1;
    for (var o = 1; o < t.length; o++) {
      var a = t[o];
      ((i += Gn(r[0], r[1], a[0], a[1], e, n)), (r = a));
    }
    var s = t[0];
    return ((hs(r[0], s[0]) && hs(r[1], s[1])) || (i += Gn(r[0], r[1], s[0], s[1], e, n)), 0 !== i);
  }
  function cs(t, e, n) {
    if (((this.name = t), (this.geometries = e), n)) n = [n[0], n[1]];
    else {
      var i = this.getBoundingRect();
      n = [i.x + i.width / 2, i.y + i.height / 2];
    }
    this.center = n;
  }
  function ds(t, e, n) {
    for (var i = [], r = e[0], o = e[1], a = 0; a < t.length; a += 2) {
      var s = t.charCodeAt(a) - 64,
        l = t.charCodeAt(a + 1) - 64;
      ((s = (s >> 1) ^ -(1 & s)),
        (l = (l >> 1) ^ -(1 & l)),
        (r = s += r),
        (o = l += o),
        i.push([s / n, l / n]));
    }
    return i;
  }
  function fs(t) {
    return "category" === t.type
      ? (function (t) {
          var typeof_ = t.getLabelModel(),
            n = gs(t, typeof_);
          return !typeof_.get("show") || t.scale.isBlank()
            ? {
                labels: [],
                labelCategoryInterval: n.labelCategoryInterval,
              }
            : n;
        })(t)
      : (function (t) {
          var typeof_ = t.scale.getTicks(),
            n = ns(t);
          return {
            labels: p(typeof_, function (e, i) {
              return {
                formattedLabel: n(e, i),
                rawLabel: t.scale.getLabel(e),
                tickValue: e,
              };
            }),
          };
        })(t);
  }
  function ps(t, e) {
    return "category" === t.type
      ? (function (t, e) {
          var n,
            i,
            r = ms(t, "ticks"),
            o = os(e),
            a = vs(r, o);
          if (a) return a;
          if (((e.get("show") && !t.scale.isBlank()) || (n = []), _(o))) n = _s(t, o, !0);
          else if ("auto" === o) {
            var s = gs(t, t.getLabelModel());
            ((i = s.labelCategoryInterval),
              (n = p(s.labels, function (t) {
                return t.tickValue;
              })));
          } else n = xs(t, (i = o), !0);
          return ys(r, o, {
            ticks: n,
            tickCategoryInterval: i,
          });
        })(t, e)
      : {
          ticks: t.scale.getTicks(),
        };
  }
  function gs(t, e) {
    var n,
      i,
      r = ms(t, "labels"),
      o = os(e),
      a = vs(r, o);
    return (
      a ||
      ((n = _(o)
        ? _s(t, o)
        : xs(
            t,
            (i =
              "auto" === o
                ? (function (t) {
                    var typeof_ = $y(t).autoInterval;
                    return null != typeof_
                      ? typeof_
                      : ($y(t).autoInterval = t.calculateCategoryInterval());
                  })(t)
                : o),
          )),
      ys(r, o, {
        labels: n,
        labelCategoryInterval: i,
      }))
    );
  }
  function ms(t, e) {
    return $y(t)[e] || ($y(t)[e] = []);
  }
  function vs(t, e) {
    for (var n = 0; n < t.length; n++) if (t[n].key === e) return t[n].value;
  }
  function ys(t, e, n) {
    return (
      t.push({
        key: e,
        value: n,
      }),
      n
    );
  }
  function xs(t, e, n) {
    function i(t) {
      l.push(
        n
          ? t
          : {
              formattedLabel: r(t),
              rawLabel: o.getLabel(t),
              tickValue: t,
            },
      );
    }
    var r = ns(t),
      o = t.scale,
      a = o.getExtent(),
      s = t.getLabelModel(),
      l = [],
      h = Math.max((e || 0) + 1, 1),
      u = a[0],
      c = o.count();
    0 !== u && h > 1 && c / h > 2 && (u = Math.round(Math.ceil(u / h) * h));
    var d = as(t),
      f = s.get("showMinLabel") || d,
      p = s.get("showMaxLabel") || d;
    f && u !== a[0] && i(a[0]);
    for (var g = u; g <= a[1]; g += h) i(g);
    return (p && g !== a[1] && i(a[1]), l);
  }
  function _s(t, e, n) {
    var i = t.scale,
      r = ns(t),
      o = [];
    return (
      f(i.getTicks(), function (t) {
        var a = i.getLabel(t);
        e(t, a) &&
          o.push(
            n
              ? t
              : {
                  formattedLabel: r(t),
                  rawLabel: a,
                  tickValue: t,
                },
          );
      }),
      o
    );
  }
  function ws(t, e) {
    var n = (t[1] - t[0]) / e / 2;
    ((t[0] += n), (t[1] -= n));
  }
  function bs(t, e) {
    var n = t.mapDimension("defaultedLabel", !0),
      i = n.length;
    if (1 === i) return Qr(t, e, n[0]);
    if (i) {
      for (var r = [], o = 0; o < n.length; o++) {
        var a = Qr(t, e, n[o]);
        r.push(a);
      }
      return r.join(" ");
    }
  }
  function Ss(t, e, n) {
    (qd.call(this), this.updateData(t, e, n));
  }
  function Ms(t) {
    return [t[0] / 2, t[1] / 2];
  }
  function Is(t, e) {
    this.parent.drift(t, e);
  }
  function Ts() {
    !yi(this) && Cs.call(this);
  }
  function As() {
    !yi(this) && Ds.call(this);
  }
  function Cs() {
    if (!this.incremental && !this.useHoverLayer) {
      var t = this.__symbolOriginalScale,
        typeof_ = t[1] / t[0];
      this.animateTo(
        {
          scale: [Math.max(1.1 * t[0], t[0] + 3), Math.max(1.1 * t[1], t[1] + 3 * typeof_)],
        },
        400,
        "elasticOut",
      );
    }
  }
  function Ds() {
    this.incremental ||
      this.useHoverLayer ||
      this.animateTo(
        {
          scale: this.__symbolOriginalScale,
        },
        400,
        "elasticOut",
      );
  }
  function ks(t) {
    ((this.group = new qd()), (this._symbolCtor = t || Ss));
  }
  function Ps(t, e, n, i) {
    return (
      e &&
      !isNaN(e[0]) &&
      !isNaN(e[1]) &&
      !(i.isIgnore && i.isIgnore(n)) &&
      !(i.clipShape && !i.clipShape.contain(e[0], e[1])) &&
      "none" !== t.getItemVisual(n, "symbol")
    );
  }
  function Ls(t) {
    return (
      null == t ||
        b(t) ||
        (t = {
          isIgnore: t,
        }),
      t || {}
    );
  }
  function Os(t) {
    var typeof_ = t.hostModel;
    return {
      itemStyle: typeof_.getModel("itemStyle").getItemStyle(["color"]),
      hoverItemStyle: typeof_.getModel("emphasis.itemStyle").getItemStyle(),
      symbolRotate: typeof_.get("symbolRotate"),
      symbolOffset: typeof_.get("symbolOffset"),
      hoverAnimation: typeof_.get("hoverAnimation"),
      labelModel: typeof_.getModel("label"),
      hoverLabelModel: typeof_.getModel("emphasis.label"),
      cursorStyle: typeof_.get("cursor"),
    };
  }
  function zs(t, e, n) {
    var i,
      r = t.getBaseAxis(),
      o = t.getOtherAxis(r),
      a = (function (t, e) {
        var n = 0,
          i = t.scale.getExtent();
        return (
          "start" === e
            ? (n = i[0])
            : "end" === e
              ? (n = i[1])
              : i[0] > 0
                ? (n = i[0])
                : i[1] < 0 && (n = i[1]),
          n
        );
      })(o, n),
      s = r.dim,
      l = o.dim,
      h = e.mapDimension(l),
      u = e.mapDimension(s),
      c = "x" === l || "radius" === l ? 1 : 0,
      d = p(t.dimensions, function (t) {
        return e.mapDimension(t);
      }),
      f = e.getCalculationInfo("stackResultDimension");
    return (
      (i |= za(e, d[0])) && (d[0] = f),
      (i |= za(e, d[1])) && (d[1] = f),
      {
        dataDimsForPoint: d,
        valueStart: a,
        valueAxisDim: l,
        baseAxisDim: s,
        stacked: !!i,
        valueDim: h,
        baseDim: u,
        baseDataOffset: c,
        stackedOverDimension: e.getCalculationInfo("stackedOverDimension"),
      }
    );
  }
  function Es(t, e, n, i) {
    var r = NaN;
    (t.stacked && (r = n.get(n.getCalculationInfo("stackedOverDimension"), i)),
      isNaN(r) && (r = t.valueStart));
    var o = t.baseDataOffset,
      a = [];
    return ((a[o] = n.get(t.baseDim, i)), (a[1 - o] = r), e.dataToPoint(a));
  }
  function Ns(t) {
    return isNaN(t[0]) || isNaN(t[1]);
  }
  function Rs(t, e, n, i, r, o, a, s, l, h, u) {
    return "none" !== h && h ? Bs.apply(this, arguments) : Fs.apply(this, arguments);
  }
  function Bs(t, e, n, i, r, o, a, s, l, h, u) {
    for (var c = 0, d = n, f = 0; f < i; f++) {
      var p = e[d];
      if (d >= r || d < 0) break;
      if (Ns(p)) {
        if (u) {
          d += o;
          continue;
        }
        break;
      }
      if (d === n) t[o > 0 ? "moveTo" : "lineTo"](p[0], p[1]);
      else if (l > 0) {
        var g = e[c],
          m = "y" === h ? 1 : 0,
          v = (p[m] - g[m]) * l;
        (dx(px, g),
          (px[m] = g[m] + v),
          dx(gx, p),
          (gx[m] = p[m] - v),
          t.bezierCurveTo(px[0], px[1], gx[0], gx[1], p[0], p[1]));
      } else t.lineTo(p[0], p[1]);
      ((c = d), (d += o));
    }
    return f;
  }
  function Fs(t, e, n, i, r, o, a, s, l, h, u) {
    for (var c = 0, d = n, f = 0; f < i; f++) {
      var p = e[d];
      if (d >= r || d < 0) break;
      if (Ns(p)) {
        if (u) {
          d += o;
          continue;
        }
        break;
      }
      if (d === n) (t[o > 0 ? "moveTo" : "lineTo"](p[0], p[1]), dx(px, p));
      else if (l > 0) {
        var g = d + o,
          m = e[g];
        if (u) for (; m && Ns(e[g]);) m = e[(g += o)];
        var v = 0.5,
          y = e[c];
        if (!(m = e[g]) || Ns(m)) dx(gx, p);
        else {
          var x, _;
          if ((Ns(m) && !u && (m = p), Z(fx, m, y), "x" === h || "y" === h)) {
            var w = "x" === h ? 0 : 1;
            ((x = Math.abs(p[w] - y[w])), (_ = Math.abs(p[w] - m[w])));
          } else ((x = od(p, y)), (_ = od(p, m)));
          cx(gx, p, fx, -l * (1 - (v = _ / (_ + x))));
        }
        (hx(px, px, s),
          ux(px, px, a),
          hx(gx, gx, s),
          ux(gx, gx, a),
          t.bezierCurveTo(px[0], px[1], gx[0], gx[1], p[0], p[1]),
          cx(px, p, fx, l * v));
      } else t.lineTo(p[0], p[1]);
      ((c = d), (d += o));
    }
    return f;
  }
  function Vs(t, e) {
    var n = [1 / 0, 1 / 0],
      i = [-1 / 0, -1 / 0];
    if (e)
      for (var r = 0; r < t.length; r++) {
        var o = t[r];
        (o[0] < n[0] && (n[0] = o[0]),
          o[1] < n[1] && (n[1] = o[1]),
          o[0] > i[0] && (i[0] = o[0]),
          o[1] > i[1] && (i[1] = o[1]));
      }
    return {
      min: e ? n : i,
      max: e ? i : n,
    };
  }
  function Hs(t, e) {
    if (t.length === e.length) {
      for (var n = 0; n < t.length; n++) {
        var i = t[n],
          r = e[n];
        if (i[0] !== r[0] || i[1] !== r[1]) return;
      }
      return !0;
    }
  }
  function Ws(t) {
    return "number" == typeof t ? t : t ? 0.5 : 0;
  }
  function Gs(t) {
    var typeof_ = t.getGlobalExtent();
    if (t.onBand) {
      var n = t.getBandWidth() / 2 - 1,
        i = typeof_[1] > typeof_[0] ? 1 : -1;
      ((typeof_[0] += i * n), (typeof_[1] -= i * n));
    }
    return typeof_;
  }
  function Zs(t, e, n, i) {
    return "polar" === t.type
      ? (function (t, e, n, i) {
          var r = t.getAngleAxis(),
            o = t.getRadiusAxis().getExtent().slice();
          o[0] > o[1] && o.reverse();
          var a = r.getExtent(),
            s = Math.PI / 180;
          n && ((o[0] -= 0.5), (o[1] += 0.5));
          var l = new ag({
            shape: {
              cx: ji(t.cx, 1),
              cy: ji(t.cy, 1),
              r0: ji(o[0], 1),
              r: ji(o[1], 1),
              startAngle: -a[0] * s,
              endAngle: -a[1] * s,
              clockwise: r.inverse,
            },
          });
          return (
            e &&
              ((l.shape.endAngle = -a[0] * s),
              Ei(
                l,
                {
                  shape: {
                    endAngle: -a[1] * s,
                  },
                },
                i,
              )),
            l
          );
        })(t, e, n, i)
      : (function (t, e, n, i) {
          var r = Gs(t.getAxis("x")),
            o = Gs(t.getAxis("y")),
            a = t.getBaseAxis().isHorizontal(),
            s = Math.min(r[0], r[1]),
            l = Math.min(o[0], o[1]),
            h = Math.max(r[0], r[1]) - s,
            u = Math.max(o[0], o[1]) - l;
          if (n) ((s -= 0.5), (h += 0.5), (l -= 0.5), (u += 0.5));
          else {
            var c = i.get("lineStyle.width") || 2,
              d = i.get("clipOverflow") ? c / 2 : Math.max(h, u);
            a ? ((l -= d), (u += 2 * d)) : ((s -= d), (h += 2 * d));
          }
          var f = new pg({
            shape: {
              x: s,
              y: l,
              width: h,
              height: u,
            },
          });
          return (
            e &&
              ((f.shape[a ? "width" : "height"] = 0),
              Ei(
                f,
                {
                  shape: {
                    width: h,
                    height: u,
                  },
                },
                i,
              )),
            f
          );
        })(t, e, n, i);
  }
  function Us(t, e, n) {
    for (
      var i = e.getBaseAxis(), r = "x" === i.dim || "radius" === i.dim ? 0 : 1, o = [], a = 0;
      a < t.length - 1;
      a++
    ) {
      var s = t[a + 1],
        l = t[a];
      o.push(l);
      var h = [];
      switch (n) {
        case "end":
          ((h[r] = s[r]), (h[1 - r] = l[1 - r]), o.push(h));
          break;
        case "middle":
          var u = (l[r] + s[r]) / 2,
            c = [];
          ((h[r] = c[r] = u), (h[1 - r] = l[1 - r]), (c[1 - r] = s[1 - r]), o.push(h), o.push(c));
          break;
        default:
          ((h[r] = l[r]), (h[1 - r] = s[1 - r]), o.push(h));
      }
    }
    return (t[a] && o.push(t[a]), o);
  }
  function Xs(t, e) {
    var n = t.getVisual("visualMeta");
    if (n && n.length && t.count() && "cartesian2d" === e.type) {
      for (var i, r, o = n.length - 1; o >= 0; o--) {
        var a = n[o].dimension,
          s = t.dimensions[a],
          l = t.getDimensionInfo(s);
        if ("x" === (i = l && l.coordDim) || "y" === i) {
          r = n[o];
          break;
        }
      }
      if (r) {
        var h = e.getAxis(i),
          u = p(r.stops, function (t) {
            return {
              coord: h.toGlobalCoord(h.dataToCoord(t.value)),
              color: t.color,
            };
          }),
          c = u.length,
          d = r.outerColors.slice();
        c && u[0].coord > u[c - 1].coord && (u.reverse(), d.reverse());
        var g = u[0].coord - 10,
          m = u[c - 1].coord + 10,
          v = m - g;
        if (v < 0.001) return "transparent";
        (f(u, function (t) {
          t.offset = (t.coord - g) / v;
        }),
          u.push({
            offset: c ? u[c - 1].offset : 0.5,
            color: d[1] || "transparent",
          }),
          u.unshift({
            offset: c ? u[0].offset : 0.5,
            color: d[0] || "transparent",
          }));
        var y = new bg(0, 0, 0, 0, u, !0);
        return ((y[i] = g), (y[i + "2"] = m), y);
      }
    }
  }
  function Ys(t, e, n) {
    var i = t.get("showAllSymbol"),
      r = "auto" === i;
    if (!i || r) {
      var o = n.getAxesByScale("ordinal")[0];
      if (
        o &&
        (!r ||
          !(function (t, e) {
            var n = t.getExtent(),
              i = Math.abs(n[1] - n[0]) / t.scale.count();
            isNaN(i) && (i = 0);
            for (var r = e.count(), o = Math.max(1, Math.round(r / 5)), a = 0; a < r; a += o)
              if (1.5 * Ss.getSymbolSize(e, a)[t.isHorizontal() ? 1 : 0] > i) return !1;
            return !0;
          })(o, e))
      ) {
        var a = e.mapDimension(o.dim),
          s = {};
        return (
          f(o.getViewLabels(), function (t) {
            s[t.tickValue] = 1;
          }),
          function (t) {
            return !s.hasOwnProperty(e.get(a, t));
          }
        );
      }
    }
  }
  function js(t) {
    return this._axes[t];
  }
  function qs(t) {
    Sx.call(this, t);
  }
  function $s(t, e) {
    return e.type || (e.data ? "category" : "value");
  }
  function Ks(t, e, n) {
    return t.getCoordSysModel() === e;
  }
  function Qs(t, e, n) {
    ((this._coordsMap = {}),
      (this._coordsList = []),
      (this._axesMap = {}),
      (this._axesList = []),
      this._initCartesian(t, e, n),
      (this.model = t));
  }
  function Js(t, e, n, i) {
    function r(t) {
      return t.dim + "_" + t.index;
    }
    n.getAxesOnZeroOf = function () {
      return o ? [o] : [];
    };
    var o,
      a = t[e],
      s = n.model,
      l = s.get("axisLine.onZero"),
      h = s.get("axisLine.onZeroAxisIndex");
    if (l) {
      if (null != h) tl(a[h]) && (o = a[h]);
      else
        for (var u in a)
          if (a.hasOwnProperty(u) && tl(a[u]) && !i[r(a[u])]) {
            o = a[u];
            break;
          }
      o && (i[r(o)] = !0);
    }
  }
  function tl(t) {
    return (
      t &&
      "category" !== t.type &&
      "time" !== t.type &&
      (function (t) {
        var typeof_ = t.scale.getExtent(),
          n = typeof_[0],
          i = typeof_[1];
        return !((n > 0 && i > 0) || (n < 0 && i < 0));
      })(t)
    );
  }
  function el(t, e) {
    return p(Lx, function (e) {
      return t.getReferringComponents(e)[0];
    });
  }
  function nl(t) {
    return "cartesian2d" === t.get("coordinateSystem");
  }
  function il(t) {
    var typeof_ = {
      componentType: t.mainType,
      componentIndex: t.componentIndex,
    };
    return ((typeof_[t.mainType + "Index"] = t.componentIndex), typeof_);
  }
  function rl(t) {
    var typeof_ = t.get("tooltip");
    return t.get("silent") || !(t.get("triggerEvent") || (typeof_ && typeof_.show));
  }
  function ol(t) {
    t && (t.ignore = !0);
  }
  function al(t, e, n) {
    var i = t && t.getBoundingRect().clone(),
      r = e && e.getBoundingRect().clone();
    if (i && r) {
      var o = pt([]);
      return (
        yt(o, o, -t.rotation),
        i.applyTransform(mt([], o, t.getLocalTransform())),
        r.applyTransform(mt([], o, e.getLocalTransform())),
        i.intersect(r)
      );
    }
  }
  function sl(t) {
    return "middle" === t || "center" === t;
  }
  function ll(t, e) {
    var n = {
      axesInfo: {},
      seriesInvolved: !1,
      coordSysAxesInfo: {},
      coordSysMap: {},
    };
    return (
      (function (t, e, n) {
        var i = e.getComponent("tooltip"),
          r = e.getComponent("axisPointer"),
          o = r.get("link", !0) || [],
          a = [];
        Rx(n.getCoordinateSystems(), function (n) {
          function s(i, s, l) {
            var c = l.model.getModel("axisPointer", r),
              d = c.get("show");
            if (d && ("auto" !== d || i || dl(c))) {
              null == s && (s = c.get("triggerTooltip"));
              var f = (c = i ? hl(l, u, r, e, i, s) : c).get("snap"),
                p = fl(l.model),
                g = s || f || "category" === l.type,
                m = (t.axesInfo[p] = {
                  key: p,
                  axis: l,
                  coordSys: n,
                  axisPointerModel: c,
                  triggerTooltip: s,
                  involveSeries: g,
                  snap: f,
                  useHandle: dl(c),
                  seriesModels: [],
                });
              ((h[p] = m), (t.seriesInvolved |= g));
              var v = (function (t, e) {
                for (var n = e.model, i = e.dim, r = 0; r < t.length; r++) {
                  var o = t[r] || {};
                  if (
                    ul(o[i + "AxisId"], n.id) ||
                    ul(o[i + "AxisIndex"], n.componentIndex) ||
                    ul(o[i + "AxisName"], n.name)
                  )
                    return r;
                }
              })(o, l);
              if (null != v) {
                var y =
                  a[v] ||
                  (a[v] = {
                    axesInfo: {},
                  });
                ((y.axesInfo[p] = m), (y.mapper = o[v].mapper), (m.linkGroup = y));
              }
            }
          }
          if (n.axisPointerEnabled) {
            var l = fl(n.model),
              h = (t.coordSysAxesInfo[l] = {});
            t.coordSysMap[l] = n;
            var u = n.model.getModel("tooltip", i);
            if ((Rx(n.getAxes(), Bx(s, !1, null)), n.getTooltipAxes && i && u.get("show"))) {
              var c = "axis" === u.get("trigger"),
                d = "cross" === u.get("axisPointer.type"),
                f = n.getTooltipAxes(u.get("axisPointer.axis"));
              ((c || d) && Rx(f.baseAxes, Bx(s, !d || "cross", c)),
                d && Rx(f.otherAxes, Bx(s, "cross", !1)));
            }
          }
        });
      })(n, t, e),
      n.seriesInvolved &&
        (function (t, e) {
          e.eachSeries(function (e) {
            var n = e.coordinateSystem,
              i = e.get("tooltip.trigger", !0),
              r = e.get("tooltip.show", !0);
            n &&
              "none" !== i &&
              !1 !== i &&
              "item" !== i &&
              !1 !== r &&
              !1 !== e.get("axisPointer.show", !0) &&
              Rx(t.coordSysAxesInfo[fl(n.model)], function (t) {
                var i = t.axis;
                n.getAxis(i.dim) === i &&
                  (t.seriesModels.push(e),
                  null == t.seriesDataCount && (t.seriesDataCount = 0),
                  (t.seriesDataCount += e.getData().count()));
              });
          }, this);
        })(n, t),
      n
    );
  }
  function hl(t, e, n, r, o, a) {
    var l = e.getModel("axisPointer"),
      h = {};
    (Rx(
      [
        "type",
        "snap",
        "lineStyle",
        "shadowStyle",
        "label",
        "animation",
        "animationDurationUpdate",
        "animationEasingUpdate",
        "z",
      ],
      function (t) {
        h[t] = i(l.get(t));
      },
    ),
      (h.snap = "category" !== t.type && !!a),
      "cross" === l.get("type") && (h.type = "line"));
    var u = h.label || (h.label = {});
    if ((null == u.show && (u.show = !1), "cross" === o)) {
      var c = l.get("label.show");
      if (((u.show = null == c || c), !a)) {
        var d = (h.lineStyle = l.get("crossStyle"));
        d && s(u, d.textStyle);
      }
    }
    return t.model.getModel("axisPointer", new Wi(h, n, r));
  }
  function ul(t, e) {
    return "all" === t || (x(t) && h(t, e) >= 0) || t === e;
  }
  function cl(t) {
    var typeof_ = (t.ecModel.getComponent("axisPointer") || {}).coordSysAxesInfo;
    return typeof_ && typeof_.axesInfo[fl(t)];
  }
  function dl(t) {
    return !!t.get("handle.show");
  }
  function fl(t) {
    return t.type + "||" + t.id;
  }
  function pl(t, e, n, i, r, o) {
    var a = Fx.getAxisPointerClass(t.axisPointerClass);
    if (a) {
      var s = (function (t) {
        var typeof_ = cl(t);
        return typeof_ && typeof_.axisPointerModel;
      })(e);
      s ? (t._axisPointer || (t._axisPointer = new a())).render(e, s, i, o) : gl(t, i);
    }
  }
  function gl(t, e, n) {
    var i = t._axisPointer;
    (i && i.dispose(e, n), (t._axisPointer = null));
  }
  function ml(t, e, n) {
    n = n || {};
    var i = t.coordinateSystem,
      r = e.axis,
      o = {},
      a = r.getAxesOnZeroOf()[0],
      s = r.position,
      l = a ? "onZero" : s,
      h = r.dim,
      u = i.getRect(),
      c = [u.x, u.x + u.width, u.y, u.y + u.height],
      d = {
        left: 0,
        right: 1,
        top: 0,
        bottom: 1,
        onZero: 2,
      },
      f = e.get("offset") || 0,
      p = "x" === h ? [c[2] - f, c[3] + f] : [c[0] - f, c[1] + f];
    if (a) {
      var g = a.toGlobalCoord(a.dataToCoord(0));
      p[d.onZero] = Math.max(Math.min(g, p[1]), p[0]);
    }
    ((o.position = ["y" === h ? p[d[l]] : c[0], "x" === h ? p[d[l]] : c[3]]),
      (o.rotation = (Math.PI / 2) * ("x" === h ? 0 : 1)),
      (o.labelDirection =
        o.tickDirection =
        o.nameDirection =
          {
            top: -1,
            bottom: 1,
            left: -1,
            right: 1,
          }[s]),
      (o.labelOffset = a ? p[d[s]] - p[d.onZero] : 0),
      e.get("axisTick.inside") && (o.tickDirection = -o.tickDirection),
      A(n.labelInside, e.get("axisLabel.inside")) && (o.labelDirection = -o.labelDirection));
    var m = e.get("axisLabel.rotate");
    return ((o.labelRotate = "top" === l ? -m : m), (o.z2 = 1), o);
  }
  function vl(t, e) {
    "outside" === t.textPosition && (t.textPosition = e);
  }
  function yl(t, e, n) {
    ((n.style.text = null),
      zi(
        n,
        {
          shape: {
            width: 0,
          },
        },
        e,
        t,
        function () {
          n.parent && n.parent.remove(n);
        },
      ));
  }
  function xl(t, e, n) {
    ((n.style.text = null),
      zi(
        n,
        {
          shape: {
            r: n.shape.r0,
          },
        },
        e,
        t,
        function () {
          n.parent && n.parent.remove(n);
        },
      ));
  }
  function _l(t, e, n, i, r, o, a, l) {
    var h = e.getItemVisual(n, "color"),
      u = e.getItemVisual(n, "opacity"),
      c = i.getModel("itemStyle"),
      d = i.getModel("emphasis.itemStyle").getBarItemStyle();
    (l || t.setShape("r", c.get("barBorderRadius") || 0),
      t.useStyle(
        s(
          {
            fill: h,
            opacity: u,
          },
          c.getBarItemStyle(),
        ),
      ));
    var f = i.getShallow("cursor");
    (f && t.attr("cursor", f),
      a ? r.height : r.width,
      l ||
        (function (t, e, n, i, r, o, a) {
          (Ii(t, e, n.getModel("label"), n.getModel("emphasis.label"), {
            labelFetcher: r,
            labelDataIndex: o,
            defaultText: bs(r.getData(), o),
            isRectText: !0,
            autoColor: i,
          }),
            vl(t),
            vl(e));
        })(t.style, d, i, h, o, n),
      Si(t, d));
  }
  function wl(t, e, n) {
    var i = t.getData(),
      r = [],
      o = i.getLayout("valueAxisHorizontal") ? 1 : 0;
    r[1 - o] = i.getLayout("valueAxisStart");
    var a = new qx({
      shape: {
        points: i.getLayout("largePoints"),
      },
      incremental: !!n,
      __startPoint: r,
      __valueIdx: o,
    });
    (e.add(a),
      (function (t, e, n) {
        var i = n.getVisual("borderColor") || n.getVisual("color"),
          r = e.getModel("itemStyle").getItemStyle(["color", "borderColor"]);
        (t.useStyle(r),
          (t.style.fill = null),
          (t.style.stroke = i),
          (t.style.lineWidth = n.getLayout("barWidth")));
      })(a, t, i));
  }
  function bl(t, e, n, i) {
    var r = e.getData(),
      o = this.dataIndex,
      a = r.getName(o),
      s = e.get("selectedOffset");
    (i.dispatchAction({
      type: "pieToggleSelect",
      from: t,
      name: a,
      seriesId: e.id,
    }),
      r.each(function (t) {
        Sl(r.getItemGraphicEl(t), r.getItemLayout(t), e.isSelected(r.getName(t)), s, n);
      }));
  }
  function Sl(t, e, n, i, r) {
    var o = (e.startAngle + e.endAngle) / 2,
      a = n ? i : 0,
      s = [Math.cos(o) * a, Math.sin(o) * a];
    r
      ? t
          .animate()
          .when(200, {
            position: s,
          })
          .start("bounceOut")
      : t.attr("position", s);
  }
  function Ml(t, e) {
    function n() {
      ((o.ignore = o.hoverIgnore), (a.ignore = a.hoverIgnore));
    }
    function i() {
      ((o.ignore = o.normalIgnore), (a.ignore = a.normalIgnore));
    }
    qd.call(this);
    var r = new ag({
        z2: 2,
      }),
      o = new cg(),
      a = new ng();
    (this.add(r),
      this.add(o),
      this.add(a),
      this.updateData(t, e, !0),
      this.on("emphasis", n).on("normal", i).on("mouseover", n).on("mouseout", i));
  }
  function Il(t, e, n, i, r, o, a) {
    function s(e, n) {
      for (
        var i = e;
        i >= 0 && ((t[i].y -= n), !(i > 0 && t[i].y > t[i - 1].y + t[i - 1].height));
        i--
      );
    }
    function l(t, e, n, i, r, o) {
      for (var a = e ? Number.MAX_VALUE : 0, s = 0, l = t.length; s < l; s++) {
        var h = Math.abs(t[s].y - i),
          u = t[s].len,
          c = t[s].len2,
          d = h < r + u ? Math.sqrt((r + u + c) * (r + u + c) - h * h) : Math.abs(t[s].x - n);
        (e && d >= a && (d = a - 10), !e && d <= a && (d = a + 10), (t[s].x = n + d * o), (a = d));
      }
    }
    t.sort(function (t, e) {
      return t.y - e.y;
    });
    for (var h, u = 0, c = t.length, d = [], f = [], p = 0; p < c; p++)
      ((h = t[p].y - u) < 0 &&
        (function (e, n, i, r) {
          for (var o = e; o < n; o++)
            if (((t[o].y += i), o > e && o + 1 < n && t[o + 1].y > t[o].y + t[o].height))
              return void s(o, i / 2);
          s(n - 1, i / 2);
        })(p, c, -h),
        (u = t[p].y + t[p].height));
    for (a - u < 0 && s(c - 1, u - a), p = 0; p < c; p++) t[p].y >= n ? f.push(t[p]) : d.push(t[p]);
    (l(d, !1, e, n, i, r), l(f, !0, e, n, i, r));
  }
  function Tl(t) {
    return "center" === t.position;
  }
  function Al() {
    this.group = new qd();
  }
  function Cl(t, e, n, i) {
    var r = n.type,
      o = new (0, Lg[r.charAt(0).toUpperCase() + r.slice(1)])(n);
    (e.add(o), i.set(t, o), (o.__ecGraphicId = t));
  }
  function Dl(t, e) {
    var n = t && t.parent;
    n &&
      ("group" === t.type &&
        t.traverse(function (t) {
          Dl(t, e);
        }),
      e.removeKey(t.__ecGraphicId),
      n.remove(t));
  }
  function kl(t) {
    return (
      (t = a({}, t)),
      f(["id", "parentId", "$action", "hv", "bounding"].concat(Qg), function (e) {
        delete t[e];
      }),
      t
    );
  }
  function Pl(t, e) {
    var n;
    return (
      f(e, function (e) {
        null != t[e] && "auto" !== t[e] && (n = !0);
      }),
      n
    );
  }
  function Ll(t, e, n) {
    var i = a({}, n),
      o = t[e],
      s = n.$action || "merge";
    "merge" === s
      ? o
        ? (r(o, i, !0),
          vr(o, i, {
            ignoreSize: !0,
          }),
          xr(n, o))
        : (t[e] = i)
      : "replace" === s
        ? (t[e] = i)
        : "remove" === s && o && (t[e] = null);
  }
  function Ol(t, e, n, i, r) {
    var o = t.axis;
    if (!o.scale.isBlank() && o.containData(e))
      if (t.involveSeries) {
        var s = (function (t, e) {
            var n = e.axis,
              i = n.dim,
              r = t,
              o = [],
              a = Number.MAX_VALUE,
              s = -1;
            return (
              a_(e.seriesModels, function (e, l) {
                var h,
                  u,
                  c = e.getData().mapDimension(i, !0);
                if (e.getAxisTooltipData) {
                  var d = e.getAxisTooltipData(c, t, n);
                  ((u = d.dataIndices), (h = d.nestestValue));
                } else {
                  if (
                    !(u = e.getData().indicesOfNearest(c[0], t, "category" === n.type ? 0.5 : null))
                      .length
                  )
                    return;
                  h = e.getData().get(c[0], u[0]);
                }
                if (null != h && isFinite(h)) {
                  var f = t - h,
                    p = Math.abs(f);
                  p <= a &&
                    ((p < a || (f >= 0 && s < 0)) && ((a = p), (s = f), (r = h), (o.length = 0)),
                    a_(u, function (t) {
                      o.push({
                        seriesIndex: e.seriesIndex,
                        dataIndexInside: t,
                        dataIndex: e.getData().getRawIndex(t),
                      });
                    }));
                }
              }),
              {
                payloadBatch: o,
                snapToValue: r,
              }
            );
          })(e, t),
          l = s.payloadBatch,
          h = s.snapToValue;
        (l[0] && null == r.seriesIndex && a(r, l[0]),
          !i && t.snap && o.containData(h) && null != h && (e = h),
          n.showPointer(t, e, l, r),
          n.showTooltip(t, s, h));
      } else n.showPointer(t, e);
  }
  function zl(t, e, n, i) {
    t[e.key] = {
      value: n,
      payloadBatch: i,
    };
  }
  function El(t, e, n, i) {
    var r = n.payloadBatch,
      o = e.axis,
      a = o.model,
      s = e.axisPointerModel;
    if (e.triggerTooltip && r.length) {
      var l = e.coordSys.model,
        h = fl(l),
        u = t.map[h];
      (u ||
        ((u = t.map[h] =
          {
            coordSysId: l.id,
            coordSysIndex: l.componentIndex,
            coordSysType: l.type,
            coordSysMainType: l.mainType,
            dataByAxis: [],
          }),
        t.list.push(u)),
        u.dataByAxis.push({
          axisDim: o.dim,
          axisIndex: a.componentIndex,
          axisType: a.type,
          axisId: a.id,
          value: i,
          valueLabelOpt: {
            precision: s.get("label.precision"),
            formatter: s.get("label.formatter"),
          },
          seriesDataIndices: r.slice(),
        }));
    }
  }
  function Nl(t, e, n) {
    var i = n.getZr(),
      r = l_(i).axisPointerLastHighlights || {},
      o = (l_(i).axisPointerLastHighlights = {});
    a_(t, function (t, e) {
      var n = t.axisPointerModel.option;
      "show" === n.status &&
        a_(n.seriesDataIndices, function (t) {
          var typeof_ = t.seriesIndex + " | " + t.dataIndex;
          o[typeof_] = t;
        });
    });
    var a = [],
      s = [];
    (f(r, function (t, e) {
      !o[e] && s.push(t);
    }),
      f(o, function (t, e) {
        !r[e] && a.push(t);
      }),
      s.length &&
        n.dispatchAction({
          type: "downplay",
          escapeConnect: !0,
          batch: s,
        }),
      a.length &&
        n.dispatchAction({
          type: "highlight",
          escapeConnect: !0,
          batch: a,
        }));
  }
  function Rl(t) {
    var typeof_ = t.axis.model,
      n = {},
      i = (n.axisDim = t.axis.dim);
    return (
      (n.axisIndex = n[i + "AxisIndex"] = typeof_.componentIndex),
      (n.axisName = n[i + "AxisName"] = typeof_.name),
      (n.axisId = n[i + "AxisId"] = typeof_.id),
      n
    );
  }
  function Bl(t) {
    return !t || null == t[0] || isNaN(t[0]) || null == t[1] || isNaN(t[1]);
  }
  function Fl(t, e, n) {
    if (!Hc.node) {
      var i = e.getZr();
      (h_(i).records || (h_(i).records = {}),
        (function (t, e) {
          function n(n, i) {
            t.on(n, function (n) {
              var r = (function (t) {
                var typeof_ = {
                    showTip: [],
                    hideTip: [],
                  },
                  n = function (i) {
                    var r = typeof_[i.type];
                    r ? r.push(i) : ((i.dispatchAction = n), t.dispatchAction(i));
                  };
                return {
                  dispatchAction: n,
                  pendings: typeof_,
                };
              })(e);
              (u_(h_(t).records, function (t) {
                t && i(t, n, r.dispatchAction);
              }),
                (function (t, e) {
                  var n,
                    i = t.showTip.length,
                    r = t.hideTip.length;
                  (i ? (n = t.showTip[i - 1]) : r && (n = t.hideTip[r - 1]),
                    n && ((n.dispatchAction = null), e.dispatchAction(n)));
                })(r.pendings, e));
            });
          }
          h_(t).initialized ||
            ((h_(t).initialized = !0),
            n("click", y(Hl, "click")),
            n("mousemove", y(Hl, "mousemove")),
            n("globalout", Vl));
        })(i, e),
        ((h_(i).records[t] || (h_(i).records[t] = {})).handler = n));
    }
  }
  function Vl(t, e, n) {
    t.handler("leave", null, n);
  }
  function Hl(t, e, n, i) {
    e.handler(t, n, i);
  }
  function Wl(t, e) {
    if (!Hc.node) {
      var n = e.getZr();
      (h_(n).records || {})[t] && (h_(n).records[t] = null);
    }
  }
  function Gl() {}
  function Zl(t, e, n, i) {
    Ul(d_(n).lastProp, i) ||
      ((d_(n).lastProp = i), e ? zi(n, i, t) : (n.stopAnimation(), n.attr(i)));
  }
  function Ul(t, e) {
    if (b(t) && b(e)) {
      var n = !0;
      return (
        f(e, function (e, i) {
          n = n && Ul(t[i], e);
        }),
        !!n
      );
    }
    return t === e;
  }
  function Xl(t, e) {
    t[e.get("label.show") ? "show" : "hide"]();
  }
  function Yl(t) {
    return {
      position: t.position.slice(),
      rotation: t.rotation || 0,
    };
  }
  function jl(t, e, n) {
    var i = e.get("z"),
      r = e.get("zlevel");
    t &&
      t.traverse(function (t) {
        "group" !== t.type && (null != i && (t.z = i), null != r && (t.zlevel = r), (t.silent = n));
      });
  }
  function ql(t, e, n, i, r) {
    var o = $l(n.get("value"), e.axis, e.ecModel, n.get("seriesDataIndices"), {
        precision: n.get("label.precision"),
        formatter: n.get("label.formatter"),
      }),
      a = n.getModel("label"),
      s = Gg(a.get("padding") || 0),
      l = a.getFont(),
      h = ye(o, l),
      u = r.position,
      c = h.width + s[1] + s[3],
      d = h.height + s[0] + s[2],
      f = r.align;
    ("right" === f && (u[0] -= c), "center" === f && (u[0] -= c / 2));
    var p = r.verticalAlign;
    ("bottom" === p && (u[1] -= d),
      "middle" === p && (u[1] -= d / 2),
      (function (t, e, n, i) {
        var r = i.getWidth(),
          o = i.getHeight();
        ((t[0] = Math.min(t[0] + e, r) - e),
          (t[1] = Math.min(t[1] + n, o) - n),
          (t[0] = Math.max(t[0], 0)),
          (t[1] = Math.max(t[1], 0)));
      })(u, c, d, i));
    var g = a.get("backgroundColor");
    ((g && "auto" !== g) || (g = e.get("axisLine.lineStyle.color")),
      (t.label = {
        shape: {
          x: 0,
          y: 0,
          width: c,
          height: d,
          r: a.get("borderRadius"),
        },
        position: u.slice(),
        style: {
          text: o,
          textFont: l,
          textFill: a.getTextColor(),
          textPosition: "inside",
          fill: g,
          stroke: a.get("borderColor") || "transparent",
          lineWidth: a.get("borderWidth") || 0,
          shadowBlur: a.get("shadowBlur"),
          shadowColor: a.get("shadowColor"),
          shadowOffsetX: a.get("shadowOffsetX"),
          shadowOffsetY: a.get("shadowOffsetY"),
        },
        z2: 10,
      }));
  }
  function $l(t, e, n, i, r) {
    t = e.scale.parse(t);
    var o = e.scale.getLabel(t, {
        precision: r.precision,
      }),
      a = r.formatter;
    if (a) {
      var s = {
        value: is(e, t),
        seriesData: [],
      };
      (f(i, function (t) {
        var typeof_ = n.getSeriesByIndex(t.seriesIndex),
          i = t.dataIndexInside,
          r = typeof_ && typeof_.getDataParams(i);
        r && s.seriesData.push(r);
      }),
        w(a) ? (o = a.replace("{value}", o)) : _(a) && (o = a(s)));
    }
    return o;
  }
  function Kl(t, e, n) {
    var i = ft();
    return (
      yt(i, i, n.rotation),
      vt(i, i, n.position),
      Ri(
        [t.dataToCoord(e), (n.labelOffset || 0) + (n.labelDirection || 1) * (n.labelMargin || 0)],
        i,
      )
    );
  }
  function Ql(t, e, n) {
    return {
      x: t[(n = n || 0)],
      y: t[1 - n],
      width: e[n],
      height: e[1 - n],
    };
  }
  function Jl(t, e) {
    var n = {};
    return ((n[e.dim + "AxisIndex"] = e.index), t.getCartesian(n));
  }
  function th(t) {
    return "x" === t.dim ? 0 : 1;
  }
  function eh(t) {
    var typeof_ = [],
      n = t.get("transitionDuration"),
      i = t.get("backgroundColor"),
      r = t.getModel("textStyle"),
      o = t.get("padding");
    return (
      n &&
        typeof_.push(
          (function (t) {
            var typeof_ =
              "left " +
              t +
              "s cubic-bezier(0.23, 1, 0.32, 1),top " +
              t +
              "s cubic-bezier(0.23, 1, 0.32, 1)";
            return p(x_, function (t) {
              return t + "transition:" + typeof_;
            }).join(";");
          })(n),
        ),
      i &&
        (Hc.canvasSupported
          ? typeof_.push("background-Color:" + i)
          : (typeof_.push("background-Color:#" + Et(i)), typeof_.push("filter:alpha(opacity=70)"))),
      v_(["width", "color", "radius"], function (n) {
        var i = "border-" + n,
          r = y_(i),
          o = t.get(r);
        null != o && typeof_.push(i + ":" + o + ("color" === n ? "" : "px"));
      }),
      typeof_.push(
        (function (t) {
          var typeof_ = [],
            n = t.get("fontSize"),
            i = t.getTextColor();
          return (
            i && typeof_.push("color:" + i),
            typeof_.push("font:" + t.getFont()),
            n && typeof_.push("line-height:" + Math.round((3 * n) / 2) + "px"),
            v_(["decoration", "align"], function (n) {
              var i = t.get(n);
              i && typeof_.push("text-" + n + ":" + i);
            }),
            typeof_.join(";")
          );
        })(r),
      ),
      null != o && typeof_.push("padding:" + Gg(o).join("px ") + "px"),
      typeof_.join(";") + ";"
    );
  }
  function nh(t, e) {
    if (Hc.wxa) return null;
    var n = document.createElement("div"),
      i = (this._zr = e.getZr());
    ((this.el = n),
      (this._x = e.getWidth() / 2),
      (this._y = e.getHeight() / 2),
      t.appendChild(n),
      (this._container = t),
      (this._show = !1),
      this._hideTimeout);
    var r = this;
    ((n.onmouseenter = function () {
      (r._enterable && (clearTimeout(r._hideTimeout), (r._show = !0)), (r._inContent = !0));
    }),
      (n.onmousemove = function (e) {
        if (((e = e || window.event), !r._enterable)) {
          var n = i.handler;
          (ot(t, e, !0), n.dispatch("mousemove", e));
        }
      }),
      (n.onmouseleave = function () {
        (r._enterable && r._show && r.hideLater(r._hideDelay), (r._inContent = !1));
      }));
  }
  function ih(t) {
    ((this._zr = t.getZr()), (this._show = !1), this._hideTimeout);
  }
  function rh(t) {
    for (var typeof_ = t.pop(); t.length;) {
      var n = t.pop();
      n &&
        (Wi.isInstance(n) && (n = n.get("tooltip", !0)),
        "string" == typeof n &&
          (n = {
            formatter: n,
          }),
        (e = new Wi(n, typeof_, typeof_.ecModel)));
    }
    return typeof_;
  }
  function oh(t, e) {
    return t.dispatchAction || v(e.dispatchAction, e);
  }
  function ah(t) {
    return "center" === t || "middle" === t;
  }
  function sh(t, e, n) {
    var i,
      r = {},
      o = "toggleSelected" === t;
    return (
      n.eachComponent("legend", function (n) {
        (o && null != i
          ? n[i ? "select" : "unSelect"](e.name)
          : (n[t](e.name), (i = n.isSelected(e.name))),
          f(n.getData(), function (t) {
            var typeof_ = t.get("name");
            if ("\n" !== typeof_ && "" !== typeof_) {
              var i = n.isSelected(typeof_);
              r.hasOwnProperty(typeof_) ? (r[typeof_] = r[typeof_] && i) : (r[typeof_] = i);
            }
          }));
      }),
      {
        name: e.name,
        selected: r,
      }
    );
  }
  function lh(t, e) {
    var n = Gg(e.get("padding")),
      i = e.getItemStyle(["color", "opacity"]);
    return (
      (i.fill = e.get("backgroundColor")),
      new pg({
        shape: {
          x: t.x - n[3],
          y: t.y - n[0],
          width: t.width + n[1] + n[3],
          height: t.height + n[0] + n[2],
          r: e.get("borderRadius"),
        },
        style: i,
        silent: !0,
        z2: -1,
      })
    );
  }
  function hh(t, e) {
    e.dispatchAction({
      type: "legendToggleSelect",
      name: t,
    });
  }
  function uh(t, e, n, i) {
    var r = n.getZr().storage.getDisplayList()[0];
    (r && r.useHoverLayer) ||
      n.dispatchAction({
        type: "highlight",
        seriesName: t,
        name: e,
        excludeSeriesId: i,
      });
  }
  function ch(t, e, n, i) {
    var r = n.getZr().storage.getDisplayList()[0];
    (r && r.useHoverLayer) ||
      n.dispatchAction({
        type: "downplay",
        seriesName: t,
        name: e,
        excludeSeriesId: i,
      });
  }
  function dh(t, e, n) {
    var i = [1, 1];
    ((i[t.getOrient().index] = 0),
      vr(e, n, {
        type: "box",
        ignoreSize: i,
      }));
  }
  function fh(t) {
    on(t, "label", ["show"]);
  }
  function ph(t, e, n, i, r, o) {
    var a = [],
      s = za(e, i) ? e.getCalculationInfo("stackResultDimension") : i,
      l = xh(e, s, t),
      h = e.indicesOfNearest(s, l)[0];
    ((a[r] = e.get(n, h)), (a[o] = e.get(i, h)));
    var u = $i(e.get(i, h));
    return ((u = Math.min(u, 20)) >= 0 && (a[o] = +a[o].toFixed(u)), a);
  }
  function gh(t, e) {
    var n = t.getData(),
      r = t.coordinateSystem;
    if (
      e &&
      !(function (t) {
        return !isNaN(parseFloat(t.x)) && !isNaN(parseFloat(t.y));
      })(e) &&
      !x(e.coord) &&
      r
    ) {
      var o = r.dimensions,
        a = mh(e, n, r, t);
      if ((e = i(e)).type && F_[e.type] && a.baseAxis && a.valueAxis) {
        var s = R_(o, a.baseAxis.dim),
          l = R_(o, a.valueAxis.dim);
        ((e.coord = F_[e.type](n, a.baseDataDim, a.valueDataDim, s, l)), (e.value = e.coord[l]));
      } else {
        for (
          var h = [
              null != e.xAxis ? e.xAxis : e.radiusAxis,
              null != e.yAxis ? e.yAxis : e.angleAxis,
            ],
            u = 0;
          u < 2;
          u++
        )
          F_[h[u]] && (h[u] = xh(n, n.mapDimension(o[u]), h[u]));
        e.coord = h;
      }
    }
    return e;
  }
  function mh(t, e, n, i) {
    var r = {};
    return (
      null != t.valueIndex || null != t.valueDim
        ? ((r.valueDataDim = null != t.valueIndex ? e.getDimension(t.valueIndex) : t.valueDim),
          (r.valueAxis = n.getAxis(
            (function (t, e) {
              var n = t.getData(),
                i = n.dimensions;
              e = n.getDimension(e);
              for (var r = 0; r < i.length; r++) {
                var o = n.getDimensionInfo(i[r]);
                if (o.name === e) return o.coordDim;
              }
            })(i, r.valueDataDim),
          )),
          (r.baseAxis = n.getOtherAxis(r.valueAxis)),
          (r.baseDataDim = e.mapDimension(r.baseAxis.dim)))
        : ((r.baseAxis = i.getBaseAxis()),
          (r.valueAxis = n.getOtherAxis(r.baseAxis)),
          (r.baseDataDim = e.mapDimension(r.baseAxis.dim)),
          (r.valueDataDim = e.mapDimension(r.valueAxis.dim))),
      r
    );
  }
  function vh(t, e) {
    return (
      !(
        t &&
        t.containData &&
        e.coord &&
        !(function (t) {
          return !(isNaN(parseFloat(t.x)) && isNaN(parseFloat(t.y)));
        })(e)
      ) || t.containData(e.coord)
    );
  }
  function yh(t, e, n, i) {
    return i < 2 ? t.coord && t.coord[i] : t.value;
  }
  function xh(t, e, n) {
    if ("average" === n) {
      var i = 0,
        r = 0;
      return (
        t.each(e, function (t, e) {
          isNaN(t) || ((i += t), r++);
        }),
        i / r
      );
    }
    return "median" === n ? t.getMedian(e) : t.getDataExtent(e, !0)["max" === n ? 1 : 0];
  }
  function _h(t, e, n) {
    var i = e.coordinateSystem;
    t.each(function (r) {
      var o,
        a = t.getItemModel(r),
        s = Yi(a.get("x"), n.getWidth()),
        l = Yi(a.get("y"), n.getHeight());
      if (isNaN(s) || isNaN(l)) {
        if (e.getMarkerPosition) o = e.getMarkerPosition(t.getValues(t.dimensions, r));
        else if (i) {
          var h = t.get(i.dimensions[0], r),
            u = t.get(i.dimensions[1], r);
          o = i.dataToPoint([h, u]);
        }
      } else o = [s, l];
      (isNaN(s) || (o[0] = s), isNaN(l) || (o[1] = l), t.setItemLayout(r, o));
    });
  }
  function wh(t, e, n) {
    var i;
    i = t
      ? p(t && t.dimensions, function (t) {
          return s(
            {
              name: t,
            },
            e.getData().getDimensionInfo(e.getData().mapDimension(t)) || {},
          );
        })
      : [
          {
            name: "value",
            type: "float",
          },
        ];
    var r = new cy(i, n),
      o = p(n.get("data"), y(gh, e));
    return (
      t && (o = m(o, y(vh, t))),
      r.initData(
        o,
        null,
        t
          ? yh
          : function (t) {
              return t.value;
            },
      ),
      r
    );
  }
  function bh(t) {
    return isNaN(+t.cpx1) || isNaN(+t.cpy1);
  }
  function Sh(t) {
    return "_" + t + "Type";
  }
  function Mh(t, e, n) {
    var i = e.getItemVisual(n, "color"),
      r = e.getItemVisual(n, t),
      o = e.getItemVisual(n, t + "Size");
    if (r && "none" !== r) {
      x(o) || (o = [o, o]);
      var a = ls(r, -o[0] / 2, -o[1] / 2, o[0], o[1], i);
      return ((a.name = t), a);
    }
  }
  function Ih(t, e) {
    var n = e[0],
      i = e[1],
      r = e[2];
    ((t.x1 = n[0]),
      (t.y1 = n[1]),
      (t.x2 = i[0]),
      (t.y2 = i[1]),
      (t.percent = 1),
      r ? ((t.cpx1 = r[0]), (t.cpy1 = r[1])) : ((t.cpx1 = NaN), (t.cpy1 = NaN)));
  }
  function Th(t, e, n) {
    (qd.call(this), this._createLine(t, e, n));
  }
  function Ah(t) {
    ((this._ctor = t || Th), (this.group = new qd()));
  }
  function Ch(t) {
    var typeof_ = t.hostModel;
    return {
      lineStyle: typeof_.getModel("lineStyle").getLineStyle(),
      hoverLineStyle: typeof_.getModel("emphasis.lineStyle").getLineStyle(),
      labelModel: typeof_.getModel("label"),
      hoverLabelModel: typeof_.getModel("emphasis.label"),
    };
  }
  function Dh(t) {
    return isNaN(t[0]) || isNaN(t[1]);
  }
  function kh(t) {
    return !Dh(t[0]) && !Dh(t[1]);
  }
  function Ph(t) {
    return !isNaN(t) && !isFinite(t);
  }
  function Lh(t, e, n, i) {
    var r = 1 - t,
      o = i.dimensions[t];
    return Ph(e[r]) && Ph(n[r]) && e[t] === n[t] && i.getAxis(o).containData(e[t]);
  }
  function Oh(t, e) {
    if ("cartesian2d" === t.type) {
      var n = e[0].coord,
        i = e[1].coord;
      if (n && i && (Lh(1, n, i, t) || Lh(0, n, i, t))) return !0;
    }
    return vh(t, e[0]) && vh(t, e[1]);
  }
  function zh(t, e, n, i, r) {
    var o,
      a = i.coordinateSystem,
      s = t.getItemModel(e),
      l = Yi(s.get("x"), r.getWidth()),
      h = Yi(s.get("y"), r.getHeight());
    if (isNaN(l) || isNaN(h)) {
      if (i.getMarkerPosition) o = i.getMarkerPosition(t.getValues(t.dimensions, e));
      else {
        var u = a.dimensions,
          c = t.get(u[0], e),
          d = t.get(u[1], e);
        o = a.dataToPoint([c, d]);
      }
      if ("cartesian2d" === a.type) {
        var f = a.getAxis("x"),
          p = a.getAxis("y");
        ((u = a.dimensions),
          Ph(t.get(u[0], e))
            ? (o[0] = f.toGlobalCoord(f.getExtent()[n ? 0 : 1]))
            : Ph(t.get(u[1], e)) && (o[1] = p.toGlobalCoord(p.getExtent()[n ? 0 : 1])));
      }
      (isNaN(l) || (o[0] = l), isNaN(h) || (o[1] = h));
    } else o = [l, h];
    t.setItemLayout(e, o);
  }
  function Eh(t, e, n) {
    var i;
    i = t
      ? p(t && t.dimensions, function (t) {
          return s(
            {
              name: t,
            },
            e.getData().getDimensionInfo(e.getData().mapDimension(t)) || {},
          );
        })
      : [
          {
            name: "value",
            type: "float",
          },
        ];
    var r = new cy(i, n),
      o = new cy(i, n),
      a = new cy([], n),
      l = p(n.get("data"), y(Y_, e, t, n));
    t && (l = m(l, y(Oh, t)));
    var h = t
      ? yh
      : function (t) {
          return t.value;
        };
    return (
      r.initData(
        p(l, function (t) {
          return t[0];
        }),
        null,
        h,
      ),
      o.initData(
        p(l, function (t) {
          return t[1];
        }),
        null,
        h,
      ),
      a.initData(
        p(l, function (t) {
          return t[2];
        }),
      ),
      (a.hasItemOption = !0),
      {
        from: r,
        to: o,
        line: a,
      }
    );
  }
  function Nh(t) {
    return !isNaN(t) && !isFinite(t);
  }
  function Rh(t, e, n, i) {
    var r = 1 - t;
    return Nh(e[r]) && Nh(n[r]);
  }
  function Bh(t, e) {
    var n = e.coord[0],
      i = e.coord[1];
    return (
      !("cartesian2d" !== t.type || !n || !i || (!Rh(1, n, i) && !Rh(0, n, i))) ||
      vh(t, {
        coord: n,
        x: e.x0,
        y: e.y0,
      }) ||
      vh(t, {
        coord: i,
        x: e.x1,
        y: e.y1,
      })
    );
  }
  function Fh(t, e, n, i, r) {
    var o,
      a = i.coordinateSystem,
      s = t.getItemModel(e),
      l = Yi(s.get(n[0]), r.getWidth()),
      h = Yi(s.get(n[1]), r.getHeight());
    if (isNaN(l) || isNaN(h)) {
      if (i.getMarkerPosition) o = i.getMarkerPosition(t.getValues(n, e));
      else {
        var u = [(f = t.get(n[0], e)), (p = t.get(n[1], e))];
        (a.clampData && a.clampData(u, u), (o = a.dataToPoint(u, !0)));
      }
      if ("cartesian2d" === a.type) {
        var c = a.getAxis("x"),
          d = a.getAxis("y"),
          f = t.get(n[0], e),
          p = t.get(n[1], e);
        Nh(f)
          ? (o[0] = c.toGlobalCoord(c.getExtent()["x0" === n[0] ? 0 : 1]))
          : Nh(p) && (o[1] = d.toGlobalCoord(d.getExtent()["y0" === n[1] ? 0 : 1]));
      }
      (isNaN(l) || (o[0] = l), isNaN(h) || (o[1] = h));
    } else o = [l, h];
    return o;
  }
  function Vh(t, e, n) {
    var i = [1 / 0, -1 / 0];
    return (
      Q_(n, function (t) {
        var n = t.getData();
        n &&
          Q_(n.mapDimension(e, !0), function (t) {
            var typeof_ = n.getApproximateExtent(t);
            (typeof_[0] < i[0] && (i[0] = typeof_[0]), typeof_[1] > i[1] && (i[1] = typeof_[1]));
          });
      }),
      i[1] < i[0] && (i = [NaN, NaN]),
      (function (t, e) {
        var n = t.getAxisModel(),
          i = n.getMin(!0),
          r = "category" === n.get("type"),
          o = r && n.getCategories().length;
        null != i && "dataMin" !== i && "function" != typeof i
          ? (e[0] = i)
          : r && (e[0] = o > 0 ? 0 : NaN);
        var a = n.getMax(!0);
        (null != a && "dataMax" !== a && "function" != typeof a
          ? (e[1] = a)
          : r && (e[1] = o > 0 ? o - 1 : NaN),
          n.get("scale", !0) || (e[0] > 0 && (e[0] = 0), e[1] < 0 && (e[1] = 0)));
      })(t, i),
      i
    );
  }
  function Hh(t, e) {
    var n = t.getAxisModel(),
      i = t._percentWindow,
      r = t._valueWindow;
    if (i) {
      var o = Qi(r, [0, 500]);
      o = Math.min(o, 20);
      var a = e || (0 === i[0] && 100 === i[1]);
      n.setRange(a ? null : +r[0].toFixed(o), a ? null : +r[1].toFixed(o));
    }
  }
  function Wh(t) {
    var typeof_ = {};
    return (
      ew(["start", "end", "startValue", "endValue", "throttle"], function (n) {
        t.hasOwnProperty(n) && (typeof_[n] = t[n]);
      }),
      typeof_
    );
  }
  function Gh(t, e) {
    var n = t._rangePropMode,
      i = t.get("rangeMode");
    ew(
      [
        ["start", "startValue"],
        ["end", "endValue"],
      ],
      function (t, r) {
        var o = null != e[t[0]],
          a = null != e[t[1]];
        o && !a
          ? (n[r] = "percent")
          : !o && a
            ? (n[r] = "value")
            : i
              ? (n[r] = i[r])
              : o && (n[r] = "percent");
      },
    );
  }
  function Zh(t, e) {
    var n = t[e] - t[1 - e];
    return {
      span: Math.abs(n),
      sign: n > 0 ? -1 : n < 0 ? 1 : e ? -1 : 1,
    };
  }
  function Uh(t, e) {
    return Math.min(e[1], Math.max(e[0], t));
  }
  function Xh(t) {
    return "vertical" === t ? "ns-resize" : "ew-resize";
  }
  function Yh(t, e) {
    return !!jh(t)[e];
  }
  function jh(t) {
    return t[pw] || (t[pw] = {});
  }
  function qh(t) {
    (this.pointerChecker, (this._zr = t), (this._opt = {}));
    var typeof_ = v,
      n = typeof_($h, this),
      r = typeof_(Kh, this),
      o = typeof_(Qh, this),
      a = typeof_(Jh, this),
      l = typeof_(tu, this);
    (hd.call(this),
      (this.setPointerChecker = function (t) {
        this.pointerChecker = t;
      }),
      (this.enable = function (e, h) {
        (this.disable(),
          (this._opt = s(i(h) || {}, {
            zoomOnMouseWheel: !0,
            moveOnMouseMove: !0,
            moveOnMouseWheel: !1,
            preventDefaultMouseMove: !0,
          })),
          null == e && (e = !0),
          (!0 !== e && "move" !== e && "pan" !== e) ||
            (t.on("mousedown", n), t.on("mousemove", r), t.on("mouseup", o)),
          (!0 !== e && "scale" !== e && "zoom" !== e) || (t.on("mousewheel", a), t.on("pinch", l)));
      }),
      (this.disable = function () {
        (t.off("mousedown", n),
          t.off("mousemove", r),
          t.off("mouseup", o),
          t.off("mousewheel", a),
          t.off("pinch", l));
      }),
      (this.dispose = this.disable),
      (this.isDragging = function () {
        return this._dragging;
      }),
      (this.isPinching = function () {
        return this._pinching;
      }));
  }
  function $h(t) {
    if (!(lt(t) || (t.target && t.target.draggable))) {
      var typeof_ = t.offsetX,
        n = t.offsetY;
      this.pointerChecker &&
        this.pointerChecker(t, typeof_, n) &&
        ((this._x = typeof_), (this._y = n), (this._dragging = !0));
    }
  }
  function Kh(t) {
    if (
      this._dragging &&
      iu("moveOnMouseMove", t, this._opt) &&
      "pinch" !== t.gestureEvent &&
      !Yh(this._zr, "globalPan")
    ) {
      var typeof_ = t.offsetX,
        n = t.offsetY,
        i = this._x,
        r = this._y,
        o = typeof_ - i,
        a = n - r;
      ((this._x = typeof_),
        (this._y = n),
        this._opt.preventDefaultMouseMove && dd(t.event),
        nu(this, "pan", "moveOnMouseMove", t, {
          dx: o,
          dy: a,
          oldX: i,
          oldY: r,
          newX: typeof_,
          newY: n,
        }));
    }
  }
  function Qh(t) {
    lt(t) || (this._dragging = !1);
  }
  function Jh(t) {
    var typeof_ = iu("zoomOnMouseWheel", t, this._opt),
      n = iu("moveOnMouseWheel", t, this._opt),
      i = t.wheelDelta,
      r = Math.abs(i),
      o = t.offsetX,
      a = t.offsetY;
    if (0 !== i && (typeof_ || n)) {
      if (typeof_) {
        var s = r > 3 ? 1.4 : r > 1 ? 1.2 : 1.1;
        eu(this, "zoom", "zoomOnMouseWheel", t, {
          scale: i > 0 ? s : 1 / s,
          originX: o,
          originY: a,
        });
      }
      if (n) {
        var l = Math.abs(i);
        eu(this, "scrollMove", "moveOnMouseWheel", t, {
          scrollDelta: (i > 0 ? 1 : -1) * (l > 3 ? 0.4 : l > 1 ? 0.15 : 0.05),
          originX: o,
          originY: a,
        });
      }
    }
  }
  function tu(t) {
    Yh(this._zr, "globalPan") ||
      eu(this, "zoom", null, t, {
        scale: t.pinchScale > 1 ? 1.1 : 1 / 1.1,
        originX: t.pinchX,
        originY: t.pinchY,
      });
  }
  function eu(t, e, n, i, r) {
    t.pointerChecker &&
      t.pointerChecker(i, r.originX, r.originY) &&
      (dd(i.event), nu(t, e, n, i, r));
  }
  function nu(t, e, n, i, r) {
    ((r.isAvailableBehavior = v(iu, null, n, i)), t.trigger(e, r));
  }
  function iu(t, e, n) {
    var i = n[t];
    return !t || (i && (!w(i) || e.event[i + "Key"]));
  }
  function ru(t, e) {
    var n = au(t),
      i = e.dataZoomId,
      r = e.coordId;
    (f(n, function (t, n) {
      var o = t.dataZoomInfos;
      o[i] && h(e.allCoordIds, r) < 0 && (delete o[i], t.count--);
    }),
      su(n));
    var o = n[r];
    (o ||
      (((o = n[r] =
        {
          coordId: r,
          dataZoomInfos: {},
          count: 0,
        }).controller = (function (t, e) {
        var n = new qh(t.getZr());
        return (
          f(["pan", "zoom", "scrollMove"], function (t) {
            n.on(t, function (n) {
              var i = [];
              (f(e.dataZoomInfos, function (r) {
                if (n.isAvailableBehavior(r.dataZoomModel.option)) {
                  var o = (r.getRange || {})[t],
                    a = o && o(e.controller, n);
                  !r.dataZoomModel.get("disabled", !0) &&
                    a &&
                    i.push({
                      dataZoomId: r.dataZoomId,
                      start: a[0],
                      end: a[1],
                    });
                }
              }),
                i.length && e.dispatchAction(i));
            });
          }),
          n
        );
      })(t, o)),
      (o.dispatchAction = y(lu, t))),
      !o.dataZoomInfos[i] && o.count++,
      (o.dataZoomInfos[i] = e));
    var a = (function (t) {
      var typeof_,
        n = {
          type_true: 2,
          type_move: 1,
          type_false: 0,
          type_undefined: -1,
        },
        i = !0;
      return (
        f(t, function (t) {
          var r = t.dataZoomModel,
            o = !r.get("disabled", !0) && (!r.get("zoomLock", !0) || "move");
          (n["type_" + o] > n["type_" + typeof_] && (e = o),
            (i &= r.get("preventDefaultMouseMove", !0)));
        }),
        {
          controlType: typeof_,
          opt: {
            zoomOnMouseWheel: !0,
            moveOnMouseMove: !0,
            moveOnMouseWheel: !0,
            preventDefaultMouseMove: !!i,
          },
        }
      );
    })(o.dataZoomInfos);
    (o.controller.enable(a.controlType, a.opt),
      o.controller.setPointerChecker(e.containsPoint),
      vo(o, "dispatchAction", e.dataZoomModel.get("throttle", !0), "fixRate"));
  }
  function ou(t) {
    return t.type + "\0_" + t.id;
  }
  function au(t) {
    var typeof_ = t.getZr();
    return typeof_[gw] || (typeof_[gw] = {});
  }
  function su(t) {
    f(t, function (e, n) {
      e.count || (e.controller.dispose(), delete t[n]);
    });
  }
  function lu(t, e) {
    t.dispatchAction({
      type: "dataZoom",
      batch: e,
    });
  }
  function hu(t) {
    return function (e, n, i, r) {
      var o = this._range,
        a = o.slice(),
        s = e.axisModels[0];
      if (s) {
        var l = t(a, s, e, n, i, r);
        return (
          ow(l, a, [0, 100], "all"),
          (this._range = a),
          o[0] !== a[0] || o[1] !== a[1] ? a : void 0
        );
      }
    };
  }
  function uu(t, e) {
    _w[t] = e;
  }
  function cu(t) {
    return _w[t];
  }
  function du(t) {
    this.model = t;
  }
  function fu(t) {
    this.model = t;
  }
  function pu(t) {
    var typeof_ = [];
    return (
      f(t, function (t, n) {
        var i = t.categoryAxis,
          r = t.valueAxis.dim,
          o = [" "].concat(
            p(t.series, function (t) {
              return t.name;
            }),
          ),
          a = [i.model.getCategories()];
        f(t.series, function (t) {
          a.push(
            t.getRawData().mapArray(r, function (t) {
              return t;
            }),
          );
        });
        for (var s = [o.join(Dw)], l = 0; l < a[0].length; l++) {
          for (var h = [], u = 0; u < a.length; u++) h.push(a[u][l]);
          s.push(h.join(Dw));
        }
        typeof_.push(s.join("\n"));
      }),
      typeof_.join("\n\n" + Cw + "\n\n")
    );
  }
  function gu(t) {
    return p(t, function (t) {
      var typeof_ = t.getRawData(),
        n = [t.name],
        i = [];
      return (
        typeof_.each(typeof_.dimensions, function () {
          for (
            var t = arguments.length, r = arguments[t - 1], o = typeof_.getName(r), a = 0;
            a < t - 1;
            a++
          )
            i[a] = arguments[a];
          n.push((o ? o + Dw : "") + i.join(Dw));
        }),
        n.join("\n")
      );
    }).join("\n\n" + Cw + "\n\n");
  }
  function mu(t) {
    var typeof_ = (function (t) {
      var typeof_ = {},
        n = [],
        i = [];
      return (
        t.eachRawSeries(function (t) {
          var r = t.coordinateSystem;
          if (!r || ("cartesian2d" !== r.type && "polar" !== r.type)) n.push(t);
          else {
            var o = r.getBaseAxis();
            if ("category" === o.type) {
              var a = o.dim + "_" + o.index;
              (typeof_[a] ||
                ((typeof_[a] = {
                  categoryAxis: o,
                  valueAxis: r.getOtherAxis(o),
                  series: [],
                }),
                i.push({
                  axisDim: o.dim,
                  axisIndex: o.index,
                })),
                typeof_[a].series.push(t));
            } else n.push(t);
          }
        }),
        {
          seriesGroupByCategoryAxis: typeof_,
          other: n,
          meta: i,
        }
      );
    })(t);
    return {
      value: m([pu(typeof_.seriesGroupByCategoryAxis), gu(typeof_.other)], function (t) {
        return t.replace(/[\n\t\s]/g, "");
      }).join("\n\n" + Cw + "\n\n"),
      meta: typeof_.meta,
    };
  }
  function vu(t) {
    return t.replace(/^\s\s*/, "").replace(/\s\s*$/, "");
  }
  function yu(t, e) {
    var n = {
      series: [],
    };
    return (
      f(t.split(new RegExp("\n*" + Cw + "\n*", "g")), function (t, i) {
        if (
          (function (t) {
            if (t.slice(0, t.indexOf("\n")).indexOf(Dw) >= 0) return !0;
          })(t)
        ) {
          var r = (function (t) {
              for (
                var typeof_ = t.split(/\n+/g),
                  n = [],
                  i = p(vu(typeof_.shift()).split(kw), function (t) {
                    return {
                      name: t,
                      data: [],
                    };
                  }),
                  r = 0;
                r < typeof_.length;
                r++
              ) {
                var o = vu(typeof_[r]).split(kw);
                n.push(o.shift());
                for (var a = 0; a < o.length; a++) i[a] && (i[a].data[r] = o[a]);
              }
              return {
                series: i,
                categories: n,
              };
            })(t),
            o = e[i],
            a = o.axisDim + "Axis";
          o &&
            ((n[a] = n[a] || []),
            (n[a][o.axisIndex] = {
              data: r.categories,
            }),
            (n.series = n.series.concat(r.series)));
        } else
          ((r = (function (t) {
            for (
              var typeof_ = t.split(/\n+/g), n = vu(typeof_.shift()), i = [], r = 0;
              r < typeof_.length;
              r++
            ) {
              var o,
                a = vu(typeof_[r]).split(kw),
                s = "",
                l = !1;
              isNaN(a[0])
                ? ((l = !0),
                  (s = a[0]),
                  (a = a.slice(1)),
                  (i[r] = {
                    name: s,
                    value: [],
                  }),
                  (o = i[r].value))
                : (o = i[r] = []);
              for (var h = 0; h < a.length; h++) o.push(+a[h]);
              1 === o.length && (l ? (i[r].value = o[0]) : (i[r] = o[0]));
            }
            return {
              name: n,
              data: i,
            };
          })(t)),
            n.series.push(r));
      }),
      n
    );
  }
  function xu(t) {
    ((this._dom = null), (this.model = t));
  }
  function _u(t, e) {
    return p(t, function (t, n) {
      var i = e && e[n];
      return b(i) && !x(i)
        ? (b(t) && !x(t) && (t = t.value),
          s(
            {
              value: t,
            },
            i,
          ))
        : t;
    });
  }
  function wu(t) {
    (hd.call(this),
      (this._zr = t),
      (this.group = new qd()),
      this._brushType,
      this._brushOption,
      this._panels,
      (this._track = []),
      this._dragging,
      (this._covers = []),
      this._creatingCover,
      this._creatingPanel,
      this._enableGlobalPan,
      (this._uid = "brushController_" + Zw++),
      (this._handlers = {}),
      Lw(
        Uw,
        function (t, e) {
          this._handlers[e] = v(t, this);
        },
        this,
      ));
  }
  function bu(t, e) {
    var n = t._zr;
    (t._enableGlobalPan ||
      (function (t, e, n) {
        jh(t)[e] = n;
      })(n, Vw, t._uid),
      Lw(t._handlers, function (t, e) {
        n.on(e, t);
      }),
      (t._brushType = e.brushType),
      (t._brushOption = r(i(Gw), e, !0)));
  }
  function Su(t) {
    var typeof_ = t._zr;
    ((function (t, e, n) {
      var i = jh(t);
      i[e] === n && (i[e] = null);
    })(typeof_, Vw, t._uid),
      Lw(t._handlers, function (t, n) {
        typeof_.off(n, t);
      }),
      (t._brushType = t._brushOption = null));
  }
  function Mu(t, e) {
    var n = Xw[e.brushType].createCover(t, e);
    return ((n.__brushOption = e), Au(n, e), t.group.add(n), n);
  }
  function Iu(t, e) {
    var n = Du(e);
    return (n.endCreating && (n.endCreating(t, e), Au(e, e.__brushOption)), e);
  }
  function Tu(t, e) {
    var n = e.__brushOption;
    Du(e).updateCoverShape(t, e, n.range, n);
  }
  function Au(t, e) {
    var n = e.z;
    (null == n && (n = Rw),
      t.traverse(function (t) {
        ((t.z = n), (t.z2 = n));
      }));
  }
  function Cu(t, e) {
    (Du(e).updateCommon(t, e), Tu(t, e));
  }
  function Du(t) {
    return Xw[t.__brushOption.brushType];
  }
  function ku(t, e, n) {
    var i = t._panels;
    if (!i) return !0;
    var r,
      o = t._transform;
    return (
      Lw(i, function (t) {
        t.isTargetByCursor(e, n, o) && (r = t);
      }),
      r
    );
  }
  function Pu(t, e) {
    var n = t._panels;
    if (!n) return !0;
    var i = e.__brushOption.panelId;
    return null == i || n[i];
  }
  function Lu(t) {
    var typeof_ = t._covers,
      n = typeof_.length;
    return (
      Lw(
        typeof_,
        function (e) {
          t.group.remove(e);
        },
        t,
      ),
      (typeof_.length = 0),
      !!n
    );
  }
  function Ou(t, e) {
    var n = Ow(t._covers, function (t) {
      var typeof_ = t.__brushOption,
        n = i(typeof_.range);
      return {
        brushType: typeof_.brushType,
        panelId: typeof_.panelId,
        range: n,
      };
    });
    t.trigger("brush", n, {
      isEnd: !!e.isEnd,
      removeOnClick: !!e.removeOnClick,
    });
  }
  function zu(t) {
    var typeof_ = t.length - 1;
    return (typeof_ < 0 && (e = 0), [t[0], t[typeof_]]);
  }
  function Eu(t, e, n, i) {
    var r = new qd();
    return (
      r.add(
        new pg({
          name: "main",
          style: Fu(n),
          silent: !0,
          draggable: !0,
          cursor: "move",
          drift: Pw(t, e, r, "nswe"),
          ondragend: Pw(Ou, e, {
            isEnd: !0,
          }),
        }),
      ),
      Lw(i, function (n) {
        r.add(
          new pg({
            name: n,
            style: {
              opacity: 0,
            },
            draggable: !0,
            silent: !0,
            invisible: !0,
            drift: Pw(t, e, r, n),
            ondragend: Pw(Ou, e, {
              isEnd: !0,
            }),
          }),
        );
      }),
      r
    );
  }
  function Nu(t, e, n, i) {
    var r = i.brushStyle.lineWidth || 0,
      o = Ew(r, Fw),
      a = n[0][0],
      s = n[1][0],
      l = a - r / 2,
      h = s - r / 2,
      u = n[0][1],
      c = n[1][1],
      d = u - o + r / 2,
      f = c - o + r / 2,
      p = u - a,
      g = c - s,
      m = p + r,
      v = g + r;
    (Bu(t, e, "main", a, s, p, g),
      i.transformable &&
        (Bu(t, e, "w", l, h, o, v),
        Bu(t, e, "e", d, h, o, v),
        Bu(t, e, "n", l, h, m, o),
        Bu(t, e, "s", l, f, m, o),
        Bu(t, e, "nw", l, h, o, o),
        Bu(t, e, "ne", d, h, o, o),
        Bu(t, e, "sw", l, f, o, o),
        Bu(t, e, "se", d, f, o, o)));
  }
  function Ru(t, e) {
    var n = e.__brushOption,
      i = n.transformable,
      r = e.childAt(0);
    (r.useStyle(Fu(n)),
      r.attr({
        silent: !i,
        cursor: i ? "move" : "default",
      }),
      Lw(["w", "e", "n", "s", "se", "sw", "ne", "nw"], function (n) {
        var r = e.childOfName(n),
          o = Hu(t, n);
        r &&
          r.attr({
            silent: !i,
            invisible: !i,
            cursor: i ? Ww[o] + "-resize" : null,
          });
      }));
  }
  function Bu(t, e, n, i, r, o, a) {
    var s = e.childOfName(n);
    s &&
      s.setShape(
        (function (t) {
          var typeof_ = zw(t[0][0], t[1][0]),
            n = zw(t[0][1], t[1][1]);
          return {
            x: typeof_,
            y: n,
            width: Ew(t[0][0], t[1][0]) - typeof_,
            height: Ew(t[0][1], t[1][1]) - n,
          };
        })(
          Uu(t, e, [
            [i, r],
            [i + o, r + a],
          ]),
        ),
      );
  }
  function Fu(t) {
    return s(
      {
        strokeNoScale: !0,
      },
      t.brushStyle,
    );
  }
  function Vu(t, e, n, i) {
    var r = [zw(t, n), zw(e, i)],
      o = [Ew(t, n), Ew(e, i)];
    return [
      [r[0], o[0]],
      [r[1], o[1]],
    ];
  }
  function Hu(t, e) {
    if (e.length > 1)
      return (
        ("e" === (n = [Hu(t, (e = e.split(""))[0]), Hu(t, e[1])])[0] || "w" === n[0]) &&
          n.reverse(),
        n.join("")
      );
    var n = Bi(
      {
        w: "left",
        e: "right",
        n: "top",
        s: "bottom",
      }[e],
      (function (t) {
        return Ni(t.group);
      })(t),
    );
    return {
      left: "w",
      right: "e",
      top: "n",
      bottom: "s",
    }[n];
  }
  function Wu(t, e, n, i, r, o, a, s) {
    var l = i.__brushOption,
      h = t(l.range),
      u = Zu(n, o, a);
    (Lw(r.split(""), function (t) {
      var typeof_ = Hw[t];
      h[typeof_[0]][typeof_[1]] += u[typeof_[0]];
    }),
      (l.range = e(Vu(h[0][0], h[1][0], h[0][1], h[1][1]))),
      Cu(n, i),
      Ou(n, {
        isEnd: !1,
      }));
  }
  function Gu(t, e, n, i, r) {
    var o = e.__brushOption.range,
      a = Zu(t, n, i);
    (Lw(o, function (t) {
      ((t[0] += a[0]), (t[1] += a[1]));
    }),
      Cu(t, e),
      Ou(t, {
        isEnd: !1,
      }));
  }
  function Zu(t, e, n) {
    var i = t.group,
      r = i.transformCoordToLocal(e, n),
      o = i.transformCoordToLocal(0, 0);
    return [r[0] - o[0], r[1] - o[1]];
  }
  function Uu(t, e, n) {
    var r = Pu(t, e);
    return r && !0 !== r ? r.clipPath(n, t._transform) : i(n);
  }
  function Xu(t) {
    var typeof_ = t.event;
    typeof_.preventDefault && typeof_.preventDefault();
  }
  function Yu(t, e, n) {
    return t.childOfName("main").contain(e, n);
  }
  function ju(t, e, n, r) {
    var o,
      a = t._creatingCover,
      s = t._creatingPanel,
      l = t._brushOption;
    if (
      (t._track.push(n.slice()),
      (function (t) {
        var typeof_ = t._track;
        if (!typeof_.length) return !1;
        var n = typeof_[typeof_.length - 1],
          i = typeof_[0],
          r = n[0] - i[0],
          o = n[1] - i[1];
        return Nw(r * r + o * o, 0.5) > Bw;
      })(t) || a)
    ) {
      if (s && !a) {
        "single" === l.brushMode && Lu(t);
        var h = i(l);
        ((h.brushType = qu(h.brushType, s)),
          (h.panelId = !0 === s ? null : s.panelId),
          (a = t._creatingCover = Mu(t, h)),
          t._covers.push(a));
      }
      if (a) {
        var u = Xw[qu(t._brushType, s)];
        ((a.__brushOption.range = u.getCreatingRange(Uu(t, a, t._track))),
          r && (Iu(t, a), u.updateCommon(t, a)),
          Tu(t, a),
          (o = {
            isEnd: r,
          }));
      }
    } else
      r &&
        "single" === l.brushMode &&
        l.removeOnClick &&
        ku(t, e, n) &&
        Lu(t) &&
        (o = {
          isEnd: r,
          removeOnClick: !0,
        });
    return o;
  }
  function qu(t, e) {
    return "auto" === t ? e.defaultBrushType : t;
  }
  function $u(t) {
    if (this._dragging) {
      Xu(t);
      var typeof_ = ju(this, t, this.group.transformCoordToLocal(t.offsetX, t.offsetY), !0);
      ((this._dragging = !1),
        (this._track = []),
        (this._creatingCover = null),
        typeof_ && Ou(this, typeof_));
    }
  }
  function Ku(t) {
    return {
      createCover: function (e, n) {
        return Eu(
          Pw(
            Wu,
            function (e) {
              var n = [e, [0, 100]];
              return (t && n.reverse(), n);
            },
            function (e) {
              return e[t];
            },
          ),
          e,
          n,
          [
            ["w", "e"],
            ["n", "s"],
          ][t],
        );
      },
      getCreatingRange: function (e) {
        var n = zu(e);
        return [zw(n[0][t], n[1][t]), Ew(n[0][t], n[1][t])];
      },
      updateCoverShape: function (e, n, i, r) {
        var o,
          a = Pu(e, n);
        if (!0 !== a && a.getLinearBrushOtherExtent)
          o = a.getLinearBrushOtherExtent(t, e._transform);
        else {
          var s = e._zr;
          o = [0, [s.getWidth(), s.getHeight()][1 - t]];
        }
        var l = [i, o];
        (t && l.reverse(), Nu(e, n, l, r));
      },
      updateCommon: Ru,
      contain: Yu,
    };
  }
  function Qu(t) {
    return (
      (t = ec(t)),
      function (e, n) {
        return Vi(e, t);
      }
    );
  }
  function Ju(t, e) {
    return (
      (t = ec(t)),
      function (n) {
        var i = null != e ? e : n,
          r = i ? t.width : t.height,
          o = i ? t.x : t.y;
        return [o, o + (r || 0)];
      }
    );
  }
  function tc(t, e, n) {
    return (
      (t = ec(t)),
      function (i, r, o) {
        return (
          t.contain(r[0], r[1]) &&
          !(function (t, e, n) {
            var i = e.getComponentByElement(t.topTarget),
              r = i && i.coordinateSystem;
            return i && i !== n && !Yw[i.mainType] && r && r.model !== n;
          })(i, e, n)
        );
      }
    );
  }
  function ec(t) {
    return ee.create(t);
  }
  function nc(t, e, n) {
    var i = (this._targetInfoList = []),
      r = {},
      o = rc(e, t);
    jw(tb, function (t, e) {
      (!n || !n.include || qw(n.include, e) >= 0) && t(o, i, r);
    });
  }
  function ic(t) {
    return (t[0] > t[1] && t.reverse(), t);
  }
  function rc(t, e) {
    return fn(t, e, {
      includeMainTypes: Qw,
    });
  }
  function oc(t, e, n, i) {
    var r = n.getAxis(["x", "y"][t]),
      o = ic(
        p([0, 1], function (t) {
          return e ? r.coordToData(r.toLocalCoord(i[t])) : r.toGlobalCoord(r.dataToCoord(i[t]));
        }),
      ),
      a = [];
    return (
      (a[t] = o),
      (a[1 - t] = [NaN, NaN]),
      {
        values: o,
        xyMinMax: a,
      }
    );
  }
  function ac(t, e, n, i) {
    return [e[0] - i[t] * n[0], e[1] - i[t] * n[1]];
  }
  function sc(t) {
    return t ? [t[0][1] - t[0][0], t[1][1] - t[1][0]] : [NaN, NaN];
  }
  function lc(t) {
    var typeof_ = t[ab];
    return (typeof_ || (e = t[ab] = [{}]), typeof_);
  }
  function hc(t, e, n) {
    ((this._brushController = new wu(n.getZr())).on("brush", v(this._onBrush, this)).mount(),
      this._isZoomActive);
  }
  function uc(t) {
    var typeof_ = {};
    return (
      f(["xAxisIndex", "yAxisIndex"], function (n) {
        ((typeof_[n] = t[n]),
          null == typeof_[n] && (typeof_[n] = "all"),
          (!1 === typeof_[n] || "none" === typeof_[n]) && (typeof_[n] = []));
      }),
      typeof_
    );
  }
  function cc(t, e) {
    t.setIconStatus(
      "back",
      (function (t) {
        return lc(t).length;
      })(e) > 1
        ? "emphasis"
        : "normal",
    );
  }
  function dc(t) {
    this.model = t;
  }
  function fc(t) {
    return db(t);
  }
  function pc(t) {
    return parseInt(t, 10);
  }
  function gc(t, e) {
    ((function () {
      if (!gb && mb) {
        gb = !0;
        var t = mb.styleSheets;
        t.length < 31
          ? mb.createStyleSheet().addRule(".zrvml", "behavior:url(#default#VML)")
          : t[0].addRule(".zrvml", "behavior:url(#default#VML)");
      }
    })(),
      (this.root = t),
      (this.storage = e));
    var n = document.createElement("div"),
      i = document.createElement("div");
    ((n.style.cssText =
      "display:inline-block;overflow:hidden;position:relative;width:300px;height:150px;"),
      (i.style.cssText = "position:absolute;left:0;top:0;"),
      t.appendChild(n),
      (this._vmlRoot = i),
      (this._vmlViewport = n),
      this.resize());
    var r = e.delFromStorage,
      o = e.addToStorage;
    ((e.delFromStorage = function (t) {
      (r.call(e, t), t && t.onRemove && t.onRemove(i));
    }),
      (e.addToStorage = function (t) {
        (t.onAdd && t.onAdd(i), o.call(e, t));
      }),
      (this._firstPaint = !0));
  }
  function mc(t) {
    return document.createElementNS(Xb, t);
  }
  function vc(t) {
    return $b(1e4 * t) / 1e4;
  }
  function yc(t) {
    return t < nS && t > -nS;
  }
  function xc(t, e) {
    e && _c(t, "transform", "matrix(" + jb.call(e, ",") + ")");
  }
  function _c(t, e, n) {
    (!n || ("linear" !== n.type && "radial" !== n.type)) && t.setAttribute(e, n);
  }
  function wc(t, e, n, i) {
    if (
      (function (t, e) {
        var n = e ? t.textFill : t.fill;
        return null != n && n !== qb;
      })(e, n)
    ) {
      var r = n ? e.textFill : e.fill;
      ((r = "transparent" === r ? qb : r),
        "none" !== t.getAttribute("clip-path") && r === qb && (r = "rgba(0, 0, 0, 0.002)"),
        _c(t, "fill", r),
        _c(t, "fill-opacity", null != e.fillOpacity ? e.fillOpacity * e.opacity : e.opacity));
    } else _c(t, "fill", qb);
    if (
      (function (t, e) {
        var n = e ? t.textStroke : t.stroke;
        return null != n && n !== qb;
      })(e, n)
    ) {
      var o = n ? e.textStroke : e.stroke;
      (_c(t, "stroke", (o = "transparent" === o ? qb : o)),
        _c(
          t,
          "stroke-width",
          (n ? e.textStrokeWidth : e.lineWidth) / (!n && e.strokeNoScale ? i.getLineScale() : 1),
        ),
        _c(t, "paint-order", n ? "stroke" : "fill"),
        _c(t, "stroke-opacity", null != e.strokeOpacity ? e.strokeOpacity : e.opacity),
        e.lineDash
          ? (_c(t, "stroke-dasharray", e.lineDash.join(",")),
            _c(t, "stroke-dashoffset", $b(e.lineDashOffset || 0)))
          : _c(t, "stroke-dasharray", ""),
        e.lineCap && _c(t, "stroke-linecap", e.lineCap),
        e.lineJoin && _c(t, "stroke-linejoin", e.lineJoin),
        e.miterLimit && _c(t, "stroke-miterlimit", e.miterLimit));
    } else _c(t, "stroke", qb);
  }
  function bc(t) {
    return "middle" === t ? "middle" : "bottom" === t ? "after-edge" : "hanging";
  }
  function Sc() {}
  function Mc(t, e, n, i) {
    for (var r = 0, o = e.length, a = 0, s = 0; r < o; r++) {
      var l = e[r];
      if (l.removed) {
        for (var h = [], u = s; u < s + l.count; u++) h.push(u);
        ((l.indices = h), (s += l.count));
      } else {
        for (h = [], u = a; u < a + l.count; u++) h.push(u);
        ((l.indices = h), (a += l.count), l.added || (s += l.count));
      }
    }
    return e;
  }
  function Ic(t) {
    return {
      newPos: t.newPos,
      components: t.components.slice(0),
    };
  }
  function Tc(t, e, n, i, r) {
    ((this._zrId = t),
      (this._svgRoot = e),
      (this._tagNames = "string" == typeof n ? [n] : n),
      (this._markLabel = i),
      (this._domName = r || "_dom"),
      (this.nextId = 0));
  }
  function Ac(t, e) {
    Tc.call(this, t, e, ["linearGradient", "radialGradient"], "__gradient_in_use__");
  }
  function Cc(t, e) {
    Tc.call(this, t, e, "clipPath", "__clippath_in_use__");
  }
  function Dc(t, e) {
    Tc.call(this, t, e, ["filter"], "__filter_in_use__", "_shadowDom");
  }
  function kc(t) {
    return (
      t &&
      (t.shadowBlur ||
        t.shadowOffsetX ||
        t.shadowOffsetY ||
        t.textShadowBlur ||
        t.textShadowOffsetX ||
        t.textShadowOffsetY)
    );
  }
  function Pc(t) {
    return parseInt(t, 10);
  }
  function Lc(t) {
    return t instanceof qn ? iS : t instanceof qe ? rS : t instanceof ng ? oS : iS;
  }
  function Oc(t, e) {
    return e && t && e.parentNode !== t;
  }
  function zc(t, e, n) {
    if (Oc(t, e) && n) {
      var i = n.nextSibling;
      i ? t.insertBefore(e, i) : t.appendChild(e);
    }
  }
  function Ec(t, e) {
    if (Oc(t, e)) {
      var n = t.firstChild;
      n ? t.insertBefore(e, n) : t.appendChild(e);
    }
  }
  function Nc(t, e) {
    e && t && e.parentNode === t && t.removeChild(e);
  }
  function Rc(t) {
    return t.__textSvgEl;
  }
  function Bc(t) {
    return t.__svgEl;
  }
  var Fc = 2311,
    Vc = function () {
      return Fc++;
    },
    Hc =
      "object" == ("undefined" == typeof wx ? "undefined" : typeof_(wx)) &&
      "function" == typeof wx.getSystemInfoSync
        ? {
            browser: {},
            os: {},
            node: !1,
            wxa: !0,
            canvasSupported: !0,
            svgSupported: !1,
            touchEventsSupported: !0,
            domSupported: !1,
          }
        : "undefined" == typeof document && "undefined" != typeof self
          ? {
              browser: {},
              os: {},
              node: !1,
              worker: !0,
              canvasSupported: !0,
              domSupported: !1,
            }
          : "undefined" == typeof navigator
            ? {
                browser: {},
                os: {},
                node: !0,
                worker: !1,
                canvasSupported: !0,
                svgSupported: !0,
                domSupported: !1,
              }
            : (function (t) {
                var typeof_ = {},
                  n = t.match(/Firefox\/([\d.]+)/),
                  i = t.match(/MSIE\s([\d.]+)/) || t.match(/Trident\/.+?rv:(([\d.]+))/),
                  r = t.match(/Edge\/([\d.]+)/),
                  o = /micromessenger/i.test(t);
                return (
                  n && ((typeof_.firefox = !0), (typeof_.version = n[1])),
                  i && ((typeof_.ie = !0), (typeof_.version = i[1])),
                  r && ((typeof_.edge = !0), (typeof_.version = r[1])),
                  o && (typeof_.weChat = !0),
                  {
                    browser: typeof_,
                    os: {},
                    node: !1,
                    canvasSupported: !!document.createElement("canvas").getContext,
                    svgSupported: "undefined" != typeof SVGRect,
                    touchEventsSupported: "ontouchstart" in window && !typeof_.ie && !typeof_.edge,
                    pointerEventsSupported:
                      "onpointerdown" in window &&
                      (typeof_.edge || (typeof_.ie && typeof_.version >= 11)),
                    domSupported: "undefined" != typeof document,
                  }
                );
              })(navigator.userAgent),
    Wc = {
      "[object Function]": 1,
      "[object RegExp]": 1,
      "[object Date]": 1,
      "[object Error]": 1,
      "[object CanvasGradient]": 1,
      "[object CanvasPattern]": 1,
      "[object Image]": 1,
      "[object Canvas]": 1,
    },
    Gc = {
      "[object Int8Array]": 1,
      "[object Uint8Array]": 1,
      "[object Uint8ClampedArray]": 1,
      "[object Int16Array]": 1,
      "[object Uint16Array]": 1,
      "[object Int32Array]": 1,
      "[object Uint32Array]": 1,
      "[object Float32Array]": 1,
      "[object Float64Array]": 1,
    },
    Zc = Object.prototype.toString,
    Uc = Array.prototype,
    Xc = Uc.forEach,
    Yc = Uc.filter,
    jc = Uc.slice,
    qc = Uc.map,
    $c = Uc.reduce,
    Kc = {},
    Qc = function () {
      return Kc.createCanvas();
    };
  Kc.createCanvas = function () {
    return document.createElement("canvas");
  };
  var Jc,
    td = "__ec_primitive__";
  N.prototype = {
    constructor: N,
    get: function (t) {
      return this.data.hasOwnProperty(t) ? this.data[t] : null;
    },
    set: function (t, e) {
      return (this.data[t] = e);
    },
    each: function (t, e) {
      for (var n in (void 0 !== e && (t = v(t, e)), this.data))
        this.data.hasOwnProperty(n) && t(this.data[n], n);
    },
    removeKey: function (t) {
      delete this.data[t];
    },
  };
  var ed = (Object.freeze || Object)({
      $override: n,
      clone: i,
      merge: r,
      mergeAll: o,
      extend: a,
      defaults: s,
      createCanvas: Qc,
      getContext: l,
      indexOf: h,
      inherits: u,
      mixin: c,
      isArrayLike: d,
      each: f,
      map: p,
      reduce: g,
      filter: m,
      find: function (t, e, n) {
        if (t && e)
          for (var i = 0, r = t.length; i < r; i++) if (e.call(n, t[i], i, t)) return t[i];
      },
      bind: v,
      curry: y,
      isArray: x,
      isFunction: _,
      isString: w,
      isObject: b,
      isBuiltInObject: S,
      isTypedArray: M,
      isDom: I,
      eqNaN: T,
      retrieve: A,
      retrieve2: C,
      retrieve3: D,
      slice: k,
      normalizeCssArray: P,
      assert: L,
      trim: O,
      setAsPrimitive: z,
      isPrimitive: E,
      createHashMap: R,
      concatArray: function (t, e) {
        for (var n = new t.constructor(t.length + e.length), i = 0; i < t.length; i++) n[i] = t[i];
        var r = t.length;
        for (i = 0; i < e.length; i++) n[i + r] = e[i];
        return n;
      },
      noop: B,
    }),
    nd = "undefined" == typeof Float32Array ? Array : Float32Array,
    id = U,
    rd = X,
    od = q,
    ad = $,
    sd = (Object.freeze || Object)({
      create: F,
      copy: V,
      clone: H,
      set: function (t, e, n) {
        return ((t[0] = e), (t[1] = n), t);
      },
      add: W,
      scaleAndAdd: G,
      sub: Z,
      len: U,
      length: id,
      lenSquare: X,
      lengthSquare: rd,
      mul: function (t, e, n) {
        return ((t[0] = e[0] * n[0]), (t[1] = e[1] * n[1]), t);
      },
      div: function (t, e, n) {
        return ((t[0] = e[0] / n[0]), (t[1] = e[1] / n[1]), t);
      },
      dot: function (t, e) {
        return t[0] * e[0] + t[1] * e[1];
      },
      scale: Y,
      normalize: j,
      distance: q,
      dist: od,
      distanceSquare: $,
      distSquare: ad,
      negate: function (t, e) {
        return ((t[0] = -e[0]), (t[1] = -e[1]), t);
      },
      lerp: function (t, e, n, i) {
        return ((t[0] = e[0] + i * (n[0] - e[0])), (t[1] = e[1] + i * (n[1] - e[1])), t);
      },
      applyTransform: K,
      min: Q,
      max: J,
    });
  tt.prototype = {
    constructor: tt,
    _dragStart: function (t) {
      var typeof_ = t.target;
      typeof_ &&
        typeof_.draggable &&
        ((this._draggingTarget = typeof_),
        (typeof_.dragging = !0),
        (this._x = t.offsetX),
        (this._y = t.offsetY),
        this.dispatchToElement(et(typeof_, t), "dragstart", t.event));
    },
    _drag: function (t) {
      var typeof_ = this._draggingTarget;
      if (typeof_) {
        var n = t.offsetX,
          i = t.offsetY,
          r = n - this._x,
          o = i - this._y;
        ((this._x = n),
          (this._y = i),
          typeof_.drift(r, o, t),
          this.dispatchToElement(et(typeof_, t), "drag", t.event));
        var a = this.findHover(n, i, typeof_).target,
          s = this._dropTarget;
        ((this._dropTarget = a),
          typeof_ !== a &&
            (s && a !== s && this.dispatchToElement(et(s, t), "dragleave", t.event),
            a && a !== s && this.dispatchToElement(et(a, t), "dragenter", t.event)));
      }
    },
    _dragEnd: function (t) {
      var typeof_ = this._draggingTarget;
      (typeof_ && (typeof_.dragging = !1),
        this.dispatchToElement(et(typeof_, t), "dragend", t.event),
        this._dropTarget && this.dispatchToElement(et(this._dropTarget, t), "drop", t.event),
        (this._draggingTarget = null),
        (this._dropTarget = null));
    },
  };
  var ld = Array.prototype.slice,
    hd = function (t) {
      ((this._$handlers = {}), (this._$eventProcessor = t));
    };
  hd.prototype = {
    constructor: hd,
    one: function (t, e, n, i) {
      return nt(this, t, e, n, i, !0);
    },
    on: function (t, e, n, i) {
      return nt(this, t, e, n, i, !1);
    },
    isSilent: function (t) {
      var typeof_ = this._$handlers;
      return !typeof_[t] || !typeof_[t].length;
    },
    off: function (t, e) {
      var n = this._$handlers;
      if (!t) return ((this._$handlers = {}), this);
      if (e) {
        if (n[t]) {
          for (var i = [], r = 0, o = n[t].length; r < o; r++) n[t][r].h !== e && i.push(n[t][r]);
          n[t] = i;
        }
        n[t] && 0 === n[t].length && delete n[t];
      } else delete n[t];
      return this;
    },
    trigger: function (t) {
      var typeof_ = this._$handlers[t],
        n = this._$eventProcessor;
      if (typeof_) {
        var i = arguments,
          r = i.length;
        r > 3 && (i = ld.call(i, 1));
        for (var o = typeof_.length, a = 0; a < o;) {
          var s = typeof_[a];
          if (n && n.filter && null != s.query && !n.filter(t, s.query)) a++;
          else {
            switch (r) {
              case 1:
                s.h.call(s.ctx);
                break;
              case 2:
                s.h.call(s.ctx, i[1]);
                break;
              case 3:
                s.h.call(s.ctx, i[1], i[2]);
                break;
              default:
                s.h.apply(s.ctx, i);
            }
            s.one ? (typeof_.splice(a, 1), o--) : a++;
          }
        }
      }
      return (n && n.afterTrigger && n.afterTrigger(t), this);
    },
    triggerWithContext: function (t) {
      var typeof_ = this._$handlers[t],
        n = this._$eventProcessor;
      if (typeof_) {
        var i = arguments,
          r = i.length;
        r > 4 && (i = ld.call(i, 1, i.length - 1));
        for (var o = i[i.length - 1], a = typeof_.length, s = 0; s < a;) {
          var l = typeof_[s];
          if (n && n.filter && null != l.query && !n.filter(t, l.query)) s++;
          else {
            switch (r) {
              case 1:
                l.h.call(o);
                break;
              case 2:
                l.h.call(o, i[1]);
                break;
              case 3:
                l.h.call(o, i[1], i[2]);
                break;
              default:
                l.h.apply(o, i);
            }
            l.one ? (typeof_.splice(s, 1), a--) : s++;
          }
        }
      }
      return (n && n.afterTrigger && n.afterTrigger(t), this);
    },
  };
  var ud = "undefined" != typeof window && !!window.addEventListener,
    cd = /^(?:mouse|pointer|contextmenu|drag|drop)|click/,
    dd = ud
      ? function (t) {
          (t.preventDefault(), t.stopPropagation(), (t.cancelBubble = !0));
        }
      : function (t) {
          ((t.returnValue = !1), (t.cancelBubble = !0));
        },
    fd = function () {
      this._track = [];
    };
  fd.prototype = {
    constructor: fd,
    recognize: function (t, e, n) {
      return (this._doTrack(t, e, n), this._recognize(t));
    },
    clear: function () {
      return ((this._track.length = 0), this);
    },
    _doTrack: function (t, e, n) {
      var i = t.touches;
      if (i) {
        for (
          var r = {
              points: [],
              touches: [],
              target: e,
              event: t,
            },
            o = 0,
            a = i.length;
          o < a;
          o++
        ) {
          var s = i[o],
            l = it(n, s, {});
          (r.points.push([l.zrX, l.zrY]), r.touches.push(s));
        }
        this._track.push(r);
      }
    },
    _recognize: function (t) {
      for (var typeof_ in pd)
        if (pd.hasOwnProperty(typeof_)) {
          var n = pd[typeof_](this._track, t);
          if (n) return n;
        }
    },
  };
  var pd = {
      pinch: function (t, e) {
        var n = t.length;
        if (n) {
          var i = (t[n - 1] || {}).points,
            r = (t[n - 2] || {}).points || i;
          if (r && r.length > 1 && i && i.length > 1) {
            var o = ht(i) / ht(r);
            (!isFinite(o) && (o = 1), (e.pinchScale = o));
            var a = (function (t) {
              return [(t[0][0] + t[1][0]) / 2, (t[0][1] + t[1][1]) / 2];
            })(i);
            return (
              (e.pinchX = a[0]),
              (e.pinchY = a[1]),
              {
                type: "pinch",
                target: t[0].target,
                event: e,
              }
            );
          }
        }
      },
    },
    gd = "silent";
  ct.prototype.dispose = function () {};
  var md = [
      "click",
      "dblclick",
      "mousewheel",
      "mouseout",
      "mouseup",
      "mousedown",
      "mousemove",
      "contextmenu",
    ],
    vd = function (t, e, n, i) {
      (hd.call(this),
        (this.storage = t),
        (this.painter = e),
        (this.painterRoot = i),
        (n = n || new ct()),
        (this.proxy = null),
        (this._hovered = {}),
        this._lastTouchMoment,
        this._lastX,
        this._lastY,
        this._gestureMgr,
        tt.call(this),
        this.setHandlerProxy(n));
    };
  ((vd.prototype = {
    constructor: vd,
    setHandlerProxy: function (t) {
      (this.proxy && this.proxy.dispose(),
        t &&
          (f(
            md,
            function (e) {
              t.on && t.on(e, this[e], this);
            },
            this,
          ),
          (t.handler = this)),
        (this.proxy = t));
    },
    mousemove: function (t) {
      var typeof_ = t.zrX,
        n = t.zrY,
        i = this._hovered,
        r = i.target;
      r && !r.__zr && (r = (i = this.findHover(i.x, i.y)).target);
      var o = (this._hovered = this.findHover(typeof_, n)),
        a = o.target,
        s = this.proxy;
      (s.setCursor && s.setCursor(a ? a.cursor : "default"),
        r && a !== r && this.dispatchToElement(i, "mouseout", t),
        this.dispatchToElement(o, "mousemove", t),
        a && a !== r && this.dispatchToElement(o, "mouseover", t));
    },
    mouseout: function (t) {
      this.dispatchToElement(this._hovered, "mouseout", t);
      var typeof_,
        n = t.toElement || t.relatedTarget;
      do {
        n = n && n.parentNode;
      } while (n && 9 !== n.nodeType && !(e = n === this.painterRoot));
      !typeof_ &&
        this.trigger("globalout", {
          event: t,
        });
    },
    resize: function (t) {
      this._hovered = {};
    },
    dispatch: function (t, e) {
      var n = this[t];
      n && n.call(this, e);
    },
    dispose: function () {
      (this.proxy.dispose(), (this.storage = this.proxy = this.painter = null));
    },
    setCursorStyle: function (t) {
      var typeof_ = this.proxy;
      typeof_.setCursor && typeof_.setCursor(t);
    },
    dispatchToElement: function (t, e, n) {
      var i = (t = t || {}).target;
      if (!i || !i.silent) {
        for (
          var r = "on" + e,
            o = (function (t, e, n) {
              return {
                type: t,
                event: n,
                target: e.target,
                topTarget: e.topTarget,
                cancelBubble: !1,
                offsetX: n.zrX,
                offsetY: n.zrY,
                gestureEvent: n.gestureEvent,
                pinchX: n.pinchX,
                pinchY: n.pinchY,
                pinchScale: n.pinchScale,
                wheelDelta: n.zrDelta,
                zrByTouch: n.zrByTouch,
                which: n.which,
                stop: ut,
              };
            })(e, t, n);
          i &&
          (i[r] && (o.cancelBubble = i[r].call(i, o)),
          i.trigger(e, o),
          (i = i.parent),
          !o.cancelBubble);
        );
        o.cancelBubble ||
          (this.trigger(e, o),
          this.painter &&
            this.painter.eachOtherLayer(function (t) {
              ("function" == typeof t[r] && t[r].call(t, o), t.trigger && t.trigger(e, o));
            }));
      }
    },
    findHover: function (t, e, n) {
      for (
        var i = this.storage.getDisplayList(),
          r = {
            x: t,
            y: e,
          },
          o = i.length - 1;
        o >= 0;
        o--
      ) {
        var a;
        if (
          i[o] !== n &&
          !i[o].ignore &&
          (a = dt(i[o], t, e)) &&
          (!r.topTarget && (r.topTarget = i[o]), a !== gd)
        ) {
          r.target = i[o];
          break;
        }
      }
      return r;
    },
    processGesture: function (t, e) {
      this._gestureMgr || (this._gestureMgr = new fd());
      var n = this._gestureMgr;
      "start" === e && n.clear();
      var i = n.recognize(t, this.findHover(t.zrX, t.zrY, null).target, this.proxy.dom);
      if (("end" === e && n.clear(), i)) {
        var r = i.type;
        ((t.gestureEvent = r),
          this.dispatchToElement(
            {
              target: i.target,
            },
            r,
            i.event,
          ));
      }
    },
  }),
    f(["click", "mousedown", "mouseup", "mousewheel", "dblclick", "contextmenu"], function (t) {
      vd.prototype[t] = function (e) {
        var n = this.findHover(e.zrX, e.zrY),
          i = n.target;
        if ("mousedown" === t)
          ((this._downEl = i), (this._downPoint = [e.zrX, e.zrY]), (this._upEl = i));
        else if ("mouseup" === t) this._upEl = i;
        else if ("click" === t) {
          if (
            this._downEl !== this._upEl ||
            !this._downPoint ||
            od(this._downPoint, [e.zrX, e.zrY]) > 4
          )
            return;
          this._downPoint = null;
        }
        this.dispatchToElement(n, t, e);
      };
    }),
    c(vd, hd),
    c(vd, tt));
  var yd = "undefined" == typeof Float32Array ? Array : Float32Array,
    xd = (Object.freeze || Object)({
      create: ft,
      identity: pt,
      copy: gt,
      mul: mt,
      translate: vt,
      rotate: yt,
      scale: xt,
      invert: _t,
      clone: function (t) {
        var typeof_ = ft();
        return (gt(typeof_, t), typeof_);
      },
    }),
    _d = pt,
    wd = 5e-5,
    bd = function (t) {
      ((t = t || {}).position || (this.position = [0, 0]),
        null == t.rotation && (this.rotation = 0),
        t.scale || (this.scale = [1, 1]),
        (this.origin = this.origin || null));
    },
    Sd = bd.prototype;
  ((Sd.transform = null),
    (Sd.needLocalTransform = function () {
      return (
        wt(this.rotation) ||
        wt(this.position[0]) ||
        wt(this.position[1]) ||
        wt(this.scale[0] - 1) ||
        wt(this.scale[1] - 1)
      );
    }));
  var Md = [];
  ((Sd.updateTransform = function () {
    var t = this.parent,
      typeof_ = t && t.transform,
      n = this.needLocalTransform(),
      i = this.transform;
    if (n || typeof_) {
      ((i = i || ft()),
        n ? this.getLocalTransform(i) : _d(i),
        typeof_ && (n ? mt(i, t.transform, i) : gt(i, t.transform)),
        (this.transform = i));
      var r = this.globalScaleRatio;
      if (null != r && 1 !== r) {
        this.getGlobalScale(Md);
        var o = Md[0] < 0 ? -1 : 1,
          a = Md[1] < 0 ? -1 : 1,
          s = ((Md[0] - o) * r + o) / Md[0] || 0,
          l = ((Md[1] - a) * r + a) / Md[1] || 0;
        ((i[0] *= s), (i[1] *= s), (i[2] *= l), (i[3] *= l));
      }
      ((this.invTransform = this.invTransform || ft()), _t(this.invTransform, i));
    } else i && _d(i);
  }),
    (Sd.getLocalTransform = function (t) {
      return bd.getLocalTransform(this, t);
    }),
    (Sd.setTransform = function (t) {
      var typeof_ = this.transform,
        n = t.dpr || 1;
      typeof_
        ? t.setTransform(
            n * typeof_[0],
            n * typeof_[1],
            n * typeof_[2],
            n * typeof_[3],
            n * typeof_[4],
            n * typeof_[5],
          )
        : t.setTransform(n, 0, 0, n, 0, 0);
    }),
    (Sd.restoreTransform = function (t) {
      var typeof_ = t.dpr || 1;
      t.setTransform(typeof_, 0, 0, typeof_, 0, 0);
    }));
  var Id = [],
    Td = ft();
  ((Sd.setLocalTransform = function (t) {
    if (t) {
      var typeof_ = t[0] * t[0] + t[1] * t[1],
        n = t[2] * t[2] + t[3] * t[3],
        i = this.position,
        r = this.scale;
      (wt(typeof_ - 1) && (e = Math.sqrt(typeof_)),
        wt(n - 1) && (n = Math.sqrt(n)),
        t[0] < 0 && (e = -typeof_),
        t[3] < 0 && (n = -n),
        (i[0] = t[4]),
        (i[1] = t[5]),
        (r[0] = typeof_),
        (r[1] = n),
        (this.rotation = Math.atan2(-t[1] / n, t[0] / typeof_)));
    }
  }),
    (Sd.decomposeTransform = function () {
      if (this.transform) {
        var t = this.parent,
          typeof_ = this.transform;
        t && t.transform && (mt(Id, t.invTransform, typeof_), (e = Id));
        var n = this.origin;
        (n &&
          (n[0] || n[1]) &&
          ((Td[4] = n[0]),
          (Td[5] = n[1]),
          mt(Id, typeof_, Td),
          (Id[4] -= n[0]),
          (Id[5] -= n[1]),
          (e = Id)),
          this.setLocalTransform(typeof_));
      }
    }),
    (Sd.getGlobalScale = function (t) {
      var typeof_ = this.transform;
      return (
        (t = t || []),
        typeof_
          ? ((t[0] = Math.sqrt(typeof_[0] * typeof_[0] + typeof_[1] * typeof_[1])),
            (t[1] = Math.sqrt(typeof_[2] * typeof_[2] + typeof_[3] * typeof_[3])),
            typeof_[0] < 0 && (t[0] = -t[0]),
            typeof_[3] < 0 && (t[1] = -t[1]),
            t)
          : ((t[0] = 1), (t[1] = 1), t)
      );
    }),
    (Sd.transformCoordToLocal = function (t, e) {
      var n = [t, e],
        i = this.invTransform;
      return (i && K(n, n, i), n);
    }),
    (Sd.transformCoordToGlobal = function (t, e) {
      var n = [t, e],
        i = this.transform;
      return (i && K(n, n, i), n);
    }),
    (bd.getLocalTransform = function (t, e) {
      _d((e = e || []));
      var n = t.origin,
        i = t.scale || [1, 1],
        r = t.rotation || 0,
        o = t.position || [0, 0];
      return (
        n && ((e[4] -= n[0]), (e[5] -= n[1])),
        xt(e, e, i),
        r && yt(e, e, r),
        n && ((e[4] += n[0]), (e[5] += n[1])),
        (e[4] += o[0]),
        (e[5] += o[1]),
        e
      );
    }));
  var Ad = {
    linear: function (t) {
      return t;
    },
    quadraticIn: function (t) {
      return t * t;
    },
    quadraticOut: function (t) {
      return t * (2 - t);
    },
    quadraticInOut: function (t) {
      return (t *= 2) < 1 ? 0.5 * t * t : -0.5 * (--t * (t - 2) - 1);
    },
    cubicIn: function (t) {
      return t * t * t;
    },
    cubicOut: function (t) {
      return --t * t * t + 1;
    },
    cubicInOut: function (t) {
      return (t *= 2) < 1 ? 0.5 * t * t * t : 0.5 * ((t -= 2) * t * t + 2);
    },
    quarticIn: function (t) {
      return t * t * t * t;
    },
    quarticOut: function (t) {
      return 1 - --t * t * t * t;
    },
    quarticInOut: function (t) {
      return (t *= 2) < 1 ? 0.5 * t * t * t * t : -0.5 * ((t -= 2) * t * t * t - 2);
    },
    quinticIn: function (t) {
      return t * t * t * t * t;
    },
    quinticOut: function (t) {
      return --t * t * t * t * t + 1;
    },
    quinticInOut: function (t) {
      return (t *= 2) < 1 ? 0.5 * t * t * t * t * t : 0.5 * ((t -= 2) * t * t * t * t + 2);
    },
    sinusoidalIn: function (t) {
      return 1 - Math.cos((t * Math.PI) / 2);
    },
    sinusoidalOut: function (t) {
      return Math.sin((t * Math.PI) / 2);
    },
    sinusoidalInOut: function (t) {
      return 0.5 * (1 - Math.cos(Math.PI * t));
    },
    exponentialIn: function (t) {
      return 0 === t ? 0 : Math.pow(1024, t - 1);
    },
    exponentialOut: function (t) {
      return 1 === t ? 1 : 1 - Math.pow(2, -10 * t);
    },
    exponentialInOut: function (t) {
      return 0 === t
        ? 0
        : 1 === t
          ? 1
          : (t *= 2) < 1
            ? 0.5 * Math.pow(1024, t - 1)
            : 0.5 * (2 - Math.pow(2, -10 * (t - 1)));
    },
    circularIn: function (t) {
      return 1 - Math.sqrt(1 - t * t);
    },
    circularOut: function (t) {
      return Math.sqrt(1 - --t * t);
    },
    circularInOut: function (t) {
      return (t *= 2) < 1
        ? -0.5 * (Math.sqrt(1 - t * t) - 1)
        : 0.5 * (Math.sqrt(1 - (t -= 2) * t) + 1);
    },
    elasticIn: function (t) {
      var typeof_,
        n = 0.1;
      return 0 === t
        ? 0
        : 1 === t
          ? 1
          : (!n || n < 1 ? ((n = 1), (e = 0.1)) : (e = (0.4 * Math.asin(1 / n)) / (2 * Math.PI)),
            -n * Math.pow(2, 10 * (t -= 1)) * Math.sin(((t - typeof_) * (2 * Math.PI)) / 0.4));
    },
    elasticOut: function (t) {
      var typeof_,
        n = 0.1;
      return 0 === t
        ? 0
        : 1 === t
          ? 1
          : (!n || n < 1 ? ((n = 1), (e = 0.1)) : (e = (0.4 * Math.asin(1 / n)) / (2 * Math.PI)),
            n * Math.pow(2, -10 * t) * Math.sin(((t - typeof_) * (2 * Math.PI)) / 0.4) + 1);
    },
    elasticInOut: function (t) {
      var typeof_,
        n = 0.1;
      return 0 === t
        ? 0
        : 1 === t
          ? 1
          : (!n || n < 1 ? ((n = 1), (e = 0.1)) : (e = (0.4 * Math.asin(1 / n)) / (2 * Math.PI)),
            (t *= 2) < 1
              ? n *
                Math.pow(2, 10 * (t -= 1)) *
                Math.sin(((t - typeof_) * (2 * Math.PI)) / 0.4) *
                -0.5
              : n *
                  Math.pow(2, -10 * (t -= 1)) *
                  Math.sin(((t - typeof_) * (2 * Math.PI)) / 0.4) *
                  0.5 +
                1);
    },
    backIn: function (t) {
      var typeof_ = 1.70158;
      return t * t * ((typeof_ + 1) * t - typeof_);
    },
    backOut: function (t) {
      var typeof_ = 1.70158;
      return --t * t * ((typeof_ + 1) * t + typeof_) + 1;
    },
    backInOut: function (t) {
      var typeof_ = 2.5949095;
      return (t *= 2) < 1
        ? t * t * ((typeof_ + 1) * t - typeof_) * 0.5
        : 0.5 * ((t -= 2) * t * ((typeof_ + 1) * t + typeof_) + 2);
    },
    bounceIn: function (t) {
      return 1 - Ad.bounceOut(1 - t);
    },
    bounceOut: function (t) {
      return t < 1 / 2.75
        ? 7.5625 * t * t
        : t < 2 / 2.75
          ? 7.5625 * (t -= 1.5 / 2.75) * t + 0.75
          : t < 2.5 / 2.75
            ? 7.5625 * (t -= 2.25 / 2.75) * t + 0.9375
            : 7.5625 * (t -= 2.625 / 2.75) * t + 0.984375;
    },
    bounceInOut: function (t) {
      return t < 0.5 ? 0.5 * Ad.bounceIn(2 * t) : 0.5 * Ad.bounceOut(2 * t - 1) + 0.5;
    },
  };
  bt.prototype = {
    constructor: bt,
    step: function (t, e) {
      if (
        (this._initialized || ((this._startTime = t + this._delay), (this._initialized = !0)),
        this._paused)
      )
        this._pausedTime += e;
      else {
        var n = (t - this._startTime - this._pausedTime) / this._life;
        if (!(n < 0)) {
          n = Math.min(n, 1);
          var i = this.easing,
            r = "string" == typeof i ? Ad[i] : i,
            o = "function" == typeof r ? r(n) : n;
          return (
            this.fire("frame", o),
            1 === n
              ? this.loop
                ? (this.restart(t), "restart")
                : ((this._needsRemove = !0), "destroy")
              : null
          );
        }
      }
    },
    restart: function (t) {
      var typeof_ = (t - this._startTime - this._pausedTime) % this._life;
      ((this._startTime = t - typeof_ + this.gap),
        (this._pausedTime = 0),
        (this._needsRemove = !1));
    },
    fire: function (t, e) {
      this[(t = "on" + t)] && this[t](this._target, e);
    },
    pause: function () {
      this._paused = !0;
    },
    resume: function () {
      this._paused = !1;
    },
  };
  var Cd = function () {
      ((this.head = null), (this.tail = null), (this._len = 0));
    },
    Dd = Cd.prototype;
  ((Dd.insert = function (t) {
    var typeof_ = new kd(t);
    return (this.insertEntry(typeof_), typeof_);
  }),
    (Dd.insertEntry = function (t) {
      (this.head
        ? ((this.tail.next = t), (t.prev = this.tail), (t.next = null), (this.tail = t))
        : (this.head = this.tail = t),
        this._len++);
    }),
    (Dd.remove = function (t) {
      var typeof_ = t.prev,
        n = t.next;
      (typeof_ ? (typeof_.next = n) : (this.head = n),
        n ? (n.prev = typeof_) : (this.tail = typeof_),
        (t.next = t.prev = null),
        this._len--);
    }),
    (Dd.len = function () {
      return this._len;
    }),
    (Dd.clear = function () {
      ((this.head = this.tail = null), (this._len = 0));
    }));
  var kd = function (t) {
      ((this.value = t), this.next, this.prev);
    },
    Pd = function (t) {
      ((this._list = new Cd()),
        (this._map = {}),
        (this._maxSize = t || 10),
        (this._lastRemovedEntry = null));
    },
    Ld = Pd.prototype;
  ((Ld.put = function (t, e) {
    var n = this._list,
      i = this._map,
      r = null;
    if (null == i[t]) {
      var o = n.len(),
        a = this._lastRemovedEntry;
      if (o >= this._maxSize && o > 0) {
        var s = n.head;
        (n.remove(s), delete i[s.key], (r = s.value), (this._lastRemovedEntry = s));
      }
      (a ? (a.value = e) : (a = new kd(e)), (a.key = t), n.insertEntry(a), (i[t] = a));
    }
    return r;
  }),
    (Ld.get = function (t) {
      var typeof_ = this._map[t],
        n = this._list;
      if (null != typeof_)
        return (typeof_ !== n.tail && (n.remove(typeof_), n.insertEntry(typeof_)), typeof_.value);
    }),
    (Ld.clear = function () {
      (this._list.clear(), (this._map = {}));
    }));
  var Od = {
      transparent: [0, 0, 0, 0],
      aliceblue: [240, 248, 255, 1],
      antiquewhite: [250, 235, 215, 1],
      aqua: [0, 255, 255, 1],
      aquamarine: [127, 255, 212, 1],
      azure: [240, 255, 255, 1],
      beige: [245, 245, 220, 1],
      bisque: [255, 228, 196, 1],
      black: [0, 0, 0, 1],
      blanchedalmond: [255, 235, 205, 1],
      blue: [0, 0, 255, 1],
      blueviolet: [138, 43, 226, 1],
      brown: [165, 42, 42, 1],
      burlywood: [222, 184, 135, 1],
      cadetblue: [95, 158, 160, 1],
      chartreuse: [127, 255, 0, 1],
      chocolate: [210, 105, 30, 1],
      coral: [255, 127, 80, 1],
      cornflowerblue: [100, 149, 237, 1],
      cornsilk: [255, 248, 220, 1],
      crimson: [220, 20, 60, 1],
      cyan: [0, 255, 255, 1],
      darkblue: [0, 0, 139, 1],
      darkcyan: [0, 139, 139, 1],
      darkgoldenrod: [184, 134, 11, 1],
      darkgray: [169, 169, 169, 1],
      darkgreen: [0, 100, 0, 1],
      darkgrey: [169, 169, 169, 1],
      darkkhaki: [189, 183, 107, 1],
      darkmagenta: [139, 0, 139, 1],
      darkolivegreen: [85, 107, 47, 1],
      darkorange: [255, 140, 0, 1],
      darkorchid: [153, 50, 204, 1],
      darkred: [139, 0, 0, 1],
      darksalmon: [233, 150, 122, 1],
      darkseagreen: [143, 188, 143, 1],
      darkslateblue: [72, 61, 139, 1],
      darkslategray: [47, 79, 79, 1],
      darkslategrey: [47, 79, 79, 1],
      darkturquoise: [0, 206, 209, 1],
      darkviolet: [148, 0, 211, 1],
      deeppink: [255, 20, 147, 1],
      deepskyblue: [0, 191, 255, 1],
      dimgray: [105, 105, 105, 1],
      dimgrey: [105, 105, 105, 1],
      dodgerblue: [30, 144, 255, 1],
      firebrick: [178, 34, 34, 1],
      floralwhite: [255, 250, 240, 1],
      forestgreen: [34, 139, 34, 1],
      fuchsia: [255, 0, 255, 1],
      gainsboro: [220, 220, 220, 1],
      ghostwhite: [248, 248, 255, 1],
      gold: [255, 215, 0, 1],
      goldenrod: [218, 165, 32, 1],
      gray: [128, 128, 128, 1],
      green: [0, 128, 0, 1],
      greenyellow: [173, 255, 47, 1],
      grey: [128, 128, 128, 1],
      honeydew: [240, 255, 240, 1],
      hotpink: [255, 105, 180, 1],
      indianred: [205, 92, 92, 1],
      indigo: [75, 0, 130, 1],
      ivory: [255, 255, 240, 1],
      khaki: [240, 230, 140, 1],
      lavender: [230, 230, 250, 1],
      lavenderblush: [255, 240, 245, 1],
      lawngreen: [124, 252, 0, 1],
      lemonchiffon: [255, 250, 205, 1],
      lightblue: [173, 216, 230, 1],
      lightcoral: [240, 128, 128, 1],
      lightcyan: [224, 255, 255, 1],
      lightgoldenrodyellow: [250, 250, 210, 1],
      lightgray: [211, 211, 211, 1],
      lightgreen: [144, 238, 144, 1],
      lightgrey: [211, 211, 211, 1],
      lightpink: [255, 182, 193, 1],
      lightsalmon: [255, 160, 122, 1],
      lightseagreen: [32, 178, 170, 1],
      lightskyblue: [135, 206, 250, 1],
      lightslategray: [119, 136, 153, 1],
      lightslategrey: [119, 136, 153, 1],
      lightsteelblue: [176, 196, 222, 1],
      lightyellow: [255, 255, 224, 1],
      lime: [0, 255, 0, 1],
      limegreen: [50, 205, 50, 1],
      linen: [250, 240, 230, 1],
      magenta: [255, 0, 255, 1],
      maroon: [128, 0, 0, 1],
      mediumaquamarine: [102, 205, 170, 1],
      mediumblue: [0, 0, 205, 1],
      mediumorchid: [186, 85, 211, 1],
      mediumpurple: [147, 112, 219, 1],
      mediumseagreen: [60, 179, 113, 1],
      mediumslateblue: [123, 104, 238, 1],
      mediumspringgreen: [0, 250, 154, 1],
      mediumturquoise: [72, 209, 204, 1],
      mediumvioletred: [199, 21, 133, 1],
      midnightblue: [25, 25, 112, 1],
      mintcream: [245, 255, 250, 1],
      mistyrose: [255, 228, 225, 1],
      moccasin: [255, 228, 181, 1],
      navajowhite: [255, 222, 173, 1],
      navy: [0, 0, 128, 1],
      oldlace: [253, 245, 230, 1],
      olive: [128, 128, 0, 1],
      olivedrab: [107, 142, 35, 1],
      orange: [255, 165, 0, 1],
      orangered: [255, 69, 0, 1],
      orchid: [218, 112, 214, 1],
      palegoldenrod: [238, 232, 170, 1],
      palegreen: [152, 251, 152, 1],
      paleturquoise: [175, 238, 238, 1],
      palevioletred: [219, 112, 147, 1],
      papayawhip: [255, 239, 213, 1],
      peachpuff: [255, 218, 185, 1],
      peru: [205, 133, 63, 1],
      pink: [255, 192, 203, 1],
      plum: [221, 160, 221, 1],
      powderblue: [176, 224, 230, 1],
      purple: [128, 0, 128, 1],
      red: [255, 0, 0, 1],
      rosybrown: [188, 143, 143, 1],
      royalblue: [65, 105, 225, 1],
      saddlebrown: [139, 69, 19, 1],
      salmon: [250, 128, 114, 1],
      sandybrown: [244, 164, 96, 1],
      seagreen: [46, 139, 87, 1],
      seashell: [255, 245, 238, 1],
      sienna: [160, 82, 45, 1],
      silver: [192, 192, 192, 1],
      skyblue: [135, 206, 235, 1],
      slateblue: [106, 90, 205, 1],
      slategray: [112, 128, 144, 1],
      slategrey: [112, 128, 144, 1],
      snow: [255, 250, 250, 1],
      springgreen: [0, 255, 127, 1],
      steelblue: [70, 130, 180, 1],
      tan: [210, 180, 140, 1],
      teal: [0, 128, 128, 1],
      thistle: [216, 191, 216, 1],
      tomato: [255, 99, 71, 1],
      turquoise: [64, 224, 208, 1],
      violet: [238, 130, 238, 1],
      wheat: [245, 222, 179, 1],
      white: [255, 255, 255, 1],
      whitesmoke: [245, 245, 245, 1],
      yellow: [255, 255, 0, 1],
      yellowgreen: [154, 205, 50, 1],
    },
    zd = new Pd(20),
    Ed = null,
    Nd = Nt,
    Rd = Rt,
    Bd = (Object.freeze || Object)({
      parse: Lt,
      lift: zt,
      toHex: Et,
      fastLerp: Nt,
      fastMapToColor: Nd,
      lerp: Rt,
      mapToColor: Rd,
      modifyHSL: function (t, e, n, i) {
        if ((t = Lt(t)))
          return (
            (t = (function (t) {
              if (t) {
                var typeof_,
                  n,
                  i = t[0] / 255,
                  r = t[1] / 255,
                  o = t[2] / 255,
                  a = Math.min(i, r, o),
                  s = Math.max(i, r, o),
                  l = s - a,
                  h = (s + a) / 2;
                if (0 === l) ((e = 0), (n = 0));
                else {
                  n = h < 0.5 ? l / (s + a) : l / (2 - s - a);
                  var u = ((s - i) / 6 + l / 2) / l,
                    c = ((s - r) / 6 + l / 2) / l,
                    d = ((s - o) / 6 + l / 2) / l;
                  (i === s
                    ? (e = d - c)
                    : r === s
                      ? (e = 1 / 3 + u - d)
                      : o === s && (e = 2 / 3 + c - u),
                    typeof_ < 0 && (e += 1),
                    typeof_ > 1 && (e -= 1));
                }
                var f = [360 * typeof_, n, h];
                return (null != t[3] && f.push(t[3]), f);
              }
            })(t)),
            null != e &&
              (t[0] = (function (t) {
                return (t = Math.round(t)) < 0 ? 0 : t > 360 ? 360 : t;
              })(e)),
            null != n && (t[1] = Tt(n)),
            null != i && (t[2] = Tt(i)),
            Ft(Ot(t), "rgba")
          );
      },
      modifyAlpha: Bt,
      stringify: Ft,
    }),
    Fd = Array.prototype.slice,
    Vd = function (t, e, n, i) {
      ((this._tracks = {}),
        (this._target = t),
        (this._loop = e || !1),
        (this._getter = n || Vt),
        (this._setter = i || Ht),
        (this._clipCount = 0),
        (this._delay = 0),
        (this._doneList = []),
        (this._onframeList = []),
        (this._clipList = []));
    };
  Vd.prototype = {
    when: function (t, e) {
      var n = this._tracks;
      for (var i in e)
        if (e.hasOwnProperty(i)) {
          if (!n[i]) {
            n[i] = [];
            var r = this._getter(this._target, i);
            if (null == r) continue;
            0 !== t &&
              n[i].push({
                time: 0,
                value: qt(r),
              });
          }
          n[i].push({
            time: t,
            value: e[i],
          });
        }
      return this;
    },
    during: function (t) {
      return (this._onframeList.push(t), this);
    },
    pause: function () {
      for (var t = 0; t < this._clipList.length; t++) this._clipList[t].pause();
      this._paused = !0;
    },
    resume: function () {
      for (var t = 0; t < this._clipList.length; t++) this._clipList[t].resume();
      this._paused = !1;
    },
    isPaused: function () {
      return !!this._paused;
    },
    _doneCallback: function () {
      ((this._tracks = {}), (this._clipList.length = 0));
      for (var t = this._doneList, typeof_ = t.length, n = 0; n < typeof_; n++) t[n].call(this);
    },
    start: function (t, e) {
      var n,
        i = this,
        r = 0;
      for (var o in this._tracks)
        if (this._tracks.hasOwnProperty(o)) {
          var a = Kt(
            this,
            t,
            function () {
              --r || i._doneCallback();
            },
            this._tracks[o],
            o,
            e,
          );
          a && (this._clipList.push(a), r++, this.animation && this.animation.addClip(a), (n = a));
        }
      if (n) {
        var s = n.onframe;
        n.onframe = function (t, e) {
          s(t, e);
          for (var n = 0; n < i._onframeList.length; n++) i._onframeList[n](t, e);
        };
      }
      return (r || this._doneCallback(), this);
    },
    stop: function (t) {
      for (var typeof_ = this._clipList, n = this.animation, i = 0; i < typeof_.length; i++) {
        var r = typeof_[i];
        (t && r.onframe(this._target, 1), n && n.removeClip(r));
      }
      typeof_.length = 0;
    },
    delay: function (t) {
      return ((this._delay = t), this);
    },
    done: function (t) {
      return (t && this._doneList.push(t), this);
    },
    getClips: function () {
      return this._clipList;
    },
  };
  var Hd = 1;
  "undefined" != typeof window && (Hd = Math.max(window.devicePixelRatio || 1, 1));
  var Wd = Hd,
    Gd = function () {},
    Zd = function () {
      this.animators = [];
    };
  Zd.prototype = {
    constructor: Zd,
    animate: function (t, e) {
      var n,
        i = !1,
        r = this,
        o = this.__zr;
      if (t) {
        var a = t.split("."),
          s = r;
        i = "shape" === a[0];
        for (var l = 0, u = a.length; l < u; l++) s && (s = s[a[l]]);
        s && (n = s);
      } else n = r;
      if (n) {
        var c = r.animators,
          d = new Vd(n, e);
        return (
          d
            .during(function (t) {
              r.dirty(i);
            })
            .done(function () {
              c.splice(h(c, d), 1);
            }),
          c.push(d),
          o && o.animation.addAnimator(d),
          d
        );
      }
      Gd('Property "' + t + '" is not existed in element ' + r.id);
    },
    stopAnimation: function (t) {
      for (var typeof_ = this.animators, n = typeof_.length, i = 0; i < n; i++) typeof_[i].stop(t);
      return ((typeof_.length = 0), this);
    },
    animateTo: function (t, e, n, i, r, o) {
      Qt(this, t, e, n, i, r, o);
    },
    animateFrom: function (t, e, n, i, r, o) {
      Qt(this, t, e, n, i, r, o, !0);
    },
  };
  var Ud = function (t) {
    (bd.call(this, t), hd.call(this, t), Zd.call(this, t), (this.id = t.id || Vc()));
  };
  ((Ud.prototype = {
    type: "element",
    name: "",
    __zr: null,
    ignore: !1,
    clipPath: null,
    isGroup: !1,
    drift: function (t, e) {
      switch (this.draggable) {
        case "horizontal":
          e = 0;
          break;
        case "vertical":
          t = 0;
      }
      var n = this.transform;
      (n || (n = this.transform = [1, 0, 0, 1, 0, 0]),
        (n[4] += t),
        (n[5] += e),
        this.decomposeTransform(),
        this.dirty(!1));
    },
    beforeUpdate: function () {},
    afterUpdate: function () {},
    update: function () {
      this.updateTransform();
    },
    traverse: function (t, e) {},
    attrKV: function (t, e) {
      if ("position" === t || "scale" === t || "origin" === t) {
        if (e) {
          var n = this[t];
          (n || (n = this[t] = []), (n[0] = e[0]), (n[1] = e[1]));
        }
      } else this[t] = e;
    },
    hide: function () {
      ((this.ignore = !0), this.__zr && this.__zr.refresh());
    },
    show: function () {
      ((this.ignore = !1), this.__zr && this.__zr.refresh());
    },
    attr: function (t, e) {
      if ("string" == typeof t) this.attrKV(t, e);
      else if (b(t)) for (var n in t) t.hasOwnProperty(n) && this.attrKV(n, t[n]);
      return (this.dirty(!1), this);
    },
    setClipPath: function (t) {
      var typeof_ = this.__zr;
      (typeof_ && t.addSelfToZr(typeof_),
        this.clipPath && this.clipPath !== t && this.removeClipPath(),
        (this.clipPath = t),
        (t.__zr = typeof_),
        (t.__clipTarget = this),
        this.dirty(!1));
    },
    removeClipPath: function () {
      var t = this.clipPath;
      t &&
        (t.__zr && t.removeSelfFromZr(t.__zr),
        (t.__zr = null),
        (t.__clipTarget = null),
        (this.clipPath = null),
        this.dirty(!1));
    },
    addSelfToZr: function (t) {
      this.__zr = t;
      var typeof_ = this.animators;
      if (typeof_) for (var n = 0; n < typeof_.length; n++) t.animation.addAnimator(typeof_[n]);
      this.clipPath && this.clipPath.addSelfToZr(t);
    },
    removeSelfFromZr: function (t) {
      this.__zr = null;
      var typeof_ = this.animators;
      if (typeof_) for (var n = 0; n < typeof_.length; n++) t.animation.removeAnimator(typeof_[n]);
      this.clipPath && this.clipPath.removeSelfFromZr(t);
    },
  }),
    c(Ud, Zd),
    c(Ud, bd),
    c(Ud, hd));
  var Xd = K,
    Yd = Math.min,
    jd = Math.max;
  ((ee.prototype = {
    constructor: ee,
    union: function (t) {
      var typeof_ = Yd(t.x, this.x),
        n = Yd(t.y, this.y);
      ((this.width = jd(t.x + t.width, this.x + this.width) - typeof_),
        (this.height = jd(t.y + t.height, this.y + this.height) - n),
        (this.x = typeof_),
        (this.y = n));
    },
    applyTransform: (function () {
      var t = [],
        typeof_ = [],
        n = [],
        i = [];
      return function (r) {
        if (r) {
          ((t[0] = n[0] = this.x),
            (t[1] = i[1] = this.y),
            (typeof_[0] = i[0] = this.x + this.width),
            (typeof_[1] = n[1] = this.y + this.height),
            Xd(t, t, r),
            Xd(typeof_, typeof_, r),
            Xd(n, n, r),
            Xd(i, i, r),
            (this.x = Yd(t[0], typeof_[0], n[0], i[0])),
            (this.y = Yd(t[1], typeof_[1], n[1], i[1])));
          var o = jd(t[0], typeof_[0], n[0], i[0]),
            a = jd(t[1], typeof_[1], n[1], i[1]);
          ((this.width = o - this.x), (this.height = a - this.y));
        }
      };
    })(),
    calculateTransform: function (t) {
      var typeof_ = this,
        n = t.width / typeof_.width,
        i = t.height / typeof_.height,
        r = ft();
      return (vt(r, r, [-typeof_.x, -typeof_.y]), xt(r, r, [n, i]), vt(r, r, [t.x, t.y]), r);
    },
    intersect: function (t) {
      if (!t) return !1;
      t instanceof ee || (t = ee.create(t));
      var typeof_ = this,
        n = typeof_.x,
        i = typeof_.x + typeof_.width,
        r = typeof_.y,
        o = typeof_.y + typeof_.height,
        a = t.x,
        s = t.x + t.width,
        l = t.y,
        h = t.y + t.height;
      return !(i < a || s < n || o < l || h < r);
    },
    contain: function (t, e) {
      var n = this;
      return t >= n.x && t <= n.x + n.width && e >= n.y && e <= n.y + n.height;
    },
    clone: function () {
      return new ee(this.x, this.y, this.width, this.height);
    },
    copy: function (t) {
      ((this.x = t.x), (this.y = t.y), (this.width = t.width), (this.height = t.height));
    },
    plain: function () {
      return {
        x: this.x,
        y: this.y,
        width: this.width,
        height: this.height,
      };
    },
  }),
    (ee.create = function (t) {
      return new ee(t.x, t.y, t.width, t.height);
    }));
  var qd = function (t) {
    for (var typeof_ in ((t = t || {}), Ud.call(this, t), t))
      t.hasOwnProperty(typeof_) && (this[typeof_] = t[typeof_]);
    ((this._children = []), (this.__storage = null), (this.__dirty = !0));
  };
  ((qd.prototype = {
    constructor: qd,
    isGroup: !0,
    type: "group",
    silent: !1,
    children: function () {
      return this._children.slice();
    },
    childAt: function (t) {
      return this._children[t];
    },
    childOfName: function (t) {
      for (var typeof_ = this._children, n = 0; n < typeof_.length; n++)
        if (typeof_[n].name === t) return typeof_[n];
    },
    childCount: function () {
      return this._children.length;
    },
    add: function (t) {
      return (
        t && t !== this && t.parent !== this && (this._children.push(t), this._doAdd(t)),
        this
      );
    },
    addBefore: function (t, e) {
      if (t && t !== this && t.parent !== this && e && e.parent === this) {
        var n = this._children,
          i = n.indexOf(e);
        i >= 0 && (n.splice(i, 0, t), this._doAdd(t));
      }
      return this;
    },
    _doAdd: function (t) {
      (t.parent && t.parent.remove(t), (t.parent = this));
      var typeof_ = this.__storage,
        n = this.__zr;
      (typeof_ &&
        typeof_ !== t.__storage &&
        (typeof_.addToStorage(t), t instanceof qd && t.addChildrenToStorage(typeof_)),
        n && n.refresh());
    },
    remove: function (t) {
      var typeof_ = this.__zr,
        n = this.__storage,
        i = this._children,
        r = h(i, t);
      return (
        r < 0 ||
          (i.splice(r, 1),
          (t.parent = null),
          n && (n.delFromStorage(t), t instanceof qd && t.delChildrenFromStorage(n)),
          typeof_ && typeof_.refresh()),
        this
      );
    },
    removeAll: function () {
      var t,
        typeof_,
        n = this._children,
        i = this.__storage;
      for (e = 0; typeof_ < n.length; typeof_++)
        ((t = n[typeof_]),
          i && (i.delFromStorage(t), t instanceof qd && t.delChildrenFromStorage(i)),
          (t.parent = null));
      return ((n.length = 0), this);
    },
    eachChild: function (t, e) {
      for (var n = this._children, i = 0; i < n.length; i++) {
        var r = n[i];
        t.call(e, r, i);
      }
      return this;
    },
    traverse: function (t, e) {
      for (var n = 0; n < this._children.length; n++) {
        var i = this._children[n];
        (t.call(e, i), "group" === i.type && i.traverse(t, e));
      }
      return this;
    },
    addChildrenToStorage: function (t) {
      for (var typeof_ = 0; typeof_ < this._children.length; typeof_++) {
        var n = this._children[typeof_];
        (t.addToStorage(n), n instanceof qd && n.addChildrenToStorage(t));
      }
    },
    delChildrenFromStorage: function (t) {
      for (var typeof_ = 0; typeof_ < this._children.length; typeof_++) {
        var n = this._children[typeof_];
        (t.delFromStorage(n), n instanceof qd && n.delChildrenFromStorage(t));
      }
    },
    dirty: function () {
      return ((this.__dirty = !0), this.__zr && this.__zr.refresh(), this);
    },
    getBoundingRect: function (t) {
      for (
        var typeof_ = null, n = new ee(0, 0, 0, 0), i = t || this._children, r = [], o = 0;
        o < i.length;
        o++
      ) {
        var a = i[o];
        if (!a.ignore && !a.invisible) {
          var s = a.getBoundingRect(),
            l = a.getLocalTransform(r);
          l
            ? (n.copy(s), n.applyTransform(l), (e = typeof_ || n.clone()).union(n))
            : (e = typeof_ || s.clone()).union(s);
        }
      }
      return typeof_ || n;
    },
  }),
    u(qd, Ud));
  var $d = 32,
    Kd = 7,
    Qd = function () {
      ((this._roots = []), (this._displayList = []), (this._displayListLen = 0));
    };
  Qd.prototype = {
    constructor: Qd,
    traverse: function (t, e) {
      for (var n = 0; n < this._roots.length; n++) this._roots[n].traverse(t, e);
    },
    getDisplayList: function (t, e) {
      return ((e = e || !1), t && this.updateDisplayList(e), this._displayList);
    },
    updateDisplayList: function (t) {
      this._displayListLen = 0;
      for (var typeof_ = this._roots, n = this._displayList, i = 0, r = typeof_.length; i < r; i++)
        this._updateAndAddDisplayable(typeof_[i], null, t);
      ((n.length = this._displayListLen), Hc.canvasSupported && se(n, le));
    },
    _updateAndAddDisplayable: function (t, e, n) {
      if (!t.ignore || n) {
        (t.beforeUpdate(), t.__dirty && t.update(), t.afterUpdate());
        var i = t.clipPath;
        if (i) {
          e = e ? e.slice() : [];
          for (var r = i, o = t; r;)
            ((r.parent = o), r.updateTransform(), e.push(r), (o = r), (r = r.clipPath));
        }
        if (t.isGroup) {
          for (var a = t._children, s = 0; s < a.length; s++) {
            var l = a[s];
            (t.__dirty && (l.__dirty = !0), this._updateAndAddDisplayable(l, e, n));
          }
          t.__dirty = !1;
        } else ((t.__clipPaths = e), (this._displayList[this._displayListLen++] = t));
      }
    },
    addRoot: function (t) {
      t.__storage !== this &&
        (t instanceof qd && t.addChildrenToStorage(this),
        this.addToStorage(t),
        this._roots.push(t));
    },
    delRoot: function (t) {
      if (null == t) {
        for (n = 0; n < this._roots.length; n++) {
          var typeof_ = this._roots[n];
          typeof_ instanceof qd && typeof_.delChildrenFromStorage(this);
        }
        return ((this._roots = []), (this._displayList = []), void (this._displayListLen = 0));
      }
      if (t instanceof Array) for (var n = 0, i = t.length; n < i; n++) this.delRoot(t[n]);
      else {
        var r = h(this._roots, t);
        r >= 0 &&
          (this.delFromStorage(t),
          this._roots.splice(r, 1),
          t instanceof qd && t.delChildrenFromStorage(this));
      }
    },
    addToStorage: function (t) {
      return (t && ((t.__storage = this), t.dirty(!1)), this);
    },
    delFromStorage: function (t) {
      return (t && (t.__storage = null), this);
    },
    dispose: function () {
      this._renderList = this._roots = null;
    },
    displayableSortFunc: le,
  };
  var Jd = {
      shadowBlur: 1,
      shadowOffsetX: 1,
      shadowOffsetY: 1,
      textShadowBlur: 1,
      textShadowOffsetX: 1,
      textShadowOffsetY: 1,
      textBoxShadowBlur: 1,
      textBoxShadowOffsetX: 1,
      textBoxShadowOffsetY: 1,
    },
    tf = function (t, e, n) {
      return Jd.hasOwnProperty(e) ? (n *= t.dpr) : n;
    },
    ef = {
      NONE: 0,
      STYLE_BIND: 1,
      PLAIN_TEXT: 2,
    },
    nf = 9,
    rf = [
      ["shadowBlur", 0],
      ["shadowOffsetX", 0],
      ["shadowOffsetY", 0],
      ["shadowColor", "#000"],
      ["lineCap", "butt"],
      ["lineJoin", "miter"],
      ["miterLimit", 10],
    ],
    of = function (t) {
      this.extendFrom(t, !1);
    };
  of.prototype = {
    constructor: of,
    fill: "#000",
    stroke: null,
    opacity: 1,
    fillOpacity: null,
    strokeOpacity: null,
    lineDash: null,
    lineDashOffset: 0,
    shadowBlur: 0,
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    lineWidth: 1,
    strokeNoScale: !1,
    text: null,
    font: null,
    textFont: null,
    fontStyle: null,
    fontWeight: null,
    fontSize: null,
    fontFamily: null,
    textTag: null,
    textFill: "#000",
    textStroke: null,
    textWidth: null,
    textHeight: null,
    textStrokeWidth: 0,
    textLineHeight: null,
    textPosition: "inside",
    textRect: null,
    textOffset: null,
    textAlign: null,
    textVerticalAlign: null,
    textDistance: 5,
    textShadowColor: "transparent",
    textShadowBlur: 0,
    textShadowOffsetX: 0,
    textShadowOffsetY: 0,
    textBoxShadowColor: "transparent",
    textBoxShadowBlur: 0,
    textBoxShadowOffsetX: 0,
    textBoxShadowOffsetY: 0,
    transformText: !1,
    textRotation: 0,
    textOrigin: null,
    textBackgroundColor: null,
    textBorderColor: null,
    textBorderWidth: 0,
    textBorderRadius: 0,
    textPadding: null,
    rich: null,
    truncate: null,
    blend: null,
    bind: function (t, e, n) {
      var i = this,
        r = n && n.style,
        o = !r || t.__attrCachedBy !== ef.STYLE_BIND;
      t.__attrCachedBy = ef.STYLE_BIND;
      for (var a = 0; a < rf.length; a++) {
        var s = rf[a],
          l = s[0];
        (o || i[l] !== r[l]) && (t[l] = tf(t, l, i[l] || s[1]));
      }
      if (
        ((o || i.fill !== r.fill) && (t.fillStyle = i.fill),
        (o || i.stroke !== r.stroke) && (t.strokeStyle = i.stroke),
        (o || i.opacity !== r.opacity) && (t.globalAlpha = null == i.opacity ? 1 : i.opacity),
        (o || i.blend !== r.blend) && (t.globalCompositeOperation = i.blend || "source-over"),
        this.hasStroke())
      ) {
        var h = i.lineWidth;
        t.lineWidth = h / (this.strokeNoScale && e && e.getLineScale ? e.getLineScale() : 1);
      }
    },
    hasFill: function () {
      var t = this.fill;
      return null != t && "none" !== t;
    },
    hasStroke: function () {
      var t = this.stroke;
      return null != t && "none" !== t && this.lineWidth > 0;
    },
    extendFrom: function (t, e) {
      if (t)
        for (var n in t)
          !t.hasOwnProperty(n) ||
            (!0 !== e && (!1 === e ? this.hasOwnProperty(n) : null == t[n])) ||
            (this[n] = t[n]);
    },
    set: function (t, e) {
      "string" == typeof t ? (this[t] = e) : this.extendFrom(t, !0);
    },
    clone: function () {
      var t = new this.constructor();
      return (t.extendFrom(this, !0), t);
    },
    getGradient: function (t, e, n) {
      for (
        var i = ("radial" === e.type ? ue : he)(t, e, n), r = e.colorStops, o = 0;
        o < r.length;
        o++
      )
        i.addColorStop(r[o].offset, r[o].color);
      return i;
    },
  };
  for (var af = of.prototype, sf = 0; sf < rf.length; sf++) {
    var lf = rf[sf];
    lf[0] in af || (af[lf[0]] = lf[1]);
  }
  of.getGradient = af.getGradient;
  var hf = function (t, e) {
    ((this.image = t), (this.repeat = e), (this.type = "pattern"));
  };
  hf.prototype.getCanvasPattern = function (t) {
    return t.createPattern(this.image, this.repeat || "repeat");
  };
  var uf = function (t, e, n) {
    var i;
    ((n = n || Wd),
      "string" == typeof t ? (i = de(t, e, n)) : b(t) && (t = (i = t).id),
      (this.id = t),
      (this.dom = i));
    var r = i.style;
    (r &&
      ((i.onselectstart = ce),
      (r["-webkit-user-select"] = "none"),
      (r["user-select"] = "none"),
      (r["-webkit-touch-callout"] = "none"),
      (r["-webkit-tap-highlight-color"] = "rgba(0,0,0,0)"),
      (r.padding = 0),
      (r.margin = 0),
      (r["border-width"] = 0)),
      (this.domBack = null),
      (this.ctxBack = null),
      (this.painter = e),
      (this.config = null),
      (this.clearColor = 0),
      (this.motionBlur = !1),
      (this.lastFrameAlpha = 0.7),
      (this.dpr = n));
  };
  uf.prototype = {
    constructor: uf,
    __dirty: !0,
    __used: !1,
    __drawIndex: 0,
    __startIndex: 0,
    __endIndex: 0,
    incremental: !1,
    getElementCount: function () {
      return this.__endIndex - this.__startIndex;
    },
    initContext: function () {
      ((this.ctx = this.dom.getContext("2d")), (this.ctx.dpr = this.dpr));
    },
    createBackBuffer: function () {
      var t = this.dpr;
      ((this.domBack = de("back-" + this.id, this.painter, t)),
        (this.ctxBack = this.domBack.getContext("2d")),
        1 !== t && this.ctxBack.scale(t, t));
    },
    resize: function (t, e) {
      var n = this.dpr,
        i = this.dom,
        r = i.style,
        o = this.domBack;
      (r && ((r.width = t + "px"), (r.height = e + "px")),
        (i.width = t * n),
        (i.height = e * n),
        o && ((o.width = t * n), (o.height = e * n), 1 !== n && this.ctxBack.scale(n, n)));
    },
    clear: function (t, e) {
      var n,
        i = this.dom,
        r = this.ctx,
        o = i.width,
        a = i.height,
        s = ((e = e || this.clearColor), this.motionBlur && !t),
        l = this.lastFrameAlpha,
        h = this.dpr;
      if (
        (s &&
          (this.domBack || this.createBackBuffer(),
          (this.ctxBack.globalCompositeOperation = "copy"),
          this.ctxBack.drawImage(i, 0, 0, o / h, a / h)),
        r.clearRect(0, 0, o, a),
        e &&
          "transparent" !== e &&
          (e.colorStops
            ? ((n =
                e.__canvasGradient ||
                of.getGradient(r, e, {
                  x: 0,
                  y: 0,
                  width: o,
                  height: a,
                })),
              (e.__canvasGradient = n))
            : e.image && (n = hf.prototype.getCanvasPattern.call(e, r)),
          r.save(),
          (r.fillStyle = n || e),
          r.fillRect(0, 0, o, a),
          r.restore()),
        s)
      ) {
        var u = this.domBack;
        (r.save(), (r.globalAlpha = l), r.drawImage(u, 0, 0, o, a), r.restore());
      }
    },
  };
  var cf =
      ("undefined" != typeof window &&
        ((window.requestAnimationFrame && window.requestAnimationFrame.bind(window)) ||
          (window.msRequestAnimationFrame && window.msRequestAnimationFrame.bind(window)) ||
          window.mozRequestAnimationFrame ||
          window.webkitRequestAnimationFrame)) ||
      function (t) {
        setTimeout(t, 16);
      },
    df = new Pd(50),
    ff = {},
    pf = 0,
    gf = 5e3,
    mf = /\{([a-zA-Z0-9_]+)\|([^}]*)\}/g,
    vf = "12px sans-serif",
    yf = {
      measureText: function (t, e) {
        var n = l();
        return ((n.font = e || vf), n.measureText(t));
      },
    },
    xf = vf,
    _f = {
      left: 1,
      right: 1,
      center: 1,
    },
    wf = {
      top: 1,
      bottom: 1,
      middle: 1,
    },
    bf = [
      ["textShadowBlur", "shadowBlur", 0],
      ["textShadowOffsetX", "shadowOffsetX", 0],
      ["textShadowOffsetY", "shadowOffsetY", 0],
      ["textShadowColor", "shadowColor", "transparent"],
    ],
    Sf = new ee(),
    Mf = function () {};
  ((Mf.prototype = {
    constructor: Mf,
    drawRectText: function (t, e) {
      var n = this.style;
      ((e = n.textRect || e), this.__dirty && Oe(n));
      var i = n.text;
      if ((null != i && (i += ""), Ye(i, n))) {
        t.save();
        var r = this.transform;
        (n.transformText ? this.setTransform(t) : r && (Sf.copy(e), Sf.applyTransform(r), (e = Sf)),
          Ee(this, t, i, n, e, nf),
          t.restore());
      }
    },
  }),
    (je.prototype = {
      constructor: je,
      type: "displayable",
      __dirty: !0,
      invisible: !1,
      z: 0,
      z2: 0,
      zlevel: 0,
      draggable: !1,
      dragging: !1,
      silent: !1,
      culling: !1,
      cursor: "pointer",
      rectHover: !1,
      progressive: !1,
      incremental: !1,
      globalScaleRatio: 1,
      beforeBrush: function (t) {},
      afterBrush: function (t) {},
      brush: function (t, e) {},
      getBoundingRect: function () {},
      contain: function (t, e) {
        return this.rectContain(t, e);
      },
      traverse: function (t, e) {
        t.call(e, this);
      },
      rectContain: function (t, e) {
        var n = this.transformCoordToLocal(t, e);
        return this.getBoundingRect().contain(n[0], n[1]);
      },
      dirty: function () {
        ((this.__dirty = this.__dirtyText = !0),
          (this._rect = null),
          this.__zr && this.__zr.refresh());
      },
      animateStyle: function (t) {
        return this.animate("style", t);
      },
      attrKV: function (t, e) {
        "style" !== t ? Ud.prototype.attrKV.call(this, t, e) : this.style.set(e);
      },
      setStyle: function (t, e) {
        return (this.style.set(t, e), this.dirty(!1), this);
      },
      useStyle: function (t) {
        return ((this.style = new of(t, this)), this.dirty(!1), this);
      },
    }),
    u(je, Ud),
    c(je, Mf),
    (qe.prototype = {
      constructor: qe,
      type: "image",
      brush: function (t, e) {
        var n = this.style,
          i = n.image;
        n.bind(t, this, e);
        var r = (this._image = pe(i, this._image, this, this.onload));
        if (r && me(r)) {
          var o = n.x || 0,
            a = n.y || 0,
            s = n.width,
            l = n.height,
            h = r.width / r.height;
          if (
            (null == s && null != l
              ? (s = l * h)
              : null == l && null != s
                ? (l = s / h)
                : null == s && null == l && ((s = r.width), (l = r.height)),
            this.setTransform(t),
            n.sWidth && n.sHeight)
          ) {
            var u = n.sx || 0,
              c = n.sy || 0;
            t.drawImage(r, u, c, n.sWidth, n.sHeight, o, a, s, l);
          } else if (n.sx && n.sy) {
            var d = s - (u = n.sx),
              f = l - (c = n.sy);
            t.drawImage(r, u, c, d, f, o, a, s, l);
          } else t.drawImage(r, o, a, s, l);
          null != n.text &&
            (this.restoreTransform(t), this.drawRectText(t, this.getBoundingRect()));
        }
      },
      getBoundingRect: function () {
        var t = this.style;
        return (
          this._rect || (this._rect = new ee(t.x || 0, t.y || 0, t.width || 0, t.height || 0)),
          this._rect
        );
      },
    }),
    u(qe, je));
  var If = new ee(0, 0, 0, 0),
    Tf = new ee(0, 0, 0, 0),
    Af = function (t, e, n) {
      this.type = "canvas";
      var i = !t.nodeName || "CANVAS" === t.nodeName.toUpperCase();
      ((this._opts = n = a({}, n || {})),
        (this.dpr = n.devicePixelRatio || Wd),
        (this._singleCanvas = i),
        (this.root = t));
      var r = t.style;
      (r &&
        ((r["-webkit-tap-highlight-color"] = "transparent"),
        (r["-webkit-user-select"] = r["user-select"] = r["-webkit-touch-callout"] = "none"),
        (t.innerHTML = "")),
        (this.storage = e));
      var o = (this._zlevelList = []),
        s = (this._layers = {});
      if (((this._layerConfig = {}), (this._needsManuallyCompositing = !1), i)) {
        var l = t.width,
          h = t.height;
        (null != n.width && (l = n.width),
          null != n.height && (h = n.height),
          (this.dpr = n.devicePixelRatio || 1),
          (t.width = l * this.dpr),
          (t.height = h * this.dpr),
          (this._width = l),
          (this._height = h));
        var u = new uf(t, this, this.dpr);
        ((u.__builtin__ = !0),
          u.initContext(),
          (s[314159] = u),
          (u.zlevel = 314159),
          o.push(314159),
          (this._domRoot = t));
      } else {
        ((this._width = this._getSize(0)), (this._height = this._getSize(1)));
        var c = (this._domRoot = (function (t, e) {
          var n = document.createElement("div");
          return (
            (n.style.cssText =
              [
                "position:relative",
                "overflow:hidden",
                "width:" + t + "px",
                "height:" + e + "px",
                "padding:0",
                "margin:0",
                "border-width:0",
              ].join(";") + ";"),
            n
          );
        })(this._width, this._height));
        t.appendChild(c);
      }
      ((this._hoverlayer = null), (this._hoverElements = []));
    };
  Af.prototype = {
    constructor: Af,
    getType: function () {
      return "canvas";
    },
    isSingleCanvas: function () {
      return this._singleCanvas;
    },
    getViewportRoot: function () {
      return this._domRoot;
    },
    getViewportRootOffset: function () {
      var t = this.getViewportRoot();
      if (t)
        return {
          offsetLeft: t.offsetLeft || 0,
          offsetTop: t.offsetTop || 0,
        };
    },
    refresh: function (t) {
      var typeof_ = this.storage.getDisplayList(!0),
        n = this._zlevelList;
      ((this._redrawId = Math.random()), this._paintList(typeof_, t, this._redrawId));
      for (var i = 0; i < n.length; i++) {
        var r = n[i],
          o = this._layers[r];
        if (!o.__builtin__ && o.refresh) {
          var a = 0 === i ? this._backgroundColor : null;
          o.refresh(a);
        }
      }
      return (this.refreshHover(), this);
    },
    addHover: function (t, e) {
      if (!t.__hoverMir) {
        var n = new t.constructor({
          style: t.style,
          shape: t.shape,
          z: t.z,
          z2: t.z2,
          silent: t.silent,
        });
        return (
          (n.__from = t),
          (t.__hoverMir = n),
          e && n.setStyle(e),
          this._hoverElements.push(n),
          n
        );
      }
    },
    removeHover: function (t) {
      var typeof_ = t.__hoverMir,
        n = this._hoverElements,
        i = h(n, typeof_);
      (i >= 0 && n.splice(i, 1), (t.__hoverMir = null));
    },
    clearHover: function (t) {
      for (var typeof_ = this._hoverElements, n = 0; n < typeof_.length; n++) {
        var i = typeof_[n].__from;
        i && (i.__hoverMir = null);
      }
      typeof_.length = 0;
    },
    refreshHover: function () {
      var t = this._hoverElements,
        typeof_ = t.length,
        n = this._hoverlayer;
      if ((n && n.clear(), typeof_)) {
        (se(t, this.storage.displayableSortFunc), n || (n = this._hoverlayer = this.getLayer(1e5)));
        var i = {};
        n.ctx.save();
        for (var r = 0; r < typeof_;) {
          var o = t[r],
            a = o.__from;
          a && a.__zr
            ? (r++,
              a.invisible ||
                ((o.transform = a.transform),
                (o.invTransform = a.invTransform),
                (o.__clipPaths = a.__clipPaths),
                this._doPaintEl(o, n, !0, i)))
            : (t.splice(r, 1), (a.__hoverMir = null), typeof_--);
        }
        n.ctx.restore();
      }
    },
    getHoverLayer: function () {
      return this.getLayer(1e5);
    },
    _paintList: function (t, e, n) {
      if (this._redrawId === n) {
        ((e = e || !1), this._updateLayerStatus(t));
        var i = this._doPaintList(t, e);
        if ((this._needsManuallyCompositing && this._compositeManually(), !i)) {
          var r = this;
          cf(function () {
            r._paintList(t, e, n);
          });
        }
      }
    },
    _compositeManually: function () {
      var t = this.getLayer(314159).ctx,
        typeof_ = this._domRoot.width,
        n = this._domRoot.height;
      (t.clearRect(0, 0, typeof_, n),
        this.eachBuiltinLayer(function (i) {
          i.virtual && t.drawImage(i.dom, 0, 0, typeof_, n);
        }));
    },
    _doPaintList: function (t, e) {
      for (var n = [], i = 0; i < this._zlevelList.length; i++) {
        var r = this._zlevelList[i];
        (s = this._layers[r]).__builtin__ &&
          s !== this._hoverlayer &&
          (s.__dirty || e) &&
          n.push(s);
      }
      for (var o = !0, a = 0; a < n.length; a++) {
        var s = n[a],
          l = s.ctx,
          h = {};
        l.save();
        var u = e ? s.__startIndex : s.__drawIndex,
          c = !e && s.incremental && Date.now,
          d = c && Date.now(),
          p = s.zlevel === this._zlevelList[0] ? this._backgroundColor : null;
        if (s.__startIndex === s.__endIndex) s.clear(!1, p);
        else if (u === s.__startIndex) {
          var g = t[u];
          (g.incremental && g.notClear && !e) || s.clear(!1, p);
        }
        -1 === u &&
          (console.error("For some unknown reason. drawIndex is -1"), (u = s.__startIndex));
        for (var m = u; m < s.__endIndex; m++) {
          var v = t[m];
          if (
            (this._doPaintEl(v, s, e, h),
            (v.__dirty = v.__dirtyText = !1),
            c && Date.now() - d > 15)
          )
            break;
        }
        ((s.__drawIndex = m),
          s.__drawIndex < s.__endIndex && (o = !1),
          h.prevElClipPaths && l.restore(),
          l.restore());
      }
      return (
        Hc.wxa &&
          f(this._layers, function (t) {
            t && t.ctx && t.ctx.draw && t.ctx.draw();
          }),
        o
      );
    },
    _doPaintEl: function (t, e, n, i) {
      var r = e.ctx,
        o = t.transform;
      if (
        (e.__dirty || n) &&
        !t.invisible &&
        0 !== t.style.opacity &&
        (!o || o[0] || o[3]) &&
        (!t.culling ||
          !(function (t, e, n) {
            return (
              If.copy(t.getBoundingRect()),
              t.transform && If.applyTransform(t.transform),
              (Tf.width = e),
              (Tf.height = n),
              !If.intersect(Tf)
            );
          })(t, this._width, this._height))
      ) {
        var a = t.__clipPaths;
        ((i.prevElClipPaths &&
          !(function (t, e) {
            if (t === e) return !1;
            if (!t || !e || t.length !== e.length) return !0;
            for (var n = 0; n < t.length; n++) if (t[n] !== e[n]) return !0;
          })(a, i.prevElClipPaths)) ||
          (i.prevElClipPaths && (e.ctx.restore(), (i.prevElClipPaths = null), (i.prevEl = null)),
          a &&
            (r.save(),
            (function (t, e) {
              for (var n = 0; n < t.length; n++) {
                var i = t[n];
                (i.setTransform(e),
                  e.beginPath(),
                  i.buildPath(e, i.shape),
                  e.clip(),
                  i.restoreTransform(e));
              }
            })(a, r),
            (i.prevElClipPaths = a))),
          t.beforeBrush && t.beforeBrush(r),
          t.brush(r, i.prevEl || null),
          (i.prevEl = t),
          t.afterBrush && t.afterBrush(r));
      }
    },
    getLayer: function (t, e) {
      this._singleCanvas && !this._needsManuallyCompositing && (t = 314159);
      var n = this._layers[t];
      return (
        n ||
          (((n = new uf("zr_" + t, this, this.dpr)).zlevel = t),
          (n.__builtin__ = !0),
          this._layerConfig[t] && r(n, this._layerConfig[t], !0),
          e && (n.virtual = e),
          this.insertLayer(t, n),
          n.initContext()),
        n
      );
    },
    insertLayer: function (t, e) {
      var n = this._layers,
        i = this._zlevelList,
        r = i.length,
        o = null,
        a = -1,
        s = this._domRoot;
      if (n[t]) Gd("ZLevel " + t + " has been used already");
      else if (
        (function (t) {
          return (
            !!t &&
            (!!t.__builtin__ || ("function" == typeof t.resize && "function" == typeof t.refresh))
          );
        })(e)
      ) {
        if (r > 0 && t > i[0]) {
          for (a = 0; a < r - 1 && !(i[a] < t && i[a + 1] > t); a++);
          o = n[i[a]];
        }
        if ((i.splice(a + 1, 0, t), (n[t] = e), !e.virtual))
          if (o) {
            var l = o.dom;
            l.nextSibling ? s.insertBefore(e.dom, l.nextSibling) : s.appendChild(e.dom);
          } else s.firstChild ? s.insertBefore(e.dom, s.firstChild) : s.appendChild(e.dom);
      } else Gd("Layer of zlevel " + t + " is not valid");
    },
    eachLayer: function (t, e) {
      var n,
        i,
        r = this._zlevelList;
      for (i = 0; i < r.length; i++) ((n = r[i]), t.call(e, this._layers[n], n));
    },
    eachBuiltinLayer: function (t, e) {
      var n,
        i,
        r,
        o = this._zlevelList;
      for (r = 0; r < o.length; r++)
        ((i = o[r]), (n = this._layers[i]).__builtin__ && t.call(e, n, i));
    },
    eachOtherLayer: function (t, e) {
      var n,
        i,
        r,
        o = this._zlevelList;
      for (r = 0; r < o.length; r++)
        ((i = o[r]), (n = this._layers[i]).__builtin__ || t.call(e, n, i));
    },
    getLayers: function () {
      return this._layers;
    },
    _updateLayerStatus: function (t) {
      function e(t) {
        n && (n.__endIndex !== t && (n.__dirty = !0), (n.__endIndex = t));
      }
      if (
        (this.eachBuiltinLayer(function (t, e) {
          t.__dirty = t.__used = !1;
        }),
        this._singleCanvas)
      )
        for (r = 1; r < t.length; r++)
          if ((a = t[r]).zlevel !== t[r - 1].zlevel || a.incremental) {
            this._needsManuallyCompositing = !0;
            break;
          }
      for (var n = null, i = 0, r = 0; r < t.length; r++) {
        var o,
          a = t[r],
          s = a.zlevel;
        (a.incremental
          ? (((o = this.getLayer(s + 0.001, this._needsManuallyCompositing)).incremental = !0),
            (i = 1))
          : (o = this.getLayer(s + (i > 0 ? 0.01 : 0), this._needsManuallyCompositing)),
          o.__builtin__ || Gd("ZLevel " + s + " has been used by unkown layer " + o.id),
          o !== n &&
            ((o.__used = !0),
            o.__startIndex !== r && (o.__dirty = !0),
            (o.__startIndex = r),
            o.incremental ? (o.__drawIndex = -1) : (o.__drawIndex = r),
            e(r),
            (n = o)),
          a.__dirty &&
            ((o.__dirty = !0), o.incremental && o.__drawIndex < 0 && (o.__drawIndex = r)));
      }
      (e(r),
        this.eachBuiltinLayer(function (t, e) {
          (!t.__used &&
            t.getElementCount() > 0 &&
            ((t.__dirty = !0), (t.__startIndex = t.__endIndex = t.__drawIndex = 0)),
            t.__dirty && t.__drawIndex < 0 && (t.__drawIndex = t.__startIndex));
        }));
    },
    clear: function () {
      return (this.eachBuiltinLayer(this._clearLayer), this);
    },
    _clearLayer: function (t) {
      t.clear();
    },
    setBackgroundColor: function (t) {
      this._backgroundColor = t;
    },
    configLayer: function (t, e) {
      if (e) {
        var n = this._layerConfig;
        n[t] ? r(n[t], e, !0) : (n[t] = e);
        for (var i = 0; i < this._zlevelList.length; i++) {
          var o = this._zlevelList[i];
          (o !== t && o !== t + 0.01) || r(this._layers[o], n[t], !0);
        }
      }
    },
    delLayer: function (t) {
      var typeof_ = this._layers,
        n = this._zlevelList,
        i = typeof_[t];
      i && (i.dom.parentNode.removeChild(i.dom), delete typeof_[t], n.splice(h(n, t), 1));
    },
    resize: function (t, e) {
      if (this._domRoot.style) {
        var n = this._domRoot;
        n.style.display = "none";
        var i = this._opts;
        if (
          (null != t && (i.width = t),
          null != e && (i.height = e),
          (t = this._getSize(0)),
          (e = this._getSize(1)),
          (n.style.display = ""),
          this._width !== t || e !== this._height)
        ) {
          for (var r in ((n.style.width = t + "px"), (n.style.height = e + "px"), this._layers))
            this._layers.hasOwnProperty(r) && this._layers[r].resize(t, e);
          (f(this._progressiveLayers, function (n) {
            n.resize(t, e);
          }),
            this.refresh(!0));
        }
        ((this._width = t), (this._height = e));
      } else {
        if (null == t || null == e) return;
        ((this._width = t), (this._height = e), this.getLayer(314159).resize(t, e));
      }
      return this;
    },
    clearLayer: function (t) {
      var typeof_ = this._layers[t];
      typeof_ && typeof_.clear();
    },
    dispose: function () {
      ((this.root.innerHTML = ""),
        (this.root = this.storage = this._domRoot = this._layers = null));
    },
    getRenderedCanvas: function (t) {
      if (((t = t || {}), this._singleCanvas && !this._compositeManually))
        return this._layers[314159].dom;
      var typeof_ = new uf("image", this, t.pixelRatio || this.dpr);
      if (
        (typeof_.initContext(),
        typeof_.clear(!1, t.backgroundColor || this._backgroundColor),
        t.pixelRatio <= this.dpr)
      ) {
        this.refresh();
        var n = typeof_.dom.width,
          i = typeof_.dom.height,
          r = typeof_.ctx;
        this.eachLayer(function (t) {
          t.__builtin__
            ? r.drawImage(t.dom, 0, 0, n, i)
            : t.renderToCanvas &&
              (typeof_.ctx.save(), t.renderToCanvas(typeof_.ctx), typeof_.ctx.restore());
        });
      } else
        for (var o = {}, a = this.storage.getDisplayList(!0), s = 0; s < a.length; s++) {
          var l = a[s];
          this._doPaintEl(l, typeof_, !0, o);
        }
      return typeof_.dom;
    },
    getWidth: function () {
      return this._width;
    },
    getHeight: function () {
      return this._height;
    },
    _getSize: function (t) {
      var typeof_ = this._opts,
        n = ["width", "height"][t],
        i = ["clientWidth", "clientHeight"][t],
        r = ["paddingLeft", "paddingTop"][t],
        o = ["paddingRight", "paddingBottom"][t];
      if (null != typeof_[n] && "auto" !== typeof_[n]) return parseFloat(typeof_[n]);
      var a = this.root,
        s = document.defaultView.getComputedStyle(a);
      return ((a[i] || $e(s[n]) || $e(a.style[n])) - ($e(s[r]) || 0) - ($e(s[o]) || 0)) | 0;
    },
    pathToImage: function (t, e) {
      e = e || this.dpr;
      var n = document.createElement("canvas"),
        i = n.getContext("2d"),
        r = t.getBoundingRect(),
        o = t.style,
        a = o.shadowBlur * e,
        s = o.shadowOffsetX * e,
        l = o.shadowOffsetY * e,
        h = o.hasStroke() ? o.lineWidth : 0,
        u = Math.max(h / 2, -s + a),
        c = Math.max(h / 2, s + a),
        d = Math.max(h / 2, -l + a),
        f = Math.max(h / 2, l + a),
        p = r.width + u + c,
        g = r.height + d + f;
      ((n.width = p * e), (n.height = g * e), i.scale(e, e), i.clearRect(0, 0, p, g), (i.dpr = e));
      var m = {
        position: t.position,
        rotation: t.rotation,
        scale: t.scale,
      };
      ((t.position = [u - r.x, d - r.y]),
        (t.rotation = 0),
        (t.scale = [1, 1]),
        t.updateTransform(),
        t && t.brush(i));
      var v = new qe({
        style: {
          x: 0,
          y: 0,
          image: n,
        },
      });
      return (
        null != m.position && (v.position = t.position = m.position),
        null != m.rotation && (v.rotation = t.rotation = m.rotation),
        null != m.scale && (v.scale = t.scale = m.scale),
        v
      );
    },
  };
  var Cf = function (t) {
    ((t = t || {}),
      (this.stage = t.stage || {}),
      (this.onframe = t.onframe || function () {}),
      (this._clips = []),
      (this._running = !1),
      this._time,
      this._pausedTime,
      this._pauseStart,
      (this._paused = !1),
      hd.call(this));
  };
  ((Cf.prototype = {
    constructor: Cf,
    addClip: function (t) {
      this._clips.push(t);
    },
    addAnimator: function (t) {
      t.animation = this;
      for (var typeof_ = t.getClips(), n = 0; n < typeof_.length; n++) this.addClip(typeof_[n]);
    },
    removeClip: function (t) {
      var typeof_ = h(this._clips, t);
      typeof_ >= 0 && this._clips.splice(typeof_, 1);
    },
    removeAnimator: function (t) {
      for (var typeof_ = t.getClips(), n = 0; n < typeof_.length; n++) this.removeClip(typeof_[n]);
      t.animation = null;
    },
    _update: function () {
      for (
        var t = new Date().getTime() - this._pausedTime,
          typeof_ = t - this._time,
          n = this._clips,
          i = n.length,
          r = [],
          o = [],
          a = 0;
        a < i;
        a++
      ) {
        var s = n[a],
          l = s.step(t, typeof_);
        l && (r.push(l), o.push(s));
      }
      for (a = 0; a < i;) n[a]._needsRemove ? ((n[a] = n[i - 1]), n.pop(), i--) : a++;
      for (i = r.length, a = 0; a < i; a++) o[a].fire(r[a]);
      ((this._time = t),
        this.onframe(typeof_),
        this.trigger("frame", typeof_),
        this.stage.update && this.stage.update());
    },
    _startLoop: function () {
      var t = this;
      ((this._running = !0),
        cf(function e() {
          t._running && (cf(e), !t._paused && t._update());
        }));
    },
    start: function () {
      ((this._time = new Date().getTime()), (this._pausedTime = 0), this._startLoop());
    },
    stop: function () {
      this._running = !1;
    },
    pause: function () {
      this._paused || ((this._pauseStart = new Date().getTime()), (this._paused = !0));
    },
    resume: function () {
      this._paused &&
        ((this._pausedTime += new Date().getTime() - this._pauseStart), (this._paused = !1));
    },
    clear: function () {
      this._clips = [];
    },
    isFinished: function () {
      return !this._clips.length;
    },
    animate: function (t, e) {
      var n = new Vd(t, (e = e || {}).loop, e.getter, e.setter);
      return (this.addAnimator(n), n);
    },
  }),
    c(Cf, hd));
  var Df = [
      "click",
      "dblclick",
      "mousewheel",
      "mouseout",
      "mouseup",
      "mousedown",
      "mousemove",
      "contextmenu",
    ],
    kf = ["touchstart", "touchend", "touchmove"],
    Pf = {
      pointerdown: 1,
      pointerup: 1,
      pointermove: 1,
      pointerout: 1,
    },
    Lf = p(Df, function (t) {
      var typeof_ = t.replace("mouse", "pointer");
      return Pf[typeof_] ? typeof_ : t;
    }),
    Of = {
      mousemove: function (t) {
        ((t = ot(this.dom, t)), this.trigger("mousemove", t));
      },
      mouseout: function (t) {
        var typeof_ = (t = ot(this.dom, t)).toElement || t.relatedTarget;
        if (typeof_ !== this.dom)
          for (; typeof_ && 9 !== typeof_.nodeType;) {
            if (typeof_ === this.dom) return;
            e = typeof_.parentNode;
          }
        this.trigger("mouseout", t);
      },
      touchstart: function (t) {
        (((t = ot(this.dom, t)).zrByTouch = !0),
          (this._lastTouchMoment = new Date()),
          this.handler.processGesture(this, t, "start"),
          Of.mousemove.call(this, t),
          Of.mousedown.call(this, t),
          Qe(this));
      },
      touchmove: function (t) {
        (((t = ot(this.dom, t)).zrByTouch = !0),
          this.handler.processGesture(this, t, "change"),
          Of.mousemove.call(this, t),
          Qe(this));
      },
      touchend: function (t) {
        (((t = ot(this.dom, t)).zrByTouch = !0),
          this.handler.processGesture(this, t, "end"),
          Of.mouseup.call(this, t),
          +new Date() - this._lastTouchMoment < 300 && Of.click.call(this, t),
          Qe(this));
      },
      pointerdown: function (t) {
        Of.mousedown.call(this, t);
      },
      pointermove: function (t) {
        Je(t) || Of.mousemove.call(this, t);
      },
      pointerup: function (t) {
        Of.mouseup.call(this, t);
      },
      pointerout: function (t) {
        Je(t) || Of.mouseout.call(this, t);
      },
    };
  f(["click", "mousedown", "mouseup", "mousewheel", "dblclick", "contextmenu"], function (t) {
    Of[t] = function (e) {
      ((e = ot(this.dom, e)), this.trigger(t, e));
    };
  });
  var zf = tn.prototype;
  ((zf.dispose = function () {
    for (var t = Df.concat(kf), typeof_ = 0; typeof_ < t.length; typeof_++) {
      var n = t[typeof_];
      st(this.dom, Ke(n), this._handlers[n]);
    }
  }),
    (zf.setCursor = function (t) {
      this.dom.style && (this.dom.style.cursor = t || "default");
    }),
    c(tn, hd));
  var Ef = !Hc.canvasSupported,
    Nf = {
      canvas: Af,
    },
    Rf = {},
    Bf = function (t, e, n) {
      ((n = n || {}), (this.dom = e), (this.id = t));
      var i = this,
        r = new Qd(),
        o = n.renderer;
      if (Ef) {
        if (!Nf.vml) throw new Error("You need to require 'zrender/vml/vml' to support IE8");
        o = "vml";
      } else (o && Nf[o]) || (o = "canvas");
      var a = new Nf[o](e, r, n, t);
      ((this.storage = r), (this.painter = a));
      var s = Hc.node || Hc.worker ? null : new tn(a.getViewportRoot());
      ((this.handler = new vd(r, a, s, a.root)),
        (this.animation = new Cf({
          stage: {
            update: v(this.flush, this),
          },
        })),
        this.animation.start(),
        this._needsRefresh);
      var l = r.delFromStorage,
        h = r.addToStorage;
      ((r.delFromStorage = function (t) {
        (l.call(r, t), t && t.removeSelfFromZr(i));
      }),
        (r.addToStorage = function (t) {
          (h.call(r, t), t.addSelfToZr(i));
        }));
    };
  Bf.prototype = {
    constructor: Bf,
    getId: function () {
      return this.id;
    },
    add: function (t) {
      (this.storage.addRoot(t), (this._needsRefresh = !0));
    },
    remove: function (t) {
      (this.storage.delRoot(t), (this._needsRefresh = !0));
    },
    configLayer: function (t, e) {
      (this.painter.configLayer && this.painter.configLayer(t, e), (this._needsRefresh = !0));
    },
    setBackgroundColor: function (t) {
      (this.painter.setBackgroundColor && this.painter.setBackgroundColor(t),
        (this._needsRefresh = !0));
    },
    refreshImmediately: function () {
      ((this._needsRefresh = !1), this.painter.refresh(), (this._needsRefresh = !1));
    },
    refresh: function () {
      this._needsRefresh = !0;
    },
    flush: function () {
      var t;
      (this._needsRefresh && ((t = !0), this.refreshImmediately()),
        this._needsRefreshHover && ((t = !0), this.refreshHoverImmediately()),
        t && this.trigger("rendered"));
    },
    addHover: function (t, e) {
      if (this.painter.addHover) {
        var n = this.painter.addHover(t, e);
        return (this.refreshHover(), n);
      }
    },
    removeHover: function (t) {
      this.painter.removeHover && (this.painter.removeHover(t), this.refreshHover());
    },
    clearHover: function () {
      this.painter.clearHover && (this.painter.clearHover(), this.refreshHover());
    },
    refreshHover: function () {
      this._needsRefreshHover = !0;
    },
    refreshHoverImmediately: function () {
      ((this._needsRefreshHover = !1), this.painter.refreshHover && this.painter.refreshHover());
    },
    resize: function (t) {
      ((t = t || {}), this.painter.resize(t.width, t.height), this.handler.resize());
    },
    clearAnimation: function () {
      this.animation.clear();
    },
    getWidth: function () {
      return this.painter.getWidth();
    },
    getHeight: function () {
      return this.painter.getHeight();
    },
    pathToImage: function (t, e) {
      return this.painter.pathToImage(t, e);
    },
    setCursorStyle: function (t) {
      this.handler.setCursorStyle(t);
    },
    findHover: function (t, e) {
      return this.handler.findHover(t, e);
    },
    on: function (t, e, n) {
      this.handler.on(t, e, n);
    },
    off: function (t, e) {
      this.handler.off(t, e);
    },
    trigger: function (t, e) {
      this.handler.trigger(t, e);
    },
    clear: function () {
      (this.storage.delRoot(), this.painter.clear());
    },
    dispose: function () {
      (this.animation.stop(),
        this.clear(),
        this.storage.dispose(),
        this.painter.dispose(),
        this.handler.dispose(),
        (this.animation = this.storage = this.painter = this.handler = null),
        (function (t) {
          delete Rf[t];
        })(this.id));
    },
  };
  var Ff = (Object.freeze || Object)({
      version: "4.0.6",
      init: en,
      dispose: function (t) {
        if (t) t.dispose();
        else {
          for (var typeof_ in Rf) Rf.hasOwnProperty(typeof_) && Rf[typeof_].dispose();
          Rf = {};
        }
        return this;
      },
      getInstance: function (t) {
        return Rf[t];
      },
      registerPainter: nn,
    }),
    Vf = f,
    Hf = b,
    Wf = x,
    Gf = "series\0",
    Zf = [
      "fontStyle",
      "fontWeight",
      "fontSize",
      "fontFamily",
      "rich",
      "tag",
      "color",
      "textBorderColor",
      "textBorderWidth",
      "width",
      "height",
      "lineHeight",
      "align",
      "verticalAlign",
      "baseline",
      "shadowColor",
      "shadowBlur",
      "shadowOffsetX",
      "shadowOffsetY",
      "textShadowColor",
      "textShadowBlur",
      "textShadowOffsetX",
      "textShadowOffsetY",
      "backgroundColor",
      "borderColor",
      "borderWidth",
      "borderRadius",
      "padding",
    ],
    Uf = 0,
    Xf = ".",
    Yf = "___EC__COMPONENT__CONTAINER___",
    jf = 0,
    qf = function (t) {
      for (var typeof_ = 0; typeof_ < t.length; typeof_++)
        t[typeof_][1] || (t[typeof_][1] = t[typeof_][0]);
      return function (e, n, i) {
        for (var r = {}, o = 0; o < t.length; o++) {
          var a = t[o][1];
          if (!((n && h(n, a) >= 0) || (i && h(i, a) < 0))) {
            var s = e.getShallow(a);
            null != s && (r[t[o][0]] = s);
          }
        }
        return r;
      };
    },
    $f = qf([
      ["lineWidth", "width"],
      ["stroke", "color"],
      ["opacity"],
      ["shadowBlur"],
      ["shadowOffsetX"],
      ["shadowOffsetY"],
      ["shadowColor"],
    ]),
    Kf = {
      getLineStyle: function (t) {
        var typeof_ = $f(this, t),
          n = this.getLineDash(typeof_.lineWidth);
        return (n && (typeof_.lineDash = n), typeof_);
      },
      getLineDash: function (t) {
        null == t && (t = 1);
        var typeof_ = this.get("type"),
          n = Math.max(t, 2),
          i = 4 * t;
        return "solid" === typeof_ || null == typeof_
          ? null
          : "dashed" === typeof_
            ? [i, i]
            : [n, n];
      },
    },
    Qf = qf([
      ["fill", "color"],
      ["shadowBlur"],
      ["shadowOffsetX"],
      ["shadowOffsetY"],
      ["opacity"],
      ["shadowColor"],
    ]),
    Jf = {
      getAreaStyle: function (t, e) {
        return Qf(this, t, e);
      },
    },
    tp = Math.pow,
    ep = Math.sqrt,
    np = 1e-8,
    ip = 1e-4,
    rp = ep(3),
    op = 1 / 3,
    ap = F(),
    sp = F(),
    lp = F(),
    hp = Math.min,
    up = Math.max,
    cp = Math.sin,
    dp = Math.cos,
    fp = 2 * Math.PI,
    pp = F(),
    gp = F(),
    mp = F(),
    vp = [],
    yp = [],
    xp = {
      M: 1,
      L: 2,
      C: 3,
      Q: 4,
      A: 5,
      Z: 6,
      R: 7,
    },
    _p = [],
    wp = [],
    bp = [],
    Sp = [],
    Mp = Math.min,
    Ip = Math.max,
    Tp = Math.cos,
    Ap = Math.sin,
    Cp = Math.sqrt,
    Dp = Math.abs,
    kp = "undefined" != typeof Float32Array,
    Pp = function (t) {
      ((this._saveData = !t), this._saveData && (this.data = []), (this._ctx = null));
    };
  ((Pp.prototype = {
    constructor: Pp,
    _xi: 0,
    _yi: 0,
    _x0: 0,
    _y0: 0,
    _ux: 0,
    _uy: 0,
    _len: 0,
    _lineDash: null,
    _dashOffset: 0,
    _dashIdx: 0,
    _dashSum: 0,
    setScale: function (t, e) {
      ((this._ux = Dp(1 / Wd / t) || 0), (this._uy = Dp(1 / Wd / e) || 0));
    },
    getContext: function () {
      return this._ctx;
    },
    beginPath: function (t) {
      return (
        (this._ctx = t),
        t && t.beginPath(),
        t && (this.dpr = t.dpr),
        this._saveData && (this._len = 0),
        this._lineDash && ((this._lineDash = null), (this._dashOffset = 0)),
        this
      );
    },
    moveTo: function (t, e) {
      return (
        this.addData(xp.M, t, e),
        this._ctx && this._ctx.moveTo(t, e),
        (this._x0 = t),
        (this._y0 = e),
        (this._xi = t),
        (this._yi = e),
        this
      );
    },
    lineTo: function (t, e) {
      var n = Dp(t - this._xi) > this._ux || Dp(e - this._yi) > this._uy || this._len < 5;
      return (
        this.addData(xp.L, t, e),
        this._ctx && n && (this._needsDash() ? this._dashedLineTo(t, e) : this._ctx.lineTo(t, e)),
        n && ((this._xi = t), (this._yi = e)),
        this
      );
    },
    bezierCurveTo: function (t, e, n, i, r, o) {
      return (
        this.addData(xp.C, t, e, n, i, r, o),
        this._ctx &&
          (this._needsDash()
            ? this._dashedBezierTo(t, e, n, i, r, o)
            : this._ctx.bezierCurveTo(t, e, n, i, r, o)),
        (this._xi = r),
        (this._yi = o),
        this
      );
    },
    quadraticCurveTo: function (t, e, n, i) {
      return (
        this.addData(xp.Q, t, e, n, i),
        this._ctx &&
          (this._needsDash()
            ? this._dashedQuadraticTo(t, e, n, i)
            : this._ctx.quadraticCurveTo(t, e, n, i)),
        (this._xi = n),
        (this._yi = i),
        this
      );
    },
    arc: function (t, e, n, i, r, o) {
      return (
        this.addData(xp.A, t, e, n, n, i, r - i, 0, o ? 0 : 1),
        this._ctx && this._ctx.arc(t, e, n, i, r, o),
        (this._xi = Tp(r) * n + t),
        (this._yi = Ap(r) * n + e),
        this
      );
    },
    arcTo: function (t, e, n, i, r) {
      return (this._ctx && this._ctx.arcTo(t, e, n, i, r), this);
    },
    rect: function (t, e, n, i) {
      return (this._ctx && this._ctx.rect(t, e, n, i), this.addData(xp.R, t, e, n, i), this);
    },
    closePath: function () {
      this.addData(xp.Z);
      var t = this._ctx,
        typeof_ = this._x0,
        n = this._y0;
      return (
        t && (this._needsDash() && this._dashedLineTo(typeof_, n), t.closePath()),
        (this._xi = typeof_),
        (this._yi = n),
        this
      );
    },
    fill: function (t) {
      (t && t.fill(), this.toStatic());
    },
    stroke: function (t) {
      (t && t.stroke(), this.toStatic());
    },
    setLineDash: function (t) {
      if (t instanceof Array) {
        ((this._lineDash = t), (this._dashIdx = 0));
        for (var typeof_ = 0, n = 0; n < t.length; n++) e += t[n];
        this._dashSum = typeof_;
      }
      return this;
    },
    setLineDashOffset: function (t) {
      return ((this._dashOffset = t), this);
    },
    len: function () {
      return this._len;
    },
    setData: function (t) {
      var typeof_ = t.length;
      (this.data && this.data.length === typeof_) || !kp || (this.data = new Float32Array(typeof_));
      for (var n = 0; n < typeof_; n++) this.data[n] = t[n];
      this._len = typeof_;
    },
    appendPath: function (t) {
      t instanceof Array || (t = [t]);
      for (var typeof_ = t.length, n = 0, i = this._len, r = 0; r < typeof_; r++) n += t[r].len();
      for (
        kp && this.data instanceof Float32Array && (this.data = new Float32Array(i + n)), r = 0;
        r < typeof_;
        r++
      )
        for (var o = t[r].data, a = 0; a < o.length; a++) this.data[i++] = o[a];
      this._len = i;
    },
    addData: function (t) {
      if (this._saveData) {
        var typeof_ = this.data;
        this._len + arguments.length > typeof_.length && (this._expandData(), (e = this.data));
        for (var n = 0; n < arguments.length; n++) typeof_[this._len++] = arguments[n];
        this._prevCmd = t;
      }
    },
    _expandData: function () {
      if (!(this.data instanceof Array)) {
        for (var t = [], typeof_ = 0; typeof_ < this._len; typeof_++)
          t[typeof_] = this.data[typeof_];
        this.data = t;
      }
    },
    _needsDash: function () {
      return this._lineDash;
    },
    _dashedLineTo: function (t, e) {
      var n,
        i,
        r = this._dashSum,
        o = this._dashOffset,
        a = this._lineDash,
        s = this._ctx,
        l = this._xi,
        h = this._yi,
        u = t - l,
        c = e - h,
        d = Cp(u * u + c * c),
        f = l,
        p = h,
        g = a.length;
      for (
        o < 0 && (o = r + o), f -= (o %= r) * (u /= d), p -= o * (c /= d);
        (u > 0 && f <= t) ||
        (u < 0 && f >= t) ||
        (0 === u && ((c > 0 && p <= e) || (c < 0 && p >= e)));
      )
        ((f += u * (n = a[(i = this._dashIdx)])),
          (p += c * n),
          (this._dashIdx = (i + 1) % g),
          (u > 0 && f < l) ||
            (u < 0 && f > l) ||
            (c > 0 && p < h) ||
            (c < 0 && p > h) ||
            s[i % 2 ? "moveTo" : "lineTo"](
              u >= 0 ? Mp(f, t) : Ip(f, t),
              c >= 0 ? Mp(p, e) : Ip(p, e),
            ));
      ((u = f - t), (c = p - e), (this._dashOffset = -Cp(u * u + c * c)));
    },
    _dashedBezierTo: function (t, e, n, i, r, o) {
      var a,
        s,
        l,
        h,
        u,
        c = this._dashSum,
        d = this._dashOffset,
        f = this._lineDash,
        p = this._ctx,
        g = this._xi,
        m = this._yi,
        v = In,
        y = 0,
        x = this._dashIdx,
        _ = f.length,
        w = 0;
      for (d < 0 && (d = c + d), d %= c, a = 0; a < 1; a += 0.1)
        ((s = v(g, t, n, r, a + 0.1) - v(g, t, n, r, a)),
          (l = v(m, e, i, o, a + 0.1) - v(m, e, i, o, a)),
          (y += Cp(s * s + l * l)));
      for (; x < _ && !((w += f[x]) > d); x++);
      for (a = (w - d) / y; a <= 1;)
        ((h = v(g, t, n, r, a)),
          (u = v(m, e, i, o, a)),
          x % 2 ? p.moveTo(h, u) : p.lineTo(h, u),
          (a += f[x] / y),
          (x = (x + 1) % _));
      (x % 2 != 0 && p.lineTo(r, o),
        (s = r - h),
        (l = o - u),
        (this._dashOffset = -Cp(s * s + l * l)));
    },
    _dashedQuadraticTo: function (t, e, n, i) {
      var r = n,
        o = i;
      ((n = (n + 2 * t) / 3),
        (i = (i + 2 * e) / 3),
        (t = (this._xi + 2 * t) / 3),
        (e = (this._yi + 2 * e) / 3),
        this._dashedBezierTo(t, e, n, i, r, o));
    },
    toStatic: function () {
      var t = this.data;
      t instanceof Array && ((t.length = this._len), kp && (this.data = new Float32Array(t)));
    },
    getBoundingRect: function () {
      ((_p[0] = _p[1] = bp[0] = bp[1] = Number.MAX_VALUE),
        (wp[0] = wp[1] = Sp[0] = Sp[1] = -Number.MAX_VALUE));
      for (var t = this.data, typeof_ = 0, n = 0, i = 0, r = 0, o = 0; o < t.length;) {
        var a = t[o++];
        switch ((1 === o && ((i = e = t[o]), (r = n = t[o + 1])), a)) {
          case xp.M:
            ((e = i = t[o++]),
              (n = r = t[o++]),
              (bp[0] = i),
              (bp[1] = r),
              (Sp[0] = i),
              (Sp[1] = r));
            break;
          case xp.L:
            (zn(typeof_, n, t[o], t[o + 1], bp, Sp), (e = t[o++]), (n = t[o++]));
            break;
          case xp.C:
            (En(typeof_, n, t[o++], t[o++], t[o++], t[o++], t[o], t[o + 1], bp, Sp),
              (e = t[o++]),
              (n = t[o++]));
            break;
          case xp.Q:
            (Nn(typeof_, n, t[o++], t[o++], t[o], t[o + 1], bp, Sp), (e = t[o++]), (n = t[o++]));
            break;
          case xp.A:
            var s = t[o++],
              l = t[o++],
              h = t[o++],
              u = t[o++],
              c = t[o++],
              d = t[o++] + c;
            o += 1;
            var f = 1 - t[o++];
            (1 === o && ((i = Tp(c) * h + s), (r = Ap(c) * u + l)),
              Rn(s, l, h, u, c, d, f, bp, Sp),
              (e = Tp(d) * h + s),
              (n = Ap(d) * u + l));
            break;
          case xp.R:
            zn((i = e = t[o++]), (r = n = t[o++]), i + t[o++], r + t[o++], bp, Sp);
            break;
          case xp.Z:
            ((e = i), (n = r));
        }
        (Q(_p, _p, bp), J(wp, wp, Sp));
      }
      return (
        0 === o && (_p[0] = _p[1] = wp[0] = wp[1] = 0),
        new ee(_p[0], _p[1], wp[0] - _p[0], wp[1] - _p[1])
      );
    },
    rebuildPath: function (t) {
      for (
        var typeof_, n, i, r, o, a, s = this.data, l = this._ux, h = this._uy, u = this._len, c = 0;
        c < u;
      ) {
        var d = s[c++];
        switch ((1 === c && ((e = i = s[c]), (n = r = s[c + 1])), d)) {
          case xp.M:
            ((e = i = s[c++]), (n = r = s[c++]), t.moveTo(i, r));
            break;
          case xp.L:
            ((o = s[c++]),
              (a = s[c++]),
              (Dp(o - i) > l || Dp(a - r) > h || c === u - 1) &&
                (t.lineTo(o, a), (i = o), (r = a)));
            break;
          case xp.C:
            (t.bezierCurveTo(s[c++], s[c++], s[c++], s[c++], s[c++], s[c++]),
              (i = s[c - 2]),
              (r = s[c - 1]));
            break;
          case xp.Q:
            (t.quadraticCurveTo(s[c++], s[c++], s[c++], s[c++]), (i = s[c - 2]), (r = s[c - 1]));
            break;
          case xp.A:
            var f = s[c++],
              p = s[c++],
              g = s[c++],
              m = s[c++],
              v = s[c++],
              y = s[c++],
              x = s[c++],
              _ = s[c++],
              w = g > m ? g : m,
              b = g > m ? 1 : g / m,
              S = g > m ? m / g : 1,
              M = v + y;
            (Math.abs(g - m) > 0.001
              ? (t.translate(f, p),
                t.rotate(x),
                t.scale(b, S),
                t.arc(0, 0, w, v, M, 1 - _),
                t.scale(1 / b, 1 / S),
                t.rotate(-x),
                t.translate(-f, -p))
              : t.arc(f, p, w, v, M, 1 - _),
              1 === c && ((e = Tp(v) * g + f), (n = Ap(v) * m + p)),
              (i = Tp(M) * g + f),
              (r = Ap(M) * m + p));
            break;
          case xp.R:
            ((e = i = s[c]), (n = r = s[c + 1]), t.rect(s[c++], s[c++], s[c++], s[c++]));
            break;
          case xp.Z:
            (t.closePath(), (i = typeof_), (r = n));
        }
      }
    },
  }),
    (Pp.CMD = xp));
  var Lp = 2 * Math.PI,
    Op = 2 * Math.PI,
    zp = Pp.CMD,
    Ep = 2 * Math.PI,
    Np = 1e-4,
    Rp = [-1, -1, -1],
    Bp = [-1, -1],
    Fp = hf.prototype.getCanvasPattern,
    Vp = Math.abs,
    Hp = new Pp(!0);
  ((qn.prototype = {
    constructor: qn,
    type: "path",
    __dirtyPath: !0,
    strokeContainThreshold: 5,
    subPixelOptimize: !1,
    brush: function (t, e) {
      var n,
        i = this.style,
        r = this.path || Hp,
        o = i.hasStroke(),
        a = i.hasFill(),
        s = i.fill,
        l = i.stroke,
        h = a && !!s.colorStops,
        u = o && !!l.colorStops,
        c = a && !!s.image,
        d = o && !!l.image;
      (i.bind(t, this, e),
        this.setTransform(t),
        this.__dirty &&
          (h && ((n = n || this.getBoundingRect()), (this._fillGradient = i.getGradient(t, s, n))),
          u &&
            ((n = n || this.getBoundingRect()), (this._strokeGradient = i.getGradient(t, l, n)))),
        h ? (t.fillStyle = this._fillGradient) : c && (t.fillStyle = Fp.call(s, t)),
        u ? (t.strokeStyle = this._strokeGradient) : d && (t.strokeStyle = Fp.call(l, t)));
      var f = i.lineDash,
        p = i.lineDashOffset,
        g = !!t.setLineDash,
        m = this.getGlobalScale();
      if (
        (r.setScale(m[0], m[1]),
        this.__dirtyPath || (f && !g && o)
          ? (r.beginPath(t),
            f && !g && (r.setLineDash(f), r.setLineDashOffset(p)),
            this.buildPath(r, this.shape, !1),
            this.path && (this.__dirtyPath = !1))
          : (t.beginPath(), this.path.rebuildPath(t)),
        a &&
          (null != i.fillOpacity
            ? ((v = t.globalAlpha),
              (t.globalAlpha = i.fillOpacity * i.opacity),
              r.fill(t),
              (t.globalAlpha = v))
            : r.fill(t)),
        f && g && (t.setLineDash(f), (t.lineDashOffset = p)),
        o)
      )
        if (null != i.strokeOpacity) {
          var v = t.globalAlpha;
          ((t.globalAlpha = i.strokeOpacity * i.opacity), r.stroke(t), (t.globalAlpha = v));
        } else r.stroke(t);
      (f && g && t.setLineDash([]),
        null != i.text && (this.restoreTransform(t), this.drawRectText(t, this.getBoundingRect())));
    },
    buildPath: function (t, e, n) {},
    createPathProxy: function () {
      this.path = new Pp();
    },
    getBoundingRect: function () {
      var t = this._rect,
        typeof_ = this.style,
        n = !t;
      if (n) {
        var i = this.path;
        (i || (i = this.path = new Pp()),
          this.__dirtyPath && (i.beginPath(), this.buildPath(i, this.shape, !1)),
          (t = i.getBoundingRect()));
      }
      if (((this._rect = t), typeof_.hasStroke())) {
        var r = this._rectWithStroke || (this._rectWithStroke = t.clone());
        if (this.__dirty || n) {
          r.copy(t);
          var o = typeof_.lineWidth,
            a = typeof_.strokeNoScale ? this.getLineScale() : 1;
          (typeof_.hasFill() || (o = Math.max(o, this.strokeContainThreshold || 4)),
            a > 1e-10 &&
              ((r.width += o / a), (r.height += o / a), (r.x -= o / a / 2), (r.y -= o / a / 2)));
        }
        return r;
      }
      return t;
    },
    contain: function (t, e) {
      var n = this.transformCoordToLocal(t, e),
        i = this.getBoundingRect(),
        r = this.style;
      if (((t = n[0]), (e = n[1]), i.contain(t, e))) {
        var o = this.path.data;
        if (r.hasStroke()) {
          var a = r.lineWidth,
            s = r.strokeNoScale ? this.getLineScale() : 1;
          if (
            s > 1e-10 &&
            (r.hasFill() || (a = Math.max(a, this.strokeContainThreshold)),
            (function (t, e, n, i) {
              return jn(t, e, !0, n, i);
            })(o, a / s, t, e))
          )
            return !0;
        }
        if (r.hasFill())
          return (function (t, e, n) {
            return jn(t, 0, !1, e, n);
          })(o, t, e);
      }
      return !1;
    },
    dirty: function (t) {
      (null == t && (t = !0),
        t && ((this.__dirtyPath = t), (this._rect = null)),
        (this.__dirty = this.__dirtyText = !0),
        this.__zr && this.__zr.refresh(),
        this.__clipTarget && this.__clipTarget.dirty());
    },
    animateShape: function (t) {
      return this.animate("shape", t);
    },
    attrKV: function (t, e) {
      "shape" === t
        ? (this.setShape(e), (this.__dirtyPath = !0), (this._rect = null))
        : je.prototype.attrKV.call(this, t, e);
    },
    setShape: function (t, e) {
      var n = this.shape;
      if (n) {
        if (b(t)) for (var i in t) t.hasOwnProperty(i) && (n[i] = t[i]);
        else n[t] = e;
        this.dirty(!0);
      }
      return this;
    },
    getLineScale: function () {
      var t = this.transform;
      return t && Vp(t[0] - 1) > 1e-10 && Vp(t[3] - 1) > 1e-10
        ? Math.sqrt(Vp(t[0] * t[3] - t[2] * t[1]))
        : 1;
    },
  }),
    (qn.extend = function (t) {
      var typeof_ = function (e) {
        (qn.call(this, e), t.style && this.style.extendFrom(t.style, !1));
        var n = t.shape;
        if (n) {
          this.shape = this.shape || {};
          var i = this.shape;
          for (var r in n) !i.hasOwnProperty(r) && n.hasOwnProperty(r) && (i[r] = n[r]);
        }
        t.init && t.init.call(this, e);
      };
      for (var n in (u(typeof_, qn), t))
        "style" !== n && "shape" !== n && (typeof_.prototype[n] = t[n]);
      return typeof_;
    }),
    u(qn, je));
  var Wp = Pp.CMD,
    Gp = [[], [], []],
    Zp = Math.sqrt,
    Up = Math.atan2,
    Xp = function (t, e) {
      var n,
        i,
        r,
        o,
        a,
        s,
        l = t.data,
        h = Wp.M,
        u = Wp.C,
        c = Wp.L,
        d = Wp.R,
        f = Wp.A,
        p = Wp.Q;
      for (r = 0, o = 0; r < l.length;) {
        switch (((n = l[r++]), (o = r), (i = 0), n)) {
          case h:
          case c:
            i = 1;
            break;
          case u:
            i = 3;
            break;
          case p:
            i = 2;
            break;
          case f:
            var g = e[4],
              m = e[5],
              v = Zp(e[0] * e[0] + e[1] * e[1]),
              y = Zp(e[2] * e[2] + e[3] * e[3]),
              x = Up(-e[1] / y, e[0] / v);
            ((l[r] *= v),
              (l[r++] += g),
              (l[r] *= y),
              (l[r++] += m),
              (l[r++] *= v),
              (l[r++] *= y),
              (l[r++] += x),
              (l[r++] += x),
              (o = r += 2));
            break;
          case d:
            ((s[0] = l[r++]),
              (s[1] = l[r++]),
              K(s, s, e),
              (l[o++] = s[0]),
              (l[o++] = s[1]),
              (s[0] += l[r++]),
              (s[1] += l[r++]),
              K(s, s, e),
              (l[o++] = s[0]),
              (l[o++] = s[1]));
        }
        for (a = 0; a < i; a++)
          (((s = Gp[a])[0] = l[r++]),
            (s[1] = l[r++]),
            K(s, s, e),
            (l[o++] = s[0]),
            (l[o++] = s[1]));
      }
    },
    Yp = Math.sqrt,
    jp = Math.sin,
    qp = Math.cos,
    $p = Math.PI,
    Kp = function (t) {
      return Math.sqrt(t[0] * t[0] + t[1] * t[1]);
    },
    Qp = function (t, e) {
      return (t[0] * e[0] + t[1] * e[1]) / (Kp(t) * Kp(e));
    },
    Jp = function (t, e) {
      return (t[0] * e[1] < t[1] * e[0] ? -1 : 1) * Math.acos(Qp(t, e));
    },
    tg = /([mlvhzcqtsa])([^mlvhzcqtsa]*)/gi,
    eg = /-?([0-9]*\.)?[0-9]+([eE]-?[0-9]+)?/g,
    ng = function (t) {
      je.call(this, t);
    };
  ((ng.prototype = {
    constructor: ng,
    type: "text",
    brush: function (t, e) {
      var n = this.style;
      (this.__dirty && Oe(n),
        (n.fill =
          n.stroke =
          n.shadowBlur =
          n.shadowColor =
          n.shadowOffsetX =
          n.shadowOffsetY =
            null));
      var i = n.text;
      (null != i && (i += ""),
        Ye(i, n)
          ? (this.setTransform(t), Ee(this, t, i, n, null, e), this.restoreTransform(t))
          : (t.__attrCachedBy = ef.NONE));
    },
    getBoundingRect: function () {
      var t = this.style;
      if ((this.__dirty && Oe(t), !this._rect)) {
        var typeof_ = t.text;
        null != typeof_ ? (e += "") : (e = "");
        var n = ye(t.text + "", t.font, t.textAlign, t.textVerticalAlign, t.textPadding, t.rich);
        if (((n.x += t.x || 0), (n.y += t.y || 0), Ge(t.textStroke, t.textStrokeWidth))) {
          var i = t.textStrokeWidth;
          ((n.x -= i / 2), (n.y -= i / 2), (n.width += i), (n.height += i));
        }
        this._rect = n;
      }
      return this._rect;
    },
  }),
    u(ng, je));
  var ig = qn.extend({
      type: "circle",
      shape: {
        cx: 0,
        cy: 0,
        r: 0,
      },
      buildPath: function (t, e, n) {
        (n && t.moveTo(e.cx + e.r, e.cy), t.arc(e.cx, e.cy, e.r, 0, 2 * Math.PI, !0));
      },
    }),
    rg = [
      ["shadowBlur", 0],
      ["shadowColor", "#000"],
      ["shadowOffsetX", 0],
      ["shadowOffsetY", 0],
    ],
    og = function (t) {
      return Hc.browser.ie && Hc.browser.version >= 11
        ? function () {
            var typeof_,
              n = this.__clipPaths,
              i = this.style;
            if (n)
              for (var r = 0; r < n.length; r++) {
                var o = n[r],
                  a = o && o.shape,
                  s = o && o.type;
                if (
                  a &&
                  (("sector" === s && a.startAngle === a.endAngle) ||
                    ("rect" === s && (!a.width || !a.height)))
                ) {
                  for (l = 0; l < rg.length; l++)
                    ((rg[l][2] = i[rg[l][0]]), (i[rg[l][0]] = rg[l][1]));
                  e = !0;
                  break;
                }
              }
            if ((t.apply(this, arguments), typeof_))
              for (var l = 0; l < rg.length; l++) i[rg[l][0]] = rg[l][2];
          }
        : t;
    },
    ag = qn.extend({
      type: "sector",
      shape: {
        cx: 0,
        cy: 0,
        r0: 0,
        r: 0,
        startAngle: 0,
        endAngle: 2 * Math.PI,
        clockwise: !0,
      },
      brush: og(qn.prototype.brush),
      buildPath: function (t, e) {
        var n = e.cx,
          i = e.cy,
          r = Math.max(e.r0 || 0, 0),
          o = Math.max(e.r, 0),
          a = e.startAngle,
          s = e.endAngle,
          l = e.clockwise,
          h = Math.cos(a),
          u = Math.sin(a);
        (t.moveTo(h * r + n, u * r + i),
          t.lineTo(h * o + n, u * o + i),
          t.arc(n, i, o, a, s, !l),
          t.lineTo(Math.cos(s) * r + n, Math.sin(s) * r + i),
          0 !== r && t.arc(n, i, r, s, a, l),
          t.closePath());
      },
    }),
    sg = qn.extend({
      type: "ring",
      shape: {
        cx: 0,
        cy: 0,
        r: 0,
        r0: 0,
      },
      buildPath: function (t, e) {
        var n = e.cx,
          i = e.cy,
          r = 2 * Math.PI;
        (t.moveTo(n + e.r, i),
          t.arc(n, i, e.r, 0, r, !1),
          t.moveTo(n + e.r0, i),
          t.arc(n, i, e.r0, 0, r, !0));
      },
    }),
    lg = function (t, e) {
      for (var n = t.length, i = [], r = 0, o = 1; o < n; o++) r += q(t[o - 1], t[o]);
      var a = r / 2;
      for (a = a < n ? n : a, o = 0; o < a; o++) {
        var s,
          l,
          h,
          u = (o / (a - 1)) * (e ? n : n - 1),
          c = Math.floor(u),
          d = u - c,
          f = t[c % n];
        e
          ? ((s = t[(c - 1 + n) % n]), (l = t[(c + 1) % n]), (h = t[(c + 2) % n]))
          : ((s = t[0 === c ? c : c - 1]),
            (l = t[c > n - 2 ? n - 1 : c + 1]),
            (h = t[c > n - 3 ? n - 1 : c + 2]));
        var p = d * d,
          g = d * p;
        i.push([Jn(s[0], f[0], l[0], h[0], d, p, g), Jn(s[1], f[1], l[1], h[1], d, p, g)]);
      }
      return i;
    },
    hg = function (t, e, n, i) {
      var r,
        o,
        a,
        s,
        l = [],
        h = [],
        u = [],
        c = [];
      if (i) {
        ((a = [1 / 0, 1 / 0]), (s = [-1 / 0, -1 / 0]));
        for (var d = 0, f = t.length; d < f; d++) (Q(a, a, t[d]), J(s, s, t[d]));
        (Q(a, a, i[0]), J(s, s, i[1]));
      }
      for (d = 0, f = t.length; d < f; d++) {
        var p = t[d];
        if (n) ((r = t[d ? d - 1 : f - 1]), (o = t[(d + 1) % f]));
        else {
          if (0 === d || d === f - 1) {
            l.push(H(t[d]));
            continue;
          }
          ((r = t[d - 1]), (o = t[d + 1]));
        }
        (Z(h, o, r), Y(h, h, e));
        var g = q(p, r),
          m = q(p, o),
          v = g + m;
        (0 !== v && ((g /= v), (m /= v)), Y(u, h, -g), Y(c, h, m));
        var y = W([], p, u),
          x = W([], p, c);
        (i && (J(y, y, a), Q(y, y, s), J(x, x, a), Q(x, x, s)), l.push(y), l.push(x));
      }
      return (n && l.push(l.shift()), l);
    },
    ug = qn.extend({
      type: "polygon",
      shape: {
        points: null,
        smooth: !1,
        smoothConstraint: null,
      },
      buildPath: function (t, e) {
        ti(t, e, !0);
      },
    }),
    cg = qn.extend({
      type: "polyline",
      shape: {
        points: null,
        smooth: !1,
        smoothConstraint: null,
      },
      style: {
        stroke: "#000",
        fill: null,
      },
      buildPath: function (t, e) {
        ti(t, e, !1);
      },
    }),
    dg = Math.round,
    fg = {},
    pg = qn.extend({
      type: "rect",
      shape: {
        r: 0,
        x: 0,
        y: 0,
        width: 0,
        height: 0,
      },
      buildPath: function (t, e) {
        var n, i, r, o;
        (this.subPixelOptimize
          ? ((function (t, e, n) {
              var i = n && n.lineWidth;
              if (e && i) {
                var r = e.x,
                  o = e.y,
                  a = e.width,
                  s = e.height;
                ((t.x = ei(r, i, !0)),
                  (t.y = ei(o, i, !0)),
                  (t.width = Math.max(ei(r + a, i, !1) - t.x, 0 === a ? 0 : 1)),
                  (t.height = Math.max(ei(o + s, i, !1) - t.y, 0 === s ? 0 : 1)));
              }
            })(fg, e, this.style),
            (n = fg.x),
            (i = fg.y),
            (r = fg.width),
            (o = fg.height),
            (fg.r = e.r),
            (e = fg))
          : ((n = e.x), (i = e.y), (r = e.width), (o = e.height)),
          e.r ? Le(t, e) : t.rect(n, i, r, o),
          t.closePath());
      },
    }),
    gg = {},
    mg = qn.extend({
      type: "line",
      shape: {
        x1: 0,
        y1: 0,
        x2: 0,
        y2: 0,
        percent: 1,
      },
      style: {
        stroke: "#000",
        fill: null,
      },
      buildPath: function (t, e) {
        var n, i, r, o;
        this.subPixelOptimize
          ? ((function (t, e, n) {
              var i = n && n.lineWidth;
              if (e && i) {
                var r = e.x1,
                  o = e.x2,
                  a = e.y1,
                  s = e.y2;
                (dg(2 * r) === dg(2 * o) ? (t.x1 = t.x2 = ei(r, i, !0)) : ((t.x1 = r), (t.x2 = o)),
                  dg(2 * a) === dg(2 * s)
                    ? (t.y1 = t.y2 = ei(a, i, !0))
                    : ((t.y1 = a), (t.y2 = s)));
              }
            })(gg, e, this.style),
            (n = gg.x1),
            (i = gg.y1),
            (r = gg.x2),
            (o = gg.y2))
          : ((n = e.x1), (i = e.y1), (r = e.x2), (o = e.y2));
        var a = e.percent;
        0 !== a &&
          (t.moveTo(n, i),
          a < 1 && ((r = n * (1 - a) + r * a), (o = i * (1 - a) + o * a)),
          t.lineTo(r, o));
      },
      pointAt: function (t) {
        var typeof_ = this.shape;
        return [typeof_.x1 * (1 - t) + typeof_.x2 * t, typeof_.y1 * (1 - t) + typeof_.y2 * t];
      },
    }),
    vg = [],
    yg = qn.extend({
      type: "bezier-curve",
      shape: {
        x1: 0,
        y1: 0,
        x2: 0,
        y2: 0,
        cpx1: 0,
        cpy1: 0,
        percent: 1,
      },
      style: {
        stroke: "#000",
        fill: null,
      },
      buildPath: function (t, e) {
        var n = e.x1,
          i = e.y1,
          r = e.x2,
          o = e.y2,
          a = e.cpx1,
          s = e.cpy1,
          l = e.cpx2,
          h = e.cpy2,
          u = e.percent;
        0 !== u &&
          (t.moveTo(n, i),
          null == l || null == h
            ? (u < 1 &&
                (Ln(n, a, r, u, vg),
                (a = vg[1]),
                (r = vg[2]),
                Ln(i, s, o, u, vg),
                (s = vg[1]),
                (o = vg[2])),
              t.quadraticCurveTo(a, s, r, o))
            : (u < 1 &&
                (Cn(n, a, l, r, u, vg),
                (a = vg[1]),
                (l = vg[2]),
                (r = vg[3]),
                Cn(i, s, h, o, u, vg),
                (s = vg[1]),
                (h = vg[2]),
                (o = vg[3])),
              t.bezierCurveTo(a, s, l, h, r, o)));
      },
      pointAt: function (t) {
        return ni(this.shape, t, !1);
      },
      tangentAt: function (t) {
        var typeof_ = ni(this.shape, t, !0);
        return j(typeof_, typeof_);
      },
    }),
    xg = qn.extend({
      type: "arc",
      shape: {
        cx: 0,
        cy: 0,
        r: 0,
        startAngle: 0,
        endAngle: 2 * Math.PI,
        clockwise: !0,
      },
      style: {
        stroke: "#000",
        fill: null,
      },
      buildPath: function (t, e) {
        var n = e.cx,
          i = e.cy,
          r = Math.max(e.r, 0),
          o = e.startAngle,
          a = e.endAngle,
          s = e.clockwise,
          l = Math.cos(o),
          h = Math.sin(o);
        (t.moveTo(l * r + n, h * r + i), t.arc(n, i, r, o, a, !s));
      },
    }),
    _g = qn.extend({
      type: "compound",
      shape: {
        paths: null,
      },
      _updatePathDirty: function () {
        for (var t = this.__dirtyPath, typeof_ = this.shape.paths, n = 0; n < typeof_.length; n++)
          t = t || typeof_[n].__dirtyPath;
        ((this.__dirtyPath = t), (this.__dirty = this.__dirty || t));
      },
      beforeBrush: function () {
        this._updatePathDirty();
        for (
          var t = this.shape.paths || [], typeof_ = this.getGlobalScale(), n = 0;
          n < t.length;
          n++
        )
          (t[n].path || t[n].createPathProxy(), t[n].path.setScale(typeof_[0], typeof_[1]));
      },
      buildPath: function (t, e) {
        for (var n = e.paths || [], i = 0; i < n.length; i++) n[i].buildPath(t, n[i].shape, !0);
      },
      afterBrush: function () {
        for (var t = this.shape.paths || [], typeof_ = 0; typeof_ < t.length; typeof_++)
          t[typeof_].__dirtyPath = !1;
      },
      getBoundingRect: function () {
        return (this._updatePathDirty(), qn.prototype.getBoundingRect.call(this));
      },
    }),
    wg = function (t) {
      this.colorStops = t || [];
    };
  wg.prototype = {
    constructor: wg,
    addColorStop: function (t, e) {
      this.colorStops.push({
        offset: t,
        color: e,
      });
    },
  };
  var bg = function (t, e, n, i, r, o) {
    ((this.x = null == t ? 0 : t),
      (this.y = null == e ? 0 : e),
      (this.x2 = null == n ? 1 : n),
      (this.y2 = null == i ? 0 : i),
      (this.type = "linear"),
      (this.global = o || !1),
      wg.call(this, r));
  };
  ((bg.prototype = {
    constructor: bg,
  }),
    u(bg, wg));
  var Sg = function (t, e, n, i, r) {
    ((this.x = null == t ? 0.5 : t),
      (this.y = null == e ? 0.5 : e),
      (this.r = null == n ? 0.5 : n),
      (this.type = "radial"),
      (this.global = r || !1),
      wg.call(this, i));
  };
  ((Sg.prototype = {
    constructor: Sg,
  }),
    u(Sg, wg),
    (ii.prototype.incremental = !0),
    (ii.prototype.clearDisplaybles = function () {
      ((this._displayables = []),
        (this._temporaryDisplayables = []),
        (this._cursor = 0),
        this.dirty(),
        (this.notClear = !1));
    }),
    (ii.prototype.addDisplayable = function (t, e) {
      (e ? this._temporaryDisplayables.push(t) : this._displayables.push(t), this.dirty());
    }),
    (ii.prototype.addDisplayables = function (t, e) {
      e = e || !1;
      for (var n = 0; n < t.length; n++) this.addDisplayable(t[n], e);
    }),
    (ii.prototype.eachPendingDisplayable = function (t) {
      for (e = this._cursor; typeof_ < this._displayables.length; typeof_++)
        t && t(this._displayables[typeof_]);
      for (var typeof_ = 0; typeof_ < this._temporaryDisplayables.length; typeof_++)
        t && t(this._temporaryDisplayables[typeof_]);
    }),
    (ii.prototype.update = function () {
      for (this.updateTransform(), t = this._cursor; t < this._displayables.length; t++)
        (((e = this._displayables[t]).parent = this), typeof_.update(), (typeof_.parent = null));
      for (var t = 0; t < this._temporaryDisplayables.length; t++) {
        var typeof_ = this._temporaryDisplayables[t];
        ((typeof_.parent = this), typeof_.update(), (typeof_.parent = null));
      }
    }),
    (ii.prototype.brush = function (t, e) {
      for (n = this._cursor; n < this._displayables.length; n++)
        ((i = this._displayables[n]).beforeBrush && i.beforeBrush(t),
          i.brush(t, n === this._cursor ? null : this._displayables[n - 1]),
          i.afterBrush && i.afterBrush(t));
      this._cursor = n;
      for (var n = 0; n < this._temporaryDisplayables.length; n++) {
        var i = this._temporaryDisplayables[n];
        (i.beforeBrush && i.beforeBrush(t),
          i.brush(t, 0 === n ? null : this._temporaryDisplayables[n - 1]),
          i.afterBrush && i.afterBrush(t));
      }
      ((this._temporaryDisplayables = []), (this.notClear = !0));
    }));
  var Mg = [];
  ((ii.prototype.getBoundingRect = function () {
    if (!this._rect) {
      for (
        var t = new ee(1 / 0, 1 / 0, -1 / 0, -1 / 0), typeof_ = 0;
        typeof_ < this._displayables.length;
        typeof_++
      ) {
        var n = this._displayables[typeof_],
          i = n.getBoundingRect().clone();
        (n.needLocalTransform() && i.applyTransform(n.getLocalTransform(Mg)), t.union(i));
      }
      this._rect = t;
    }
    return this._rect;
  }),
    (ii.prototype.contain = function (t, e) {
      var n = this.transformCoordToLocal(t, e);
      if (this.getBoundingRect().contain(n[0], n[1]))
        for (var i = 0; i < this._displayables.length; i++)
          if (this._displayables[i].contain(t, e)) return !0;
      return !1;
    }),
    u(ii, je));
  var Ig = Math.round,
    Tg = Math.max,
    Ag = Math.min,
    Cg = {},
    Dg = 1,
    kg = R(),
    Pg = 0,
    Lg = (Object.freeze || Object)({
      Z2_EMPHASIS_LIFT: Dg,
      extendShape: ri,
      extendPath: function (t, e) {
        return (function (t, e) {
          return qn.extend(Kn(t, e));
        })(t, e);
      },
      makePath: oi,
      makeImage: ai,
      mergePath: function (t, e) {
        for (var n = [], i = t.length, r = 0; r < i; r++) {
          var o = t[r];
          (o.path || o.createPathProxy(),
            o.__dirtyPath && o.buildPath(o.path, o.shape, !0),
            n.push(o.path));
        }
        var a = new qn(e);
        return (
          a.createPathProxy(),
          (a.buildPath = function (t) {
            t.appendPath(n);
            var typeof_ = t.getContext();
            typeof_ && t.rebuildPath(typeof_);
          }),
          a
        );
      },
      resizePath: li,
      subPixelOptimizeLine: hi,
      subPixelOptimizeRect: ui,
      subPixelOptimize: ci,
      setElementHoverStyle: vi,
      isInEmphasis: yi,
      setHoverStyle: Si,
      setAsHoverStyleTrigger: Mi,
      setLabelStyle: Ii,
      setTextStyle: Ti,
      setText: function (t, e, n) {
        var i,
          r = {
            isRectText: !0,
          };
        (!1 === n ? (i = !0) : (r.autoColor = n), Ai(t, e, r, i));
      },
      getFont: Li,
      updateProps: zi,
      initProps: Ei,
      getTransform: Ni,
      applyTransform: Ri,
      transformDirection: Bi,
      groupTransition: Fi,
      clipPointsByRect: Vi,
      clipRectByRect: function (t, e) {
        var n = Tg(t.x, e.x),
          i = Ag(t.x + t.width, e.x + e.width),
          r = Tg(t.y, e.y),
          o = Ag(t.y + t.height, e.y + e.height);
        if (i >= n && o >= r)
          return {
            x: n,
            y: r,
            width: i - n,
            height: o - r,
          };
      },
      createIcon: Hi,
      Group: qd,
      Image: qe,
      Text: ng,
      Circle: ig,
      Sector: ag,
      Ring: sg,
      Polygon: ug,
      Polyline: cg,
      Rect: pg,
      Line: mg,
      BezierCurve: yg,
      Arc: xg,
      IncrementalDisplayable: ii,
      CompoundPath: _g,
      LinearGradient: bg,
      RadialGradient: Sg,
      BoundingRect: ee,
    }),
    Og = ["textStyle", "color"],
    zg = {
      getTextColor: function (t) {
        var typeof_ = this.ecModel;
        return this.getShallow("color") || (!t && typeof_ ? typeof_.get(Og) : null);
      },
      getFont: function () {
        return Li(
          {
            fontStyle: this.getShallow("fontStyle"),
            fontWeight: this.getShallow("fontWeight"),
            fontSize: this.getShallow("fontSize"),
            fontFamily: this.getShallow("fontFamily"),
          },
          this.ecModel,
        );
      },
      getTextRect: function (t) {
        return ye(
          t,
          this.getFont(),
          this.getShallow("align"),
          this.getShallow("verticalAlign") || this.getShallow("baseline"),
          this.getShallow("padding"),
          this.getShallow("rich"),
          this.getShallow("truncateText"),
        );
      },
    },
    Eg = qf([
      ["fill", "color"],
      ["stroke", "borderColor"],
      ["lineWidth", "borderWidth"],
      ["opacity"],
      ["shadowBlur"],
      ["shadowOffsetX"],
      ["shadowOffsetY"],
      ["shadowColor"],
      ["textPosition"],
      ["textAlign"],
    ]),
    Ng = {
      getItemStyle: function (t, e) {
        var n = Eg(this, t, e),
          i = this.getBorderLineDash();
        return (i && (n.lineDash = i), n);
      },
      getBorderLineDash: function () {
        var t = this.get("borderType");
        return "solid" === t || null == t ? null : "dashed" === t ? [5, 5] : [1, 1];
      },
    },
    Rg = c,
    Bg = dn();
  ((Wi.prototype = {
    constructor: Wi,
    init: null,
    mergeOption: function (t) {
      r(this.option, t, !0);
    },
    get: function (t, e) {
      return null == t ? this.option : Gi(this.option, this.parsePath(t), !e && Zi(this, t));
    },
    getShallow: function (t, e) {
      var n = this.option,
        i = null == n ? n : n[t],
        r = !e && Zi(this, t);
      return (null == i && r && (i = r.getShallow(t)), i);
    },
    getModel: function (t, e) {
      var n;
      return new Wi(
        null == t ? this.option : Gi(this.option, (t = this.parsePath(t))),
        (e = e || ((n = Zi(this, t)) && n.getModel(t))),
        this.ecModel,
      );
    },
    isEmpty: function () {
      return null == this.option;
    },
    restoreData: function () {},
    clone: function () {
      return new (0, this.constructor)(i(this.option));
    },
    setReadOnly: function (t) {},
    parsePath: function (t) {
      return ("string" == typeof t && (t = t.split(".")), t);
    },
    customizeGetParent: function (t) {
      Bg(this).getParent = t;
    },
    isAnimationEnabled: function () {
      if (!Hc.node) {
        if (null != this.option.animation) return !!this.option.animation;
        if (this.parentModel) return this.parentModel.isAnimationEnabled();
      }
    },
  }),
    yn(Wi),
    xn(Wi),
    Rg(Wi, Kf),
    Rg(Wi, Jf),
    Rg(Wi, zg),
    Rg(Wi, Ng));
  var Fg = 0,
    Vg = 1e-4,
    Hg =
      /^(?:(\d{4})(?:[-\/](\d{1,2})(?:[-\/](\d{1,2})(?:[T ](\d{1,2})(?::(\d\d)(?::(\d\d)(?:[.,](\d+))?)?)?(Z|[\+\-]\d\d:?\d\d)?)?)?)?)?$/,
    Wg = (Object.freeze || Object)({
      linearMap: Xi,
      parsePercent: Yi,
      round: ji,
      asc: qi,
      getPrecision: $i,
      getPrecisionSafe: Ki,
      getPixelPrecision: Qi,
      getPercentWithPrecision: Ji,
      MAX_SAFE_INTEGER: 9007199254740991,
      remRadian: tr,
      isRadianAroundZero: er,
      parseDate: nr,
      quantity: ir,
      nice: or,
      quantile: function (t, e) {
        var n = (t.length - 1) * e + 1,
          i = Math.floor(n),
          r = +t[i - 1],
          o = n - i;
        return o ? r + o * (t[i] - r) : r;
      },
      reformIntervals: function (t) {
        function e(t, n, i) {
          return (
            t.interval[i] < n.interval[i] ||
            (t.interval[i] === n.interval[i] &&
              (t.close[i] - n.close[i] == (i ? -1 : 1) || (!i && e(t, n, 1))))
          );
        }
        t.sort(function (t, n) {
          return e(t, n, 0) ? -1 : 1;
        });
        for (var n = -1 / 0, i = 1, r = 0; r < t.length;) {
          for (var o = t[r].interval, a = t[r].close, s = 0; s < 2; s++)
            (o[s] <= n && ((o[s] = n), (a[s] = s ? 1 : 1 - i)), (n = o[s]), (i = a[s]));
          o[0] === o[1] && a[0] * a[1] != 1 ? t.splice(r, 1) : r++;
        }
        return t;
      },
      isNumeric: function (t) {
        return t - parseFloat(t) >= 0;
      },
    }),
    Gg = P,
    Zg = /([&<>"'])/g,
    Ug = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    },
    Xg = ["a", "b", "c", "d", "e", "f", "g"],
    Yg = function (t, e) {
      return "{" + t + (null == e ? "" : e) + "}";
    },
    jg = be,
    qg = ye,
    $g = (Object.freeze || Object)({
      addCommas: ar,
      toCamelCase: sr,
      normalizeCssArray: Gg,
      encodeHTML: lr,
      formatTpl: hr,
      formatTplSimple: function (t, e, n) {
        return (
          f(e, function (e, i) {
            t = t.replace("{" + i + "}", n ? lr(e) : e);
          }),
          t
        );
      },
      getTooltipMarker: ur,
      formatTime: dr,
      capitalFirst: fr,
      truncateText: jg,
      getTextRect: qg,
    }),
    Kg = f,
    Qg = ["left", "right", "top", "bottom", "width", "height"],
    Jg = [
      ["width", "left", "right"],
      ["height", "top", "bottom"],
    ],
    tm = pr,
    em =
      (y(pr, "vertical"),
      y(pr, "horizontal"),
      {
        getBoxLayoutParams: function () {
          return {
            left: this.get("left"),
            top: this.get("top"),
            right: this.get("right"),
            bottom: this.get("bottom"),
            width: this.get("width"),
            height: this.get("height"),
          };
        },
      }),
    nm = dn(),
    im = Wi.extend({
      type: "component",
      id: "",
      name: "",
      mainType: "",
      subType: "",
      componentIndex: 0,
      defaultOption: null,
      ecModel: null,
      dependentModels: [],
      uid: null,
      layoutMode: null,
      $constructor: function (t, e, n, i) {
        (Wi.call(this, t, e, n, i), (this.uid = Ui("ec_cpt_model")));
      },
      init: function (t, e, n, i) {
        this.mergeDefaultAndTheme(t, n);
      },
      mergeDefaultAndTheme: function (t, e) {
        var n = this.layoutMode,
          i = n ? yr(t) : {};
        (r(t, e.getTheme().get(this.mainType)), r(t, this.getDefaultOption()), n && vr(t, i, n));
      },
      mergeOption: function (t, e) {
        r(this.option, t, !0);
        var n = this.layoutMode;
        n && vr(this.option, t, n);
      },
      optionUpdated: function (t, e) {},
      getDefaultOption: function () {
        var t = nm(this);
        if (!t.defaultOption) {
          for (var typeof_ = [], n = this.constructor; n;) {
            var i = n.prototype.defaultOption;
            (i && typeof_.push(i), (n = n.superClass));
          }
          for (var o = {}, a = typeof_.length - 1; a >= 0; a--) o = r(o, typeof_[a], !0);
          t.defaultOption = o;
        }
        return t.defaultOption;
      },
      getReferringComponents: function (t) {
        return this.ecModel.queryComponents({
          mainType: t,
          index: this.get(t + "Index", !0),
          id: this.get(t + "Id", !0),
        });
      },
    });
  (bn(im, {
    registerWhenExtend: !0,
  }),
    (function (t) {
      var typeof_ = {};
      ((t.registerSubTypeDefaulter = function (t, n) {
        ((t = vn(t)), (typeof_[t.main] = n));
      }),
        (t.determineSubType = function (n, i) {
          var r = i.type;
          if (!r) {
            var o = vn(n).main;
            t.hasSubTypes(n) && typeof_[o] && (r = typeof_[o](i));
          }
          return r;
        }));
    })(im),
    (function (t, e) {
      function n(t) {
        var typeof_ = {},
          n = [];
        return (
          f(t, function (r) {
            var o = i(typeof_, r),
              a = (function (t, e) {
                var n = [];
                return (
                  f(t, function (t) {
                    h(e, t) >= 0 && n.push(t);
                  }),
                  n
                );
              })(
                (o.originalDeps = (function (t) {
                  var typeof_ = [];
                  return (
                    f(im.getClassesByMainType(t), function (t) {
                      e = typeof_.concat(t.prototype.dependencies || []);
                    }),
                    (e = p(typeof_, function (t) {
                      return vn(t).main;
                    })),
                    "dataset" !== t && h(typeof_, "dataset") <= 0 && typeof_.unshift("dataset"),
                    typeof_
                  );
                })(r)),
                t,
              );
            ((o.entryCount = a.length),
              0 === o.entryCount && n.push(r),
              f(a, function (t) {
                h(o.predecessor, t) < 0 && o.predecessor.push(t);
                var n = i(typeof_, t);
                h(n.successor, t) < 0 && n.successor.push(r);
              }));
          }),
          {
            graph: typeof_,
            noEntryList: n,
          }
        );
      }
      function i(t, e) {
        return (
          t[e] ||
            (t[e] = {
              predecessor: [],
              successor: [],
            }),
          t[e]
        );
      }
      t.topologicalTravel = function (t, e, i, r) {
        function o(t) {
          (s[t].entryCount--, 0 === s[t].entryCount && l.push(t));
        }
        if (t.length) {
          var a = n(e),
            s = a.graph,
            l = a.noEntryList,
            h = {};
          for (
            f(t, function (t) {
              h[t] = !0;
            });
            l.length;
          ) {
            var u = l.pop(),
              c = s[u],
              d = !!h[u];
            (d && (i.call(r, u, c.originalDeps.slice()), delete h[u]),
              f(
                c.successor,
                d
                  ? function (t) {
                      ((h[t] = !0), o(t));
                    }
                  : o,
              ));
          }
          f(h, function () {
            throw new Error("Circle dependency may exists");
          });
        }
      };
    })(im),
    c(im, em));
  var rm = "";
  "undefined" != typeof navigator && (rm = navigator.platform || "");
  var om = {
      color: [
        "#c23531",
        "#2f4554",
        "#61a0a8",
        "#d48265",
        "#91c7ae",
        "#749f83",
        "#ca8622",
        "#bda29a",
        "#6e7074",
        "#546570",
        "#c4ccd3",
      ],
      gradientColor: ["#f6efa6", "#d88273", "#bf444c"],
      textStyle: {
        fontFamily: rm.match(/^Win/) ? "Microsoft YaHei" : "sans-serif",
        fontSize: 12,
        fontStyle: "normal",
        fontWeight: "normal",
      },
      blendMode: null,
      animation: "auto",
      animationDuration: 1e3,
      animationDurationUpdate: 300,
      animationEasing: "exponentialOut",
      animationEasingUpdate: "cubicOut",
      animationThreshold: 2e3,
      progressiveThreshold: 3e3,
      progressive: 400,
      hoverLayerThreshold: 3e3,
      useUTC: !1,
    },
    am = dn(),
    sm = {
      clearColorPalette: function () {
        ((am(this).colorIdx = 0), (am(this).colorNameMap = {}));
      },
      getColorFromPalette: function (t, e, n) {
        var i = am((e = e || this)),
          r = i.colorIdx || 0,
          o = (i.colorNameMap = i.colorNameMap || {});
        if (o.hasOwnProperty(t)) return o[t];
        var a = rn(this.get("color", !0)),
          s = this.get("colorLayer", !0),
          l =
            null != n && s
              ? (function (t, e) {
                  for (var n = t.length, i = 0; i < n; i++) if (t[i].length > e) return t[i];
                  return t[n - 1];
                })(s, n)
              : a;
        if ((l = l || a) && l.length) {
          var h = l[r];
          return (t && (o[t] = h), (i.colorIdx = (r + 1) % l.length), h);
        }
      },
    },
    lm = {
      cartesian2d: function (t, e, n, i) {
        var r = t.getReferringComponents("xAxis")[0],
          o = t.getReferringComponents("yAxis")[0];
        ((e.coordSysDims = ["x", "y"]),
          n.set("x", r),
          n.set("y", o),
          wr(r) && (i.set("x", r), (e.firstCategoryDimIndex = 0)),
          wr(o) && (i.set("y", o), (e.firstCategoryDimIndex = 1)));
      },
      singleAxis: function (t, e, n, i) {
        var r = t.getReferringComponents("singleAxis")[0];
        ((e.coordSysDims = ["single"]),
          n.set("single", r),
          wr(r) && (i.set("single", r), (e.firstCategoryDimIndex = 0)));
      },
      polar: function (t, e, n, i) {
        var r = t.getReferringComponents("polar")[0],
          o = r.findAxisModel("radiusAxis"),
          a = r.findAxisModel("angleAxis");
        ((e.coordSysDims = ["radius", "angle"]),
          n.set("radius", o),
          n.set("angle", a),
          wr(o) && (i.set("radius", o), (e.firstCategoryDimIndex = 0)),
          wr(a) && (i.set("angle", a), (e.firstCategoryDimIndex = 1)));
      },
      geo: function (t, e, n, i) {
        e.coordSysDims = ["lng", "lat"];
      },
      parallel: function (t, e, n, i) {
        var r = t.ecModel,
          o = r.getComponent("parallel", t.get("parallelIndex")),
          a = (e.coordSysDims = o.dimensions.slice());
        f(o.parallelAxisIndex, function (t, o) {
          var s = r.getComponent("parallelAxis", t),
            l = a[o];
          (n.set(l, s),
            wr(s) &&
              null == e.firstCategoryDimIndex &&
              (i.set(l, s), (e.firstCategoryDimIndex = o)));
        });
      },
    },
    hm = "original",
    um = "arrayRows",
    cm = "objectRows",
    dm = "keyedColumns",
    fm = "unknown",
    pm = "typedArray",
    gm = "column",
    mm = "row";
  ((br.seriesDataToSource = function (t) {
    return new br({
      data: t,
      sourceFormat: M(t) ? pm : hm,
      fromDataset: !1,
    });
  }),
    xn(br));
  var vm = dn(),
    ym = "\0_ec_inner",
    xm = Wi.extend({
      init: function (t, e, n, i) {
        ((n = n || {}), (this.option = null), (this._theme = new Wi(n)), (this._optionManager = i));
      },
      setOption: function (t, e) {
        (L(!(ym in t), "please use chart.getOption()"),
          this._optionManager.setOption(t, e),
          this.resetOption(null));
      },
      resetOption: function (t) {
        var typeof_ = !1,
          n = this._optionManager;
        if (!t || "recreate" === t) {
          var i = n.mountOption("recreate" === t);
          (this.option && "recreate" !== t
            ? (this.restoreData(), this.mergeOption(i))
            : Cr.call(this, i),
            (e = !0));
        }
        if (
          (("timeline" !== t && "media" !== t) || this.restoreData(),
          !t || "recreate" === t || "timeline" === t)
        ) {
          var r = n.getTimelineOption(this);
          r && (this.mergeOption(r), (e = !0));
        }
        if (!t || "recreate" === t || "media" === t) {
          var o = n.getMediaOption(this, this._api);
          o.length &&
            f(
              o,
              function (t) {
                this.mergeOption(t, (e = !0));
              },
              this,
            );
        }
        return typeof_;
      },
      mergeOption: function (t) {
        var typeof_ = this.option,
          n = this._componentsMap,
          o = [];
        ((function (t) {
          vm(t).datasetMap = R();
        })(this),
          f(t, function (t, n) {
            null != t &&
              (im.hasClass(n)
                ? n && o.push(n)
                : (typeof_[n] = null == typeof_[n] ? i(t) : r(typeof_[n], t, !0)));
          }),
          im.topologicalTravel(
            o,
            im.getAllClassMainTypes(),
            function (i, r) {
              var o = rn(t[i]),
                s = sn(n.get(i), o);
              (ln(s),
                f(s, function (t, e) {
                  var n = t.option;
                  b(n) &&
                    ((t.keyInfo.mainType = i),
                    (t.keyInfo.subType = (function (t, e, n) {
                      return e.type ? e.type : n ? n.subType : im.determineSubType(t, e);
                    })(i, n, t.exist)));
                }));
              var l = (function (t, e) {
                x(e) || (e = e ? [e] : []);
                var n = {};
                return (
                  f(e, function (e) {
                    n[e] = (t.get(e) || []).slice();
                  }),
                  n
                );
              })(n, r);
              ((typeof_[i] = []),
                n.set(i, []),
                f(
                  s,
                  function (t, r) {
                    var o = t.exist,
                      s = t.option;
                    if ((L(b(s) || o, "Empty component definition"), s)) {
                      var h = im.getClass(i, t.keyInfo.subType, !0);
                      if (o && o instanceof h)
                        ((o.name = t.keyInfo.name), o.mergeOption(s, this), o.optionUpdated(s, !1));
                      else {
                        var u = a(
                          {
                            dependentModels: l,
                            componentIndex: r,
                          },
                          t.keyInfo,
                        );
                        (a((o = new h(s, this, this, u)), u),
                          o.init(s, this, this, u),
                          o.optionUpdated(null, !0));
                      }
                    } else (o.mergeOption({}, this), o.optionUpdated({}, !1));
                    ((n.get(i)[r] = o), (typeof_[i][r] = o.option));
                  },
                  this,
                ),
                "series" === i && Dr(this, n.get("series")));
            },
            this,
          ),
          (this._seriesIndicesMap = R((this._seriesIndices = this._seriesIndices || []))));
      },
      getOption: function () {
        var t = i(this.option);
        return (
          f(t, function (e, n) {
            if (im.hasClass(n)) {
              for (var i = (e = rn(e)).length - 1; i >= 0; i--) un(e[i]) && e.splice(i, 1);
              t[n] = e;
            }
          }),
          delete t[ym],
          t
        );
      },
      getTheme: function () {
        return this._theme;
      },
      getComponent: function (t, e) {
        var n = this._componentsMap.get(t);
        if (n) return n[e || 0];
      },
      queryComponents: function (t) {
        var typeof_ = t.mainType;
        if (!typeof_) return [];
        var n,
          i = t.index,
          r = t.id,
          o = t.name,
          a = this._componentsMap.get(typeof_);
        if (!a || !a.length) return [];
        if (null != i)
          (x(i) || (i = [i]),
            (n = m(
              p(i, function (t) {
                return a[t];
              }),
              function (t) {
                return !!t;
              },
            )));
        else if (null != r) {
          var s = x(r);
          n = m(a, function (t) {
            return (s && h(r, t.id) >= 0) || (!s && t.id === r);
          });
        } else if (null != o) {
          var l = x(o);
          n = m(a, function (t) {
            return (l && h(o, t.name) >= 0) || (!l && t.name === o);
          });
        } else n = a.slice();
        return kr(n, t);
      },
      findComponents: function (t) {
        var typeof_ = t.query,
          n = t.mainType,
          i = (function (t) {
            var typeof_ = n + "Index",
              i = n + "Id",
              r = n + "Name";
            return !t || (null == t[typeof_] && null == t[i] && null == t[r])
              ? null
              : {
                  mainType: n,
                  index: t[typeof_],
                  id: t[i],
                  name: t[r],
                };
          })(typeof_);
        return (function (e) {
          return t.filter ? m(e, t.filter) : e;
        })(kr(i ? this.queryComponents(i) : this._componentsMap.get(n), t));
      },
      eachComponent: function (t, e, n) {
        var i = this._componentsMap;
        "function" == typeof t
          ? ((n = e),
            (e = t),
            i.each(function (t, i) {
              f(t, function (t, r) {
                e.call(n, i, t, r);
              });
            }))
          : w(t)
            ? f(i.get(t), e, n)
            : b(t) && f(this.findComponents(t), e, n);
      },
      getSeriesByName: function (t) {
        return m(this._componentsMap.get("series"), function (e) {
          return e.name === t;
        });
      },
      getSeriesByIndex: function (t) {
        return this._componentsMap.get("series")[t];
      },
      getSeriesByType: function (t) {
        return m(this._componentsMap.get("series"), function (e) {
          return e.subType === t;
        });
      },
      getSeries: function () {
        return this._componentsMap.get("series").slice();
      },
      getSeriesCount: function () {
        return this._componentsMap.get("series").length;
      },
      eachSeries: function (t, e) {
        f(
          this._seriesIndices,
          function (n) {
            var i = this._componentsMap.get("series")[n];
            t.call(e, i, n);
          },
          this,
        );
      },
      eachRawSeries: function (t, e) {
        f(this._componentsMap.get("series"), t, e);
      },
      eachSeriesByType: function (t, e, n) {
        f(
          this._seriesIndices,
          function (i) {
            var r = this._componentsMap.get("series")[i];
            r.subType === t && e.call(n, r, i);
          },
          this,
        );
      },
      eachRawSeriesByType: function (t, e, n) {
        return f(this.getSeriesByType(t), e, n);
      },
      isSeriesFiltered: function (t) {
        return null == this._seriesIndicesMap.get(t.componentIndex);
      },
      getCurrentSeriesIndices: function () {
        return (this._seriesIndices || []).slice();
      },
      filterSeries: function (t, e) {
        Dr(this, m(this._componentsMap.get("series"), t, e));
      },
      restoreData: function (t) {
        var typeof_ = this._componentsMap;
        Dr(this, typeof_.get("series"));
        var n = [];
        (typeof_.each(function (t, e) {
          n.push(e);
        }),
          im.topologicalTravel(n, im.getAllClassMainTypes(), function (n, i) {
            f(typeof_.get(n), function (e) {
              ("series" !== n ||
                !(function (t, e) {
                  if (e) {
                    var n = e.seiresIndex,
                      i = e.seriesId,
                      r = e.seriesName;
                    return (
                      (null != n && t.componentIndex !== n) ||
                      (null != i && t.id !== i) ||
                      (null != r && t.name !== r)
                    );
                  }
                })(e, t)) &&
                e.restoreData();
            });
          }));
      },
    });
  c(xm, sm);
  var _m = [
      "getDom",
      "getZr",
      "getWidth",
      "getHeight",
      "getDevicePixelRatio",
      "dispatchAction",
      "isDisposed",
      "on",
      "off",
      "getDataURL",
      "getConnectedDataURL",
      "getModel",
      "getOption",
      "getViewOfComponentModel",
      "getViewOfSeriesModel",
    ],
    wm = {};
  ((Lr.prototype = {
    constructor: Lr,
    create: function (t, e) {
      var n = [];
      (f(wm, function (i, r) {
        var o = i.create(t, e);
        n = n.concat(o || []);
      }),
        (this._coordinateSystems = n));
    },
    update: function (t, e) {
      f(this._coordinateSystems, function (n) {
        n.update && n.update(t, e);
      });
    },
    getCoordinateSystems: function () {
      return this._coordinateSystems.slice();
    },
  }),
    (Lr.register = function (t, e) {
      wm[t] = e;
    }),
    (Lr.get = function (t) {
      return wm[t];
    }));
  var bm = f,
    Sm = i,
    Mm = p,
    Im = r,
    Tm = /^(min|max)?(.+)$/;
  Or.prototype = {
    constructor: Or,
    setOption: function (t, e) {
      (t &&
        f(rn(t.series), function (t) {
          t && t.data && M(t.data) && z(t.data);
        }),
        (t = Sm(t, !0)));
      var n = this._optionBackup,
        i = zr.call(this, t, e, !n);
      ((this._newBaseOption = i.baseOption),
        n
          ? ((function (t, e) {
              bm((e = e || {}), function (e, n) {
                if (null != e) {
                  var i = t[n];
                  if (im.hasClass(n)) {
                    e = rn(e);
                    var r = sn((i = rn(i)), e);
                    t[n] = Mm(r, function (t) {
                      return t.option && t.exist ? Im(t.exist, t.option, !0) : t.exist || t.option;
                    });
                  } else t[n] = Im(i, e, !0);
                }
              });
            })(n.baseOption, i.baseOption),
            i.timelineOptions.length && (n.timelineOptions = i.timelineOptions),
            i.mediaList.length && (n.mediaList = i.mediaList),
            i.mediaDefault && (n.mediaDefault = i.mediaDefault))
          : (this._optionBackup = i));
    },
    mountOption: function (t) {
      var typeof_ = this._optionBackup;
      return (
        (this._timelineOptions = Mm(typeof_.timelineOptions, Sm)),
        (this._mediaList = Mm(typeof_.mediaList, Sm)),
        (this._mediaDefault = Sm(typeof_.mediaDefault)),
        (this._currentMediaIndices = []),
        Sm(t ? typeof_.baseOption : this._newBaseOption)
      );
    },
    getTimelineOption: function (t) {
      var typeof_,
        n = this._timelineOptions;
      if (n.length) {
        var i = t.getComponent("timeline");
        i && (e = Sm(n[i.getCurrentIndex()], !0));
      }
      return typeof_;
    },
    getMediaOption: function (t) {
      var typeof_ = this._api.getWidth(),
        n = this._api.getHeight(),
        i = this._mediaList,
        r = this._mediaDefault,
        o = [],
        a = [];
      if (!i.length && !r) return a;
      for (var s = 0, l = i.length; s < l; s++) Er(i[s].query, typeof_, n) && o.push(s);
      return (
        !o.length && r && (o = [-1]),
        o.length &&
          !(function (t, e) {
            return t.join(",") === e.join(",");
          })(o, this._currentMediaIndices) &&
          (a = Mm(o, function (t) {
            return Sm(-1 === t ? r.option : i[t].option);
          })),
        (this._currentMediaIndices = o),
        a
      );
    },
  };
  var Am = f,
    Cm = b,
    Dm = ["areaStyle", "lineStyle", "nodeStyle", "linkStyle", "chordStyle", "label", "labelLine"],
    km = function (t, e) {
      Am(Hr(t.series), function (t) {
        Cm(t) &&
          (function (t) {
            if (Cm(t)) {
              (Nr(t),
                Br(t),
                Fr(t, "label"),
                Fr(t, "upperLabel"),
                Fr(t, "edgeLabel"),
                t.emphasis &&
                  (Fr(t.emphasis, "label"),
                  Fr(t.emphasis, "upperLabel"),
                  Fr(t.emphasis, "edgeLabel")));
              var typeof_ = t.markPoint;
              typeof_ && (Nr(typeof_), Vr(typeof_));
              var n = t.markLine;
              n && (Nr(n), Vr(n));
              var i = t.markArea;
              i && Vr(i);
              var r = t.data;
              if ("graph" === t.type) {
                r = r || t.nodes;
                var o = t.links || t.edges;
                if (o && !M(o)) for (s = 0; s < o.length; s++) Vr(o[s]);
                f(t.categories, function (t) {
                  Br(t);
                });
              }
              if (r && !M(r)) for (s = 0; s < r.length; s++) Vr(r[s]);
              if ((e = t.markPoint) && typeof_.data)
                for (var a = typeof_.data, s = 0; s < a.length; s++) Vr(a[s]);
              if ((n = t.markLine) && n.data) {
                var l = n.data;
                for (s = 0; s < l.length; s++) x(l[s]) ? (Vr(l[s][0]), Vr(l[s][1])) : Vr(l[s]);
              }
              "gauge" === t.type
                ? (Fr(t, "axisLabel"), Fr(t, "title"), Fr(t, "detail"))
                : "treemap" === t.type
                  ? (Rr(t.breadcrumb, "itemStyle"),
                    f(t.levels, function (t) {
                      Br(t);
                    }))
                  : "tree" === t.type && Br(t.leaves);
            }
          })(t);
      });
      var n = ["xAxis", "yAxis", "radiusAxis", "angleAxis", "singleAxis", "parallelAxis", "radar"];
      (e && n.push("valueAxis", "categoryAxis", "logAxis", "timeAxis"),
        Am(n, function (e) {
          Am(Hr(t[e]), function (t) {
            t && (Fr(t, "axisLabel"), Fr(t.axisPointer, "label"));
          });
        }),
        Am(Hr(t.parallel), function (t) {
          var typeof_ = t && t.parallelAxisDefault;
          (Fr(typeof_, "axisLabel"), Fr(typeof_ && typeof_.axisPointer, "label"));
        }),
        Am(Hr(t.calendar), function (t) {
          (Rr(t, "itemStyle"), Fr(t, "dayLabel"), Fr(t, "monthLabel"), Fr(t, "yearLabel"));
        }),
        Am(Hr(t.radar), function (t) {
          Fr(t, "name");
        }),
        Am(Hr(t.geo), function (t) {
          Cm(t) &&
            (Vr(t),
            Am(Hr(t.regions), function (t) {
              Vr(t);
            }));
        }),
        Am(Hr(t.timeline), function (t) {
          (Vr(t), Rr(t, "label"), Rr(t, "itemStyle"), Rr(t, "controlStyle", !0));
          var typeof_ = t.data;
          x(typeof_) &&
            f(typeof_, function (t) {
              b(t) && (Rr(t, "label"), Rr(t, "itemStyle"));
            });
        }),
        Am(Hr(t.toolbox), function (t) {
          (Rr(t, "iconStyle"),
            Am(t.feature, function (t) {
              Rr(t, "iconStyle");
            }));
        }),
        Fr(Wr(t.axisPointer), "label"),
        Fr(Wr(t.tooltip).axisPointer, "label"));
    },
    Pm = [
      ["x", "left"],
      ["y", "top"],
      ["x2", "right"],
      ["y2", "bottom"],
    ],
    Lm = [
      "grid",
      "geo",
      "parallel",
      "legend",
      "toolbox",
      "title",
      "visualMap",
      "dataZoom",
      "timeline",
    ],
    Om = function (t, e) {
      (km(t, e),
        (t.series = rn(t.series)),
        f(t.series, function (t) {
          if (b(t)) {
            var typeof_ = t.type;
            if (
              (("pie" !== typeof_ && "gauge" !== typeof_) ||
                (null != t.clockWise && (t.clockwise = t.clockWise)),
              "gauge" === typeof_)
            ) {
              var n = (function (t, e) {
                e = e.split(",");
                for (var n = t, i = 0; i < e.length && null != (n = n && n[e[i]]); i++);
                return n;
              })(t, "pointer.color");
              null != n &&
                (function (t, e, n, i) {
                  e = e.split(",");
                  for (var r, o = t, a = 0; a < e.length - 1; a++)
                    (null == o[(r = e[a])] && (o[r] = {}), (o = o[r]));
                  (i || null == o[e[a]]) && (o[e[a]] = n);
                })(t, "itemStyle.normal.color", n);
            }
            Gr(t);
          }
        }),
        t.dataRange && (t.visualMap = t.dataRange),
        f(Lm, function (e) {
          var n = t[e];
          n &&
            (x(n) || (n = [n]),
            f(n, function (t) {
              Gr(t);
            }));
        }));
    },
    zm = Ur.prototype;
  ((zm.pure = !1),
    (zm.persistent = !0),
    (zm.getSource = function () {
      return this._source;
    }));
  var Em = {
      arrayRows_column: {
        pure: !0,
        count: function () {
          return Math.max(0, this._data.length - this._source.startIndex);
        },
        getItem: function (t) {
          return this._data[t + this._source.startIndex];
        },
        appendData: jr,
      },
      arrayRows_row: {
        pure: !0,
        count: function () {
          var t = this._data[0];
          return t ? Math.max(0, t.length - this._source.startIndex) : 0;
        },
        getItem: function (t) {
          t += this._source.startIndex;
          for (var typeof_ = [], n = this._data, i = 0; i < n.length; i++) {
            var r = n[i];
            typeof_.push(r ? r[t] : null);
          }
          return typeof_;
        },
        appendData: function () {
          throw new Error('Do not support appendData when set seriesLayoutBy: "row".');
        },
      },
      objectRows: {
        pure: !0,
        count: Xr,
        getItem: Yr,
        appendData: jr,
      },
      keyedColumns: {
        pure: !0,
        count: function () {
          var t = this._source.dimensionsDefine[0].name,
            typeof_ = this._data[t];
          return typeof_ ? typeof_.length : 0;
        },
        getItem: function (t) {
          for (var typeof_ = [], n = this._source.dimensionsDefine, i = 0; i < n.length; i++) {
            var r = this._data[n[i].name];
            typeof_.push(r ? r[t] : null);
          }
          return typeof_;
        },
        appendData: function (t) {
          var typeof_ = this._data;
          f(t, function (t, n) {
            for (var i = typeof_[n] || (typeof_[n] = []), r = 0; r < (t || []).length; r++)
              i.push(t[r]);
          });
        },
      },
      original: {
        count: Xr,
        getItem: Yr,
        appendData: jr,
      },
      typedArray: {
        persistent: !1,
        pure: !0,
        count: function () {
          return this._data ? this._data.length / this._dimSize : 0;
        },
        getItem: function (t, e) {
          ((t -= this._offset), (e = e || []));
          for (var n = this._dimSize * t, i = 0; i < this._dimSize; i++) e[i] = this._data[n + i];
          return e;
        },
        appendData: function (t) {
          this._data = t;
        },
        clean: function () {
          ((this._offset += this.count()), (this._data = null));
        },
      },
    },
    Nm = {
      arrayRows: qr,
      objectRows: function (t, e, n, i) {
        return null != n ? t[i] : t;
      },
      keyedColumns: qr,
      original: function (t, e, n, i) {
        var r = an(t);
        return null != n && r instanceof Array ? r[n] : r;
      },
      typedArray: qr,
    },
    Rm = {
      arrayRows: $r,
      objectRows: function (t, e, n, i) {
        return Kr(t[e], this._dimensionInfos[e]);
      },
      keyedColumns: $r,
      original: function (t, e, n, i) {
        var r = t && (null == t.value ? t : t.value);
        return (
          !this._rawData.pure &&
            (function (t) {
              return Hf(t) && !(t instanceof Array);
            })(t) &&
            (this.hasItemOption = !0),
          Kr(r instanceof Array ? r[i] : r, this._dimensionInfos[e])
        );
      },
      typedArray: function (t, e, n, i) {
        return t[i];
      },
    },
    Bm = /\{@(.+?)\}/g,
    Fm = {
      getDataParams: function (t, e) {
        var n = this.getData(e),
          i = this.getRawValue(t, e),
          r = n.getRawIndex(t),
          o = n.getName(t),
          a = n.getRawDataItem(t),
          s = n.getItemVisual(t, "color"),
          l = this.ecModel.getComponent("tooltip"),
          h = mn(l && l.get("renderMode")),
          u = this.mainType,
          c = "series" === u;
        return {
          componentType: u,
          componentSubType: this.subType,
          componentIndex: this.componentIndex,
          seriesType: c ? this.subType : null,
          seriesIndex: this.seriesIndex,
          seriesId: c ? this.id : null,
          seriesName: c ? this.name : null,
          name: o,
          dataIndex: r,
          data: a,
          dataType: e,
          value: i,
          color: s,
          marker: ur({
            color: s,
            renderMode: h,
          }),
          $vars: ["seriesName", "name", "value"],
        };
      },
      getFormattedLabel: function (t, e, n, i, r) {
        e = e || "normal";
        var o = this.getData(n),
          a = o.getItemModel(t),
          s = this.getDataParams(t, n);
        null != i && s.value instanceof Array && (s.value = s.value[i]);
        var l = a.get(
          "normal" === e ? [r || "label", "formatter"] : [e, r || "label", "formatter"],
        );
        return "function" == typeof l
          ? ((s.status = e), l(s))
          : "string" == typeof l
            ? hr(l, s).replace(Bm, function (e, n) {
                var i = n.length;
                return (
                  "[" === n.charAt(0) && "]" === n.charAt(i - 1) && (n = +n.slice(1, i - 1)),
                  Qr(o, t, n)
                );
              })
            : void 0;
      },
      getRawValue: function (t, e) {
        return Qr(this.getData(e), t);
      },
      formatTooltip: function () {},
    },
    Vm = eo.prototype;
  Vm.perform = function (t) {
    function e(t) {
      return (!(t >= 1) && (t = 1), t);
    }
    var n,
      i = this._upstream,
      r = t && t.skip;
    if (this._dirty && i) {
      var o = this.context;
      o.data = o.outputData = i.context.outputData;
    }
    (this.__pipeline && (this.__pipeline.currentTask = this),
      this._plan && !r && (n = this._plan(this.context)));
    var a,
      s = e(this._modBy),
      l = this._modDataCount || 0,
      h = e(t && t.modBy),
      u = (t && t.modDataCount) || 0;
    ((s === h && l === u) || (n = "reset"),
      (this._dirty || "reset" === n) &&
        ((this._dirty = !1),
        (a = (function (t, e) {
          var n, i;
          ((t._dueIndex = t._outputDueEnd = t._dueEnd = 0),
            (t._settedOutputEnd = null),
            !e &&
              t._reset &&
              ((n = t._reset(t.context)) &&
                n.progress &&
                ((i = n.forceFirstProgress), (n = n.progress)),
              x(n) && !n.length && (n = null)),
            (t._progress = n),
            (t._modBy = t._modDataCount = null));
          var r = t._downstream;
          return (r && r.dirty(), i);
        })(this, r))),
      (this._modBy = h),
      (this._modDataCount = u));
    var c = t && t.step;
    if (
      ((this._dueEnd = i ? i._outputDueEnd : this._count ? this._count(this.context) : 1 / 0),
      this._progress)
    ) {
      var d = this._dueIndex,
        f = Math.min(null != c ? this._dueIndex + c : 1 / 0, this._dueEnd);
      if (!r && (a || d < f)) {
        var p = this._progress;
        if (x(p)) for (var g = 0; g < p.length; g++) no(this, p[g], d, f, h, u);
        else no(this, p, d, f, h, u);
      }
      this._dueIndex = f;
      var m = null != this._settedOutputEnd ? this._settedOutputEnd : f;
      this._outputDueEnd = m;
    } else
      this._dueIndex = this._outputDueEnd =
        null != this._settedOutputEnd ? this._settedOutputEnd : this._dueEnd;
    return this.unfinished();
  };
  var Hm = (function () {
    function t() {
      return i < n ? i++ : null;
    }
    function e() {
      var t = (i % a) * r + Math.ceil(i / a),
        typeof_ = i >= n ? null : t < o ? t : i;
      return (i++, typeof_);
    }
    var n,
      i,
      r,
      o,
      a,
      s = {
        reset: function (l, h, u, c) {
          ((i = l),
            (n = h),
            (r = u),
            (o = c),
            (a = Math.ceil(o / r)),
            (s.next = r > 1 && o > 0 ? e : t));
        },
      };
    return s;
  })();
  ((Vm.dirty = function () {
    ((this._dirty = !0), this._onDirty && this._onDirty(this.context));
  }),
    (Vm.unfinished = function () {
      return this._progress && this._dueIndex < this._dueEnd;
    }),
    (Vm.pipe = function (t) {
      (this._downstream !== t || this._dirty) &&
        ((this._downstream = t), (t._upstream = this), t.dirty());
    }),
    (Vm.dispose = function () {
      this._disposed ||
        (this._upstream && (this._upstream._downstream = null),
        this._downstream && (this._downstream._upstream = null),
        (this._dirty = !1),
        (this._disposed = !0));
    }),
    (Vm.getUpstream = function () {
      return this._upstream;
    }),
    (Vm.getDownstream = function () {
      return this._downstream;
    }),
    (Vm.setOutputEnd = function (t) {
      this._outputDueEnd = this._settedOutputEnd = t;
    }));
  var Wm = dn(),
    Gm = im.extend({
      type: "series.__base__",
      seriesIndex: 0,
      coordinateSystem: null,
      defaultOption: null,
      legendDataProvider: null,
      visualColorAccessPath: "itemStyle.color",
      layoutMode: null,
      init: function (t, e, n, i) {
        ((this.seriesIndex = this.componentIndex),
          (this.dataTask = to({
            count: ro,
            reset: oo,
          })),
          (this.dataTask.context = {
            model: this,
          }),
          this.mergeDefaultAndTheme(t, n),
          Sr(this));
        var r = this.getInitialData(t, n);
        (so(r, this),
          (this.dataTask.context.data = r),
          (Wm(this).dataBeforeProcessed = r),
          io(this));
      },
      mergeDefaultAndTheme: function (t, e) {
        var n = this.layoutMode,
          i = n ? yr(t) : {},
          o = this.subType;
        (im.hasClass(o) && (o += "Series"),
          r(t, e.getTheme().get(this.subType)),
          r(t, this.getDefaultOption()),
          on(t, "label", ["show"]),
          this.fillDataTextStyle(t.data),
          n && vr(t, i, n));
      },
      mergeOption: function (t, e) {
        ((t = r(this.option, t, !0)), this.fillDataTextStyle(t.data));
        var n = this.layoutMode;
        (n && vr(this.option, t, n), Sr(this));
        var i = this.getInitialData(t, e);
        (so(i, this),
          this.dataTask.dirty(),
          (this.dataTask.context.data = i),
          (Wm(this).dataBeforeProcessed = i),
          io(this));
      },
      fillDataTextStyle: function (t) {
        if (t && !M(t))
          for (var typeof_ = ["show"], n = 0; n < t.length; n++)
            t[n] && t[n].label && on(t[n], "label", typeof_);
      },
      getInitialData: function () {},
      appendData: function (t) {
        this.getRawData().appendData(t.data);
      },
      getData: function (t) {
        var typeof_ = ho(this);
        if (typeof_) {
          var n = typeof_.context.data;
          return null == t ? n : n.getLinkedData(t);
        }
        return Wm(this).data;
      },
      setData: function (t) {
        var typeof_ = ho(this);
        if (typeof_) {
          var n = typeof_.context;
          (n.data !== t && typeof_.modifyOutputEnd && typeof_.setOutputEnd(t.count()),
            (n.outputData = t),
            typeof_ !== this.dataTask && (n.data = t));
        }
        Wm(this).data = t;
      },
      getSource: function () {
        return (function (t) {
          return vm(t).source;
        })(this);
      },
      getRawData: function () {
        return Wm(this).dataBeforeProcessed;
      },
      getBaseAxis: function () {
        var t = this.coordinateSystem;
        return t && t.getBaseAxis && t.getBaseAxis();
      },
      formatTooltip: function (t, e, n, i) {
        var r = this,
          o = "html" === (i = i || "html") ? "<br/>" : "\n",
          a = "richText" === i,
          s = {},
          l = 0,
          h = this.getData(),
          u = h.mapDimension("defaultedTooltip", !0),
          c = u.length,
          d = this.getRawValue(t),
          p = x(d),
          m = h.getItemVisual(t, "color");
        (b(m) && m.colorStops && (m = (m.colorStops[0] || {}).color), (m = m || "transparent"));
        var v = (
            c > 1 || (p && !c)
              ? (function (n) {
                  function o(t, n) {
                    var o = h.getDimensionInfo(n);
                    if (o && !1 !== o.otherDims.tooltip) {
                      var u = o.type,
                        f = "sub" + r.seriesIndex + "at" + l,
                        p = ur({
                          color: m,
                          type: "subItem",
                          renderMode: i,
                          markerId: f,
                        }),
                        g = "string" == typeof p ? p : p.content,
                        v =
                          (c ? g + lr(o.displayName || "-") + ": " : "") +
                          lr(
                            "ordinal" === u
                              ? t + ""
                              : "time" === u
                                ? e
                                  ? ""
                                  : dr("yyyy/MM/dd hh:mm:ss", t)
                                : ar(t),
                          );
                      (v && d.push(v), a && ((s[f] = m), ++l));
                    }
                  }
                  var c = g(
                      n,
                      function (t, e, n) {
                        var i = h.getDimensionInfo(n);
                        return t | (i && !1 !== i.tooltip && null != i.displayName);
                      },
                      0,
                    ),
                    d = [];
                  u.length
                    ? f(u, function (e) {
                        o(Qr(h, t, e), e);
                      })
                    : f(n, o);
                  var p = c ? (a ? "\n" : "<br/>") : "",
                    v = p + d.join(p || ", ");
                  return {
                    renderMode: i,
                    content: v,
                    style: s,
                  };
                })(d)
              : (function (t) {
                  return {
                    renderMode: i,
                    content: lr(ar(t)),
                    style: s,
                  };
                })(c ? Qr(h, t, u[0]) : p ? d[0] : d)
          ).content,
          y = r.seriesIndex + "at" + l,
          _ = ur({
            color: m,
            type: "item",
            renderMode: i,
            markerId: y,
          });
        ((s[y] = m), ++l);
        var w = h.getName(t),
          S = this.name;
        (hn(this) || (S = ""), (S = S ? lr(S) + (e ? ": " : o) : ""));
        var M = "string" == typeof _ ? _ : _.content;
        return {
          html: e ? M + S + v : S + M + (w ? lr(w) + ": " + v : v),
          markers: s,
        };
      },
      isAnimationEnabled: function () {
        if (Hc.node) return !1;
        var t = this.getShallow("animation");
        return (t && this.getData().count() > this.getShallow("animationThreshold") && (t = !1), t);
      },
      restoreData: function () {
        this.dataTask.dirty();
      },
      getColorFromPalette: function (t, e, n) {
        var i = this.ecModel,
          r = sm.getColorFromPalette.call(this, t, e, n);
        return (r || (r = i.getColorFromPalette(t, e, n)), r);
      },
      coordDimToDataDim: function (t) {
        return this.getRawData().mapDimension(t, !0);
      },
      getProgressive: function () {
        return this.get("progressive");
      },
      getProgressiveThreshold: function () {
        return this.get("progressiveThreshold");
      },
      getAxisTooltipData: null,
      getTooltipPosition: null,
      pipeTask: null,
      preventIncremental: null,
      pipelineContext: null,
    });
  (c(Gm, Fm), c(Gm, sm));
  var Zm = function () {
    ((this.group = new qd()), (this.uid = Ui("viewComponent")));
  };
  Zm.prototype = {
    constructor: Zm,
    init: function (t, e) {},
    render: function (t, e, n, i) {},
    dispose: function () {},
    filterForExposedEvent: null,
  };
  var Um = Zm.prototype;
  ((Um.updateView = Um.updateLayout = Um.updateVisual = function (t, e, n, i) {}),
    yn(Zm),
    bn(Zm, {
      registerWhenExtend: !0,
    }));
  var Xm = function () {
      var t = dn();
      return function (e) {
        var n = t(e),
          i = e.pipelineContext,
          r = n.large,
          o = n.progressiveRender,
          a = (n.large = i.large),
          s = (n.progressiveRender = i.progressiveRender);
        return !!(r ^ a || o ^ s) && "reset";
      };
    },
    Ym = dn(),
    jm = Xm();
  uo.prototype = {
    type: "chart",
    init: function (t, e) {},
    render: function (t, e, n, i) {},
    highlight: function (t, e, n, i) {
      fo(t.getData(), i, "emphasis");
    },
    downplay: function (t, e, n, i) {
      fo(t.getData(), i, "normal");
    },
    remove: function (t, e) {
      this.group.removeAll();
    },
    dispose: function () {},
    incrementalPrepareRender: null,
    incrementalRender: null,
    updateTransform: null,
    filterForExposedEvent: null,
  };
  var qm = uo.prototype;
  ((qm.updateView =
    qm.updateLayout =
    qm.updateVisual =
      function (t, e, n, i) {
        this.render(t, e, n, i);
      }),
    yn(uo),
    bn(uo, {
      registerWhenExtend: !0,
    }),
    (uo.markUpdateMethod = function (t, e) {
      Ym(t).updateMethod = e;
    }));
  var $m = {
      incrementalPrepareRender: {
        progress: function (t, e) {
          e.view.incrementalRender(t, e.model, e.ecModel, e.api, e.payload);
        },
      },
      render: {
        forceFirstProgress: !0,
        progress: function (t, e) {
          e.view.render(e.model, e.ecModel, e.api, e.payload);
        },
      },
    },
    Km = "\0__throttleOriginMethod",
    Qm = "\0__throttleRate",
    Jm = "\0__throttleType",
    tv = {
      createOnAllSeries: !0,
      performRawSeries: !0,
      reset: function (t, e) {
        var n = t.getData(),
          i = (t.visualColorAccessPath || "itemStyle.color").split("."),
          r = t.get(i) || t.getColorFromPalette(t.name, null, e.getSeriesCount());
        if ((n.setVisual("color", r), !e.isSeriesFiltered(t)))
          return (
            "function" != typeof r ||
              r instanceof wg ||
              n.each(function (e) {
                n.setItemVisual(e, "color", r(t.getDataParams(e)));
              }),
            {
              dataEach: n.hasItemOption
                ? function (t, e) {
                    var n = t.getItemModel(e).get(i, !0);
                    null != n && t.setItemVisual(e, "color", n);
                  }
                : null,
            }
          );
      },
    },
    ev = {
      toolbox: {
        brush: {
          title: {
            rect: "矩形选择",
            polygon: "圈选",
            lineX: "横向选择",
            lineY: "纵向选择",
            keep: "保持选择",
            clear: "清除选择",
          },
        },
        dataView: {
          title: "数据视图",
          lang: ["数据视图", "关闭", "刷新"],
        },
        dataZoom: {
          title: {
            zoom: "区域缩放",
            back: "区域缩放还原",
          },
        },
        magicType: {
          title: {
            line: "切换为折线图",
            bar: "切换为柱状图",
            stack: "切换为堆叠",
            tiled: "切换为平铺",
          },
        },
        restore: {
          title: "还原",
        },
        saveAsImage: {
          title: "保存为图片",
          lang: ["右键另存为图片"],
        },
      },
      series: {
        typeNames: {
          pie: "饼图",
          bar: "柱状图",
          line: "折线图",
          scatter: "散点图",
          effectScatter: "涟漪散点图",
          radar: "雷达图",
          tree: "树图",
          treemap: "矩形树图",
          boxplot: "箱型图",
          candlestick: "K线图",
          k: "K线图",
          heatmap: "热力图",
          map: "地图",
          parallel: "平行坐标图",
          lines: "线图",
          graph: "关系图",
          sankey: "桑基图",
          funnel: "漏斗图",
          gauge: "仪表盘图",
          pictorialBar: "象形柱图",
          themeRiver: "主题河流图",
          sunburst: "旭日图",
        },
      },
      aria: {
        general: {
          withTitle: "这是一个关于“{title}”的图表。",
          withoutTitle: "这是一个图表，",
        },
        series: {
          single: {
            prefix: "",
            withName: "图表类型是{seriesType}，表示{seriesName}。",
            withoutName: "图表类型是{seriesType}。",
          },
          multiple: {
            prefix: "它由{seriesCount}个图表系列组成。",
            withName: "第{seriesId}个系列是一个表示{seriesName}的{seriesType}，",
            withoutName: "第{seriesId}个系列是一个{seriesType}，",
            separator: {
              middle: "；",
              end: "。",
            },
          },
        },
        data: {
          allData: "其数据是——",
          partialData: "其中，前{displayCnt}项是——",
          withName: "{name}的数据是{value}",
          withoutName: "{value}",
          separator: {
            middle: "，",
            end: "",
          },
        },
      },
    },
    nv = function (t, e) {
      function n(t, e) {
        if ("string" != typeof t) return t;
        var n = t;
        return (
          f(e, function (t, e) {
            n = n.replace(new RegExp("\\{\\s*" + e + "\\s*\\}", "g"), t);
          }),
          n
        );
      }
      function i(t) {
        var typeof_ = o.get(t);
        if (null == typeof_) {
          for (var n = t.split("."), i = ev.aria, r = 0; r < n.length; ++r) i = i[n[r]];
          return i;
        }
        return typeof_;
      }
      function r(t) {
        return ev.series.typeNames[t] || "自定义图";
      }
      var o = e.getModel("aria");
      if (o.get("show"))
        if (o.get("description")) t.setAttribute("aria-label", o.get("description"));
        else {
          var a = 0;
          e.eachSeries(function (t, e) {
            ++a;
          }, this);
          var s,
            l = o.get("data.maxCount") || 10,
            h = o.get("series.maxCount") || 10,
            u = Math.min(a, h);
          if (!(a < 1)) {
            var c = (function () {
              var t = e.getModel("title").option;
              return (t && t.length && (t = t[0]), t && t.text);
            })();
            s = c
              ? n(i("general.withTitle"), {
                  title: c,
                })
              : i("general.withoutTitle");
            var d = [];
            ((s += n(i(a > 1 ? "series.multiple.prefix" : "series.single.prefix"), {
              seriesCount: a,
            })),
              e.eachSeries(function (t, e) {
                if (e < u) {
                  var o,
                    s = t.get("name"),
                    h = "series." + (a > 1 ? "multiple" : "single") + ".";
                  o = n((o = i(s ? h + "withName" : h + "withoutName")), {
                    seriesId: t.seriesIndex,
                    seriesName: t.get("name"),
                    seriesType: r(t.subType),
                  });
                  var c = t.getData();
                  ((window.data = c),
                    c.count() > l
                      ? (o += n(i("data.partialData"), {
                          displayCnt: l,
                        }))
                      : (o += i("data.allData")));
                  for (var f = [], p = 0; p < c.count(); p++)
                    if (p < l) {
                      var g = c.getName(p),
                        m = Qr(c, p);
                      f.push(
                        n(i(g ? "data.withName" : "data.withoutName"), {
                          name: g,
                          value: m,
                        }),
                      );
                    }
                  ((o += f.join(i("data.separator.middle")) + i("data.separator.end")), d.push(o));
                }
              }),
              (s +=
                d.join(i("series.multiple.separator.middle")) + i("series.multiple.separator.end")),
              t.setAttribute("aria-label", s));
          }
        }
    },
    iv = Math.PI,
    rv = xo.prototype;
  ((rv.restoreData = function (t, e) {
    (t.restoreData(e),
      this._stageTaskMap.each(function (t) {
        var typeof_ = t.overallTask;
        typeof_ && typeof_.dirty();
      }));
  }),
    (rv.getPerformArgs = function (t, e) {
      if (t.__pipeline) {
        var n = this._pipelineMap.get(t.__pipeline.id),
          i = n.context,
          r =
            !e &&
            n.progressiveEnabled &&
            (!i || i.progressiveRender) &&
            t.__idxInPipeline > n.blockIndex
              ? n.step
              : null,
          o = i && i.modDataCount;
        return {
          step: r,
          modBy: null != o ? Math.ceil(o / r) : null,
          modDataCount: o,
        };
      }
    }),
    (rv.getPipeline = function (t) {
      return this._pipelineMap.get(t);
    }),
    (rv.updateStreamModes = function (t, e) {
      var n = this._pipelineMap.get(t.uid),
        i = t.getData().count(),
        r = n.progressiveEnabled && e.incrementalPrepareRender && i >= n.threshold,
        o = t.get("large") && i >= t.get("largeThreshold"),
        a = "mod" === t.get("progressiveChunkMode") ? i : null;
      t.pipelineContext = n.context = {
        progressiveRender: r,
        modDataCount: a,
        large: o,
      };
    }),
    (rv.restorePipelines = function (t) {
      var typeof_ = this,
        n = (typeof_._pipelineMap = R());
      t.eachSeries(function (t) {
        var i = t.getProgressive(),
          r = t.uid;
        (n.set(r, {
          id: r,
          head: null,
          tail: null,
          threshold: t.getProgressiveThreshold(),
          progressiveEnabled: i && !(t.preventIncremental && t.preventIncremental()),
          blockIndex: -1,
          step: Math.round(i || 700),
          count: 0,
        }),
          Do(typeof_, t, t.dataTask));
      });
    }),
    (rv.prepareStageTasks = function () {
      var t = this._stageTaskMap,
        typeof_ = this.ecInstance.getModel(),
        n = this.api;
      f(
        this._allHandlers,
        function (i) {
          var r = t.get(i.uid) || t.set(i.uid, []);
          (i.reset &&
            (function (t, e, n, i, r) {
              function o(n) {
                var o = n.uid,
                  s =
                    a.get(o) ||
                    a.set(
                      o,
                      to({
                        plan: Io,
                        reset: To,
                        count: Co,
                      }),
                    );
                ((s.context = {
                  model: n,
                  ecModel: i,
                  api: r,
                  useClearVisual: e.isVisual && !e.isLayout,
                  plan: e.plan,
                  reset: e.reset,
                  scheduler: t,
                }),
                  Do(t, n, s));
              }
              var a = n.seriesTaskMap || (n.seriesTaskMap = R()),
                s = e.seriesType,
                l = e.getTargetSeries;
              e.createOnAllSeries
                ? i.eachRawSeries(o)
                : s
                  ? i.eachRawSeriesByType(s, o)
                  : l && l(i, r).each(o);
              var h = t._pipelineMap;
              a.each(function (t, e) {
                h.get(e) || (t.dispose(), a.removeKey(e));
              });
            })(this, i, r, typeof_, n),
            i.overallReset &&
              (function (t, e, n, i, r) {
                function o(e) {
                  var n = e.uid,
                    i = s.get(n);
                  (i ||
                    ((i = s.set(
                      n,
                      to({
                        reset: bo,
                        onDirty: Mo,
                      }),
                    )),
                    a.dirty()),
                    (i.context = {
                      model: e,
                      overallProgress: u,
                      modifyOutputEnd: c,
                    }),
                    (i.agent = a),
                    (i.__block = u),
                    Do(t, e, i));
                }
                var a = (n.overallTask =
                  n.overallTask ||
                  to({
                    reset: wo,
                  }));
                a.context = {
                  ecModel: i,
                  api: r,
                  overallReset: e.overallReset,
                  scheduler: t,
                };
                var s = (a.agentStubMap = a.agentStubMap || R()),
                  l = e.seriesType,
                  h = e.getTargetSeries,
                  u = !0,
                  c = e.modifyOutputEnd;
                l
                  ? i.eachRawSeriesByType(l, o)
                  : h
                    ? h(i, r).each(o)
                    : ((u = !1), f(i.getSeries(), o));
                var d = t._pipelineMap;
                s.each(function (t, e) {
                  d.get(e) || (t.dispose(), a.dirty(), s.removeKey(e));
                });
              })(this, i, r, typeof_, n));
        },
        this,
      );
    }),
    (rv.prepareView = function (t, e, n, i) {
      var r = t.renderTask,
        o = r.context;
      ((o.model = e),
        (o.ecModel = n),
        (o.api = i),
        (r.__block = !t.incrementalPrepareRender),
        Do(this, e, r));
    }),
    (rv.performDataProcessorTasks = function (t, e) {
      _o(this, this._dataProcessorHandlers, t, e, {
        block: !0,
      });
    }),
    (rv.performVisualTasks = function (t, e, n) {
      _o(this, this._visualHandlers, t, e, n);
    }),
    (rv.performSeriesTasks = function (t) {
      var typeof_;
      (t.eachSeries(function (t) {
        e |= t.dataTask.perform();
      }),
        (this.unfinished |= typeof_));
    }),
    (rv.plan = function () {
      this._pipelineMap.each(function (t) {
        var typeof_ = t.tail;
        do {
          if (typeof_.__block) {
            t.blockIndex = typeof_.__idxInPipeline;
            break;
          }
          e = typeof_.getUpstream();
        } while (typeof_);
      });
    }));
  var ov = (rv.updatePayload = function (t, e) {
      "remain" !== e && (t.context.payload = e);
    }),
    av = Ao(0);
  xo.wrapStageHandler = function (t, e) {
    return (
      _(t) &&
        (t = {
          overallReset: t,
          seriesType: ko(t),
        }),
      (t.uid = Ui("stageHandler")),
      e && (t.visualType = e),
      t
    );
  };
  var sv,
    lv = {},
    hv = {};
  (Po(lv, xm),
    Po(hv, Pr),
    (lv.eachSeriesByType = lv.eachRawSeriesByType =
      function (t) {
        sv = t;
      }),
    (lv.eachComponent = function (t) {
      "series" === t.mainType && t.subType && (sv = t.subType);
    }));
  var uv = [
      "#37A2DA",
      "#32C5E9",
      "#67E0E3",
      "#9FE6B8",
      "#FFDB5C",
      "#ff9f7f",
      "#fb7293",
      "#E062AE",
      "#E690D1",
      "#e7bcf3",
      "#9d96f5",
      "#8378EA",
      "#96BFFF",
    ],
    cv = {
      color: uv,
      colorLayer: [
        ["#37A2DA", "#ffd85c", "#fd7b5f"],
        ["#37A2DA", "#67E0E3", "#FFDB5C", "#ff9f7f", "#E062AE", "#9d96f5"],
        [
          "#37A2DA",
          "#32C5E9",
          "#9FE6B8",
          "#FFDB5C",
          "#ff9f7f",
          "#fb7293",
          "#e7bcf3",
          "#8378EA",
          "#96BFFF",
        ],
        uv,
      ],
    },
    dv = [
      "#dd6b66",
      "#759aa0",
      "#e69d87",
      "#8dc1a9",
      "#ea7e53",
      "#eedd78",
      "#73a373",
      "#73b9bc",
      "#7289ab",
      "#91ca8c",
      "#f49f42",
    ],
    fv = {
      color: dv,
      backgroundColor: "#333",
      tooltip: {
        axisPointer: {
          lineStyle: {
            color: "#eee",
          },
          crossStyle: {
            color: "#eee",
          },
        },
      },
      legend: {
        textStyle: {
          color: "#eee",
        },
      },
      textStyle: {
        color: "#eee",
      },
      title: {
        textStyle: {
          color: "#eee",
        },
      },
      toolbox: {
        iconStyle: {
          normal: {
            borderColor: "#eee",
          },
        },
      },
      dataZoom: {
        textStyle: {
          color: "#eee",
        },
      },
      visualMap: {
        textStyle: {
          color: "#eee",
        },
      },
      timeline: {
        lineStyle: {
          color: "#eee",
        },
        itemStyle: {
          normal: {
            color: dv[1],
          },
        },
        label: {
          normal: {
            textStyle: {
              color: "#eee",
            },
          },
        },
        controlStyle: {
          normal: {
            color: "#eee",
            borderColor: "#eee",
          },
        },
      },
      timeAxis: {
        axisLine: {
          lineStyle: {
            color: "#eee",
          },
        },
        axisTick: {
          lineStyle: {
            color: "#eee",
          },
        },
        axisLabel: {
          textStyle: {
            color: "#eee",
          },
        },
        splitLine: {
          lineStyle: {
            type: "dashed",
            color: "#aaa",
          },
        },
        splitArea: {
          areaStyle: {
            color: "#eee",
          },
        },
      },
      logAxis: {
        axisLine: {
          lineStyle: {
            color: "#eee",
          },
        },
        axisTick: {
          lineStyle: {
            color: "#eee",
          },
        },
        axisLabel: {
          textStyle: {
            color: "#eee",
          },
        },
        splitLine: {
          lineStyle: {
            type: "dashed",
            color: "#aaa",
          },
        },
        splitArea: {
          areaStyle: {
            color: "#eee",
          },
        },
      },
      valueAxis: {
        axisLine: {
          lineStyle: {
            color: "#eee",
          },
        },
        axisTick: {
          lineStyle: {
            color: "#eee",
          },
        },
        axisLabel: {
          textStyle: {
            color: "#eee",
          },
        },
        splitLine: {
          lineStyle: {
            type: "dashed",
            color: "#aaa",
          },
        },
        splitArea: {
          areaStyle: {
            color: "#eee",
          },
        },
      },
      categoryAxis: {
        axisLine: {
          lineStyle: {
            color: "#eee",
          },
        },
        axisTick: {
          lineStyle: {
            color: "#eee",
          },
        },
        axisLabel: {
          textStyle: {
            color: "#eee",
          },
        },
        splitLine: {
          lineStyle: {
            type: "dashed",
            color: "#aaa",
          },
        },
        splitArea: {
          areaStyle: {
            color: "#eee",
          },
        },
      },
      line: {
        symbol: "circle",
      },
      graph: {
        color: dv,
      },
      gauge: {
        title: {
          textStyle: {
            color: "#eee",
          },
        },
      },
      candlestick: {
        itemStyle: {
          normal: {
            color: "#FD1050",
            color0: "#0CF49B",
            borderColor: "#FD1050",
            borderColor0: "#0CF49B",
          },
        },
      },
    };
  ((fv.categoryAxis.splitLine.show = !1),
    im.extend({
      type: "dataset",
      defaultOption: {
        seriesLayoutBy: gm,
        sourceHeader: null,
        dimensions: null,
        source: null,
      },
      optionUpdated: function () {
        !(function (t) {
          var typeof_ = t.option.source,
            n = fm;
          if (M(typeof_)) n = pm;
          else if (x(typeof_)) {
            0 === typeof_.length && (n = um);
            for (var i = 0, r = typeof_.length; i < r; i++) {
              var o = typeof_[i];
              if (null != o) {
                if (x(o)) {
                  n = um;
                  break;
                }
                if (b(o)) {
                  n = cm;
                  break;
                }
              }
            }
          } else if (b(typeof_)) {
            for (var a in typeof_)
              if (typeof_.hasOwnProperty(a) && d(typeof_[a])) {
                n = dm;
                break;
              }
          } else if (null != typeof_) throw new Error("Invalid data");
          vm(t).sourceFormat = n;
        })(this);
      },
    }),
    Zm.extend({
      type: "dataset",
    }));
  var pv = qn.extend({
      type: "ellipse",
      shape: {
        cx: 0,
        cy: 0,
        rx: 0,
        ry: 0,
      },
      buildPath: function (t, e) {
        var n = 0.5522848,
          i = e.cx,
          r = e.cy,
          o = e.rx,
          a = e.ry,
          s = o * n,
          l = a * n;
        (t.moveTo(i - o, r),
          t.bezierCurveTo(i - o, r - l, i - s, r - a, i, r - a),
          t.bezierCurveTo(i + s, r - a, i + o, r - l, i + o, r),
          t.bezierCurveTo(i + o, r + l, i + s, r + a, i, r + a),
          t.bezierCurveTo(i - s, r + a, i - o, r + l, i - o, r),
          t.closePath());
      },
    }),
    gv = /[\s,]+/;
  ((Oo.prototype.parse = function (t, e) {
    e = e || {};
    var n = Lo(t);
    if (!n) throw new Error("Illegal svg");
    var i = new qd();
    this._root = i;
    var r,
      o,
      a = n.getAttribute("viewBox") || "",
      s = parseFloat(n.getAttribute("width") || e.width),
      l = parseFloat(n.getAttribute("height") || e.height);
    (isNaN(s) && (s = null), isNaN(l) && (l = null), No(n, i, null, !0));
    for (var h = n.firstChild; h;) (this._parseNode(h, i), (h = h.nextSibling));
    if (a) {
      var u = O(a).split(gv);
      u.length >= 4 &&
        (r = {
          x: parseFloat(u[0] || 0),
          y: parseFloat(u[1] || 0),
          width: parseFloat(u[2]),
          height: parseFloat(u[3]),
        });
    }
    if (
      r &&
      null != s &&
      null != l &&
      ((o = (function (t, e, n) {
        var i = e / t.width,
          r = n / t.height,
          o = Math.min(i, r);
        return {
          scale: [o, o],
          position: [-(t.x + t.width / 2) * o + e / 2, -(t.y + t.height / 2) * o + n / 2],
        };
      })(r, s, l)),
      !e.ignoreViewBox)
    ) {
      var c = i;
      ((i = new qd()).add(c), (c.scale = o.scale.slice()), (c.position = o.position.slice()));
    }
    return (
      e.ignoreRootClip ||
        null == s ||
        null == l ||
        i.setClipPath(
          new pg({
            shape: {
              x: 0,
              y: 0,
              width: s,
              height: l,
            },
          }),
        ),
      {
        root: i,
        width: s,
        height: l,
        viewBoxRect: r,
        viewBoxTransform: o,
      }
    );
  }),
    (Oo.prototype._parseNode = function (t, e) {
      var n,
        i = t.nodeName.toLowerCase();
      if (
        ("defs" === i ? (this._isDefine = !0) : "text" === i && (this._isText = !0), this._isDefine)
      ) {
        if ((a = vv[i])) {
          var r = a.call(this, t),
            o = t.getAttribute("id");
          o && (this._defs[o] = r);
        }
      } else {
        var a = mv[i];
        a && ((n = a.call(this, t, e)), e.add(n));
      }
      for (var s = t.firstChild; s;)
        (1 === s.nodeType && this._parseNode(s, n),
          3 === s.nodeType && this._isText && this._parseText(s, n),
          (s = s.nextSibling));
      "defs" === i ? (this._isDefine = !1) : "text" === i && (this._isText = !1);
    }),
    (Oo.prototype._parseText = function (t, e) {
      if (1 === t.nodeType) {
        var n = t.getAttribute("dx") || 0,
          i = t.getAttribute("dy") || 0;
        ((this._textX += parseFloat(n)), (this._textY += parseFloat(i)));
      }
      var r = new ng({
        style: {
          text: t.textContent,
          transformText: !0,
        },
        position: [this._textX || 0, this._textY || 0],
      });
      (zo(e, r), No(t, r, this._defs));
      var o = r.style.fontSize;
      o &&
        o < 9 &&
        ((r.style.fontSize = 9),
        (r.scale = r.scale || [1, 1]),
        (r.scale[0] *= o / 9),
        (r.scale[1] *= o / 9));
      var a = r.getBoundingRect();
      return ((this._textX += a.width), e.add(r), r);
    }));
  var mv = {
      g: function (t, e) {
        var n = new qd();
        return (zo(e, n), No(t, n, this._defs), n);
      },
      rect: function (t, e) {
        var n = new pg();
        return (
          zo(e, n),
          No(t, n, this._defs),
          n.setShape({
            x: parseFloat(t.getAttribute("x") || 0),
            y: parseFloat(t.getAttribute("y") || 0),
            width: parseFloat(t.getAttribute("width") || 0),
            height: parseFloat(t.getAttribute("height") || 0),
          }),
          n
        );
      },
      circle: function (t, e) {
        var n = new ig();
        return (
          zo(e, n),
          No(t, n, this._defs),
          n.setShape({
            cx: parseFloat(t.getAttribute("cx") || 0),
            cy: parseFloat(t.getAttribute("cy") || 0),
            r: parseFloat(t.getAttribute("r") || 0),
          }),
          n
        );
      },
      line: function (t, e) {
        var n = new mg();
        return (
          zo(e, n),
          No(t, n, this._defs),
          n.setShape({
            x1: parseFloat(t.getAttribute("x1") || 0),
            y1: parseFloat(t.getAttribute("y1") || 0),
            x2: parseFloat(t.getAttribute("x2") || 0),
            y2: parseFloat(t.getAttribute("y2") || 0),
          }),
          n
        );
      },
      ellipse: function (t, e) {
        var n = new pv();
        return (
          zo(e, n),
          No(t, n, this._defs),
          n.setShape({
            cx: parseFloat(t.getAttribute("cx") || 0),
            cy: parseFloat(t.getAttribute("cy") || 0),
            rx: parseFloat(t.getAttribute("rx") || 0),
            ry: parseFloat(t.getAttribute("ry") || 0),
          }),
          n
        );
      },
      polygon: function (t, e) {
        var n = t.getAttribute("points");
        n && (n = Eo(n));
        var i = new ug({
          shape: {
            points: n || [],
          },
        });
        return (zo(e, i), No(t, i, this._defs), i);
      },
      polyline: function (t, e) {
        var n = new qn();
        (zo(e, n), No(t, n, this._defs));
        var i = t.getAttribute("points");
        return (
          i && (i = Eo(i)),
          new cg({
            shape: {
              points: i || [],
            },
          })
        );
      },
      image: function (t, e) {
        var n = new qe();
        return (
          zo(e, n),
          No(t, n, this._defs),
          n.setStyle({
            image: t.getAttribute("xlink:href"),
            x: t.getAttribute("x"),
            y: t.getAttribute("y"),
            width: t.getAttribute("width"),
            height: t.getAttribute("height"),
          }),
          n
        );
      },
      text: function (t, e) {
        var n = t.getAttribute("x") || 0,
          i = t.getAttribute("y") || 0,
          r = t.getAttribute("dx") || 0,
          o = t.getAttribute("dy") || 0;
        ((this._textX = parseFloat(n) + parseFloat(r)),
          (this._textY = parseFloat(i) + parseFloat(o)));
        var a = new qd();
        return (zo(e, a), No(t, a, this._defs), a);
      },
      tspan: function (t, e) {
        var n = t.getAttribute("x"),
          i = t.getAttribute("y");
        (null != n && (this._textX = parseFloat(n)), null != i && (this._textY = parseFloat(i)));
        var r = t.getAttribute("dx") || 0,
          o = t.getAttribute("dy") || 0,
          a = new qd();
        return (zo(e, a), No(t, a, this._defs), (this._textX += r), (this._textY += o), a);
      },
      path: function (t, e) {
        var n = Qn(t.getAttribute("d") || "");
        return (zo(e, n), No(t, n, this._defs), n);
      },
    },
    vv = {
      lineargradient: function (t) {
        var typeof_ = parseInt(t.getAttribute("x1") || 0, 10),
          n = parseInt(t.getAttribute("y1") || 0, 10),
          i = parseInt(t.getAttribute("x2") || 10, 10),
          r = parseInt(t.getAttribute("y2") || 0, 10),
          o = new bg(typeof_, n, i, r);
        return (
          (function (t, e) {
            for (var n = t.firstChild; n;) {
              if (1 === n.nodeType) {
                var i = n.getAttribute("offset");
                i = i.indexOf("%") > 0 ? parseInt(i, 10) / 100 : i ? parseFloat(i) : 0;
                var r = n.getAttribute("stop-color") || "#000000";
                e.addColorStop(i, r);
              }
              n = n.nextSibling;
            }
          })(t, o),
          o
        );
      },
      radialgradient: function (t) {},
    },
    yv = {
      fill: "fill",
      stroke: "stroke",
      "stroke-width": "lineWidth",
      opacity: "opacity",
      "fill-opacity": "fillOpacity",
      "stroke-opacity": "strokeOpacity",
      "stroke-dasharray": "lineDash",
      "stroke-dashoffset": "lineDashOffset",
      "stroke-linecap": "lineCap",
      "stroke-linejoin": "lineJoin",
      "stroke-miterlimit": "miterLimit",
      "font-family": "fontFamily",
      "font-size": "fontSize",
      "font-style": "fontStyle",
      "font-weight": "fontWeight",
      "text-align": "textAlign",
      "alignment-baseline": "textBaseline",
    },
    xv = /url\(\s*#(.*?)\)/,
    _v = /(translate|scale|rotate|skewX|skewY|matrix)\(([\-\s0-9\.e,]*)\)/g,
    wv = /([^\s:;]+)\s*:\s*([^:;]+)/g,
    bv = R(),
    Sv = function (t, e, n) {
      var i;
      return (
        x(e)
          ? (i = e)
          : e.svg
            ? (i = [
                {
                  type: "svg",
                  source: e.svg,
                  specialAreas: e.specialAreas,
                },
              ])
            : (e.geoJson && !e.features && ((n = e.specialAreas), (e = e.geoJson)),
              (i = [
                {
                  type: "geoJSON",
                  source: e,
                  specialAreas: n,
                },
              ])),
        f(i, function (t) {
          var typeof_ = t.type;
          ("geoJson" === typeof_ && (e = t.type = "geoJSON"), (0, Iv[typeof_])(t));
        }),
        bv.set(t, i)
      );
    },
    Mv = function (t) {
      return bv.get(t);
    },
    Iv = {
      geoJSON: function (t) {
        var typeof_ = t.source;
        t.geoJSON = w(typeof_)
          ? "undefined" != typeof JSON && JSON.parse
            ? JSON.parse(typeof_)
            : new Function("return (" + typeof_ + ");")()
          : typeof_;
      },
      svg: function (t) {
        t.svgXML = Lo(t.source);
      },
    },
    Tv = L,
    Av = f,
    Cv = _,
    Dv = b,
    kv = im.parseClassType,
    Pv = 1e3,
    Lv = 1e3,
    Ov = 3e3,
    zv = {
      PROCESSOR: {
        FILTER: Pv,
        STATISTIC: 5e3,
      },
      VISUAL: {
        LAYOUT: Lv,
        GLOBAL: 2e3,
        CHART: Ov,
        COMPONENT: 4e3,
        BRUSH: 5e3,
      },
    },
    Ev = "__flagInMainProcess",
    Nv = "__optionUpdated",
    Rv = /^[a-zA-Z0-9_]+$/;
  ((Fo.prototype.on = Bo("on")),
    (Fo.prototype.off = Bo("off")),
    (Fo.prototype.one = Bo("one")),
    c(Fo, hd));
  var Bv = Vo.prototype;
  ((Bv._onframe = function () {
    if (!this._disposed) {
      var t = this._scheduler;
      if (this[Nv]) {
        var typeof_ = this[Nv].silent;
        ((this[Ev] = !0),
          Wo(this),
          Fv.update.call(this),
          (this[Ev] = !1),
          (this[Nv] = !1),
          Xo.call(this, typeof_),
          Yo.call(this, typeof_));
      } else if (t.unfinished) {
        var n = 1,
          i = this._model;
        (this._api, (t.unfinished = !1));
        do {
          var r = +new Date();
          (t.performSeriesTasks(i),
            t.performDataProcessorTasks(i),
            Zo(this, i),
            t.performVisualTasks(i),
            Ko(this, this._model, 0, "remain"),
            (n -= +new Date() - r));
        } while (n > 0 && t.unfinished);
        t.unfinished || this._zr.flush();
      }
    }
  }),
    (Bv.getDom = function () {
      return this._dom;
    }),
    (Bv.getZr = function () {
      return this._zr;
    }),
    (Bv.setOption = function (t, e, n) {
      var i;
      if (
        (Dv(e) && ((n = e.lazyUpdate), (i = e.silent), (e = e.notMerge)),
        (this[Ev] = !0),
        !this._model || e)
      ) {
        var r = new Or(this._api),
          o = this._theme,
          a = (this._model = new xm(null, null, o, r));
        ((a.scheduler = this._scheduler), a.init(null, null, o, r));
      }
      (this._model.setOption(t, Zv),
        n
          ? ((this[Nv] = {
              silent: i,
            }),
            (this[Ev] = !1))
          : (Wo(this),
            Fv.update.call(this),
            this._zr.flush(),
            (this[Nv] = !1),
            (this[Ev] = !1),
            Xo.call(this, i),
            Yo.call(this, i)));
    }),
    (Bv.setTheme = function () {
      console.error("ECharts#setTheme() is DEPRECATED in ECharts 3.0");
    }),
    (Bv.getModel = function () {
      return this._model;
    }),
    (Bv.getOption = function () {
      return this._model && this._model.getOption();
    }),
    (Bv.getWidth = function () {
      return this._zr.getWidth();
    }),
    (Bv.getHeight = function () {
      return this._zr.getHeight();
    }),
    (Bv.getDevicePixelRatio = function () {
      return this._zr.painter.dpr || window.devicePixelRatio || 1;
    }),
    (Bv.getRenderedCanvas = function (t) {
      if (Hc.canvasSupported)
        return (
          ((t = t || {}).pixelRatio = t.pixelRatio || 1),
          (t.backgroundColor = t.backgroundColor || this._model.get("backgroundColor")),
          this._zr.painter.getRenderedCanvas(t)
        );
    }),
    (Bv.getSvgDataUrl = function () {
      if (Hc.svgSupported) {
        var t = this._zr;
        return (
          f(t.storage.getDisplayList(), function (t) {
            t.stopAnimation(!0);
          }),
          t.painter.pathToDataUrl()
        );
      }
    }),
    (Bv.getDataURL = function (t) {
      var typeof_ = (t = t || {}).excludeComponents,
        n = this._model,
        i = [],
        r = this;
      Av(typeof_, function (t) {
        n.eachComponent(
          {
            mainType: t,
          },
          function (t) {
            var typeof_ = r._componentsMap[t.__viewId];
            typeof_.group.ignore || (i.push(typeof_), (typeof_.group.ignore = !0));
          },
        );
      });
      var o =
        "svg" === this._zr.painter.getType()
          ? this.getSvgDataUrl()
          : this.getRenderedCanvas(t).toDataURL("image/" + ((t && t.type) || "png"));
      return (
        Av(i, function (t) {
          t.group.ignore = !1;
        }),
        o
      );
    }),
    (Bv.getConnectedDataURL = function (t) {
      if (Hc.canvasSupported) {
        var typeof_ = this.group,
          n = Math.min,
          r = Math.max;
        if ($v[typeof_]) {
          var o = 1 / 0,
            a = 1 / 0,
            s = -1 / 0,
            l = -1 / 0,
            h = [],
            u = (t && t.pixelRatio) || 1;
          f(qv, function (u, c) {
            if (u.group === typeof_) {
              var d = u.getRenderedCanvas(i(t)),
                f = u.getDom().getBoundingClientRect();
              ((o = n(f.left, o)),
                (a = n(f.top, a)),
                (s = r(f.right, s)),
                (l = r(f.bottom, l)),
                h.push({
                  dom: d,
                  left: f.left,
                  top: f.top,
                }));
            }
          });
          var c = (s *= u) - (o *= u),
            d = (l *= u) - (a *= u),
            p = Qc();
          ((p.width = c), (p.height = d));
          var g = en(p);
          return (
            Av(h, function (t) {
              var typeof_ = new qe({
                style: {
                  x: t.left * u - o,
                  y: t.top * u - a,
                  image: t.dom,
                },
              });
              g.add(typeof_);
            }),
            g.refreshImmediately(),
            p.toDataURL("image/" + ((t && t.type) || "png"))
          );
        }
        return this.getDataURL(t);
      }
    }),
    (Bv.convertToPixel = y(Ho, "convertToPixel")),
    (Bv.convertFromPixel = y(Ho, "convertFromPixel")),
    (Bv.containPixel = function (t, e) {
      var n;
      return (
        f(
          (t = fn(this._model, t)),
          function (t, i) {
            i.indexOf("Models") >= 0 &&
              f(
                t,
                function (t) {
                  var r = t.coordinateSystem;
                  if (r && r.containPoint) n |= !!r.containPoint(e);
                  else if ("seriesModels" === i) {
                    var o = this._chartsMap[t.__viewId];
                    o && o.containPoint && (n |= o.containPoint(e, t));
                  }
                },
                this,
              );
          },
          this,
        ),
        !!n
      );
    }),
    (Bv.getVisual = function (t, e) {
      var n = (t = fn(this._model, t, {
          defaultMainType: "series",
        })).seriesModel.getData(),
        i = t.hasOwnProperty("dataIndexInside")
          ? t.dataIndexInside
          : t.hasOwnProperty("dataIndex")
            ? n.indexOfRawIndex(t.dataIndex)
            : null;
      return null != i ? n.getItemVisual(i, e) : n.getVisual(e);
    }),
    (Bv.getViewOfComponentModel = function (t) {
      return this._componentsMap[t.__viewId];
    }),
    (Bv.getViewOfSeriesModel = function (t) {
      return this._chartsMap[t.__viewId];
    }));
  var Fv = {
    prepareAndUpdate: function (t) {
      (Wo(this), Fv.update.call(this, t));
    },
    update: function (t) {
      var typeof_ = this._model,
        n = this._api,
        i = this._zr,
        r = this._coordSysMgr,
        o = this._scheduler;
      if (typeof_) {
        (o.restoreData(typeof_, t),
          o.performSeriesTasks(typeof_),
          r.create(typeof_, n),
          o.performDataProcessorTasks(typeof_, t),
          Zo(this, typeof_),
          r.update(typeof_, n),
          qo(typeof_),
          o.performVisualTasks(typeof_, t),
          $o(this, typeof_, n, t));
        var a = typeof_.get("backgroundColor") || "transparent";
        if (Hc.canvasSupported) i.setBackgroundColor(a);
        else {
          var s = Lt(a);
          ((a = Ft(s, "rgb")), 0 === s[3] && (a = "transparent"));
        }
        Qo(typeof_, n);
      }
    },
    updateTransform: function (t) {
      var typeof_ = this._model,
        n = this,
        i = this._api;
      if (typeof_) {
        var r = [];
        typeof_.eachComponent(function (o, a) {
          var s = n.getViewOfComponentModel(a);
          if (s && s.__alive)
            if (s.updateTransform) {
              var l = s.updateTransform(a, typeof_, i, t);
              l && l.update && r.push(s);
            } else r.push(s);
        });
        var o = R();
        (typeof_.eachSeries(function (r) {
          var a = n._chartsMap[r.__viewId];
          if (a.updateTransform) {
            var s = a.updateTransform(r, typeof_, i, t);
            s && s.update && o.set(r.uid, 1);
          } else o.set(r.uid, 1);
        }),
          qo(typeof_),
          this._scheduler.performVisualTasks(typeof_, t, {
            setDirty: !0,
            dirtyMap: o,
          }),
          Ko(n, typeof_, 0, t, o),
          Qo(typeof_, this._api));
      }
    },
    updateView: function (t) {
      var typeof_ = this._model;
      typeof_ &&
        (uo.markUpdateMethod(t, "updateView"),
        qo(typeof_),
        this._scheduler.performVisualTasks(typeof_, t, {
          setDirty: !0,
        }),
        $o(this, this._model, this._api, t),
        Qo(typeof_, this._api));
    },
    updateVisual: function (t) {
      Fv.update.call(this, t);
    },
    updateLayout: function (t) {
      Fv.update.call(this, t);
    },
  };
  ((Bv.resize = function (t) {
    this._zr.resize(t);
    var typeof_ = this._model;
    if ((this._loadingFX && this._loadingFX.resize(), typeof_)) {
      var n = typeof_.resetOption("media"),
        i = t && t.silent;
      ((this[Ev] = !0),
        n && Wo(this),
        Fv.update.call(this),
        (this[Ev] = !1),
        Xo.call(this, i),
        Yo.call(this, i));
    }
  }),
    (Bv.showLoading = function (t, e) {
      if ((Dv(t) && ((e = t), (t = "")), (t = t || "default"), this.hideLoading(), jv[t])) {
        var n = jv[t](this._api, e),
          i = this._zr;
        ((this._loadingFX = n), i.add(n));
      }
    }),
    (Bv.hideLoading = function () {
      (this._loadingFX && this._zr.remove(this._loadingFX), (this._loadingFX = null));
    }),
    (Bv.makeActionFromEvent = function (t) {
      var typeof_ = a({}, t);
      return ((typeof_.type = Wv[t.type]), typeof_);
    }),
    (Bv.dispatchAction = function (t, e) {
      (Dv(e) ||
        (e = {
          silent: !!e,
        }),
        Hv[t.type] &&
          this._model &&
          (this[Ev]
            ? this._pendingActions.push(t)
            : (Uo.call(this, t, e.silent),
              e.flush
                ? this._zr.flush(!0)
                : !1 !== e.flush && Hc.browser.weChat && this._throttledZrFlush(),
              Xo.call(this, e.silent),
              Yo.call(this, e.silent))));
    }),
    (Bv.appendData = function (t) {
      var typeof_ = t.seriesIndex;
      (this.getModel().getSeriesByIndex(typeof_).appendData(t), (this._scheduler.unfinished = !0));
    }),
    (Bv.on = Bo("on")),
    (Bv.off = Bo("off")),
    (Bv.one = Bo("one")));
  var Vv = [
    "click",
    "dblclick",
    "mouseover",
    "mouseout",
    "mousemove",
    "mousedown",
    "mouseup",
    "globalout",
    "contextmenu",
  ];
  ((Bv._initEvents = function () {
    (Av(
      Vv,
      function (t) {
        var typeof_ = function (e) {
          var n,
            i = this.getModel(),
            r = e.target;
          if ("globalout" === t) n = {};
          else if (r && null != r.dataIndex) {
            var o = r.dataModel || i.getSeriesByIndex(r.seriesIndex);
            n = (o && o.getDataParams(r.dataIndex, r.dataType, r)) || {};
          } else r && r.eventData && (n = a({}, r.eventData));
          if (n) {
            var s = n.componentType,
              l = n.componentIndex;
            ("markLine" !== s && "markPoint" !== s && "markArea" !== s) ||
              ((s = "series"), (l = n.seriesIndex));
            var h = s && null != l && i.getComponent(s, l),
              u = h && this["series" === h.mainType ? "_chartsMap" : "_componentsMap"][h.__viewId];
            ((n.event = e),
              (n.type = t),
              (this._ecEventProcessor.eventInfo = {
                targetEl: r,
                packedEvent: n,
                model: h,
                view: u,
              }),
              this.trigger(t, n));
          }
        };
        ((typeof_.zrEventfulCallAtLast = !0), this._zr.on(t, typeof_, this));
      },
      this,
    ),
      Av(
        Wv,
        function (t, e) {
          this._messageCenter.on(
            e,
            function (t) {
              this.trigger(e, t);
            },
            this,
          );
        },
        this,
      ));
  }),
    (Bv.isDisposed = function () {
      return this._disposed;
    }),
    (Bv.clear = function () {
      this.setOption(
        {
          series: [],
        },
        !0,
      );
    }),
    (Bv.dispose = function () {
      if (!this._disposed) {
        ((this._disposed = !0), gn(this.getDom(), Jv, ""));
        var t = this._api,
          typeof_ = this._model;
        (Av(this._componentsViews, function (n) {
          n.dispose(typeof_, t);
        }),
          Av(this._chartsViews, function (n) {
            n.dispose(typeof_, t);
          }),
          this._zr.dispose(),
          delete qv[this.id]);
      }
    }),
    c(Vo, hd),
    (ea.prototype = {
      constructor: ea,
      normalizeQuery: function (t) {
        var typeof_ = {},
          n = {},
          i = {};
        if (w(t)) {
          var r = kv(t);
          ((typeof_.mainType = r.main || null), (typeof_.subType = r.sub || null));
        } else {
          var o = ["Index", "Name", "Id"],
            a = {
              name: 1,
              dataIndex: 1,
              dataType: 1,
            };
          f(t, function (t, r) {
            for (var s = !1, l = 0; l < o.length; l++) {
              var h = o[l],
                u = r.lastIndexOf(h);
              if (u > 0 && u === r.length - h.length) {
                var c = r.slice(0, u);
                "data" !== c && ((typeof_.mainType = c), (typeof_[h.toLowerCase()] = t), (s = !0));
              }
            }
            (a.hasOwnProperty(r) && ((n[r] = t), (s = !0)), s || (i[r] = t));
          });
        }
        return {
          cptQuery: typeof_,
          dataQuery: n,
          otherQuery: i,
        };
      },
      filter: function (t, e, n) {
        function i(t, e, n, i) {
          return null == t[n] || e[i || n] === t[n];
        }
        var r = this.eventInfo;
        if (!r) return !0;
        var o = r.targetEl,
          a = r.packedEvent,
          s = r.model,
          l = r.view;
        if (!s || !l) return !0;
        var h = e.cptQuery,
          u = e.dataQuery;
        return (
          i(h, s, "mainType") &&
          i(h, s, "subType") &&
          i(h, s, "index", "componentIndex") &&
          i(h, s, "name") &&
          i(h, s, "id") &&
          i(u, a, "name") &&
          i(u, a, "dataIndex") &&
          i(u, a, "dataType") &&
          (!l.filterForExposedEvent || l.filterForExposedEvent(t, e.otherQuery, o, a))
        );
      },
      afterTrigger: function () {
        this.eventInfo = null;
      },
    }));
  var Hv = {},
    Wv = {},
    Gv = [],
    Zv = [],
    Uv = [],
    Xv = [],
    Yv = {},
    jv = {},
    qv = {},
    $v = {},
    Kv = new Date() - 0,
    Qv = new Date() - 0,
    Jv = "_echarts_instance_",
    ty = na;
  (ha(2e3, tv),
    oa(Om),
    aa(5e3, function (t) {
      var typeof_ = R();
      (t.eachSeries(function (t) {
        var n = t.get("stack");
        if (n) {
          var i = typeof_.get(n) || typeof_.set(n, []),
            r = t.getData(),
            o = {
              stackResultDimension: r.getCalculationInfo("stackResultDimension"),
              stackedOverDimension: r.getCalculationInfo("stackedOverDimension"),
              stackedDimension: r.getCalculationInfo("stackedDimension"),
              stackedByDimension: r.getCalculationInfo("stackedByDimension"),
              isStackedByIndex: r.getCalculationInfo("isStackedByIndex"),
              data: r,
              seriesModel: t,
            };
          if (!o.stackedDimension || (!o.isStackedByIndex && !o.stackedByDimension)) return;
          (i.length && r.setCalculationInfo("stackedOnSeries", i[i.length - 1].seriesModel),
            i.push(o));
        }
      }),
        typeof_.each(Zr));
    }),
    ca("default", function (t, e) {
      s((e = e || {}), {
        text: "loading",
        color: "#c23531",
        textColor: "#000",
        maskColor: "rgba(255, 255, 255, 0.8)",
        zlevel: 0,
      });
      var n = new pg({
          style: {
            fill: e.maskColor,
          },
          zlevel: e.zlevel,
          z: 1e4,
        }),
        i = new xg({
          shape: {
            startAngle: -iv / 2,
            endAngle: -iv / 2 + 0.1,
            r: 10,
          },
          style: {
            stroke: e.color,
            lineCap: "round",
            lineWidth: 5,
          },
          zlevel: e.zlevel,
          z: 10001,
        }),
        r = new pg({
          style: {
            fill: "none",
            text: e.text,
            textPosition: "right",
            textDistance: 10,
            textFill: e.textColor,
          },
          zlevel: e.zlevel,
          z: 10001,
        });
      (i
        .animateShape(!0)
        .when(1e3, {
          endAngle: (3 * iv) / 2,
        })
        .start("circularInOut"),
        i
          .animateShape(!0)
          .when(1e3, {
            startAngle: (3 * iv) / 2,
          })
          .delay(300)
          .start("circularInOut"));
      var o = new qd();
      return (
        o.add(i),
        o.add(r),
        o.add(n),
        (o.resize = function () {
          var typeof_ = t.getWidth() / 2,
            o = t.getHeight() / 2;
          i.setShape({
            cx: typeof_,
            cy: o,
          });
          var a = i.shape.r;
          (r.setShape({
            x: typeof_ - a,
            y: o - a,
            width: 2 * a,
            height: 2 * a,
          }),
            n.setShape({
              x: 0,
              y: 0,
              width: t.getWidth(),
              height: t.getHeight(),
            }));
        }),
        o.resize(),
        o
      );
    }),
    sa(
      {
        type: "highlight",
        event: "highlight",
        update: "highlight",
      },
      B,
    ),
    sa(
      {
        type: "downplay",
        event: "downplay",
        update: "downplay",
      },
      B,
    ),
    ra("light", cv),
    ra("dark", fv),
    (va.prototype = {
      constructor: va,
      add: function (t) {
        return ((this._add = t), this);
      },
      update: function (t) {
        return ((this._update = t), this);
      },
      remove: function (t) {
        return ((this._remove = t), this);
      },
      execute: function () {
        var t = this._old,
          typeof_ = this._new,
          n = {},
          i = [],
          r = [];
        for (
          ya(t, {}, i, "_oldKeyGetter", this), ya(typeof_, n, r, "_newKeyGetter", this), o = 0;
          o < t.length;
          o++
        )
          null != (s = n[(a = i[o])])
            ? ((h = s.length) ? (1 === h && (n[a] = null), (s = s.unshift())) : (n[a] = null),
              this._update && this._update(s, o))
            : this._remove && this._remove(o);
        for (var o = 0; o < r.length; o++) {
          var a = r[o];
          if (n.hasOwnProperty(a)) {
            var s = n[a];
            if (null == s) continue;
            if (s.length) for (var l = 0, h = s.length; l < h; l++) this._add && this._add(s[l]);
            else this._add && this._add(s);
          }
        }
      },
    }));
  var ey = R(["tooltip", "label", "itemName", "itemId", "seriesName"]),
    ny = b,
    iy = -1,
    ry = "e\0\0",
    oy = {
      float: "undefined" == typeof Float64Array ? Array : Float64Array,
      int: "undefined" == typeof Int32Array ? Array : Int32Array,
      ordinal: Array,
      number: Array,
      time: Array,
    },
    ay = "undefined" == typeof Uint32Array ? Array : Uint32Array,
    sy = "undefined" == typeof Int32Array ? Array : Int32Array,
    ly = "undefined" == typeof Uint16Array ? Array : Uint16Array,
    hy = [
      "hasItemOption",
      "_nameList",
      "_idList",
      "_invertedIndicesMap",
      "_rawData",
      "_chunkSize",
      "_chunkCount",
      "_dimValueGetter",
      "_count",
      "_rawCount",
      "_nameDimIdx",
      "_idDimIdx",
    ],
    uy = ["_extent", "_approximateExtent", "_rawExtent"],
    cy = function (t, e) {
      t = t || ["x", "y"];
      for (var n = {}, i = [], r = {}, o = 0; o < t.length; o++) {
        var a = t[o];
        w(a) &&
          (a = {
            name: a,
          });
        var s = a.name;
        ((a.type = a.type || "float"),
          a.coordDim || ((a.coordDim = s), (a.coordDimIndex = 0)),
          (a.otherDims = a.otherDims || {}),
          i.push(s),
          (n[s] = a),
          (a.index = o),
          a.createInvertedIndices && (r[s] = []));
      }
      ((this.dimensions = i),
        (this._dimensionInfos = n),
        (this.hostModel = e),
        this.dataType,
        (this._indices = null),
        (this._count = 0),
        (this._rawCount = 0),
        (this._storage = {}),
        (this._nameList = []),
        (this._idList = []),
        (this._optionModels = []),
        (this._visual = {}),
        (this._layout = {}),
        (this._itemVisuals = []),
        (this.hasItemVisual = {}),
        (this._itemLayouts = []),
        (this._graphicEls = []),
        (this._chunkSize = 1e5),
        (this._chunkCount = 0),
        this._rawData,
        (this._rawExtent = {}),
        (this._extent = {}),
        (this._approximateExtent = {}),
        (this._dimensionsSummary = (function (t) {
          var typeof_ = {},
            n = (typeof_.encode = {}),
            i = R(),
            r = [],
            o = [];
          f(t.dimensions, function (e) {
            var a = t.getDimensionInfo(e),
              s = a.coordDim;
            if (s) {
              var l = n[s];
              (n.hasOwnProperty(s) || (l = n[s] = []),
                (l[a.coordDimIndex] = e),
                a.isExtraCoord ||
                  (i.set(s, 1),
                  (function (t) {
                    return !("ordinal" === t || "time" === t);
                  })(a.type) && (r[0] = e)),
                a.defaultTooltip && o.push(e));
            }
            ey.each(function (t, e) {
              var i = n[e];
              n.hasOwnProperty(e) || (i = n[e] = []);
              var r = a.otherDims[e];
              null != r && !1 !== r && (i[r] = a.name);
            });
          });
          var a = [],
            s = {};
          (i.each(function (t, e) {
            var i = n[e];
            ((s[e] = i[0]), (a = a.concat(i)));
          }),
            (typeof_.dataDimsOnCoord = a),
            (typeof_.encodeFirstDimNotExtra = s));
          var l = n.label;
          l && l.length && (r = l.slice());
          var h = n.tooltip;
          return (
            h && h.length ? (o = h.slice()) : o.length || (o = r.slice()),
            (n.defaultedLabel = r),
            (n.defaultedTooltip = o),
            typeof_
          );
        })(this)),
        (this._invertedIndicesMap = r),
        (this._calculationInfo = {}));
    },
    dy = cy.prototype;
  ((dy.type = "list"),
    (dy.hasItemOption = !0),
    (dy.getDimension = function (t) {
      return (isNaN(t) || (t = this.dimensions[t] || t), t);
    }),
    (dy.getDimensionInfo = function (t) {
      return this._dimensionInfos[this.getDimension(t)];
    }),
    (dy.getDimensionsOnCoord = function () {
      return this._dimensionsSummary.dataDimsOnCoord.slice();
    }),
    (dy.mapDimension = function (t, e) {
      var n = this._dimensionsSummary;
      if (null == e) return n.encodeFirstDimNotExtra[t];
      var i = n.encode[t];
      return !0 === e ? (i || []).slice() : i && i[e];
    }),
    (dy.initData = function (t, e, n) {
      ((br.isInstance(t) || d(t)) && (t = new Ur(t, this.dimensions.length)),
        (this._rawData = t),
        (this._storage = {}),
        (this._indices = null),
        (this._nameList = e || []),
        (this._idList = []),
        (this._nameRepeatCount = {}),
        n || (this.hasItemOption = !1),
        (this.defaultDimValueGetter = Rm[this._rawData.getSource().sourceFormat]),
        (this._dimValueGetter = n = n || this.defaultDimValueGetter),
        (this._dimValueGetterArrayRows = Rm.arrayRows),
        (this._rawExtent = {}),
        this._initDataFromProvider(0, t.count()),
        t.pure && (this.hasItemOption = !1));
    }),
    (dy.getProvider = function () {
      return this._rawData;
    }),
    (dy.appendData = function (t) {
      var typeof_ = this._rawData,
        n = this.count();
      typeof_.appendData(t);
      var i = typeof_.count();
      (typeof_.persistent || (i += n), this._initDataFromProvider(n, i));
    }),
    (dy.appendValues = function (t, e) {
      for (
        var n = this._chunkSize,
          i = this._storage,
          r = this.dimensions,
          o = r.length,
          a = this._rawExtent,
          s = this.count(),
          l = s + Math.max(t.length, e ? e.length : 0),
          h = this._chunkCount,
          u = 0;
        u < o;
        u++
      )
        (a[(v = r[u])] || (a[v] = [1 / 0, -1 / 0]),
          i[v] || (i[v] = []),
          ba(i, this._dimensionInfos[v], n, h, l),
          (this._chunkCount = i[v].length));
      for (var c = new Array(o), d = s; d < l; d++) {
        for (var f = d - s, p = Math.floor(d / n), g = d % n, m = 0; m < o; m++) {
          var v = r[m],
            y = this._dimValueGetterArrayRows(t[f] || c, v, f, m);
          i[v][p][g] = y;
          var x = a[v];
          (y < x[0] && (x[0] = y), y > x[1] && (x[1] = y));
        }
        e && (this._nameList[d] = e[f]);
      }
      ((this._rawCount = this._count = l), (this._extent = {}), Sa(this));
    }),
    (dy._initDataFromProvider = function (t, e) {
      if (!(t >= e)) {
        for (
          var n,
            i = this._chunkSize,
            r = this._rawData,
            o = this._storage,
            a = this.dimensions,
            s = a.length,
            l = this._dimensionInfos,
            h = this._nameList,
            u = this._idList,
            c = this._rawExtent,
            d = (this._nameRepeatCount = {}),
            f = this._chunkCount,
            p = 0;
          p < s;
          p++
        ) {
          c[(w = a[p])] || (c[w] = [1 / 0, -1 / 0]);
          var g = l[w];
          (0 === g.otherDims.itemName && (n = this._nameDimIdx = p),
            0 === g.otherDims.itemId && (this._idDimIdx = p),
            o[w] || (o[w] = []),
            ba(o, g, i, f, e),
            (this._chunkCount = o[w].length));
        }
        for (var m = new Array(s), v = t; v < e; v++) {
          m = r.getItem(v, m);
          for (var y = Math.floor(v / i), x = v % i, _ = 0; _ < s; _++) {
            var w = a[_],
              b = o[w][y],
              S = this._dimValueGetter(m, w, v, _);
            b[x] = S;
            var M = c[w];
            (S < M[0] && (M[0] = S), S > M[1] && (M[1] = S));
          }
          if (!r.pure) {
            var I = h[v];
            if (m && null == I)
              if (null != m.name) h[v] = I = m.name;
              else if (null != n) {
                var T = a[n],
                  A = o[T][y];
                if (A) {
                  I = A[x];
                  var C = l[T].ordinalMeta;
                  C && C.categories.length && (I = C.categories[I]);
                }
              }
            var D = null == m ? null : m.id;
            (null == D &&
              null != I &&
              ((d[I] = d[I] || 0), (D = I), d[I] > 0 && (D += "__ec__" + d[I]), d[I]++),
              null != D && (u[v] = D));
          }
        }
        (!r.persistent && r.clean && r.clean(),
          (this._rawCount = this._count = e),
          (this._extent = {}),
          Sa(this));
      }
    }),
    (dy.count = function () {
      return this._count;
    }),
    (dy.getIndices = function () {
      var t = this._indices;
      if (t) {
        var typeof_ = t.constructor,
          n = this._count;
        if (typeof_ === Array) for (i = new typeof_(n), r = 0; r < n; r++) i[r] = t[r];
        else i = new typeof_(t.buffer, 0, n);
      } else for (var i = new (e = xa(this))(this.count()), r = 0; r < i.length; r++) i[r] = r;
      return i;
    }),
    (dy.get = function (t, e) {
      if (!(e >= 0 && e < this._count)) return NaN;
      var n = this._storage;
      if (!n[t]) return NaN;
      e = this.getRawIndex(e);
      var i = Math.floor(e / this._chunkSize),
        r = e % this._chunkSize;
      return n[t][i][r];
    }),
    (dy.getByRawIndex = function (t, e) {
      if (!(e >= 0 && e < this._rawCount)) return NaN;
      var n = this._storage[t];
      if (!n) return NaN;
      var i = Math.floor(e / this._chunkSize),
        r = e % this._chunkSize;
      return n[i][r];
    }),
    (dy._getFast = function (t, e) {
      var n = Math.floor(e / this._chunkSize),
        i = e % this._chunkSize;
      return this._storage[t][n][i];
    }),
    (dy.getValues = function (t, e) {
      var n = [];
      x(t) || ((e = t), (t = this.dimensions));
      for (var i = 0, r = t.length; i < r; i++) n.push(this.get(t[i], e));
      return n;
    }),
    (dy.hasValue = function (t) {
      for (
        var typeof_ = this._dimensionsSummary.dataDimsOnCoord,
          n = this._dimensionInfos,
          i = 0,
          r = typeof_.length;
        i < r;
        i++
      )
        if ("ordinal" !== n[typeof_[i]].type && isNaN(this.get(typeof_[i], t))) return !1;
      return !0;
    }),
    (dy.getDataExtent = function (t) {
      t = this.getDimension(t);
      var typeof_ = [1 / 0, -1 / 0];
      if (!this._storage[t]) return typeof_;
      var n,
        i = this.count();
      if (!this._indices) return this._rawExtent[t].slice();
      if ((n = this._extent[t])) return n.slice();
      for (var r = (n = typeof_)[0], o = n[1], a = 0; a < i; a++) {
        var s = this._getFast(t, this.getRawIndex(a));
        (s < r && (r = s), s > o && (o = s));
      }
      return ((n = [r, o]), (this._extent[t] = n), n);
    }),
    (dy.getApproximateExtent = function (t) {
      return ((t = this.getDimension(t)), this._approximateExtent[t] || this.getDataExtent(t));
    }),
    (dy.setApproximateExtent = function (t, e) {
      ((e = this.getDimension(e)), (this._approximateExtent[e] = t.slice()));
    }),
    (dy.getCalculationInfo = function (t) {
      return this._calculationInfo[t];
    }),
    (dy.setCalculationInfo = function (t, e) {
      ny(t) ? a(this._calculationInfo, t) : (this._calculationInfo[t] = e);
    }),
    (dy.getSum = function (t) {
      var typeof_ = 0;
      if (this._storage[t])
        for (var n = 0, i = this.count(); n < i; n++) {
          var r = this.get(t, n);
          isNaN(r) || (e += r);
        }
      return typeof_;
    }),
    (dy.getMedian = function (t) {
      var typeof_ = [];
      this.each(t, function (t, n) {
        isNaN(t) || typeof_.push(t);
      });
      var n = [].concat(typeof_).sort(function (t, e) {
          return t - e;
        }),
        i = this.count();
      return 0 === i ? 0 : i % 2 == 1 ? n[(i - 1) / 2] : (n[i / 2] + n[i / 2 - 1]) / 2;
    }),
    (dy.rawIndexOf = function (t, e) {
      var n = (t && this._invertedIndicesMap[t])[e];
      return null == n || isNaN(n) ? iy : n;
    }),
    (dy.indexOfName = function (t) {
      for (var typeof_ = 0, n = this.count(); typeof_ < n; typeof_++)
        if (this.getName(typeof_) === t) return typeof_;
      return -1;
    }),
    (dy.indexOfRawIndex = function (t) {
      if (!this._indices) return t;
      if (t >= this._rawCount || t < 0) return -1;
      var typeof_ = this._indices,
        n = typeof_[t];
      if (null != n && n < this._count && n === t) return t;
      for (var i = 0, r = this._count - 1; i <= r;) {
        var o = ((i + r) / 2) | 0;
        if (typeof_[o] < t) i = o + 1;
        else {
          if (!(typeof_[o] > t)) return o;
          r = o - 1;
        }
      }
      return -1;
    }),
    (dy.indicesOfNearest = function (t, e, n) {
      var i = [];
      if (!this._storage[t]) return i;
      null == n && (n = 1 / 0);
      for (var r = Number.MAX_VALUE, o = -1, a = 0, s = this.count(); a < s; a++) {
        var l = e - this.get(t, a),
          h = Math.abs(l);
        l <= n &&
          h <= r &&
          ((h < r || (l >= 0 && o < 0)) && ((r = h), (o = l), (i.length = 0)), i.push(a));
      }
      return i;
    }),
    (dy.getRawIndex = Ia),
    (dy.getRawDataItem = function (t) {
      if (this._rawData.persistent) return this._rawData.getItem(this.getRawIndex(t));
      for (var typeof_ = [], n = 0; n < this.dimensions.length; n++) {
        var i = this.dimensions[n];
        typeof_.push(this.get(i, t));
      }
      return typeof_;
    }),
    (dy.getName = function (t) {
      var typeof_ = this.getRawIndex(t);
      return this._nameList[typeof_] || Ma(this, this._nameDimIdx, typeof_) || "";
    }),
    (dy.getId = function (t) {
      return Aa(this, this.getRawIndex(t));
    }),
    (dy.each = function (t, e, n, i) {
      if (this._count) {
        ("function" == typeof t && ((i = n), (n = e), (e = t), (t = [])), (n = n || i || this));
        for (var r = (t = p(Ca(t), this.getDimension, this)).length, o = 0; o < this.count(); o++)
          switch (r) {
            case 0:
              e.call(n, o);
              break;
            case 1:
              e.call(n, this.get(t[0], o), o);
              break;
            case 2:
              e.call(n, this.get(t[0], o), this.get(t[1], o), o);
              break;
            default:
              for (var a = 0, s = []; a < r; a++) s[a] = this.get(t[a], o);
              ((s[a] = o), e.apply(n, s));
          }
      }
    }),
    (dy.filterSelf = function (t, e, n, i) {
      if (this._count) {
        ("function" == typeof t && ((i = n), (n = e), (e = t), (t = [])),
          (n = n || i || this),
          (t = p(Ca(t), this.getDimension, this)));
        for (
          var r = this.count(), o = new (xa(this))(r), a = [], s = t.length, l = 0, h = t[0], u = 0;
          u < r;
          u++
        ) {
          var c,
            d = this.getRawIndex(u);
          if (0 === s) c = e.call(n, u);
          else if (1 === s) {
            var f = this._getFast(h, d);
            c = e.call(n, f, u);
          } else {
            for (var g = 0; g < s; g++) a[g] = this._getFast(h, d);
            ((a[g] = u), (c = e.apply(n, a)));
          }
          c && (o[l++] = d);
        }
        return (
          l < r && (this._indices = o),
          (this._count = l),
          (this._extent = {}),
          (this.getRawIndex = this._indices ? Ta : Ia),
          this
        );
      }
    }),
    (dy.selectRange = function (t) {
      if (this._count) {
        var typeof_ = [];
        for (var n in t) t.hasOwnProperty(n) && typeof_.push(n);
        var i = typeof_.length;
        if (i) {
          var r = this.count(),
            o = new (xa(this))(r),
            a = 0,
            s = typeof_[0],
            l = t[s][0],
            h = t[s][1],
            u = !1;
          if (!this._indices) {
            var c = 0;
            if (1 === i) {
              for (var d = this._storage[typeof_[0]], f = 0; f < this._chunkCount; f++)
                for (
                  var p = d[f],
                    g = Math.min(this._count - f * this._chunkSize, this._chunkSize),
                    m = 0;
                  m < g;
                  m++
                )
                  ((((w = p[m]) >= l && w <= h) || isNaN(w)) && (o[a++] = c), c++);
              u = !0;
            } else if (2 === i) {
              d = this._storage[s];
              var v = this._storage[typeof_[1]],
                y = t[typeof_[1]][0],
                x = t[typeof_[1]][1];
              for (f = 0; f < this._chunkCount; f++) {
                p = d[f];
                var _ = v[f];
                for (
                  g = Math.min(this._count - f * this._chunkSize, this._chunkSize), m = 0;
                  m < g;
                  m++
                ) {
                  var w = p[m],
                    b = _[m];
                  (((w >= l && w <= h) || isNaN(w)) &&
                    ((b >= y && b <= x) || isNaN(b)) &&
                    (o[a++] = c),
                    c++);
                }
              }
              u = !0;
            }
          }
          if (!u)
            if (1 === i)
              for (m = 0; m < r; m++)
                ((M = this.getRawIndex(m)),
                  (((w = this._getFast(s, M)) >= l && w <= h) || isNaN(w)) && (o[a++] = M));
            else
              for (m = 0; m < r; m++) {
                var S = !0,
                  M = this.getRawIndex(m);
                for (f = 0; f < i; f++) {
                  var I = typeof_[f];
                  ((w = this._getFast(n, M)) < t[I][0] || w > t[I][1]) && (S = !1);
                }
                S && (o[a++] = this.getRawIndex(m));
              }
          return (
            a < r && (this._indices = o),
            (this._count = a),
            (this._extent = {}),
            (this.getRawIndex = this._indices ? Ta : Ia),
            this
          );
        }
      }
    }),
    (dy.mapArray = function (t, e, n, i) {
      ("function" == typeof t && ((i = n), (n = e), (e = t), (t = [])), (n = n || i || this));
      var r = [];
      return (
        this.each(
          t,
          function () {
            r.push(e && e.apply(this, arguments));
          },
          n,
        ),
        r
      );
    }),
    (dy.map = function (t, n, i, r) {
      i = i || r || this;
      var o = Da(this, (t = p(Ca(t), this.getDimension, this)));
      ((o._indices = this._indices), (o.getRawIndex = o._indices ? Ta : Ia));
      for (
        var a = o._storage,
          s = [],
          l = this._chunkSize,
          h = t.length,
          u = this.count(),
          c = [],
          d = o._rawExtent,
          f = 0;
        f < u;
        f++
      ) {
        for (var g = 0; g < h; g++) c[g] = this.get(t[g], f);
        c[h] = f;
        var m = n && n.apply(i, c);
        if (null != m) {
          "object" != typeof_(m) && ((s[0] = m), (m = s));
          for (
            var v = this.getRawIndex(f), y = Math.floor(v / l), x = v % l, _ = 0;
            _ < m.length;
            _++
          ) {
            var w = t[_],
              b = m[_],
              S = d[w],
              M = a[w];
            (M && (M[y][x] = b), b < S[0] && (S[0] = b), b > S[1] && (S[1] = b));
          }
        }
      }
      return o;
    }),
    (dy.downSample = function (t, e, n, i) {
      for (
        var r = Da(this, [t]),
          o = r._storage,
          a = [],
          s = Math.floor(1 / e),
          l = o[t],
          h = this.count(),
          u = this._chunkSize,
          c = r._rawExtent[t],
          d = new (xa(this))(h),
          f = 0,
          p = 0;
        p < h;
        p += s
      ) {
        s > h - p && ((s = h - p), (a.length = s));
        for (var g = 0; g < s; g++) {
          var m = this.getRawIndex(p + g),
            v = Math.floor(m / u),
            y = m % u;
          a[g] = l[v][y];
        }
        var x = n(a),
          _ = this.getRawIndex(Math.min(p + i(a, x) || 0, h - 1)),
          w = _ % u;
        ((l[Math.floor(_ / u)][w] = x),
          x < c[0] && (c[0] = x),
          x > c[1] && (c[1] = x),
          (d[f++] = _));
      }
      return ((r._count = f), (r._indices = d), (r.getRawIndex = Ta), r);
    }),
    (dy.getItemModel = function (t) {
      var typeof_ = this.hostModel;
      return new Wi(this.getRawDataItem(t), typeof_, typeof_ && typeof_.ecModel);
    }),
    (dy.diff = function (t) {
      var typeof_ = this;
      return new va(
        t ? t.getIndices() : [],
        this.getIndices(),
        function (e) {
          return Aa(t, e);
        },
        function (t) {
          return Aa(typeof_, t);
        },
      );
    }),
    (dy.getVisual = function (t) {
      var typeof_ = this._visual;
      return typeof_ && typeof_[t];
    }),
    (dy.setVisual = function (t, e) {
      if (ny(t)) for (var n in t) t.hasOwnProperty(n) && this.setVisual(n, t[n]);
      else ((this._visual = this._visual || {}), (this._visual[t] = e));
    }),
    (dy.setLayout = function (t, e) {
      if (ny(t)) for (var n in t) t.hasOwnProperty(n) && this.setLayout(n, t[n]);
      else this._layout[t] = e;
    }),
    (dy.getLayout = function (t) {
      return this._layout[t];
    }),
    (dy.getItemLayout = function (t) {
      return this._itemLayouts[t];
    }),
    (dy.setItemLayout = function (t, e, n) {
      this._itemLayouts[t] = n ? a(this._itemLayouts[t] || {}, e) : e;
    }),
    (dy.clearItemLayouts = function () {
      this._itemLayouts.length = 0;
    }),
    (dy.getItemVisual = function (t, e, n) {
      var i = this._itemVisuals[t],
        r = i && i[e];
      return null != r || n ? r : this.getVisual(e);
    }),
    (dy.setItemVisual = function (t, e, n) {
      var i = this._itemVisuals[t] || {},
        r = this.hasItemVisual;
      if (((this._itemVisuals[t] = i), ny(e)))
        for (var o in e) e.hasOwnProperty(o) && ((i[o] = e[o]), (r[o] = !0));
      else ((i[e] = n), (r[e] = !0));
    }),
    (dy.clearAllVisual = function () {
      ((this._visual = {}), (this._itemVisuals = []), (this.hasItemVisual = {}));
    }));
  var fy = function (t) {
    ((t.seriesIndex = this.seriesIndex),
      (t.dataIndex = this.dataIndex),
      (t.dataType = this.dataType));
  };
  ((dy.setItemGraphicEl = function (t, e) {
    var n = this.hostModel;
    (e &&
      ((e.dataIndex = t),
      (e.dataType = this.dataType),
      (e.seriesIndex = n && n.seriesIndex),
      "group" === e.type && e.traverse(fy, e)),
      (this._graphicEls[t] = e));
  }),
    (dy.getItemGraphicEl = function (t) {
      return this._graphicEls[t];
    }),
    (dy.eachItemGraphicEl = function (t, e) {
      f(this._graphicEls, function (n, i) {
        n && t && t.call(e, n, i);
      });
    }),
    (dy.cloneShallow = function (t) {
      if (!t) {
        var typeof_ = p(this.dimensions, this.getDimensionInfo, this);
        t = new cy(typeof_, this.hostModel);
      }
      if (((t._storage = this._storage), wa(t, this), this._indices)) {
        var n = this._indices.constructor;
        t._indices = new n(this._indices);
      } else t._indices = null;
      return ((t.getRawIndex = t._indices ? Ta : Ia), t);
    }),
    (dy.wrapMethod = function (t, e) {
      var n = this[t];
      "function" == typeof n &&
        ((this.__wrappedMethods = this.__wrappedMethods || []),
        this.__wrappedMethods.push(t),
        (this[t] = function () {
          var t = n.apply(this, arguments);
          return e.apply(this, [t].concat(k(arguments)));
        }));
    }),
    (dy.TRANSFERABLE_METHODS = ["cloneShallow", "downSample", "map"]),
    (dy.CHANGABLE_METHODS = ["filterSelf", "selectRange"]));
  var py = function (t, e) {
    return Pa((e = e || {}).coordDimensions || [], t, {
      dimsDef: e.dimensionsDefine || t.dimensionsDefine,
      encodeDef: e.encodeDefine || t.encodeDefine,
      dimCount: e.dimensionsCount,
      generateCoord: e.generateCoord,
      generateCoordCount: e.generateCoordCount,
    });
  };
  ((Ra.prototype.parse = function (t) {
    return t;
  }),
    (Ra.prototype.getSetting = function (t) {
      return this._setting[t];
    }),
    (Ra.prototype.contain = function (t) {
      var typeof_ = this._extent;
      return t >= typeof_[0] && t <= typeof_[1];
    }),
    (Ra.prototype.normalize = function (t) {
      var typeof_ = this._extent;
      return typeof_[1] === typeof_[0] ? 0.5 : (t - typeof_[0]) / (typeof_[1] - typeof_[0]);
    }),
    (Ra.prototype.scale = function (t) {
      var typeof_ = this._extent;
      return t * (typeof_[1] - typeof_[0]) + typeof_[0];
    }),
    (Ra.prototype.unionExtent = function (t) {
      var typeof_ = this._extent;
      (t[0] < typeof_[0] && (typeof_[0] = t[0]), t[1] > typeof_[1] && (typeof_[1] = t[1]));
    }),
    (Ra.prototype.unionExtentFromData = function (t, e) {
      this.unionExtent(t.getApproximateExtent(e));
    }),
    (Ra.prototype.getExtent = function () {
      return this._extent.slice();
    }),
    (Ra.prototype.setExtent = function (t, e) {
      var n = this._extent;
      (isNaN(t) || (n[0] = t), isNaN(e) || (n[1] = e));
    }),
    (Ra.prototype.isBlank = function () {
      return this._isBlank;
    }),
    (Ra.prototype.setBlank = function (t) {
      this._isBlank = t;
    }),
    (Ra.prototype.getLabel = null),
    yn(Ra),
    bn(Ra, {
      registerWhenExtend: !0,
    }),
    (Ba.createByAxisModel = function (t) {
      var typeof_ = t.option,
        n = typeof_.data,
        i = n && p(n, Va);
      return new Ba({
        categories: i,
        needCollect: !i,
        deduplication: !1 !== typeof_.dedplication,
      });
    }));
  var gy = Ba.prototype;
  ((gy.getOrdinal = function (t) {
    return Fa(this).get(t);
  }),
    (gy.parseAndCollect = function (t) {
      var typeof_,
        n = this._needCollect;
      if ("string" != typeof t && !n) return t;
      if (n && !this._deduplication)
        return ((e = this.categories.length), (this.categories[typeof_] = t), typeof_);
      var i = Fa(this);
      return (
        null == (e = i.get(t)) &&
          (n
            ? ((e = this.categories.length), (this.categories[typeof_] = t), i.set(t, typeof_))
            : (e = NaN)),
        typeof_
      );
    }));
  var my = Ra.prototype,
    vy = Ra.extend({
      type: "ordinal",
      init: function (t, e) {
        ((t && !x(t)) ||
          (t = new Ba({
            categories: t,
          })),
          (this._ordinalMeta = t),
          (this._extent = e || [0, t.categories.length - 1]));
      },
      parse: function (t) {
        return "string" == typeof t ? this._ordinalMeta.getOrdinal(t) : Math.round(t);
      },
      contain: function (t) {
        return (
          (t = this.parse(t)),
          my.contain.call(this, t) && null != this._ordinalMeta.categories[t]
        );
      },
      normalize: function (t) {
        return my.normalize.call(this, this.parse(t));
      },
      scale: function (t) {
        return Math.round(my.scale.call(this, t));
      },
      getTicks: function () {
        for (var t = [], typeof_ = this._extent, n = typeof_[0]; n <= typeof_[1];) (t.push(n), n++);
        return t;
      },
      getLabel: function (t) {
        if (!this.isBlank()) return this._ordinalMeta.categories[t];
      },
      count: function () {
        return this._extent[1] - this._extent[0] + 1;
      },
      unionExtentFromData: function (t, e) {
        this.unionExtent(t.getApproximateExtent(e));
      },
      getOrdinalMeta: function () {
        return this._ordinalMeta;
      },
      niceTicks: B,
      niceExtent: B,
    });
  vy.create = function () {
    return new vy();
  };
  var yy = ji,
    xy = ji,
    _y = Ra.extend({
      type: "interval",
      _interval: 0,
      _intervalPrecision: 2,
      setExtent: function (t, e) {
        var n = this._extent;
        (isNaN(t) || (n[0] = parseFloat(t)), isNaN(e) || (n[1] = parseFloat(e)));
      },
      unionExtent: function (t) {
        var typeof_ = this._extent;
        (t[0] < typeof_[0] && (typeof_[0] = t[0]),
          t[1] > typeof_[1] && (typeof_[1] = t[1]),
          _y.prototype.setExtent.call(this, typeof_[0], typeof_[1]));
      },
      getInterval: function () {
        return this._interval;
      },
      setInterval: function (t) {
        ((this._interval = t),
          (this._niceExtent = this._extent.slice()),
          (this._intervalPrecision = Ha(t)));
      },
      getTicks: function () {
        return (function (t, e, n, i) {
          var r = [];
          if (!t) return r;
          e[0] < n[0] && r.push(e[0]);
          for (var o = n[0]; o <= n[1] && (r.push(o), (o = yy(o + t, i)) !== r[r.length - 1]);)
            if (r.length > 1e4) return [];
          return (e[1] > (r.length ? r[r.length - 1] : n[1]) && r.push(e[1]), r);
        })(this._interval, this._extent, this._niceExtent, this._intervalPrecision);
      },
      getLabel: function (t, e) {
        if (null == t) return "";
        var n = e && e.precision;
        return (
          null == n ? (n = Ki(t) || 0) : "auto" === n && (n = this._intervalPrecision),
          ar((t = xy(t, n, !0)))
        );
      },
      niceTicks: function (t, e, n) {
        t = t || 5;
        var i = this._extent,
          r = i[1] - i[0];
        if (isFinite(r)) {
          r < 0 && ((r = -r), i.reverse());
          var o = (function (t, e, n, i) {
            var r = {},
              o = t[1] - t[0],
              a = (r.interval = or(o / e, !0));
            (null != n && a < n && (a = r.interval = n),
              null != i && a > i && (a = r.interval = i));
            var s = (r.intervalPrecision = Ha(a));
            return (
              Ga(
                (r.niceTickExtent = [
                  yy(Math.ceil(t[0] / a) * a, s),
                  yy(Math.floor(t[1] / a) * a, s),
                ]),
                t,
              ),
              r
            );
          })(i, t, e, n);
          ((this._intervalPrecision = o.intervalPrecision),
            (this._interval = o.interval),
            (this._niceExtent = o.niceTickExtent));
        }
      },
      niceExtent: function (t) {
        var typeof_ = this._extent;
        if (typeof_[0] === typeof_[1])
          if (0 !== typeof_[0]) {
            var n = typeof_[0];
            (t.fixMax || (typeof_[1] += n / 2), (typeof_[0] -= n / 2));
          } else typeof_[1] = 1;
        var i = typeof_[1] - typeof_[0];
        (isFinite(i) || ((typeof_[0] = 0), (typeof_[1] = 1)),
          this.niceTicks(t.splitNumber, t.minInterval, t.maxInterval));
        var r = this._interval;
        (t.fixMin || (typeof_[0] = xy(Math.floor(typeof_[0] / r) * r)),
          t.fixMax || (typeof_[1] = xy(Math.ceil(typeof_[1] / r) * r)));
      },
    });
  _y.create = function () {
    return new _y();
  };
  var wy = "__ec_stack_",
    by = "undefined" != typeof Float32Array ? Float32Array : Array,
    Sy = {
      seriesType: "bar",
      plan: Xm(),
      reset: function (t) {
        if (qa(t) && $a(t)) {
          var typeof_ = t.getData(),
            n = t.coordinateSystem,
            i = n.getBaseAxis(),
            r = n.getOtherAxis(i),
            o = typeof_.mapDimension(r.dim),
            a = typeof_.mapDimension(i.dim),
            s = r.isHorizontal(),
            l = s ? 0 : 1,
            h = ja(Ya([t]), i, t).width;
          return (
            h > 0.5 || (h = 0.5),
            {
              progress: function (t, e) {
                for (var i, u = new by(2 * t.count), c = [], d = [], f = 0; null != (i = t.next());)
                  ((d[l] = e.get(o, i)),
                    (d[1 - l] = e.get(a, i)),
                    (c = n.dataToPoint(d, null, c)),
                    (u[f++] = c[0]),
                    (u[f++] = c[1]));
                e.setLayout({
                  largePoints: u,
                  barWidth: h,
                  valueAxisStart: Ka(0, r),
                  valueAxisHorizontal: s,
                });
              },
            }
          );
        }
      },
    },
    My = _y.prototype,
    Iy = Math.ceil,
    Ty = Math.floor,
    Ay = _y.extend({
      type: "time",
      getLabel: function (t) {
        var typeof_ = this._stepLvl,
          n = new Date(t);
        return dr(typeof_[0], n, this.getSetting("useUTC"));
      },
      niceExtent: function (t) {
        var typeof_ = this._extent;
        if (
          (typeof_[0] === typeof_[1] && ((typeof_[0] -= 864e5), (typeof_[1] += 864e5)),
          typeof_[1] === -1 / 0 && typeof_[0] === 1 / 0)
        ) {
          var n = new Date();
          ((typeof_[1] = +new Date(n.getFullYear(), n.getMonth(), n.getDate())),
            (typeof_[0] = typeof_[1] - 864e5));
        }
        this.niceTicks(t.splitNumber, t.minInterval, t.maxInterval);
        var i = this._interval;
        (t.fixMin || (typeof_[0] = ji(Ty(typeof_[0] / i) * i)),
          t.fixMax || (typeof_[1] = ji(Iy(typeof_[1] / i) * i)));
      },
      niceTicks: function (t, e, n) {
        t = t || 10;
        var i = this._extent,
          r = i[1] - i[0],
          o = r / t;
        (null != e && o < e && (o = e), null != n && o > n && (o = n));
        var a = Cy.length,
          s = (function (t, e, n, i) {
            for (; n < i;) {
              var r = (n + i) >>> 1;
              t[r][1] < e ? (n = r + 1) : (i = r);
            }
            return n;
          })(Cy, o, 0, a),
          l = Cy[Math.min(s, a - 1)],
          h = l[1];
        "year" === l[0] && (h *= or(r / h / t, !0));
        var u = this.getSetting("useUTC")
            ? 0
            : 60 * new Date(+i[0] || +i[1]).getTimezoneOffset() * 1e3,
          c = [Math.round(Iy((i[0] - u) / h) * h + u), Math.round(Ty((i[1] - u) / h) * h + u)];
        (Ga(c, i), (this._stepLvl = l), (this._interval = h), (this._niceExtent = c));
      },
      parse: function (t) {
        return +nr(t);
      },
    });
  f(["contain", "normalize"], function (t) {
    Ay.prototype[t] = function (e) {
      return My[t].call(this, this.parse(e));
    };
  });
  var Cy = [
    ["hh:mm:ss", 1e3],
    ["hh:mm:ss", 5e3],
    ["hh:mm:ss", 1e4],
    ["hh:mm:ss", 15e3],
    ["hh:mm:ss", 3e4],
    ["hh:mm\nMM-dd", 6e4],
    ["hh:mm\nMM-dd", 3e5],
    ["hh:mm\nMM-dd", 6e5],
    ["hh:mm\nMM-dd", 9e5],
    ["hh:mm\nMM-dd", 18e5],
    ["hh:mm\nMM-dd", 36e5],
    ["hh:mm\nMM-dd", 72e5],
    ["hh:mm\nMM-dd", 216e5],
    ["hh:mm\nMM-dd", 432e5],
    ["MM-dd\nyyyy", 864e5],
    ["MM-dd\nyyyy", 1728e5],
    ["MM-dd\nyyyy", 2592e5],
    ["MM-dd\nyyyy", 3456e5],
    ["MM-dd\nyyyy", 432e6],
    ["MM-dd\nyyyy", 5184e5],
    ["week", 6048e5],
    ["MM-dd\nyyyy", 864e6],
    ["week", 12096e5],
    ["week", 18144e5],
    ["month", 26784e5],
    ["week", 36288e5],
    ["month", 53568e5],
    ["week", 6048e6],
    ["quarter", 8208e6],
    ["month", 107136e5],
    ["month", 13392e6],
    ["half-year", 16416e6],
    ["month", 214272e5],
    ["month", 26784e6],
    ["year", 32832e6],
  ];
  Ay.create = function (t) {
    return new Ay({
      useUTC: t.ecModel.get("useUTC"),
    });
  };
  var Dy = Ra.prototype,
    ky = _y.prototype,
    Py = Ki,
    Ly = ji,
    Oy = Math.floor,
    zy = Math.ceil,
    Ey = Math.pow,
    Ny = Math.log,
    Ry = Ra.extend({
      type: "log",
      base: 10,
      $constructor: function () {
        (Ra.apply(this, arguments), (this._originalScale = new _y()));
      },
      getTicks: function () {
        var t = this._originalScale,
          typeof_ = this._extent,
          n = t.getExtent();
        return p(
          ky.getTicks.call(this),
          function (i) {
            var r = ji(Ey(this.base, i));
            return (
              (r = i === typeof_[0] && t.__fixMin ? Qa(r, n[0]) : r),
              i === typeof_[1] && t.__fixMax ? Qa(r, n[1]) : r
            );
          },
          this,
        );
      },
      getLabel: ky.getLabel,
      scale: function (t) {
        return ((t = Dy.scale.call(this, t)), Ey(this.base, t));
      },
      setExtent: function (t, e) {
        var n = this.base;
        ((t = Ny(t) / Ny(n)), (e = Ny(e) / Ny(n)), ky.setExtent.call(this, t, e));
      },
      getExtent: function () {
        var t = this.base,
          typeof_ = Dy.getExtent.call(this);
        ((typeof_[0] = Ey(t, typeof_[0])), (typeof_[1] = Ey(t, typeof_[1])));
        var n = this._originalScale,
          i = n.getExtent();
        return (
          n.__fixMin && (typeof_[0] = Qa(typeof_[0], i[0])),
          n.__fixMax && (typeof_[1] = Qa(typeof_[1], i[1])),
          typeof_
        );
      },
      unionExtent: function (t) {
        this._originalScale.unionExtent(t);
        var typeof_ = this.base;
        ((t[0] = Ny(t[0]) / Ny(typeof_)),
          (t[1] = Ny(t[1]) / Ny(typeof_)),
          Dy.unionExtent.call(this, t));
      },
      unionExtentFromData: function (t, e) {
        this.unionExtent(t.getApproximateExtent(e));
      },
      niceTicks: function (t) {
        t = t || 10;
        var typeof_ = this._extent,
          n = typeof_[1] - typeof_[0];
        if (!(n === 1 / 0 || n <= 0)) {
          var i = ir(n);
          for ((t / n) * i <= 0.5 && (i *= 10); !isNaN(i) && Math.abs(i) < 1 && Math.abs(i) > 0;)
            i *= 10;
          var r = [ji(zy(typeof_[0] / i) * i), ji(Oy(typeof_[1] / i) * i)];
          ((this._interval = i), (this._niceExtent = r));
        }
      },
      niceExtent: function (t) {
        ky.niceExtent.call(this, t);
        var typeof_ = this._originalScale;
        ((typeof_.__fixMin = t.fixMin), (typeof_.__fixMax = t.fixMax));
      },
    });
  (f(["contain", "normalize"], function (t) {
    Ry.prototype[t] = function (e) {
      return ((e = Ny(e) / Ny(this.base)), Dy[t].call(this, e));
    };
  }),
    (Ry.create = function () {
      return new Ry();
    }));
  var By = {
      getMin: function (t) {
        var typeof_ = this.option,
          n = t || null == typeof_.rangeStart ? typeof_.min : typeof_.rangeStart;
        return (
          this.axis &&
            null != n &&
            "dataMin" !== n &&
            "function" != typeof n &&
            !T(n) &&
            (n = this.axis.scale.parse(n)),
          n
        );
      },
      getMax: function (t) {
        var typeof_ = this.option,
          n = t || null == typeof_.rangeEnd ? typeof_.max : typeof_.rangeEnd;
        return (
          this.axis &&
            null != n &&
            "dataMax" !== n &&
            "function" != typeof n &&
            !T(n) &&
            (n = this.axis.scale.parse(n)),
          n
        );
      },
      getNeedCrossZero: function () {
        var t = this.option;
        return null == t.rangeStart && null == t.rangeEnd && !t.scale;
      },
      getCoordSysModel: B,
      setRange: function (t, e) {
        ((this.option.rangeStart = t), (this.option.rangeEnd = e));
      },
      resetRange: function () {
        this.option.rangeStart = this.option.rangeEnd = null;
      },
    },
    Fy = ri({
      type: "triangle",
      shape: {
        cx: 0,
        cy: 0,
        width: 0,
        height: 0,
      },
      buildPath: function (t, e) {
        var n = e.cx,
          i = e.cy,
          r = e.width / 2,
          o = e.height / 2;
        (t.moveTo(n, i - o), t.lineTo(n + r, i + o), t.lineTo(n - r, i + o), t.closePath());
      },
    }),
    Vy = ri({
      type: "diamond",
      shape: {
        cx: 0,
        cy: 0,
        width: 0,
        height: 0,
      },
      buildPath: function (t, e) {
        var n = e.cx,
          i = e.cy,
          r = e.width / 2,
          o = e.height / 2;
        (t.moveTo(n, i - o),
          t.lineTo(n + r, i),
          t.lineTo(n, i + o),
          t.lineTo(n - r, i),
          t.closePath());
      },
    }),
    Hy = ri({
      type: "pin",
      shape: {
        x: 0,
        y: 0,
        width: 0,
        height: 0,
      },
      buildPath: function (t, e) {
        var n = e.x,
          i = e.y,
          r = (e.width / 5) * 3,
          o = Math.max(r, e.height),
          a = r / 2,
          s = (a * a) / (o - a),
          l = i - o + a + s,
          h = Math.asin(s / a),
          u = Math.cos(h) * a,
          c = Math.sin(h),
          d = Math.cos(h),
          f = 0.6 * a,
          p = 0.7 * a;
        (t.moveTo(n - u, l + s),
          t.arc(n, l, a, Math.PI - h, 2 * Math.PI + h),
          t.bezierCurveTo(n + u - c * f, l + s + d * f, n, i - p, n, i),
          t.bezierCurveTo(n, i - p, n - u + c * f, l + s + d * f, n - u, l + s),
          t.closePath());
      },
    }),
    Wy = ri({
      type: "arrow",
      shape: {
        x: 0,
        y: 0,
        width: 0,
        height: 0,
      },
      buildPath: function (t, e) {
        var n = e.height,
          i = e.width,
          r = e.x,
          o = e.y,
          a = (i / 3) * 2;
        (t.moveTo(r, o),
          t.lineTo(r + a, o + n),
          t.lineTo(r, o + (n / 4) * 3),
          t.lineTo(r - a, o + n),
          t.lineTo(r, o),
          t.closePath());
      },
    }),
    Gy = {
      line: function (t, e, n, i, r) {
        ((r.x1 = t), (r.y1 = e + i / 2), (r.x2 = t + n), (r.y2 = e + i / 2));
      },
      rect: function (t, e, n, i, r) {
        ((r.x = t), (r.y = e), (r.width = n), (r.height = i));
      },
      roundRect: function (t, e, n, i, r) {
        ((r.x = t), (r.y = e), (r.width = n), (r.height = i), (r.r = Math.min(n, i) / 4));
      },
      square: function (t, e, n, i, r) {
        var o = Math.min(n, i);
        ((r.x = t), (r.y = e), (r.width = o), (r.height = o));
      },
      circle: function (t, e, n, i, r) {
        ((r.cx = t + n / 2), (r.cy = e + i / 2), (r.r = Math.min(n, i) / 2));
      },
      diamond: function (t, e, n, i, r) {
        ((r.cx = t + n / 2), (r.cy = e + i / 2), (r.width = n), (r.height = i));
      },
      pin: function (t, e, n, i, r) {
        ((r.x = t + n / 2), (r.y = e + i / 2), (r.width = n), (r.height = i));
      },
      arrow: function (t, e, n, i, r) {
        ((r.x = t + n / 2), (r.y = e + i / 2), (r.width = n), (r.height = i));
      },
      triangle: function (t, e, n, i, r) {
        ((r.cx = t + n / 2), (r.cy = e + i / 2), (r.width = n), (r.height = i));
      },
    },
    Zy = {};
  f(
    {
      line: mg,
      rect: pg,
      roundRect: pg,
      square: pg,
      circle: ig,
      diamond: Vy,
      pin: Hy,
      arrow: Wy,
      triangle: Fy,
    },
    function (t, e) {
      Zy[e] = new t();
    },
  );
  var Uy = ri({
      type: "symbol",
      shape: {
        symbolType: "",
        x: 0,
        y: 0,
        width: 0,
        height: 0,
      },
      beforeBrush: function () {
        var t = this.style;
        "pin" === this.shape.symbolType &&
          "inside" === t.textPosition &&
          ((t.textPosition = ["50%", "40%"]),
          (t.textAlign = "center"),
          (t.textVerticalAlign = "middle"));
      },
      buildPath: function (t, e, n) {
        var i = e.symbolType,
          r = Zy[i];
        "none" !== e.symbolType &&
          (r || (r = Zy[(i = "rect")]),
          Gy[i](e.x, e.y, e.width, e.height, r.shape),
          r.buildPath(t, r.shape, n));
      },
    }),
    Xy = {
      isDimensionStacked: za,
      enableDataStack: Oa,
      getStackedDimension: Ea,
    },
    Yy = (Object.freeze || Object)({
      createList: function (t) {
        return Na(t.getSource(), t);
      },
      getLayoutRect: gr,
      dataStack: Xy,
      createScale: function (t, e) {
        var n = e;
        Wi.isInstance(e) || c((n = new Wi(e)), By);
        var i = es(n);
        return (i.setExtent(t[0], t[1]), ts(i, n), i);
      },
      mixinAxisModelCommonMethods: function (t) {
        c(t, By);
      },
      completeDimensions: Pa,
      createDimensions: py,
      createSymbol: ls,
    }),
    jy = 1e-8;
  cs.prototype = {
    constructor: cs,
    properties: null,
    getBoundingRect: function () {
      var t = this._rect;
      if (t) return t;
      for (
        var typeof_ = Number.MAX_VALUE,
          n = [typeof_, typeof_],
          i = [-typeof_, -typeof_],
          r = [],
          o = [],
          a = this.geometries,
          s = 0;
        s < a.length;
        s++
      )
        "polygon" === a[s].type && (On(a[s].exterior, r, o), Q(n, n, r), J(i, i, o));
      return (
        0 === s && (n[0] = n[1] = i[0] = i[1] = 0),
        (this._rect = new ee(n[0], n[1], i[0] - n[0], i[1] - n[1]))
      );
    },
    contain: function (t) {
      var typeof_ = this.getBoundingRect(),
        n = this.geometries;
      if (!typeof_.contain(t[0], t[1])) return !1;
      t: for (var i = 0, r = n.length; i < r; i++)
        if ("polygon" === n[i].type) {
          var o = n[i].exterior,
            a = n[i].interiors;
          if (us(o, t[0], t[1])) {
            for (var s = 0; s < (a ? a.length : 0); s++) if (us(a[s])) continue t;
            return !0;
          }
        }
      return !1;
    },
    transformTo: function (t, e, n, i) {
      var r = this.getBoundingRect(),
        o = r.width / r.height;
      n ? i || (i = n / o) : (n = o * i);
      for (
        var a = new ee(t, e, n, i), s = r.calculateTransform(a), l = this.geometries, h = 0;
        h < l.length;
        h++
      )
        if ("polygon" === l[h].type) {
          for (var u = l[h].exterior, c = l[h].interiors, d = 0; d < u.length; d++)
            K(u[d], u[d], s);
          for (var f = 0; f < (c ? c.length : 0); f++)
            for (d = 0; d < c[f].length; d++) K(c[f][d], c[f][d], s);
        }
      ((r = this._rect).copy(a), (this.center = [r.x + r.width / 2, r.y + r.height / 2]));
    },
    cloneShallow: function (t) {
      null == t && (t = this.name);
      var typeof_ = new cs(t, this.geometries, this.center);
      return ((typeof_._rect = this._rect), (typeof_.transformTo = null), typeof_);
    },
  };
  var qy = function (t) {
      return (
        (function (t) {
          if (!t.UTF8Encoding) return t;
          var typeof_ = t.UTF8Scale;
          null == typeof_ && (e = 1024);
          for (var n = t.features, i = 0; i < n.length; i++)
            for (
              var r = n[i].geometry, o = r.coordinates, a = r.encodeOffsets, s = 0;
              s < o.length;
              s++
            ) {
              var l = o[s];
              if ("Polygon" === r.type) o[s] = ds(l, a[s], typeof_);
              else if ("MultiPolygon" === r.type)
                for (var h = 0; h < l.length; h++) {
                  var u = l[h];
                  l[h] = ds(u, a[s][h], typeof_);
                }
            }
          t.UTF8Encoding = !1;
        })(t),
        p(
          m(t.features, function (t) {
            return t.geometry && t.properties && t.geometry.coordinates.length > 0;
          }),
          function (t) {
            var typeof_ = t.properties,
              n = t.geometry,
              i = n.coordinates,
              r = [];
            ("Polygon" === n.type &&
              r.push({
                type: "polygon",
                exterior: i[0],
                interiors: i.slice(1),
              }),
              "MultiPolygon" === n.type &&
                f(i, function (t) {
                  t[0] &&
                    r.push({
                      type: "polygon",
                      exterior: t[0],
                      interiors: t.slice(1),
                    });
                }));
            var o = new cs(typeof_.name, r, typeof_.cp);
            return ((o.properties = typeof_), o);
          },
        )
      );
    },
    $y = dn(),
    Ky = [0, 1],
    Qy = function (t, e, n) {
      ((this.dim = t),
        (this.scale = e),
        (this._extent = n || [0, 0]),
        (this.inverse = !1),
        (this.onBand = !1));
    };
  Qy.prototype = {
    constructor: Qy,
    contain: function (t) {
      var typeof_ = this._extent,
        n = Math.min(typeof_[0], typeof_[1]),
        i = Math.max(typeof_[0], typeof_[1]);
      return t >= n && t <= i;
    },
    containData: function (t) {
      return this.contain(this.dataToCoord(t));
    },
    getExtent: function () {
      return this._extent.slice();
    },
    getPixelPrecision: function (t) {
      return Qi(t || this.scale.getExtent(), this._extent);
    },
    setExtent: function (t, e) {
      var n = this._extent;
      ((n[0] = t), (n[1] = e));
    },
    dataToCoord: function (t, e) {
      var n = this._extent,
        i = this.scale;
      return (
        (t = i.normalize(t)),
        this.onBand && "ordinal" === i.type && ws((n = n.slice()), i.count()),
        Xi(t, Ky, n, e)
      );
    },
    coordToData: function (t, e) {
      var n = this._extent,
        i = this.scale;
      this.onBand && "ordinal" === i.type && ws((n = n.slice()), i.count());
      var r = Xi(t, n, Ky, e);
      return this.scale.scale(r);
    },
    pointToData: function (t, e) {},
    getTicksCoords: function (t) {
      var typeof_ = (t = t || {}).tickModel || this.getTickModel(),
        n = ps(this, typeof_),
        i = p(
          n.ticks,
          function (t) {
            return {
              coord: this.dataToCoord(t),
              tickValue: t,
            };
          },
          this,
        ),
        r = typeof_.get("alignWithLabel");
      return (
        (function (t, e, n, i, r) {
          function o(t, e) {
            return u ? t > e : t < e;
          }
          var a = e.length;
          if (t.onBand && !i && a) {
            var s,
              l = t.getExtent();
            if (1 === a)
              ((e[0].coord = l[0]),
                (s = e[1] =
                  {
                    coord: l[0],
                  }));
            else {
              var h = e[1].coord - e[0].coord;
              (f(e, function (t) {
                t.coord -= h / 2;
                var typeof_ = typeof_ || 0;
                typeof_ % 2 > 0 && (t.coord -= h / (2 * (typeof_ + 1)));
              }),
                (s = {
                  coord: e[a - 1].coord + h,
                }),
                e.push(s));
            }
            var u = l[0] > l[1];
            (o(e[0].coord, l[0]) && (r ? (e[0].coord = l[0]) : e.shift()),
              r &&
                o(l[0], e[0].coord) &&
                e.unshift({
                  coord: l[0],
                }),
              o(l[1], s.coord) && (r ? (s.coord = l[1]) : e.pop()),
              r &&
                o(s.coord, l[1]) &&
                e.push({
                  coord: l[1],
                }));
          }
        })(this, i, n.tickCategoryInterval, r, t.clamp),
        i
      );
    },
    getViewLabels: function () {
      return fs(this).labels;
    },
    getLabelModel: function () {
      return this.model.getModel("axisLabel");
    },
    getTickModel: function () {
      return this.model.getModel("axisTick");
    },
    getBandWidth: function () {
      var t = this._extent,
        typeof_ = this.scale.getExtent(),
        n = typeof_[1] - typeof_[0] + (this.onBand ? 1 : 0);
      0 === n && (n = 1);
      var i = Math.abs(t[1] - t[0]);
      return Math.abs(i) / n;
    },
    isHorizontal: null,
    getRotate: null,
    calculateCategoryInterval: function () {
      return (function (t) {
        var typeof_ = (function (t) {
            var typeof_ = t.getLabelModel();
            return {
              axisRotate: t.getRotate
                ? t.getRotate()
                : t.isHorizontal && !t.isHorizontal()
                  ? 90
                  : 0,
              labelRotate: typeof_.get("rotate") || 0,
              font: typeof_.getFont(),
            };
          })(t),
          n = ns(t),
          i = ((typeof_.axisRotate - typeof_.labelRotate) / 180) * Math.PI,
          r = t.scale,
          o = r.getExtent(),
          a = r.count();
        if (o[1] - o[0] < 1) return 0;
        var s = 1;
        a > 40 && (s = Math.max(1, Math.floor(a / 40)));
        for (
          var l = o[0],
            h = t.dataToCoord(l + 1) - t.dataToCoord(l),
            u = Math.abs(h * Math.cos(i)),
            c = Math.abs(h * Math.sin(i)),
            d = 0,
            f = 0;
          l <= o[1];
          l += s
        ) {
          var p,
            g,
            m = ye(n(l), typeof_.font, "center", "top");
          ((p = 1.3 * m.width),
            (g = 1.3 * m.height),
            (d = Math.max(d, p, 7)),
            (f = Math.max(f, g, 7)));
        }
        var v = d / u,
          y = f / c;
        (isNaN(v) && (v = 1 / 0), isNaN(y) && (y = 1 / 0));
        var x = Math.max(0, Math.floor(Math.min(v, y))),
          _ = $y(t.model),
          w = _.lastAutoInterval,
          b = _.lastTickCount;
        return (
          null != w && null != b && Math.abs(w - x) <= 1 && Math.abs(b - a) <= 1 && w > x
            ? (x = w)
            : ((_.lastTickCount = a), (_.lastAutoInterval = x)),
          x
        );
      })(this);
    },
  };
  var Jy = qy,
    tx = {};
  f(
    [
      "map",
      "each",
      "filter",
      "indexOf",
      "inherits",
      "reduce",
      "filter",
      "bind",
      "curry",
      "isArray",
      "isString",
      "isObject",
      "isFunction",
      "extend",
      "defaults",
      "clone",
      "merge",
    ],
    function (t) {
      tx[t] = ed[t];
    },
  );
  var ex = {};
  (f(
    [
      "extendShape",
      "extendPath",
      "makePath",
      "makeImage",
      "mergePath",
      "resizePath",
      "createIcon",
      "setHoverStyle",
      "setLabelStyle",
      "setTextStyle",
      "setText",
      "getFont",
      "updateProps",
      "initProps",
      "getTransform",
      "clipPointsByRect",
      "clipRectByRect",
      "Group",
      "Image",
      "Text",
      "Circle",
      "Sector",
      "Ring",
      "Polygon",
      "Polyline",
      "Rect",
      "Line",
      "BezierCurve",
      "Arc",
      "IncrementalDisplayable",
      "CompoundPath",
      "LinearGradient",
      "RadialGradient",
      "BoundingRect",
    ],
    function (t) {
      ex[t] = Lg[t];
    },
  ),
    Gm.extend({
      type: "series.line",
      dependencies: ["grid", "polar"],
      getInitialData: function (t, e) {
        return Na(this.getSource(), this);
      },
      defaultOption: {
        zlevel: 0,
        z: 2,
        coordinateSystem: "cartesian2d",
        legendHoverLink: !0,
        hoverAnimation: !0,
        clipOverflow: !0,
        label: {
          position: "top",
        },
        lineStyle: {
          width: 2,
          type: "solid",
        },
        step: !1,
        smooth: !1,
        smoothMonotone: null,
        symbol: "emptyCircle",
        symbolSize: 4,
        symbolRotate: null,
        showSymbol: !0,
        showAllSymbol: "auto",
        connectNulls: !1,
        sampling: "none",
        animationEasing: "linear",
        progressive: 0,
        hoverLayerThreshold: 1 / 0,
      },
    }));
  var nx = Ss.prototype,
    ix = (Ss.getSymbolSize = function (t, e) {
      var n = t.getItemVisual(e, "symbolSize");
      return n instanceof Array ? n.slice() : [+n, +n];
    });
  ((nx._createSymbol = function (t, e, n, i, r) {
    this.removeAll();
    var o = ls(t, -1, -1, 2, 2, e.getItemVisual(n, "color"), r);
    (o.attr({
      z2: 100,
      culling: !0,
      scale: Ms(i),
    }),
      (o.drift = Is),
      (this._symbolType = t),
      this.add(o));
  }),
    (nx.stopSymbolAnimation = function (t) {
      this.childAt(0).stopAnimation(t);
    }),
    (nx.getSymbolPath = function () {
      return this.childAt(0);
    }),
    (nx.getScale = function () {
      return this.childAt(0).scale;
    }),
    (nx.highlight = function () {
      this.childAt(0).trigger("emphasis");
    }),
    (nx.downplay = function () {
      this.childAt(0).trigger("normal");
    }),
    (nx.setZ = function (t, e) {
      var n = this.childAt(0);
      ((n.zlevel = t), (n.z = e));
    }),
    (nx.setDraggable = function (t) {
      var typeof_ = this.childAt(0);
      ((typeof_.draggable = t), (typeof_.cursor = t ? "move" : "pointer"));
    }),
    (nx.updateData = function (t, e, n) {
      this.silent = !1;
      var i = t.getItemVisual(e, "symbol") || "circle",
        r = t.hostModel,
        o = ix(t, e),
        a = i !== this._symbolType;
      if (a) {
        var s = t.getItemVisual(e, "symbolKeepAspect");
        this._createSymbol(i, t, e, o, s);
      } else
        (((l = this.childAt(0)).silent = !1),
          zi(
            l,
            {
              scale: Ms(o),
            },
            r,
            e,
          ));
      if ((this._updateCommon(t, e, o, n), a)) {
        var l = this.childAt(0),
          h = n && n.fadeIn,
          u = {
            scale: l.scale.slice(),
          };
        (h &&
          (u.style = {
            opacity: l.style.opacity,
          }),
          (l.scale = [0, 0]),
          h && (l.style.opacity = 0),
          Ei(l, u, r, e));
      }
      this._seriesModel = r;
    }));
  var rx = ["itemStyle"],
    ox = ["emphasis", "itemStyle"],
    ax = ["label"],
    sx = ["emphasis", "label"];
  ((nx._updateCommon = function (t, e, n, i) {
    var r = this.childAt(0),
      o = t.hostModel,
      s = t.getItemVisual(e, "color");
    "image" !== r.type &&
      r.useStyle({
        strokeNoScale: !0,
      });
    var l = i && i.itemStyle,
      h = i && i.hoverItemStyle,
      u = i && i.symbolRotate,
      c = i && i.symbolOffset,
      d = i && i.labelModel,
      f = i && i.hoverLabelModel,
      p = i && i.hoverAnimation,
      g = i && i.cursorStyle;
    if (!i || t.hasItemOption) {
      var m = i && i.itemModel ? i.itemModel : t.getItemModel(e);
      ((l = m.getModel(rx).getItemStyle(["color"])),
        (h = m.getModel(ox).getItemStyle()),
        (u = m.getShallow("symbolRotate")),
        (c = m.getShallow("symbolOffset")),
        (d = m.getModel(ax)),
        (f = m.getModel(sx)),
        (p = m.getShallow("hoverAnimation")),
        (g = m.getShallow("cursor")));
    } else h = a({}, h);
    var v = r.style;
    (r.attr("rotation", ((u || 0) * Math.PI) / 180 || 0),
      c && r.attr("position", [Yi(c[0], n[0]), Yi(c[1], n[1])]),
      g && r.attr("cursor", g),
      r.setColor(s, i && i.symbolInnerColor),
      r.setStyle(l));
    var y = t.getItemVisual(e, "opacity");
    null != y && (v.opacity = y);
    var x = t.getItemVisual(e, "liftZ"),
      _ = r.__z2Origin;
    null != x
      ? null == _ && ((r.__z2Origin = r.z2), (r.z2 += x))
      : null != _ && ((r.z2 = _), (r.__z2Origin = null));
    var w = i && i.useNameLabel;
    (Ii(v, h, d, f, {
      labelFetcher: o,
      labelDataIndex: e,
      defaultText: function (e, n) {
        return w ? t.getName(e) : bs(t, e);
      },
      isRectText: !0,
      autoColor: s,
    }),
      r.off("mouseover").off("mouseout").off("emphasis").off("normal"),
      (r.hoverStyle = h),
      Si(r),
      (r.__symbolOriginalScale = Ms(n)),
      p &&
        o.isAnimationEnabled() &&
        r.on("mouseover", Ts).on("mouseout", As).on("emphasis", Cs).on("normal", Ds));
  }),
    (nx.fadeOut = function (t, e) {
      var n = this.childAt(0);
      ((this.silent = n.silent = !0),
        !(e && e.keepLabel) && (n.style.text = null),
        zi(
          n,
          {
            style: {
              opacity: 0,
            },
            scale: [0, 0],
          },
          this._seriesModel,
          this.dataIndex,
          t,
        ));
    }),
    u(Ss, qd));
  var lx = ks.prototype;
  ((lx.updateData = function (t, e) {
    e = Ls(e);
    var n = this.group,
      i = t.hostModel,
      r = this._data,
      o = this._symbolCtor,
      a = Os(t);
    (r || n.removeAll(),
      t
        .diff(r)
        .add(function (i) {
          var r = t.getItemLayout(i);
          if (Ps(t, r, i, e)) {
            var s = new o(t, i, a);
            (s.attr("position", r), t.setItemGraphicEl(i, s), n.add(s));
          }
        })
        .update(function (s, l) {
          var h = r.getItemGraphicEl(l),
            u = t.getItemLayout(s);
          Ps(t, u, s, e)
            ? (h
                ? (h.updateData(t, s, a),
                  zi(
                    h,
                    {
                      position: u,
                    },
                    i,
                  ))
                : (h = new o(t, s)).attr("position", u),
              n.add(h),
              t.setItemGraphicEl(s, h))
            : n.remove(h);
        })
        .remove(function (t) {
          var typeof_ = r.getItemGraphicEl(t);
          typeof_ &&
            typeof_.fadeOut(function () {
              n.remove(typeof_);
            });
        })
        .execute(),
      (this._data = t));
  }),
    (lx.isPersistent = function () {
      return !0;
    }),
    (lx.updateLayout = function () {
      var t = this._data;
      t &&
        t.eachItemGraphicEl(function (e, n) {
          var i = t.getItemLayout(n);
          e.attr("position", i);
        });
    }),
    (lx.incrementalPrepareUpdate = function (t) {
      ((this._seriesScope = Os(t)), (this._data = null), this.group.removeAll());
    }),
    (lx.incrementalUpdate = function (t, e, n) {
      n = Ls(n);
      for (var i = t.start; i < t.end; i++) {
        var r = e.getItemLayout(i);
        if (Ps(e, r, i, n)) {
          var o = new this._symbolCtor(e, i, this._seriesScope);
          (o.traverse(function (t) {
            t.isGroup || (t.incremental = t.useHoverLayer = !0);
          }),
            o.attr("position", r),
            this.group.add(o),
            e.setItemGraphicEl(i, o));
        }
      }
    }),
    (lx.remove = function (t) {
      var typeof_ = this.group,
        n = this._data;
      n && t
        ? n.eachItemGraphicEl(function (t) {
            t.fadeOut(function () {
              typeof_.remove(t);
            });
          })
        : typeof_.removeAll();
    }));
  var hx = Q,
    ux = J,
    cx = G,
    dx = V,
    fx = [],
    px = [],
    gx = [],
    mx = qn.extend({
      type: "ec-polyline",
      shape: {
        points: [],
        smooth: 0,
        smoothConstraint: !0,
        smoothMonotone: null,
        connectNulls: !1,
      },
      style: {
        fill: null,
        stroke: "#000",
      },
      brush: og(qn.prototype.brush),
      buildPath: function (t, e) {
        var n = e.points,
          i = 0,
          r = n.length,
          o = Vs(n, e.smoothConstraint);
        if (e.connectNulls) {
          for (; r > 0 && Ns(n[r - 1]); r--);
          for (; i < r && Ns(n[i]); i++);
        }
        for (; i < r;)
          i += Rs(t, n, i, r, r, 1, o.min, o.max, e.smooth, e.smoothMonotone, e.connectNulls) + 1;
      },
    }),
    vx = qn.extend({
      type: "ec-polygon",
      shape: {
        points: [],
        stackedOnPoints: [],
        smooth: 0,
        stackedOnSmooth: 0,
        smoothConstraint: !0,
        smoothMonotone: null,
        connectNulls: !1,
      },
      brush: og(qn.prototype.brush),
      buildPath: function (t, e) {
        var n = e.points,
          i = e.stackedOnPoints,
          r = 0,
          o = n.length,
          a = e.smoothMonotone,
          s = Vs(n, e.smoothConstraint),
          l = Vs(i, e.smoothConstraint);
        if (e.connectNulls) {
          for (; o > 0 && Ns(n[o - 1]); o--);
          for (; r < o && Ns(n[r]); r++);
        }
        for (; r < o;) {
          var h = Rs(t, n, r, o, o, 1, s.min, s.max, e.smooth, a, e.connectNulls);
          (Rs(t, i, r + h - 1, h, o, -1, l.min, l.max, e.stackedOnSmooth, a, e.connectNulls),
            (r += h + 1),
            t.closePath());
        }
      },
    });
  uo.extend({
    type: "line",
    init: function () {
      var t = new qd(),
        typeof_ = new ks();
      (this.group.add(typeof_.group), (this._symbolDraw = typeof_), (this._lineGroup = t));
    },
    render: function (t, e, n) {
      var i = t.coordinateSystem,
        r = this.group,
        o = t.getData(),
        a = t.getModel("lineStyle"),
        l = t.getModel("areaStyle"),
        h = o.mapArray(o.getItemLayout),
        u = "polar" === i.type,
        c = this._coordSys,
        d = this._symbolDraw,
        f = this._polyline,
        p = this._polygon,
        g = this._lineGroup,
        m = t.get("animation"),
        v = !l.isEmpty(),
        y = l.get("origin"),
        x = (function (t, e, n) {
          if (!n.valueDim) return [];
          for (var i = [], r = 0, o = e.count(); r < o; r++) i.push(Es(n, t, e, r));
          return i;
        })(i, o, zs(i, o, y)),
        _ = t.get("showSymbol"),
        w = _ && !u && Ys(t, o, i),
        b = this._data;
      (b &&
        b.eachItemGraphicEl(function (t, e) {
          t.__temp && (r.remove(t), b.setItemGraphicEl(e, null));
        }),
        _ || d.remove(),
        r.add(g));
      var S = !u && t.get("step");
      f && c.type === i.type && S === this._step
        ? (v && !p
            ? (p = this._newPolygon(h, x, i, m))
            : p && !v && (g.remove(p), (p = this._polygon = null)),
          g.setClipPath(Zs(i, !1, !1, t)),
          _ &&
            d.updateData(o, {
              isIgnore: w,
              clipShape: Zs(i, !1, !0, t),
            }),
          o.eachItemGraphicEl(function (t) {
            t.stopAnimation(!0);
          }),
          (Hs(this._stackedOnPoints, x) && Hs(this._points, h)) ||
            (m
              ? this._updateAnimation(o, x, i, n, S, y)
              : (S && ((h = Us(h, i, S)), (x = Us(x, i, S))),
                f.setShape({
                  points: h,
                }),
                p &&
                  p.setShape({
                    points: h,
                    stackedOnPoints: x,
                  }))))
        : (_ &&
            d.updateData(o, {
              isIgnore: w,
              clipShape: Zs(i, !1, !0, t),
            }),
          S && ((h = Us(h, i, S)), (x = Us(x, i, S))),
          (f = this._newPolyline(h, i, m)),
          v && (p = this._newPolygon(h, x, i, m)),
          g.setClipPath(Zs(i, !0, !1, t)));
      var M = Xs(o, i) || o.getVisual("color");
      f.useStyle(
        s(a.getLineStyle(), {
          fill: "none",
          stroke: M,
          lineJoin: "bevel",
        }),
      );
      var I = t.get("smooth");
      if (
        ((I = Ws(t.get("smooth"))),
        f.setShape({
          smooth: I,
          smoothMonotone: t.get("smoothMonotone"),
          connectNulls: t.get("connectNulls"),
        }),
        p)
      ) {
        var T = o.getCalculationInfo("stackedOnSeries"),
          A = 0;
        (p.useStyle(
          s(l.getAreaStyle(), {
            fill: M,
            opacity: 0.7,
            lineJoin: "bevel",
          }),
        ),
          T && (A = Ws(T.get("smooth"))),
          p.setShape({
            smooth: I,
            stackedOnSmooth: A,
            smoothMonotone: t.get("smoothMonotone"),
            connectNulls: t.get("connectNulls"),
          }));
      }
      ((this._data = o),
        (this._coordSys = i),
        (this._stackedOnPoints = x),
        (this._points = h),
        (this._step = S),
        (this._valueOrigin = y));
    },
    dispose: function () {},
    highlight: function (t, e, n, i) {
      var r = t.getData(),
        o = cn(r, i);
      if (!(o instanceof Array) && null != o && o >= 0) {
        var a = r.getItemGraphicEl(o);
        if (!a) {
          var s = r.getItemLayout(o);
          if (!s) return;
          (((a = new Ss(r, o)).position = s),
            a.setZ(t.get("zlevel"), t.get("z")),
            (a.ignore = isNaN(s[0]) || isNaN(s[1])),
            (a.__temp = !0),
            r.setItemGraphicEl(o, a),
            a.stopSymbolAnimation(!0),
            this.group.add(a));
        }
        a.highlight();
      } else uo.prototype.highlight.call(this, t, e, n, i);
    },
    downplay: function (t, e, n, i) {
      var r = t.getData(),
        o = cn(r, i);
      if (null != o && o >= 0) {
        var a = r.getItemGraphicEl(o);
        a && (a.__temp ? (r.setItemGraphicEl(o, null), this.group.remove(a)) : a.downplay());
      } else uo.prototype.downplay.call(this, t, e, n, i);
    },
    _newPolyline: function (t) {
      var typeof_ = this._polyline;
      return (
        typeof_ && this._lineGroup.remove(typeof_),
        (e = new mx({
          shape: {
            points: t,
          },
          silent: !0,
          z2: 10,
        })),
        this._lineGroup.add(typeof_),
        (this._polyline = typeof_),
        typeof_
      );
    },
    _newPolygon: function (t, e) {
      var n = this._polygon;
      return (
        n && this._lineGroup.remove(n),
        (n = new vx({
          shape: {
            points: t,
            stackedOnPoints: e,
          },
          silent: !0,
        })),
        this._lineGroup.add(n),
        (this._polygon = n),
        n
      );
    },
    _updateAnimation: function (t, e, n, i, r, o) {
      var a = this._polyline,
        s = this._polygon,
        l = t.hostModel,
        h = (function (t, e, n, i, r, o, a, s) {
          for (
            var l = (function (t, e) {
                var n = [];
                return (
                  e
                    .diff(t)
                    .add(function (t) {
                      n.push({
                        cmd: "+",
                        idx: t,
                      });
                    })
                    .update(function (t, e) {
                      n.push({
                        cmd: "=",
                        idx: e,
                        idx1: t,
                      });
                    })
                    .remove(function (t) {
                      n.push({
                        cmd: "-",
                        idx: t,
                      });
                    })
                    .execute(),
                  n
                );
              })(t, e),
              h = [],
              u = [],
              c = [],
              d = [],
              f = [],
              p = [],
              g = [],
              m = zs(r, e, a),
              v = zs(o, t, s),
              y = 0;
            y < l.length;
            y++
          ) {
            var x = l[y],
              _ = !0;
            switch (x.cmd) {
              case "=":
                var w = t.getItemLayout(x.idx),
                  b = e.getItemLayout(x.idx1);
                ((isNaN(w[0]) || isNaN(w[1])) && (w = b.slice()),
                  h.push(w),
                  u.push(b),
                  c.push(n[x.idx]),
                  d.push(i[x.idx1]),
                  g.push(e.getRawIndex(x.idx1)));
                break;
              case "+":
                ((S = x.idx),
                  h.push(
                    r.dataToPoint([
                      e.get(m.dataDimsForPoint[0], S),
                      e.get(m.dataDimsForPoint[1], S),
                    ]),
                  ),
                  u.push(e.getItemLayout(S).slice()),
                  c.push(Es(m, r, e, S)),
                  d.push(i[S]),
                  g.push(e.getRawIndex(S)));
                break;
              case "-":
                var S = x.idx,
                  M = t.getRawIndex(S);
                M !== S
                  ? (h.push(t.getItemLayout(S)),
                    u.push(
                      o.dataToPoint([
                        t.get(v.dataDimsForPoint[0], S),
                        t.get(v.dataDimsForPoint[1], S),
                      ]),
                    ),
                    c.push(n[S]),
                    d.push(Es(v, o, t, S)),
                    g.push(M))
                  : (_ = !1);
            }
            _ && (f.push(x), p.push(p.length));
          }
          p.sort(function (t, e) {
            return g[t] - g[e];
          });
          var I = [],
            T = [],
            A = [],
            C = [],
            D = [];
          for (y = 0; y < p.length; y++)
            ((S = p[y]), (I[y] = h[S]), (T[y] = u[S]), (A[y] = c[S]), (C[y] = d[S]), (D[y] = f[S]));
          return {
            current: I,
            next: T,
            stackedOnCurrent: A,
            stackedOnNext: C,
            status: D,
          };
        })(this._data, t, this._stackedOnPoints, e, this._coordSys, n, this._valueOrigin, o),
        u = h.current,
        c = h.stackedOnCurrent,
        d = h.next,
        f = h.stackedOnNext;
      (r &&
        ((u = Us(h.current, n, r)),
        (c = Us(h.stackedOnCurrent, n, r)),
        (d = Us(h.next, n, r)),
        (f = Us(h.stackedOnNext, n, r))),
        (a.shape.__points = h.current),
        (a.shape.points = u),
        zi(
          a,
          {
            shape: {
              points: d,
            },
          },
          l,
        ),
        s &&
          (s.setShape({
            points: u,
            stackedOnPoints: c,
          }),
          zi(
            s,
            {
              shape: {
                points: d,
                stackedOnPoints: f,
              },
            },
            l,
          )));
      for (var p = [], g = h.status, m = 0; m < g.length; m++)
        if ("=" === g[m].cmd) {
          var v = t.getItemGraphicEl(g[m].idx1);
          v &&
            p.push({
              el: v,
              ptIdx: m,
            });
        }
      a.animators &&
        a.animators.length &&
        a.animators[0].during(function () {
          for (var t = 0; t < p.length; t++) p[t].el.attr("position", a.shape.__points[p[t].ptIdx]);
        });
    },
    remove: function (t) {
      var typeof_ = this.group,
        n = this._data;
      (this._lineGroup.removeAll(),
        this._symbolDraw.remove(!0),
        n &&
          n.eachItemGraphicEl(function (t, i) {
            t.__temp && (typeof_.remove(t), n.setItemGraphicEl(i, null));
          }),
        (this._polyline =
          this._polygon =
          this._coordSys =
          this._points =
          this._stackedOnPoints =
          this._data =
            null));
    },
  });
  var yx = function (t, e, n) {
      return {
        seriesType: t,
        performRawSeries: !0,
        reset: function (t, i, r) {
          var o = t.getData(),
            a = t.get("symbol") || e,
            s = t.get("symbolSize"),
            l = t.get("symbolKeepAspect");
          if (
            (o.setVisual({
              legendSymbol: n || a,
              symbol: a,
              symbolSize: s,
              symbolKeepAspect: l,
            }),
            !i.isSeriesFiltered(t))
          ) {
            var h = "function" == typeof s;
            return {
              dataEach:
                o.hasItemOption || h
                  ? function (e, n) {
                      if ("function" == typeof s) {
                        var i = t.getRawValue(n),
                          r = t.getDataParams(n);
                        e.setItemVisual(n, "symbolSize", s(i, r));
                      }
                      if (e.hasItemOption) {
                        var o = e.getItemModel(n),
                          a = o.getShallow("symbol", !0),
                          l = o.getShallow("symbolSize", !0),
                          h = o.getShallow("symbolKeepAspect", !0);
                        (null != a && e.setItemVisual(n, "symbol", a),
                          null != l && e.setItemVisual(n, "symbolSize", l),
                          null != h && e.setItemVisual(n, "symbolKeepAspect", h));
                      }
                    }
                  : null,
            };
          }
        },
      };
    },
    xx = function (t) {
      return {
        seriesType: t,
        plan: Xm(),
        reset: function (t) {
          var typeof_ = t.getData(),
            n = t.coordinateSystem,
            i = t.pipelineContext.large;
          if (n) {
            var r = p(n.dimensions, function (t) {
                return typeof_.mapDimension(t);
              }).slice(0, 2),
              o = r.length,
              a = typeof_.getCalculationInfo("stackResultDimension");
            return (
              za(typeof_, r[0]) && (r[0] = a),
              za(typeof_, r[1]) && (r[1] = a),
              o && {
                progress: function (t, e) {
                  for (
                    var a = t.end - t.start,
                      s = i && new Float32Array(a * o),
                      l = t.start,
                      h = 0,
                      u = [],
                      c = [];
                    l < t.end;
                    l++
                  ) {
                    var d;
                    if (1 === o)
                      ((f = e.get(r[0], l)), (d = !isNaN(f) && n.dataToPoint(f, null, c)));
                    else {
                      var f = (u[0] = e.get(r[0], l)),
                        p = (u[1] = e.get(r[1], l));
                      d = !isNaN(f) && !isNaN(p) && n.dataToPoint(u, null, c);
                    }
                    i
                      ? ((s[h++] = d ? d[0] : NaN), (s[h++] = d ? d[1] : NaN))
                      : e.setItemLayout(l, (d && d.slice()) || [NaN, NaN]);
                  }
                  i && e.setLayout("symbolPoints", s);
                },
              }
            );
          }
        },
      };
    },
    _x = {
      average: function (t) {
        for (var typeof_ = 0, n = 0, i = 0; i < t.length; i++) isNaN(t[i]) || ((e += t[i]), n++);
        return 0 === n ? NaN : typeof_ / n;
      },
      sum: function (t) {
        for (var typeof_ = 0, n = 0; n < t.length; n++) e += t[n] || 0;
        return typeof_;
      },
      max: function (t) {
        for (var typeof_ = -1 / 0, n = 0; n < t.length; n++) t[n] > typeof_ && (e = t[n]);
        return isFinite(typeof_) ? typeof_ : NaN;
      },
      min: function (t) {
        for (var typeof_ = 1 / 0, n = 0; n < t.length; n++) t[n] < typeof_ && (e = t[n]);
        return isFinite(typeof_) ? typeof_ : NaN;
      },
      nearest: function (t) {
        return t[0];
      },
    },
    bx = function (t, e) {
      return Math.round(t.length / 2);
    },
    Sx = function (t) {
      ((this._axes = {}), (this._dimList = []), (this.name = t || ""));
    };
  ((Sx.prototype = {
    constructor: Sx,
    type: "cartesian",
    getAxis: function (t) {
      return this._axes[t];
    },
    getAxes: function () {
      return p(this._dimList, js, this);
    },
    getAxesByScale: function (t) {
      return (
        (t = t.toLowerCase()),
        m(this.getAxes(), function (e) {
          return e.scale.type === t;
        })
      );
    },
    addAxis: function (t) {
      var typeof_ = t.dim;
      ((this._axes[typeof_] = t), this._dimList.push(typeof_));
    },
    dataToCoord: function (t) {
      return this._dataCoordConvert(t, "dataToCoord");
    },
    coordToData: function (t) {
      return this._dataCoordConvert(t, "coordToData");
    },
    _dataCoordConvert: function (t, e) {
      for (var n = this._dimList, i = t instanceof Array ? [] : {}, r = 0; r < n.length; r++) {
        var o = n[r],
          a = this._axes[o];
        i[o] = a[e](t[o]);
      }
      return i;
    },
  }),
    (qs.prototype = {
      constructor: qs,
      type: "cartesian2d",
      dimensions: ["x", "y"],
      getBaseAxis: function () {
        return (
          this.getAxesByScale("ordinal")[0] || this.getAxesByScale("time")[0] || this.getAxis("x")
        );
      },
      containPoint: function (t) {
        var typeof_ = this.getAxis("x"),
          n = this.getAxis("y");
        return typeof_.contain(typeof_.toLocalCoord(t[0])) && n.contain(n.toLocalCoord(t[1]));
      },
      containData: function (t) {
        return this.getAxis("x").containData(t[0]) && this.getAxis("y").containData(t[1]);
      },
      dataToPoint: function (t, e, n) {
        var i = this.getAxis("x"),
          r = this.getAxis("y");
        return (
          ((n = n || [])[0] = i.toGlobalCoord(i.dataToCoord(t[0]))),
          (n[1] = r.toGlobalCoord(r.dataToCoord(t[1]))),
          n
        );
      },
      clampData: function (t, e) {
        var n = this.getAxis("x").scale,
          i = this.getAxis("y").scale,
          r = n.getExtent(),
          o = i.getExtent(),
          a = n.parse(t[0]),
          s = i.parse(t[1]);
        return (
          ((e = e || [])[0] = Math.min(Math.max(Math.min(r[0], r[1]), a), Math.max(r[0], r[1]))),
          (e[1] = Math.min(Math.max(Math.min(o[0], o[1]), s), Math.max(o[0], o[1]))),
          e
        );
      },
      pointToData: function (t, e) {
        var n = this.getAxis("x"),
          i = this.getAxis("y");
        return (
          ((e = e || [])[0] = n.coordToData(n.toLocalCoord(t[0]))),
          (e[1] = i.coordToData(i.toLocalCoord(t[1]))),
          e
        );
      },
      getOtherAxis: function (t) {
        return this.getAxis("x" === t.dim ? "y" : "x");
      },
    }),
    u(qs, Sx));
  var Mx = function (t, e, n, i, r) {
    (Qy.call(this, t, e, n), (this.type = i || "value"), (this.position = r || "bottom"));
  };
  ((Mx.prototype = {
    constructor: Mx,
    index: 0,
    getAxesOnZeroOf: null,
    model: null,
    isHorizontal: function () {
      var t = this.position;
      return "top" === t || "bottom" === t;
    },
    getGlobalExtent: function (t) {
      var typeof_ = this.getExtent();
      return (
        (typeof_[0] = this.toGlobalCoord(typeof_[0])),
        (typeof_[1] = this.toGlobalCoord(typeof_[1])),
        t && typeof_[0] > typeof_[1] && typeof_.reverse(),
        typeof_
      );
    },
    getOtherAxis: function () {
      this.grid.getOtherAxis();
    },
    pointToData: function (t, e) {
      return this.coordToData(this.toLocalCoord(t["x" === this.dim ? 0 : 1]), e);
    },
    toLocalCoord: null,
    toGlobalCoord: null,
  }),
    u(Mx, Qy));
  var Ix = {
      show: !0,
      zlevel: 0,
      z: 0,
      inverse: !1,
      name: "",
      nameLocation: "end",
      nameRotate: null,
      nameTruncate: {
        maxWidth: null,
        ellipsis: "...",
        placeholder: ".",
      },
      nameTextStyle: {},
      nameGap: 15,
      silent: !1,
      triggerEvent: !1,
      tooltip: {
        show: !1,
      },
      axisPointer: {},
      axisLine: {
        show: !0,
        onZero: !0,
        onZeroAxisIndex: null,
        lineStyle: {
          color: "#333",
          width: 1,
          type: "solid",
        },
        symbol: ["none", "none"],
        symbolSize: [10, 15],
      },
      axisTick: {
        show: !0,
        inside: !1,
        length: 5,
        lineStyle: {
          width: 1,
        },
      },
      axisLabel: {
        show: !0,
        inside: !1,
        rotate: 0,
        showMinLabel: null,
        showMaxLabel: null,
        margin: 8,
        fontSize: 12,
      },
      splitLine: {
        show: !0,
        lineStyle: {
          color: ["#ccc"],
          width: 1,
          type: "solid",
        },
      },
      splitArea: {
        show: !1,
        areaStyle: {
          color: ["rgba(250,250,250,0.3)", "rgba(200,200,200,0.3)"],
        },
      },
    },
    Tx = {};
  ((Tx.categoryAxis = r(
    {
      boundaryGap: !0,
      deduplication: null,
      splitLine: {
        show: !1,
      },
      axisTick: {
        alignWithLabel: !1,
        interval: "auto",
      },
      axisLabel: {
        interval: "auto",
      },
    },
    Ix,
  )),
    (Tx.valueAxis = r(
      {
        boundaryGap: [0, 0],
        splitNumber: 5,
      },
      Ix,
    )),
    (Tx.timeAxis = s(
      {
        scale: !0,
        min: "dataMin",
        max: "dataMax",
      },
      Tx.valueAxis,
    )),
    (Tx.logAxis = s(
      {
        scale: !0,
        logBase: 10,
      },
      Tx.valueAxis,
    )));
  var Ax = ["value", "category", "time", "log"],
    Cx = function (t, e, n, i) {
      (f(Ax, function (a) {
        e.extend({
          type: t + "Axis." + a,
          mergeDefaultAndTheme: function (e, i) {
            var o = this.layoutMode,
              s = o ? yr(e) : {};
            (r(e, i.getTheme().get(a + "Axis")),
              r(e, this.getDefaultOption()),
              (e.type = n(t, e)),
              o && vr(e, s, o));
          },
          optionUpdated: function () {
            "category" === this.option.type && (this.__ordinalMeta = Ba.createByAxisModel(this));
          },
          getCategories: function (t) {
            var typeof_ = this.option;
            if ("category" === typeof_.type)
              return t ? typeof_.data : this.__ordinalMeta.categories;
          },
          getOrdinalMeta: function () {
            return this.__ordinalMeta;
          },
          defaultOption: o([{}, Tx[a + "Axis"], i], !0),
        });
      }),
        im.registerSubTypeDefaulter(t + "Axis", y(n, t)));
    },
    Dx = im.extend({
      type: "cartesian2dAxis",
      axis: null,
      init: function () {
        (Dx.superApply(this, "init", arguments), this.resetRange());
      },
      mergeOption: function () {
        (Dx.superApply(this, "mergeOption", arguments), this.resetRange());
      },
      restoreData: function () {
        (Dx.superApply(this, "restoreData", arguments), this.resetRange());
      },
      getCoordSysModel: function () {
        return this.ecModel.queryComponents({
          mainType: "grid",
          index: this.option.gridIndex,
          id: this.option.gridId,
        })[0];
      },
    });
  r(Dx.prototype, By);
  var kx = {
    offset: 0,
  };
  (Cx("x", Dx, $s, kx),
    Cx("y", Dx, $s, kx),
    im.extend({
      type: "grid",
      dependencies: ["xAxis", "yAxis"],
      layoutMode: "box",
      coordinateSystem: null,
      defaultOption: {
        show: !1,
        zlevel: 0,
        z: 0,
        left: "10%",
        top: 60,
        right: "10%",
        bottom: 60,
        containLabel: !1,
        backgroundColor: "rgba(0,0,0,0)",
        borderWidth: 1,
        borderColor: "#ccc",
      },
    }));
  var Px = Qs.prototype;
  ((Px.type = "grid"),
    (Px.axisPointerEnabled = !0),
    (Px.getRect = function () {
      return this._rect;
    }),
    (Px.update = function (t, e) {
      var n = this._axesMap;
      (this._updateScale(t, this.model),
        f(n.x, function (t) {
          ts(t.scale, t.model);
        }),
        f(n.y, function (t) {
          ts(t.scale, t.model);
        }));
      var i = {};
      (f(n.x, function (t) {
        Js(n, "y", t, i);
      }),
        f(n.y, function (t) {
          Js(n, "x", t, i);
        }),
        this.resize(this.model, e));
    }),
    (Px.resize = function (t, e, n) {
      function i() {
        f(o, function (t) {
          var typeof_ = t.isHorizontal(),
            n = typeof_ ? [0, r.width] : [0, r.height],
            i = t.inverse ? 1 : 0;
          (t.setExtent(n[i], n[1 - i]),
            (function (t, e) {
              var n = t.getExtent(),
                i = n[0] + n[1];
              ((t.toGlobalCoord =
                "x" === t.dim
                  ? function (t) {
                      return t + e;
                    }
                  : function (t) {
                      return i - t + e;
                    }),
                (t.toLocalCoord =
                  "x" === t.dim
                    ? function (t) {
                        return t - e;
                      }
                    : function (t) {
                        return i - t + e;
                      }));
            })(t, typeof_ ? r.x : r.y));
        });
      }
      var r = gr(t.getBoxLayoutParams(), {
        width: e.getWidth(),
        height: e.getHeight(),
      });
      this._rect = r;
      var o = this._axesList;
      (i(),
        !n &&
          t.get("containLabel") &&
          (f(o, function (t) {
            if (!t.model.get("axisLabel.inside")) {
              var typeof_ = (function (t) {
                var typeof_ = t.model,
                  n = t.scale;
                if (typeof_.get("axisLabel.show") && !n.isBlank()) {
                  var i,
                    r,
                    o = "category" === t.type,
                    a = n.getExtent();
                  r = o ? n.count() : (i = n.getTicks()).length;
                  var s,
                    l = t.getLabelModel(),
                    h = ns(t),
                    u = 1;
                  r > 40 && (u = Math.ceil(r / 40));
                  for (var c = 0; c < r; c += u) {
                    var d = h(i ? i[c] : a[0] + c),
                      f = rs(l.getTextRect(d), l.get("rotate") || 0);
                    s ? s.union(f) : (s = f);
                  }
                  return s;
                }
              })(t);
              if (typeof_) {
                var n = t.isHorizontal() ? "height" : "width",
                  i = t.model.get("axisLabel.margin");
                ((r[n] -= typeof_[n] + i),
                  "top" === t.position
                    ? (r.y += typeof_.height + i)
                    : "left" === t.position && (r.x += typeof_.width + i));
              }
            }
          }),
          i()));
    }),
    (Px.getAxis = function (t, e) {
      var n = this._axesMap[t];
      if (null != n) {
        if (null == e) for (var i in n) if (n.hasOwnProperty(i)) return n[i];
        return n[e];
      }
    }),
    (Px.getAxes = function () {
      return this._axesList.slice();
    }),
    (Px.getCartesian = function (t, e) {
      if (null != t && null != e) {
        var n = "x" + t + "y" + e;
        return this._coordsMap[n];
      }
      b(t) && ((e = t.yAxisIndex), (t = t.xAxisIndex));
      for (var i = 0, r = this._coordsList; i < r.length; i++)
        if (r[i].getAxis("x").index === t || r[i].getAxis("y").index === e) return r[i];
    }),
    (Px.getCartesians = function () {
      return this._coordsList.slice();
    }),
    (Px.convertToPixel = function (t, e, n) {
      var i = this._findConvertTarget(t, e);
      return i.cartesian
        ? i.cartesian.dataToPoint(n)
        : i.axis
          ? i.axis.toGlobalCoord(i.axis.dataToCoord(n))
          : null;
    }),
    (Px.convertFromPixel = function (t, e, n) {
      var i = this._findConvertTarget(t, e);
      return i.cartesian
        ? i.cartesian.pointToData(n)
        : i.axis
          ? i.axis.coordToData(i.axis.toLocalCoord(n))
          : null;
    }),
    (Px._findConvertTarget = function (t, e) {
      var n,
        i,
        r = e.seriesModel,
        o = e.xAxisModel || (r && r.getReferringComponents("xAxis")[0]),
        a = e.yAxisModel || (r && r.getReferringComponents("yAxis")[0]),
        s = e.gridModel,
        l = this._coordsList;
      return (
        r
          ? h(l, (n = r.coordinateSystem)) < 0 && (n = null)
          : o && a
            ? (n = this.getCartesian(o.componentIndex, a.componentIndex))
            : o
              ? (i = this.getAxis("x", o.componentIndex))
              : a
                ? (i = this.getAxis("y", a.componentIndex))
                : s && s.coordinateSystem === this && (n = this._coordsList[0]),
        {
          cartesian: n,
          axis: i,
        }
      );
    }),
    (Px.containPoint = function (t) {
      var typeof_ = this._coordsList[0];
      if (typeof_) return typeof_.containPoint(t);
    }),
    (Px._initCartesian = function (t, e, n) {
      function i(e) {
        return function (n, i) {
          if (Ks(n, t)) {
            var s = n.get("position");
            ("x" === e
              ? "top" !== s &&
                "bottom" !== s &&
                r[(s = "bottom")] &&
                (s = "top" === s ? "bottom" : "top")
              : "left" !== s &&
                "right" !== s &&
                r[(s = "left")] &&
                (s = "left" === s ? "right" : "left"),
              (r[s] = !0));
            var l = new Mx(e, es(n), [0, 0], n.get("type"), s),
              h = "category" === l.type;
            ((l.onBand = h && n.get("boundaryGap")),
              (l.inverse = n.get("inverse")),
              (n.axis = l),
              (l.model = n),
              (l.grid = this),
              (l.index = i),
              this._axesList.push(l),
              (o[e][i] = l),
              a[e]++);
          }
        };
      }
      var r = {
          left: !1,
          right: !1,
          top: !1,
          bottom: !1,
        },
        o = {
          x: {},
          y: {},
        },
        a = {
          x: 0,
          y: 0,
        };
      if (
        (e.eachComponent("xAxis", i("x"), this),
        e.eachComponent("yAxis", i("y"), this),
        !a.x || !a.y)
      )
        return ((this._axesMap = {}), void (this._axesList = []));
      ((this._axesMap = o),
        f(
          o.x,
          function (e, n) {
            f(
              o.y,
              function (i, r) {
                var o = "x" + n + "y" + r,
                  a = new qs(o);
                ((a.grid = this),
                  (a.model = t),
                  (this._coordsMap[o] = a),
                  this._coordsList.push(a),
                  a.addAxis(e),
                  a.addAxis(i));
              },
              this,
            );
          },
          this,
        ));
    }),
    (Px._updateScale = function (t, e) {
      function n(t, e, n) {
        f(t.mapDimension(e.dim, !0), function (n) {
          e.scale.unionExtentFromData(t, Ea(t, n));
        });
      }
      (f(this._axesList, function (t) {
        t.scale.setExtent(1 / 0, -1 / 0);
      }),
        t.eachSeries(function (t) {
          if (nl(t)) {
            var i = el(t),
              r = i[0],
              o = i[1];
            if (!Ks(r, e) || !Ks(o, e)) return;
            var a = this.getCartesian(r.componentIndex, o.componentIndex),
              s = t.getData(),
              l = a.getAxis("x"),
              h = a.getAxis("y");
            "list" === s.type && (n(s, l), n(s, h));
          }
        }, this));
    }),
    (Px.getTooltipAxes = function (t) {
      var typeof_ = [],
        n = [];
      return (
        f(this.getCartesians(), function (i) {
          var r = null != t && "auto" !== t ? i.getAxis(t) : i.getBaseAxis(),
            o = i.getOtherAxis(r);
          (h(typeof_, r) < 0 && typeof_.push(r), h(n, o) < 0 && n.push(o));
        }),
        {
          baseAxes: typeof_,
          otherAxes: n,
        }
      );
    }));
  var Lx = ["xAxis", "yAxis"];
  ((Qs.create = function (t, e) {
    var n = [];
    return (
      t.eachComponent("grid", function (i, r) {
        var o = new Qs(i, t, e);
        ((o.name = "grid_" + r), o.resize(i, e, !0), (i.coordinateSystem = o), n.push(o));
      }),
      t.eachSeries(function (t) {
        if (nl(t)) {
          var typeof_ = el(t),
            n = typeof_[0],
            i = typeof_[1],
            r = n.getCoordSysModel().coordinateSystem;
          t.coordinateSystem = r.getCartesian(n.componentIndex, i.componentIndex);
        }
      }),
      n
    );
  }),
    (Qs.dimensions = Qs.prototype.dimensions = qs.prototype.dimensions),
    Lr.register("cartesian2d", Qs));
  var Ox = Math.PI,
    zx = function (t, e) {
      ((this.opt = e),
        (this.axisModel = t),
        s(e, {
          labelOffset: 0,
          nameDirection: 1,
          tickDirection: 1,
          labelDirection: 1,
          silent: !0,
        }),
        (this.group = new qd()));
      var n = new qd({
        position: e.position.slice(),
        rotation: e.rotation,
      });
      (n.updateTransform(), (this._transform = n.transform), (this._dumbGroup = n));
    };
  zx.prototype = {
    constructor: zx,
    hasBuilder: function (t) {
      return !!Ex[t];
    },
    add: function (t) {
      Ex[t].call(this);
    },
    getGroup: function () {
      return this.group;
    },
  };
  var Ex = {
      axisLine: function () {
        var t = this.opt,
          typeof_ = this.axisModel;
        if (typeof_.get("axisLine.show")) {
          var n = this.axisModel.axis.getExtent(),
            i = this._transform,
            r = [n[0], 0],
            o = [n[1], 0];
          i && (K(r, r, i), K(o, o, i));
          var s = a(
            {
              lineCap: "round",
            },
            typeof_.getModel("axisLine.lineStyle").getLineStyle(),
          );
          this.group.add(
            new mg(
              hi({
                anid: "line",
                shape: {
                  x1: r[0],
                  y1: r[1],
                  x2: o[0],
                  y2: o[1],
                },
                style: s,
                strokeContainThreshold: t.strokeContainThreshold || 5,
                silent: !0,
                z2: 1,
              }),
            ),
          );
          var l = typeof_.get("axisLine.symbol"),
            h = typeof_.get("axisLine.symbolSize"),
            u = typeof_.get("axisLine.symbolOffset") || 0;
          if (("number" == typeof u && (u = [u, u]), null != l)) {
            ("string" == typeof l && (l = [l, l]),
              ("string" != typeof h && "number" != typeof h) || (h = [h, h]));
            var c = h[0],
              d = h[1];
            f(
              [
                {
                  rotate: t.rotation + Math.PI / 2,
                  offset: u[0],
                  r: 0,
                },
                {
                  rotate: t.rotation - Math.PI / 2,
                  offset: u[1],
                  r: Math.sqrt((r[0] - o[0]) * (r[0] - o[0]) + (r[1] - o[1]) * (r[1] - o[1])),
                },
              ],
              function (e, n) {
                if ("none" !== l[n] && null != l[n]) {
                  var i = ls(l[n], -c / 2, -d / 2, c, d, s.stroke, !0),
                    o = e.r + e.offset,
                    a = [r[0] + o * Math.cos(t.rotation), r[1] - o * Math.sin(t.rotation)];
                  (i.attr({
                    rotation: e.rotate,
                    position: a,
                    silent: !0,
                    z2: 11,
                  }),
                    this.group.add(i));
                }
              },
              this,
            );
          }
        }
      },
      axisTickLabel: function () {
        var t = this.axisModel,
          typeof_ = this.opt,
          n = (function (t, e, n) {
            var i = e.axis;
            if (e.get("axisTick.show") && !i.scale.isBlank()) {
              for (
                var r = e.getModel("axisTick"),
                  o = r.getModel("lineStyle"),
                  a = r.get("length"),
                  l = i.getTicksCoords(),
                  h = [],
                  u = [],
                  c = t._transform,
                  d = [],
                  f = 0;
                f < l.length;
                f++
              ) {
                var p = l[f].coord;
                ((h[0] = p),
                  (h[1] = 0),
                  (u[0] = p),
                  (u[1] = n.tickDirection * a),
                  c && (K(h, h, c), K(u, u, c)));
                var g = new mg(
                  hi({
                    anid: "tick_" + l[f].tickValue,
                    shape: {
                      x1: h[0],
                      y1: h[1],
                      x2: u[0],
                      y2: u[1],
                    },
                    style: s(o.getLineStyle(), {
                      stroke: e.get("axisLine.lineStyle.color"),
                    }),
                    z2: 2,
                    silent: !0,
                  }),
                );
                (t.group.add(g), d.push(g));
              }
              return d;
            }
          })(this, t, typeof_);
        !(function (t, e, n) {
          if (!as(t.axis)) {
            var i = t.get("axisLabel.showMinLabel"),
              r = t.get("axisLabel.showMaxLabel");
            n = n || [];
            var o = (e = e || [])[0],
              a = e[1],
              s = e[e.length - 1],
              l = e[e.length - 2],
              h = n[0],
              u = n[1],
              c = n[n.length - 1],
              d = n[n.length - 2];
            (!1 === i ? (ol(o), ol(h)) : al(o, a) && (i ? (ol(a), ol(u)) : (ol(o), ol(h))),
              !1 === r ? (ol(s), ol(c)) : al(l, s) && (r ? (ol(l), ol(d)) : (ol(s), ol(c))));
          }
        })(
          t,
          (function (t, e, n) {
            var i = e.axis;
            if (A(n.axisLabelShow, e.get("axisLabel.show")) && !i.scale.isBlank()) {
              var r = e.getModel("axisLabel"),
                o = r.get("margin"),
                a = i.getViewLabels(),
                s = ((A(n.labelRotate, r.get("rotate")) || 0) * Ox) / 180,
                l = Nx(n.rotation, s, n.labelDirection),
                h = e.getCategories(!0),
                u = [],
                c = rl(e),
                d = e.get("triggerEvent");
              return (
                f(a, function (a, s) {
                  var f = a.tickValue,
                    p = a.formattedLabel,
                    g = a.rawLabel,
                    m = r;
                  h && h[f] && h[f].textStyle && (m = new Wi(h[f].textStyle, r, e.ecModel));
                  var v = m.getTextColor() || e.get("axisLine.lineStyle.color"),
                    y = [i.dataToCoord(f), n.labelOffset + n.labelDirection * o],
                    x = new ng({
                      anid: "label_" + f,
                      position: y,
                      rotation: l.rotation,
                      silent: c,
                      z2: 10,
                    });
                  (Ti(x.style, m, {
                    text: p,
                    textAlign: m.getShallow("align", !0) || l.textAlign,
                    textVerticalAlign:
                      m.getShallow("verticalAlign", !0) ||
                      m.getShallow("baseline", !0) ||
                      l.textVerticalAlign,
                    textFill:
                      "function" == typeof v
                        ? v("category" === i.type ? g : "value" === i.type ? f + "" : f, s)
                        : v,
                  }),
                    d &&
                      ((x.eventData = il(e)),
                      (x.eventData.targetType = "axisLabel"),
                      (x.eventData.value = g)),
                    t._dumbGroup.add(x),
                    x.updateTransform(),
                    u.push(x),
                    t.group.add(x),
                    x.decomposeTransform());
                }),
                u
              );
            }
          })(this, t, typeof_),
          n,
        );
      },
      axisName: function () {
        var t = this.opt,
          typeof_ = this.axisModel,
          n = A(t.axisName, typeof_.get("name"));
        if (n) {
          var i,
            r,
            o = typeof_.get("nameLocation"),
            s = t.nameDirection,
            l = typeof_.getModel("nameTextStyle"),
            h = typeof_.get("nameGap") || 0,
            u = this.axisModel.axis.getExtent(),
            c = u[0] > u[1] ? -1 : 1,
            d = [
              "start" === o ? u[0] - c * h : "end" === o ? u[1] + c * h : (u[0] + u[1]) / 2,
              sl(o) ? t.labelOffset + s * h : 0,
            ],
            f = typeof_.get("nameRotate");
          (null != f && (f = (f * Ox) / 180),
            sl(o)
              ? (i = Nx(t.rotation, null != f ? f : t.rotation, s))
              : ((i = (function (t, e, n, i) {
                  var r,
                    o,
                    a = tr(n - t.rotation),
                    s = i[0] > i[1],
                    l = ("start" === e && !s) || ("start" !== e && s);
                  return (
                    er(a - Ox / 2)
                      ? ((o = l ? "bottom" : "top"), (r = "center"))
                      : er(a - 1.5 * Ox)
                        ? ((o = l ? "top" : "bottom"), (r = "center"))
                        : ((o = "middle"),
                          (r =
                            a < 1.5 * Ox && a > Ox / 2
                              ? l
                                ? "left"
                                : "right"
                              : l
                                ? "right"
                                : "left")),
                    {
                      rotation: a,
                      textAlign: r,
                      textVerticalAlign: o,
                    }
                  );
                })(t, o, f || 0, u)),
                null != (r = t.axisNameAvailableWidth) &&
                  ((r = Math.abs(r / Math.sin(i.rotation))), !isFinite(r) && (r = null))));
          var p = l.getFont(),
            g = typeof_.get("nameTruncate", !0) || {},
            m = g.ellipsis,
            v = A(t.nameTruncateMaxWidth, g.maxWidth, r),
            y =
              null != m && null != v
                ? jg(n, v, p, m, {
                    minChar: 2,
                    placeholder: g.placeholder,
                  })
                : n,
            x = typeof_.get("tooltip", !0),
            _ = typeof_.mainType,
            w = {
              componentType: _,
              name: n,
              $vars: ["name"],
            };
          w[_ + "Index"] = typeof_.componentIndex;
          var b = new ng({
            anid: "name",
            __fullText: n,
            __truncatedText: y,
            position: d,
            rotation: i.rotation,
            silent: rl(typeof_),
            z2: 1,
            tooltip:
              x && x.show
                ? a(
                    {
                      content: n,
                      formatter: function () {
                        return n;
                      },
                      formatterParams: w,
                    },
                    x,
                  )
                : null,
          });
          (Ti(b.style, l, {
            text: y,
            textFont: p,
            textFill: l.getTextColor() || typeof_.get("axisLine.lineStyle.color"),
            textAlign: i.textAlign,
            textVerticalAlign: i.textVerticalAlign,
          }),
            typeof_.get("triggerEvent") &&
              ((b.eventData = il(typeof_)),
              (b.eventData.targetType = "axisName"),
              (b.eventData.name = n)),
            this._dumbGroup.add(b),
            b.updateTransform(),
            this.group.add(b),
            b.decomposeTransform());
        }
      },
    },
    Nx = (zx.innerTextLayout = function (t, e, n) {
      var i,
        r,
        o = tr(e - t);
      return (
        er(o)
          ? ((r = n > 0 ? "top" : "bottom"), (i = "center"))
          : er(o - Ox)
            ? ((r = n > 0 ? "bottom" : "top"), (i = "center"))
            : ((r = "middle"),
              (i = o > 0 && o < Ox ? (n > 0 ? "right" : "left") : n > 0 ? "left" : "right")),
        {
          rotation: o,
          textAlign: i,
          textVerticalAlign: r,
        }
      );
    }),
    Rx = f,
    Bx = y,
    Fx = fa({
      type: "axis",
      _axisPointer: null,
      axisPointerClass: null,
      render: function (t, e, n, i) {
        (this.axisPointerClass &&
          (function (t) {
            var typeof_ = cl(t);
            if (typeof_) {
              var n = typeof_.axisPointerModel,
                i = typeof_.axis.scale,
                r = n.option,
                o = n.get("status"),
                a = n.get("value");
              null != a && (a = i.parse(a));
              var s = dl(n);
              null == o && (r.status = s ? "show" : "hide");
              var l = i.getExtent().slice();
              (l[0] > l[1] && l.reverse(),
                (null == a || a > l[1]) && (a = l[1]),
                a < l[0] && (a = l[0]),
                (r.value = a),
                s && (r.status = typeof_.axis.scale.isBlank() ? "hide" : "show"));
            }
          })(t),
          Fx.superApply(this, "render", arguments),
          pl(this, t, 0, n, 0, !0));
      },
      updateAxisPointer: function (t, e, n, i, r) {
        pl(this, t, 0, n, 0, !1);
      },
      remove: function (t, e) {
        var n = this._axisPointer;
        (n && n.remove(e), Fx.superApply(this, "remove", arguments));
      },
      dispose: function (t, e) {
        (gl(this, e), Fx.superApply(this, "dispose", arguments));
      },
    }),
    Vx = [];
  ((Fx.registerAxisPointerClass = function (t, e) {
    Vx[t] = e;
  }),
    (Fx.getAxisPointerClass = function (t) {
      return t && Vx[t];
    }));
  var Hx = ["axisLine", "axisTickLabel", "axisName"],
    Wx = ["splitArea", "splitLine"],
    Gx = Fx.extend({
      type: "cartesianAxis",
      axisPointerClass: "CartesianAxisPointer",
      render: function (t, e, n, i) {
        this.group.removeAll();
        var r = this._axisGroup;
        if (((this._axisGroup = new qd()), this.group.add(this._axisGroup), t.get("show"))) {
          var o = t.getCoordSysModel(),
            a = ml(o, t),
            s = new zx(t, a);
          (f(Hx, s.add, s),
            this._axisGroup.add(s.getGroup()),
            f(
              Wx,
              function (e) {
                t.get(e + ".show") && this["_" + e](t, o);
              },
              this,
            ),
            Fi(r, this._axisGroup, t),
            Gx.superCall(this, "render", t, e, n, i));
        }
      },
      remove: function () {
        this._splitAreaColors = null;
      },
      _splitLine: function (t, e) {
        var n = t.axis;
        if (!n.scale.isBlank()) {
          var i = t.getModel("splitLine"),
            r = i.getModel("lineStyle"),
            o = r.get("color");
          o = x(o) ? o : [o];
          for (
            var a = e.coordinateSystem.getRect(),
              l = n.isHorizontal(),
              h = 0,
              u = n.getTicksCoords({
                tickModel: i,
              }),
              c = [],
              d = [],
              f = r.getLineStyle(),
              p = 0;
            p < u.length;
            p++
          ) {
            var g = n.toGlobalCoord(u[p].coord);
            l
              ? ((c[0] = g), (c[1] = a.y), (d[0] = g), (d[1] = a.y + a.height))
              : ((c[0] = a.x), (c[1] = g), (d[0] = a.x + a.width), (d[1] = g));
            var m = h++ % o.length,
              v = u[p].tickValue;
            this._axisGroup.add(
              new mg(
                hi({
                  anid: null != v ? "line_" + u[p].tickValue : null,
                  shape: {
                    x1: c[0],
                    y1: c[1],
                    x2: d[0],
                    y2: d[1],
                  },
                  style: s(
                    {
                      stroke: o[m],
                    },
                    f,
                  ),
                  silent: !0,
                }),
              ),
            );
          }
        }
      },
      _splitArea: function (t, e) {
        var n = t.axis;
        if (!n.scale.isBlank()) {
          var i = t.getModel("splitArea"),
            r = i.getModel("areaStyle"),
            o = r.get("color"),
            a = e.coordinateSystem.getRect(),
            l = n.getTicksCoords({
              tickModel: i,
              clamp: !0,
            });
          if (l.length) {
            var h = o.length,
              u = this._splitAreaColors,
              c = R(),
              d = 0;
            if (u)
              for (m = 0; m < l.length; m++) {
                var f = u.get(l[m].tickValue);
                if (null != f) {
                  d = (f + (h - 1) * m) % h;
                  break;
                }
              }
            var p = n.toGlobalCoord(l[0].coord),
              g = r.getAreaStyle();
            o = x(o) ? o : [o];
            for (var m = 1; m < l.length; m++) {
              var v,
                y,
                _,
                w,
                b = n.toGlobalCoord(l[m].coord);
              n.isHorizontal()
                ? ((v = p), (y = a.y), (_ = b - v), (w = a.height), (p = v + _))
                : ((v = a.x), (y = p), (_ = a.width), (p = y + (w = b - y)));
              var S = l[m - 1].tickValue;
              (null != S && c.set(S, d),
                this._axisGroup.add(
                  new pg({
                    anid: null != S ? "area_" + S : null,
                    shape: {
                      x: v,
                      y: y,
                      width: _,
                      height: w,
                    },
                    style: s(
                      {
                        fill: o[d],
                      },
                      g,
                    ),
                    silent: !0,
                  }),
                ),
                (d = (d + 1) % h));
            }
            this._splitAreaColors = c;
          }
        }
      },
    });
  (Gx.extend({
    type: "xAxis",
  }),
    Gx.extend({
      type: "yAxis",
    }),
    fa({
      type: "grid",
      render: function (t, e) {
        (this.group.removeAll(),
          t.get("show") &&
            this.group.add(
              new pg({
                shape: t.coordinateSystem.getRect(),
                style: s(
                  {
                    fill: t.get("backgroundColor"),
                  },
                  t.getItemStyle(),
                ),
                silent: !0,
                z2: -1,
              }),
            ));
      },
    }),
    oa(function (t) {
      t.xAxis && t.yAxis && !t.grid && (t.grid = {});
    }),
    ha(yx("line", "circle", "line")),
    la(xx("line")),
    aa(zv.PROCESSOR.STATISTIC, {
      seriesType: "line",
      modifyOutputEnd: !0,
      reset: function (t, e, n) {
        var i = t.getData(),
          r = t.get("sampling"),
          o = t.coordinateSystem;
        if ("cartesian2d" === o.type && r) {
          var a,
            s = o.getBaseAxis(),
            l = o.getOtherAxis(s),
            h = s.getExtent(),
            u = h[1] - h[0],
            c = Math.round(i.count() / u);
          c > 1 &&
            ("string" == typeof r ? (a = _x[r]) : "function" == typeof r && (a = r),
            a && t.setData(i.downSample(i.mapDimension(l.dim), 1 / c, a, bx)));
        }
      },
    }),
    Gm.extend({
      type: "series.__base_bar__",
      getInitialData: function (t, e) {
        return Na(this.getSource(), this);
      },
      getMarkerPosition: function (t) {
        var typeof_ = this.coordinateSystem;
        if (typeof_) {
          var n = typeof_.dataToPoint(typeof_.clampData(t)),
            i = this.getData(),
            r = i.getLayout("offset"),
            o = i.getLayout("size");
          return ((n[typeof_.getBaseAxis().isHorizontal() ? 0 : 1] += r + o / 2), n);
        }
        return [NaN, NaN];
      },
      defaultOption: {
        zlevel: 0,
        z: 2,
        coordinateSystem: "cartesian2d",
        legendHoverLink: !0,
        barMinHeight: 0,
        barMinAngle: 0,
        large: !1,
        largeThreshold: 400,
        progressive: 3e3,
        progressiveChunkMode: "mod",
        itemStyle: {},
        emphasis: {},
      },
    }).extend({
      type: "series.bar",
      dependencies: ["grid", "polar"],
      brushSelector: "rect",
      getProgressive: function () {
        return !!this.get("large") && this.get("progressive");
      },
      getProgressiveThreshold: function () {
        var t = this.get("progressiveThreshold"),
          typeof_ = this.get("largeThreshold");
        return (typeof_ > t && (t = typeof_), t);
      },
    }));
  var Zx = qf([
      ["fill", "color"],
      ["stroke", "borderColor"],
      ["lineWidth", "borderWidth"],
      ["stroke", "barBorderColor"],
      ["lineWidth", "barBorderWidth"],
      ["opacity"],
      ["shadowBlur"],
      ["shadowOffsetX"],
      ["shadowOffsetY"],
      ["shadowColor"],
    ]),
    Ux = {
      getBarItemStyle: function (t) {
        var typeof_ = Zx(this, t);
        if (this.getBorderLineDash) {
          var n = this.getBorderLineDash();
          n && (typeof_.lineDash = n);
        }
        return typeof_;
      },
    },
    Xx = ["itemStyle", "barBorderWidth"];
  (a(Wi.prototype, Ux),
    ga({
      type: "bar",
      render: function (t, e, n) {
        this._updateDrawMode(t);
        var i = t.get("coordinateSystem");
        return (
          ("cartesian2d" !== i && "polar" !== i) ||
            (this._isLargeDraw ? this._renderLarge(t, e, n) : this._renderNormal(t, e, n)),
          this.group
        );
      },
      incrementalPrepareRender: function (t, e, n) {
        (this._clear(), this._updateDrawMode(t));
      },
      incrementalRender: function (t, e, n, i) {
        this._incrementalRenderLarge(t, e);
      },
      _updateDrawMode: function (t) {
        var typeof_ = t.pipelineContext.large;
        (null == this._isLargeDraw || typeof_ ^ this._isLargeDraw) &&
          ((this._isLargeDraw = typeof_), this._clear());
      },
      _renderNormal: function (t, e, n) {
        var i,
          r = this.group,
          o = t.getData(),
          a = this._data,
          s = t.coordinateSystem,
          l = s.getBaseAxis();
        "cartesian2d" === s.type
          ? (i = l.isHorizontal())
          : "polar" === s.type && (i = "angle" === l.dim);
        var h = t.isAnimationEnabled() ? t : null;
        (o
          .diff(a)
          .add(function (e) {
            if (o.hasValue(e)) {
              var n = o.getItemModel(e),
                a = jx[s.type](o, e, n),
                l = Yx[s.type](o, e, n, a, i, h);
              (o.setItemGraphicEl(e, l), r.add(l), _l(l, o, e, n, a, t, i, "polar" === s.type));
            }
          })
          .update(function (e, n) {
            var l = a.getItemGraphicEl(n);
            if (o.hasValue(e)) {
              var u = o.getItemModel(e),
                c = jx[s.type](o, e, u);
              (l
                ? zi(
                    l,
                    {
                      shape: c,
                    },
                    h,
                    e,
                  )
                : (l = Yx[s.type](o, e, u, c, i, h, !0)),
                o.setItemGraphicEl(e, l),
                r.add(l),
                _l(l, o, e, u, c, t, i, "polar" === s.type));
            } else r.remove(l);
          })
          .remove(function (t) {
            var typeof_ = a.getItemGraphicEl(t);
            "cartesian2d" === s.type ? typeof_ && yl(t, h, typeof_) : typeof_ && xl(t, h, typeof_);
          })
          .execute(),
          (this._data = o));
      },
      _renderLarge: function (t, e, n) {
        (this._clear(), wl(t, this.group));
      },
      _incrementalRenderLarge: function (t, e) {
        wl(e, this.group, !0);
      },
      dispose: B,
      remove: function (t) {
        this._clear(t);
      },
      _clear: function (t) {
        var typeof_ = this.group,
          n = this._data;
        (t && t.get("animation") && n && !this._isLargeDraw
          ? n.eachItemGraphicEl(function (e) {
              "sector" === e.type ? xl(e.dataIndex, t, e) : yl(e.dataIndex, t, e);
            })
          : typeof_.removeAll(),
          (this._data = null));
      },
    }));
  var Yx = {
      cartesian2d: function (t, e, n, i, r, o, s) {
        var l = new pg({
          shape: a({}, i),
        });
        if (o) {
          var h = r ? "height" : "width",
            u = {};
          ((l.shape[h] = 0),
            (u[h] = i[h]),
            Lg[s ? "updateProps" : "initProps"](
              l,
              {
                shape: u,
              },
              o,
              e,
            ));
        }
        return l;
      },
      polar: function (t, e, n, i, r, o, a) {
        var l = i.startAngle < i.endAngle,
          h = new ag({
            shape: s(
              {
                clockwise: l,
              },
              i,
            ),
          });
        if (o) {
          var u = r ? "r" : "endAngle",
            c = {};
          ((h.shape[u] = r ? 0 : i.startAngle),
            (c[u] = i[u]),
            Lg[a ? "updateProps" : "initProps"](
              h,
              {
                shape: c,
              },
              o,
              e,
            ));
        }
        return h;
      },
    },
    jx = {
      cartesian2d: function (t, e, n) {
        var i = t.getItemLayout(e),
          r = (function (t, e) {
            var n = t.get(Xx) || 0;
            return Math.min(n, Math.abs(e.width), Math.abs(e.height));
          })(n, i),
          o = i.width > 0 ? 1 : -1,
          a = i.height > 0 ? 1 : -1;
        return {
          x: i.x + (o * r) / 2,
          y: i.y + (a * r) / 2,
          width: i.width - o * r,
          height: i.height - a * r,
        };
      },
      polar: function (t, e, n) {
        var i = t.getItemLayout(e);
        return {
          cx: i.cx,
          cy: i.cy,
          r0: i.r0,
          r: i.r,
          startAngle: i.startAngle,
          endAngle: i.endAngle,
        };
      },
    },
    qx = qn.extend({
      type: "largeBar",
      shape: {
        points: [],
      },
      buildPath: function (t, e) {
        for (
          var n = e.points, i = this.__startPoint, r = this.__valueIdx, o = 0;
          o < n.length;
          o += 2
        )
          ((i[this.__valueIdx] = n[o + r]), t.moveTo(i[0], i[1]), t.lineTo(n[o], n[o + 1]));
      },
    });
  (la(
    y(function (t, e) {
      var n = Xa(t, e),
        i = Ya(n),
        r = {};
      f(
        n,
        function (t) {
          var typeof_ = t.getData(),
            n = t.coordinateSystem,
            o = n.getBaseAxis(),
            a = Za(t),
            s = i[Ua(o)][a],
            l = s.offset,
            h = s.width,
            u = n.getOtherAxis(o),
            c = t.get("barMinHeight") || 0;
          ((r[a] = r[a] || []),
            typeof_.setLayout({
              offset: l,
              size: h,
            }));
          for (
            var d = typeof_.mapDimension(u.dim),
              f = typeof_.mapDimension(o.dim),
              p = za(typeof_, d),
              g = u.isHorizontal(),
              m = Ka(0, u),
              v = 0,
              y = typeof_.count();
            v < y;
            v++
          ) {
            var x = typeof_.get(d, v),
              _ = typeof_.get(f, v);
            if (!isNaN(x)) {
              var w,
                b,
                S,
                M,
                I = x >= 0 ? "p" : "n",
                T = m;
              if (
                (p &&
                  (r[a][_] ||
                    (r[a][_] = {
                      p: m,
                      n: m,
                    }),
                  (T = r[a][_][I])),
                g)
              )
                ((w = T),
                  (b = (A = n.dataToPoint([x, _]))[1] + l),
                  (S = A[0] - m),
                  (M = h),
                  Math.abs(S) < c && (S = (S < 0 ? -1 : 1) * c),
                  p && (r[a][_][I] += S));
              else {
                var A = n.dataToPoint([_, x]);
                ((w = A[0] + l),
                  (b = T),
                  (S = h),
                  (M = A[1] - m),
                  Math.abs(M) < c && (M = (M <= 0 ? -1 : 1) * c),
                  p && (r[a][_][I] += M));
              }
              typeof_.setItemLayout(v, {
                x: w,
                y: b,
                width: S,
                height: M,
              });
            }
          }
        },
        this,
      );
    }, "bar"),
  ),
    la(Sy),
    ha({
      seriesType: "bar",
      reset: function (t) {
        t.getData().setVisual("legendSymbol", "roundRect");
      },
    }));
  var $x = {
      updateSelectedMap: function (t) {
        ((this._targetList = x(t) ? t.slice() : []),
          (this._selectTargetMap = g(
            t || [],
            function (t, e) {
              return (t.set(e.name, e), t);
            },
            R(),
          )));
      },
      select: function (t, e) {
        var n = null != e ? this._targetList[e] : this._selectTargetMap.get(t);
        ("single" === this.get("selectedMode") &&
          this._selectTargetMap.each(function (t) {
            t.selected = !1;
          }),
          n && (n.selected = !0));
      },
      unSelect: function (t, e) {
        var n = null != e ? this._targetList[e] : this._selectTargetMap.get(t);
        n && (n.selected = !1);
      },
      toggleSelected: function (t, e) {
        var n = null != e ? this._targetList[e] : this._selectTargetMap.get(t);
        if (null != n) return (this[n.selected ? "unSelect" : "select"](t, e), n.selected);
      },
      isSelected: function (t, e) {
        var n = null != e ? this._targetList[e] : this._selectTargetMap.get(t);
        return n && n.selected;
      },
    },
    Kx = pa({
      type: "series.pie",
      init: function (t) {
        (Kx.superApply(this, "init", arguments),
          (this.legendDataProvider = function () {
            return this.getRawData();
          }),
          this.updateSelectedMap(this._createSelectableList()),
          this._defaultLabelLine(t));
      },
      mergeOption: function (t) {
        (Kx.superCall(this, "mergeOption", t),
          this.updateSelectedMap(this._createSelectableList()));
      },
      getInitialData: function (t, e) {
        return (function (t, e, n) {
          e =
            (x(e) && {
              coordDimensions: e,
            }) ||
            a({}, e);
          var i = t.getSource(),
            r = py(i, e),
            o = new cy(r, t);
          return (o.initData(i, n), o);
        })(this, ["value"]);
      },
      _createSelectableList: function () {
        for (
          var t = this.getRawData(),
            typeof_ = t.mapDimension("value"),
            n = [],
            i = 0,
            r = t.count();
          i < r;
          i++
        )
          n.push({
            name: t.getName(i),
            value: t.get(typeof_, i),
            selected: Jr(t, i, "selected"),
          });
        return n;
      },
      getDataParams: function (t) {
        var typeof_ = this.getData(),
          n = Kx.superCall(this, "getDataParams", t),
          i = [];
        return (
          typeof_.each(typeof_.mapDimension("value"), function (t) {
            i.push(t);
          }),
          (n.percent = Ji(i, t, typeof_.hostModel.get("percentPrecision"))),
          n.$vars.push("percent"),
          n
        );
      },
      _defaultLabelLine: function (t) {
        on(t, "labelLine", ["show"]);
        var typeof_ = t.labelLine,
          n = t.emphasis.labelLine;
        ((typeof_.show = typeof_.show && t.label.show), (n.show = n.show && t.emphasis.label.show));
      },
      defaultOption: {
        zlevel: 0,
        z: 2,
        legendHoverLink: !0,
        hoverAnimation: !0,
        center: ["50%", "50%"],
        radius: [0, "75%"],
        clockwise: !0,
        startAngle: 90,
        minAngle: 0,
        selectedOffset: 10,
        hoverOffset: 10,
        avoidLabelOverlap: !0,
        percentPrecision: 2,
        stillShowZeroSum: !0,
        label: {
          rotate: !1,
          show: !0,
          position: "outer",
        },
        labelLine: {
          show: !0,
          length: 15,
          length2: 15,
          smooth: !1,
          lineStyle: {
            width: 1,
            type: "solid",
          },
        },
        itemStyle: {
          borderWidth: 1,
        },
        animationType: "expansion",
        animationEasing: "cubicOut",
      },
    });
  c(Kx, $x);
  var Qx = Ml.prototype;
  ((Qx.updateData = function (t, e, n) {
    function i() {
      (o.stopAnimation(!0),
        o.animateTo(
          {
            shape: {
              r: u.r + l.get("hoverOffset"),
            },
          },
          300,
          "elasticOut",
        ));
    }
    function r() {
      (o.stopAnimation(!0),
        o.animateTo(
          {
            shape: {
              r: u.r,
            },
          },
          300,
          "elasticOut",
        ));
    }
    var o = this.childAt(0),
      l = t.hostModel,
      h = t.getItemModel(e),
      u = t.getItemLayout(e),
      c = a({}, u);
    ((c.label = null),
      n
        ? (o.setShape(c),
          "scale" === l.getShallow("animationType")
            ? ((o.shape.r = u.r0),
              Ei(
                o,
                {
                  shape: {
                    r: u.r,
                  },
                },
                l,
                e,
              ))
            : ((o.shape.endAngle = u.startAngle),
              zi(
                o,
                {
                  shape: {
                    endAngle: u.endAngle,
                  },
                },
                l,
                e,
              )))
        : zi(
            o,
            {
              shape: c,
            },
            l,
            e,
          ));
    var d = t.getItemVisual(e, "color");
    (o.useStyle(
      s(
        {
          lineJoin: "bevel",
          fill: d,
        },
        h.getModel("itemStyle").getItemStyle(),
      ),
    ),
      (o.hoverStyle = h.getModel("emphasis.itemStyle").getItemStyle()));
    var f = h.getShallow("cursor");
    (f && o.attr("cursor", f),
      Sl(
        this,
        t.getItemLayout(e),
        l.isSelected(null, e),
        l.get("selectedOffset"),
        l.get("animation"),
      ),
      o.off("mouseover").off("mouseout").off("emphasis").off("normal"),
      h.get("hoverAnimation") &&
        l.isAnimationEnabled() &&
        o.on("mouseover", i).on("mouseout", r).on("emphasis", i).on("normal", r),
      this._updateLabel(t, e),
      Si(this));
  }),
    (Qx._updateLabel = function (t, e) {
      var n = this.childAt(1),
        i = this.childAt(2),
        r = t.hostModel,
        o = t.getItemModel(e),
        a = t.getItemLayout(e).label,
        s = t.getItemVisual(e, "color");
      (zi(
        n,
        {
          shape: {
            points: a.linePoints || [
              [a.x, a.y],
              [a.x, a.y],
              [a.x, a.y],
            ],
          },
        },
        r,
        e,
      ),
        zi(
          i,
          {
            style: {
              x: a.x,
              y: a.y,
            },
          },
          r,
          e,
        ),
        i.attr({
          rotation: a.rotation,
          origin: [a.x, a.y],
          z2: 10,
        }));
      var l = o.getModel("label"),
        h = o.getModel("emphasis.label"),
        u = o.getModel("labelLine"),
        c = o.getModel("emphasis.labelLine");
      ((s = t.getItemVisual(e, "color")),
        Ii(
          i.style,
          (i.hoverStyle = {}),
          l,
          h,
          {
            labelFetcher: t.hostModel,
            labelDataIndex: e,
            defaultText: t.getName(e),
            autoColor: s,
            useInsideStyle: !!a.inside,
          },
          {
            textAlign: a.textAlign,
            textVerticalAlign: a.verticalAlign,
            opacity: t.getItemVisual(e, "opacity"),
          },
        ),
        (i.ignore = i.normalIgnore = !l.get("show")),
        (i.hoverIgnore = !h.get("show")),
        (n.ignore = n.normalIgnore = !u.get("show")),
        (n.hoverIgnore = !c.get("show")),
        n.setStyle({
          stroke: s,
          opacity: t.getItemVisual(e, "opacity"),
        }),
        n.setStyle(u.getModel("lineStyle").getLineStyle()),
        (n.hoverStyle = c.getModel("lineStyle").getLineStyle()));
      var d = u.get("smooth");
      (d && !0 === d && (d = 0.4),
        n.setShape({
          smooth: d,
        }));
    }),
    u(Ml, qd),
    uo.extend({
      type: "pie",
      init: function () {
        var t = new qd();
        this._sectorGroup = t;
      },
      render: function (t, e, n, i) {
        if (!i || i.from !== this.uid) {
          var r = t.getData(),
            o = this._data,
            a = this.group,
            s = e.get("animation"),
            l = !o,
            h = t.get("animationType"),
            u = y(bl, this.uid, t, s, n),
            c = t.get("selectedMode");
          if (
            (r
              .diff(o)
              .add(function (t) {
                var typeof_ = new Ml(r, t);
                (l &&
                  "scale" !== h &&
                  typeof_.eachChild(function (t) {
                    t.stopAnimation(!0);
                  }),
                  c && typeof_.on("click", u),
                  r.setItemGraphicEl(t, typeof_),
                  a.add(typeof_));
              })
              .update(function (t, e) {
                var n = o.getItemGraphicEl(e);
                (n.updateData(r, t),
                  n.off("click"),
                  c && n.on("click", u),
                  a.add(n),
                  r.setItemGraphicEl(t, n));
              })
              .remove(function (t) {
                var typeof_ = o.getItemGraphicEl(t);
                a.remove(typeof_);
              })
              .execute(),
            s && l && r.count() > 0 && "scale" !== h)
          ) {
            var d = r.getItemLayout(0),
              f = Math.max(n.getWidth(), n.getHeight()) / 2,
              p = v(a.removeClipPath, a);
            a.setClipPath(this._createClipPath(d.cx, d.cy, f, d.startAngle, d.clockwise, p, t));
          } else a.removeClipPath();
          this._data = r;
        }
      },
      dispose: function () {},
      _createClipPath: function (t, e, n, i, r, o, a) {
        var s = new ag({
          shape: {
            cx: t,
            cy: e,
            r0: 0,
            r: n,
            startAngle: i,
            endAngle: i,
            clockwise: r,
          },
        });
        return (
          Ei(
            s,
            {
              shape: {
                endAngle: i + (r ? 1 : -1) * Math.PI * 2,
              },
            },
            a,
            o,
          ),
          s
        );
      },
      containPoint: function (t, e) {
        var n = e.getData().getItemLayout(0);
        if (n) {
          var i = t[0] - n.cx,
            r = t[1] - n.cy,
            o = Math.sqrt(i * i + r * r);
          return o <= n.r && o >= n.r0;
        }
      },
    }));
  var Jx = function (t, e, n, i) {
      var r,
        o,
        a = t.getData(),
        s = [],
        l = !1;
      (a.each(function (n) {
        var i,
          h,
          u,
          c,
          d = a.getItemLayout(n),
          f = a.getItemModel(n),
          p = f.getModel("label"),
          g = p.get("position") || f.get("emphasis.label.position"),
          m = f.getModel("labelLine"),
          v = m.get("length"),
          y = m.get("length2"),
          x = (d.startAngle + d.endAngle) / 2,
          _ = Math.cos(x),
          w = Math.sin(x);
        ((r = d.cx), (o = d.cy));
        var b = "inside" === g || "inner" === g;
        if ("center" === g) ((i = d.cx), (h = d.cy), (c = "center"));
        else {
          var S = (b ? ((d.r + d.r0) / 2) * _ : d.r * _) + r,
            M = (b ? ((d.r + d.r0) / 2) * w : d.r * w) + o;
          if (((i = S + 3 * _), (h = M + 3 * w), !b)) {
            var I = S + _ * (v + e - d.r),
              T = M + w * (v + e - d.r),
              A = I + (_ < 0 ? -1 : 1) * y;
            ((i = A + (_ < 0 ? -5 : 5)),
              (h = T),
              (u = [
                [S, M],
                [I, T],
                [A, T],
              ]));
          }
          c = b ? "center" : _ > 0 ? "left" : "right";
        }
        var C = p.getFont(),
          D = p.get("rotate") ? (_ < 0 ? -x + Math.PI : -x) : 0,
          k = ye(t.getFormattedLabel(n, "normal") || a.getName(n), C, c, "top");
        ((l = !!D),
          (d.label = {
            x: i,
            y: h,
            position: g,
            height: k.height,
            len: v,
            len2: y,
            linePoints: u,
            textAlign: c,
            verticalAlign: "middle",
            rotation: D,
            inside: b,
          }),
          b || s.push(d.label));
      }),
        !l &&
          t.get("avoidLabelOverlap") &&
          (function (t, e, n, i, r, o) {
            for (var a = [], s = [], l = 0; l < t.length; l++)
              Tl(t[l]) || (t[l].x < e ? a.push(t[l]) : s.push(t[l]));
            for (Il(s, e, n, i, 1, 0, o), Il(a, e, n, i, -1, 0, o), l = 0; l < t.length; l++)
              if (!Tl(t[l])) {
                var h = t[l].linePoints;
                if (h) {
                  var u = h[1][0] - h[2][0];
                  (t[l].x < e ? (h[2][0] = t[l].x + 3) : (h[2][0] = t[l].x - 3),
                    (h[1][1] = h[2][1] = t[l].y),
                    (h[1][0] = h[2][0] + u));
                }
              }
          })(s, r, o, e, 0, i));
    },
    t_ = 2 * Math.PI,
    e_ = Math.PI / 180;
  (f(
    [
      {
        type: "pieToggleSelect",
        event: "pieselectchanged",
        method: "toggleSelected",
      },
      {
        type: "pieSelect",
        event: "pieselected",
        method: "select",
      },
      {
        type: "pieUnSelect",
        event: "pieunselected",
        method: "unSelect",
      },
    ],
    function (t) {
      ((t.update = "updateView"),
        sa(t, function (e, n) {
          var i = {};
          return (
            n.eachComponent(
              {
                mainType: "series",
                subType: "pie",
                query: e,
              },
              function (n) {
                n[t.method] && n[t.method](e.name, e.dataIndex);
                var r = n.getData();
                r.each(function (t) {
                  var typeof_ = r.getName(t);
                  i[typeof_] = n.isSelected(typeof_) || !1;
                });
              },
            ),
            {
              name: e.name,
              selected: i,
            }
          );
        }));
    },
  ),
    ha({
      getTargetSeries: function (t) {
        var typeof_ = {},
          n = R();
        return (
          t.eachSeriesByType("pie", function (t) {
            ((t.__paletteScope = typeof_), n.set(t.uid, t));
          }),
          n
        );
      },
      reset: function (t, e) {
        var n = t.getRawData(),
          i = {},
          r = t.getData();
        (r.each(function (t) {
          var typeof_ = r.getRawIndex(t);
          i[typeof_] = t;
        }),
          n.each(function (e) {
            var o = i[e],
              a = null != o && r.getItemVisual(o, "color", !0);
            if (a) n.setItemVisual(e, "color", a);
            else {
              var s =
                n.getItemModel(e).get("itemStyle.color") ||
                t.getColorFromPalette(n.getName(e) || e + "", t.__paletteScope, n.count());
              (n.setItemVisual(e, "color", s), null != o && r.setItemVisual(o, "color", s));
            }
          }));
      },
    }),
    la(
      y(function (t, e, n, i) {
        e.eachSeriesByType(t, function (t) {
          var typeof_ = t.getData(),
            i = typeof_.mapDimension("value"),
            r = t.get("center"),
            o = t.get("radius");
          (x(o) || (o = [0, o]), x(r) || (r = [r, r]));
          var a = n.getWidth(),
            s = n.getHeight(),
            l = Math.min(a, s),
            h = Yi(r[0], a),
            u = Yi(r[1], s),
            c = Yi(o[0], l / 2),
            d = Yi(o[1], l / 2),
            f = -t.get("startAngle") * e_,
            p = t.get("minAngle") * e_,
            g = 0;
          typeof_.each(i, function (t) {
            !isNaN(t) && g++;
          });
          var m = typeof_.getSum(i),
            v = (Math.PI / (m || g)) * 2,
            y = t.get("clockwise"),
            _ = t.get("roseType"),
            w = t.get("stillShowZeroSum"),
            b = typeof_.getDataExtent(i);
          b[0] = 0;
          var S = t_,
            M = 0,
            I = f,
            T = y ? 1 : -1;
          if (
            (typeof_.each(i, function (t, n) {
              var i;
              if (isNaN(t))
                typeof_.setItemLayout(n, {
                  angle: NaN,
                  startAngle: NaN,
                  endAngle: NaN,
                  clockwise: y,
                  cx: h,
                  cy: u,
                  r0: c,
                  r: _ ? NaN : d,
                });
              else {
                (i = "area" !== _ ? (0 === m && w ? v : t * v) : t_ / g) < p
                  ? ((i = p), (S -= p))
                  : (M += t);
                var r = I + T * i;
                (typeof_.setItemLayout(n, {
                  angle: i,
                  startAngle: I,
                  endAngle: r,
                  clockwise: y,
                  cx: h,
                  cy: u,
                  r0: c,
                  r: _ ? Xi(t, b, [c, d]) : d,
                }),
                  (I = r));
              }
            }),
            S < t_ && g)
          )
            if (S <= 0.001) {
              var A = t_ / g;
              typeof_.each(i, function (t, n) {
                if (!isNaN(t)) {
                  var i = typeof_.getItemLayout(n);
                  ((i.angle = A),
                    (i.startAngle = f + T * n * A),
                    (i.endAngle = f + T * (n + 1) * A));
                }
              });
            } else
              ((v = S / M),
                (I = f),
                typeof_.each(i, function (t, n) {
                  if (!isNaN(t)) {
                    var i = typeof_.getItemLayout(n),
                      r = i.angle === p ? p : t * v;
                    ((i.startAngle = I), (i.endAngle = I + T * r), (I += T * r));
                  }
                }));
          Jx(t, d, 0, s);
        });
      }, "pie"),
    ),
    aa({
      seriesType: "pie",
      reset: function (t, e) {
        var n = e.findComponents({
          mainType: "legend",
        });
        if (n && n.length) {
          var i = t.getData();
          i.filterSelf(function (t) {
            for (var typeof_ = i.getName(t), r = 0; r < n.length; r++)
              if (!n[r].isSelected(typeof_)) return !1;
            return !0;
          });
        }
      },
    }),
    Gm.extend({
      type: "series.scatter",
      dependencies: ["grid", "polar", "geo", "singleAxis", "calendar"],
      getInitialData: function (t, e) {
        return Na(this.getSource(), this);
      },
      brushSelector: "point",
      getProgressive: function () {
        var t = this.option.progressive;
        return null == t ? (this.option.large ? 5e3 : this.get("progressive")) : t;
      },
      getProgressiveThreshold: function () {
        var t = this.option.progressiveThreshold;
        return null == t ? (this.option.large ? 1e4 : this.get("progressiveThreshold")) : t;
      },
      defaultOption: {
        coordinateSystem: "cartesian2d",
        zlevel: 0,
        z: 2,
        legendHoverLink: !0,
        hoverAnimation: !0,
        symbolSize: 10,
        large: !1,
        largeThreshold: 2e3,
        itemStyle: {
          opacity: 0.8,
        },
      },
    }));
  var n_ = ri({
      shape: {
        points: null,
      },
      symbolProxy: null,
      buildPath: function (t, e) {
        var n = e.points,
          i = e.size,
          r = this.symbolProxy,
          o = r.shape;
        if (!((t.getContext ? t.getContext() : t) && i[0] < 4))
          for (var a = 0; a < n.length;) {
            var s = n[a++],
              l = n[a++];
            isNaN(s) ||
              isNaN(l) ||
              ((o.x = s - i[0] / 2),
              (o.y = l - i[1] / 2),
              (o.width = i[0]),
              (o.height = i[1]),
              r.buildPath(t, o, !0));
          }
      },
      afterBrush: function (t) {
        var typeof_ = this.shape,
          n = typeof_.points,
          i = typeof_.size;
        if (i[0] < 4) {
          this.setTransform(t);
          for (var r = 0; r < n.length;) {
            var o = n[r++],
              a = n[r++];
            isNaN(o) || isNaN(a) || t.fillRect(o - i[0] / 2, a - i[1] / 2, i[0], i[1]);
          }
          this.restoreTransform(t);
        }
      },
      findDataIndex: function (t, e) {
        for (
          var n = this.shape,
            i = n.points,
            r = n.size,
            o = Math.max(r[0], 4),
            a = Math.max(r[1], 4),
            s = i.length / 2 - 1;
          s >= 0;
          s--
        ) {
          var l = 2 * s,
            h = i[l] - o / 2,
            u = i[l + 1] - a / 2;
          if (t >= h && e >= u && t <= h + o && e <= u + a) return s;
        }
        return -1;
      },
    }),
    i_ = Al.prototype;
  ((i_.isPersistent = function () {
    return !this._incremental;
  }),
    (i_.updateData = function (t) {
      this.group.removeAll();
      var typeof_ = new n_({
        rectHover: !0,
        cursor: "default",
      });
      (typeof_.setShape({
        points: t.getLayout("symbolPoints"),
      }),
        this._setCommon(typeof_, t),
        this.group.add(typeof_),
        (this._incremental = null));
    }),
    (i_.updateLayout = function (t) {
      if (!this._incremental) {
        var typeof_ = t.getLayout("symbolPoints");
        this.group.eachChild(function (t) {
          if (null != t.startIndex) {
            var n = 2 * (t.endIndex - t.startIndex),
              i = 4 * t.startIndex * 2;
            e = new Float32Array(typeof_.buffer, i, n);
          }
          t.setShape("points", typeof_);
        });
      }
    }),
    (i_.incrementalPrepareUpdate = function (t) {
      (this.group.removeAll(),
        this._clearIncremental(),
        t.count() > 2e6
          ? (this._incremental ||
              (this._incremental = new ii({
                silent: !0,
              })),
            this.group.add(this._incremental))
          : (this._incremental = null));
    }),
    (i_.incrementalUpdate = function (t, e) {
      var n;
      (this._incremental
        ? ((n = new n_()), this._incremental.addDisplayable(n, !0))
        : (((n = new n_({
            rectHover: !0,
            cursor: "default",
            startIndex: t.start,
            endIndex: t.end,
          })).incremental = !0),
          this.group.add(n)),
        n.setShape({
          points: e.getLayout("symbolPoints"),
        }),
        this._setCommon(n, e, !!this._incremental));
    }),
    (i_._setCommon = function (t, e, n) {
      var i = e.hostModel,
        r = e.getVisual("symbolSize");
      (t.setShape("size", r instanceof Array ? r : [r, r]),
        (t.symbolProxy = ls(e.getVisual("symbol"), 0, 0, 0, 0)),
        (t.setColor = t.symbolProxy.setColor));
      var o = t.shape.size[0] < 4;
      t.useStyle(
        i
          .getModel("itemStyle")
          .getItemStyle(o ? ["color", "shadowBlur", "shadowColor"] : ["color"]),
      );
      var a = e.getVisual("color");
      (a && t.setColor(a),
        n ||
          ((t.seriesIndex = i.seriesIndex),
          t.on("mousemove", function (e) {
            t.dataIndex = null;
            var n = t.findDataIndex(e.offsetX, e.offsetY);
            n >= 0 && (t.dataIndex = n + (t.startIndex || 0));
          })));
    }),
    (i_.remove = function () {
      (this._clearIncremental(), (this._incremental = null), this.group.removeAll());
    }),
    (i_._clearIncremental = function () {
      var t = this._incremental;
      t && t.clearDisplaybles();
    }),
    ga({
      type: "scatter",
      render: function (t, e, n) {
        var i = t.getData();
        (this._updateSymbolDraw(i, t).updateData(i), (this._finished = !0));
      },
      incrementalPrepareRender: function (t, e, n) {
        var i = t.getData();
        (this._updateSymbolDraw(i, t).incrementalPrepareUpdate(i), (this._finished = !1));
      },
      incrementalRender: function (t, e, n) {
        (this._symbolDraw.incrementalUpdate(t, e.getData()),
          (this._finished = t.end === e.getData().count()));
      },
      updateTransform: function (t, e, n) {
        var i = t.getData();
        if (
          (this.group.dirty(),
          !this._finished || i.count() > 1e4 || !this._symbolDraw.isPersistent())
        )
          return {
            update: !0,
          };
        var r = xx().reset(t);
        (r.progress &&
          r.progress(
            {
              start: 0,
              end: i.count(),
            },
            i,
          ),
          this._symbolDraw.updateLayout(i));
      },
      _updateSymbolDraw: function (t, e) {
        var n = this._symbolDraw,
          i = e.pipelineContext.large;
        return (
          (n && i === this._isLargeDraw) ||
            (n && n.remove(),
            (n = this._symbolDraw = i ? new Al() : new ks()),
            (this._isLargeDraw = i),
            this.group.removeAll()),
          this.group.add(n.group),
          n
        );
      },
      remove: function (t, e) {
        (this._symbolDraw && this._symbolDraw.remove(!0), (this._symbolDraw = null));
      },
      dispose: function () {},
    }),
    ha(yx("scatter", "circle")),
    la(xx("scatter")),
    oa(function (t) {
      var typeof_ = t.graphic;
      x(typeof_)
        ? typeof_[0] && typeof_[0].elements
          ? (t.graphic = [t.graphic[0]])
          : (t.graphic = [
              {
                elements: typeof_,
              },
            ])
        : typeof_ &&
          !typeof_.elements &&
          (t.graphic = [
            {
              elements: [typeof_],
            },
          ]);
    }));
  var r_ = da({
    type: "graphic",
    defaultOption: {
      elements: [],
      parentId: null,
    },
    _elOptionsToUpdate: null,
    mergeOption: function (t) {
      var typeof_ = this.option.elements;
      ((this.option.elements = null),
        r_.superApply(this, "mergeOption", arguments),
        (this.option.elements = typeof_));
    },
    optionUpdated: function (t, e) {
      var n = this.option,
        i = (e ? n : t).elements,
        r = (n.elements = e ? [] : n.elements),
        o = [];
      this._flatten(i, o);
      var a = sn(r, o);
      ln(a);
      var s = (this._elOptionsToUpdate = []);
      f(
        a,
        function (t, e) {
          var n = t.option;
          n &&
            (s.push(n),
            (function (t, e) {
              var n = t.exist;
              if (((e.id = t.keyInfo.id), !e.type && n && (e.type = n.type), null == e.parentId)) {
                var i = e.parentOption;
                i ? (e.parentId = i.id) : n && (e.parentId = n.parentId);
              }
              e.parentOption = null;
            })(t, n),
            Ll(r, e, n),
            (function (t, e) {
              t &&
                ((t.hv = e.hv = [Pl(e, ["left", "right"]), Pl(e, ["top", "bottom"])]),
                "group" === t.type &&
                  (null == t.width && (t.width = e.width = 0),
                  null == t.height && (t.height = e.height = 0)));
            })(r[e], n));
        },
        this,
      );
      for (var l = r.length - 1; l >= 0; l--) null == r[l] ? r.splice(l, 1) : delete r[l].$action;
    },
    _flatten: function (t, e, n) {
      f(
        t,
        function (t) {
          if (t) {
            (n && (t.parentOption = n), e.push(t));
            var i = t.children;
            ("group" === t.type && i && this._flatten(i, e, t), delete t.children);
          }
        },
        this,
      );
    },
    useElOptionsToUpdate: function () {
      var t = this._elOptionsToUpdate;
      return ((this._elOptionsToUpdate = null), t);
    },
  });
  fa({
    type: "graphic",
    init: function (t, e) {
      ((this._elMap = R()), this._lastGraphicModel);
    },
    render: function (t, e, n) {
      (t !== this._lastGraphicModel && this._clear(),
        (this._lastGraphicModel = t),
        this._updateElements(t),
        this._relocate(t, n));
    },
    _updateElements: function (t) {
      var typeof_ = t.useElOptionsToUpdate();
      if (typeof_) {
        var n = this._elMap,
          i = this.group;
        f(typeof_, function (e) {
          var r = e.$action,
            o = e.id,
            a = n.get(o),
            s = e.parentId,
            l = null != s ? n.get(s) : i,
            h = e.style;
          "text" === e.type &&
            h &&
            (e.hv && e.hv[1] && (h.textVerticalAlign = h.textBaseline = null),
            !h.hasOwnProperty("textFill") && h.fill && (h.textFill = h.fill),
            !h.hasOwnProperty("textStroke") && h.stroke && (h.textStroke = h.stroke));
          var u = kl(e);
          r && "merge" !== r
            ? "replace" === r
              ? (Dl(a, n), Cl(o, l, u, n))
              : "remove" === r && Dl(a, n)
            : a
              ? a.attr(u)
              : Cl(o, l, u, n);
          var c = n.get(o);
          c &&
            ((c.__ecGraphicWidth = e.width),
            (c.__ecGraphicHeight = e.height),
            (function (t, e, n) {
              var i = t.eventData;
              (t.silent ||
                t.ignore ||
                i ||
                (i = t.eventData =
                  {
                    componentType: "graphic",
                    componentIndex: e.componentIndex,
                    name: t.name,
                  }),
                i && (i.info = t.info));
            })(c, t));
        });
      }
    },
    _relocate: function (t, e) {
      for (
        var n = t.option.elements, i = this.group, r = this._elMap, o = n.length - 1;
        o >= 0;
        o--
      ) {
        var a = n[o],
          s = r.get(a.id);
        if (s) {
          var l = s.parent;
          mr(
            s,
            a,
            l === i
              ? {
                  width: e.getWidth(),
                  height: e.getHeight(),
                }
              : {
                  width: l.__ecGraphicWidth || 0,
                  height: l.__ecGraphicHeight || 0,
                },
            null,
            {
              hv: a.hv,
              boundingMode: a.bounding,
            },
          );
        }
      }
    },
    _clear: function () {
      var t = this._elMap;
      (t.each(function (e) {
        Dl(e, t);
      }),
        (this._elMap = R()));
    },
    dispose: function () {
      this._clear();
    },
  });
  var o_ = function (t, e) {
      var n,
        i = [],
        r = t.seriesIndex;
      if (null == r || !(n = e.getSeriesByIndex(r)))
        return {
          point: [],
        };
      var o = n.getData(),
        a = cn(o, t);
      if (null == a || a < 0 || x(a))
        return {
          point: [],
        };
      var s = o.getItemGraphicEl(a),
        l = n.coordinateSystem;
      if (n.getTooltipPosition) i = n.getTooltipPosition(a) || [];
      else if (l && l.dataToPoint)
        i =
          l.dataToPoint(
            o.getValues(
              p(l.dimensions, function (t) {
                return o.mapDimension(t);
              }),
              a,
              !0,
            ),
          ) || [];
      else if (s) {
        var h = s.getBoundingRect().clone();
        (h.applyTransform(s.transform), (i = [h.x + h.width / 2, h.y + h.height / 2]));
      }
      return {
        point: i,
        el: s,
      };
    },
    a_ = f,
    s_ = y,
    l_ = dn(),
    h_ =
      (da({
        type: "axisPointer",
        coordSysAxesInfo: null,
        defaultOption: {
          show: "auto",
          triggerOn: null,
          zlevel: 0,
          z: 50,
          type: "line",
          snap: !1,
          triggerTooltip: !0,
          value: null,
          status: null,
          link: [],
          animation: null,
          animationDurationUpdate: 200,
          lineStyle: {
            color: "#aaa",
            width: 1,
            type: "solid",
          },
          shadowStyle: {
            color: "rgba(150,150,150,0.3)",
          },
          label: {
            show: !0,
            formatter: null,
            precision: "auto",
            margin: 3,
            color: "#fff",
            padding: [5, 7, 5, 7],
            backgroundColor: "auto",
            borderColor: null,
            borderWidth: 0,
            shadowBlur: 3,
            shadowColor: "#aaa",
          },
          handle: {
            show: !1,
            icon: "M10.7,11.9v-1.3H9.3v1.3c-4.9,0.3-8.8,4.4-8.8,9.4c0,5,3.9,9.1,8.8,9.4h1.3c4.9-0.3,8.8-4.4,8.8-9.4C19.5,16.3,15.6,12.2,10.7,11.9z M13.3,24.4H6.7v-1.2h6.6z M13.3,22H6.7v-1.2h6.6z M13.3,19.6H6.7v-1.2h6.6z",
            size: 45,
            margin: 50,
            color: "#333",
            shadowBlur: 3,
            shadowColor: "#aaa",
            shadowOffsetX: 0,
            shadowOffsetY: 2,
            throttle: 40,
          },
        },
      }),
      dn()),
    u_ = f,
    c_ = fa({
      type: "axisPointer",
      render: function (t, e, n) {
        var i = e.getComponent("tooltip"),
          r = t.get("triggerOn") || (i && i.get("triggerOn")) || "mousemove|click";
        Fl("axisPointer", n, function (t, e, n) {
          "none" !== r &&
            ("leave" === t || r.indexOf(t) >= 0) &&
            n({
              type: "updateAxisPointer",
              currTrigger: t,
              x: e && e.offsetX,
              y: e && e.offsetY,
            });
        });
      },
      remove: function (t, e) {
        (Wl(e.getZr(), "axisPointer"), c_.superApply(this._model, "remove", arguments));
      },
      dispose: function (t, e) {
        (Wl("axisPointer", e), c_.superApply(this._model, "dispose", arguments));
      },
    }),
    d_ = dn(),
    f_ = i,
    p_ = v;
  (((Gl.prototype = {
    _group: null,
    _lastGraphicKey: null,
    _handle: null,
    _dragging: !1,
    _lastValue: null,
    _lastStatus: null,
    _payloadInfo: null,
    animationThreshold: 15,
    render: function (t, e, n, i) {
      var r = e.get("value"),
        o = e.get("status");
      if (
        ((this._axisModel = t),
        (this._axisPointerModel = e),
        (this._api = n),
        i || this._lastValue !== r || this._lastStatus !== o)
      ) {
        ((this._lastValue = r), (this._lastStatus = o));
        var a = this._group,
          s = this._handle;
        if (!o || "hide" === o) return (a && a.hide(), void (s && s.hide()));
        (a && a.show(), s && s.show());
        var l = {};
        this.makeElOption(l, r, t, e, n);
        var h = l.graphicKey;
        (h !== this._lastGraphicKey && this.clear(n), (this._lastGraphicKey = h));
        var u = (this._moveAnimation = this.determineAnimation(t, e));
        if (a) {
          var c = y(Zl, e, u);
          (this.updatePointerEl(a, l, c, e), this.updateLabelEl(a, l, c, e));
        } else
          ((a = this._group = new qd()),
            this.createPointerEl(a, l, t, e),
            this.createLabelEl(a, l, t, e),
            n.getZr().add(a));
        (jl(a, e, !0), this._renderHandle(r));
      }
    },
    remove: function (t) {
      this.clear(t);
    },
    dispose: function (t) {
      this.clear(t);
    },
    determineAnimation: function (t, e) {
      var n = e.get("animation"),
        i = t.axis,
        r = "category" === i.type,
        o = e.get("snap");
      if (!o && !r) return !1;
      if ("auto" === n || null == n) {
        var a = this.animationThreshold;
        if (r && i.getBandWidth() > a) return !0;
        if (o) {
          var s = cl(t).seriesDataCount,
            l = i.getExtent();
          return Math.abs(l[0] - l[1]) / s > a;
        }
        return !1;
      }
      return !0 === n;
    },
    makeElOption: function (t, e, n, i, r) {},
    createPointerEl: function (t, e, n, i) {
      var r = e.pointer;
      if (r) {
        var o = (d_(t).pointerEl = new Lg[r.type](f_(e.pointer)));
        t.add(o);
      }
    },
    createLabelEl: function (t, e, n, i) {
      if (e.label) {
        var r = (d_(t).labelEl = new pg(f_(e.label)));
        (t.add(r), Xl(r, i));
      }
    },
    updatePointerEl: function (t, e, n) {
      var i = d_(t).pointerEl;
      i &&
        (i.setStyle(e.pointer.style),
        n(i, {
          shape: e.pointer.shape,
        }));
    },
    updateLabelEl: function (t, e, n, i) {
      var r = d_(t).labelEl;
      r &&
        (r.setStyle(e.label.style),
        n(r, {
          shape: e.label.shape,
          position: e.label.position,
        }),
        Xl(r, i));
    },
    _renderHandle: function (t) {
      if (!this._dragging && this.updateHandleTransform) {
        var typeof_,
          n = this._axisPointerModel,
          i = this._api.getZr(),
          r = this._handle,
          o = n.getModel("handle"),
          a = n.get("status");
        if (!o.get("show") || !a || "hide" === a)
          return (r && i.remove(r), void (this._handle = null));
        (this._handle ||
          ((e = !0),
          (r = this._handle =
            Hi(o.get("icon"), {
              cursor: "move",
              draggable: !0,
              onmousemove: function (t) {
                dd(t.event);
              },
              onmousedown: p_(this._onHandleDragMove, this, 0, 0),
              drift: p_(this._onHandleDragMove, this),
              ondragend: p_(this._onHandleDragEnd, this),
            })),
          i.add(r)),
          jl(r, n, !1),
          r.setStyle(
            o.getItemStyle(null, [
              "color",
              "borderColor",
              "borderWidth",
              "opacity",
              "shadowColor",
              "shadowBlur",
              "shadowOffsetX",
              "shadowOffsetY",
            ]),
          ));
        var s = o.get("size");
        (x(s) || (s = [s, s]),
          r.attr("scale", [s[0] / 2, s[1] / 2]),
          vo(this, "_doDispatchAxisPointer", o.get("throttle") || 0, "fixRate"),
          this._moveHandleToValue(t, typeof_));
      }
    },
    _moveHandleToValue: function (t, e) {
      Zl(
        this._axisPointerModel,
        !e && this._moveAnimation,
        this._handle,
        Yl(this.getHandleTransform(t, this._axisModel, this._axisPointerModel)),
      );
    },
    _onHandleDragMove: function (t, e) {
      var n = this._handle;
      if (n) {
        this._dragging = !0;
        var i = this.updateHandleTransform(Yl(n), [t, e], this._axisModel, this._axisPointerModel);
        ((this._payloadInfo = i),
          n.stopAnimation(),
          n.attr(Yl(i)),
          (d_(n).lastProp = null),
          this._doDispatchAxisPointer());
      }
    },
    _doDispatchAxisPointer: function () {
      if (this._handle) {
        var t = this._payloadInfo,
          typeof_ = this._axisModel;
        this._api.dispatchAction({
          type: "updateAxisPointer",
          x: t.cursorPoint[0],
          y: t.cursorPoint[1],
          tooltipOption: t.tooltipOption,
          axesInfo: [
            {
              axisDim: typeof_.axis.dim,
              axisIndex: typeof_.componentIndex,
            },
          ],
        });
      }
    },
    _onHandleDragEnd: function (t) {
      if (((this._dragging = !1), this._handle)) {
        var typeof_ = this._axisPointerModel.get("value");
        (this._moveHandleToValue(typeof_),
          this._api.dispatchAction({
            type: "hideTip",
          }));
      }
    },
    getHandleTransform: null,
    updateHandleTransform: null,
    clear: function (t) {
      ((this._lastValue = null), (this._lastStatus = null));
      var typeof_ = t.getZr(),
        n = this._group,
        i = this._handle;
      typeof_ &&
        n &&
        ((this._lastGraphicKey = null),
        n && typeof_.remove(n),
        i && typeof_.remove(i),
        (this._group = null),
        (this._handle = null),
        (this._payloadInfo = null));
    },
    doClear: function () {},
    buildLabel: function (t, e, n) {
      return {
        x: t[(n = n || 0)],
        y: t[1 - n],
        width: e[n],
        height: e[1 - n],
      };
    },
  }).constructor = Gl),
    yn(Gl));
  var g_ = Gl.extend({
      makeElOption: function (t, e, n, i, r) {
        var o = n.axis,
          a = o.grid,
          s = i.get("type"),
          l = Jl(a, o).getOtherAxis(o).getGlobalExtent(),
          h = o.toGlobalCoord(o.dataToCoord(e, !0));
        if (s && "none" !== s) {
          var u = (function (t) {
              var typeof_,
                n = t.get("type"),
                i = t.getModel(n + "Style");
              return (
                "line" === n
                  ? ((e = i.getLineStyle()).fill = null)
                  : "shadow" === n && ((e = i.getAreaStyle()).stroke = null),
                typeof_
              );
            })(i),
            c = m_[s](o, h, l, u);
          ((c.style = u), (t.graphicKey = c.type), (t.pointer = c));
        }
        !(function (t, e, n, i, r, o) {
          var a = zx.innerTextLayout(n.rotation, 0, n.labelDirection);
          ((n.labelMargin = r.get("label.margin")),
            ql(e, i, r, o, {
              position: Kl(i.axis, t, n),
              align: a.textAlign,
              verticalAlign: a.textVerticalAlign,
            }));
        })(e, t, ml(a.model, n), n, i, r);
      },
      getHandleTransform: function (t, e, n) {
        var i = ml(e.axis.grid.model, e, {
          labelInside: !1,
        });
        return (
          (i.labelMargin = n.get("handle.margin")),
          {
            position: Kl(e.axis, t, i),
            rotation: i.rotation + (i.labelDirection < 0 ? Math.PI : 0),
          }
        );
      },
      updateHandleTransform: function (t, e, n, i) {
        var r = n.axis,
          o = r.grid,
          a = r.getGlobalExtent(!0),
          s = Jl(o, r).getOtherAxis(r).getGlobalExtent(),
          l = "x" === r.dim ? 0 : 1,
          h = t.position;
        ((h[l] += e[l]), (h[l] = Math.min(a[1], h[l])), (h[l] = Math.max(a[0], h[l])));
        var u = (s[1] + s[0]) / 2,
          c = [u, u];
        return (
          (c[l] = h[l]),
          {
            position: h,
            rotation: t.rotation,
            cursorPoint: c,
            tooltipOption: [
              {
                verticalAlign: "middle",
              },
              {
                align: "center",
              },
            ][l],
          }
        );
      },
    }),
    m_ = {
      line: function (t, e, n, i) {
        var r = (function (t, e, n) {
          return {
            x1: t[(n = n || 0)],
            y1: t[1 - n],
            x2: e[n],
            y2: e[1 - n],
          };
        })([e, n[0]], [e, n[1]], th(t));
        return (
          hi({
            shape: r,
            style: i,
          }),
          {
            type: "Line",
            shape: r,
          }
        );
      },
      shadow: function (t, e, n, i) {
        var r = Math.max(1, t.getBandWidth()),
          o = n[1] - n[0];
        return {
          type: "Rect",
          shape: Ql([e - r / 2, n[0]], [r, o], th(t)),
        };
      },
    };
  (Fx.registerAxisPointerClass("CartesianAxisPointer", g_),
    oa(function (t) {
      if (t) {
        (!t.axisPointer || 0 === t.axisPointer.length) && (t.axisPointer = {});
        var typeof_ = t.axisPointer.link;
        typeof_ && !x(typeof_) && (t.axisPointer.link = [typeof_]);
      }
    }),
    aa(zv.PROCESSOR.STATISTIC, function (t, e) {
      t.getComponent("axisPointer").coordSysAxesInfo = ll(t, e);
    }),
    sa(
      {
        type: "updateAxisPointer",
        event: "updateAxisPointer",
        update: ":updateAxisPointer",
      },
      function (t, e, n) {
        var i = t.currTrigger,
          r = [t.x, t.y],
          o = t,
          a = t.dispatchAction || v(n.dispatchAction, n),
          s = e.getComponent("axisPointer").coordSysAxesInfo;
        if (s) {
          Bl(r) &&
            (r = o_(
              {
                seriesIndex: o.seriesIndex,
                dataIndex: o.dataIndex,
              },
              e,
            ).point);
          var l = Bl(r),
            h = o.axesInfo,
            u = s.axesInfo,
            c = "leave" === i || Bl(r),
            d = {},
            f = {},
            p = {
              list: [],
              map: {},
            },
            g = {
              showPointer: s_(zl, f),
              showTooltip: s_(El, p),
            };
          a_(s.coordSysMap, function (t, e) {
            var n = l || t.containPoint(r);
            a_(s.coordSysAxesInfo[e], function (t, e) {
              var i = t.axis,
                o = (function (t, e) {
                  for (var n = 0; n < (t || []).length; n++) {
                    var i = t[n];
                    if (e.axis.dim === i.axisDim && e.axis.model.componentIndex === i.axisIndex)
                      return i;
                  }
                })(h, t);
              if (!c && n && (!h || o)) {
                var a = o && o.value;
                (null != a || l || (a = i.pointToData(r)), null != a && Ol(t, a, g, !1, d));
              }
            });
          });
          var m = {};
          return (
            a_(u, function (t, e) {
              var n = t.linkGroup;
              n &&
                !f[e] &&
                a_(n.axesInfo, function (e, i) {
                  var r = f[i];
                  if (e !== t && r) {
                    var o = r.value;
                    (n.mapper && (o = t.axis.scale.parse(n.mapper(o, Rl(e), Rl(t)))),
                      (m[t.key] = o));
                  }
                });
            }),
            a_(m, function (t, e) {
              Ol(u[e], t, g, !0, d);
            }),
            (function (t, e, n) {
              var i = (n.axesInfo = []);
              a_(e, function (e, n) {
                var r = e.axisPointerModel.option,
                  o = t[n];
                (o
                  ? (!e.useHandle && (r.status = "show"),
                    (r.value = o.value),
                    (r.seriesDataIndices = (o.payloadBatch || []).slice()))
                  : !e.useHandle && (r.status = "hide"),
                  "show" === r.status &&
                    i.push({
                      axisDim: e.axis.dim,
                      axisIndex: e.axis.model.componentIndex,
                      value: r.value,
                    }));
              });
            })(f, u, d),
            (function (t, e, n, i) {
              if (!Bl(e) && t.list.length) {
                var r = ((t.list[0].dataByAxis[0] || {}).seriesDataIndices || [])[0] || {};
                i({
                  type: "showTip",
                  escapeConnect: !0,
                  x: e[0],
                  y: e[1],
                  tooltipOption: n.tooltipOption,
                  position: n.position,
                  dataIndexInside: r.dataIndexInside,
                  dataIndex: r.dataIndex,
                  seriesIndex: r.seriesIndex,
                  dataByCoordSys: t.list,
                });
              } else
                i({
                  type: "hideTip",
                });
            })(p, r, t, a),
            Nl(u, 0, n),
            d
          );
        }
      },
    ),
    da({
      type: "tooltip",
      dependencies: ["axisPointer"],
      defaultOption: {
        zlevel: 0,
        z: 60,
        show: !0,
        showContent: !0,
        trigger: "item",
        triggerOn: "mousemove|click",
        alwaysShowContent: !1,
        displayMode: "single",
        renderMode: "auto",
        confine: !1,
        showDelay: 0,
        hideDelay: 100,
        transitionDuration: 0.4,
        enterable: !1,
        backgroundColor: "rgba(50,50,50,0.7)",
        borderColor: "#333",
        borderRadius: 4,
        borderWidth: 0,
        padding: 5,
        extraCssText: "",
        axisPointer: {
          type: "line",
          axis: "auto",
          animation: "auto",
          animationDurationUpdate: 200,
          animationEasingUpdate: "exponentialOut",
          crossStyle: {
            color: "#999",
            width: 1,
            type: "dashed",
            textStyle: {},
          },
        },
        textStyle: {
          color: "#fff",
          fontSize: 14,
        },
      },
    }));
  var v_ = f,
    y_ = sr,
    x_ = ["", "-webkit-", "-moz-", "-o-"];
  ((nh.prototype = {
    constructor: nh,
    _enterable: !0,
    update: function () {
      var t = this._container,
        typeof_ = t.currentStyle || document.defaultView.getComputedStyle(t),
        n = t.style;
      "absolute" !== n.position && "absolute" !== typeof_.position && (n.position = "relative");
    },
    show: function (t) {
      clearTimeout(this._hideTimeout);
      var typeof_ = this.el;
      ((typeof_.style.cssText =
        "position:absolute;display:block;border-style:solid;white-space:nowrap;z-index:9999999;" +
        eh(t) +
        ";left:" +
        this._x +
        "px;top:" +
        this._y +
        "px;" +
        (t.get("extraCssText") || "")),
        (typeof_.style.display = typeof_.innerHTML ? "block" : "none"),
        (typeof_.style.pointerEvents = this._enterable ? "auto" : "none"),
        (this._show = !0));
    },
    setContent: function (t) {
      this.el.innerHTML = null == t ? "" : t;
    },
    setEnterable: function (t) {
      this._enterable = t;
    },
    getSize: function () {
      var t = this.el;
      return [t.clientWidth, t.clientHeight];
    },
    moveTo: function (t, e) {
      var n,
        i = this._zr;
      i &&
        i.painter &&
        (n = i.painter.getViewportRootOffset()) &&
        ((t += n.offsetLeft), (e += n.offsetTop));
      var r = this.el.style;
      ((r.left = t + "px"), (r.top = e + "px"), (this._x = t), (this._y = e));
    },
    hide: function () {
      ((this.el.style.display = "none"), (this._show = !1));
    },
    hideLater: function (t) {
      !this._show ||
        (this._inContent && this._enterable) ||
        (t
          ? ((this._hideDelay = t),
            (this._show = !1),
            (this._hideTimeout = setTimeout(v(this.hide, this), t)))
          : this.hide());
    },
    isShow: function () {
      return this._show;
    },
    getOuterSize: function () {
      var t = this.el.clientWidth,
        typeof_ = this.el.clientHeight;
      if (document.defaultView && document.defaultView.getComputedStyle) {
        var n = document.defaultView.getComputedStyle(this.el);
        n &&
          ((t +=
            parseInt(n.paddingLeft, 10) +
            parseInt(n.paddingRight, 10) +
            parseInt(n.borderLeftWidth, 10) +
            parseInt(n.borderRightWidth, 10)),
          (e +=
            parseInt(n.paddingTop, 10) +
            parseInt(n.paddingBottom, 10) +
            parseInt(n.borderTopWidth, 10) +
            parseInt(n.borderBottomWidth, 10)));
      }
      return {
        width: t,
        height: typeof_,
      };
    },
  }),
    (ih.prototype = {
      constructor: ih,
      _enterable: !0,
      update: function () {},
      show: function (t) {
        (this._hideTimeout && clearTimeout(this._hideTimeout),
          this.el.attr("show", !0),
          (this._show = !0));
      },
      setContent: function (t, e, n) {
        this.el && this._zr.remove(this.el);
        for (var i = {}, r = t, o = r.indexOf("{marker"); o >= 0;) {
          var a = r.indexOf("|}"),
            s = r.substr(o + 7, a - o - 7);
          (s.indexOf("sub") > -1
            ? (i["marker" + s] = {
                textWidth: 4,
                textHeight: 4,
                textBorderRadius: 2,
                textBackgroundColor: e[s],
                textOffset: [3, 0],
              })
            : (i["marker" + s] = {
                textWidth: 10,
                textHeight: 10,
                textBorderRadius: 5,
                textBackgroundColor: e[s],
              }),
            (o = (r = r.substr(a + 1)).indexOf("{marker")));
        }
        ((this.el = new ng({
          style: {
            rich: i,
            text: t,
            textLineHeight: 20,
            textBackgroundColor: n.get("backgroundColor"),
            textBorderRadius: n.get("borderRadius"),
            textFill: n.get("textStyle.color"),
            textPadding: n.get("padding"),
          },
          z: n.get("z"),
        })),
          this._zr.add(this.el));
        var l = this;
        (this.el.on("mouseover", function () {
          (l._enterable && (clearTimeout(l._hideTimeout), (l._show = !0)), (l._inContent = !0));
        }),
          this.el.on("mouseout", function () {
            (l._enterable && l._show && l.hideLater(l._hideDelay), (l._inContent = !1));
          }));
      },
      setEnterable: function (t) {
        this._enterable = t;
      },
      getSize: function () {
        var t = this.el.getBoundingRect();
        return [t.width, t.height];
      },
      moveTo: function (t, e) {
        this.el && this.el.attr("position", [t, e]);
      },
      hide: function () {
        (this.el.hide(), (this._show = !1));
      },
      hideLater: function (t) {
        !this._show ||
          (this._inContent && this._enterable) ||
          (t
            ? ((this._hideDelay = t),
              (this._show = !1),
              (this._hideTimeout = setTimeout(v(this.hide, this), t)))
            : this.hide());
      },
      isShow: function () {
        return this._show;
      },
      getOuterSize: function () {
        return this.getSize();
      },
    }));
  var __ = v,
    w_ = f,
    b_ = Yi,
    S_ = new pg({
      shape: {
        x: -1,
        y: -1,
        width: 2,
        height: 2,
      },
    });
  (fa({
    type: "tooltip",
    init: function (t, e) {
      if (!Hc.node) {
        var n,
          i = t.getComponent("tooltip").get("renderMode");
        ((this._renderMode = mn(i)),
          "html" === this._renderMode
            ? ((n = new nh(e.getDom(), e)), (this._newLine = "<br/>"))
            : ((n = new ih(e)), (this._newLine = "\n")),
          (this._tooltipContent = n));
      }
    },
    render: function (t, e, n) {
      if (!Hc.node) {
        (this.group.removeAll(),
          (this._tooltipModel = t),
          (this._ecModel = e),
          (this._api = n),
          (this._lastDataByCoordSys = null),
          (this._alwaysShowContent = t.get("alwaysShowContent")));
        var i = this._tooltipContent;
        (i.update(),
          i.setEnterable(t.get("enterable")),
          this._initGlobalListener(),
          this._keepShow());
      }
    },
    _initGlobalListener: function () {
      var t = this._tooltipModel.get("triggerOn");
      Fl(
        "itemTooltip",
        this._api,
        __(function (e, n, i) {
          "none" !== t &&
            (t.indexOf(e) >= 0 ? this._tryShow(n, i) : "leave" === e && this._hide(i));
        }, this),
      );
    },
    _keepShow: function () {
      var t = this._tooltipModel,
        typeof_ = this._ecModel,
        n = this._api;
      if (null != this._lastX && null != this._lastY && "none" !== t.get("triggerOn")) {
        var i = this;
        (clearTimeout(this._refreshUpdateTimeout),
          (this._refreshUpdateTimeout = setTimeout(function () {
            i.manuallyShowTip(t, typeof_, n, {
              x: i._lastX,
              y: i._lastY,
            });
          })));
      }
    },
    manuallyShowTip: function (t, e, n, i) {
      if (i.from !== this.uid && !Hc.node) {
        var r = oh(i, n);
        this._ticket = "";
        var o = i.dataByCoordSys;
        if (i.tooltip && null != i.x && null != i.y) {
          var a = S_;
          ((a.position = [i.x, i.y]),
            a.update(),
            (a.tooltip = i.tooltip),
            this._tryShow(
              {
                offsetX: i.x,
                offsetY: i.y,
                target: a,
              },
              r,
            ));
        } else if (o)
          this._tryShow(
            {
              offsetX: i.x,
              offsetY: i.y,
              position: i.position,
              event: {},
              dataByCoordSys: i.dataByCoordSys,
              tooltipOption: i.tooltipOption,
            },
            r,
          );
        else if (null != i.seriesIndex) {
          if (this._manuallyAxisShowTip(t, e, n, i)) return;
          var s = o_(i, e),
            l = s.point[0],
            h = s.point[1];
          null != l &&
            null != h &&
            this._tryShow(
              {
                offsetX: l,
                offsetY: h,
                position: i.position,
                target: s.el,
                event: {},
              },
              r,
            );
        } else
          null != i.x &&
            null != i.y &&
            (n.dispatchAction({
              type: "updateAxisPointer",
              x: i.x,
              y: i.y,
            }),
            this._tryShow(
              {
                offsetX: i.x,
                offsetY: i.y,
                position: i.position,
                target: n.getZr().findHover(i.x, i.y).target,
                event: {},
              },
              r,
            ));
      }
    },
    manuallyHideTip: function (t, e, n, i) {
      var r = this._tooltipContent;
      (!this._alwaysShowContent &&
        this._tooltipModel &&
        r.hideLater(this._tooltipModel.get("hideDelay")),
        (this._lastX = this._lastY = null),
        i.from !== this.uid && this._hide(oh(i, n)));
    },
    _manuallyAxisShowTip: function (t, e, n, i) {
      var r = i.seriesIndex,
        o = i.dataIndex,
        a = e.getComponent("axisPointer").coordSysAxesInfo;
      if (null != r && null != o && null != a) {
        var s = e.getSeriesByIndex(r);
        if (
          s &&
          "axis" ===
            (t = rh([s.getData().getItemModel(o), s, (s.coordinateSystem || {}).model, t])).get(
              "trigger",
            )
        )
          return (
            n.dispatchAction({
              type: "updateAxisPointer",
              seriesIndex: r,
              dataIndex: o,
              position: i.position,
            }),
            !0
          );
      }
    },
    _tryShow: function (t, e) {
      var n = t.target;
      if (this._tooltipModel) {
        ((this._lastX = t.offsetX), (this._lastY = t.offsetY));
        var i = t.dataByCoordSys;
        i && i.length
          ? this._showAxisTooltip(i, t)
          : n && null != n.dataIndex
            ? ((this._lastDataByCoordSys = null), this._showSeriesItemTooltip(t, n, e))
            : n && n.tooltip
              ? ((this._lastDataByCoordSys = null), this._showComponentItemTooltip(t, n, e))
              : ((this._lastDataByCoordSys = null), this._hide(e));
      }
    },
    _showOrMove: function (t, e) {
      var n = t.get("showDelay");
      ((e = v(e, this)),
        clearTimeout(this._showTimout),
        n > 0 ? (this._showTimout = setTimeout(e, n)) : e());
    },
    _showAxisTooltip: function (t, e) {
      var n = this._ecModel,
        i = this._tooltipModel,
        o = [e.offsetX, e.offsetY],
        a = [],
        s = [],
        l = rh([e.tooltipOption, i]),
        h = this._renderMode,
        u = this._newLine,
        c = {};
      (w_(
        t,
        function (t) {
          w_(t.dataByAxis, function (t) {
            var typeof_ = n.getComponent(t.axisDim + "Axis", t.axisIndex),
              i = t.value,
              o = [];
            if (typeof_ && null != i) {
              var l = $l(i, typeof_.axis, n, t.seriesDataIndices, t.valueLabelOpt);
              f(t.seriesDataIndices, function (a) {
                var u = n.getSeriesByIndex(a.seriesIndex),
                  d = a.dataIndexInside,
                  f = u && u.getDataParams(d);
                if (
                  ((f.axisDim = t.axisDim),
                  (f.axisIndex = t.axisIndex),
                  (f.axisType = t.axisType),
                  (f.axisId = t.axisId),
                  (f.axisValue = is(typeof_.axis, i)),
                  (f.axisValueLabel = l),
                  f)
                ) {
                  s.push(f);
                  var p,
                    g = u.formatTooltip(d, !0, null, h);
                  if (b(g)) {
                    p = g.html;
                    var m = g.markers;
                    r(c, m);
                  } else p = g;
                  o.push(p);
                }
              });
              var d = l;
              "html" !== h ? a.push(o.join(u)) : a.push((d ? lr(d) + u : "") + o.join(u));
            }
          });
        },
        this,
      ),
        a.reverse(),
        (a = a.join(this._newLine + this._newLine)));
      var d = e.position;
      this._showOrMove(l, function () {
        this._updateContentNotChangedOnAxis(t)
          ? this._updatePosition(l, d, o[0], o[1], this._tooltipContent, s)
          : this._showTooltipContent(l, a, s, Math.random(), o[0], o[1], d, void 0, c);
      });
    },
    _showSeriesItemTooltip: function (t, e, n) {
      var i = this._ecModel,
        r = e.seriesIndex,
        o = i.getSeriesByIndex(r),
        a = e.dataModel || o,
        s = e.dataIndex,
        l = e.dataType,
        h = a.getData(),
        u = rh([h.getItemModel(s), a, o && (o.coordinateSystem || {}).model, this._tooltipModel]),
        c = u.get("trigger");
      if (null == c || "item" === c) {
        var d,
          f,
          p = a.getDataParams(s, l),
          g = a.formatTooltip(s, !1, l, this._renderMode);
        b(g) ? ((d = g.html), (f = g.markers)) : ((d = g), (f = null));
        var m = "item_" + a.name + "_" + s;
        (this._showOrMove(u, function () {
          this._showTooltipContent(u, d, p, m, t.offsetX, t.offsetY, t.position, t.target, f);
        }),
          n({
            type: "showTip",
            dataIndexInside: s,
            dataIndex: h.getRawIndex(s),
            seriesIndex: r,
            from: this.uid,
          }));
      }
    },
    _showComponentItemTooltip: function (t, e, n) {
      var i = e.tooltip;
      "string" == typeof i &&
        (i = {
          content: i,
          formatter: i,
        });
      var r = new Wi(i, this._tooltipModel, this._ecModel),
        o = r.get("content"),
        a = Math.random();
      (this._showOrMove(r, function () {
        this._showTooltipContent(
          r,
          o,
          r.get("formatterParams") || {},
          a,
          t.offsetX,
          t.offsetY,
          t.position,
          e,
        );
      }),
        n({
          type: "showTip",
          from: this.uid,
        }));
    },
    _showTooltipContent: function (t, e, n, i, r, o, a, s, l) {
      if (((this._ticket = ""), t.get("showContent") && t.get("show"))) {
        var h = this._tooltipContent,
          u = t.get("formatter");
        a = a || t.get("position");
        var c = e;
        if (u && "string" == typeof u) c = hr(u, n, !0);
        else if ("function" == typeof u) {
          var d = __(function (e, i) {
            e === this._ticket &&
              (h.setContent(i, l, t), this._updatePosition(t, a, r, o, h, n, s));
          }, this);
          ((this._ticket = i), (c = u(n, i, d)));
        }
        (h.setContent(c, l, t), h.show(t), this._updatePosition(t, a, r, o, h, n, s));
      }
    },
    _updatePosition: function (t, e, n, i, r, o, a) {
      var s = this._api.getWidth(),
        l = this._api.getHeight();
      e = e || t.get("position");
      var h = r.getSize(),
        u = t.get("align"),
        c = t.get("verticalAlign"),
        d = a && a.getBoundingRect().clone();
      if (
        (a && d.applyTransform(a.transform),
        "function" == typeof e &&
          (e = e([n, i], o, r.el, d, {
            viewSize: [s, l],
            contentSize: h.slice(),
          })),
        x(e))
      )
        ((n = b_(e[0], s)), (i = b_(e[1], l)));
      else if (b(e)) {
        ((e.width = h[0]), (e.height = h[1]));
        var f = gr(e, {
          width: s,
          height: l,
        });
        ((n = f.x), (i = f.y), (u = null), (c = null));
      } else
        "string" == typeof e && a
          ? ((n = (p = (function (t, e, n) {
              var i = n[0],
                r = n[1],
                o = 0,
                a = 0,
                s = e.width,
                l = e.height;
              switch (t) {
                case "inside":
                  ((o = e.x + s / 2 - i / 2), (a = e.y + l / 2 - r / 2));
                  break;
                case "top":
                  ((o = e.x + s / 2 - i / 2), (a = e.y - r - 5));
                  break;
                case "bottom":
                  ((o = e.x + s / 2 - i / 2), (a = e.y + l + 5));
                  break;
                case "left":
                  ((o = e.x - i - 5), (a = e.y + l / 2 - r / 2));
                  break;
                case "right":
                  ((o = e.x + s + 5), (a = e.y + l / 2 - r / 2));
              }
              return [o, a];
            })(e, d, h))[0]),
            (i = p[1]))
          : ((n = (p = (function (t, e, n, i, r, o, a) {
              var s = n.getOuterSize(),
                l = s.width,
                h = s.height;
              return (
                null != o && (t + l + o > i ? (t -= l + o) : (t += o)),
                null != a && (e + h + a > r ? (e -= h + a) : (e += a)),
                [t, e]
              );
            })(n, i, r, s, l, u ? null : 20, c ? null : 20))[0]),
            (i = p[1]));
      if (
        (u && (n -= ah(u) ? h[0] / 2 : "right" === u ? h[0] : 0),
        c && (i -= ah(c) ? h[1] / 2 : "bottom" === c ? h[1] : 0),
        t.get("confine"))
      ) {
        var p = (function (t, e, n, i, r) {
          var o = n.getOuterSize(),
            a = o.width,
            s = o.height;
          return (
            (t = Math.min(t + a, i) - a),
            (e = Math.min(e + s, r) - s),
            [(t = Math.max(t, 0)), (e = Math.max(e, 0))]
          );
        })(n, i, r, s, l);
        ((n = p[0]), (i = p[1]));
      }
      r.moveTo(n, i);
    },
    _updateContentNotChangedOnAxis: function (t) {
      var typeof_ = this._lastDataByCoordSys,
        n = !!typeof_ && typeof_.length === t.length;
      return (
        n &&
          w_(typeof_, function (e, i) {
            var r = e.dataByAxis || {},
              o = (t[i] || {}).dataByAxis || [];
            (n &= r.length === o.length) &&
              w_(r, function (t, e) {
                var i = o[e] || {},
                  r = t.seriesDataIndices || [],
                  a = i.seriesDataIndices || [];
                (n &=
                  t.value === i.value &&
                  t.axisType === i.axisType &&
                  t.axisId === i.axisId &&
                  r.length === a.length) &&
                  w_(r, function (t, e) {
                    var i = a[e];
                    n &= t.seriesIndex === i.seriesIndex && t.dataIndex === i.dataIndex;
                  });
              });
          }),
        (this._lastDataByCoordSys = t),
        !!n
      );
    },
    _hide: function (t) {
      ((this._lastDataByCoordSys = null),
        t({
          type: "hideTip",
          from: this.uid,
        }));
    },
    dispose: function (t, e) {
      Hc.node || (this._tooltipContent.hide(), Wl("itemTooltip", e));
    },
  }),
    sa(
      {
        type: "showTip",
        event: "showTip",
        update: "tooltip:manuallyShowTip",
      },
      function () {},
    ),
    sa(
      {
        type: "hideTip",
        event: "hideTip",
        update: "tooltip:manuallyHideTip",
      },
      function () {},
    ));
  var M_ = da({
    type: "legend.plain",
    dependencies: ["series"],
    layoutMode: {
      type: "box",
      ignoreSize: !0,
    },
    init: function (t, e, n) {
      (this.mergeDefaultAndTheme(t, n), (t.selected = t.selected || {}));
    },
    mergeOption: function (t) {
      M_.superCall(this, "mergeOption", t);
    },
    optionUpdated: function () {
      this._updateData(this.ecModel);
      var t = this._data;
      if (t[0] && "single" === this.get("selectedMode")) {
        for (var typeof_ = !1, n = 0; n < t.length; n++) {
          var i = t[n].get("name");
          if (this.isSelected(i)) {
            (this.select(i), (e = !0));
            break;
          }
        }
        !typeof_ && this.select(t[0].get("name"));
      }
    },
    _updateData: function (t) {
      var typeof_ = [],
        n = [];
      (t.eachRawSeries(function (i) {
        var r,
          o = i.name;
        if ((n.push(o), i.legendDataProvider)) {
          var a = i.legendDataProvider(),
            s = a.mapArray(a.getName);
          (t.isSeriesFiltered(i) || (n = n.concat(s)),
            s.length ? (e = typeof_.concat(s)) : (r = !0));
        } else r = !0;
        r && hn(i) && typeof_.push(i.name);
      }),
        (this._availableNames = n));
      var i = p(
        this.get("data") || typeof_,
        function (t) {
          return (
            ("string" != typeof t && "number" != typeof t) ||
              (t = {
                name: t,
              }),
            new Wi(t, this, this.ecModel)
          );
        },
        this,
      );
      this._data = i;
    },
    getData: function () {
      return this._data;
    },
    select: function (t) {
      var typeof_ = this.option.selected;
      ("single" === this.get("selectedMode") &&
        f(this._data, function (t) {
          typeof_[t.get("name")] = !1;
        }),
        (typeof_[t] = !0));
    },
    unSelect: function (t) {
      "single" !== this.get("selectedMode") && (this.option.selected[t] = !1);
    },
    toggleSelected: function (t) {
      var typeof_ = this.option.selected;
      (typeof_.hasOwnProperty(t) || (typeof_[t] = !0), this[typeof_[t] ? "unSelect" : "select"](t));
    },
    isSelected: function (t) {
      var typeof_ = this.option.selected;
      return !(typeof_.hasOwnProperty(t) && !typeof_[t]) && h(this._availableNames, t) >= 0;
    },
    defaultOption: {
      zlevel: 0,
      z: 4,
      show: !0,
      orient: "horizontal",
      left: "center",
      top: 0,
      align: "auto",
      backgroundColor: "rgba(0,0,0,0)",
      borderColor: "#ccc",
      borderRadius: 0,
      borderWidth: 0,
      padding: 5,
      itemGap: 10,
      itemWidth: 25,
      itemHeight: 14,
      inactiveColor: "#ccc",
      textStyle: {
        color: "#333",
      },
      selectedMode: !0,
      tooltip: {
        show: !1,
      },
    },
  });
  (sa("legendToggleSelect", "legendselectchanged", y(sh, "toggleSelected")),
    sa("legendSelect", "legendselected", y(sh, "select")),
    sa("legendUnSelect", "legendunselected", y(sh, "unSelect")));
  var I_ = y,
    T_ = f,
    A_ = qd,
    C_ = fa({
      type: "legend.plain",
      newlineDisabled: !1,
      init: function () {
        (this.group.add((this._contentGroup = new A_())),
          this._backgroundEl,
          (this._isFirstRender = !0));
      },
      getContentGroup: function () {
        return this._contentGroup;
      },
      render: function (t, e, n) {
        var i = this._isFirstRender;
        if (((this._isFirstRender = !1), this.resetInner(), t.get("show", !0))) {
          var r = t.get("align");
          ((r && "auto" !== r) ||
            (r = "right" === t.get("left") && "vertical" === t.get("orient") ? "right" : "left"),
            this.renderInner(r, t, e, n));
          var o = t.getBoxLayoutParams(),
            a = {
              width: n.getWidth(),
              height: n.getHeight(),
            },
            l = t.get("padding"),
            h = gr(o, a, l),
            u = this.layoutInner(t, r, h, i),
            c = gr(
              s(
                {
                  width: u.width,
                  height: u.height,
                },
                o,
              ),
              a,
              l,
            );
          (this.group.attr("position", [c.x - u.x, c.y - u.y]),
            this.group.add((this._backgroundEl = lh(u, t))));
        }
      },
      resetInner: function () {
        (this.getContentGroup().removeAll(),
          this._backgroundEl && this.group.remove(this._backgroundEl));
      },
      renderInner: function (t, e, n, i) {
        var r = this.getContentGroup(),
          o = R(),
          a = e.get("selectedMode"),
          s = [];
        (n.eachRawSeries(function (t) {
          !t.get("legendHoverLink") && s.push(t.id);
        }),
          T_(
            e.getData(),
            function (l, h) {
              var u = l.get("name");
              if (this.newlineDisabled || ("" !== u && "\n" !== u)) {
                var c = n.getSeriesByName(u)[0];
                if (!o.get(u))
                  if (c) {
                    var d = c.getData(),
                      f = d.getVisual("color");
                    "function" == typeof f && (f = f(c.getDataParams(0)));
                    var p = d.getVisual("legendSymbol") || "roundRect",
                      g = d.getVisual("symbol");
                    (this._createItem(u, h, l, e, p, g, t, f, a)
                      .on("click", I_(hh, u, i))
                      .on("mouseover", I_(uh, c.name, null, i, s))
                      .on("mouseout", I_(ch, c.name, null, i, s)),
                      o.set(u, !0));
                  } else
                    n.eachRawSeries(function (n) {
                      if (!o.get(u) && n.legendDataProvider) {
                        var r = n.legendDataProvider(),
                          c = r.indexOfName(u);
                        if (c < 0) return;
                        var d = r.getItemVisual(c, "color");
                        (this._createItem(u, h, l, e, "roundRect", null, t, d, a)
                          .on("click", I_(hh, u, i))
                          .on("mouseover", I_(uh, null, u, i, s))
                          .on("mouseout", I_(ch, null, u, i, s)),
                          o.set(u, !0));
                      }
                    }, this);
              } else
                r.add(
                  new A_({
                    newline: !0,
                  }),
                );
            },
            this,
          ));
      },
      _createItem: function (t, e, n, i, r, o, s, l, h) {
        var u = i.get("itemWidth"),
          c = i.get("itemHeight"),
          d = i.get("inactiveColor"),
          f = i.get("symbolKeepAspect"),
          p = i.isSelected(t),
          g = new A_(),
          m = n.getModel("textStyle"),
          v = n.get("icon"),
          y = n.getModel("tooltip"),
          x = y.parentModel;
        if (
          ((r = v || r),
          g.add(ls(r, 0, 0, u, c, p ? l : d, null == f || f)),
          !v && o && (o !== r || "none" === o))
        ) {
          var _ = 0.8 * c;
          ("none" === o && (o = "circle"),
            g.add(ls(o, (u - _) / 2, (c - _) / 2, _, _, p ? l : d, null == f || f)));
        }
        var w = "left" === s ? u + 5 : -5,
          b = s,
          S = i.get("formatter"),
          M = t;
        ("string" == typeof S && S
          ? (M = S.replace("{name}", null != t ? t : ""))
          : "function" == typeof S && (M = S(t)),
          g.add(
            new ng({
              style: Ti({}, m, {
                text: M,
                x: w,
                y: c / 2,
                textFill: p ? m.getTextColor() : d,
                textAlign: b,
                textVerticalAlign: "middle",
              }),
            }),
          ));
        var I = new pg({
          shape: g.getBoundingRect(),
          invisible: !0,
          tooltip: y.get("show")
            ? a(
                {
                  content: t,
                  formatter:
                    x.get("formatter", !0) ||
                    function () {
                      return t;
                    },
                  formatterParams: {
                    componentType: "legend",
                    legendIndex: i.componentIndex,
                    name: t,
                    $vars: ["name"],
                  },
                },
                y.option,
              )
            : null,
        });
        return (
          g.add(I),
          g.eachChild(function (t) {
            t.silent = !0;
          }),
          (I.silent = !h),
          this.getContentGroup().add(g),
          Si(g),
          (g.__legendDataIndex = e),
          g
        );
      },
      layoutInner: function (t, e, n) {
        var i = this.getContentGroup();
        tm(t.get("orient"), i, t.get("itemGap"), n.width, n.height);
        var r = i.getBoundingRect();
        return (i.attr("position", [-r.x, -r.y]), this.group.getBoundingRect());
      },
      remove: function () {
        (this.getContentGroup().removeAll(), (this._isFirstRender = !0));
      },
    });
  (aa(function (t) {
    var typeof_ = t.findComponents({
      mainType: "legend",
    });
    typeof_ &&
      typeof_.length &&
      t.filterSeries(function (t) {
        for (var n = 0; n < typeof_.length; n++) if (!typeof_[n].isSelected(t.name)) return !1;
        return !0;
      });
  }),
    im.registerSubTypeDefaulter("legend", function () {
      return "plain";
    }));
  var D_ = M_.extend({
      type: "legend.scroll",
      setScrollDataIndex: function (t) {
        this.option.scrollDataIndex = t;
      },
      defaultOption: {
        scrollDataIndex: 0,
        pageButtonItemGap: 5,
        pageButtonGap: null,
        pageButtonPosition: "end",
        pageFormatter: "{current}/{total}",
        pageIcons: {
          horizontal: ["M0,0L12,-10L12,10z", "M0,0L-12,-10L-12,10z"],
          vertical: ["M0,0L20,0L10,-20z", "M0,0L20,0L10,20z"],
        },
        pageIconColor: "#2f4554",
        pageIconInactiveColor: "#aaa",
        pageIconSize: 15,
        pageTextStyle: {
          color: "#333",
        },
        animationDurationUpdate: 800,
      },
      init: function (t, e, n, i) {
        var r = yr(t);
        (D_.superCall(this, "init", t, e, n, i), dh(this, t, r));
      },
      mergeOption: function (t, e) {
        (D_.superCall(this, "mergeOption", t, e), dh(this, this.option, t));
      },
      getOrient: function () {
        return "vertical" === this.get("orient")
          ? {
              index: 1,
              name: "vertical",
            }
          : {
              index: 0,
              name: "horizontal",
            };
      },
    }),
    k_ = qd,
    P_ = ["width", "height"],
    L_ = ["x", "y"],
    O_ = C_.extend({
      type: "legend.scroll",
      newlineDisabled: !0,
      init: function () {
        (O_.superCall(this, "init"),
          (this._currentIndex = 0),
          this.group.add((this._containerGroup = new k_())),
          this._containerGroup.add(this.getContentGroup()),
          this.group.add((this._controllerGroup = new k_())),
          this._showController);
      },
      resetInner: function () {
        (O_.superCall(this, "resetInner"),
          this._controllerGroup.removeAll(),
          this._containerGroup.removeClipPath(),
          (this._containerGroup.__rectSize = null));
      },
      renderInner: function (t, e, n, i) {
        function r(t, n) {
          var r = t + "DataIndex",
            l = Hi(
              e.get("pageIcons", !0)[e.getOrient().name][n],
              {
                onclick: v(o._pageGo, o, r, e, i),
              },
              {
                x: -s[0] / 2,
                y: -s[1] / 2,
                width: s[0],
                height: s[1],
              },
            );
          ((l.name = t), a.add(l));
        }
        var o = this;
        O_.superCall(this, "renderInner", t, e, n, i);
        var a = this._controllerGroup,
          s = e.get("pageIconSize", !0);
        (x(s) || (s = [s, s]), r("pagePrev", 0));
        var l = e.getModel("pageTextStyle");
        (a.add(
          new ng({
            name: "pageText",
            style: {
              textFill: l.getTextColor(),
              font: l.getFont(),
              textVerticalAlign: "middle",
              textAlign: "center",
            },
            silent: !0,
          }),
        ),
          r("pageNext", 1));
      },
      layoutInner: function (t, e, n, i) {
        var r = this.getContentGroup(),
          o = this._containerGroup,
          a = this._controllerGroup,
          s = t.getOrient().index,
          l = P_[s],
          h = P_[1 - s],
          u = L_[1 - s];
        (tm(t.get("orient"), r, t.get("itemGap"), s ? n.width : null, s ? null : n.height),
          tm("horizontal", a, t.get("pageButtonItemGap", !0)));
        var c = r.getBoundingRect(),
          d = a.getBoundingRect(),
          f = (this._showController = c[l] > n[l]),
          p = [-c.x, -c.y];
        i || (p[s] = r.position[s]);
        var g = [0, 0],
          m = [-d.x, -d.y],
          v = C(t.get("pageButtonGap", !0), t.get("itemGap", !0));
        (f &&
          ("end" === t.get("pageButtonPosition", !0) ? (m[s] += n[l] - d[l]) : (g[s] += d[l] + v)),
          (m[1 - s] += c[h] / 2 - d[h] / 2),
          r.attr("position", p),
          o.attr("position", g),
          a.attr("position", m));
        var y = this.group.getBoundingRect();
        if (
          (((y = {
            x: 0,
            y: 0,
          })[l] = f ? n[l] : c[l]),
          (y[h] = Math.max(c[h], d[h])),
          (y[u] = Math.min(0, d[u] + m[1 - s])),
          (o.__rectSize = n[l]),
          f)
        ) {
          var x = {
            x: 0,
            y: 0,
          };
          ((x[l] = Math.max(n[l] - d[l] - v, 0)),
            (x[h] = y[h]),
            o.setClipPath(
              new pg({
                shape: x,
              }),
            ),
            (o.__rectSize = x[l]));
        } else
          a.eachChild(function (t) {
            t.attr({
              invisible: !0,
              silent: !0,
            });
          });
        var _ = this._getPageInfo(t);
        return (
          null != _.pageIndex &&
            zi(
              r,
              {
                position: _.contentPosition,
              },
              !!f && t,
            ),
          this._updatePageInfoView(t, _),
          y
        );
      },
      _pageGo: function (t, e, n) {
        var i = this._getPageInfo(e)[t];
        null != i &&
          n.dispatchAction({
            type: "legendScroll",
            scrollDataIndex: i,
            legendId: e.id,
          });
      },
      _updatePageInfoView: function (t, e) {
        var n = this._controllerGroup;
        f(["pagePrev", "pageNext"], function (i) {
          var r = null != e[i + "DataIndex"],
            o = n.childOfName(i);
          o &&
            (o.setStyle(
              "fill",
              r ? t.get("pageIconColor", !0) : t.get("pageIconInactiveColor", !0),
            ),
            (o.cursor = r ? "pointer" : "default"));
        });
        var i = n.childOfName("pageText"),
          r = t.get("pageFormatter"),
          o = e.pageIndex,
          a = null != o ? o + 1 : 0,
          s = e.pageCount;
        i &&
          r &&
          i.setStyle(
            "text",
            w(r)
              ? r.replace("{current}", a).replace("{total}", s)
              : r({
                  current: a,
                  total: s,
                }),
          );
      },
      _getPageInfo: function (t) {
        function e(t) {
          if (t) {
            var typeof_ = t.getBoundingRect(),
              n = typeof_[l] + t.position[a];
            return {
              s: n,
              e: n + typeof_[s],
              i: t.__legendDataIndex,
            };
          }
        }
        function n(t, e) {
          return t.e >= e && t.s <= e + o;
        }
        var i = t.get("scrollDataIndex", !0),
          r = this.getContentGroup(),
          o = this._containerGroup.__rectSize,
          a = t.getOrient().index,
          s = P_[a],
          l = L_[a],
          h = this._findTargetItemIndex(i),
          u = r.children(),
          c = u[h],
          d = u.length,
          f = d ? 1 : 0,
          p = {
            contentPosition: r.position.slice(),
            pageCount: f,
            pageIndex: f - 1,
            pagePrevDataIndex: null,
            pageNextDataIndex: null,
          };
        if (!c) return p;
        var g = e(c);
        p.contentPosition[a] = -g.s;
        for (var m = h + 1, v = g, y = g, x = null; m <= d; ++m)
          (((!(x = e(u[m])) && y.e > v.s + o) || (x && !n(x, v.s))) &&
            (v = y.i > v.i ? y : x) &&
            (null == p.pageNextDataIndex && (p.pageNextDataIndex = v.i), ++p.pageCount),
            (y = x));
        for (m = h - 1, v = g, y = g, x = null; m >= -1; --m)
          (((x = e(u[m])) && n(y, x.s)) ||
            !(v.i < y.i) ||
            ((y = v),
            null == p.pagePrevDataIndex && (p.pagePrevDataIndex = v.i),
            ++p.pageCount,
            ++p.pageIndex),
            (v = x));
        return p;
      },
      _findTargetItemIndex: function (t) {
        var typeof_,
          n = this.getContentGroup();
        return (
          this._showController
            ? n.eachChild(function (n, i) {
                n.__legendDataIndex === t && (e = i);
              })
            : (e = 0),
          typeof_
        );
      },
    });
  (sa("legendScroll", "legendscroll", function (t, e) {
    var n = t.scrollDataIndex;
    null != n &&
      e.eachComponent(
        {
          mainType: "legend",
          subType: "scroll",
          query: t,
        },
        function (t) {
          t.setScrollDataIndex(n);
        },
      );
  }),
    da({
      type: "title",
      layoutMode: {
        type: "box",
        ignoreSize: !0,
      },
      defaultOption: {
        zlevel: 0,
        z: 6,
        show: !0,
        text: "",
        target: "blank",
        subtext: "",
        subtarget: "blank",
        left: 0,
        top: 0,
        backgroundColor: "rgba(0,0,0,0)",
        borderColor: "#ccc",
        borderWidth: 0,
        padding: 5,
        itemGap: 10,
        textStyle: {
          fontSize: 18,
          fontWeight: "bolder",
          color: "#333",
        },
        subtextStyle: {
          color: "#aaa",
        },
      },
    }),
    fa({
      type: "title",
      render: function (t, e, n) {
        if ((this.group.removeAll(), t.get("show"))) {
          var i = this.group,
            r = t.getModel("textStyle"),
            o = t.getModel("subtextStyle"),
            a = t.get("textAlign"),
            s = t.get("textBaseline"),
            l = new ng({
              style: Ti(
                {},
                r,
                {
                  text: t.get("text"),
                  textFill: r.getTextColor(),
                },
                {
                  disableBox: !0,
                },
              ),
              z2: 10,
            }),
            h = l.getBoundingRect(),
            u = t.get("subtext"),
            c = new ng({
              style: Ti(
                {},
                o,
                {
                  text: u,
                  textFill: o.getTextColor(),
                  y: h.height + t.get("itemGap"),
                  textVerticalAlign: "top",
                },
                {
                  disableBox: !0,
                },
              ),
              z2: 10,
            }),
            d = t.get("link"),
            f = t.get("sublink"),
            p = t.get("triggerEvent", !0);
          ((l.silent = !d && !p),
            (c.silent = !f && !p),
            d &&
              l.on("click", function () {
                window.open(d, "_" + t.get("target"));
              }),
            f &&
              c.on("click", function () {
                window.open(f, "_" + t.get("subtarget"));
              }),
            (l.eventData = c.eventData =
              p
                ? {
                    componentType: "title",
                    componentIndex: t.componentIndex,
                  }
                : null),
            i.add(l),
            u && i.add(c));
          var g = i.getBoundingRect(),
            m = t.getBoxLayoutParams();
          ((m.width = g.width), (m.height = g.height));
          var v = gr(
            m,
            {
              width: n.getWidth(),
              height: n.getHeight(),
            },
            t.get("padding"),
          );
          (a ||
            ("middle" === (a = t.get("left") || t.get("right")) && (a = "center"),
            "right" === a ? (v.x += v.width) : "center" === a && (v.x += v.width / 2)),
            s ||
              ("center" === (s = t.get("top") || t.get("bottom")) && (s = "middle"),
              "bottom" === s ? (v.y += v.height) : "middle" === s && (v.y += v.height / 2),
              (s = s || "top")),
            i.attr("position", [v.x, v.y]));
          var y = {
            textAlign: a,
            textVerticalAlign: s,
          };
          (l.setStyle(y), c.setStyle(y), (g = i.getBoundingRect()));
          var x = v.margin,
            _ = t.getItemStyle(["color", "opacity"]);
          _.fill = t.get("backgroundColor");
          var w = new pg({
            shape: {
              x: g.x - x[3],
              y: g.y - x[0],
              width: g.width + x[1] + x[3],
              height: g.height + x[0] + x[2],
              r: t.get("borderRadius"),
            },
            style: _,
            silent: !0,
          });
          (ui(w), i.add(w));
        }
      },
    }));
  var z_ = ar,
    E_ = lr,
    N_ = da({
      type: "marker",
      dependencies: ["series", "grid", "polar", "geo"],
      init: function (t, e, n, i) {
        (this.mergeDefaultAndTheme(t, n), this.mergeOption(t, n, i.createdBySelf, !0));
      },
      isAnimationEnabled: function () {
        if (Hc.node) return !1;
        var t = this.__hostSeries;
        return this.getShallow("animation") && t && t.isAnimationEnabled();
      },
      mergeOption: function (t, e, n, i) {
        var r = this.constructor,
          o = this.mainType + "Model";
        n ||
          e.eachSeries(function (t) {
            var n = t.get(this.mainType, !0),
              s = t[o];
            n && n.data
              ? (s
                  ? s.mergeOption(n, e, !0)
                  : (i && fh(n),
                    f(n.data, function (t) {
                      t instanceof Array ? (fh(t[0]), fh(t[1])) : fh(t);
                    }),
                    a((s = new r(n, this, e)), {
                      mainType: this.mainType,
                      seriesIndex: t.seriesIndex,
                      name: t.name,
                      createdBySelf: !0,
                    }),
                    (s.__hostSeries = t)),
                (t[o] = s))
              : (t[o] = null);
          }, this);
      },
      formatTooltip: function (t) {
        var typeof_ = this.getData(),
          n = this.getRawValue(t),
          i = x(n) ? p(n, z_).join(", ") : z_(n),
          r = typeof_.getName(t),
          o = E_(this.name);
        return (
          (null != n || r) && (o += "<br />"),
          r && ((o += E_(r)), null != n && (o += " : ")),
          null != n && (o += E_(i)),
          o
        );
      },
      getData: function () {
        return this._data;
      },
      setData: function (t) {
        this._data = t;
      },
    });
  (c(N_, Fm),
    N_.extend({
      type: "markPoint",
      defaultOption: {
        zlevel: 0,
        z: 5,
        symbol: "pin",
        symbolSize: 50,
        tooltip: {
          trigger: "item",
        },
        label: {
          show: !0,
          position: "inside",
        },
        itemStyle: {
          borderWidth: 2,
        },
        emphasis: {
          label: {
            show: !0,
          },
        },
      },
    }));
  var R_ = h,
    B_ = y,
    F_ = {
      min: B_(ph, "min"),
      max: B_(ph, "max"),
      average: B_(ph, "average"),
    },
    V_ = fa({
      type: "marker",
      init: function () {
        this.markerGroupMap = R();
      },
      render: function (t, e, n) {
        var i = this.markerGroupMap;
        i.each(function (t) {
          t.__keep = !1;
        });
        var r = this.type + "Model";
        (e.eachSeries(function (t) {
          var i = t[r];
          i && this.renderSeries(t, i, e, n);
        }, this),
          i.each(function (t) {
            !t.__keep && this.group.remove(t.group);
          }, this));
      },
      renderSeries: function () {},
    });
  (V_.extend({
    type: "markPoint",
    updateTransform: function (t, e, n) {
      e.eachSeries(function (t) {
        var typeof_ = t.markPointModel;
        typeof_ &&
          (_h(typeof_.getData(), t, n), this.markerGroupMap.get(t.id).updateLayout(typeof_));
      }, this);
    },
    renderSeries: function (t, e, n, i) {
      var r = t.coordinateSystem,
        o = t.id,
        a = t.getData(),
        s = this.markerGroupMap,
        l = s.get(o) || s.set(o, new ks()),
        h = wh(r, t, e);
      (e.setData(h),
        _h(e.getData(), t, i),
        h.each(function (t) {
          var n = h.getItemModel(t),
            i = n.getShallow("symbolSize");
          ("function" == typeof i && (i = i(e.getRawValue(t), e.getDataParams(t))),
            h.setItemVisual(t, {
              symbolSize: i,
              color: n.get("itemStyle.color") || a.getVisual("color"),
              symbol: n.getShallow("symbol"),
            }));
        }),
        l.updateData(h),
        this.group.add(l.group),
        h.eachItemGraphicEl(function (t) {
          t.traverse(function (t) {
            t.dataModel = e;
          });
        }),
        (l.__keep = !0),
        (l.group.silent = e.get("silent") || t.get("silent")));
    },
  }),
    oa(function (t) {
      t.markPoint = t.markPoint || {};
    }),
    N_.extend({
      type: "markLine",
      defaultOption: {
        zlevel: 0,
        z: 5,
        symbol: ["circle", "arrow"],
        symbolSize: [8, 16],
        precision: 2,
        tooltip: {
          trigger: "item",
        },
        label: {
          show: !0,
          position: "end",
        },
        lineStyle: {
          type: "dashed",
        },
        emphasis: {
          label: {
            show: !0,
          },
          lineStyle: {
            width: 3,
          },
        },
        animationEasing: "linear",
      },
    }));
  var H_ = mg.prototype,
    W_ = yg.prototype,
    G_ = ri({
      type: "ec-line",
      style: {
        stroke: "#000",
        fill: null,
      },
      shape: {
        x1: 0,
        y1: 0,
        x2: 0,
        y2: 0,
        percent: 1,
        cpx1: null,
        cpy1: null,
      },
      buildPath: function (t, e) {
        (bh(e) ? H_ : W_).buildPath(t, e);
      },
      pointAt: function (t) {
        return bh(this.shape) ? H_.pointAt.call(this, t) : W_.pointAt.call(this, t);
      },
      tangentAt: function (t) {
        var typeof_ = this.shape,
          n = bh(typeof_)
            ? [typeof_.x2 - typeof_.x1, typeof_.y2 - typeof_.y1]
            : W_.tangentAt.call(this, t);
        return j(n, n);
      },
    }),
    Z_ = ["fromSymbol", "toSymbol"],
    U_ = Th.prototype;
  ((U_.beforeUpdate = function () {
    var t = this,
      typeof_ = t.childOfName("fromSymbol"),
      n = t.childOfName("toSymbol"),
      i = t.childOfName("label");
    if (typeof_ || n || !i.ignore) {
      for (var r = 1, o = this.parent; o;) (o.scale && (r /= o.scale[0]), (o = o.parent));
      var a = t.childOfName("line");
      if (this.__dirty || a.__dirty) {
        var s = a.shape.percent,
          l = a.pointAt(0),
          h = a.pointAt(s),
          u = Z([], h, l);
        if (
          (j(u, u),
          typeof_ &&
            (typeof_.attr("position", l),
            (c = a.tangentAt(0)),
            typeof_.attr("rotation", Math.PI / 2 - Math.atan2(c[1], c[0])),
            typeof_.attr("scale", [r * s, r * s])),
          n)
        ) {
          n.attr("position", h);
          var c = a.tangentAt(1);
          (n.attr("rotation", -Math.PI / 2 - Math.atan2(c[1], c[0])),
            n.attr("scale", [r * s, r * s]));
        }
        if (!i.ignore) {
          i.attr("position", h);
          var d,
            f,
            p,
            g = 5 * r;
          if ("end" === i.__position)
            ((d = [u[0] * g + h[0], u[1] * g + h[1]]),
              (f = u[0] > 0.8 ? "left" : u[0] < -0.8 ? "right" : "center"),
              (p = u[1] > 0.8 ? "top" : u[1] < -0.8 ? "bottom" : "middle"));
          else if ("middle" === i.__position) {
            var m = s / 2,
              v = [(c = a.tangentAt(m))[1], -c[0]],
              y = a.pointAt(m);
            (v[1] > 0 && ((v[0] = -v[0]), (v[1] = -v[1])),
              (d = [y[0] + v[0] * g, y[1] + v[1] * g]),
              (f = "center"),
              (p = "bottom"));
            var x = -Math.atan2(c[1], c[0]);
            (h[0] < l[0] && (x = Math.PI + x), i.attr("rotation", x));
          } else
            ((d = [-u[0] * g + l[0], -u[1] * g + l[1]]),
              (f = u[0] > 0.8 ? "right" : u[0] < -0.8 ? "left" : "center"),
              (p = u[1] > 0.8 ? "bottom" : u[1] < -0.8 ? "top" : "middle"));
          i.attr({
            style: {
              textVerticalAlign: i.__verticalAlign || p,
              textAlign: i.__textAlign || f,
            },
            position: d,
            scale: [r, r],
          });
        }
      }
    }
  }),
    (U_._createLine = function (t, e, n) {
      var i = t.hostModel,
        r = (function (t) {
          var typeof_ = new G_({
            name: "line",
          });
          return (Ih(typeof_.shape, t), typeof_);
        })(t.getItemLayout(e));
      ((r.shape.percent = 0),
        Ei(
          r,
          {
            shape: {
              percent: 1,
            },
          },
          i,
          e,
        ),
        this.add(r));
      var o = new ng({
        name: "label",
        lineLabelOriginalOpacity: 1,
      });
      (this.add(o),
        f(
          Z_,
          function (n) {
            var i = Mh(n, t, e);
            (this.add(i), (this[Sh(n)] = t.getItemVisual(e, n)));
          },
          this,
        ),
        this._updateCommonStl(t, e, n));
    }),
    (U_.updateData = function (t, e, n) {
      var i = t.hostModel,
        r = this.childOfName("line"),
        o = t.getItemLayout(e),
        a = {
          shape: {},
        };
      (Ih(a.shape, o),
        zi(r, a, i, e),
        f(
          Z_,
          function (n) {
            var i = t.getItemVisual(e, n),
              r = Sh(n);
            if (this[r] !== i) {
              this.remove(this.childOfName(n));
              var o = Mh(n, t, e);
              this.add(o);
            }
            this[r] = i;
          },
          this,
        ),
        this._updateCommonStl(t, e, n));
    }),
    (U_._updateCommonStl = function (t, e, n) {
      var i = t.hostModel,
        r = this.childOfName("line"),
        o = n && n.lineStyle,
        a = n && n.hoverLineStyle,
        l = n && n.labelModel,
        h = n && n.hoverLabelModel;
      if (!n || t.hasItemOption) {
        var u = t.getItemModel(e);
        ((o = u.getModel("lineStyle").getLineStyle()),
          (a = u.getModel("emphasis.lineStyle").getLineStyle()),
          (l = u.getModel("label")),
          (h = u.getModel("emphasis.label")));
      }
      var c = t.getItemVisual(e, "color"),
        d = D(t.getItemVisual(e, "opacity"), o.opacity, 1);
      (r.useStyle(
        s(
          {
            strokeNoScale: !0,
            fill: "none",
            stroke: c,
            opacity: d,
          },
          o,
        ),
      ),
        (r.hoverStyle = a),
        f(
          Z_,
          function (t) {
            var typeof_ = this.childOfName(t);
            typeof_ &&
              (typeof_.setColor(c),
              typeof_.setStyle({
                opacity: d,
              }));
          },
          this,
        ));
      var p,
        g,
        m = l.getShallow("show"),
        v = h.getShallow("show"),
        y = this.childOfName("label");
      if (
        (m || v) &&
        ((p = c || "#000"), null == (g = i.getFormattedLabel(e, "normal", t.dataType)))
      ) {
        var x = i.getRawValue(e);
        g = null == x ? t.getName(e) : isFinite(x) ? ji(x) : x;
      }
      var _ = m ? g : null,
        w = v ? C(i.getFormattedLabel(e, "emphasis", t.dataType), g) : null,
        b = y.style;
      ((null == _ && null == w) ||
        (Ti(
          y.style,
          l,
          {
            text: _,
          },
          {
            autoColor: p,
          },
        ),
        (y.__textAlign = b.textAlign),
        (y.__verticalAlign = b.textVerticalAlign),
        (y.__position = l.get("position") || "middle")),
        (y.hoverStyle =
          null != w
            ? {
                text: w,
                textFill: h.getTextColor(!0),
                fontStyle: h.getShallow("fontStyle"),
                fontWeight: h.getShallow("fontWeight"),
                fontSize: h.getShallow("fontSize"),
                fontFamily: h.getShallow("fontFamily"),
              }
            : {
                text: null,
              }),
        (y.ignore = !m && !v),
        Si(this));
    }),
    (U_.highlight = function () {
      this.trigger("emphasis");
    }),
    (U_.downplay = function () {
      this.trigger("normal");
    }),
    (U_.updateLayout = function (t, e) {
      this.setLinePoints(t.getItemLayout(e));
    }),
    (U_.setLinePoints = function (t) {
      var typeof_ = this.childOfName("line");
      (Ih(typeof_.shape, t), typeof_.dirty());
    }),
    u(Th, qd));
  var X_ = Ah.prototype;
  ((X_.isPersistent = function () {
    return !0;
  }),
    (X_.updateData = function (t) {
      var typeof_ = this,
        n = typeof_.group,
        i = typeof_._lineData;
      ((typeof_._lineData = t), i || n.removeAll());
      var r = Ch(t);
      t.diff(i)
        .add(function (n) {
          !(function (t, e, n, i) {
            if (kh(e.getItemLayout(n))) {
              var r = new t._ctor(e, n, i);
              (e.setItemGraphicEl(n, r), t.group.add(r));
            }
          })(typeof_, t, n, r);
        })
        .update(function (n, o) {
          !(function (t, e, n, i, r, o) {
            var a = e.getItemGraphicEl(i);
            kh(n.getItemLayout(r))
              ? (a ? a.updateData(n, r, o) : (a = new t._ctor(n, r, o)),
                n.setItemGraphicEl(r, a),
                t.group.add(a))
              : t.group.remove(a);
          })(typeof_, i, t, o, n, r);
        })
        .remove(function (t) {
          n.remove(i.getItemGraphicEl(t));
        })
        .execute();
    }),
    (X_.updateLayout = function () {
      var t = this._lineData;
      t &&
        t.eachItemGraphicEl(function (e, n) {
          e.updateLayout(t, n);
        }, this);
    }),
    (X_.incrementalPrepareUpdate = function (t) {
      ((this._seriesScope = Ch(t)), (this._lineData = null), this.group.removeAll());
    }),
    (X_.incrementalUpdate = function (t, e) {
      for (var n = t.start; n < t.end; n++)
        if (kh(e.getItemLayout(n))) {
          var i = new this._ctor(e, n, this._seriesScope);
          (i.traverse(function (t) {
            t.isGroup || (t.incremental = t.useHoverLayer = !0);
          }),
            this.group.add(i),
            e.setItemGraphicEl(n, i));
        }
    }),
    (X_.remove = function () {
      (this._clearIncremental(), (this._incremental = null), this.group.removeAll());
    }),
    (X_._clearIncremental = function () {
      var t = this._incremental;
      t && t.clearDisplaybles();
    }));
  var Y_ = function (t, e, n, o) {
    var s = t.getData(),
      l = o.type;
    if (
      !x(o) &&
      ("min" === l ||
        "max" === l ||
        "average" === l ||
        "median" === l ||
        null != o.xAxis ||
        null != o.yAxis)
    ) {
      var h, u;
      if (null != o.yAxis || null != o.xAxis)
        ((h = null != o.yAxis ? "y" : "x"), e.getAxis(h), (u = A(o.yAxis, o.xAxis)));
      else {
        var c = mh(o, s, e, t);
        ((h = c.valueDataDim), c.valueAxis, (u = xh(s, h, l)));
      }
      var d = "x" === h ? 0 : 1,
        f = 1 - d,
        p = i(o),
        g = {};
      ((p.type = null),
        (p.coord = []),
        (g.coord = []),
        (p.coord[f] = -1 / 0),
        (g.coord[f] = 1 / 0));
      var m = n.get("precision");
      (m >= 0 && "number" == typeof u && (u = +u.toFixed(Math.min(m, 20))),
        (p.coord[d] = g.coord[d] = u),
        (o = [
          p,
          g,
          {
            type: l,
            valueIndex: o.valueIndex,
            value: u,
          },
        ]));
    }
    return (
      ((o = [gh(t, o[0]), gh(t, o[1]), a({}, o[2])])[2].type = o[2].type || ""),
      r(o[2], o[0]),
      r(o[2], o[1]),
      o
    );
  };
  (V_.extend({
    type: "markLine",
    updateTransform: function (t, e, n) {
      e.eachSeries(function (t) {
        var typeof_ = t.markLineModel;
        if (typeof_) {
          var i = typeof_.getData(),
            r = typeof_.__from,
            o = typeof_.__to;
          (r.each(function (e) {
            (zh(r, e, !0, t, n), zh(o, e, !1, t, n));
          }),
            i.each(function (t) {
              i.setItemLayout(t, [r.getItemLayout(t), o.getItemLayout(t)]);
            }),
            this.markerGroupMap.get(t.id).updateLayout());
        }
      }, this);
    },
    renderSeries: function (t, e, n, i) {
      function r(e, n, r) {
        var o = e.getItemModel(n);
        (zh(e, n, r, t, i),
          e.setItemVisual(n, {
            symbolSize: o.get("symbolSize") || g[r ? 0 : 1],
            symbol: o.get("symbol", !0) || p[r ? 0 : 1],
            color: o.get("itemStyle.color") || s.getVisual("color"),
          }));
      }
      var o = t.coordinateSystem,
        a = t.id,
        s = t.getData(),
        l = this.markerGroupMap,
        h = l.get(a) || l.set(a, new Ah());
      this.group.add(h.group);
      var u = Eh(o, t, e),
        c = u.from,
        d = u.to,
        f = u.line;
      ((e.__from = c), (e.__to = d), e.setData(f));
      var p = e.get("symbol"),
        g = e.get("symbolSize");
      (x(p) || (p = [p, p]),
        "number" == typeof g && (g = [g, g]),
        u.from.each(function (t) {
          (r(c, t, !0), r(d, t, !1));
        }),
        f.each(function (t) {
          var typeof_ = f.getItemModel(t).get("lineStyle.color");
          (f.setItemVisual(t, {
            color: typeof_ || c.getItemVisual(t, "color"),
          }),
            f.setItemLayout(t, [c.getItemLayout(t), d.getItemLayout(t)]),
            f.setItemVisual(t, {
              fromSymbolSize: c.getItemVisual(t, "symbolSize"),
              fromSymbol: c.getItemVisual(t, "symbol"),
              toSymbolSize: d.getItemVisual(t, "symbolSize"),
              toSymbol: d.getItemVisual(t, "symbol"),
            }));
        }),
        h.updateData(f),
        u.line.eachItemGraphicEl(function (t, n) {
          t.traverse(function (t) {
            t.dataModel = e;
          });
        }),
        (h.__keep = !0),
        (h.group.silent = e.get("silent") || t.get("silent")));
    },
  }),
    oa(function (t) {
      t.markLine = t.markLine || {};
    }),
    N_.extend({
      type: "markArea",
      defaultOption: {
        zlevel: 0,
        z: 1,
        tooltip: {
          trigger: "item",
        },
        animation: !1,
        label: {
          show: !0,
          position: "top",
        },
        itemStyle: {
          borderWidth: 0,
        },
        emphasis: {
          label: {
            show: !0,
            position: "top",
          },
        },
      },
    }));
  var j_ = function (t, e, n, i) {
      var r = gh(t, i[0]),
        a = gh(t, i[1]),
        s = A,
        l = r.coord,
        h = a.coord;
      ((l[0] = s(l[0], -1 / 0)),
        (l[1] = s(l[1], -1 / 0)),
        (h[0] = s(h[0], 1 / 0)),
        (h[1] = s(h[1], 1 / 0)));
      var u = o([{}, r, a]);
      return (
        (u.coord = [r.coord, a.coord]),
        (u.x0 = r.x),
        (u.y0 = r.y),
        (u.x1 = a.x),
        (u.y1 = a.y),
        u
      );
    },
    q_ = [
      ["x0", "y0"],
      ["x1", "y0"],
      ["x1", "y1"],
      ["x0", "y1"],
    ];
  (V_.extend({
    type: "markArea",
    updateTransform: function (t, e, n) {
      e.eachSeries(function (t) {
        var typeof_ = t.markAreaModel;
        if (typeof_) {
          var i = typeof_.getData();
          i.each(function (e) {
            var r = p(q_, function (r) {
              return Fh(i, e, r, t, n);
            });
            (i.setItemLayout(e, r), i.getItemGraphicEl(e).setShape("points", r));
          });
        }
      }, this);
    },
    renderSeries: function (t, e, n, i) {
      var r = t.coordinateSystem,
        o = t.id,
        a = t.getData(),
        l = this.markerGroupMap,
        h =
          l.get(o) ||
          l.set(o, {
            group: new qd(),
          });
      (this.group.add(h.group), (h.__keep = !0));
      var u = (function (t, e, n) {
        var i, r;
        t
          ? ((i = p(t && t.dimensions, function (t) {
              var n = e.getData();
              return s(
                {
                  name: t,
                },
                n.getDimensionInfo(n.mapDimension(t)) || {},
              );
            })),
            (r = new cy(
              p(["x0", "y0", "x1", "y1"], function (t, e) {
                return {
                  name: t,
                  type: i[e % 2].type,
                };
              }),
              n,
            )))
          : (r = new cy(
              (i = [
                {
                  name: "value",
                  type: "float",
                },
              ]),
              n,
            ));
        var o = p(n.get("data"), y(j_, e, t, n));
        t && (o = m(o, y(Bh, t)));
        var a = t
          ? function (t, e, n, i) {
              return t.coord[Math.floor(i / 2)][i % 2];
            }
          : function (t) {
              return t.value;
            };
        return (r.initData(o, null, a), (r.hasItemOption = !0), r);
      })(r, t, e);
      (e.setData(u),
        u.each(function (e) {
          (u.setItemLayout(
            e,
            p(q_, function (n) {
              return Fh(u, e, n, t, i);
            }),
          ),
            u.setItemVisual(e, {
              color: a.getVisual("color"),
            }));
        }),
        u
          .diff(h.__data)
          .add(function (t) {
            var typeof_ = new ug({
              shape: {
                points: u.getItemLayout(t),
              },
            });
            (u.setItemGraphicEl(t, typeof_), h.group.add(typeof_));
          })
          .update(function (t, n) {
            var i = h.__data.getItemGraphicEl(n);
            (zi(
              i,
              {
                shape: {
                  points: u.getItemLayout(t),
                },
              },
              e,
              t,
            ),
              h.group.add(i),
              u.setItemGraphicEl(t, i));
          })
          .remove(function (t) {
            var typeof_ = h.__data.getItemGraphicEl(t);
            h.group.remove(typeof_);
          })
          .execute(),
        u.eachItemGraphicEl(function (t, n) {
          var i = u.getItemModel(n),
            r = i.getModel("label"),
            o = i.getModel("emphasis.label"),
            a = u.getItemVisual(n, "color");
          (t.useStyle(
            s(i.getModel("itemStyle").getItemStyle(), {
              fill: Bt(a, 0.4),
              stroke: a,
            }),
          ),
            (t.hoverStyle = i.getModel("emphasis.itemStyle").getItemStyle()),
            Ii(t.style, t.hoverStyle, r, o, {
              labelFetcher: e,
              labelDataIndex: n,
              defaultText: u.getName(n) || "",
              isRectText: !0,
              autoColor: a,
            }),
            Si(t, {}),
            (t.dataModel = e));
        }),
        (h.__data = u),
        (h.group.silent = e.get("silent") || t.get("silent")));
    },
  }),
    oa(function (t) {
      t.markArea = t.markArea || {};
    }),
    im.registerSubTypeDefaulter("dataZoom", function () {
      return "slider";
    }));
  var $_ = ["cartesian2d", "polar", "singleAxis"],
    K_ = (function (t, e) {
      var n = p((t = t.slice()), fr),
        i = p((e = (e || []).slice()), fr);
      return function (r, o) {
        f(t, function (t, a) {
          for (
            var s = {
                name: t,
                capital: n[a],
              },
              l = 0;
            l < e.length;
            l++
          )
            s[e[l]] = t + i[l];
          r.call(o, s);
        });
      };
    })(["x", "y", "z", "radius", "angle", "single"], ["axisIndex", "axis", "index", "id"]),
    Q_ = f,
    J_ = qi,
    tw = function (t, e, n, i) {
      ((this._dimName = t),
        (this._axisIndex = e),
        this._valueWindow,
        this._percentWindow,
        this._dataExtent,
        this._minMaxSpan,
        (this.ecModel = i),
        (this._dataZoomModel = n));
    };
  tw.prototype = {
    constructor: tw,
    hostedBy: function (t) {
      return this._dataZoomModel === t;
    },
    getDataValueWindow: function () {
      return this._valueWindow.slice();
    },
    getDataPercentWindow: function () {
      return this._percentWindow.slice();
    },
    getTargetSeriesModels: function () {
      var t = [],
        typeof_ = this.ecModel;
      return (
        typeof_.eachSeries(function (n) {
          if (
            (function (t) {
              return h($_, t) >= 0;
            })(n.get("coordinateSystem"))
          ) {
            var i = this._dimName,
              r = typeof_.queryComponents({
                mainType: i + "Axis",
                index: n.get(i + "AxisIndex"),
                id: n.get(i + "AxisId"),
              })[0];
            this._axisIndex === (r && r.componentIndex) && t.push(n);
          }
        }, this),
        t
      );
    },
    getAxisModel: function () {
      return this.ecModel.getComponent(this._dimName + "Axis", this._axisIndex);
    },
    getOtherAxisModel: function () {
      var t,
        typeof_,
        n,
        i = this._dimName,
        r = this.ecModel,
        o = this.getAxisModel();
      return (
        "x" === i || "y" === i
          ? ((e = "gridIndex"), (t = "x" === i ? "y" : "x"))
          : ((e = "polarIndex"), (t = "angle" === i ? "radius" : "angle")),
        r.eachComponent(t + "Axis", function (t) {
          (t.get(typeof_) || 0) === (o.get(typeof_) || 0) && (n = t);
        }),
        n
      );
    },
    getMinMaxSpan: function () {
      return i(this._minMaxSpan);
    },
    calculateDataWindow: function (t) {
      var typeof_ = this._dataExtent,
        n = this.getAxisModel().axis.scale,
        i = this._dataZoomModel.getRangePropMode(),
        r = [0, 100],
        o = [t.start, t.end],
        a = [];
      return (
        Q_(["startValue", "endValue"], function (e) {
          a.push(null != t[e] ? n.parse(t[e]) : null);
        }),
        Q_([0, 1], function (t) {
          var s = a[t],
            l = o[t];
          ("percent" === i[t]
            ? (null == l && (l = r[t]), (s = n.parse(Xi(l, r, typeof_, !0))))
            : (l = Xi(s, typeof_, r, !0)),
            (a[t] = s),
            (o[t] = l));
        }),
        {
          valueWindow: J_(a),
          percentWindow: J_(o),
        }
      );
    },
    reset: function (t) {
      if (t === this._dataZoomModel) {
        var typeof_ = this.getTargetSeriesModels();
        this._dataExtent = Vh(this, this._dimName, typeof_);
        var n = this.calculateDataWindow(t.option);
        ((this._valueWindow = n.valueWindow),
          (this._percentWindow = n.percentWindow),
          (function (t) {
            var typeof_ = (t._minMaxSpan = {}),
              n = t._dataZoomModel;
            Q_(["min", "max"], function (i) {
              typeof_[i + "Span"] = n.get(i + "Span");
              var r = n.get(i + "ValueSpan");
              if (
                null != r &&
                ((typeof_[i + "ValueSpan"] = r), null != (r = t.getAxisModel().axis.scale.parse(r)))
              ) {
                var o = t._dataExtent;
                typeof_[i + "Span"] = Xi(o[0] + r, o, [0, 100], !0);
              }
            });
          })(this),
          Hh(this));
      }
    },
    restore: function (t) {
      t === this._dataZoomModel && ((this._valueWindow = this._percentWindow = null), Hh(this, !0));
    },
    filterData: function (t, e) {
      if (t === this._dataZoomModel) {
        var n = this._dimName,
          i = this.getTargetSeriesModels(),
          r = t.get("filterMode"),
          o = this._valueWindow;
        "none" !== r &&
          Q_(i, function (t) {
            var typeof_ = t.getData(),
              i = typeof_.mapDimension(n, !0);
            i.length &&
              ("weakFilter" === r
                ? typeof_.filterSelf(function (t) {
                    for (var n, r, a, s = 0; s < i.length; s++) {
                      var l = typeof_.get(i[s], t),
                        h = !isNaN(l),
                        u = l < o[0],
                        c = l > o[1];
                      if (h && !u && !c) return !0;
                      (h && (a = !0), u && (n = !0), c && (r = !0));
                    }
                    return a && n && r;
                  })
                : Q_(i, function (n) {
                    if ("empty" === r)
                      t.setData(
                        typeof_.map(n, function (t) {
                          return (function (t) {
                            return t >= o[0] && t <= o[1];
                          })(t)
                            ? t
                            : NaN;
                        }),
                      );
                    else {
                      var i = {};
                      ((i[n] = o), typeof_.selectRange(i));
                    }
                  }),
              Q_(i, function (t) {
                typeof_.setApproximateExtent(o, t);
              }));
          });
      }
    },
  };
  var ew = f,
    nw = K_,
    iw = da({
      type: "dataZoom",
      dependencies: ["xAxis", "yAxis", "zAxis", "radiusAxis", "angleAxis", "singleAxis", "series"],
      defaultOption: {
        zlevel: 0,
        z: 4,
        orient: null,
        xAxisIndex: null,
        yAxisIndex: null,
        filterMode: "filter",
        throttle: null,
        start: 0,
        end: 100,
        startValue: null,
        endValue: null,
        minSpan: null,
        maxSpan: null,
        minValueSpan: null,
        maxValueSpan: null,
        rangeMode: null,
      },
      init: function (t, e, n) {
        ((this._dataIntervalByAxis = {}),
          (this._dataInfo = {}),
          (this._axisProxies = {}),
          this.textStyleModel,
          (this._autoThrottle = !0),
          (this._rangePropMode = ["percent", "percent"]));
        var i = Wh(t);
        (this.mergeDefaultAndTheme(t, n), this.doInit(i));
      },
      mergeOption: function (t) {
        var typeof_ = Wh(t);
        (r(this.option, t, !0), this.doInit(typeof_));
      },
      doInit: function (t) {
        var typeof_ = this.option;
        (Hc.canvasSupported || (typeof_.realtime = !1),
          this._setDefaultThrottle(t),
          Gh(this, t),
          ew(
            [
              ["start", "startValue"],
              ["end", "endValue"],
            ],
            function (t, n) {
              "value" === this._rangePropMode[n] && (typeof_[t[0]] = null);
            },
            this,
          ),
          (this.textStyleModel = this.getModel("textStyle")),
          this._resetTarget(),
          this._giveAxisProxies());
      },
      _giveAxisProxies: function () {
        var t = this._axisProxies;
        this.eachTargetAxis(function (e, n, i, r) {
          var o = this.dependentModels[e.axis][n],
            a = o.__dzAxisProxy || (o.__dzAxisProxy = new tw(e.name, n, this, r));
          t[e.name + "_" + n] = a;
        }, this);
      },
      _resetTarget: function () {
        var t = this.option,
          typeof_ = this._judgeAutoMode();
        (nw(function (e) {
          var n = e.axisIndex;
          t[n] = rn(t[n]);
        }, this),
          "axisIndex" === typeof_
            ? this._autoSetAxisIndex()
            : "orient" === typeof_ && this._autoSetOrient());
      },
      _judgeAutoMode: function () {
        var t = this.option,
          typeof_ = !1;
        nw(function (n) {
          null != t[n.axisIndex] && (e = !0);
        }, this);
        var n = t.orient;
        return null == n && typeof_
          ? "orient"
          : typeof_
            ? void 0
            : (null == n && (t.orient = "horizontal"), "axisIndex");
      },
      _autoSetAxisIndex: function () {
        var t = !0,
          typeof_ = this.get("orient", !0),
          n = this.option,
          i = this.dependentModels;
        if (t) {
          var r = "vertical" === typeof_ ? "y" : "x";
          i[r + "Axis"].length
            ? ((n[r + "AxisIndex"] = [0]), (t = !1))
            : ew(i.singleAxis, function (i) {
                t &&
                  i.get("orient", !0) === typeof_ &&
                  ((n.singleAxisIndex = [i.componentIndex]), (t = !1));
              });
        }
        (t &&
          nw(function (e) {
            if (t) {
              var i = [],
                r = this.dependentModels[e.axis];
              if (r.length && !i.length)
                for (var o = 0, a = r.length; o < a; o++)
                  "category" === r[o].get("type") && i.push(o);
              ((n[e.axisIndex] = i), i.length && (t = !1));
            }
          }, this),
          t &&
            this.ecModel.eachSeries(function (t) {
              this._isSeriesHasAllAxesTypeOf(t, "value") &&
                nw(function (e) {
                  var i = n[e.axisIndex],
                    r = t.get(e.axisIndex),
                    o = t.get(e.axisId);
                  h(
                    i,
                    (r = t.ecModel.queryComponents({
                      mainType: e.axis,
                      index: r,
                      id: o,
                    })[0].componentIndex),
                  ) < 0 && i.push(r);
                });
            }, this));
      },
      _autoSetOrient: function () {
        var t;
        (this.eachTargetAxis(function (e) {
          !t && (t = e.name);
        }, this),
          (this.option.orient = "y" === t ? "vertical" : "horizontal"));
      },
      _isSeriesHasAllAxesTypeOf: function (t, e) {
        var n = !0;
        return (
          nw(function (i) {
            var r = t.get(i.axisIndex),
              o = this.dependentModels[i.axis][r];
            (o && o.get("type") === e) || (n = !1);
          }, this),
          n
        );
      },
      _setDefaultThrottle: function (t) {
        if ((t.hasOwnProperty("throttle") && (this._autoThrottle = !1), this._autoThrottle)) {
          var typeof_ = this.ecModel.option;
          this.option.throttle =
            typeof_.animation && typeof_.animationDurationUpdate > 0 ? 100 : 20;
        }
      },
      getFirstTargetAxisModel: function () {
        var t;
        return (
          nw(function (e) {
            if (null == t) {
              var n = this.get(e.axisIndex);
              n.length && (t = this.dependentModels[e.axis][n[0]]);
            }
          }, this),
          t
        );
      },
      eachTargetAxis: function (t, e) {
        var n = this.ecModel;
        nw(function (i) {
          ew(
            this.get(i.axisIndex),
            function (r) {
              t.call(e, i, r, this, n);
            },
            this,
          );
        }, this);
      },
      getAxisProxy: function (t, e) {
        return this._axisProxies[t + "_" + e];
      },
      getAxisModel: function (t, e) {
        var n = this.getAxisProxy(t, e);
        return n && n.getAxisModel();
      },
      setRawRange: function (t, e) {
        var n = this.option;
        (ew(
          [
            ["start", "startValue"],
            ["end", "endValue"],
          ],
          function (e) {
            (null == t[e[0]] && null == t[e[1]]) || ((n[e[0]] = t[e[0]]), (n[e[1]] = t[e[1]]));
          },
          this,
        ),
          !e && Gh(this, t));
      },
      getPercentRange: function () {
        var t = this.findRepresentativeAxisProxy();
        if (t) return t.getDataPercentWindow();
      },
      getValueRange: function (t, e) {
        if (null != t || null != e) return this.getAxisProxy(t, e).getDataValueWindow();
        var n = this.findRepresentativeAxisProxy();
        return n ? n.getDataValueWindow() : void 0;
      },
      findRepresentativeAxisProxy: function (t) {
        if (t) return t.__dzAxisProxy;
        var typeof_ = this._axisProxies;
        for (var n in typeof_)
          if (typeof_.hasOwnProperty(n) && typeof_[n].hostedBy(this)) return typeof_[n];
        for (var n in typeof_)
          if (typeof_.hasOwnProperty(n) && !typeof_[n].hostedBy(this)) return typeof_[n];
      },
      getRangePropMode: function () {
        return this._rangePropMode.slice();
      },
    }),
    rw = Zm.extend({
      type: "dataZoom",
      render: function (t, e, n, i) {
        ((this.dataZoomModel = t), (this.ecModel = e), (this.api = n));
      },
      getTargetCoordInfo: function () {
        var t = this.dataZoomModel,
          typeof_ = this.ecModel,
          n = {};
        return (
          t.eachTargetAxis(function (t, i) {
            var r = typeof_.getComponent(t.axis, i);
            if (r) {
              var o = r.getCoordSysModel();
              o &&
                (function (t, e, n, i) {
                  for (var r, o = 0; o < n.length; o++)
                    if (n[o].model === t) {
                      r = n[o];
                      break;
                    }
                  (r ||
                    n.push(
                      (r = {
                        model: t,
                        axisModels: [],
                        coordIndex: i,
                      }),
                    ),
                    r.axisModels.push(e));
                })(o, r, n[o.mainType] || (n[o.mainType] = []), o.componentIndex);
            }
          }, this),
          n
        );
      },
    }),
    ow =
      (iw.extend({
        type: "dataZoom.slider",
        layoutMode: "box",
        defaultOption: {
          show: !0,
          right: "ph",
          top: "ph",
          width: "ph",
          height: "ph",
          left: null,
          bottom: null,
          backgroundColor: "rgba(47,69,84,0)",
          dataBackground: {
            lineStyle: {
              color: "#2f4554",
              width: 0.5,
              opacity: 0.3,
            },
            areaStyle: {
              color: "rgba(47,69,84,0.3)",
              opacity: 0.3,
            },
          },
          borderColor: "#ddd",
          fillerColor: "rgba(167,183,204,0.4)",
          handleIcon:
            "M8.2,13.6V3.9H6.3v9.7H3.1v14.9h3.3v9.7h1.8v-9.7h3.3V13.6H8.2z M9.7,24.4H4.8v-1.4h4.9V24.4z M9.7,19.1H4.8v-1.4h4.9V19.1z",
          handleSize: "100%",
          handleStyle: {
            color: "#a7b7cc",
          },
          labelPrecision: null,
          labelFormatter: null,
          showDetail: !0,
          showDataShadow: "auto",
          realtime: !0,
          zoomLock: !1,
          textStyle: {
            color: "#333",
          },
        },
      }),
      function (t, e, n, i, r, o) {
        ((e[0] = Uh(e[0], n)), (e[1] = Uh(e[1], n)), (t = t || 0));
        var a = n[1] - n[0];
        (null != r && (r = Uh(r, [0, a])),
          null != o && (o = Math.max(o, null != r ? r : 0)),
          "all" === i && ((r = o = Math.abs(e[1] - e[0])), (i = 0)));
        var s = Zh(e, i);
        e[i] += t;
        var l = r || 0,
          h = n.slice();
        (s.sign < 0 ? (h[0] += l) : (h[1] -= l),
          (e[i] = Uh(e[i], h)),
          (u = Zh(e, i)),
          null != r && (u.sign !== s.sign || u.span < r) && (e[1 - i] = e[i] + s.sign * r));
        var u = Zh(e, i);
        return (null != o && u.span > o && (e[1 - i] = e[i] + u.sign * o), e);
      }),
    aw = pg,
    sw = Xi,
    lw = qi,
    hw = v,
    uw = f,
    cw = "horizontal",
    dw = ["line", "bar", "candlestick", "scatter"],
    fw = rw.extend({
      type: "dataZoom.slider",
      init: function (t, e) {
        ((this._displayables = {}),
          this._orient,
          this._range,
          this._handleEnds,
          this._size,
          this._handleWidth,
          this._handleHeight,
          this._location,
          this._dragging,
          this._dataShadowInfo,
          (this.api = e));
      },
      render: function (t, e, n, i) {
        (fw.superApply(this, "render", arguments),
          vo(this, "_dispatchZoomAction", this.dataZoomModel.get("throttle"), "fixRate"),
          (this._orient = t.get("orient")),
          !1 !== this.dataZoomModel.get("show")
            ? ((i && "dataZoom" === i.type && i.from === this.uid) || this._buildView(),
              this._updateView())
            : this.group.removeAll());
      },
      remove: function () {
        (fw.superApply(this, "remove", arguments), yo(this, "_dispatchZoomAction"));
      },
      dispose: function () {
        (fw.superApply(this, "dispose", arguments), yo(this, "_dispatchZoomAction"));
      },
      _buildView: function () {
        var t = this.group;
        (t.removeAll(), this._resetLocation(), this._resetInterval());
        var typeof_ = (this._displayables.barGroup = new qd());
        (this._renderBackground(),
          this._renderHandle(),
          this._renderDataShadow(),
          t.add(typeof_),
          this._positionGroup());
      },
      _resetLocation: function () {
        var t = this.dataZoomModel,
          typeof_ = this.api,
          n = this._findCoordRect(),
          i = {
            width: typeof_.getWidth(),
            height: typeof_.getHeight(),
          },
          r =
            this._orient === cw
              ? {
                  right: i.width - n.x - n.width,
                  top: i.height - 30 - 7,
                  width: n.width,
                  height: 30,
                }
              : {
                  right: 7,
                  top: n.y,
                  width: 30,
                  height: n.height,
                },
          o = yr(t.option);
        f(["right", "top", "width", "height"], function (t) {
          "ph" === o[t] && (o[t] = r[t]);
        });
        var a = gr(o, i, t.padding);
        ((this._location = {
          x: a.x,
          y: a.y,
        }),
          (this._size = [a.width, a.height]),
          "vertical" === this._orient && this._size.reverse());
      },
      _positionGroup: function () {
        var t = this.group,
          typeof_ = this._location,
          n = this._orient,
          i = this.dataZoomModel.getFirstTargetAxisModel(),
          r = i && i.get("inverse"),
          o = this._displayables.barGroup,
          a = (this._dataShadowInfo || {}).otherAxisInverse;
        o.attr(
          n !== cw || r
            ? n === cw && r
              ? {
                  scale: a ? [-1, 1] : [-1, -1],
                }
              : "vertical" !== n || r
                ? {
                    scale: a ? [-1, -1] : [-1, 1],
                    rotation: Math.PI / 2,
                  }
                : {
                    scale: a ? [1, -1] : [1, 1],
                    rotation: Math.PI / 2,
                  }
            : {
                scale: a ? [1, 1] : [1, -1],
              },
        );
        var s = t.getBoundingRect([o]);
        t.attr("position", [typeof_.x - s.x, typeof_.y - s.y]);
      },
      _getViewExtent: function () {
        return [0, this._size[0]];
      },
      _renderBackground: function () {
        var t = this.dataZoomModel,
          typeof_ = this._size,
          n = this._displayables.barGroup;
        (n.add(
          new aw({
            silent: !0,
            shape: {
              x: 0,
              y: 0,
              width: typeof_[0],
              height: typeof_[1],
            },
            style: {
              fill: t.get("backgroundColor"),
            },
            z2: -40,
          }),
        ),
          n.add(
            new aw({
              shape: {
                x: 0,
                y: 0,
                width: typeof_[0],
                height: typeof_[1],
              },
              style: {
                fill: "transparent",
              },
              z2: 0,
              onclick: v(this._onClickPanelClick, this),
            }),
          ));
      },
      _renderDataShadow: function () {
        var t = (this._dataShadowInfo = this._prepareDataShadowInfo());
        if (t) {
          var typeof_ = this._size,
            n = t.series,
            i = n.getRawData(),
            r = n.getShadowDim ? n.getShadowDim() : t.otherDim;
          if (null != r) {
            var o = i.getDataExtent(r),
              a = 0.3 * (o[1] - o[0]);
            o = [o[0] - a, o[1] + a];
            var l,
              h = [0, typeof_[1]],
              u = [0, typeof_[0]],
              c = [
                [typeof_[0], 0],
                [0, 0],
              ],
              d = [],
              f = u[1] / (i.count() - 1),
              p = 0,
              g = Math.round(i.count() / typeof_[0]);
            i.each([r], function (t, e) {
              if (g > 0 && e % g) p += f;
              else {
                var n = null == t || isNaN(t) || "" === t,
                  i = n ? 0 : sw(t, o, h, !0);
                (n && !l && e
                  ? (c.push([c[c.length - 1][0], 0]), d.push([d[d.length - 1][0], 0]))
                  : !n && l && (c.push([p, 0]), d.push([p, 0])),
                  c.push([p, i]),
                  d.push([p, i]),
                  (p += f),
                  (l = n));
              }
            });
            var m = this.dataZoomModel;
            (this._displayables.barGroup.add(
              new ug({
                shape: {
                  points: c,
                },
                style: s(
                  {
                    fill: m.get("dataBackgroundColor"),
                  },
                  m.getModel("dataBackground.areaStyle").getAreaStyle(),
                ),
                silent: !0,
                z2: -20,
              }),
            ),
              this._displayables.barGroup.add(
                new cg({
                  shape: {
                    points: d,
                  },
                  style: m.getModel("dataBackground.lineStyle").getLineStyle(),
                  silent: !0,
                  z2: -19,
                }),
              ));
          }
        }
      },
      _prepareDataShadowInfo: function () {
        var t = this.dataZoomModel,
          typeof_ = t.get("showDataShadow");
        if (!1 !== typeof_) {
          var n,
            i = this.ecModel;
          return (
            t.eachTargetAxis(function (r, o) {
              f(
                t.getAxisProxy(r.name, o).getTargetSeriesModels(),
                function (t) {
                  if (!(n || (!0 !== typeof_ && h(dw, t.get("type")) < 0))) {
                    var a,
                      s = i.getComponent(r.axis, o).axis,
                      l = (function (t) {
                        return {
                          x: "y",
                          y: "x",
                          radius: "angle",
                          angle: "radius",
                        }[t];
                      })(r.name),
                      u = t.coordinateSystem;
                    (null != l && u.getOtherAxis && (a = u.getOtherAxis(s).inverse),
                      (l = t.getData().mapDimension(l)),
                      (n = {
                        thisAxis: s,
                        series: t,
                        thisDim: r.name,
                        otherDim: l,
                        otherAxisInverse: a,
                      }));
                  }
                },
                this,
              );
            }, this),
            n
          );
        }
      },
      _renderHandle: function () {
        var t = this._displayables,
          typeof_ = (t.handles = []),
          n = (t.handleLabels = []),
          i = this._displayables.barGroup,
          r = this._size,
          o = this.dataZoomModel;
        (i.add(
          (t.filler = new aw({
            draggable: !0,
            cursor: Xh(this._orient),
            drift: hw(this._onDragMove, this, "all"),
            onmousemove: function (t) {
              dd(t.event);
            },
            ondragstart: hw(this._showDataInfo, this, !0),
            ondragend: hw(this._onDragEnd, this),
            onmouseover: hw(this._showDataInfo, this, !0),
            onmouseout: hw(this._showDataInfo, this, !1),
            style: {
              fill: o.get("fillerColor"),
              textPosition: "inside",
            },
          })),
        ),
          i.add(
            new aw(
              ui({
                silent: !0,
                shape: {
                  x: 0,
                  y: 0,
                  width: r[0],
                  height: r[1],
                },
                style: {
                  stroke: o.get("dataBackgroundColor") || o.get("borderColor"),
                  lineWidth: 1,
                  fill: "rgba(0,0,0,0)",
                },
              }),
            ),
          ),
          uw(
            [0, 1],
            function (t) {
              var r = Hi(
                  o.get("handleIcon"),
                  {
                    cursor: Xh(this._orient),
                    draggable: !0,
                    drift: hw(this._onDragMove, this, t),
                    onmousemove: function (t) {
                      dd(t.event);
                    },
                    ondragend: hw(this._onDragEnd, this),
                    onmouseover: hw(this._showDataInfo, this, !0),
                    onmouseout: hw(this._showDataInfo, this, !1),
                  },
                  {
                    x: -1,
                    y: 0,
                    width: 2,
                    height: 2,
                  },
                ),
                a = r.getBoundingRect();
              ((this._handleHeight = Yi(o.get("handleSize"), this._size[1])),
                (this._handleWidth = (a.width / a.height) * this._handleHeight),
                r.setStyle(o.getModel("handleStyle").getItemStyle()));
              var s = o.get("handleColor");
              (null != s && (r.style.fill = s), i.add((typeof_[t] = r)));
              var l = o.textStyleModel;
              this.group.add(
                (n[t] = new ng({
                  silent: !0,
                  invisible: !0,
                  style: {
                    x: 0,
                    y: 0,
                    text: "",
                    textVerticalAlign: "middle",
                    textAlign: "center",
                    textFill: l.getTextColor(),
                    textFont: l.getFont(),
                  },
                  z2: 10,
                })),
              );
            },
            this,
          ));
      },
      _resetInterval: function () {
        var t = (this._range = this.dataZoomModel.getPercentRange()),
          typeof_ = this._getViewExtent();
        this._handleEnds = [sw(t[0], [0, 100], typeof_, !0), sw(t[1], [0, 100], typeof_, !0)];
      },
      _updateInterval: function (t, e) {
        var n = this.dataZoomModel,
          i = this._handleEnds,
          r = this._getViewExtent(),
          o = n.findRepresentativeAxisProxy().getMinMaxSpan(),
          a = [0, 100];
        ow(
          e,
          i,
          r,
          n.get("zoomLock") ? "all" : t,
          null != o.minSpan ? sw(o.minSpan, a, r, !0) : null,
          null != o.maxSpan ? sw(o.maxSpan, a, r, !0) : null,
        );
        var s = this._range,
          l = (this._range = lw([sw(i[0], r, a, !0), sw(i[1], r, a, !0)]));
        return !s || s[0] !== l[0] || s[1] !== l[1];
      },
      _updateView: function (t) {
        var typeof_ = this._displayables,
          n = this._handleEnds,
          i = lw(n.slice()),
          r = this._size;
        (uw(
          [0, 1],
          function (t) {
            var i = typeof_.handles[t],
              o = this._handleHeight;
            i.attr({
              scale: [o / 2, o / 2],
              position: [n[t], r[1] / 2 - o / 2],
            });
          },
          this,
        ),
          typeof_.filler.setShape({
            x: i[0],
            y: 0,
            width: i[1] - i[0],
            height: r[1],
          }),
          this._updateDataInfo(t));
      },
      _updateDataInfo: function (t) {
        function e(t) {
          var typeof_ = Ni(i.handles[t].parent, this.group),
            n = Bi(0 === t ? "right" : "left", typeof_),
            s = this._handleWidth / 2 + 5,
            l = Ri([c[t] + (0 === t ? -s : s), this._size[1] / 2], typeof_);
          r[t].setStyle({
            x: l[0],
            y: l[1],
            textVerticalAlign: o === cw ? "middle" : n,
            textAlign: o === cw ? n : "center",
            text: a[t],
          });
        }
        var n = this.dataZoomModel,
          i = this._displayables,
          r = i.handleLabels,
          o = this._orient,
          a = ["", ""];
        if (n.get("showDetail")) {
          var s = n.findRepresentativeAxisProxy();
          if (s) {
            var l = s.getAxisModel().axis,
              h = this._range,
              u = t
                ? s.calculateDataWindow({
                    start: h[0],
                    end: h[1],
                  }).valueWindow
                : s.getDataValueWindow();
            a = [this._formatLabel(u[0], l), this._formatLabel(u[1], l)];
          }
        }
        var c = lw(this._handleEnds.slice());
        (e.call(this, 0), e.call(this, 1));
      },
      _formatLabel: function (t, e) {
        var n = this.dataZoomModel,
          i = n.get("labelFormatter"),
          r = n.get("labelPrecision");
        (null != r && "auto" !== r) || (r = e.getPixelPrecision());
        var o =
          null == t || isNaN(t)
            ? ""
            : "category" === e.type || "time" === e.type
              ? e.scale.getLabel(Math.round(t))
              : t.toFixed(Math.min(r, 20));
        return _(i) ? i(t, o) : w(i) ? i.replace("{value}", o) : o;
      },
      _showDataInfo: function (t) {
        t = this._dragging || t;
        var typeof_ = this._displayables.handleLabels;
        (typeof_[0].attr("invisible", !t), typeof_[1].attr("invisible", !t));
      },
      _onDragMove: function (t, e, n) {
        this._dragging = !0;
        var i = Ri([e, n], this._displayables.barGroup.getLocalTransform(), !0),
          r = this._updateInterval(t, i[0]),
          o = this.dataZoomModel.get("realtime");
        (this._updateView(!o), r && o && this._dispatchZoomAction());
      },
      _onDragEnd: function () {
        ((this._dragging = !1),
          this._showDataInfo(!1),
          !this.dataZoomModel.get("realtime") && this._dispatchZoomAction());
      },
      _onClickPanelClick: function (t) {
        var typeof_ = this._size,
          n = this._displayables.barGroup.transformCoordToLocal(t.offsetX, t.offsetY);
        if (!(n[0] < 0 || n[0] > typeof_[0] || n[1] < 0 || n[1] > typeof_[1])) {
          var i = this._handleEnds,
            r = (i[0] + i[1]) / 2,
            o = this._updateInterval("all", n[0] - r);
          (this._updateView(), o && this._dispatchZoomAction());
        }
      },
      _dispatchZoomAction: function () {
        var t = this._range;
        this.api.dispatchAction({
          type: "dataZoom",
          from: this.uid,
          dataZoomId: this.dataZoomModel.id,
          start: t[0],
          end: t[1],
        });
      },
      _findCoordRect: function () {
        var t;
        if (
          (uw(this.getTargetCoordInfo(), function (e) {
            if (!t && e.length) {
              var n = e[0].model.coordinateSystem;
              t = n.getRect && n.getRect();
            }
          }),
          !t)
        ) {
          var typeof_ = this.api.getWidth(),
            n = this.api.getHeight();
          t = {
            x: 0.2 * typeof_,
            y: 0.2 * n,
            width: 0.6 * typeof_,
            height: 0.6 * n,
          };
        }
        return t;
      },
    });
  iw.extend({
    type: "dataZoom.inside",
    defaultOption: {
      disabled: !1,
      zoomLock: !1,
      zoomOnMouseWheel: !0,
      moveOnMouseMove: !0,
      moveOnMouseWheel: !1,
      preventDefaultMouseMove: !0,
    },
  });
  var pw = "\0_ec_interaction_mutex";
  (sa(
    {
      type: "takeGlobalCursor",
      event: "globalCursorTaken",
      update: "update",
    },
    function () {},
  ),
    c(qh, hd));
  var gw = "\0_ec_dataZoom_roams",
    mw = v,
    vw = rw.extend({
      type: "dataZoom.inside",
      init: function (t, e) {
        this._range;
      },
      render: function (t, e, n, i) {
        (vw.superApply(this, "render", arguments),
          (this._range = t.getPercentRange()),
          f(
            this.getTargetCoordInfo(),
            function (e, i) {
              var r = p(e, function (t) {
                return ou(t.model);
              });
              f(
                e,
                function (e) {
                  var o = e.model,
                    a = {};
                  (f(
                    ["pan", "zoom", "scrollMove"],
                    function (t) {
                      a[t] = mw(yw[t], this, e, i);
                    },
                    this,
                  ),
                    ru(n, {
                      coordId: ou(o),
                      allCoordIds: r,
                      containsPoint: function (t, e, n) {
                        return o.coordinateSystem.containPoint([e, n]);
                      },
                      dataZoomId: t.id,
                      dataZoomModel: t,
                      getRange: a,
                    }));
                },
                this,
              );
            },
            this,
          ));
      },
      dispose: function () {
        ((function (t, e) {
          var n = au(t);
          (f(n, function (t) {
            t.controller.dispose();
            var n = t.dataZoomInfos;
            n[e] && (delete n[e], t.count--);
          }),
            su(n));
        })(this.api, this.dataZoomModel.id),
          vw.superApply(this, "dispose", arguments),
          (this._range = null));
      },
    }),
    yw = {
      zoom: function (t, e, n, i) {
        var r = this._range,
          o = r.slice(),
          a = t.axisModels[0];
        if (a) {
          var s = xw[e](null, [i.originX, i.originY], a, n, t),
            l =
              ((s.signal > 0 ? s.pixelStart + s.pixelLength - s.pixel : s.pixel - s.pixelStart) /
                s.pixelLength) *
                (o[1] - o[0]) +
              o[0],
            h = Math.max(1 / i.scale, 0);
          ((o[0] = (o[0] - l) * h + l), (o[1] = (o[1] - l) * h + l));
          var u = this.dataZoomModel.findRepresentativeAxisProxy().getMinMaxSpan();
          return (
            ow(0, o, [0, 100], 0, u.minSpan, u.maxSpan),
            (this._range = o),
            r[0] !== o[0] || r[1] !== o[1] ? o : void 0
          );
        }
      },
      pan: hu(function (t, e, n, i, r, o) {
        var a = xw[i]([o.oldX, o.oldY], [o.newX, o.newY], e, r, n);
        return (a.signal * (t[1] - t[0]) * a.pixel) / a.pixelLength;
      }),
      scrollMove: hu(function (t, e, n, i, r, o) {
        return (
          xw[i]([0, 0], [o.scrollDelta, o.scrollDelta], e, r, n).signal *
          (t[1] - t[0]) *
          o.scrollDelta
        );
      }),
    },
    xw = {
      grid: function (t, e, n, i, r) {
        var o = n.axis,
          a = {},
          s = r.model.coordinateSystem.getRect();
        return (
          (t = t || [0, 0]),
          "x" === o.dim
            ? ((a.pixel = e[0] - t[0]),
              (a.pixelLength = s.width),
              (a.pixelStart = s.x),
              (a.signal = o.inverse ? 1 : -1))
            : ((a.pixel = e[1] - t[1]),
              (a.pixelLength = s.height),
              (a.pixelStart = s.y),
              (a.signal = o.inverse ? -1 : 1)),
          a
        );
      },
      polar: function (t, e, n, i, r) {
        var o = n.axis,
          a = {},
          s = r.model.coordinateSystem,
          l = s.getRadiusAxis().getExtent(),
          h = s.getAngleAxis().getExtent();
        return (
          (t = t ? s.pointToCoord(t) : [0, 0]),
          (e = s.pointToCoord(e)),
          "radiusAxis" === n.mainType
            ? ((a.pixel = e[0] - t[0]),
              (a.pixelLength = l[1] - l[0]),
              (a.pixelStart = l[0]),
              (a.signal = o.inverse ? 1 : -1))
            : ((a.pixel = e[1] - t[1]),
              (a.pixelLength = h[1] - h[0]),
              (a.pixelStart = h[0]),
              (a.signal = o.inverse ? -1 : 1)),
          a
        );
      },
      singleAxis: function (t, e, n, i, r) {
        var o = n.axis,
          a = r.model.coordinateSystem.getRect(),
          s = {};
        return (
          (t = t || [0, 0]),
          "horizontal" === o.orient
            ? ((s.pixel = e[0] - t[0]),
              (s.pixelLength = a.width),
              (s.pixelStart = a.x),
              (s.signal = o.inverse ? 1 : -1))
            : ((s.pixel = e[1] - t[1]),
              (s.pixelLength = a.height),
              (s.pixelStart = a.y),
              (s.signal = o.inverse ? -1 : 1)),
          s
        );
      },
    };
  (aa({
    getTargetSeries: function (t) {
      var typeof_ = R();
      return (
        t.eachComponent("dataZoom", function (t) {
          t.eachTargetAxis(function (t, n, i) {
            f(i.getAxisProxy(t.name, n).getTargetSeriesModels(), function (t) {
              typeof_.set(t.uid, t);
            });
          });
        }),
        typeof_
      );
    },
    modifyOutputEnd: !0,
    overallReset: function (t, e) {
      (t.eachComponent("dataZoom", function (t) {
        (t.eachTargetAxis(function (t, n, i) {
          i.getAxisProxy(t.name, n).reset(i, e);
        }),
          t.eachTargetAxis(function (t, n, i) {
            i.getAxisProxy(t.name, n).filterData(i, e);
          }));
      }),
        t.eachComponent("dataZoom", function (t) {
          var typeof_ = t.findRepresentativeAxisProxy(),
            n = typeof_.getDataPercentWindow(),
            i = typeof_.getDataValueWindow();
          t.setRawRange(
            {
              start: n[0],
              end: n[1],
              startValue: i[0],
              endValue: i[1],
            },
            !0,
          );
        }));
    },
  }),
    sa("dataZoom", function (t, e) {
      var n = (function (t, e, n) {
          function i(t, e) {
            return h(e.nodes, t) >= 0;
          }
          function r(t, i) {
            var r = !1;
            return (
              e(function (e) {
                f(n(t, e) || [], function (t) {
                  i.records[e.name][t] && (r = !0);
                });
              }),
              r
            );
          }
          function o(t, i) {
            (i.nodes.push(t),
              e(function (e) {
                f(n(t, e) || [], function (t) {
                  i.records[e.name][t] = !0;
                });
              }));
          }
          return function (n) {
            var a,
              s = {
                nodes: [],
                records: {},
              };
            if (
              (e(function (t) {
                s.records[t.name] = {};
              }),
              !n)
            )
              return s;
            o(n, s);
            do {
              ((a = !1),
                t(function (t) {
                  !i(t, s) && r(t, s) && (o(t, s), (a = !0));
                }));
            } while (a);
            return s;
          };
        })(v(e.eachComponent, e, "dataZoom"), K_, function (t, e) {
          return t.get(e.axisIndex);
        }),
        i = [];
      (e.eachComponent(
        {
          mainType: "dataZoom",
          query: t,
        },
        function (t, e) {
          i.push.apply(i, n(t).nodes);
        },
      ),
        f(i, function (e, n) {
          e.setRawRange({
            start: t.start,
            end: t.end,
            startValue: t.startValue,
            endValue: t.endValue,
          });
        }));
    }));
  var _w = {},
    ww = da({
      type: "toolbox",
      layoutMode: {
        type: "box",
        ignoreSize: !0,
      },
      optionUpdated: function () {
        (ww.superApply(this, "optionUpdated", arguments),
          f(this.option.feature, function (t, e) {
            var n = cu(e);
            n && r(t, n.defaultOption);
          }));
      },
      defaultOption: {
        show: !0,
        z: 6,
        zlevel: 0,
        orient: "horizontal",
        left: "right",
        top: "top",
        backgroundColor: "transparent",
        borderColor: "#ccc",
        borderRadius: 0,
        borderWidth: 0,
        padding: 5,
        itemSize: 15,
        itemGap: 8,
        showTitle: !0,
        iconStyle: {
          borderColor: "#666",
          color: "none",
        },
        emphasis: {
          iconStyle: {
            borderColor: "#3E98C5",
          },
        },
      },
    });
  fa({
    type: "toolbox",
    render: function (t, e, n, i) {
      function r(r, a) {
        var s,
          c = u[r],
          d = u[a],
          f = new Wi(l[c], t, t.ecModel);
        if (c && !d) {
          if (
            (function (t) {
              return 0 === t.indexOf("my");
            })(c)
          )
            s = {
              model: f,
              onclick: f.option.onclick,
              featureName: c,
            };
          else {
            var p = cu(c);
            if (!p) return;
            s = new p(f, e, n);
          }
          h[c] = s;
        } else {
          if (!(s = h[d])) return;
          ((s.model = f), (s.ecModel = e), (s.api = n));
        }
        c || !d
          ? f.get("show") && !s.unusable
            ? (o(f, s, c),
              (f.setIconStatus = function (t, e) {
                var n = this.option,
                  i = this.iconPaths;
                ((n.iconStatus = n.iconStatus || {}),
                  (n.iconStatus[t] = e),
                  i[t] && i[t].trigger(e));
              }),
              s.render && s.render(f, e, n, i))
            : s.remove && s.remove(e, n)
          : s.dispose && s.dispose(e, n);
      }
      function o(i, r, o) {
        var l = i.getModel("iconStyle"),
          h = i.getModel("emphasis.iconStyle"),
          u = r.getIcons ? r.getIcons() : i.get("icon"),
          c = i.get("title") || {};
        if ("string" == typeof u) {
          var d = u,
            p = c;
          ((c = {}), ((u = {})[o] = d), (c[o] = p));
        }
        var g = (i.iconPaths = {});
        f(u, function (o, u) {
          var d = Hi(
            o,
            {},
            {
              x: -s / 2,
              y: -s / 2,
              width: s,
              height: s,
            },
          );
          (d.setStyle(l.getItemStyle()),
            (d.hoverStyle = h.getItemStyle()),
            Si(d),
            t.get("showTitle") &&
              ((d.__title = c[u]),
              d
                .on("mouseover", function () {
                  var t = h.getItemStyle();
                  d.setStyle({
                    text: c[u],
                    textPosition: t.textPosition || "bottom",
                    textFill: t.fill || t.stroke || "#000",
                    textAlign: t.textAlign || "center",
                  });
                })
                .on("mouseout", function () {
                  d.setStyle({
                    textFill: null,
                  });
                })),
            d.trigger(i.get("iconStatus." + u) || "normal"),
            a.add(d),
            d.on("click", v(r.onclick, r, e, n, u)),
            (g[u] = d));
        });
      }
      var a = this.group;
      if ((a.removeAll(), t.get("show"))) {
        var s = +t.get("itemSize"),
          l = t.get("feature") || {},
          h = this._features || (this._features = {}),
          u = [];
        (f(l, function (t, e) {
          u.push(e);
        }),
          new va(this._featureNames || [], u).add(r).update(r).remove(y(r, null)).execute(),
          (this._featureNames = u),
          (function (t, e, n) {
            var i = e.getBoxLayoutParams(),
              r = e.get("padding"),
              o = {
                width: n.getWidth(),
                height: n.getHeight(),
              },
              a = gr(i, o, r);
            (tm(e.get("orient"), t, e.get("itemGap"), a.width, a.height), mr(t, i, o, r));
          })(a, t, n),
          a.add(lh(a.getBoundingRect(), t)),
          a.eachChild(function (t) {
            var typeof_ = t.__title,
              i = t.hoverStyle;
            if (i && typeof_) {
              var r = ye(typeof_, Pe(i)),
                o = t.position[0] + a.position[0],
                l = !1;
              t.position[1] + a.position[1] + s + r.height > n.getHeight() &&
                ((i.textPosition = "top"), (l = !0));
              var h = l ? -5 - r.height : s + 8;
              o + r.width / 2 > n.getWidth()
                ? ((i.textPosition = ["100%", h]), (i.textAlign = "right"))
                : o - r.width / 2 < 0 && ((i.textPosition = [0, h]), (i.textAlign = "left"));
            }
          }));
      }
    },
    updateView: function (t, e, n, i) {
      f(this._features, function (t) {
        t.updateView && t.updateView(t.model, e, n, i);
      });
    },
    remove: function (t, e) {
      (f(this._features, function (n) {
        n.remove && n.remove(t, e);
      }),
        this.group.removeAll());
    },
    dispose: function (t, e) {
      f(this._features, function (n) {
        n.dispose && n.dispose(t, e);
      });
    },
  });
  var bw = ev.toolbox.saveAsImage;
  ((du.defaultOption = {
    show: !0,
    icon: "M4.7,22.9L29.3,45.5L54.7,23.4M4.6,43.6L4.6,58L53.8,58L53.8,43.6M29.2,45.1L29.2,0",
    title: bw.title,
    type: "png",
    name: "",
    excludeComponents: ["toolbox"],
    pixelRatio: 1,
    lang: bw.lang.slice(),
  }),
    (du.prototype.unusable = !Hc.canvasSupported),
    (du.prototype.onclick = function (t, e) {
      var n = this.model,
        i = n.get("name") || t.get("title.0.text") || "echarts",
        r = document.createElement("a"),
        o = n.get("type", !0) || "png";
      ((r.download = i + "." + o), (r.target = "_blank"));
      var a = e.getConnectedDataURL({
        type: o,
        backgroundColor: n.get("backgroundColor", !0) || t.get("backgroundColor") || "#fff",
        excludeComponents: n.get("excludeComponents"),
        pixelRatio: n.get("pixelRatio"),
      });
      if (((r.href = a), "function" != typeof MouseEvent || Hc.browser.ie || Hc.browser.edge)) {
        if (window.navigator.msSaveOrOpenBlob) {
          for (var s = atob(a.split(",")[1]), l = s.length, h = new Uint8Array(l); l--;)
            h[l] = s.charCodeAt(l);
          var u = new Blob([h]);
          window.navigator.msSaveOrOpenBlob(u, i + "." + o);
        } else {
          var c = n.get("lang"),
            d =
              '<body style="margin:0;"><img src="' +
              a +
              '" style="max-width:100%;" title="' +
              ((c && c[0]) || "") +
              '" /></body>';
          window.open().document.write(d);
        }
      } else {
        var f = new MouseEvent("click", {
          view: window,
          bubbles: !0,
          cancelable: !1,
        });
        r.dispatchEvent(f);
      }
    }),
    uu("saveAsImage", du));
  var Sw = ev.toolbox.magicType;
  fu.defaultOption = {
    show: !0,
    type: [],
    icon: {
      line: "M4.1,28.9h7.1l9.3-22l7.4,38l9.7-19.7l3,12.8h14.9M4.1,58h51.4",
      bar: "M6.7,22.9h10V48h-10V22.9zM24.9,13h10v35h-10V13zM43.2,2h10v46h-10V2zM3.1,58h53.7",
      stack:
        "M8.2,38.4l-8.4,4.1l30.6,15.3L60,42.5l-8.1-4.1l-21.5,11L8.2,38.4z M51.9,30l-8.1,4.2l-13.4,6.9l-13.9-6.9L8.2,30l-8.4,4.2l8.4,4.2l22.2,11l21.5-11l8.1-4.2L51.9,30z M51.9,21.7l-8.1,4.2L35.7,30l-5.3,2.8L24.9,30l-8.4-4.1l-8.3-4.2l-8.4,4.2L8.2,30l8.3,4.2l13.9,6.9l13.4-6.9l8.1-4.2l8.1-4.1L51.9,21.7zM30.4,2.2L-0.2,17.5l8.4,4.1l8.3,4.2l8.4,4.2l5.5,2.7l5.3-2.7l8.1-4.2l8.1-4.2l8.1-4.1L30.4,2.2z",
      tiled:
        "M2.3,2.2h22.8V25H2.3V2.2z M35,2.2h22.8V25H35V2.2zM2.3,35h22.8v22.8H2.3V35z M35,35h22.8v22.8H35V35z",
    },
    title: i(Sw.title),
    option: {},
    seriesIndex: {},
  };
  var Mw = fu.prototype;
  Mw.getIcons = function () {
    var t = this.model,
      typeof_ = t.get("icon"),
      n = {};
    return (
      f(t.get("type"), function (t) {
        typeof_[t] && (n[t] = typeof_[t]);
      }),
      n
    );
  };
  var Iw = {
      line: function (t, e, n, i) {
        if ("bar" === t)
          return r(
            {
              id: e,
              type: "line",
              data: n.get("data"),
              stack: n.get("stack"),
              markPoint: n.get("markPoint"),
              markLine: n.get("markLine"),
            },
            i.get("option.line") || {},
            !0,
          );
      },
      bar: function (t, e, n, i) {
        if ("line" === t)
          return r(
            {
              id: e,
              type: "bar",
              data: n.get("data"),
              stack: n.get("stack"),
              markPoint: n.get("markPoint"),
              markLine: n.get("markLine"),
            },
            i.get("option.bar") || {},
            !0,
          );
      },
      stack: function (t, e, n, i) {
        if ("line" === t || "bar" === t)
          return r(
            {
              id: e,
              stack: "__ec_magicType_stack__",
            },
            i.get("option.stack") || {},
            !0,
          );
      },
      tiled: function (t, e, n, i) {
        if ("line" === t || "bar" === t)
          return r(
            {
              id: e,
              stack: "",
            },
            i.get("option.tiled") || {},
            !0,
          );
      },
    },
    Tw = [
      ["line", "bar"],
      ["stack", "tiled"],
    ];
  ((Mw.onclick = function (t, e, n) {
    var i = this.model,
      r = i.get("seriesIndex." + n);
    if (Iw[n]) {
      var o = {
        series: [],
      };
      (f(Tw, function (t) {
        h(t, n) >= 0 &&
          f(t, function (t) {
            i.setIconStatus(t, "normal");
          });
      }),
        i.setIconStatus(n, "emphasis"),
        t.eachComponent(
          {
            mainType: "series",
            query:
              null == r
                ? null
                : {
                    seriesIndex: r,
                  },
          },
          function (e) {
            var r = e.subType,
              a = e.id,
              l = Iw[n](r, a, e, i);
            l && (s(l, e.option), o.series.push(l));
            var h = e.coordinateSystem;
            if (h && "cartesian2d" === h.type && ("line" === n || "bar" === n)) {
              var u = h.getAxesByScale("ordinal")[0];
              if (u) {
                var c = u.dim + "Axis",
                  d = t.queryComponents({
                    mainType: c,
                    index: e.get(name + "Index"),
                    id: e.get(name + "Id"),
                  })[0].componentIndex;
                o[c] = o[c] || [];
                for (var f = 0; f <= d; f++) o[c][d] = o[c][d] || {};
                o[c][d].boundaryGap = "bar" === n;
              }
            }
          },
        ),
        e.dispatchAction({
          type: "changeMagicType",
          currentType: n,
          newOption: o,
        }));
    }
  }),
    sa(
      {
        type: "changeMagicType",
        event: "magicTypeChanged",
        update: "prepareAndUpdate",
      },
      function (t, e) {
        e.mergeOption(t.newOption);
      },
    ),
    uu("magicType", fu));
  var Aw = ev.toolbox.dataView,
    Cw = new Array(60).join("-"),
    Dw = "\t",
    kw = new RegExp("[" + Dw + "]+", "g");
  ((xu.defaultOption = {
    show: !0,
    readOnly: !1,
    optionToContent: null,
    contentToOption: null,
    icon: "M17.5,17.3H33 M17.5,17.3H33 M45.4,29.5h-28 M11.5,2v56H51V14.8L38.4,2H11.5z M38.4,2.2v12.7H51 M45.4,41.7h-28",
    title: i(Aw.title),
    lang: i(Aw.lang),
    backgroundColor: "#fff",
    textColor: "#000",
    textareaColor: "#fff",
    textareaBorderColor: "#333",
    buttonColor: "#c23531",
    buttonTextColor: "#fff",
  }),
    (xu.prototype.onclick = function (t, e) {
      function n() {
        (i.removeChild(o), (x._dom = null));
      }
      var i = e.getDom(),
        r = this.model;
      this._dom && i.removeChild(this._dom);
      var o = document.createElement("div");
      ((o.style.cssText = "position:absolute;left:5px;top:5px;bottom:5px;right:5px;"),
        (o.style.backgroundColor = r.get("backgroundColor") || "#fff"));
      var a = document.createElement("h4"),
        s = r.get("lang") || [];
      ((a.innerHTML = s[0] || r.get("title")),
        (a.style.cssText = "margin: 10px 20px;"),
        (a.style.color = r.get("textColor")));
      var l = document.createElement("div"),
        h = document.createElement("textarea");
      l.style.cssText = "display:block;width:100%;overflow:auto;";
      var u = r.get("optionToContent"),
        c = r.get("contentToOption"),
        d = mu(t);
      if ("function" == typeof u) {
        var f = u(e.getOption());
        "string" == typeof f ? (l.innerHTML = f) : I(f) && l.appendChild(f);
      } else
        (l.appendChild(h),
          (h.readOnly = r.get("readOnly")),
          (h.style.cssText =
            "width:100%;height:100%;font-family:monospace;font-size:14px;line-height:1.6rem;"),
          (h.style.color = r.get("textColor")),
          (h.style.borderColor = r.get("textareaBorderColor")),
          (h.style.backgroundColor = r.get("textareaColor")),
          (h.value = d.value));
      var p = d.meta,
        g = document.createElement("div");
      g.style.cssText = "position:absolute;bottom:0;left:0;right:0;";
      var m =
          "float:right;margin-right:20px;border:none;cursor:pointer;padding:2px 5px;font-size:12px;border-radius:3px",
        v = document.createElement("div"),
        y = document.createElement("div");
      ((m += ";background-color:" + r.get("buttonColor")),
        (m += ";color:" + r.get("buttonTextColor")));
      var x = this;
      (at(v, "click", n),
        at(y, "click", function () {
          var t;
          try {
            t = "function" == typeof c ? c(l, e.getOption()) : yu(h.value, p);
          } catch (t) {
            throw (n(), new Error("Data view format error " + t));
          }
          (t &&
            e.dispatchAction({
              type: "changeDataView",
              newOption: t,
            }),
            n());
        }),
        (v.innerHTML = s[1]),
        (y.innerHTML = s[2]),
        (y.style.cssText = m),
        (v.style.cssText = m),
        !r.get("readOnly") && g.appendChild(y),
        g.appendChild(v),
        at(h, "keydown", function (t) {
          if (9 === (t.keyCode || t.which)) {
            var typeof_ = this.value,
              n = this.selectionStart,
              i = this.selectionEnd;
            ((this.value = typeof_.substring(0, n) + Dw + typeof_.substring(i)),
              (this.selectionStart = this.selectionEnd = n + 1),
              dd(t));
          }
        }),
        o.appendChild(a),
        o.appendChild(l),
        o.appendChild(g),
        (l.style.height = i.clientHeight - 80 + "px"),
        i.appendChild(o),
        (this._dom = o));
    }),
    (xu.prototype.remove = function (t, e) {
      this._dom && e.getDom().removeChild(this._dom);
    }),
    (xu.prototype.dispose = function (t, e) {
      this.remove(t, e);
    }),
    uu("dataView", xu),
    sa(
      {
        type: "changeDataView",
        event: "dataViewChanged",
        update: "prepareAndUpdate",
      },
      function (t, e) {
        var n = [];
        (f(t.newOption.series, function (t) {
          var i = e.getSeriesByName(t.name)[0];
          if (i) {
            var r = i.get("data");
            n.push({
              name: t.name,
              data: _u(t.data, r),
            });
          } else
            n.push(
              a(
                {
                  type: "scatter",
                },
                t,
              ),
            );
        }),
          e.mergeOption(
            s(
              {
                series: n,
              },
              t.newOption,
            ),
          ));
      },
    ));
  var Pw = y,
    Lw = f,
    Ow = p,
    zw = Math.min,
    Ew = Math.max,
    Nw = Math.pow,
    Rw = 1e4,
    Bw = 6,
    Fw = 6,
    Vw = "globalPan",
    Hw = {
      w: [0, 0],
      e: [0, 1],
      n: [1, 0],
      s: [1, 1],
    },
    Ww = {
      w: "ew",
      e: "ew",
      n: "ns",
      s: "ns",
      ne: "nesw",
      sw: "nesw",
      nw: "nwse",
      se: "nwse",
    },
    Gw = {
      brushStyle: {
        lineWidth: 2,
        stroke: "rgba(0,0,0,0.3)",
        fill: "rgba(0,0,0,0.1)",
      },
      transformable: !0,
      brushMode: "single",
      removeOnClick: !1,
    },
    Zw = 0;
  ((wu.prototype = {
    constructor: wu,
    enableBrush: function (t) {
      return (this._brushType && Su(this), t.brushType && bu(this, t), this);
    },
    setPanels: function (t) {
      if (t && t.length) {
        var typeof_ = (this._panels = {});
        f(t, function (t) {
          typeof_[t.panelId] = i(t);
        });
      } else this._panels = null;
      return this;
    },
    mount: function (t) {
      ((t = t || {}), (this._enableGlobalPan = t.enableGlobalPan));
      var typeof_ = this.group;
      return (
        this._zr.add(typeof_),
        typeof_.attr({
          position: t.position || [0, 0],
          rotation: t.rotation || 0,
          scale: t.scale || [1, 1],
        }),
        (this._transform = typeof_.getLocalTransform()),
        this
      );
    },
    eachCover: function (t, e) {
      Lw(this._covers, t, e);
    },
    updateCovers: function (t) {
      function e(t, e) {
        return (null != t.id ? t.id : o + e) + "-" + t.brushType;
      }
      function n(e, n) {
        var i = t[e];
        if (null != n && a[n] === h) s[e] = a[n];
        else {
          var r = (s[e] = null != n ? ((a[n].__brushOption = i), a[n]) : Iu(l, Mu(l, i)));
          Cu(l, r);
        }
      }
      t = p(t, function (t) {
        return r(i(Gw), t, !0);
      });
      var o = "\0-brush-index-",
        a = this._covers,
        s = (this._covers = []),
        l = this,
        h = this._creatingCover;
      return (
        new va(
          a,
          t,
          function (t, n) {
            return e(t.__brushOption, n);
          },
          e,
        )
          .add(n)
          .update(n)
          .remove(function (t) {
            a[t] !== h && l.group.remove(a[t]);
          })
          .execute(),
        this
      );
    },
    unmount: function () {
      return (this.enableBrush(!1), Lu(this), this._zr.remove(this.group), this);
    },
    dispose: function () {
      (this.unmount(), this.off());
    },
  }),
    c(wu, hd));
  var Uw = {
      mousedown: function (t) {
        if (this._dragging) $u.call(this, t);
        else if (!t.target || !t.target.draggable) {
          Xu(t);
          var typeof_ = this.group.transformCoordToLocal(t.offsetX, t.offsetY);
          ((this._creatingCover = null),
            (this._creatingPanel = ku(this, t, typeof_)) &&
              ((this._dragging = !0), (this._track = [typeof_.slice()])));
        }
      },
      mousemove: function (t) {
        var typeof_ = this.group.transformCoordToLocal(t.offsetX, t.offsetY);
        if (
          ((function (t, e, n) {
            if (t._brushType) {
              var i = t._zr,
                r = t._covers,
                o = ku(t, e, n);
              if (!t._dragging)
                for (var a = 0; a < r.length; a++) {
                  var s = r[a].__brushOption;
                  if (
                    o &&
                    (!0 === o || s.panelId === o.panelId) &&
                    Xw[s.brushType].contain(r[a], n[0], n[1])
                  )
                    return;
                }
              o && i.setCursorStyle("crosshair");
            }
          })(this, t, typeof_),
          this._dragging)
        ) {
          Xu(t);
          var n = ju(this, t, typeof_, !1);
          n && Ou(this, n);
        }
      },
      mouseup: $u,
    },
    Xw = {
      lineX: Ku(0),
      lineY: Ku(1),
      rect: {
        createCover: function (t, e) {
          return Eu(
            Pw(
              Wu,
              function (t) {
                return t;
              },
              function (t) {
                return t;
              },
            ),
            t,
            e,
            ["w", "e", "n", "s", "se", "sw", "ne", "nw"],
          );
        },
        getCreatingRange: function (t) {
          var typeof_ = zu(t);
          return Vu(typeof_[1][0], typeof_[1][1], typeof_[0][0], typeof_[0][1]);
        },
        updateCoverShape: function (t, e, n, i) {
          Nu(t, e, n, i);
        },
        updateCommon: Ru,
        contain: Yu,
      },
      polygon: {
        createCover: function (t, e) {
          var n = new qd();
          return (
            n.add(
              new cg({
                name: "main",
                style: Fu(e),
                silent: !0,
              }),
            ),
            n
          );
        },
        getCreatingRange: function (t) {
          return t;
        },
        endCreating: function (t, e) {
          (e.remove(e.childAt(0)),
            e.add(
              new ug({
                name: "main",
                draggable: !0,
                drift: Pw(Gu, t, e),
                ondragend: Pw(Ou, t, {
                  isEnd: !0,
                }),
              }),
            ));
        },
        updateCoverShape: function (t, e, n, i) {
          e.childAt(0).setShape({
            points: Uu(t, e, n),
          });
        },
        updateCommon: Ru,
        contain: Yu,
      },
    },
    Yw = {
      axisPointer: 1,
      tooltip: 1,
      brush: 1,
    },
    jw = f,
    qw = h,
    $w = y,
    Kw = ["dataToPoint", "pointToData"],
    Qw = ["grid", "xAxis", "yAxis", "geo", "graph", "polar", "radiusAxis", "angleAxis", "bmap"],
    Jw = nc.prototype;
  ((Jw.setOutputRanges = function (t, e) {
    this.matchOutputRanges(t, e, function (t, e, n) {
      if (((t.coordRanges || (t.coordRanges = [])).push(e), !t.coordRange)) {
        t.coordRange = e;
        var i = ib[t.brushType](0, n, e);
        t.__rangeOffset = {
          offset: rb[t.brushType](i.values, t.range, [1, 1]),
          xyMinMax: i.xyMinMax,
        };
      }
    });
  }),
    (Jw.matchOutputRanges = function (t, e, n) {
      jw(
        t,
        function (t) {
          var i = this.findTargetInfo(t, e);
          i &&
            !0 !== i &&
            f(i.coordSyses, function (i) {
              var r = ib[t.brushType](1, i, t.range);
              n(t, r.values, i, e);
            });
        },
        this,
      );
    }),
    (Jw.setInputRanges = function (t, e) {
      jw(
        t,
        function (t) {
          var n = this.findTargetInfo(t, e);
          if (((t.range = t.range || []), n && !0 !== n)) {
            t.panelId = n.panelId;
            var i = ib[t.brushType](0, n.coordSys, t.coordRange),
              r = t.__rangeOffset;
            t.range = r
              ? rb[t.brushType](
                  i.values,
                  r.offset,
                  (function (t, e) {
                    var n = sc(t),
                      i = sc(e),
                      r = [n[0] / i[0], n[1] / i[1]];
                    return (isNaN(r[0]) && (r[0] = 1), isNaN(r[1]) && (r[1] = 1), r);
                  })(i.xyMinMax, r.xyMinMax),
                )
              : i.values;
          }
        },
        this,
      );
    }),
    (Jw.makePanelOpts = function (t, e) {
      return p(this._targetInfoList, function (n) {
        var i = n.getPanelRect();
        return {
          panelId: n.panelId,
          defaultBrushType: e && e(n),
          clipPath: Qu(i),
          isTargetByCursor: tc(i, t, n.coordSysModel),
          getLinearBrushOtherExtent: Ju(i),
        };
      });
    }),
    (Jw.controlSeries = function (t, e, n) {
      var i = this.findTargetInfo(t, n);
      return !0 === i || (i && qw(i.coordSyses, e.coordinateSystem) >= 0);
    }),
    (Jw.findTargetInfo = function (t, e) {
      for (var n = this._targetInfoList, i = rc(e, t), r = 0; r < n.length; r++) {
        var o = n[r],
          a = t.panelId;
        if (a) {
          if (o.panelId === a) return o;
        } else for (r = 0; r < eb.length; r++) if (eb[r](i, o)) return o;
      }
      return !0;
    }));
  var tb = {
      grid: function (t, e) {
        var n = t.xAxisModels,
          i = t.yAxisModels,
          r = t.gridModels,
          o = R(),
          a = {},
          s = {};
        (n || i || r) &&
          (jw(n, function (t) {
            var typeof_ = t.axis.grid.model;
            (o.set(typeof_.id, typeof_), (a[typeof_.id] = !0));
          }),
          jw(i, function (t) {
            var typeof_ = t.axis.grid.model;
            (o.set(typeof_.id, typeof_), (s[typeof_.id] = !0));
          }),
          jw(r, function (t) {
            (o.set(t.id, t), (a[t.id] = !0), (s[t.id] = !0));
          }),
          o.each(function (t) {
            var r = t.coordinateSystem,
              o = [];
            (jw(r.getCartesians(), function (t, e) {
              (qw(n, t.getAxis("x").model) >= 0 || qw(i, t.getAxis("y").model) >= 0) && o.push(t);
            }),
              e.push({
                panelId: "grid--" + t.id,
                gridModel: t,
                coordSysModel: t,
                coordSys: o[0],
                coordSyses: o,
                getPanelRect: nb.grid,
                xAxisDeclared: a[t.id],
                yAxisDeclared: s[t.id],
              }));
          }));
      },
      geo: function (t, e) {
        jw(t.geoModels, function (t) {
          var n = t.coordinateSystem;
          e.push({
            panelId: "geo--" + t.id,
            geoModel: t,
            coordSysModel: t,
            coordSys: n,
            coordSyses: [n],
            getPanelRect: nb.geo,
          });
        });
      },
    },
    eb = [
      function (t, e) {
        var n = t.xAxisModel,
          i = t.yAxisModel,
          r = t.gridModel;
        return (
          !r && n && (r = n.axis.grid.model),
          !r && i && (r = i.axis.grid.model),
          r && r === e.gridModel
        );
      },
      function (t, e) {
        var n = t.geoModel;
        return n && n === e.geoModel;
      },
    ],
    nb = {
      grid: function () {
        return this.coordSys.grid.getRect().clone();
      },
      geo: function () {
        var t = this.coordSys,
          typeof_ = t.getBoundingRect().clone();
        return (typeof_.applyTransform(Ni(t)), typeof_);
      },
    },
    ib = {
      lineX: $w(oc, 0),
      lineY: $w(oc, 1),
      rect: function (t, e, n) {
        var i = e[Kw[t]]([n[0][0], n[1][0]]),
          r = e[Kw[t]]([n[0][1], n[1][1]]),
          o = [ic([i[0], r[0]]), ic([i[1], r[1]])];
        return {
          values: o,
          xyMinMax: o,
        };
      },
      polygon: function (t, e, n) {
        var i = [
          [1 / 0, -1 / 0],
          [1 / 0, -1 / 0],
        ];
        return {
          values: p(n, function (n) {
            var r = e[Kw[t]](n);
            return (
              (i[0][0] = Math.min(i[0][0], r[0])),
              (i[1][0] = Math.min(i[1][0], r[1])),
              (i[0][1] = Math.max(i[0][1], r[0])),
              (i[1][1] = Math.max(i[1][1], r[1])),
              r
            );
          }),
          xyMinMax: i,
        };
      },
    },
    rb = {
      lineX: $w(ac, 0),
      lineY: $w(ac, 1),
      rect: function (t, e, n) {
        return [
          [t[0][0] - n[0] * e[0][0], t[0][1] - n[0] * e[0][1]],
          [t[1][0] - n[1] * e[1][0], t[1][1] - n[1] * e[1][1]],
        ];
      },
      polygon: function (t, e, n) {
        return p(t, function (t, i) {
          return [t[0] - n[0] * e[i][0], t[1] - n[1] * e[i][1]];
        });
      },
    },
    ob = f,
    ab = "\0_ec_hist_store";
  (iw.extend({
    type: "dataZoom.select",
  }),
    rw.extend({
      type: "dataZoom.select",
    }));
  var sb = ev.toolbox.dataZoom,
    lb = f;
  hc.defaultOption = {
    show: !0,
    icon: {
      zoom: "M0,13.5h26.9 M13.5,26.9V0 M32.1,13.5H58V58H13.5 V32.1",
      back: "M22,1.4L9.9,13.5l12.3,12.3 M10.3,13.5H54.9v44.6 H10.3v-26",
    },
    title: i(sb.title),
  };
  var hb = hc.prototype;
  ((hb.render = function (t, e, n, i) {
    ((this.model = t),
      (this.ecModel = e),
      (this.api = n),
      (function (t, e, n, i, r) {
        var o = n._isZoomActive;
        (i &&
          "takeGlobalCursor" === i.type &&
          (o = "dataZoomSelect" === i.key && i.dataZoomSelectActive),
          (n._isZoomActive = o),
          t.setIconStatus("zoom", o ? "emphasis" : "normal"));
        var a = new nc(uc(t.option), e, {
          include: ["grid"],
        });
        n._brushController
          .setPanels(
            a.makePanelOpts(r, function (t) {
              return t.xAxisDeclared && !t.yAxisDeclared
                ? "lineX"
                : !t.xAxisDeclared && t.yAxisDeclared
                  ? "lineY"
                  : "rect";
            }),
          )
          .enableBrush(
            !!o && {
              brushType: "auto",
              brushStyle: {
                lineWidth: 0,
                fill: "rgba(0,0,0,0.2)",
              },
            },
          );
      })(t, e, this, i, n),
      cc(t, e));
  }),
    (hb.onclick = function (t, e, n) {
      ub[n].call(this);
    }),
    (hb.remove = function (t, e) {
      this._brushController.unmount();
    }),
    (hb.dispose = function (t, e) {
      this._brushController.dispose();
    }));
  var ub = {
    zoom: function () {
      var t = !this._isZoomActive;
      this.api.dispatchAction({
        type: "takeGlobalCursor",
        key: "dataZoomSelect",
        dataZoomSelectActive: t,
      });
    },
    back: function () {
      this._dispatchZoomAction(
        (function (t) {
          var typeof_ = lc(t),
            n = typeof_[typeof_.length - 1];
          typeof_.length > 1 && typeof_.pop();
          var i = {};
          return (
            ob(n, function (t, n) {
              for (var r = typeof_.length - 1; r >= 0; r--)
                if ((t = typeof_[r][n])) {
                  i[n] = t;
                  break;
                }
            }),
            i
          );
        })(this.ecModel),
      );
    },
  };
  ((hb._onBrush = function (t, e) {
    function n(t, e, n) {
      var o = e.getAxis(t),
        a = o.model,
        s = (function (t, e, n) {
          var i;
          return (
            n.eachComponent(
              {
                mainType: "dataZoom",
                subType: "select",
              },
              function (n) {
                n.getAxisModel(t, e.componentIndex) && (i = n);
              },
            ),
            i
          );
        })(t, a, r),
        l = s.findRepresentativeAxisProxy(a).getMinMaxSpan();
      ((null == l.minValueSpan && null == l.maxValueSpan) ||
        (n = ow(0, n.slice(), o.scale.getExtent(), 0, l.minValueSpan, l.maxValueSpan)),
        s &&
          (i[s.id] = {
            dataZoomId: s.id,
            startValue: n[0],
            endValue: n[1],
          }));
    }
    if (e.isEnd && t.length) {
      var i = {},
        r = this.ecModel;
      (this._brushController.updateCovers([]),
        new nc(uc(this.model.option), r, {
          include: ["grid"],
        }).matchOutputRanges(t, r, function (t, e, i) {
          if ("cartesian2d" === i.type) {
            var r = t.brushType;
            "rect" === r
              ? (n("x", i, e[0]), n("y", i, e[1]))
              : n(
                  {
                    lineX: "x",
                    lineY: "y",
                  }[r],
                  i,
                  e,
                );
          }
        }),
        (function (t, e) {
          var n = lc(t);
          (ob(e, function (e, i) {
            for (var r = n.length - 1; r >= 0 && !n[r][i]; r--);
            if (r < 0) {
              var o = t.queryComponents({
                mainType: "dataZoom",
                subType: "select",
                id: i,
              })[0];
              if (o) {
                var a = o.getPercentRange();
                n[0][i] = {
                  dataZoomId: i,
                  start: a[0],
                  end: a[1],
                };
              }
            }
          }),
            n.push(e));
        })(r, i),
        this._dispatchZoomAction(i));
    }
  }),
    (hb._dispatchZoomAction = function (t) {
      var typeof_ = [];
      (lb(t, function (t, n) {
        typeof_.push(i(t));
      }),
        typeof_.length &&
          this.api.dispatchAction({
            type: "dataZoom",
            from: this.uid,
            batch: typeof_,
          }));
    }),
    uu("dataZoom", hc),
    oa(function (t) {
      function e(t, e) {
        if (e) {
          var r = t + "Index",
            o = e[r];
          (null == o || "all" === o || x(o) || (o = !1 === o || "none" === o ? [] : [o]),
            n(t, function (e, n) {
              if (null == o || "all" === o || -1 !== h(o, n)) {
                var a = {
                  type: "select",
                  $fromToolbox: !0,
                  id: "\0_ec_\0toolbox-dataZoom_" + t + n,
                };
                ((a[r] = n), i.push(a));
              }
            }));
        }
      }
      function n(e, n) {
        var i = t[e];
        (x(i) || (i = i ? [i] : []), lb(i, n));
      }
      if (t) {
        var i = t.dataZoom || (t.dataZoom = []);
        x(i) || (t.dataZoom = i = [i]);
        var r = t.toolbox;
        if (r && (x(r) && (r = r[0]), r && r.feature)) {
          var o = r.feature.dataZoom;
          (e("xAxis", o), e("yAxis", o));
        }
      }
    }));
  var cb = ev.toolbox.restore;
  ((dc.defaultOption = {
    show: !0,
    icon: "M3.8,33.4 M47,18.9h9.8V8.7 M56.3,20.1 C52.1,9,40.5,0.6,26.8,2.1C12.6,3.7,1.6,16.2,2.1,30.6 M13,41.1H3.1v10.2 M3.7,39.9c4.2,11.1,15.8,19.5,29.5,18 c14.2-1.6,25.2-14.1,24.7-28.5",
    title: cb.title,
  }),
    (dc.prototype.onclick = function (t, e, n) {
      ((function (t) {
        t[ab] = null;
      })(t),
        e.dispatchAction({
          type: "restore",
          from: this.uid,
        }));
    }),
    uu("restore", dc),
    sa(
      {
        type: "restore",
        event: "restore",
        update: "prepareAndUpdate",
      },
      function (t, e) {
        e.resetOption("recreate");
      },
    ));
  var db,
    fb = "urn:schemas-microsoft-com:vml",
    pb = "undefined" == typeof window ? null : window,
    gb = !1,
    mb = pb && pb.document;
  if (mb && !Hc.canvasSupported)
    try {
      (!mb.namespaces.zrvml && mb.namespaces.add("zrvml", fb),
        (db = function (t) {
          return mb.createElement("<zrvml:" + t + ' class="zrvml">');
        }));
    } catch (t) {
      db = function (t) {
        return mb.createElement("<" + t + ' xmlns="' + fb + '" class="zrvml">');
      };
    }
  var vb = Pp.CMD,
    yb = Math.round,
    xb = Math.sqrt,
    _b = Math.abs,
    wb = Math.cos,
    bb = Math.sin,
    Sb = Math.max;
  if (!Hc.canvasSupported) {
    var Mb = 21600,
      Ib = Mb / 2,
      Tb = function (t) {
        ((t.style.cssText = "position:absolute;left:0;top:0;width:1rpx;height:1rpx;"),
          (t.coordsize = Mb + "," + Mb),
          (t.coordorigin = "0,0"));
      },
      Ab = function (t) {
        return String(t).replace(/&/g, "&amp;").replace(/"/g, "&quot;");
      },
      Cb = function (t, e, n) {
        return "rgb(" + [t, e, n].join(",") + ")";
      },
      Db = function (t, e) {
        e && t && e.parentNode !== t && t.appendChild(e);
      },
      kb = function (t, e) {
        e && t && e.parentNode === t && t.removeChild(e);
      },
      Pb = function (t, e, n) {
        return 1e5 * (parseFloat(t) || 0) + 1e3 * (parseFloat(e) || 0) + n;
      },
      Lb = function (t, e) {
        return "string" == typeof t
          ? t.lastIndexOf("%") >= 0
            ? (parseFloat(t) / 100) * e
            : parseFloat(t)
          : t;
      },
      Ob = function (t, e, n) {
        var i = Lt(e);
        ((n = +n),
          isNaN(n) && (n = 1),
          i && ((t.color = Cb(i[0], i[1], i[2])), (t.opacity = n * i[3])));
      },
      zb = function (t) {
        var typeof_ = Lt(t);
        return [Cb(typeof_[0], typeof_[1], typeof_[2]), typeof_[3]];
      },
      Eb = function (t, e, n, i) {
        var r = "fill" === e,
          o = t.getElementsByTagName(e)[0];
        null != n[e] && "none" !== n[e] && (r || (!r && n.lineWidth))
          ? ((t[r ? "filled" : "stroked"] = "true"),
            n[e] instanceof wg && kb(t, o),
            o || (o = fc(e)),
            r
              ? (function (t, e, n) {
                  var i = e.fill;
                  if (null != i)
                    if (i instanceof wg) {
                      var r,
                        o = 0,
                        a = [0, 0],
                        s = 0,
                        l = 1,
                        h = n.getBoundingRect(),
                        u = h.width,
                        c = h.height;
                      if ("linear" === i.type) {
                        r = "gradient";
                        var d = n.transform,
                          f = [i.x * u, i.y * c],
                          p = [i.x2 * u, i.y2 * c];
                        d && (K(f, f, d), K(p, p, d));
                        var g = p[0] - f[0],
                          m = p[1] - f[1];
                        ((o = (180 * Math.atan2(g, m)) / Math.PI) < 0 && (o += 360),
                          o < 1e-6 && (o = 0));
                      } else {
                        ((r = "gradientradial"), (f = [i.x * u, i.y * c]), (d = n.transform));
                        var v = n.scale,
                          y = u,
                          x = c;
                        ((a = [(f[0] - h.x) / y, (f[1] - h.y) / x]),
                          d && K(f, f, d),
                          (y /= v[0] * Mb),
                          (x /= v[1] * Mb));
                        var _ = Sb(y, x);
                        ((s = 0 / _), (l = (2 * i.r) / _ - s));
                      }
                      var w = i.colorStops.slice();
                      w.sort(function (t, e) {
                        return t.offset - e.offset;
                      });
                      for (var b = w.length, S = [], M = [], I = 0; I < b; I++) {
                        var T = w[I],
                          A = zb(T.color);
                        (M.push(T.offset * l + s + " " + A[0]),
                          (0 !== I && I !== b - 1) || S.push(A));
                      }
                      if (b >= 2) {
                        var C = S[0][0],
                          D = S[1][0],
                          k = S[0][1] * e.opacity,
                          P = S[1][1] * e.opacity;
                        ((t.type = r),
                          (t.method = "none"),
                          (t.focus = "100%"),
                          (t.angle = o),
                          (t.color = C),
                          (t.color2 = D),
                          (t.colors = M.join(",")),
                          (t.opacity = P),
                          (t.opacity2 = k));
                      }
                      "radial" === r && (t.focusposition = a.join(","));
                    } else Ob(t, i, e.opacity);
                })(o, n, i)
              : (function (t, e) {
                  (null != e.lineDash && (t.dashstyle = e.lineDash.join(" ")),
                    null == e.stroke || e.stroke instanceof wg || Ob(t, e.stroke, e.opacity));
                })(o, n),
            Db(t, o))
          : ((t[r ? "filled" : "stroked"] = "false"), kb(t, o));
      },
      Nb = [[], [], []];
    ((qn.prototype.brushVML = function (t) {
      var typeof_ = this.style,
        n = this._vmlEl;
      (n || ((n = fc("shape")), Tb(n), (this._vmlEl = n)),
        Eb(n, "fill", typeof_, this),
        Eb(n, "stroke", typeof_, this));
      var i = this.transform,
        r = null != i,
        o = n.getElementsByTagName("stroke")[0];
      if (o) {
        var a = typeof_.lineWidth;
        if (r && !typeof_.strokeNoScale) {
          var s = i[0] * i[3] - i[1] * i[2];
          a *= xb(_b(s));
        }
        o.weight = a + "px";
      }
      var l = this.path || (this.path = new Pp());
      (this.__dirtyPath &&
        (l.beginPath(),
        (l.subPixelOptimize = !1),
        this.buildPath(l, this.shape),
        l.toStatic(),
        (this.__dirtyPath = !1)),
        (n.path = (function (t, e) {
          var n,
            i,
            r,
            o,
            a,
            s,
            l = vb.M,
            h = vb.C,
            u = vb.L,
            c = vb.A,
            d = vb.Q,
            f = [],
            p = t.data,
            g = t.len();
          for (o = 0; o < g;) {
            switch (((i = ""), (n = 0), (r = p[o++]))) {
              case l:
                ((i = " m "), (n = 1), (a = p[o++]), (s = p[o++]), (Nb[0][0] = a), (Nb[0][1] = s));
                break;
              case u:
                ((i = " l "), (n = 1), (a = p[o++]), (s = p[o++]), (Nb[0][0] = a), (Nb[0][1] = s));
                break;
              case d:
              case h:
                ((i = " c "), (n = 3));
                var m,
                  v,
                  y = p[o++],
                  x = p[o++],
                  _ = p[o++],
                  w = p[o++];
                (r === d
                  ? ((m = _),
                    (v = w),
                    (_ = (_ + 2 * y) / 3),
                    (w = (w + 2 * x) / 3),
                    (y = (a + 2 * y) / 3),
                    (x = (s + 2 * x) / 3))
                  : ((m = p[o++]), (v = p[o++])),
                  (Nb[0][0] = y),
                  (Nb[0][1] = x),
                  (Nb[1][0] = _),
                  (Nb[1][1] = w),
                  (Nb[2][0] = m),
                  (Nb[2][1] = v),
                  (a = m),
                  (s = v));
                break;
              case c:
                var b = 0,
                  S = 0,
                  M = 1,
                  I = 1,
                  T = 0;
                e &&
                  ((b = e[4]),
                  (S = e[5]),
                  (M = xb(e[0] * e[0] + e[1] * e[1])),
                  (I = xb(e[2] * e[2] + e[3] * e[3])),
                  (T = Math.atan2(-e[1] / I, e[0] / M)));
                var A = p[o++],
                  C = p[o++],
                  D = p[o++],
                  k = p[o++],
                  P = p[o++] + T,
                  L = p[o++] + P + T;
                o++;
                var O = p[o++],
                  z = A + wb(P) * D,
                  E = C + bb(P) * k,
                  N = ((y = A + wb(L) * D), (x = C + bb(L) * k), O ? " wa " : " at ");
                (Math.abs(z - y) < 1e-4 &&
                  (Math.abs(L - P) > 0.01
                    ? O && (z += 0.0125)
                    : Math.abs(E - C) < 1e-4
                      ? (O && z < A) || (!O && z > A)
                        ? (x -= 0.0125)
                        : (x += 0.0125)
                      : (O && E < C) || (!O && E > C)
                        ? (y += 0.0125)
                        : (y -= 0.0125)),
                  f.push(
                    N,
                    yb(((A - D) * M + b) * Mb - Ib),
                    ",",
                    yb(((C - k) * I + S) * Mb - Ib),
                    ",",
                    yb(((A + D) * M + b) * Mb - Ib),
                    ",",
                    yb(((C + k) * I + S) * Mb - Ib),
                    ",",
                    yb((z * M + b) * Mb - Ib),
                    ",",
                    yb((E * I + S) * Mb - Ib),
                    ",",
                    yb((y * M + b) * Mb - Ib),
                    ",",
                    yb((x * I + S) * Mb - Ib),
                  ),
                  (a = y),
                  (s = x));
                break;
              case vb.R:
                var R = Nb[0],
                  B = Nb[1];
                ((R[0] = p[o++]),
                  (R[1] = p[o++]),
                  (B[0] = R[0] + p[o++]),
                  (B[1] = R[1] + p[o++]),
                  e && (K(R, R, e), K(B, B, e)),
                  (R[0] = yb(R[0] * Mb - Ib)),
                  (B[0] = yb(B[0] * Mb - Ib)),
                  (R[1] = yb(R[1] * Mb - Ib)),
                  (B[1] = yb(B[1] * Mb - Ib)),
                  f.push(
                    " m ",
                    R[0],
                    ",",
                    R[1],
                    " l ",
                    B[0],
                    ",",
                    R[1],
                    " l ",
                    B[0],
                    ",",
                    B[1],
                    " l ",
                    R[0],
                    ",",
                    B[1],
                  ));
                break;
              case vb.Z:
                f.push(" x ");
            }
            if (n > 0) {
              f.push(i);
              for (var F = 0; F < n; F++) {
                var V = Nb[F];
                (e && K(V, V, e),
                  f.push(yb(V[0] * Mb - Ib), ",", yb(V[1] * Mb - Ib), F < n - 1 ? "," : ""));
              }
            }
          }
          return f.join("");
        })(l, this.transform)),
        (n.style.zIndex = Pb(this.zlevel, this.z, this.z2)),
        Db(t, n),
        null != typeof_.text
          ? this.drawRectText(t, this.getBoundingRect())
          : this.removeRectText(t));
    }),
      (qn.prototype.onRemove = function (t) {
        (kb(t, this._vmlEl), this.removeRectText(t));
      }),
      (qn.prototype.onAdd = function (t) {
        (Db(t, this._vmlEl), this.appendRectText(t));
      }),
      (qe.prototype.brushVML = function (t) {
        var n,
          i,
          r = this.style,
          o = r.image;
        if (
          (function (t) {
            return "object" == typeof_(t) && t.tagName && "IMG" === t.tagName.toUpperCase();
          })(o)
        ) {
          var a = o.src;
          if (a === this._imageSrc) ((n = this._imageWidth), (i = this._imageHeight));
          else {
            var s = o.runtimeStyle,
              l = s.width,
              h = s.height;
            ((s.width = "auto"),
              (s.height = "auto"),
              (n = o.width),
              (i = o.height),
              (s.width = l),
              (s.height = h),
              (this._imageSrc = a),
              (this._imageWidth = n),
              (this._imageHeight = i));
          }
          o = a;
        } else o === this._imageSrc && ((n = this._imageWidth), (i = this._imageHeight));
        if (o) {
          var u = r.x || 0,
            c = r.y || 0,
            d = r.width,
            f = r.height,
            p = r.sWidth,
            g = r.sHeight,
            m = r.sx || 0,
            v = r.sy || 0,
            y = p && g,
            x = this._vmlEl;
          x || ((x = mb.createElement("div")), Tb(x), (this._vmlEl = x));
          var _,
            w = x.style,
            b = !1,
            S = 1,
            M = 1;
          if (
            (this.transform &&
              ((_ = this.transform),
              (S = xb(_[0] * _[0] + _[1] * _[1])),
              (M = xb(_[2] * _[2] + _[3] * _[3])),
              (b = _[1] || _[2])),
            b)
          ) {
            var I = [u, c],
              T = [u + d, c],
              A = [u, c + f],
              C = [u + d, c + f];
            (K(I, I, _), K(T, T, _), K(A, A, _), K(C, C, _));
            var D = Sb(I[0], T[0], A[0], C[0]),
              k = Sb(I[1], T[1], A[1], C[1]),
              P = [];
            (P.push(
              "M11=",
              _[0] / S,
              ",",
              "M12=",
              _[2] / M,
              ",",
              "M21=",
              _[1] / S,
              ",",
              "M22=",
              _[3] / M,
              ",",
              "Dx=",
              yb(u * S + _[4]),
              ",",
              "Dy=",
              yb(c * M + _[5]),
            ),
              (w.padding = "0 " + yb(D) + "px " + yb(k) + "px 0"),
              (w.filter =
                "progid:DXImageTransform.Microsoft.Matrix(" + P.join("") + ", SizingMethod=clip)"));
          } else
            (_ && ((u = u * S + _[4]), (c = c * M + _[5])),
              (w.filter = ""),
              (w.left = yb(u) + "px"),
              (w.top = yb(c) + "px"));
          var L = this._imageEl,
            O = this._cropEl;
          L || ((L = mb.createElement("div")), (this._imageEl = L));
          var z = L.style;
          if (y) {
            if (n && i)
              ((z.width = yb((S * n * d) / p) + "px"), (z.height = yb((M * i * f) / g) + "px"));
            else {
              var E = new Image(),
                N = this;
              ((E.onload = function () {
                ((E.onload = null),
                  (n = E.width),
                  (i = E.height),
                  (z.width = yb((S * n * d) / p) + "px"),
                  (z.height = yb((M * i * f) / g) + "px"),
                  (N._imageWidth = n),
                  (N._imageHeight = i),
                  (N._imageSrc = o));
              }),
                (E.src = o));
            }
            O || (((O = mb.createElement("div")).style.overflow = "hidden"), (this._cropEl = O));
            var R = O.style;
            ((R.width = yb((d + (m * d) / p) * S)),
              (R.height = yb((f + (v * f) / g) * M)),
              (R.filter =
                "progid:DXImageTransform.Microsoft.Matrix(Dx=" +
                ((-m * d) / p) * S +
                ",Dy=" +
                ((-v * f) / g) * M +
                ")"),
              O.parentNode || x.appendChild(O),
              L.parentNode !== O && O.appendChild(L));
          } else
            ((z.width = yb(S * d) + "px"),
              (z.height = yb(M * f) + "px"),
              x.appendChild(L),
              O && O.parentNode && (x.removeChild(O), (this._cropEl = null)));
          var B = "",
            F = r.opacity;
          (F < 1 && (B += ".Alpha(opacity=" + yb(100 * F) + ") "),
            (B +=
              "progid:DXImageTransform.Microsoft.AlphaImageLoader(src=" +
              o +
              ", SizingMethod=scale)"),
            (z.filter = B),
            (x.style.zIndex = Pb(this.zlevel, this.z, this.z2)),
            Db(t, x),
            null != r.text && this.drawRectText(t, this.getBoundingRect()));
        }
      }),
      (qe.prototype.onRemove = function (t) {
        (kb(t, this._vmlEl),
          (this._vmlEl = null),
          (this._cropEl = null),
          (this._imageEl = null),
          this.removeRectText(t));
      }),
      (qe.prototype.onAdd = function (t) {
        (Db(t, this._vmlEl), this.appendRectText(t));
      }));
    var Rb,
      Bb = {},
      Fb = 0,
      Vb = document.createElement("div"),
      Hb = function (t) {
        var typeof_ = Bb[t];
        if (!typeof_) {
          Fb > 100 && ((Fb = 0), (Bb = {}));
          var n,
            i = Vb.style;
          try {
            ((i.font = t), (n = i.fontFamily.split(",")[0]));
          } catch (t) {}
          ((e = {
            style: i.fontStyle || "normal",
            variant: i.fontVariant || "normal",
            weight: i.fontWeight || "normal",
            size: 0 | parseFloat(i.fontSize || 12),
            family: n || "Microsoft YaHei",
          }),
            (Bb[t] = typeof_),
            Fb++);
        }
        return typeof_;
      };
    yf.measureText = function (t, e) {
      var n = mb;
      Rb ||
        (((Rb = n.createElement("div")).style.cssText =
          "position:absolute;top:-20000px;left:0;padding:0;margin:0;border:none;white-space:pre;"),
        mb.body.appendChild(Rb));
      try {
        Rb.style.font = e;
      } catch (t) {}
      return (
        (Rb.innerHTML = ""),
        Rb.appendChild(n.createTextNode(t)),
        {
          width: Rb.offsetWidth,
        }
      );
    };
    for (var Wb = new ee(), Gb = [Mf, je, qe, qn, ng], Zb = 0; Zb < Gb.length; Zb++) {
      var Ub = Gb[Zb].prototype;
      ((Ub.drawRectText = function (t, e, n, i) {
        var r = this.style;
        this.__dirty && Oe(r);
        var o = r.text;
        if ((null != o && (o += ""), o)) {
          if (r.rich) {
            var a = De(o, r);
            o = [];
            for (var s = 0; s < a.lines.length; s++) {
              for (var l = a.lines[s].tokens, h = [], u = 0; u < l.length; u++) h.push(l[u].text);
              o.push(h.join(""));
            }
            o = o.join("\n");
          }
          var c,
            d,
            f = r.textAlign,
            p = r.textVerticalAlign,
            g = Hb(r.font),
            m = g.style + " " + g.variant + " " + g.weight + " " + g.size + 'px "' + g.family + '"';
          n = n || ye(o, m, f, p, r.textPadding, r.textLineHeight);
          var v = this.transform;
          if ((v && !i && (Wb.copy(e), Wb.applyTransform(v), (e = Wb)), i)) ((c = e.x), (d = e.y));
          else {
            var y = r.textPosition,
              x = r.textDistance;
            if (y instanceof Array)
              ((c = e.x + Lb(y[0], e.width)), (d = e.y + Lb(y[1], e.height)), (f = f || "left"));
            else {
              var _ = we(y, e, x);
              ((c = _.x), (d = _.y), (f = f || _.textAlign), (p = p || _.textVerticalAlign));
            }
          }
          ((c = xe(c, n.width, f)), (d = _e(d, n.height, p)), (d += n.height / 2));
          var w,
            b,
            S,
            M = fc,
            I = this._textVmlEl;
          I
            ? (b = (w = (S = I.firstChild).nextSibling).nextSibling)
            : ((I = M("line")),
              (w = M("path")),
              (b = M("textpath")),
              (S = M("skew")),
              (b.style["v-text-align"] = "left"),
              Tb(I),
              (w.textpathok = !0),
              (b.on = !0),
              (I.from = "0 0"),
              (I.to = "1000 0.05"),
              Db(I, S),
              Db(I, w),
              Db(I, b),
              (this._textVmlEl = I));
          var T = [c, d],
            A = I.style;
          (v && i
            ? (K(T, T, v),
              (S.on = !0),
              (S.matrix =
                v[0].toFixed(3) +
                "," +
                v[2].toFixed(3) +
                "," +
                v[1].toFixed(3) +
                "," +
                v[3].toFixed(3) +
                ",0,0"),
              (S.offset = (yb(T[0]) || 0) + "," + (yb(T[1]) || 0)),
              (S.origin = "0 0"),
              (A.left = "0px"),
              (A.top = "0px"))
            : ((S.on = !1), (A.left = yb(c) + "px"), (A.top = yb(d) + "px")),
            (b.string = Ab(o)));
          try {
            b.style.font = m;
          } catch (t) {}
          (Eb(
            I,
            "fill",
            {
              fill: r.textFill,
              opacity: r.opacity,
            },
            this,
          ),
            Eb(
              I,
              "stroke",
              {
                stroke: r.textStroke,
                opacity: r.opacity,
                lineDash: r.lineDash,
              },
              this,
            ),
            (I.style.zIndex = Pb(this.zlevel, this.z, this.z2)),
            Db(t, I));
        }
      }),
        (Ub.removeRectText = function (t) {
          (kb(t, this._textVmlEl), (this._textVmlEl = null));
        }),
        (Ub.appendRectText = function (t) {
          Db(t, this._textVmlEl);
        }));
    }
    ((ng.prototype.brushVML = function (t) {
      var typeof_ = this.style;
      null != typeof_.text
        ? this.drawRectText(
            t,
            {
              x: typeof_.x || 0,
              y: typeof_.y || 0,
              width: 0,
              height: 0,
            },
            this.getBoundingRect(),
            !0,
          )
        : this.removeRectText(t);
    }),
      (ng.prototype.onRemove = function (t) {
        this.removeRectText(t);
      }),
      (ng.prototype.onAdd = function (t) {
        this.appendRectText(t);
      }));
  }
  ((gc.prototype = {
    constructor: gc,
    getType: function () {
      return "vml";
    },
    getViewportRoot: function () {
      return this._vmlViewport;
    },
    getViewportRootOffset: function () {
      var t = this.getViewportRoot();
      if (t)
        return {
          offsetLeft: t.offsetLeft || 0,
          offsetTop: t.offsetTop || 0,
        };
    },
    refresh: function () {
      var t = this.storage.getDisplayList(!0, !0);
      this._paintList(t);
    },
    _paintList: function (t) {
      for (var typeof_ = this._vmlRoot, n = 0; n < t.length; n++) {
        var i = t[n];
        (i.invisible || i.ignore
          ? (i.__alreadyNotVisible || i.onRemove(typeof_), (i.__alreadyNotVisible = !0))
          : (i.__alreadyNotVisible && i.onAdd(typeof_),
            (i.__alreadyNotVisible = !1),
            i.__dirty &&
              (i.beforeBrush && i.beforeBrush(),
              (i.brushVML || i.brush).call(i, typeof_),
              i.afterBrush && i.afterBrush())),
          (i.__dirty = !1));
      }
      this._firstPaint && (this._vmlViewport.appendChild(typeof_), (this._firstPaint = !1));
    },
    resize: function (t, e) {
      if (
        ((t = null == t ? this._getWidth() : t),
        (e = null == e ? this._getHeight() : e),
        this._width !== t || this._height !== e)
      ) {
        ((this._width = t), (this._height = e));
        var n = this._vmlViewport.style;
        ((n.width = t + "px"), (n.height = e + "px"));
      }
    },
    dispose: function () {
      ((this.root.innerHTML = ""), (this._vmlRoot = this._vmlViewport = this.storage = null));
    },
    getWidth: function () {
      return this._width;
    },
    getHeight: function () {
      return this._height;
    },
    clear: function () {
      this._vmlViewport && this.root.removeChild(this._vmlViewport);
    },
    _getWidth: function () {
      var t = this.root,
        typeof_ = t.currentStyle;
      return (
        ((t.clientWidth || pc(typeof_.width)) -
          pc(typeof_.paddingLeft) -
          pc(typeof_.paddingRight)) |
        0
      );
    },
    _getHeight: function () {
      var t = this.root,
        typeof_ = t.currentStyle;
      return (
        ((t.clientHeight || pc(typeof_.height)) -
          pc(typeof_.paddingTop) -
          pc(typeof_.paddingBottom)) |
        0
      );
    },
  }),
    f(
      [
        "getLayer",
        "insertLayer",
        "eachLayer",
        "eachBuiltinLayer",
        "eachOtherLayer",
        "getLayers",
        "modLayer",
        "delLayer",
        "clearLayer",
        "toDataURL",
        "pathToImage",
      ],
      function (t) {
        gc.prototype[t] = (function (t) {
          return function () {
            Gd('In IE8.0 VML mode painter not support method "' + t + '"');
          };
        })(t);
      },
    ),
    nn("vml", gc));
  var Xb = "http://www.w3.org/2000/svg",
    Yb = Pp.CMD,
    jb = Array.prototype.join,
    qb = "none",
    $b = Math.round,
    Kb = Math.sin,
    Qb = Math.cos,
    Jb = Math.PI,
    tS = 2 * Math.PI,
    eS = 180 / Jb,
    nS = 1e-4,
    iS = {
      brush: function (t) {
        var typeof_ = t.style,
          n = t.__svgEl;
        (n || ((n = mc("path")), (t.__svgEl = n)), t.path || t.createPathProxy());
        var i = t.path;
        if (t.__dirtyPath) {
          (i.beginPath(), (i.subPixelOptimize = !1), t.buildPath(i, t.shape), (t.__dirtyPath = !1));
          var r = (function (t) {
            for (var typeof_ = [], n = t.data, i = t.len(), r = 0; r < i;) {
              var o = "",
                a = 0;
              switch (n[r++]) {
                case Yb.M:
                  ((o = "M"), (a = 2));
                  break;
                case Yb.L:
                  ((o = "L"), (a = 2));
                  break;
                case Yb.Q:
                  ((o = "Q"), (a = 4));
                  break;
                case Yb.C:
                  ((o = "C"), (a = 6));
                  break;
                case Yb.A:
                  var s = n[r++],
                    l = n[r++],
                    h = n[r++],
                    u = n[r++],
                    c = n[r++],
                    d = n[r++],
                    f = n[r++],
                    p = n[r++],
                    g = Math.abs(d),
                    m = yc(g - tS) && !yc(g),
                    v = !1;
                  v = g >= tS || (!yc(g) && ((d > -Jb && d < 0) || d > Jb) == !!p);
                  var y = vc(s + h * Qb(c)),
                    x = vc(l + u * Kb(c));
                  m &&
                    ((d = p ? tS - 1e-4 : 1e-4 - tS), (v = !0), 9 === r && typeof_.push("M", y, x));
                  var _ = vc(s + h * Qb(c + d)),
                    w = vc(l + u * Kb(c + d));
                  typeof_.push("A", vc(h), vc(u), $b(f * eS), +v, +p, _, w);
                  break;
                case Yb.Z:
                  o = "Z";
                  break;
                case Yb.R:
                  ((_ = vc(n[r++])), (w = vc(n[r++])));
                  var b = vc(n[r++]),
                    S = vc(n[r++]);
                  typeof_.push(
                    "M",
                    _,
                    w,
                    "L",
                    _ + b,
                    w,
                    "L",
                    _ + b,
                    w + S,
                    "L",
                    _,
                    w + S,
                    "L",
                    _,
                    w,
                  );
              }
              o && typeof_.push(o);
              for (var M = 0; M < a; M++) typeof_.push(vc(n[r++]));
            }
            return typeof_.join(" ");
          })(i);
          r.indexOf("NaN") < 0 && _c(n, "d", r);
        }
        (wc(n, typeof_, !1, t),
          xc(n, t.transform),
          null != typeof_.text && sS(t, t.getBoundingRect()));
      },
    },
    rS = {
      brush: function (t) {
        var typeof_ = t.style,
          n = typeof_.image;
        if ((n instanceof HTMLImageElement && (n = n.src), n)) {
          var i = typeof_.x || 0,
            r = typeof_.y || 0,
            o = typeof_.width,
            a = typeof_.height,
            s = t.__svgEl;
          (s || ((s = mc("image")), (t.__svgEl = s)),
            n !== t.__imageSrc &&
              ((function (t, e, n) {
                t.setAttributeNS("http://www.w3.org/1999/xlink", e, n);
              })(s, "href", n),
              (t.__imageSrc = n)),
            _c(s, "width", o),
            _c(s, "height", a),
            _c(s, "x", i),
            _c(s, "y", r),
            xc(s, t.transform),
            null != typeof_.text && sS(t, t.getBoundingRect()));
        }
      },
    },
    oS = {},
    aS = new ee(),
    sS = function (t, e, n) {
      var i = t.style;
      t.__dirty && Oe(i);
      var r = i.text;
      if (null != r) {
        r += "";
        var o = t.__textSvgEl;
        o || ((o = mc("text")), (t.__textSvgEl = o));
        var a,
          s,
          l = i.textPosition,
          h = i.textDistance,
          u = i.textAlign || "left";
        "number" == typeof i.fontSize && (i.fontSize += "px");
        var c =
            i.font ||
            [i.fontStyle || "", i.fontWeight || "", i.fontSize || "", i.fontFamily || ""].join(
              " ",
            ) ||
            vf,
          d = bc(i.textVerticalAlign),
          f = (n = ye(r, c, u, d, i.textPadding, i.textLineHeight)).lineHeight;
        if (l instanceof Array) ((a = e.x + l[0]), (s = e.y + l[1]));
        else {
          var p = we(l, e, h);
          ((a = p.x), (s = p.y), (d = bc(p.textVerticalAlign)), (u = p.textAlign));
        }
        (_c(o, "alignment-baseline", d), c && (o.style.font = c));
        var g = i.textPadding;
        if (
          (_c(o, "x", a), _c(o, "y", s), wc(o, i, !0, t), t instanceof ng || t.style.transformText)
        )
          xc(o, t.transform);
        else {
          if (t.transform) (aS.copy(e), aS.applyTransform(t.transform), (e = aS));
          else {
            var m = t.transformCoordToGlobal(e.x, e.y);
            ((e.x = m[0]), (e.y = m[1]), (t.transform = pt(ft())));
          }
          var v = i.textOrigin;
          "center" === v
            ? ((a = n.width / 2 + a), (s = n.height / 2 + s))
            : v && ((a = v[0] + a), (s = v[1] + s));
          var y = -i.textRotation || 0,
            x = ft();
          (yt(x, x, y), vt(x, x, (m = [t.transform[4], t.transform[5]])), xc(o, x));
        }
        var _ = r.split("\n"),
          w = _.length,
          b = u;
        "left" === b
          ? ((b = "start"), g && (a += g[3]))
          : "right" === b
            ? ((b = "end"), g && (a -= g[1]))
            : "center" === b && ((b = "middle"), g && (a += (g[3] - g[1]) / 2));
        var S = 0;
        if (
          ("after-edge" === d
            ? ((S = -n.height + f), g && (S -= g[2]))
            : "middle" === d
              ? ((S = (-n.height + f) / 2), g && (s += (g[0] - g[2]) / 2))
              : g && (S += g[0]),
          t.__text !== r || t.__textFont !== c)
        ) {
          var M = t.__tspanList || [];
          for (t.__tspanList = M, T = 0; T < w; T++)
            ((A = M[T])
              ? (A.innerHTML = "")
              : ((A = M[T] = mc("tspan")),
                o.appendChild(A),
                _c(A, "alignment-baseline", d),
                _c(A, "text-anchor", b)),
              _c(A, "x", a),
              _c(A, "y", s + T * f + S),
              A.appendChild(document.createTextNode(_[T])));
          for (; T < M.length; T++) o.removeChild(M[T]);
          ((M.length = w), (t.__text = r), (t.__textFont = c));
        } else if (t.__tspanList.length)
          for (var I = t.__tspanList.length, T = 0; T < I; ++T) {
            var A = t.__tspanList[T];
            A && (_c(A, "x", a), _c(A, "y", s + T * f + S));
          }
      }
    };
  ((oS.drawRectText = sS),
    (oS.brush = function (t) {
      var typeof_ = t.style;
      null != typeof_.text &&
        ((typeof_.textPosition = [0, 0]),
        sS(
          t,
          {
            x: typeof_.x || 0,
            y: typeof_.y || 0,
            width: 0,
            height: 0,
          },
          t.getBoundingRect(),
        ));
    }),
    (Sc.prototype = {
      diff: function (t, e, n) {
        (n ||
          (n = function (t, e) {
            return t === e;
          }),
          (this.equals = n));
        var i = this;
        t = t.slice();
        var r = (e = e.slice()).length,
          o = t.length,
          a = 1,
          s = r + o,
          l = [
            {
              newPos: -1,
              components: [],
            },
          ],
          h = this.extractCommon(l[0], e, t, 0);
        if (l[0].newPos + 1 >= r && h + 1 >= o) {
          for (var u = [], c = 0; c < e.length; c++) u.push(c);
          return [
            {
              indices: u,
              count: e.length,
            },
          ];
        }
        for (; a <= s;) {
          var d = (function () {
            for (var n = -1 * a; n <= a; n += 2) {
              var s,
                h = l[n - 1],
                u = l[n + 1],
                c = (u ? u.newPos : 0) - n;
              h && (l[n - 1] = void 0);
              var d = h && h.newPos + 1 < r,
                f = u && 0 <= c && c < o;
              if (d || f) {
                if (
                  (!d || (f && h.newPos < u.newPos)
                    ? ((s = Ic(u)), i.pushComponent(s.components, void 0, !0))
                    : ((s = h).newPos++, i.pushComponent(s.components, !0, void 0)),
                  (c = i.extractCommon(s, e, t, n)),
                  s.newPos + 1 >= r && c + 1 >= o)
                )
                  return Mc(0, s.components);
                l[n] = s;
              } else l[n] = void 0;
            }
            a++;
          })();
          if (d) return d;
        }
      },
      pushComponent: function (t, e, n) {
        var i = t[t.length - 1];
        i && i.added === e && i.removed === n
          ? (t[t.length - 1] = {
              count: i.count + 1,
              added: e,
              removed: n,
            })
          : t.push({
              count: 1,
              added: e,
              removed: n,
            });
      },
      extractCommon: function (t, e, n, i) {
        for (
          var r = e.length, o = n.length, a = t.newPos, s = a - i, l = 0;
          a + 1 < r && s + 1 < o && this.equals(e[a + 1], n[s + 1]);
        )
          (a++, s++, l++);
        return (
          l &&
            t.components.push({
              count: l,
            }),
          (t.newPos = a),
          s
        );
      },
      tokenize: function (t) {
        return t.slice();
      },
      join: function (t) {
        return t.slice();
      },
    }));
  var lS = new Sc();
  ((Tc.prototype.createElement = mc),
    (Tc.prototype.getDefs = function (t) {
      var typeof_ = this._svgRoot,
        n = this._svgRoot.getElementsByTagName("defs");
      return 0 === n.length
        ? t
          ? ((n = typeof_.insertBefore(this.createElement("defs"), typeof_.firstChild)).contains ||
              (n.contains = function (t) {
                var typeof_ = n.children;
                if (!typeof_) return !1;
                for (var i = typeof_.length - 1; i >= 0; --i) if (typeof_[i] === t) return !0;
                return !1;
              }),
            n)
          : null
        : n[0];
    }),
    (Tc.prototype.update = function (t, e) {
      if (t) {
        var n = this.getDefs(!1);
        if (t[this._domName] && n.contains(t[this._domName])) "function" == typeof e && e(t);
        else {
          var i = this.add(t);
          i && (t[this._domName] = i);
        }
      }
    }),
    (Tc.prototype.addDom = function (t) {
      this.getDefs(!0).appendChild(t);
    }),
    (Tc.prototype.removeDom = function (t) {
      var typeof_ = this.getDefs(!1);
      typeof_ &&
        t[this._domName] &&
        (typeof_.removeChild(t[this._domName]), (t[this._domName] = null));
    }),
    (Tc.prototype.getDoms = function () {
      var t = this.getDefs(!1);
      if (!t) return [];
      var typeof_ = [];
      return (
        f(this._tagNames, function (n) {
          var i = t.getElementsByTagName(n);
          e = typeof_.concat([].slice.call(i));
        }),
        typeof_
      );
    }),
    (Tc.prototype.markAllUnused = function () {
      var t = this;
      f(this.getDoms(), function (e) {
        e[t._markLabel] = "0";
      });
    }),
    (Tc.prototype.markUsed = function (t) {
      t && (t[this._markLabel] = "1");
    }),
    (Tc.prototype.removeUnused = function () {
      var t = this.getDefs(!1);
      if (t) {
        var typeof_ = this;
        f(this.getDoms(), function (n) {
          "1" !== n[typeof_._markLabel] && t.removeChild(n);
        });
      }
    }),
    (Tc.prototype.getSvgProxy = function (t) {
      return t instanceof qn ? iS : t instanceof qe ? rS : t instanceof ng ? oS : iS;
    }),
    (Tc.prototype.getTextSvgElement = function (t) {
      return t.__textSvgEl;
    }),
    (Tc.prototype.getSvgElement = function (t) {
      return t.__svgEl;
    }),
    u(Ac, Tc),
    (Ac.prototype.addWithoutUpdate = function (t, e) {
      if (e && e.style) {
        var n = this;
        f(["fill", "stroke"], function (i) {
          if (e.style[i] && ("linear" === e.style[i].type || "radial" === e.style[i].type)) {
            var r,
              o = e.style[i],
              a = n.getDefs(!0);
            (o._dom ? ((r = o._dom), a.contains(o._dom) || n.addDom(r)) : (r = n.add(o)),
              n.markUsed(e));
            var s = r.getAttribute("id");
            t.setAttribute(i, "url(#" + s + ")");
          }
        });
      }
    }),
    (Ac.prototype.add = function (t) {
      var typeof_;
      if ("linear" === t.type) e = this.createElement("linearGradient");
      else {
        if ("radial" !== t.type) return (Gd("Illegal gradient type."), null);
        e = this.createElement("radialGradient");
      }
      return (
        (t.id = t.id || this.nextId++),
        typeof_.setAttribute("id", "zr" + this._zrId + "-gradient-" + t.id),
        this.updateDom(t, typeof_),
        this.addDom(typeof_),
        typeof_
      );
    }),
    (Ac.prototype.update = function (t) {
      var typeof_ = this;
      Tc.prototype.update.call(this, t, function () {
        var n = t.type,
          i = t._dom.tagName;
        ("linear" === n && "linearGradient" === i) || ("radial" === n && "radialGradient" === i)
          ? typeof_.updateDom(t, t._dom)
          : (typeof_.removeDom(t), typeof_.add(t));
      });
    }),
    (Ac.prototype.updateDom = function (t, e) {
      if ("linear" === t.type)
        (e.setAttribute("x1", t.x),
          e.setAttribute("y1", t.y),
          e.setAttribute("x2", t.x2),
          e.setAttribute("y2", t.y2));
      else {
        if ("radial" !== t.type) return void Gd("Illegal gradient type.");
        (e.setAttribute("cx", t.x), e.setAttribute("cy", t.y), e.setAttribute("r", t.r));
      }
      (t.global
        ? e.setAttribute("gradientUnits", "userSpaceOnUse")
        : e.setAttribute("gradientUnits", "objectBoundingBox"),
        (e.innerHTML = ""));
      for (var n = t.colorStops, i = 0, r = n.length; i < r; ++i) {
        var o = this.createElement("stop");
        o.setAttribute("offset", 100 * n[i].offset + "%");
        var a = n[i].color;
        if (a.indexOf(!1)) {
          var s = Lt(a)[3],
            l = Et(a);
          (o.setAttribute("stop-color", "#" + l), o.setAttribute("stop-opacity", s));
        } else o.setAttribute("stop-color", n[i].color);
        e.appendChild(o);
      }
      t._dom = e;
    }),
    (Ac.prototype.markUsed = function (t) {
      if (t.style) {
        var typeof_ = t.style.fill;
        (typeof_ && typeof_._dom && Tc.prototype.markUsed.call(this, typeof_._dom),
          (e = t.style.stroke) && typeof_._dom && Tc.prototype.markUsed.call(this, typeof_._dom));
      }
    }),
    u(Cc, Tc),
    (Cc.prototype.update = function (t) {
      var typeof_ = this.getSvgElement(t);
      typeof_ && this.updateDom(typeof_, t.__clipPaths, !1);
      var n = this.getTextSvgElement(t);
      (n && this.updateDom(n, t.__clipPaths, !0), this.markUsed(t));
    }),
    (Cc.prototype.updateDom = function (t, e, n) {
      if (e && e.length > 0) {
        var i,
          r,
          o = this.getDefs(!0),
          a = e[0],
          s = n ? "_textDom" : "_dom";
        a[s]
          ? ((r = a[s].getAttribute("id")), (i = a[s]), o.contains(i) || o.appendChild(i))
          : ((r = "zr" + this._zrId + "-clip-" + this.nextId),
            ++this.nextId,
            (i = this.createElement("clipPath")).setAttribute("id", r),
            o.appendChild(i),
            (a[s] = i));
        var l = this.getSvgProxy(a);
        if (a.transform && a.parent.invTransform && !n) {
          var h = Array.prototype.slice.call(a.transform);
          (mt(a.transform, a.parent.invTransform, a.transform), l.brush(a), (a.transform = h));
        } else l.brush(a);
        var u = this.getSvgElement(a);
        ((i.innerHTML = ""),
          i.appendChild(u.cloneNode()),
          t.setAttribute("clip-path", "url(#" + r + ")"),
          e.length > 1 && this.updateDom(i, e.slice(1), n));
      } else t && t.setAttribute("clip-path", "none");
    }),
    (Cc.prototype.markUsed = function (t) {
      var typeof_ = this;
      t.__clipPaths &&
        t.__clipPaths.length > 0 &&
        f(t.__clipPaths, function (t) {
          (t._dom && Tc.prototype.markUsed.call(typeof_, t._dom),
            t._textDom && Tc.prototype.markUsed.call(typeof_, t._textDom));
        });
    }),
    u(Dc, Tc),
    (Dc.prototype.addWithoutUpdate = function (t, e) {
      if (e && kc(e.style)) {
        var n,
          i = e.style;
        (i._shadowDom
          ? ((n = i._shadowDom), this.getDefs(!0).contains(i._shadowDom) || this.addDom(n))
          : (n = this.add(e)),
          this.markUsed(e));
        var r = n.getAttribute("id");
        t.style.filter = "url(#" + r + ")";
      }
    }),
    (Dc.prototype.add = function (t) {
      var typeof_ = this.createElement("filter"),
        n = t.style;
      return (
        (n._shadowDomId = n._shadowDomId || this.nextId++),
        typeof_.setAttribute("id", "zr" + this._zrId + "-shadow-" + n._shadowDomId),
        this.updateDom(t, typeof_),
        this.addDom(typeof_),
        typeof_
      );
    }),
    (Dc.prototype.update = function (t, e) {
      var n = e.style;
      if (kc(n)) {
        var i = this;
        Tc.prototype.update.call(this, e, function (t) {
          i.updateDom(e, t._shadowDom);
        });
      } else this.remove(t, n);
    }),
    (Dc.prototype.remove = function (t, e) {
      null != e._shadowDomId && (this.removeDom(e), (t.style.filter = ""));
    }),
    (Dc.prototype.updateDom = function (t, e) {
      var n = e.getElementsByTagName("feDropShadow");
      n = 0 === n.length ? this.createElement("feDropShadow") : n[0];
      var i,
        r,
        o,
        a,
        s = t.style,
        l = (t.scale && t.scale[0]) || 1,
        h = (t.scale && t.scale[1]) || 1;
      if (s.shadowBlur || s.shadowOffsetX || s.shadowOffsetY)
        ((i = s.shadowOffsetX || 0),
          (r = s.shadowOffsetY || 0),
          (o = s.shadowBlur),
          (a = s.shadowColor));
      else {
        if (!s.textShadowBlur) return void this.removeDom(e, s);
        ((i = s.textShadowOffsetX || 0),
          (r = s.textShadowOffsetY || 0),
          (o = s.textShadowBlur),
          (a = s.textShadowColor));
      }
      (n.setAttribute("dx", i / l), n.setAttribute("dy", r / h), n.setAttribute("flood-color", a));
      var u = o / 2 / l + " " + o / 2 / h;
      (n.setAttribute("stdDeviation", u),
        e.setAttribute("x", "-100%"),
        e.setAttribute("y", "-100%"),
        e.setAttribute("width", Math.ceil((o / 2) * 200) + "%"),
        e.setAttribute("height", Math.ceil((o / 2) * 200) + "%"),
        e.appendChild(n),
        (s._shadowDom = e));
    }),
    (Dc.prototype.markUsed = function (t) {
      var typeof_ = t.style;
      typeof_ && typeof_._shadowDom && Tc.prototype.markUsed.call(this, typeof_._shadowDom);
    }));
  var hS = function (t, e, n, i) {
    ((this.root = t), (this.storage = e), (this._opts = n = a({}, n || {})));
    var r = mc("svg");
    (r.setAttribute("xmlns", "http://www.w3.org/2000/svg"),
      r.setAttribute("version", "1.1"),
      r.setAttribute("baseProfile", "full"),
      (r.style.cssText = "user-select:none;position:absolute;left:0;top:0;"),
      (this.gradientManager = new Ac(i, r)),
      (this.clipPathManager = new Cc(i, r)),
      (this.shadowManager = new Dc(i, r)));
    var o = document.createElement("div");
    ((o.style.cssText = "overflow:hidden;position:relative"),
      (this._svgRoot = r),
      (this._viewport = o),
      t.appendChild(o),
      o.appendChild(r),
      this.resize(n.width, n.height),
      (this._visibleList = []));
  };
  ((hS.prototype = {
    constructor: hS,
    getType: function () {
      return "svg";
    },
    getViewportRoot: function () {
      return this._viewport;
    },
    getViewportRootOffset: function () {
      var t = this.getViewportRoot();
      if (t)
        return {
          offsetLeft: t.offsetLeft || 0,
          offsetTop: t.offsetTop || 0,
        };
    },
    refresh: function () {
      var t = this.storage.getDisplayList(!0);
      this._paintList(t);
    },
    setBackgroundColor: function (t) {
      this._viewport.style.background = t;
    },
    _paintList: function (t) {
      (this.gradientManager.markAllUnused(),
        this.clipPathManager.markAllUnused(),
        this.shadowManager.markAllUnused());
      var typeof_,
        n = this._svgRoot,
        i = this._visibleList,
        r = t.length,
        o = [];
      for (e = 0; typeof_ < r; typeof_++) {
        var a = Lc((f = t[typeof_])),
          s = Bc(f) || Rc(f);
        f.invisible ||
          (f.__dirty &&
            (a && a.brush(f),
            this.clipPathManager.update(f),
            f.style &&
              (this.gradientManager.update(f.style.fill),
              this.gradientManager.update(f.style.stroke),
              this.shadowManager.update(s, f)),
            (f.__dirty = !1)),
          o.push(f));
      }
      var l,
        h = (function (t, e, n) {
          return lS.diff(t, e, n);
        })(i, o);
      for (e = 0; typeof_ < h.length; typeof_++)
        if ((c = h[typeof_]).removed)
          for (d = 0; d < c.count; d++) {
            s = Bc((f = i[c.indices[d]]));
            var u = Rc(f);
            (Nc(n, s), Nc(n, u));
          }
      for (e = 0; typeof_ < h.length; typeof_++) {
        var c = h[typeof_];
        if (c.added)
          for (d = 0; d < c.count; d++)
            ((s = Bc((f = o[c.indices[d]]))),
              (u = Rc(f)),
              l ? zc(n, s, l) : Ec(n, s),
              s ? zc(n, u, s) : l ? zc(n, u, l) : Ec(n, u),
              zc(n, u, s),
              (l = u || s || l),
              this.gradientManager.addWithoutUpdate(s, f),
              this.shadowManager.addWithoutUpdate(l, f),
              this.clipPathManager.markUsed(f));
        else if (!c.removed)
          for (var d = 0; d < c.count; d++) {
            var f = o[c.indices[d]];
            ((l = s = Rc(f) || Bc(f) || l),
              this.gradientManager.markUsed(f),
              this.gradientManager.addWithoutUpdate(s, f),
              this.shadowManager.markUsed(f),
              this.shadowManager.addWithoutUpdate(s, f),
              this.clipPathManager.markUsed(f));
          }
      }
      (this.gradientManager.removeUnused(),
        this.clipPathManager.removeUnused(),
        this.shadowManager.removeUnused(),
        (this._visibleList = o));
    },
    _getDefs: function (t) {
      var typeof_ = this._svgRoot,
        n = this._svgRoot.getElementsByTagName("defs");
      return 0 === n.length
        ? t
          ? ((n = typeof_.insertBefore(mc("defs"), typeof_.firstChild)).contains ||
              (n.contains = function (t) {
                var typeof_ = n.children;
                if (!typeof_) return !1;
                for (var i = typeof_.length - 1; i >= 0; --i) if (typeof_[i] === t) return !0;
                return !1;
              }),
            n)
          : null
        : n[0];
    },
    resize: function (t, e) {
      var n = this._viewport;
      n.style.display = "none";
      var i = this._opts;
      if (
        (null != t && (i.width = t),
        null != e && (i.height = e),
        (t = this._getSize(0)),
        (e = this._getSize(1)),
        (n.style.display = ""),
        this._width !== t || this._height !== e)
      ) {
        ((this._width = t), (this._height = e));
        var r = n.style;
        ((r.width = t + "px"), (r.height = e + "px"));
        var o = this._svgRoot;
        (o.setAttribute("width", t), o.setAttribute("height", e));
      }
    },
    getWidth: function () {
      return this._width;
    },
    getHeight: function () {
      return this._height;
    },
    _getSize: function (t) {
      var typeof_ = this._opts,
        n = ["width", "height"][t],
        i = ["clientWidth", "clientHeight"][t],
        r = ["paddingLeft", "paddingTop"][t],
        o = ["paddingRight", "paddingBottom"][t];
      if (null != typeof_[n] && "auto" !== typeof_[n]) return parseFloat(typeof_[n]);
      var a = this.root,
        s = document.defaultView.getComputedStyle(a);
      return ((a[i] || Pc(s[n]) || Pc(a.style[n])) - (Pc(s[r]) || 0) - (Pc(s[o]) || 0)) | 0;
    },
    dispose: function () {
      ((this.root.innerHTML = ""), (this._svgRoot = this._viewport = this.storage = null));
    },
    clear: function () {
      this._viewport && this.root.removeChild(this._viewport);
    },
    pathToDataUrl: function () {
      return (this.refresh(), "data:image/svg+xml;charset=UTF-8," + this._svgRoot.outerHTML);
    },
  }),
    f(
      [
        "getLayer",
        "insertLayer",
        "eachLayer",
        "eachBuiltinLayer",
        "eachOtherLayer",
        "getLayers",
        "modLayer",
        "delLayer",
        "clearLayer",
        "toDataURL",
        "pathToImage",
      ],
      function (t) {
        hS.prototype[t] = (function (t) {
          return function () {
            Gd('In SVG mode painter not support method "' + t + '"');
          };
        })(t);
      },
    ),
    nn("svg", hS),
    (t.version = "4.2.1"),
    (t.dependencies = {
      zrender: "4.0.6",
    }),
    (t.PRIORITY = zv),
    (t.init = function (t, e, n) {
      var i = ia(t);
      if (i) return i;
      var r = new Vo(t, e, n);
      return (
        (r.id = "ec_" + Kv++),
        (qv[r.id] = r),
        gn(t, Jv, r.id),
        (function (t) {
          function e(t, e) {
            for (var i = 0; i < t.length; i++) t[i][n] = e;
          }
          var n = "__connectUpdateStatus";
          Av(Wv, function (i, r) {
            t._messageCenter.on(r, function (i) {
              if ($v[t.group] && 0 !== t[n]) {
                if (i && i.escapeConnect) return;
                var r = t.makeActionFromEvent(i),
                  o = [];
                (Av(qv, function (e) {
                  e !== t && e.group === t.group && o.push(e);
                }),
                  e(o, 0),
                  Av(o, function (t) {
                    1 !== t[n] && t.dispatchAction(r);
                  }),
                  e(o, 2));
              }
            });
          });
        })(r),
        r
      );
    }),
    (t.connect = function (t) {
      if (x(t)) {
        var typeof_ = t;
        ((t = null),
          Av(typeof_, function (e) {
            null != e.group && (t = e.group);
          }),
          (t = t || "g_" + Qv++),
          Av(typeof_, function (e) {
            e.group = t;
          }));
      }
      return (($v[t] = !0), t);
    }),
    (t.disConnect = na),
    (t.disconnect = ty),
    (t.dispose = function (t) {
      ("string" == typeof t ? (t = qv[t]) : t instanceof Vo || (t = ia(t)),
        t instanceof Vo && !t.isDisposed() && t.dispose());
    }),
    (t.getInstanceByDom = ia),
    (t.getInstanceById = function (t) {
      return qv[t];
    }),
    (t.registerTheme = ra),
    (t.registerPreprocessor = oa),
    (t.registerProcessor = aa),
    (t.registerPostUpdate = function (t) {
      Uv.push(t);
    }),
    (t.registerAction = sa),
    (t.registerCoordinateSystem = function (t, e) {
      Lr.register(t, e);
    }),
    (t.getCoordinateSystemDimensions = function (t) {
      var typeof_ = Lr.get(t);
      if (typeof_)
        return typeof_.getDimensionsInfo ? typeof_.getDimensionsInfo() : typeof_.dimensions.slice();
    }),
    (t.registerLayout = la),
    (t.registerVisual = ha),
    (t.registerLoading = ca),
    (t.extendComponentModel = da),
    (t.extendComponentView = fa),
    (t.extendSeriesModel = pa),
    (t.extendChartView = ga),
    (t.setCanvasCreator = function (t) {
      n("createCanvas", t);
    }),
    (t.registerMap = function (t, e, n) {
      Sv(t, e, n);
    }),
    (t.getMap = function (t) {
      var typeof_ = Mv(t);
      return (
        typeof_ &&
        typeof_[0] && {
          geoJson: typeof_[0].geoJSON,
          specialAreas: typeof_[0].specialAreas,
        }
      );
    }),
    (t.dataTool = {}),
    (t.zrender = Ff),
    (t.number = Wg),
    (t.format = $g),
    (t.throttle = mo),
    (t.helper = Yy),
    (t.matrix = xd),
    (t.vector = sd),
    (t.color = Bd),
    (t.parseGeoJSON = qy),
    (t.parseGeoJson = Jy),
    (t.util = tx),
    (t.graphic = ex),
    (t.List = cy),
    (t.Model = Wi),
    (t.Axis = Qy),
    (t.env = Hc));
}),
  "object" == ("undefined" == typeof exports ? "undefined" : typeof_(exports)) &&
  "undefined" != typeof module
    ? t(exports)
    : "function" == typeof define && define.amd
      ? define(["exports"], t)
      : t(((void 0).echarts = {})));
