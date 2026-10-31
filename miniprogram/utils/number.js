var objectSpread2 = require("../@babel/runtime/helpers/objectSpread2"),
  t = {
    operation: function (e, t, r) {
      var n = this.toInteger(e),
        i = this.toInteger(t),
        s = n.num,
        u = i.num,
        a = n.times,
        o = i.times,
        m = a > o ? a : o;
      switch (r) {
        case "add":
          return (a === o ? s + u : a > o ? s + u * (a / o) : s * (o / a) + u) / m;
        case "subtract":
          return (a === o ? s - u : a > o ? s - u * (a / o) : s * (o / a) - u) / m;
        case "multiply":
          return (s * u) / (a * o);
        case "divide":
          return s / u / (o / a);
      }
    },
    toInteger: function (e) {
      var t = {
        times: 1,
        num: 0,
      };
      if (this.isInteger(e)) return ((t.num = e), t);
      var r = e + "",
        n = r.indexOf("."),
        i = r.substr(n + 1).length,
        s = Math.pow(10, i),
        u = parseInt(e * s + 0.5, 10);
      return ((t.times = s), (t.num = u), t);
    },
    isInteger: function (e) {
      return Math.floor(e) === e;
    },
  };
module.exports = objectSpread2({}, t);
