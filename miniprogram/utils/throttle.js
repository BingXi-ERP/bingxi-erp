(Object.defineProperty(exports, "__esModule", {
  value: !0,
}),
  (exports.default = void 0));
var classCallCheck = require("../@babel/runtime/helpers/classCallCheck"),
  createClass = require("../@babel/runtime/helpers/createClass"),
  r = (function () {
    return createClass(
      function t() {
        classCallCheck(this, t);
      },
      [
        {
          key: "throttle",
          value: function (e, t) {
            (null != t && null != t) || (t = 2e3);
            var r = null;
            return function () {
              var l = +new Date();
              (l - r > t || !r) && (e.apply(this, arguments), (r = l));
            };
          },
        },
      ],
    );
  })();
exports.default = new r();
