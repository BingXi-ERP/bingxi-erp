var typeof_ = require("../../@babel/runtime/helpers/typeof");
function t(t, n) {
  if (0 === arguments.length) return null;
  var a,
    r = n || "{y}-{m}-{d} {h}:{i}:{s}";
  "object" === typeof_(t)
    ? (a = t)
    : (10 === "''".concat(t).length && (t = 1e3 * parseInt(t, 10)), (a = new Date(t)));
  var c = {
    y: a.getFullYear(),
    m: a.getMonth() + 1,
    d: a.getDate(),
    h: a.getHours(),
    i: a.getMinutes(),
    s: a.getSeconds(),
    a: a.getDay(),
  };
  return r.replace(/{(y|m|d|h|i|s|a)+}/g, function (e, t) {
    var n = c[t];
    return "a" === t
      ? ["一", "二", "三", "四", "五", "六", "日"][n - 1]
      : (e.length > 0 && n < 10 && (n = "0".concat(n)), n || 0);
  });
}
module.exports = {
  parseTime: t,
  fromNow: function (e, n) {
    e = 1e3 * +e;
    var a = new Date(e),
      r = (Date.now() - a) / 1e3;
    return r < 30
      ? "刚刚"
      : r < 3600
        ? "".concat(Math.ceil(r / 60), "分钟前")
        : r < 86400
          ? "".concat(Math.ceil(r / 3600), "小时前")
          : r < 172800
            ? "1天前"
            : n
              ? t(e, n)
              : ""
                  .concat(a.getMonth() + 1, "月")
                  .concat(a.getDate(), "日")
                  .concat(a.getHours(), "时")
                  .concat(a.getMinutes(), "分")
                  .concat(a.getSeconds(), "秒");
  },
  getPrevMonthFirstDay: function () {
    var typeof_ = new Date(),
      t = typeof_.getFullYear(),
      n = typeof_.getMonth();
    return (0 == n && ((n = 12), (t -= 1)), n < 10 && (n = "0".concat(n)), new Date(t, n - 1, 1));
  },
};
