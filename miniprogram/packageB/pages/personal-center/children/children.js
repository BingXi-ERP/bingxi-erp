var t = require("../../../../@babel/runtime/helpers/defineProperty"),
  login = require("../../../libs/utils/login"),
  app = getApp(),
  ServicesCenter = require("../../../libs/services/ServicesCenter.js").servicesCenter;
Page({
  data: {
    pageNum: 1,
    totalPage: 0,
    tabActiveIndex: 0,
    subAccountList: [],
    roleList: [],
    tab: {
      active: 0,
      color: "#2f7bfd",
      lineWidth: "20",
      border: !1,
    },
    icon: {
      add: "".concat(app.config.imgHost, "/img/customer/ic_tianjia.svg"),
      noData: "".concat(app.config.imgHost, "/img/customer/duibuIcon/dz@2x.png"),
      rightArrow: "".concat(app.config.imgHost, "/img/customer/ic_jinru.png"),
    },
  },
  onLoad: function () {
    (login.login.getUserInfo(), wx.hideShareMenu());
  },
  onShow: function () {
    (this.getSubAccountList(), this.getRoleList());
  },
  onReachBottom: function () {
    if (((this.data.pageNum = this.data.pageNum + 1), this.data.pageNum > this.data.totalPage))
      return wx.showToast({
        title: "已加载全部",
        icon: "none",
      });
    this.getRoleList();
  },
  onChange: function (t) {
    this.setData({
      tabActiveIndex: t.currentTarget.dataset.index,
    });
  },
  toJobs: function (t) {
    wx.navigateTo({
      url: "/packageB/pages/personal-center/children/job/job",
    });
  },
  toCode: function (t) {
    wx.navigateTo({
      url: "/packageB/pages/personal-center/children/add-children/add-children",
    });
  },
  toJob: function (t) {
    wx.navigateTo({
      url:
        "/packageB/pages/personal-center/children/edit-children/edit-children?id=" +
        t.currentTarget.dataset.item,
    });
  },
  toJobs: function (t) {
    var login = t.currentTarget.dataset.type,
      app = t.currentTarget.dataset.item;
    (wx.navigateTo({
      url: "/packageB/pages/personal-center/children/add-job/add-job?type=".concat(login),
    }),
      1 == login && wx.setStorageSync("roleItem", app));
  },
  getSubAccountList: function () {
    var t = this;
    (wx.showLoading({
      title: "加载中...",
    }),
      ServicesCenter.accountList({}).then(function (e) {
        0 === e.code
          ? (e.data.forEach(function (t) {
              t.roleName = t.roleInfos
                .map(function (t) {
                  return t.roleName;
                })
                .join(",");
            }),
            t.setData({
              subAccountList: e.data,
            }),
            wx.hideLoading())
          : (wx.hideLoading(),
            wx.showToast({
              title: e.msg.data,
              icon: "none",
            }));
      }));
  },
  getRoleList: function () {
    var t = this,
      login = {
        pageNo: this.data.pageNum,
        pageSize: 20,
      };
    (wx.showLoading({
      title: "加载中...",
    }),
      ServicesCenter.roleList(login).then(function (e) {
        (0 === e.code
          ? t.setData({
              roleList: e.data.content || [],
              totalPage: e.data.totalPage,
            })
          : wx.showToast({
              title: e.msg,
              icon: "none",
            }),
          wx.hideLoading());
      }));
  },
});
