var interopRequireWildcard =
    require("../../../../@babel/runtime/helpers/interopRequireWildcard").default,
  a = (0, require("../../../../@babel/runtime/helpers/interopRequireDefault").default)(
    require("../../../..//utils/mta_analysis.js"),
  ),
  echarts = interopRequireWildcard(require("../../../components/ec-canvas/echarts")),
  ServicesDataCenter = require("../../../services/ServicesDataCenter.js").ServicesDataCenter,
  i = (require("../../../../libs/utils/util").utils, getApp()),
  s = null,
  n = null;
Page({
  data: {
    userAuthList: {},
    explain: {
      1: "该数据统计所选时间内开单完成的订单金额总和，不包含作废订单。",
      2: "该数据统计所选时间内的订单待收款的总和，不包含作废订单。",
      3: "该数据统计所选时间内的订单已收款的总和，不包含作废订单。",
      4: "该数据统计所选时间内作废订单中退回的已收款总和。",
    },
    tabDisplay: {
      1: "销售额(元)",
      2: "待收款(元)",
      3: "已收款(元)",
      4: "已退货(元)",
    },
    initImgApp: i,
    icon: {
      gantan: "".concat(i.config.imgHost, "/img/customer/duibuIcon/icon/ic_gantan@2x.png"),
      noDataBg: "".concat(i.config.imgHost, "/img/customer/img_wuxinx@3x.png"),
      sales: "".concat(
        i.config.imgHost,
        "/img/customer/duibuIcon/icon/Icon_DataCenter_Sales@2x.png",
      ),
    },
    tabActive: 1,
    startDate: "",
    endDate: "",
    confirmDate: 2,
    ec: {
      onInit: function (t, a, o) {
        return (
          (s = echarts.init(t, null, {
            width: a,
            height: o,
          })),
          t.setChart(s),
          (n = {
            color: ["#2F7BFD"],
            title: {
              text: "(元)",
              x: "10",
              textStyle: {
                fontSize: 10,
              },
            },
            grid: {
              left: "3%",
              right: "8%",
              bottom: "8%",
              top: "14%",
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
              axisLabel: {
                formatter: function (t) {
                  return (
                    (t >= 1e4 || t <= -1e4) && (t = t / 1e4 + "W"),
                    (t >= 1e3 || t <= -1e3) && (t = t / 1e3 + "K"),
                    t
                  );
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
          s
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
    chooseRole: 1,
  },
  onLoad: function (t) {
    (a.default.Page.init(),
      this.setData({
        userAuthList: i.userAuthList,
      }));
  },
  onReady: function () {
    if (this.data.userAuthList["stat:summary:person"])
      ((this.data.chooseRole = 1),
        this.setData({
          chooseRole: this.data.chooseRole,
        }),
        this.choosedWeek());
    else {
      if (!this.data.userAuthList["stat:summary"])
        return void wx.showToast({
          title: "暂无查看权限",
          icon: "none",
        });
      ((this.data.chooseRole = 2),
        this.setData({
          chooseRole: this.data.chooseRole,
        }),
        this.choosedWeek());
    }
  },
  onShow: function () {},
  onHide: function () {},
  onUnload: function () {},
  onPullDownRefresh: function () {},
  onReachBottom: function () {
    this.data.nowPageNum >= this.data.totalPage ||
      ((this.data.nowPageNum =
        this.data.totalPage > this.data.nowPageNum
          ? this.data.nowPageNum + 1
          : this.data.nowPageNum),
      this.orderList(this.data.totalPage > this.data.nowPageNum));
  },
  onShareAppMessage: function () {},
  changeTab: function (t) {
    (this.setData({
      tabActive: t.currentTarget.dataset.index,
    }),
      this.choosedWeek());
  },
  switchRoleTo: function () {
    (1 === this.data.chooseRole
      ? ((this.data.chooseRole = 2), (this.data.nowPageNum = 1))
      : ((this.data.chooseRole = 1), (this.data.nowPageNum = 1)),
      this.setData({
        DataSourceList: [],
      }),
      this.orderSummary(),
      this.orderList(),
      this.setData({
        chooseRole: this.data.chooseRole,
        nowPageNum: this.data.nowPageNum,
      }));
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
      echarts = a.getTime() + 864e5 * t;
    a.setTime(echarts);
    var ServicesDataCenter = a.getFullYear(),
      i = a.getMonth(),
      s = a.getDate();
    return ServicesDataCenter + "-" + (i = n(i + 1)) + "-" + (s = n(s));
    function n(t) {
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
      a = this.data,
      echarts = a.chooseRole,
      r = a.tabActive,
      d = a.startDate,
      u = a.endDate,
      c = {
        companyId: i.globalData.userInfo.companyId,
        statusType: r,
        startTime: d + " 00:00:00",
        endTime: u + " 23:59:59",
        userId: 1 === echarts ? i.globalData.userInfo.id : null,
      };
    ServicesDataCenter.summary(c).then(function (a) {
      0 === a.code
        ? (interopRequireWildcard.setData({
            chartsDate: a.data.dateList,
            chartsData: a.data.valueList,
            orderAmount: a.data.orderAmount,
            receivableAmount: a.data.receivableAmount,
            receivedAmount: a.data.receivedAmount,
            returnedGoodsAmount: a.data.returnedGoodsAmount,
          }),
          (n.xAxis.data = a.data.dateList),
          (n.series[0].data = a.data.valueList),
          s.setOption(n))
        : wx.showToast({
            title: a.msg,
            icon: "none",
          });
    });
  },
  orderList: function () {
    var interopRequireWildcard = this,
      a = arguments.length > 0 && void 0 !== arguments[0] && arguments[0],
      echarts = this,
      s = this.data,
      n = s.chooseRole,
      r = s.tabActive,
      d = s.startDate,
      u = s.endDate,
      c = s.nowPageNum,
      h = {
        companyId: i.globalData.userInfo.companyId,
        statusType: r,
        startTime: d + " 00:00:00",
        endTime: u + " 23:59:59",
        page: c,
        userId: 1 === n ? i.globalData.userInfo.id : null,
        size: 10,
      };
    (wx.showLoading(),
      ServicesDataCenter.orderList(h).then(function (o) {
        if (0 === o.code) {
          echarts.data.totalPage = o.data.totalPage;
          var i = o.data.content || [];
          if (i.length < 1)
            return (
              0 === Number(o.data.total) &&
                interopRequireWildcard.setData({
                  DataSourceList: [],
                }),
              void wx.hideLoading()
            );
          if (
            (i.forEach(function (t) {
              t.orderDate = t.orderDate.split(" ")[0];
            }),
            a || (c === o.data.totalPage && 1 !== o.data.totalPage))
          ) {
            if (
              echarts.data.DataSourceList[echarts.data.DataSourceList.length - 1].orderDate ==
              i[0].orderDate
            ) {
              i[0].orderList.forEach(function (t) {
                echarts.data.DataSourceList[echarts.data.DataSourceList.length - 1].orderList.push(
                  t,
                );
              });
              for (var s = 1; s < i.length; s++) echarts.data.DataSourceList.push(i[s]);
            } else
              i.forEach(function (t) {
                echarts.data.DataSourceList.push(t);
              });
            interopRequireWildcard.setData({
              DataSourceList: echarts.data.DataSourceList,
            });
          } else
            interopRequireWildcard.setData({
              DataSourceList: echarts.data.DataSourceList.concat(i),
            });
          wx.hideLoading();
        } else
          wx.showToast({
            title: o.msg,
            icon: "none",
          });
      }));
  },
  toDetail: function (t) {
    if (this.data.userAuthList["order:query"]) {
      var a = t.currentTarget.dataset.orderid,
        echarts = t.currentTarget.dataset.receivedtype;
      4 == this.data.tabActive || (2 == this.data.tabActive && 22 == echarts)
        ? wx.navigateTo({
            url: "/packageB/pages/sales-return/sales-return-list/sales-return-list-detail/index?id=".concat(
              a,
            ),
          })
        : wx.navigateTo({
            url: "/pages/order/detail/index?orderId=".concat(a),
          });
    } else
      wx.showToast({
        title: "没有权限",
        icon: "none",
      });
  },
});
