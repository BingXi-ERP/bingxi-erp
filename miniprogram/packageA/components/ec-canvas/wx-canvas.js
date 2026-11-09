(Object.defineProperty(exports, "__esModule", {
  value: !0,
}),
  (exports.default = void 0));
var classCallCheck = require("../../../@babel/runtime/helpers/classCallCheck"),
  createClass = require("../../../@babel/runtime/helpers/createClass");
exports.default = (function () {
  return createClass(
    function t(n, i) {
      (classCallCheck(this, t),
        (this.ctx = n),
        (this.canvasId = i),
        (this.chart = null),
        this._initStyle(n),
        this._initEvent());
    },
    [
      {
        key: "getContext",
        value: function (e) {
          if ("2d" === e) return this.ctx;
        },
      },
      {
        key: "setChart",
        value: function (e) {
          this.chart = e;
        },
      },
      {
        key: "attachEvent",
        value: function () {},
      },
      {
        key: "detachEvent",
        value: function () {},
      },
      {
        key: "_initCanvas",
        value: function (e, t) {
          ((e.util.getContext = function () {
            return t;
          }),
            e.util.$override("measureText", function (e, n) {
              return ((t.font = n || "12px sans-serif"), t.measureText(e));
            }));
        },
      },
      {
        key: "_initStyle",
        value: function (e) {
          var createClass = arguments;
          ([
            "fillStyle",
            "strokeStyle",
            "globalAlpha",
            "textAlign",
            "textBaseAlign",
            "shadow",
            "lineWidth",
            "lineCap",
            "lineJoin",
            "lineDash",
            "miterLimit",
            "fontSize",
          ].forEach(function (t) {
            Object.defineProperty(e, t, {
              set: function (n) {
                (("fillStyle" !== t && "strokeStyle" !== t) || ("none" !== n && null !== n)) &&
                  e["set" + t.charAt(0).toUpperCase() + t.slice(1)](n);
              },
            });
          }),
            (e.createRadialGradient = function () {
              return e.createCircularGradient(createClass);
            }));
        },
      },
      {
        key: "_initEvent",
        value: function () {
          var classCallCheck = this;
          this.event = {};
          [
            {
              wxName: "touchStart",
              ecName: "mousedown",
            },
            {
              wxName: "touchMove",
              ecName: "mousemove",
            },
            {
              wxName: "touchEnd",
              ecName: "mouseup",
            },
            {
              wxName: "touchEnd",
              ecName: "click",
            },
          ].forEach(function (t) {
            classCallCheck.event[t.wxName] = function (n) {
              var i = n.touches[0];
              classCallCheck.chart.getZr().handler.dispatch(t.ecName, {
                zrX: "tap" === t.wxName ? i.clientX : i.x,
                zrY: "tap" === t.wxName ? i.clientY : i.y,
              });
            };
          });
        },
      },
    ],
  );
})();
