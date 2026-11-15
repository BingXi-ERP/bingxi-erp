var toConsumableArray = require("../../../../@babel/runtime/helpers/toConsumableArray"),
  ServicesDataCenter = require("../../../services/ServicesDataCenter"),
  app = getApp();
Page({
  data: {
    params: {
      dateTime: ["2023-01-01 00:00:00", "2024-01-01 00:00:00"],
      isLock: !1,
      keyword: "",
      orderByType: 1,
      page: 1,
      size: 15,
      sort: "",
    },
    confirmDate: 2,
    startDate: "",
    endDate: "",
    productList: [],
    pageNo: 1,
    pageSize: 15,
    total: 22,
    totalPage: 2,
    billingItemCount: 0,
    billingPricingQuantity: 0,
    orderAmount: 0,
    icon: {
      up: "".concat(
        app.config.imgHost,
        "/img/customer/duibuIcon/icon/Icon_Sorting_Down_Gray@2x.png",
      ),
      down: "/assets/images/icon2nd/Icon_Sorting_Up_Gray@2x.png",
    },
  },
  handleClickProduct: function (t) {
    console.log(t);
    var ServicesDataCenter = t.currentTarget.dataset;
    wx.navigateTo({
      url: "/packageA/pages/new-data-center/marketingDetail/index?billingItemCount="
        .concat(ServicesDataCenter.billingitemcount, "&billingPricingQuantity=")
        .concat(ServicesDataCenter.billingpricingquantity, "&orderAmount=")
        .concat(ServicesDataCenter.coloramount, "&billingids=")
        .concat(ServicesDataCenter.billingids, "&goodsid=")
        .concat(ServicesDataCenter.goodsid, "&quantityunit=")
        .concat(ServicesDataCenter.quantityunit, "&goodsname=")
        .concat(ServicesDataCenter.goodsname, "&time=")
        .concat(this.data.startDate, " - ")
        .concat(this.data.endDate),
    });
  },
  getData: function () {
    var app = this;
    ServicesDataCenter.ServicesDataCenter.productList(this.data.params).then(function (a) {
      0 == a.code &&
        app.setData({
          productList:
            1 === app.data.params.page
              ? a.data.pageResult.content
              : [].concat(
                  toConsumableArray(app.data.productList),
                  toConsumableArray(a.data.pageResult.content),
                ),
          billingItemCount: a.data.billingItemCount,
          billingPricingQuantity: a.data.billingPricingQuantity,
          orderAmount: a.data.orderAmount,
          totalPage: a.data.pageResult.totalPage,
          isDone: a.data.pageResult.totalPage <= app.data.params.page,
        });
    });
  },
  sortFn: function (t) {
    (console.log(t.detail),
      "asc" === t.detail.sort && "销售数量" === t.detail.text
        ? this.setData({
            "params.orderByType": 2,
          })
        : "desc" === t.detail.sort && "销售数量" === t.detail.text
          ? this.setData({
              "params.orderByType": 1,
            })
          : "desc" === t.detail.sort && "销售金额" === t.detail.text
            ? this.setData({
                "params.orderByType": 4,
              })
            : "asc" === t.detail.sort &&
              "销售金额" === t.detail.text &&
              this.setData({
                "params.orderByType": 3,
              }),
      this.setData({
        productList: [],
        "params.page": 1,
      }),
      this.getData());
  },
  choosedWeek: function () {
    ((this.data.startDate = this.getDay(-6)),
      (this.data.endDate = this.getDay(0)),
      console.log(this.getDay(-6), this.getDay(0)),
      this.setData({
        startDate: this.data.startDate,
        endDate: this.data.endDate,
        confirmDate: 2,
        "params.dateTime": [this.data.startDate + " 00:00:00", this.data.endDate + " 23:59:59"],
      }),
      this.getData());
  },
  getDay: function (t) {
    var ServicesDataCenter = new Date(),
      app = ServicesDataCenter.getTime() + 864e5 * t;
    ServicesDataCenter.setTime(app);
    var i = ServicesDataCenter.getFullYear(),
      n = ServicesDataCenter.getMonth(),
      s = ServicesDataCenter.getDate();
    return i + "-" + (n = o(n + 1)) + "-" + (s = o(s));
    function o(t) {
      var ServicesDataCenter = t;
      return (1 == t.toString().length && (a = "0" + t), ServicesDataCenter);
    }
  },
  choosedMonth: function () {
    ((this.data.startDate = this.getDay(-30)),
      (this.data.endDate = this.getDay(0)),
      this.setData({
        startDate: this.data.startDate,
        endDate: this.data.endDate,
        confirmDate: 3,
        "params.dateTime": [this.data.startDate + " 00:00:00", this.data.endDate + " 23:59:59"],
      }),
      this.getData());
  },
  bindStartDateChange: function (t) {
    if (t.detail.value.replace(/-/g, "") > this.data.endDate.replace(/-/g, ""))
      wx.showToast({
        title: "开始日期不能大于结束日期",
        icon: "none",
      });
    else {
      var ServicesDataCenter = [];
      (ServicesDataCenter.push(t.detail.value + " 00:00:00"),
        ServicesDataCenter.push(this.data.endDate + " 23:59:59"),
        this.setData({
          startDate: t.detail.value,
          "params.dateTime": ServicesDataCenter,
          confirmDate: 1,
        }),
        this.getData());
    }
  },
  bindEndDateChange: function (t) {
    var ServicesDataCenter = t.detail.value;
    if (this.data.startDate.replace(/-/g, "") > ServicesDataCenter.replace(/-/g, ""))
      wx.showToast({
        title: "开始日期不能大于结束日期",
        icon: "none",
      });
    else {
      var app = [];
      (app.push(this.data.startDate + " 00:00:00"),
        app.push(t.detail.value + " 23:59:59"),
        this.setData({
          endDate: t.detail.value,
          "params.dateTime": app,
          confirmDate: 1,
        }),
        this.getData());
    }
  },
  onLoad: function (t) {
    (this.setData({
      startDate: this.getDay(-6),
      endDate: this.getDay(0),
      "params.dateTime": [this.getDay(-6) + " 00:00:00", this.getDay(0) + " 23:59:59"],
    }),
      this.getData());
  },
  onReady: function () {},
  onShow: function () {},
  onHide: function () {},
  onUnload: function () {},
  onPullDownRefresh: function () {},
  onReachBottom: function () {
    (console.log("触发"),
      console.log(this.data.totalPage),
      console.log(this.data.params.page),
      this.data.totalPage >= this.data.params.page &&
        (this.setData({
          "params.page": this.data.params.page + 1,
        }),
        this.getData()));
  },
  onShareAppMessage: function () {},
});
