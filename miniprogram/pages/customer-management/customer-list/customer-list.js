var e = require("../../../@babel/runtime/helpers/interopRequireDefault").default,
  ServicesUserLog = require("../../../libs/services/ServicesUserLog.js"),
  mta_analysis = e(require("../../../utils/mta_analysis.js")),
  app = getApp(),
  ServicesCustomer = require("../../../libs/services/ServicesCustomer.js").servicesCustomer,
  util = require("../../../libs/utils/util.js").utils;
Page({
  data: {
    grouping: "",
    explain: "",
    subTitle: "",
    blackListTotal: "",
    filterList: [
      {
        value: "全部",
        iconDefault: "/assets/images/icon2nd/ic-kongbai@3x.png",
      },
      {
        value: "时间",
        sort: "desc",
        iconDesc: "/assets/images/icon2nd/ic_xiaxuan@3x.png",
        iconAsc: "/assets/images/icon2nd/ic_shangxuan@3x.png",
        iconDefault: "/assets/images/icon2nd/ic_xiaxuan01@3x.png",
      },
    ],
    customerData: {},
    customerList: [],
    pageNum: 1,
    pageSize: 10,
    isDone: !1,
    sort: "desc",
  },
  setTitle: function (e) {
    switch (e) {
      case "-1":
        return {
          title: "黑名单",
          explain: "系统会自动将你停用的客户添加到此分类下",
          subTitle: "所有被停用的客户",
          icon: "".concat(app.config.imgHost, "/img/customer/ic_tingyong@3x.png"),
          message: "被停用",
          tag: "黑名单",
        };
      case "0":
        return {
          title: "未分组",
        };
      case "1":
        return {
          title: "重点跟进客户",
          explain: "实时追踪订单动态积极维护好客户关系能提高客户的复购率！",
          subTitle: "30天内开单的客户",
          icon: "".concat(app.config.imgHost, "/img/customer/ic_goumai@2x.png"),
          message: "购买了【金貂绒】，共计：2米，合计：30元",
          tag: "重点跟进",
        };
      case "2":
        return {
          title: "潜在客户",
          explain: "以下是最近领取了色卡的客户，掌握客户动态让客户不再流失",
          subTitle: "所有领取色卡未交易的客户",
          icon: "".concat(app.config.imgHost, "/img/customer/ic_chakanseka@3x.png"),
          message: "领取了品名：005的色卡",
          tag: "潜在客户",
        };
      case "3":
        return {
          title: "访客",
          explain: "以下是浏览访问了店铺的客户，经常更新色卡能获取更多的关注",
          subTitle: "仅线上浏览店铺或商品的客户",
          icon: "".concat(app.config.imgHost, "/img/customer/ic_fangke@3x%20%283%29.png"),
          message: "访问了您的店铺",
          tag: "访客",
        };
      default:
        return {
          title: "客户列表",
        };
    }
  },
  getCustomersData: function (e) {
    var ServicesUserLog = this;
    return new Promise(function (s, a) {
      var util = {
        grouping: e,
      };
      ServicesCustomer.customersData(util)
        .then(function (e) {
          0 === e.code
            ? (ServicesUserLog.setData({
                customerData: e.data,
              }),
              s(e))
            : wx.showToast({
                title: e.msg,
                icon: "none",
              });
        })
        .catch(function (e) {
          (console.log(e), a(e));
        });
    });
  },
  getCustomersList: function (e) {
    var ServicesUserLog = this,
      mta_analysis = arguments.length > 1 && void 0 !== arguments[1] ? arguments[1] : "desc";
    return new Promise(function (a, n) {
      wx.showLoading();
      var c = {
          grouping: e,
          size: ServicesUserLog.data.pageSize,
          page: ServicesUserLog.data.pageNum,
          sort: mta_analysis,
        },
        r = ServicesUserLog.data.customerList;
      ServicesCustomer.customersList(c)
        .then(function (s) {
          if (0 === s.code) {
            var ServicesCustomer = s.data.content || [];
            if (0 === ServicesCustomer.length && 1 === ServicesUserLog.data.pageNum)
              return (
                ServicesUserLog.setData({
                  blackListTotal: 0,
                }),
                void wx.hideLoading()
              );
            for (var n = 0; n < ServicesCustomer.length; n++)
              ((ServicesCustomer[n].icon = ServicesUserLog.setTitle(e).icon),
                (ServicesCustomer[n].tag = ServicesUserLog.setTitle(e).tag),
                (ServicesCustomer[n].headImg = util.addDefaultAvatar(ServicesCustomer[n].headImg)),
                (ServicesCustomer[n].status = ServicesUserLog.data.grouping),
                ("3" != e && "-1" != e) ||
                  (ServicesCustomer[n].message = ServicesUserLog.setTitle(e).message),
                r.push(ServicesCustomer[n]));
            (console.log(r),
              ServicesUserLog.setData({
                customerList: r,
              }),
              "-1" == e &&
                ServicesUserLog.setData({
                  blackListTotal: s.data.total,
                }),
              0 === ServicesCustomer.length &&
                ServicesUserLog.data.pageNum > 1 &&
                ServicesUserLog.setData({
                  isDone: !0,
                }),
              wx.hideLoading(),
              a(s));
          } else
            (wx.showToast({
              title: s.msg,
              icon: "none",
            }),
              wx.hideLoading(),
              a());
        })
        .catch(function (e) {
          (wx.hideLoading(), console.log(e), n(e));
        });
    });
  },
  filterTap: function (e) {
    var ServicesUserLog = e.detail,
      mta_analysis = (ServicesUserLog.value, ServicesUserLog.sortType),
      app = this.data.sort;
    switch (mta_analysis) {
      case "all":
        a = "";
        break;
      case "desc":
        a = "desc";
        break;
      case "asc":
        a = "asc";
    }
    (this.setData({
      sort: app,
      pageNum: 1,
      customerList: [],
      isDone: !1,
    }),
      this.getCustomersList(this.data.grouping, this.data.sort));
  },
  tabBlock: function (e) {
    var ServicesUserLog = this.data.grouping,
      mta_analysis = e.detail.id;
    3 == ServicesUserLog
      ? wx.navigateTo({
          url: "/pages/customer-management/edit-customer-info/edit-customer-info?customerId=".concat(
            mta_analysis,
          ),
        })
      : wx.navigateTo({
          url: "/pages/customer-management/all-customer-detail/all-customer-detail?customerId=".concat(
            mta_analysis,
          ),
        });
  },
  setEnterPageLog: function (e) {
    switch (e) {
      case "-1":
        ServicesUserLog.servicesUserLog.setUserHandleLog(308);
        break;
      case "0":
        break;
      case "1":
        ServicesUserLog.servicesUserLog.setUserHandleLog(305);
        break;
      case "2":
        ServicesUserLog.servicesUserLog.setUserHandleLog(306);
        break;
      case "3":
        ServicesUserLog.servicesUserLog.setUserHandleLog(307);
    }
  },
  onLoad: function (e) {
    mta_analysis.default.Page.init();
    var ServicesUserLog = e.grouping;
    (this.setEnterPageLog(ServicesUserLog),
      wx.setNavigationBarTitle({
        title: this.setTitle(ServicesUserLog).title,
      }),
      this.setData({
        explain: this.setTitle(ServicesUserLog).explain,
        subTitle: this.setTitle(ServicesUserLog).subTitle,
        grouping: ServicesUserLog,
      }),
      wx.hideShareMenu());
  },
  onReady: function () {},
  onShow: function () {
    (this.setData({
      customerList: [],
      pageNum: 1,
    }),
      this.getCustomersData(this.data.grouping),
      this.getCustomersList(this.data.grouping),
      console.log("onShow"));
  },
  onHide: function () {},
  onUnload: function () {},
  onPullDownRefresh: function () {},
  onReachBottom: function () {
    var e = this.data,
      ServicesUserLog = e.pageNum,
      mta_analysis = e.grouping,
      app = e.isDone,
      ServicesCustomer = e.sort;
    app
      ? wx.showToast({
          title: "数据已全部加载完毕",
          icon: "none",
        })
      : (ServicesUserLog++,
        this.setData({
          pageNum: ServicesUserLog,
        }),
        this.getCustomersList(mta_analysis, ServicesCustomer));
  },
  onShareAppMessage: function () {},
});
