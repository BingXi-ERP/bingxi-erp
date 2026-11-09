var interopRequireWildcard =
    require("../../../../@babel/runtime/helpers/interopRequireWildcard").default,
  a = require("../../../../@babel/runtime/helpers/interopRequireDefault").default,
  toConsumableArray = require("../../../../@babel/runtime/helpers/toConsumableArray"),
  mta_analysis = a(require("../../../../utils/mta_analysis.js")),
  echarts = interopRequireWildcard(require("../../../components/ec-canvas/echarts")),
  util = require("../../../utils/util"),
  ServicesDataCenter = require("../../../services/ServicesDataCenter.js").ServicesDataCenter,
  app = getApp(),
  d = null,
  u = null;
Page({
  data: {
    icon: {
      paihan: "".concat(app.config.imgHost, "/img/customer/duibuIcon/icon/ic_paihan@2x.png"),
      noDataBg: "".concat(app.config.imgHost, "/img/customer/img_wuxinx@3x.png"),
    },
    tabActive: 1,
    startDate: "",
    endDate: "",
    confirmDate: 2,
    ec: {
      onInit: function (t, a, e) {
        return (
          (d = echarts.init(t, null, {
            width: a,
            height: e,
          })),
          t.setChart(d),
          (u = {
            color: ["#2F7BFD"],
            title: {
              text: "(次)",
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
              position: ["50%", "50%"],
            },
            xAxis: {
              type: "category",
              boundaryGap: !1,
              data: [],
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
                type: "line",
                smooth: !0,
                areaStyle: {},
                data: [],
              },
            ],
          }),
          d
        );
      },
    },
    chartsDate: [],
    chartsData: [],
    orderAmount: "",
    receivableAmount: "",
    receivedAmount: "",
    refundAmount: "",
    dataSourceList: [],
    nowPageNum: 1,
    totalPage: 1,
    shopId: null,
  },
  onLoad: function (t) {
    var a = this;
    (mta_analysis.default.Page.init(),
      this.setData({
        shopId: t.shopId,
      }),
      setTimeout(function () {
        a.choosedWeek();
      }, 100));
  },
  onReady: function () {},
  onShow: function () {},
  onHide: function () {},
  onUnload: function () {},
  onPullDownRefresh: function () {},
  onReachBottom: function () {
    var interopRequireWildcard = this.data,
      a = interopRequireWildcard.totalPage,
      toConsumableArray = interopRequireWildcard.nowPageNum;
    ((this.data.nowPageNum = a > toConsumableArray ? toConsumableArray + 1 : toConsumableArray),
      a > toConsumableArray && this.orderList(a > toConsumableArray));
  },
  onShareAppMessage: function () {},
  changeTab: function (t) {
    (this.setData({
      tabActive: t.currentTarget.dataset.index,
    }),
      this.choosedWeek());
  },
  choosedWeek: function () {
    ((this.data.startDate = this.getDay(-6)),
      (this.data.endDate = this.getDay(0)),
      this.setData({
        startDate: this.data.startDate,
        endDate: this.data.endDate,
        confirmDate: 2,
        nowPageNum: 1,
        dataSourceList: [],
      }),
      this.orderSummary(),
      this.orderList());
  },
  choosedMonth: function () {
    ((this.data.startDate = this.getDay(-30)),
      (this.data.endDate = this.getDay(0)),
      this.setData({
        startDate: this.data.startDate,
        endDate: this.data.endDate,
        confirmDate: 3,
        nowPageNum: 1,
        dataSourceList: [],
      }),
      this.orderSummary(),
      this.orderList());
  },
  getDay: function (t) {
    var a = new Date(),
      toConsumableArray = a.getTime() + 864e5 * t;
    a.setTime(toConsumableArray);
    var mta_analysis = a.getFullYear(),
      echarts = a.getMonth(),
      util = a.getDate();
    return mta_analysis + "-" + (n = s(echarts + 1)) + "-" + (o = s(util));
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
          nowPageNum: 1,
          dataSourceList: [],
        }),
        this.orderSummary(),
        this.orderList());
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
          dataSourceList: [],
        }),
        this.orderSummary(),
        this.orderList());
  },
  orderSummary: function () {
    var interopRequireWildcard = this,
      a = {
        companyId: app.globalData.userInfo.companyId,
        userId: app.globalData.userInfo.id,
        startTime: this.data.startDate + " 00:00:00",
        endTime: this.data.endDate + " 23:59:59",
      };
    ServicesDataCenter.customerChartData(a).then(function (a) {
      if (0 === a.code) {
        var toConsumableArray = a.data.map(function (t) {
            var a;
            return (null === (a = t.date) || void 0 === a ? void 0 : a.split(" ")[0]) || "";
          }),
          mta_analysis = a.data.map(function (t) {
            return t.num || 0;
          });
        (interopRequireWildcard.setData({
          chartsDate: toConsumableArray,
          chartsData: mta_analysis,
        }),
          (u.xAxis.data = toConsumableArray),
          (u.series[0].data = mta_analysis),
          d.setOption(u));
      } else
        wx.showToast({
          title: a.msg,
          icon: "none",
        });
    });
  },
  orderList: function () {
    var interopRequireWildcard = this,
      a = arguments.length > 0 && void 0 !== arguments[0] && arguments[0],
      mta_analysis = this,
      echarts = {
        companyId: app.globalData.userInfo.companyId,
        userId: app.globalData.userInfo.id,
        startTime: this.data.startDate + " 00:00:00",
        endTime: this.data.endDate + " 23:59:59",
        page: this.data.nowPageNum,
        size: 10,
      };
    (wx.showLoading(),
      ServicesDataCenter.accessListV2(echarts).then(function (n) {
        if (0 === n.code) {
          var ServicesDataCenter = n.data.content || [];
          if (null == ServicesDataCenter || ServicesDataCenter.length < 1)
            return void wx.hideLoading();
          (ServicesDataCenter.forEach(function (t) {
            var a;
            null === (a = t.respList) ||
              void 0 === a ||
              a.forEach(function (t) {
                t.visitorHeadImg = util.utils.addDefaultAvatar(t.visitorHeadImg);
              });
          }),
            a &&
              (mta_analysis.data.dataSourceList = [].concat(
                toConsumableArray(mta_analysis.data.dataSourceList),
                toConsumableArray(ServicesDataCenter),
              )),
            interopRequireWildcard.setData({
              totalPage: n.data.totalPage,
              dataSourceList:
                1 === n.data.pageNo ? ServicesDataCenter : mta_analysis.data.dataSourceList,
            }),
            wx.hideLoading());
        } else
          wx.showToast({
            title: n.msg,
            icon: "none",
          });
      }));
  },
  toRankingList: function () {
    var interopRequireWildcard = this.data.shopId;
    wx.navigateTo({
      url: "/pages/index/ranking-list/ranking-list?shopId=".concat(interopRequireWildcard),
    });
  },
  formatDuring: function (t) {
    var a = new Date(t),
      toConsumableArray = (a.getFullYear(), a.getMonth(), a.getDate(), a.getHours()),
      mta_analysis = a.getMinutes(),
      echarts = a.getSeconds();
    return (
      (e = toConsumableArray < 10 ? "0" + toConsumableArray : toConsumableArray) +
      ":" +
      (i = mta_analysis < 10 ? "0" + mta_analysis : mta_analysis) +
      ":" +
      (n = echarts < 10 ? "0" + echarts : echarts)
    );
  },
});
