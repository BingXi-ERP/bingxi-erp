Object.defineProperty(exports, "__esModule", { value: !0 }),
  (exports.transition = void 0);
var e = require("../common/utils"),
  t = require("../common/validator"),
  n = function (e) {
    return {
      enter: "van-"
        .concat(e, "-enter van-")
        .concat(e, "-enter-active enter-class enter-active-class"),
      "enter-to": "van-"
        .concat(e, "-enter-to van-")
        .concat(e, "-enter-active enter-to-class enter-active-class"),
      leave: "van-"
        .concat(e, "-leave van-")
        .concat(e, "-leave-active leave-class leave-active-class"),
      "leave-to": "van-"
        .concat(e, "-leave-to van-")
        .concat(e, "-leave-active leave-to-class leave-active-class"),
    };
  };
exports.transition = function (a) {
  return Behavior({
    properties: {
      customStyle: String,
      show: { type: Boolean, value: a, observer: "observeShow" },
      duration: { type: null, value: 300 },
      name: { type: String, value: "fade" },
    },
    data: { type: "", inited: !1, display: !1 },
    ready: function () {
      !0 === this.data.show && this.observeShow(!0, !1);
    },
    methods: {
      observeShow: function (e, t) {
        e !== t && (e ? this.enureEnter() : this.enureLeave());
      },
      enureEnter: function () {
        var e = this;
        this.enterPromise ||
          (this.enterPromise = new Promise(function (t) {
            return e.enter(t);
          }));
      },
      enureLeave: function () {
        var e = this,
          t = this.enterPromise;
        t &&
          t
            .then(function () {
              return new Promise(function (t) {
                return e.leave(t);
              });
            })
            .then(function () {
              e.enterPromise = null;
            });
      },
      enter: function (a) {
        var s = this,
          i = this.data,
          r = i.duration,
          o = i.name,
          c = n(o),
          u = (0, t.isObj)(r) ? r.enter : r;
        "enter" !== this.status &&
          ((this.status = "enter"),
          this.$emit("before-enter"),
          (0, e.requestAnimationFrame)(function () {
            "enter" === s.status &&
              (s.$emit("enter"),
              s.setData({
                inited: !0,
                display: !0,
                classes: c.enter,
                currentDuration: u,
              }),
              (0, e.requestAnimationFrame)(function () {
                "enter" === s.status &&
                  ((s.transitionEnded = !1),
                  s.setData({ classes: c["enter-to"] }),
                  a());
              }));
          }));
      },
      leave: function (a) {
        var s = this;
        if (this.data.display) {
          var i = this.data,
            r = i.duration,
            o = i.name,
            c = n(o),
            u = (0, t.isObj)(r) ? r.leave : r;
          (this.status = "leave"),
            this.$emit("before-leave"),
            (0, e.requestAnimationFrame)(function () {
              "leave" === s.status &&
                (s.$emit("leave"),
                s.setData({ classes: c.leave, currentDuration: u }),
                (0, e.requestAnimationFrame)(function () {
                  "leave" === s.status &&
                    ((s.transitionEnded = !1),
                    setTimeout(function () {
                      s.onTransitionEnd(), a();
                    }, u),
                    s.setData({ classes: c["leave-to"] }));
                }));
            });
        }
      },
      onTransitionEnd: function () {
        if (!this.transitionEnded) {
          (this.transitionEnded = !0), this.$emit("after-".concat(this.status));
          var e = this.data,
            t = e.show,
            n = e.display;
          !t && n && this.setData({ display: !1 });
        }
      },
    },
  });
};
