Object.defineProperty(exports, "__esModule", { value: !0 });
var t = require("../common/utils"),
  e = require("../common/component"),
  o = require("../common/validator"),
  i = require("../mixins/page-scroll"),
  r = ".van-sticky";
(0, e.VantComponent)({
  props: {
    zIndex: { type: Number, value: 99 },
    offsetTop: { type: Number, value: 0, observer: "onScroll" },
    disabled: { type: Boolean, observer: "onScroll" },
    container: { type: null, observer: "onScroll" },
    scrollTop: {
      type: null,
      observer: function (t) {
        this.onScroll({ scrollTop: t });
      },
    },
  },
  mixins: [
    (0, i.pageScrollMixin)(function (t) {
      null == this.data.scrollTop && this.onScroll(t);
    }),
  ],
  data: { height: 0, fixed: !1, transform: 0 },
  mounted: function () {
    this.onScroll();
  },
  methods: {
    onScroll: function (e) {
      var i = this,
        n = (void 0 === e ? {} : e).scrollTop,
        s = this.data,
        a = s.container,
        f = s.offsetTop;
      s.disabled
        ? this.setDataAfterDiff({ fixed: !1, transform: 0 })
        : ((this.scrollTop = n || this.scrollTop),
          "function" != typeof a
            ? (0, t.getRect)(this, r).then(function (t) {
                (0, o.isDef)(t) &&
                  (t.width || t.height) &&
                  (f >= t.top
                    ? (i.setDataAfterDiff({ fixed: !0, height: t.height }),
                      (i.transform = 0))
                    : i.setDataAfterDiff({ fixed: !1 }));
              })
            : Promise.all([(0, t.getRect)(this, r), this.getContainerRect()])
                .then(function (t) {
                  var e = t[0],
                    o = t[1];
                  f + e.height > o.height + o.top
                    ? i.setDataAfterDiff({
                        fixed: !1,
                        transform: o.height - e.height,
                      })
                    : f >= e.top
                    ? i.setDataAfterDiff({
                        fixed: !0,
                        height: e.height,
                        transform: 0,
                      })
                    : i.setDataAfterDiff({ fixed: !1, transform: 0 });
                })
                .catch(function () {}));
    },
    setDataAfterDiff: function (t) {
      var e = this;
      wx.nextTick(function () {
        var o = Object.keys(t).reduce(function (o, i) {
          return t[i] !== e.data[i] && (o[i] = t[i]), o;
        }, {});
        Object.keys(o).length > 0 && e.setData(o),
          e.$emit("scroll", {
            scrollTop: e.scrollTop,
            isFixed: t.fixed || e.data.fixed,
          });
      });
    },
    getContainerRect: function () {
      var t = this.data.container();
      return t
        ? new Promise(function (e) {
            return t.boundingClientRect(e).exec();
          })
        : Promise.reject(new Error("not found container"));
    },
  },
});
