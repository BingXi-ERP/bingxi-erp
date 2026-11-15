var t = require("../../../../@babel/runtime/helpers/interopRequireDefault").default,
  objectSpread2 = require("../../../../@babel/runtime/helpers/objectSpread2"),
  ServicesDemandOrder = t(require("../../../services/ServicesDemandOrder")),
  services_demand = require("../../../services/services-demand.js").ServicesDemand,
  n = (require("../../../../libs/utils/time").parseTime, getApp());
Page({
  data: {
    fromPage: "",
    orderId: "",
    startDate: "",
    endDate: "",
    pageNum: 1,
    pageSize: 10,
    total: 0,
    moreIcon: !0,
    icon: [
      "".concat(n.config.imgHost, "/img/customer/Icon_WePay@2x.png"),
      "".concat(n.config.imgHost, "/img/customer/Icon_AliPay@2x.png"),
      "".concat(n.config.imgHost, "/img/customer/Icon_Cash@2x.png"),
      "".concat(n.config.imgHost, "/img/customer/Icon_CreditCard@2x.png"),
      "".concat(n.config.imgHost, "/img/customer/Icon_hh@2x.png"),
    ],
    listData: [],
    noDataBg: "".concat(n.config.imgHost, "/img/customer/img_wuxinx@3x.png"),
    iconInvalid: "".concat(n.config.imgHost, "/img/v2.8.0/Icon_Yzf@2x.png"),
  },
  onLoad: function (t) {
    (this.setData({
      fromPage: t.page,
      orderId: t.orderId ? t.orderId : "",
    }),
      "order" == t.page &&
        wx.setNavigationBarTitle({
          title: "已收金额记录",
        }));
  },
  onReady: function () {},
  onShow: function () {
    (this.setData({
      startDate: "",
      endDate: "",
    }),
      this.whichPage());
  },
  getDay: function (t) {
    var objectSpread2 = new Date(),
      ServicesDemandOrder = objectSpread2.getTime() + 864e5 * t;
    objectSpread2.setTime(ServicesDemandOrder);
    var services_demand = objectSpread2.getFullYear(),
      n = objectSpread2.getMonth(),
      m = objectSpread2.getDate();
    return services_demand + "-" + (n = r(n + 1)) + "-" + (m = r(m));
    function r(t) {
      var objectSpread2 = t;
      return (1 == t.toString().length && (a = "0" + t), objectSpread2);
    }
  },
  bindStartDateChange: function (t) {
    var objectSpread2 = t.detail.value;
    if (
      this.data.endDate &&
      "" != this.data.endDate &&
      objectSpread2.replace(/-/g, "") > this.data.endDate.replace(/-/g, "")
    )
      return (
        wx.showToast({
          title: "开始日期不能大于结束日期",
          icon: "none",
        }),
        void this.setData({
          startDate: "",
        })
      );
    (this.setData({
      startDate: objectSpread2,
      nowPageNum: 1,
      DataSourceList: [],
      confirmDate: 0,
    }),
      this.getList());
  },
  bindEndDateChange: function (t) {
    var objectSpread2 = t.detail.value;
    if (this.data.startDate.replace(/-/g, "") > objectSpread2.replace(/-/g, ""))
      return (
        wx.showToast({
          title: "开始日期不能大于结束日期",
          icon: "none",
        }),
        void this.setData({
          endDate: "",
        })
      );
    (this.setData({
      endDate: objectSpread2,
      nowPageNum: 1,
      DataSourceList: [],
      confirmDate: 0,
    }),
      this.getList());
  },
  whichPage: function () {
    "due" == this.data.fromPage
      ? this.getList()
      : "order" == this.data.fromPage && this.getOrderList();
  },
  getList: function () {
    var t = this,
      ServicesDemandOrder = this.data.startDate && this.data.startDate + " 00:00:00",
      n = this.data.endDate && this.data.endDate + " 23:59:59",
      m = {
        dateTime: ServicesDemandOrder || n ? [ServicesDemandOrder, n] : [],
        page: this.data.pageNum,
        size: this.data.pageSize,
        orderByFlag: this.data.orderByFlag,
      };
    this.data.listData.length > this.data.total ||
    (this.data.total > 0 && this.data.pageNum > Math.ceil(this.data.total / this.data.pageSize))
      ? this._closeMore()
      : services_demand.shopPaymentList(m).then(function (e) {
          if (0 == e.code) {
            var services_demand = e.data.content;
            if (
              (e.data.isLastPage ? t._closeMore() : t._showMore(),
              t.setData({
                total: Number(e.data.total),
              }),
              1 === t.data.pageNum &&
                t.setData({
                  listData: services_demand.map(function (e) {
                    return objectSpread2(
                      objectSpread2({}, e),
                      {},
                      {
                        shopId: e.shopId,
                        customerId: e.customerId,
                        customerName: e.customerName,
                        paymentNo: e.paymentNo,
                        paymentType: e.paymentType,
                        sourceType: e.sourceType,
                        remark: e.remark,
                        paymentDate: e.paymentDate,
                        debtAmount: t.formatNumberRgx(e.debtAmount),
                        discountAmount: t.formatNumberRgx(e.discountAmount),
                        wxAmount: e.wxAmount > 0 ? t.formatNumberRgx(e.wxAmount) : null,
                        alipayAmount: e.alipayAmount > 0 ? t.formatNumberRgx(e.alipayAmount) : null,
                        cashAmount: e.cashAmount > 0 ? t.formatNumberRgx(e.cashAmount) : null,
                        cardAmount: e.cardAmount > 0 ? t.formatNumberRgx(e.cardAmount) : null,
                        remitAmount: e.remitAmount > 0 ? t.formatNumberRgx(e.remitAmount) : null,
                        totalAmount: e.totalAmount > 0 ? t.formatNumberRgx(e.totalAmount) : null,
                      },
                    );
                  }),
                }),
              t.data.pageNum > 1)
            ) {
              var n = t.data.listData;
              t.setData({
                listData: n.concat(
                  services_demand.map(function (e) {
                    return objectSpread2(
                      objectSpread2({}, e),
                      {},
                      {
                        shopId: e.shopId,
                        customerId: e.customerId,
                        customerName: e.customerName,
                        paymentNo: e.paymentNo,
                        paymentDate: e.paymentDate,
                        paymentType: e.paymentType,
                        sourceType: e.sourceType,
                        remark: e.remark,
                        debtAmount: t.formatNumberRgx(e.debtAmount),
                        discountAmount: t.formatNumberRgx(e.discountAmount),
                        wxAmount: e.wxAmount > 0 ? t.formatNumberRgx(e.wxAmount) : null,
                        alipayAmount: e.alipayAmount > 0 ? t.formatNumberRgx(e.alipayAmount) : null,
                        cashAmount: e.cashAmount > 0 ? t.formatNumberRgx(e.cashAmount) : null,
                        cardAmount: e.cardAmount > 0 ? t.formatNumberRgx(e.cardAmount) : null,
                        remitAmount: e.remitAmount > 0 ? t.formatNumberRgx(e.remitAmount) : null,
                        totalAmount: e.totalAmount > 0 ? t.formatNumberRgx(e.totalAmount) : null,
                      },
                    );
                  }),
                ),
              });
            }
          } else
            wx.showToast({
              title: e.msg,
              icon: "none",
              duration: 1500,
            });
        });
  },
  getOrderList: function () {
    var t = this;
    this.data.listData.length > this.data.total ||
    (this.data.total > 0 && this.data.pageNum > Math.ceil(this.data.total / this.data.pageSize))
      ? this._closeMore()
      : ServicesDemandOrder.default.paymentList(this.data.orderId).then(function (e) {
          if (0 == e.code) {
            e.data;
            if (
              (t.setData({
                total: Number(e.data.total),
              }),
              1 === t.data.pageNum &&
                t.setData({
                  listData: e.data.map(function (e) {
                    return objectSpread2(
                      objectSpread2({}, e),
                      {},
                      {
                        shopId: e.shopId,
                        customerId: e.customerId,
                        customerName: e.customerName,
                        paymentNo: e.paymentNo,
                        paymentType: e.paymentType,
                        sourceType: e.sourceType,
                        customerPaymentId: e.customerPaymentId,
                        remark: e.remark,
                        paymentDate: e.paymentDate,
                        debtAmount: t.formatNumberRgx(e.debtAmount),
                        discountAmount: t.formatNumberRgx(e.discountAmount),
                        wxAmount: e.wxAmount > 0 ? t.formatNumberRgx(e.wxAmount) : null,
                        alipayAmount: e.alipayAmount > 0 ? t.formatNumberRgx(e.alipayAmount) : null,
                        cashAmount: e.cashAmount > 0 ? t.formatNumberRgx(e.cashAmount) : null,
                        cardAmount: e.cardAmount > 0 ? t.formatNumberRgx(e.cardAmount) : null,
                        remitAmount: e.remitAmount > 0 ? t.formatNumberRgx(e.remitAmount) : null,
                        totalAmount: e.totalAmount > 0 ? t.formatNumberRgx(e.totalAmount) : null,
                      },
                    );
                  }),
                }),
              t.data.pageNum > 1)
            ) {
              var services_demand = t.data.listData;
              t.setData({
                listData: services_demand.concat(
                  e.data.map(function (e) {
                    return objectSpread2(
                      objectSpread2({}, e),
                      {},
                      {
                        shopId: e.shopId,
                        customerId: e.customerId,
                        customerName: e.customerName,
                        paymentNo: e.paymentNo,
                        paymentType: e.paymentType,
                        sourceType: e.sourceType,
                        remark: e.remark,
                        customerPaymentId: e.customerPaymentId,
                        paymentDate: e.paymentDate,
                        debtAmount: t.formatNumberRgx(e.debtAmount),
                        discountAmount: t.formatNumberRgx(e.discountAmount),
                        wxAmount: e.wxAmount > 0 ? t.formatNumberRgx(e.wxAmount) : null,
                        alipayAmount: e.alipayAmount > 0 ? t.formatNumberRgx(e.alipayAmount) : null,
                        cashAmount: e.cashAmount > 0 ? t.formatNumberRgx(e.cashAmount) : null,
                        cardAmount: e.cardAmount > 0 ? t.formatNumberRgx(e.cardAmount) : null,
                        remitAmount: e.remitAmount > 0 ? t.formatNumberRgx(e.remitAmount) : null,
                        totalAmount: e.totalAmount > 0 ? t.formatNumberRgx(e.totalAmount) : null,
                      },
                    );
                  }),
                ),
              });
            }
          } else
            wx.showToast({
              title: e.msg,
              icon: "none",
              duration: 1500,
            });
        });
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
  formatNumberRgx: function (t) {
    if (t) {
      var objectSpread2 = Number(t).toFixed(2).toString().split(".");
      return (
        (objectSpread2[0] = objectSpread2[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",")),
        objectSpread2.join(".")
      );
    }
    return Number(t).toFixed(2);
  },
  onHide: function () {},
  onUnload: function () {},
  onPullDownRefresh: function () {},
  onReachBottom: function () {
    ("due" == this.data.fromPage &&
      (this.data.total <= 10 ? (this.data.pageNum = 1) : (this.data.pageNum += 1),
      this.setData({
        pageNum: this.data.pageNum,
      }),
      this.getList()),
      wx.showLoading({
        title: "玩命加载中",
      }),
      wx.hideLoading());
  },
  onShareAppMessage: function () {},
});
