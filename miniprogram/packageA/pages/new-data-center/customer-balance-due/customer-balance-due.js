var login = require("../../../../libs/utils/login"),
  app = getApp(),
  e =
    (require("../../../../libs/utils/util").utils,
    require("../../../services/services-demand.js").ServicesDemand),
  ServicesUserLog = require("../../../services/ServicesUserLog").servicesUserLog;
Page({
  data: {
    parentMsg: "",
    shopId: "",
    pageNum: 1,
    pageSize: 10,
    total: 0,
    moreIcon: !0,
    icon: {
      search: "".concat(
        app.config.imgHost,
        "/img/customer/duibuIcon/icon/Icon_Nav_Search_White@2x.png",
      ),
      defaultAvator: "".concat(
        app.config.imgHost,
        "/img/customer/Face_User_Face_Man_Default@3x.png",
      ),
      noDataBg: "".concat(app.config.imgHost, "/img/customer/img_wuxinx@3x.png"),
      rightArrow: "".concat(app.config.imgHost, "/img/customer/ic_jinru.png"),
    },
    showDesc: !1,
    listData: [],
    balanceDueSum: " - ",
    crmSum: " - ",
    orderByFlag: 1,
    pages: "",
  },
  onLoad: function (a) {
    (login.login.getUserInfo(),
      a.shopId &&
        this.setData({
          shopId: a.shopId,
        }),
      this.setData({
        parentMsg: a,
      }),
      this.getAllCrm(this.data.parentMsg.shopId),
      this.getCrmList(this.data.parentMsg.shopId, this.data.pageNum),
      ServicesUserLog.setUserHandleLog(400));
  },
  onReady: function () {},
  onShow: function () {
    wx.getStorageSync("due-change") &&
      ((this.data.pageNum = 1),
      this.getAllCrm(this.data.shopId),
      this.getCrmList(this.data.shopId));
  },
  onHide: function () {},
  onUnload: function () {},
  onPullDownRefresh: function () {},
  onReachBottom: function () {
    this.data.pageNum > this.data.pages
      ? this.setData({
          pageNum: this.data.pages,
        })
      : (this.setData({
          pageNum: this.data.pageNum + 1,
        }),
        this.getCrmList(this.data.shopId),
        wx.showLoading({
          title: "玩命加载中",
        }),
        wx.hideLoading());
  },
  toSearch: function () {
    wx.navigateTo({
      url: "./customer-search/index",
    });
  },
  goRecords: function () {
    var login = this.data.shopId;
    ServicesUserLog.setUserHandleLog(402);
    var app = "/packageA/pages/new-data-center/order-deposit-records/index?shopId=".concat(
      login,
      "&page=due",
    );
    wx.navigateTo({
      url: app,
    });
  },
  gotoPrint: function () {
    wx.navigateTo({
      url: "/packageA/pages/new-data-center/print-view/print-view?orderByFlag=".concat(
        this.data.orderByFlag,
      ),
    });
  },
  onShareAppMessage: function () {},
  getAllCrm: function (t) {
    var app = this;
    e.getCrmAboutSum({
      shopId: t,
    }).then(function (t) {
      if (0 == t.code) {
        var e = t.data;
        app.setData({
          balanceDueSum: e.balanceDueSum ? e.balanceDueSum : 0,
          crmSum: e.customerSum ? e.customerSum : 0,
        });
      } else
        wx.showToast({
          title: t.msg,
          icon: "none",
          duration: 1500,
        });
    });
  },
  getCrmList: function (t) {
    var app = this,
      ServicesUserLog = {
        page: this.data.pageNum,
        size: this.data.pageSize,
        orderByFlag: this.data.orderByFlag,
      };
    this.data.listData.length > this.data.total ||
    (this.data.total > 0 && this.data.pageNum > Math.ceil(this.data.total / this.data.pageSize))
      ? this._closeMore()
      : (wx.showLoading({
          title: "加载中",
        }),
        e.getCrmBalanceDueList(ServicesUserLog).then(function (t) {
          if (0 == t.code) {
            var e = t.data.content;
            t.data.isLastPage ? app._closeMore() : app._showMore();
            var ServicesUserLog = e.map(function (t) {
                return {
                  shopId: t.companyId,
                  customerId: t.customerId,
                  nickName: t.customerName,
                  headImg: t.avatar,
                  isRed: t.debtAmount >= 0,
                  debtAmount: t.debtAmount,
                };
              }),
              o = app.data.listData;
            app.setData({
              total: Number(t.data.total),
              pages: t.data.pages,
              listData: 1 === app.data.pageNum ? ServicesUserLog : o.concat(ServicesUserLog),
            });
          } else
            wx.showToast({
              title: t.msg,
              icon: "none",
              duration: 1500,
            });
          wx.hideLoading();
        }));
  },
  filterTap: function (t) {
    (this.data.showDesc ? (this.data.orderByFlag = 1) : (this.data.orderByFlag = 0),
      this.setData({
        showDesc: !this.data.showDesc,
        orderByFlag: this.data.orderByFlag,
      }),
      this.getCrmList(this.data.shopId));
  },
  gotoDetail: function (t) {
    var app = t.currentTarget.dataset.custId,
      e = t.currentTarget.dataset.custName,
      o = t.currentTarget.dataset.shopId;
    (ServicesUserLog.setUserHandleLog(403),
      wx.navigateTo({
        url: "/packageA/pages/new-data-center/customer-balance-detail/customer-balance-detail?custId="
          .concat(app, "&&shopId=")
          .concat(o, "&&custName=")
          .concat(e),
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
});
