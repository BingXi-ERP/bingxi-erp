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
var t = {
    selector: "#van-notify",
    type: "danger",
    message: "",
    background: "",
    duration: 3e3,
    zIndex: 110,
    top: 0,
    color: require("../common/color").WHITE,
    safeAreaInsetTop: !1,
    onClick: function () {},
    onOpened: function () {},
    onClose: function () {},
  },
  n = e({}, t);
function o(e) {
  return null == e ? {} : "string" == typeof e ? { message: e } : e;
}
function r() {
  var e = getCurrentPages();
  return e[e.length - 1];
}
function c(t) {
  var c = ((t = e(e({}, n), o(t))).context || r()).selectComponent(t.selector);
  if ((delete t.context, delete t.selector, c))
    return c.setData(t), c.show(), c;
  console.warn("未找到 van-notify 节点，请确认 selector 及 context 是否正确");
}
(exports.default = c),
  (c.clear = function (n) {
    var c = ((n = e(e({}, t), o(n))).context || r()).selectComponent(
      n.selector
    );
    c && c.hide();
  }),
  (c.setDefaultOptions = function (e) {
    Object.assign(n, e);
  }),
  (c.resetDefaultOptions = function () {
    n = e({}, t);
  });
