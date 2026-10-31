var ServicesSearch = require("../../libs/services/ServicesSearch"),
  login = require("../../libs/utils/login"),
  app = getApp();
Page({
  data: {
    formInline: {
      page: 1,
      size: 10,
      totalPage: 0,
      keyword: "",
      dateTime: [],
    },
    autoFocus: !1,
    recordList: [],
    showSelDate: !1,
    sel_list: {
      start_time: "",
      end_time: "",
    },
    icon: {
      settime: "".concat(app.config.imgHost, "/img/customer/duibuIcon/icon/icon_SelTime@2x.png"),
    },
  },
  dateSubmit: function (t) {
    var login = t.detail,
      app = login.end,
      a = login.start,
      n = this.data,
      o = n.sel_list,
      s = n.formInline;
    ((o.start_time = a.year + "-" + a.month + "-" + a.date),
      (o.end_time = app.year + "-" + app.month + "-" + app.date),
      (s.dateTime = [o.start_time, o.end_time]),
      (s.page = 1),
      (s.totalPage = 0),
      this.setData({
        recordList: [],
        sel_list: o,
        formInline: s,
      }),
      this.getRecordList());
  },
  closeTapNoModal: function () {
    var ServicesSearch = this.data,
      login = ServicesSearch.sel_list,
      app = ServicesSearch.formInline;
    ((login.start_time = ""),
      (login.end_time = ""),
      (app.dateTime = []),
      (app.page = 1),
      (app.totalPage = 0),
      this.setData({
        sel_list: login,
        formInline: app,
      }),
      this.getRecordList());
  },
  onFilterDate: function () {
    this.setData({
      showSelDate: !0,
    });
  },
  handleConfirm: function (t) {
    var login = t.detail;
    (this.setData({
      recordList: [],
      "formInline.page": 1,
      "formInline.totalPage": 0,
      "formInline.keyword": login,
    }),
      this.getRecordList());
  },
  handleInput: function (t) {
    var login = t.detail;
    this.setData({
      "formInline.keyword": login,
    });
  },
  handleNavTo: function (t) {
    var login = t.currentTarget.dataset.id;
    wx.navigateTo({
      url: "/packageB/pages/search-result/index?id=".concat(login),
    });
  },
  getRecordList: function () {
    var login = this,
      app = this.data.formInline,
      a = app.page,
      n = app.totalPage;
    a > n && 0 !== n
      ? (a = n)
      : (wx.showLoading({
          title: "拼命加载中...",
        }),
        ServicesSearch.ServicesSearch.getRecord(this.data.formInline)
          .then(function (t) {
            if (0 === t.code) {
              ++a;
              var app = t.data.content || [];
              login.setData({
                "formInline.page": a,
                recordList: 1 === a ? app : login.data.recordList.concat(app),
                "formInline.totalPage": t.data.totalPage,
              });
            }
            wx.hideLoading();
          })
          .catch(function () {
            wx.hideLoading();
          }));
  },
  onScrollLower: function () {
    this.getRecordList();
  },
  onLoad: function (t) {
    (login.login.getUserInfo(), this.getRecordList());
  },
  onReady: function () {},
  onShow: function () {},
  onHide: function () {},
  onUnload: function () {},
  onPullDownRefresh: function () {},
  onReachBottom: function () {},
  onShareAppMessage: function () {},
});
