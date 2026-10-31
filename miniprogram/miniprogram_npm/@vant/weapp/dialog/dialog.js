var t = function () {
  return (
    (t =
      Object.assign ||
      function (t) {
        for (var e, n = 1, o = arguments.length; n < o; n++)
          for (var c in (e = arguments[n]))
            Object.prototype.hasOwnProperty.call(e, c) && (t[c] = e[c]);
        return t;
      }),
    t.apply(this, arguments)
  );
};
Object.defineProperty(exports, "__esModule", { value: !0 });
var e = [],
  n = {
    show: !1,
    title: "",
    width: null,
    theme: "default",
    message: "",
    zIndex: 100,
    overlay: !0,
    selector: "#van-dialog",
    className: "",
    asyncClose: !1,
    beforeClose: null,
    transition: "scale",
    customStyle: "",
    messageAlign: "",
    overlayStyle: "",
    confirmButtonText: "确认",
    cancelButtonText: "取消",
    showConfirmButton: !0,
    showCancelButton: !1,
    closeOnClickOverlay: !1,
    confirmButtonOpenType: "",
  },
  o = t({}, n);
var c = function (n) {
  return (
    (n = t(t({}, o), n)),
    new Promise(function (o, c) {
      var r,
        s = (
          ("function" == typeof n.context ? n.context() : n.context) ||
          (r = getCurrentPages())[r.length - 1]
        ).selectComponent(n.selector);
      delete n.context,
        delete n.selector,
        s
          ? (s.setData(
              t(
                {
                  callback: function (t, e) {
                    "confirm" === t ? o(e) : c(e);
                  },
                },
                n
              )
            ),
            wx.nextTick(function () {
              s.setData({ show: !0 });
            }),
            e.push(s))
          : console.warn(
              "未找到 van-dialog 节点，请确认 selector 及 context 是否正确"
            );
    })
  );
};
(c.alert = function (t) {
  return c(t);
}),
  (c.confirm = function (e) {
    return c(t({ showCancelButton: !0 }, e));
  }),
  (c.close = function () {
    e.forEach(function (t) {
      t.close();
    }),
      (e = []);
  }),
  (c.stopLoading = function () {
    e.forEach(function (t) {
      t.stopLoading();
    });
  }),
  (c.currentOptions = o),
  (c.defaultOptions = n),
  (c.setDefaultOptions = function (e) {
    (o = t(t({}, o), e)), (c.currentOptions = o);
  }),
  (c.resetDefaultOptions = function () {
    (o = t({}, n)), (c.currentOptions = o);
  }),
  c.resetDefaultOptions(),
  (exports.default = c);
