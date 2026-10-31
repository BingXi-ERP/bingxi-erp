var interopRequireWildcard =
    require("../../../../@babel/runtime/helpers/interopRequireWildcard").default,
  a = (0, require("../../../../@babel/runtime/helpers/interopRequireDefault").default)(
    require("../../../..//utils/mta_analysis.js"),
  ),
  e =
    (require("../../../utils/util"),
    interopRequireWildcard(require("../../../components/ec-canvas/echarts"))),
  ServicesDataCenter = require("../../../services/ServicesDataCenter.js").ServicesDataCenter,
  app = getApp(),
  o = {
    chart0: null,
    chart1: null,
    chart2: null,
    chartsOption0: null,
    chartsOption1: null,
    chartsOption2: null,
  };
function s(t, a, n) {
  ((o["chart" + t.index] = e.init(t, null, {
    width: a,
    height: n,
  })),
    t.setChart(o["chart" + t.index]));
  var app = {
    color: ["#2F7BFD"],
    title: {
      x: "10",
      textStyle: {
        fontSize: 12,
      },
    },
    grid: {
      left: "3%",
      right: "8%",
      bottom: "12%",
      top: "12%",
      containLabel: !0,
    },
    tooltip: {
      show: !0,
      trigger: "axis",
      position: ["50%", "30%"],
      label: {
        normal: {
          show: !0,
        },
      },
      formatter: "{b0} : {c0}",
    },
    xAxis: {
      type: "category",
      data: [],
      axisLabel: {
        rotate: 0,
        formatter: function (a) {
          return a.length > 4 && 2 === t.index ? a.substring(0, 4) + "..." : a || "";
        },
      },
    },
    yAxis: {
      x: "center",
      type: "value",
      splitLine: {
        lineStyle: {
          type: "dashed",
        },
      },
    },
    series: [
      {
        type: "bar",
        smooth: !0,
        areaStyle: {},
        barWidth: 20,
        data: [],
      },
    ],
  };
  return ((o["chartsOption" + t.index] = app), o["chart" + t.index]);
}
Page({
  data: {
    noDataBg: "".concat(app.config.imgHost, "/img/customer/img_wuxinx@3x.png"),
    startDate: "",
    endDate: "",
    confirmDate: 2,
    et: {
      onInit: s,
    },
    ec: {
      onInit: s,
    },
    es: {
      onInit: s,
    },
    chartsDate: [],
    chartsData: [],
    shopId: null,
    globalApp: {},
  },
  onLoad: function (t) {
    (a.default.Page.init(),
      this.setData({
        globalApp: app,
        shopId: t.shopId,
      }));
  },
  onReady: function () {
    this.choosedWeek();
  },
  onShow: function () {},
  onHide: function () {},
  onUnload: function () {},
  onPullDownRefresh: function () {},
  onReachBottom: function () {},
  onShareAppMessage: function () {},
  changeTab: function (t) {
    (this.setData({
      tabActive: t.currentTarget.dataset.index,
    }),
      this.choosedWeek());
  },
  choosedWeek: function () {
    var interopRequireWildcard = this;
    ((this.data.startDate = this.getDay(-6)),
      (this.data.endDate = this.getDay(0)),
      this.setData({
        startDate: this.data.startDate,
        endDate: this.data.endDate,
        confirmDate: 2,
      }),
      setTimeout(function () {
        interopRequireWildcard.getCargoPassData();
      }, 300));
  },
  choosedMonth: function () {
    ((this.data.startDate = this.getDay(-30)),
      (this.data.endDate = this.getDay(0)),
      this.setData({
        startDate: this.data.startDate,
        endDate: this.data.endDate,
        confirmDate: 3,
      }),
      this.getCargoPassData());
  },
  getDay: function (t) {
    var a = new Date(),
      e = a.getTime() + 864e5 * t;
    a.setTime(e);
    var ServicesDataCenter = a.getFullYear(),
      app = a.getMonth(),
      o = a.getDate();
    return ServicesDataCenter + "-" + (i = s(app + 1)) + "-" + (o = s(o));
    function s(t) {
      var a = t;
      return (1 == t.toString().length && (a = "0" + t), a);
    }
  },
  bindStartDateChange: function (t) {
    t.detail.value.replace(/-/g, "") > this.data.endDate.replace(/-/g, "")
      ? wx.showToast({
          title: "开始日期不能大于结束日期",
          icon: "none",
        })
      : (this.setData({
          startDate: t.detail.value,
          confirmDate: 0,
        }),
        this.getCargoPassData());
  },
  bindEndDateChange: function (t) {
    var a = t.detail.value;
    this.data.startDate.replace(/-/g, "") > a.replace(/-/g, "")
      ? wx.showToast({
          title: "开始日期不能大于结束日期",
          icon: "none",
        })
      : (this.setData({
          endDate: t.detail.value,
          nowPageNum: 1,
          DataSourceList: [],
          confirmDate: 0,
        }),
        this.getCargoPassData());
  },
  getCargoPassData: function () {
    var interopRequireWildcard = this,
      a = {
        startTime: this.data.startDate + " 00:00:00",
        endTime: this.data.endDate + " 23:59:59",
      };
    Promise.all([
      ServicesDataCenter.countTop5ByRelease(a),
      ServicesDataCenter.countClick(a),
      ServicesDataCenter.countTop5BySearch(a),
    ]).then(function (a) {
      a.forEach(function (a, e) {
        if (0 === a.code) {
          var ServicesDataCenter,
            app,
            s,
            r,
            c =
              2 === e
                ? null === (n = a.data) || void 0 === ServicesDataCenter
                  ? void 0
                  : ServicesDataCenter.map(function (t) {
                      return t.businessProductName || "";
                    })
                : null === (i = a.data) || void 0 === app
                  ? void 0
                  : app.map(function (t) {
                      return t.date.split(" ")[0];
                    }),
            h =
              2 === e
                ? null === (s = a.data) || void 0 === s
                  ? void 0
                  : s.map(function (t) {
                      return t.count || 0;
                    })
                : null === (r = a.data) || void 0 === r
                  ? void 0
                  : r.map(function (t) {
                      return t.count || 0;
                    });
          ((o["chartsOption" + e].xAxis.data = c),
            (o["chartsOption" + e].series[0].data = h || []),
            (o["chartsOption" + e].series[0].barWidth =
              2 === interopRequireWildcard.data.confirmDate ? 20 : 4),
            o["chart" + e].setOption(o["chartsOption" + e]));
        } else
          wx.showToast({
            title: a.msg,
            icon: "none",
          });
      });
    });
  },
});
