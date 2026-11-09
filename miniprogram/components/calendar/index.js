var createForOfIteratorHelper = require("../../@babel/runtime/helpers/createForOfIteratorHelper"),
  a = require("../../@babel/runtime/helpers/regeneratorRuntime"),
  e = require("../../@babel/runtime/helpers/asyncToGenerator");
Component({
  properties: {
    isShow: {
      type: Boolean,
      value: !1,
    },
    timeStart: {
      type: String,
      value: "",
      observer: function (t) {
        var a = this;
        this.data.data.length
          ? this.setDate()
          : setTimeout(function () {
              a.setDate();
            }, 50);
      },
    },
    timeEnd: {
      type: String,
      value: "",
      observer: function (t) {
        var a = this;
        this.data.data.length
          ? this.setDate()
          : setTimeout(function () {
              a.setDate();
            }, 50);
      },
    },
    minDate: {
      type: String,
      value: "2018/1/1",
    },
    theme_color: {
      type: String,
      value: "#2493F8",
    },
  },
  data: {
    currentDate: "",
    year: "",
    month: "",
    date: "",
    today: {},
    data: [],
    type: "未选择",
  },
  methods: {
    getNowDayTime: function () {
      var createForOfIteratorHelper = new Date();
      return [
        createForOfIteratorHelper.getFullYear(),
        createForOfIteratorHelper.getMonth() + 1,
        createForOfIteratorHelper.getDate(),
      ].join("-");
    },
    hexToRgb: function (t) {
      var a = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(t);
      return a
        ? {
            r: parseInt(a[1], 16),
            g: parseInt(a[2], 16),
            b: parseInt(a[3], 16),
          }
        : null;
    },
    hexify: function (t) {
      var a = t
          .replace(/rgba?\(/, "")
          .replace(/\)/, "")
          .replace(/[\s+]/g, "")
          .split(","),
        e = parseFloat(a[3] || 1),
        n = Math.floor(e * parseInt(a[0]) + 255 * (1 - e)),
        r = Math.floor(e * parseInt(a[1]) + 255 * (1 - e)),
        i = Math.floor(e * parseInt(a[2]) + 255 * (1 - e));
      return (
        "#" +
        ("0" + n.toString(16)).slice(-2) +
        ("0" + r.toString(16)).slice(-2) +
        ("0" + i.toString(16)).slice(-2)
      );
    },
    reset: function () {
      (this.data.data.forEach(function (t, a) {
        t.weeks.forEach(function (t, a) {
          t.forEach(function (t, a) {
            ((t.isStart = !1), (t.isEnd = !1), (t.isMatter = !1));
          });
        });
      }),
        this.setData({
          data: this.data.data,
        }));
    },
    showture: function () {
      return !1;
    },
    init: function () {
      var createForOfIteratorHelper = this,
        a = new Date(this.data.minDate),
        e = new Date(),
        n = a.getFullYear(),
        r = a.getMonth() + 1,
        i = a.getDate(),
        s = this.MonthsBetw(a, e),
        o = "view" + s;
      (this.setData({
        year: n,
        month: r,
        date: i,
        today: {
          year: n,
          month: r,
          date: i,
        },
      }),
        this.data.timeStart ||
          this.data.timeEnd ||
          this.setData({
            timeStart: this.getNowDayTime(),
            timeEnd: this.getNowDayTime(),
          }),
        wx.nextTick(function () {
          return createForOfIteratorHelper.setData({
            currentDate: o,
          });
        }),
        this.getCalendar(s));
    },
    MonthsBetw: function (t, a) {
      var e = new Date(t),
        n = new Date(a),
        r = e.getFullYear(),
        i = e.getMonth();
      return 12 * (n.getFullYear() - r) + n.getMonth() - i;
    },
    getCalendarNext: function (t) {
      var n = this;
      return e(
        a().mark(function t() {
          var e, r;
          return a().wrap(function (t) {
            for (;;)
              switch ((t.prev = t.next)) {
                case 0:
                  e = 0;
                case 1:
                  if (!(e < 6)) {
                    t.next = 4;
                    break;
                  }
                  return (
                    (r = n.data.data),
                    (t.next = 2),
                    n.showThisDay(n.data.year, n.data.month, n.data.date)
                  );
                case 2:
                  (r.push.call(r, t.sent),
                    12 == n.data.month
                      ? ((n.data.year = n.data.year + 1), (n.data.month = 1))
                      : (n.data.month = n.data.month + 1));
                case 3:
                  (e++, (t.next = 1));
                  break;
                case 4:
                  n.setData({
                    data: n.data.data,
                  });
                case 5:
                case "end":
                  return t.stop();
              }
          }, t);
        }),
      )();
    },
    getCalendar: function (t) {
      var n = this;
      return e(
        a().mark(function e() {
          var r, i;
          return a().wrap(function (a) {
            for (;;)
              switch ((a.prev = a.next)) {
                case 0:
                  (n.setData({
                    loop_num: t,
                  }),
                    (r = 0));
                case 1:
                  if (!(r < t + 1)) {
                    a.next = 4;
                    break;
                  }
                  return (
                    (i = n.data.data),
                    (a.next = 2),
                    n.showThisDay(n.data.year, n.data.month, n.data.date)
                  );
                case 2:
                  (i.push.call(i, a.sent),
                    12 == n.data.month
                      ? ((n.data.year = n.data.year + 1), (n.data.month = 1))
                      : (n.data.month = n.data.month + 1));
                case 3:
                  (r++, (a.next = 1));
                  break;
                case 4:
                  n.setData({
                    data: n.data.data,
                  });
                case 5:
                case "end":
                  return a.stop();
              }
          }, e);
        }),
      )();
    },
    showThisDay: function (t, a) {
      var e = this;
      return new Promise(function (n, r) {
        for (var i = [], s = t, o = a, d = [], h = new Date(s, o - 1, 1).getDay() - 1; h >= 0; h--)
          d.push({
            year: s,
            date: parseInt(new Date(s, o - 1, -h).getDate()),
            month: parseInt(o) - 1,
            noDay: !0,
          });
        for (var c = [], f = new Date(s, o, 0).getDate(), l = 1; l <= f; l++) {
          var u = {
            year: s,
            date: l,
            month: o,
            noDay: !1,
            isFront: 1 == l,
            isBack: l == f,
          };
          (e.data.today.year == s &&
            e.data.today.month == o &&
            l < e.data.today.date &&
            (u.noLessMonth = !0),
            c.push(u));
        }
        for (var y = [], m = new Date(s, o, 0).getDay(), v = 1; v < 7 - m; v++)
          y.push({
            year: s,
            date: v,
            month: parseInt(o) + 1,
            noDay: !0,
          });
        i = i.concat(d, c, y);
        for (var p = [], D = 0; D < i.length; D++)
          (D % 7 == 0 && (p[parseInt(D / 7)] = new Array(7)), (p[parseInt(D / 7)][D % 7] = i[D]));
        n({
          weeks: p,
          year: t,
          month: a,
        });
      });
    },
    setDate: function () {
      var a,
        e = this.data.timeStart.split("-"),
        n = {
          year: e[0],
          month: e[1],
          date: e[2],
        },
        r = this.data.timeEnd.split("-"),
        i = {
          year: r[0],
          month: r[1],
          date: r[2],
        },
        s = createForOfIteratorHelper(this.data.data);
      try {
        for (s.s(); !(a = s.n()).done;) {
          var o,
            d = a.value,
            h = createForOfIteratorHelper(d.weeks);
          try {
            for (h.s(); !(o = h.n()).done;) {
              var c,
                f = o.value,
                l = createForOfIteratorHelper(f);
              try {
                for (l.s(); !(c = l.n()).done;) {
                  var u = c.value,
                    y = u.year == n.year && u.month == n.month && u.date == n.date,
                    m = u.year == i.year && u.month == i.month && u.date == i.date;
                  y && m
                    ? ((u.isStart = !0), (u.isEnd = !0))
                    : y
                      ? (u.isStart = !0)
                      : m
                        ? (u.isEnd = !0)
                        : ((u.isStart = !1), (u.isEnd = !1));
                }
              } catch (t) {
                l.e(t);
              } finally {
                l.f();
              }
            }
          } catch (t) {
            h.e(t);
          } finally {
            h.f();
          }
        }
      } catch (t) {
        s.e(t);
      } finally {
        s.f();
      }
      (this.editItem5(n, i),
        this.setData({
          type: "已选择结束时间",
          data: this.data.data,
        }));
    },
    clearDate: function () {
      var a = this;
      return new Promise(function (e, n) {
        var r,
          i = createForOfIteratorHelper(a.data.data);
        try {
          for (i.s(); !(r = i.n()).done;) {
            var s,
              o = r.value,
              d = createForOfIteratorHelper(o.weeks);
            try {
              for (d.s(); !(s = d.n()).done;) {
                var h,
                  c = s.value,
                  f = createForOfIteratorHelper(c);
                try {
                  for (f.s(); !(h = f.n()).done;) {
                    var l = h.value;
                    ((l.isStart = !1), (l.isEnd = !1), (l.isMatter = !1));
                  }
                } catch (t) {
                  f.e(t);
                } finally {
                  f.f();
                }
              }
            } catch (t) {
              d.e(t);
            } finally {
              d.f();
            }
          }
        } catch (t) {
          i.e(t);
        } finally {
          i.f();
        }
        e();
      });
    },
    editItem1: function (t) {
      var a = t.index,
        e = t.i1,
        n = t.i2;
      ((this.data.data[a].weeks[e][n].isStart = !0),
        this.setData({
          type: "已选择开始时间",
          data: this.data.data,
        }));
    },
    editItem2: function (a) {
      var e,
        n,
        r,
        i = this.data.data,
        s = a.index,
        o = a.i1,
        d = a.i2;
      ((e = i[s].weeks[o][d]),
        (n = e.month < 10 ? "0" + e.month : e.month),
        (r = e.date < 10 ? "0" + e.date : e.date),
        Date.parse(new Date("".concat(e.year, "-").concat(n, "-").concat(r).replace(/-/g, "/"))) -
          (function () {
            var a,
              e = {},
              n = createForOfIteratorHelper(i);
            try {
              for (n.s(); !(a = n.n()).done;) {
                var r,
                  s = a.value,
                  o = createForOfIteratorHelper(s.weeks);
                try {
                  for (o.s(); !(r = o.n()).done;) {
                    var d,
                      h = r.value,
                      c = createForOfIteratorHelper(h);
                    try {
                      for (c.s(); !(d = c.n()).done;) {
                        var f = d.value;
                        f.isStart && (e = f);
                      }
                    } catch (t) {
                      c.e(t);
                    } finally {
                      c.f();
                    }
                  }
                } catch (t) {
                  o.e(t);
                } finally {
                  o.f();
                }
              }
            } catch (t) {
              n.e(t);
            } finally {
              n.f();
            }
            var l = e.month < 10 ? "0" + e.month : e.month,
              u = e.date < 10 ? "0" + e.date : e.date;
            return Date.parse(
              new Date("".concat(e.year, "-").concat(l, "-").concat(u).replace(/-/g, "/")),
            );
          })() >=
        0
          ? this.editItem3({
              index: s,
              i1: o,
              i2: d,
            })
          : this.editItem4({
              index: s,
              i1: o,
              i2: d,
            }));
    },
    editItem3: function (a) {
      var e = a.index,
        n = a.i1,
        r = a.i2;
      this.data.data[e].weeks[n][r].isEnd = !0;
      var i,
        s = {},
        o = this.data.data[e].weeks[n][r],
        d = createForOfIteratorHelper(this.data.data);
      try {
        for (d.s(); !(i = d.n()).done;) {
          var h,
            c = i.value,
            f = createForOfIteratorHelper(c.weeks);
          try {
            for (f.s(); !(h = f.n()).done;) {
              var l,
                u = h.value,
                y = createForOfIteratorHelper(u);
              try {
                for (y.s(); !(l = y.n()).done;) {
                  var m = l.value;
                  m.isStart && (s = m);
                }
              } catch (t) {
                y.e(t);
              } finally {
                y.f();
              }
            }
          } catch (t) {
            f.e(t);
          } finally {
            f.f();
          }
        }
      } catch (t) {
        d.e(t);
      } finally {
        d.f();
      }
      (this.editItem5(s, o),
        this.setData({
          type: "已选择结束时间",
          data: this.data.data,
        }));
    },
    editItem4: function (a) {
      var e,
        n = a.index,
        r = a.i1,
        i = a.i2,
        s = this.data.data[n].weeks[r][i],
        o = {},
        d = createForOfIteratorHelper(this.data.data);
      try {
        for (d.s(); !(e = d.n()).done;) {
          var h,
            c = e.value,
            f = createForOfIteratorHelper(c.weeks);
          try {
            for (f.s(); !(h = f.n()).done;) {
              var l,
                u = h.value,
                y = createForOfIteratorHelper(u);
              try {
                for (y.s(); !(l = y.n()).done;) {
                  var m = l.value;
                  m.isStart && ((m.isStart = !1), (m.isEnd = !0), (o = m));
                }
              } catch (t) {
                y.e(t);
              } finally {
                y.f();
              }
            }
          } catch (t) {
            f.e(t);
          } finally {
            f.f();
          }
        }
      } catch (t) {
        d.e(t);
      } finally {
        d.f();
      }
      ((this.data.data[n].weeks[r][i].isStart = !0),
        this.editItem5(s, o),
        this.setData({
          type: "已选择结束时间",
          data: this.data.data,
        }));
    },
    editItem5: function (a, e) {
      var n,
        r = createForOfIteratorHelper(this.data.data);
      try {
        for (r.s(); !(n = r.n()).done;) {
          var i,
            s = n.value,
            o = createForOfIteratorHelper(s.weeks);
          try {
            for (o.s(); !(i = o.n()).done;) {
              var d,
                h = i.value,
                c = createForOfIteratorHelper(h);
              try {
                for (c.s(); !(d = c.n()).done;) {
                  var f = d.value;
                  a.year == e.year
                    ? f.month >= a.month &&
                      f.month <= e.month &&
                      (a.month == e.month
                        ? f.date > a.date && f.date < e.date && (f.isMatter = !0)
                        : f.month == a.month
                          ? f.date > a.date && (f.isMatter = !0)
                          : f.month == e.month
                            ? f.date < e.date && (f.isMatter = !0)
                            : (f.isMatter = !0))
                    : f.year == a.year
                      ? (f.month > a.month || (f.month == a.month && f.date > a.date)) &&
                        (f.isMatter = !0)
                      : f.year == e.year
                        ? (f.month < e.month || (f.month == e.month && f.date < e.date)) &&
                          (f.isMatter = !0)
                        : (f.isMatter = !0);
                }
              } catch (t) {
                c.e(t);
              } finally {
                c.f();
              }
            }
          } catch (t) {
            o.e(t);
          } finally {
            o.f();
          }
        }
      } catch (t) {
        r.e(t);
      } finally {
        r.f();
      }
    },
    getThisData: function (t) {
      var a = this,
        e = this.data,
        n = (e.data, e.type),
        r = t.currentTarget.dataset,
        i = (r.title, r.index),
        s = r.i1,
        o = r.i2;
      switch (n) {
        case "未选择":
        case "已选择结束时间":
          this.clearDate().then(function () {
            a.editItem1({
              index: i,
              i1: s,
              i2: o,
            });
          });
          break;
        case "已选择开始时间":
          this.editItem2({
            index: i,
            i1: s,
            i2: o,
          });
      }
    },
    tapNo: function () {
      (this.setData({
        isShow: !1,
      }),
        this.reset(),
        this.triggerEvent("tapNo", {}));
    },
    closeMask: function () {
      this.setData({
        isShow: !1,
      });
    },
    tapYes: function () {
      var a,
        e = {},
        n = {},
        r = createForOfIteratorHelper(this.data.data);
      try {
        for (r.s(); !(a = r.n()).done;) {
          var i,
            s = a.value,
            o = createForOfIteratorHelper(s.weeks);
          try {
            for (o.s(); !(i = o.n()).done;) {
              var d,
                h = i.value,
                c = createForOfIteratorHelper(h);
              try {
                for (c.s(); !(d = c.n()).done;) {
                  var f = d.value;
                  (f.isStart && (e = f), f.isEnd && (n = f));
                }
              } catch (t) {
                c.e(t);
              } finally {
                c.f();
              }
            }
          } catch (t) {
            o.e(t);
          } finally {
            o.f();
          }
        }
      } catch (t) {
        r.e(t);
      } finally {
        r.f();
      }
      (this.triggerEvent("tapYes", {
        start: e,
        end: n,
      }),
        this.setData({
          isShow: !1,
        }));
    },
  },
  lifetimes: {
    attached: function () {
      this.init();
      var createForOfIteratorHelper,
        a = this.hexToRgb(this.data.theme_color),
        e = "",
        n = "";
      for (var r in a) ((e += r), (n += a[r] + ","));
      ((t = this.hexify(e + "(" + n + ".1)")),
        this.setData({
          color2: createForOfIteratorHelper,
        }));
    },
  },
});
