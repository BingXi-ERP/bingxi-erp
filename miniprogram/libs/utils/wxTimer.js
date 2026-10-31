var e = function (e) {
  ((e = e || {}),
    (this.beginTime = e.beginTime || 0),
    (this.interval = e.interval || 350),
    (this.complete = e.complete),
    (this.intervalFn = e.intervalFn),
    (this.name = e.name),
    this.intervarID,
    this.endTime,
    this.endSystemTime,
    (this.aDateTime = new Date("1970/01/01 00:00:00").getTime()));
};
function t(e) {
  return e < 10 ? "0" + e : e;
}
((e.prototype.timerStr = ""),
  (e.prototype.timerSecond = 0),
  (e.prototype = {
    dateFormat: function (e) {
      if (e <= 0) return "00:00:00";
      var i = Math.floor(e / 1e3),
        n = t(Math.floor(i / 3600)),
        a = t(Math.floor((i - 3600 * n) / 60));
      return n + ":" + a + ":" + t(i - 3600 * n - 60 * a);
    },
    start: function (e) {
      ((this.endTime = new Date(this.aDateTime + this.beginTime).getTime()),
        (this.endSystemTime = new Date(Date.now() + this.endTime)));
      var t = this,
        i = 0;
      function n() {
        var n = new Date(t.endTime - t.interval * i++),
          a = (n.getTime() - t.aDateTime) / t.interval,
          r = t.dateFormat(n.getTime() - t.aDateTime),
          m = e.data.wxTimerList;
        (n.getTime() >= t.aDateTime &&
          ((t.timerStr = r),
          (t.timerSecond = a),
          (m[t.name] = {
            wxTimer: r,
            wxTimerSecond: a,
          }),
          e.setData({
            wxTimer: r,
            wxTimerSecond: a,
            wxTimerList: m,
          })),
          t.intervalFn && t.intervalFn(t),
          a <= 0 && (t.complete && t.complete(), t.stop()));
      }
      (n(), (this.intervarID = setInterval(n, t.interval)));
    },
    stop: function () {
      clearInterval(this.intervarID);
    },
    calibration: function () {
      this.endTime = this.endSystemTime - Date.now();
    },
  }),
  (module.exports = e));
