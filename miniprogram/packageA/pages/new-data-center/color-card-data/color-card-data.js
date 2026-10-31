var interopRequireWildcard =
    require("../../../../@babel/runtime/helpers/interopRequireWildcard").default,
  a = require("../../../../@babel/runtime/helpers/interopRequireDefault").default,
  toConsumableArray = require("../../../../@babel/runtime/helpers/toConsumableArray"),
  mta_analysis = a(require("../../../..//utils/mta_analysis.js")),
  util = require("../../../utils/util"),
  echarts = interopRequireWildcard(require("../../../components/ec-canvas/echarts")),
  ServicesDataCenter = require("../../../services/ServicesDataCenter.js").ServicesDataCenter,
  app = getApp(),
  d = null,
  u = null;
Page({
  data: {
    icon: {
      paihan: "".concat(app.config.imgHost, "/img/customer/duibuIcon/icon/ic_paihan@2x.png"),
      noDataBg: "".concat(app.config.imgHost, "/img/customer/img_wuxinx@3x.png"),
      rightArrow: "".concat(app.config.imgHost, "/img/customer/ic_jinru.png"),
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
              text: "(份)",
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
    DataSourceList: [],
    nowPageNum: 1,
    totalPage: 1,
    shopId: null,
    globalApp: {},
  },
  onLoad: function (t) {
    (mta_analysis.default.Page.init(),
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
        DataSourceList: [],
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
        DataSourceList: [],
      }),
      this.orderSummary(),
      this.orderList());
  },
  getDay: function (t) {
    var a = new Date(),
      toConsumableArray = a.getTime() + 864e5 * t;
    a.setTime(toConsumableArray);
    var mta_analysis = a.getFullYear(),
      util = a.getMonth(),
      echarts = a.getDate();
    return mta_analysis + "-" + (n = r(util + 1)) + "-" + (o = r(echarts));
    function r(t) {
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
          DataSourceList: [],
          confirmDate: 0,
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
          DataSourceList: [],
          confirmDate: 0,
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
    ServicesDataCenter.chartData(a).then(function (a) {
      if (0 === a.code) {
        var toConsumableArray,
          mta_analysis,
          util =
            null === (e = a.data) || void 0 === toConsumableArray
              ? void 0
              : toConsumableArray.map(function (t) {
                  return t.date.split(" ")[0];
                }),
          echarts =
            null === (i = a.data) || void 0 === mta_analysis
              ? void 0
              : mta_analysis.map(function (t) {
                  return t.num;
                });
        (interopRequireWildcard.setData({
          chartsDate: util,
          chartsData: echarts,
        }),
          (u.xAxis.data = util),
          (u.series[0].data = echarts),
          d.setOption(u),
          console.log(u));
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
        pageNum: this.data.nowPageNum,
        pageSize: 10,
      };
    (wx.showLoading(),
      ServicesDataCenter.goodsListV2(echarts).then(function (o) {
        if (0 === o.code) {
          var ServicesDataCenter = o.data.content || [];
          if (null == ServicesDataCenter || ServicesDataCenter.length < 1)
            return void wx.hideLoading();
          (ServicesDataCenter.forEach(function (t) {
            (t.respList.forEach(function (t) {
              t.goodsImgPath = util.utils.addDefaultAvatar(t.goodsImgPath);
            }),
              (t.orderDate = t.date));
          }),
            console.log(ServicesDataCenter),
            a &&
              (mta_analysis.data.DataSourceList = [].concat(
                toConsumableArray(mta_analysis.data.DataSourceList),
                toConsumableArray(ServicesDataCenter),
              )),
            interopRequireWildcard.setData({
              totalPage: o.data.totalPage,
              DataSourceList:
                1 === o.data.pageNo ? ServicesDataCenter : mta_analysis.data.DataSourceList,
            }),
            wx.hideLoading());
        } else
          wx.showToast({
            title: o.msg,
            icon: "none",
          });
      }));
  },
  toRankingList: function () {
    var interopRequireWildcard = app.globalData.userInfo.companyId,
      a = app.globalData.userInfo.id;
    wx.navigateTo({
      url: "/pages/index/ranking-list/ranking-list?shopId="
        .concat(interopRequireWildcard, "&userId=")
        .concat(a),
    });
  },
});
