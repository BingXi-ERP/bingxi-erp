var services_demand = require("../../../services/services-demand"),
  ServicesUserLog = require("../../../services/ServicesUserLog"),
  app = getApp();
Page({
  data: {
    hexiao: 0,
    currentCrm: "",
    parentMsg: {},
    orderFlag: 0,
    startTime: "",
    endTime: "",
    currentSum: " - ",
    sumNum: "",
    listData: [],
    icon: {
      checked: "".concat(app.config.imgHost, "/img/customer/Control_Choiced@3x.png"),
      noCheck: "".concat(app.config.imgHost, "/img/customer/Control_NotChoice@3x.png"),
      invalid: "".concat(app.config.imgHost, "/img/v2.8.0/Icon_Yzf@2x.png"),
      noDataBg: "".concat(app.config.imgHost, "/img/customer/img_wuxinx@3x.png"),
    },
    selectedStatusArr: [],
    selectedArr: [],
    selctedList: [],
    pageNum: 1,
    pageSize: 10,
    total: 0,
    moreIcon: !0,
    totalAmount: 0,
  },
  onLoad: function (t) {
    ((this.data.parentMsg = t),
      this.setData({
        parentMsg: t,
      }),
      wx.setNavigationBarTitle({
        title: t.custName ? t.custName : "客户欠款详情",
      }),
      this.getcurrentCrm(this.data.parentMsg),
      this.getCurrentList(this.data.parentMsg));
  },
  onReady: function () {},
  onShow: function () {
    wx.getStorageSync("due-change") &&
      ((this.data.pageNum = 1),
      this.getcurrentCrm(this.data.parentMsg),
      this.getCurrentList(this.data.parentMsg),
      this.setData({
        totalAmount: 0,
        selctedList: [],
        selectedStatusArr: [],
      }));
  },
  allListTab: function () {
    this.backTop();
    (this.setData({
      orderFlag: 0,
      pageNum: 1,
      totalAmount: 0,
      selectedArr: [],
      selctedList: [],
      selectedStatusArr: [],
    }),
      this.getCurrentList(this.data.parentMsg));
  },
  debtListTab: function () {
    this.backTop();
    (this.setData({
      orderFlag: 1,
      pageNum: 1,
      totalAmount: 0,
      selectedArr: [],
      selctedList: [],
      selectedStatusArr: [],
    }),
      this.getCurrentList(this.data.parentMsg));
  },
  backTop: function () {
    wx.pageScrollTo({
      scrollTop: 0,
      duration: 300,
    });
  },
  checkTap: function (t) {
    var ServicesUserLog = t.currentTarget.dataset,
      app = ServicesUserLog.id,
      n = ServicesUserLog.amount,
      i = ServicesUserLog.index;
    if (1 == ServicesUserLog.type) {
      var s = this.data.selectedStatusArr,
        r = this.data.selectedArr;
      if (((s[i] = !s[i]), s[i]))
        r.push({
          id: app,
          amount: n,
        });
      else for (var o = 0; o < r.length; o++) r[o].id == app && r.splice(o, 1);
      var d = 0,
        u = [];
      (r.map(function (t) {
        return ((d += Number(t.amount)), u.push(t.id), u);
      }),
        this.setData({
          selectedStatusArr: s,
          selectedArr: r,
          selctedList: u,
          totalAmount: d,
        }));
    }
  },
  goOrderDetail: function (t) {
    console.log(t);
    var ServicesUserLog,
      app = t.currentTarget.dataset,
      n = app.id,
      i = app.type;
    4 == i ||
      (i >= 6 && i < 9) ||
      ((e =
        3 == i || 9 == i
          ? "/packageB/pages/sales-return/sales-return-list/sales-return-list-detail/index?id=".concat(
              n,
            )
          : "/pages/order/detail/index?orderId=".concat(n)),
      wx.navigateTo({
        url: ServicesUserLog,
      }));
  },
  onClose: function () {
    console.log(123);
  },
  onHide: function () {},
  onUnload: function () {},
  onPullDownRefresh: function () {},
  onReachBottom: function () {
    (this.data.total <= 10 ? (this.data.pageNum = 1) : (this.data.pageNum += 1),
      this.setData({
        pageNum: this.data.pageNum,
      }),
      this.getCurrentList(this.data.parentMsg),
      wx.showLoading({
        title: "玩命加载中",
      }),
      wx.hideLoading());
  },
  onShareAppMessage: function () {},
  getcurrentCrm: function (e) {
    var app = this;
    wx.showLoading({
      title: "加载中...",
    });
    var n = {
      dateTime: [this.data.startTime, this.data.endTime],
      shopId: e.shopId,
      customerId: e.custId,
    };
    services_demand.ServicesDemand.getCrmDebtAmount(n).then(function (t) {
      0 == t.code
        ? (wx.hideLoading(),
          t.data
            ? app.setData({
                currentCrm: t.data,
                sumNum: t.data.deptSumAmount,
                currentSum: t.data.deptSumAmount,
                billingPayableAmount: t.data.billingPayableAmount,
                actualReceivedAmount: t.data.actualReceivedAmount,
                hexiao: t.data.verification,
              })
            : app.setData({
                sumNum: "",
                currentSum: " - ",
              }))
        : wx.showToast({
            title: t.msg,
            icon: "none",
            duration: 1500,
          });
    });
  },
  getCurrentList: function (e) {
    var app = this;
    wx.showLoading({
      title: "加载中...",
    });
    var n = this.data,
      i = n.listData,
      s = n.total,
      r = n.pageSize,
      o = {
        dateTime: [this.data.startTime, this.data.endTime],
        shopId: e.shopId,
        customerId: e.custId,
        page: this.data.pageNum,
        size: this.data.pageSize,
        orderFlag: this.data.orderFlag,
      };
    i.length > s || (s > 0 && this.data.pageNum > Math.ceil(s / r))
      ? this._closeMore()
      : services_demand.ServicesDemand.getCrmSaleBillingList(o).then(function (t) {
          if (0 == t.code) {
            wx.hideLoading();
            var ServicesUserLog = t.data.content;
            if (
              (t.data.isLastPage ? app._closeMore() : app._showMore(),
              app.setData({
                total: Number(t.data.total),
              }),
              1 === app.data.pageNum)
            ) {
              var n = [];
              ServicesUserLog.length > 0
                ? ((n = ServicesUserLog),
                  app.setData({
                    listData: n.map(function (t) {
                      return {
                        id: t.id,
                        billingNo: t.billingNo,
                        billingType: t.billingType,
                        orderAmount: t.orderAmount,
                        discountAmount: t.discountAmount,
                        refundAmount: t.refundAmount,
                        paymentAmount: t.paymentAmount,
                        receivedAmount: t.receivedAmount,
                        returnedGoodsAmount: t.returnedGoodsAmount,
                        sortTime: t.sortTime,
                        billingUser: t.billingUser,
                        payable: t.payableAmount,
                        payableAmount: t.payableAmount,
                        paymentCancelAmount: t.paymentCancelAmount,
                      };
                    }),
                  }))
                : app.setData({
                    listData: n,
                  });
            }
            if (app.data.pageNum > 1) {
              var i = app.data.listData;
              app.setData({
                listData: i.concat(
                  ServicesUserLog.map(function (t) {
                    return {
                      id: t.id,
                      billingNo: t.billingNo,
                      billingType: t.billingType,
                      orderAmount: t.orderAmount,
                      discountAmount: t.discountAmount,
                      refundAmount: t.refundAmount,
                      paymentAmount: t.paymentAmount,
                      receivedAmount: t.receivedAmount,
                      returnedGoodsAmount: t.returnedGoodsAmount,
                      sortTime: t.sortTime,
                      billingUser: t.billingUser,
                      payable: t.payableAmount,
                      payableAmount: t.payableAmount,
                      paymentCancelAmount: t.paymentCancelAmount,
                    };
                  }),
                ),
              });
            }
          } else
            wx.showToast({
              title: t.msg,
              icon: "none",
              duration: 1500,
            });
        });
  },
  toRefresh: function (t) {
    var ServicesUserLog = getCurrentPages(),
      app = ServicesUserLog.find(function (t) {
        return (
          "packageA/pages/new-data-center/customer-balance-due/customer-balance-due" === t.route
        );
      });
    app &&
      (app.setData({
        pageNum: 1,
        listData: [],
      }),
      app.getCrmList(t));
  },
  choosedWeek: function () {
    ((this.data.startTime = this.getDay(-6)),
      (this.data.endTime = this.getDay(0)),
      this.setData({
        startTime: this.data.startTime,
        endTime: this.data.endTime,
        confirmDate: 2,
        nowPageNum: 1,
        DataSourceList: [],
      }),
      this.getcurrentCrm(this.data.parentMsg),
      this.getCurrentList(this.data.parentMsg));
  },
  getDay: function (t) {
    var ServicesUserLog = new Date(),
      app = ServicesUserLog.getTime() + 864e5 * t;
    ServicesUserLog.setTime(app);
    var n = ServicesUserLog.getFullYear(),
      i = ServicesUserLog.getMonth(),
      s = ServicesUserLog.getDate();
    return n + "-" + (i = r(i + 1)) + "-" + (s = r(s));
    function r(t) {
      var ServicesUserLog = t;
      return (1 == t.toString().length && (e = "0" + t), ServicesUserLog);
    }
  },
  bindStartDateChange: function (t) {
    var app = t.detail.value;
    "" !== this.data.endTime && app.replace(/-/g, "") > this.data.endTime.replace(/-/g, "")
      ? wx.showToast({
          title: "开始日期不能大于结束日期",
          icon: "none",
        })
      : (this.setData({
          startTime: t.detail.value,
          nowPageNum: 1,
          DataSourceList: [],
          confirmDate: 0,
        }),
        ServicesUserLog.servicesUserLog.setUserHandleLog(406),
        this.getcurrentCrm(this.data.parentMsg),
        this.getCurrentList(this.data.parentMsg));
  },
  bindEndDateChange: function (t) {
    var ServicesUserLog = t.detail.value;
    this.data.startTime.replace(/-/g, "") > ServicesUserLog.replace(/-/g, "")
      ? wx.showToast({
          title: "开始日期不能大于结束日期",
          icon: "none",
        })
      : (this.setData({
          endTime: t.detail.value,
          nowPageNum: 1,
          DataSourceList: [],
          confirmDate: 0,
        }),
        this.getcurrentCrm(this.data.parentMsg),
        this.getCurrentList(this.data.parentMsg));
  },
  gotoPrint: function () {
    var services_demand;
    t = this.data.orderFlag;
    var ServicesUserLog = "customerId="
      .concat(this.data.parentMsg.custId, "&startTime=")
      .concat(this.data.startTime, "&endTime=")
      .concat(this.data.endTime, "&onlyDebt=")
      .concat(services_demand, "&billingIds=")
      .concat(this.data.selctedList);
    wx.navigateTo({
      url: "/packageA/pages/new-data-center/print-view/print-view?".concat(ServicesUserLog),
    });
  },
  onHexiaoOnkey: function () {
    var ServicesUserLog = this;
    (wx.showLoading({
      title: "加载中...",
    }),
      services_demand.ServicesDemand.oneKeyHexiao(this.data.parentMsg.custId).then(function (t) {
        0 == t.code &&
          (wx.hideLoading(),
          wx.showToast({
            title: "成功",
            icon: "none",
          }),
          ServicesUserLog.getcurrentCrm(ServicesUserLog.data.parentMsg),
          ServicesUserLog.getCurrentList(ServicesUserLog.data.parentMsg));
      }));
  },
  _showMore: function () {
    this.setData({
      moreIcon: !0,
    });
  },
  _closeMore: function () {
    this.setData({
      moreIcon: !1,
    });
  },
  gotoRefund: function () {
    var services_demand = {
      customerId: this.data.parentMsg.custId,
      shopId: this.data.parentMsg.shopId,
      custName: this.data.parentMsg.custName,
      startTime: this.data.startTime && this.data.startTime + " 00:00:00",
      endTime: this.data.endTime && this.data.endTime + " 23:59:59",
    };
    ((t = JSON.stringify(services_demand)),
      ServicesUserLog.servicesUserLog.setUserHandleLog(404),
      wx.navigateTo({
        url: "/packageA/pages/new-data-center/customer-balance-receivables/customer-balance-receivables?query=".concat(
          services_demand,
          "&&orderType=1",
        ),
      }));
  },
  gotoReceive: function () {
    var services_demand = {
      customerId: this.data.parentMsg.custId,
      shopId: this.data.parentMsg.shopId,
      custName: this.data.parentMsg.custName,
      startTime: this.data.startTime && this.data.startTime + " 00:00:00",
      endTime: this.data.endTime && this.data.endTime + " 23:59:59",
      total: 0 != this.data.totalAmount ? this.data.totalAmount : this.data.currentSum,
      selectedList: this.data.selctedList,
      sumNum: this.data.currentSum,
    };
    Number(this.data.currentSum) <= 0
      ? wx.showToast({
          title: "没有可收款的订单哦",
          icon: "none",
        })
      : ((t = JSON.stringify(services_demand)),
        ServicesUserLog.servicesUserLog.setUserHandleLog(405),
        wx.navigateTo({
          url: "/packageA/pages/new-data-center/customer-balance-receivables/customer-balance-receivables?query=".concat(
            services_demand,
          ),
        }));
  },
});
