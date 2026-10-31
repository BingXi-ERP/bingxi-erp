var e = function () {
  return (
    (e =
      Object.assign ||
      function (e) {
        for (var t, n = 1, o = arguments.length; n < o; n++)
          for (var r in (t = arguments[n]))
            Object.prototype.hasOwnProperty.call(t, r) && (e[r] = t[r]);
        return e;
      }),
    e.apply(this, arguments)
  );
};
Object.defineProperty(exports, "__esModule", { value: !0 });
var t = require("../common/validator"),
  n = {
    type: "text",
    mask: !1,
    message: "",
    show: !0,
    zIndex: 1e3,
    duration: 2e3,
    position: "middle",
    forbidClick: !1,
    loadingType: "circular",
    selector: "#van-toast",
  },
  o = [],
  r = e({}, n);
function a(e) {
  return (0, t.isObj)(e) ? e : { message: e };
}
function i(t) {
  var n,
    i = e(e({}, r), a(t)),
    c = (
      ("function" == typeof i.context ? i.context() : i.context) ||
      (n = getCurrentPages())[n.length - 1]
    ).selectComponent(i.selector);
  if (c)
    return (
      delete i.context,
      delete i.selector,
      (c.clear = function () {
        c.setData({ show: !1 }), i.onClose && i.onClose();
      }),
      o.push(c),
      c.setData(i),
      clearTimeout(c.timer),
      null != i.duration &&
        i.duration > 0 &&
        (c.timer = setTimeout(function () {
          c.clear(),
            (o = o.filter(function (e) {
              return e !== c;
            }));
        }, i.duration)),
      c
    );
  console.warn("未找到 van-toast 节点，请确认 selector 及 context 是否正确");
}
var c = function (t) {
  return function (n) {
    return i(e({ type: t }, a(n)));
  };
};
(i.loading = c("loading")),
  (i.success = c("success")),
  (i.fail = c("fail")),
  (i.clear = function () {
    o.forEach(function (e) {
      e.clear();
    }),
      (o = []);
  }),
  (i.setDefaultOptions = function (e) {
    Object.assign(r, e);
  }),
  (i.resetDefaultOptions = function () {
    r = e({}, n);
  }),
  (exports.default = i);
