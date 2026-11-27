var t = require("../../@babel/runtime/helpers/interopRequireDefault").default,
  toConsumableArray = require("../../@babel/runtime/helpers/toConsumableArray"),
  objectSpread2 = require("../../@babel/runtime/helpers/objectSpread2"),
  o = (require("../../libs/services/global"), require("../../libs/services/ServicesUserLog")),
  app = getApp(),
  ServicesCustomer = require("../../libs/services/ServicesCustomer.js").servicesCustomer,
  util = require("../../libs/utils/util.js").utils,
  login = require("../../libs/utils/login.js").login;
Page({
  data: {
    customerList: [],
    userAuthList: {},
    isLastPage: !1,
    searchParams: {
      pageSize: 10,
      pageNum: 1,
      keyword: "",
      isFirstLetterAsc: 1,
      sort: "desc",
    },
    input: {
      text: "搜索用户姓名、手机号",
    },
    icon: {
      allCustomerBg: "/assets/icons/no_img.png",
      allCustomer: "/assets/icons/account@2x.png",
      newsCenter: "/assets/icons/news@2x.png",
      addBtn: "/assets/icons/color_add@2x.png",
      up: "/assets/icons/icon/Icon_Sorting_Down_Gray@2x.png",
      down: "/assets/images/icon2nd/Icon_Sorting_Up_Gray@2x.png",
      addIcon: "/assets/icons/no_img.png",
    },
    panel: [
      {
        img: "/assets/icons/account@2x.png",
        title: "重点跟进",
        customerType: 1,
      },
      {
        img: "/assets/icons/account@2x.png",
        title: "潜在客户",
        customerType: 2,
      },
      {
        img: "/assets/icons/account@2x.png",
        title: "访客",
        customerType: 3,
      },
      {
        img: "/assets/icons/no_img.png",
        title: "黑名单",
        customerType: -1,
      },
    ],
    totalMessage: "",
    customerArr: [],
    customerTotal: "",
    totalPage: 1,
    formId: null,
  },
  getValue: function (t) {
    var toConsumableArray = t.detail.value;
    this.setData({
      "searchParams.keyword": toConsumableArray,
    });
  },
  search: function () {
    (this.setData({
      isDone: !1,
      pageNum: 1,
      "searchParams.pageNum": 1,
    }),
      this.setData({
        customerList: [],
      }),
      o.servicesUserLog.setUserHandleLog(309),
      this.getAllCustomer());
  },
  changeAsc: function () {
    console.log(this.data.searchParams.sort);
    var t = this.data.searchParams.sort;
    ((this.data.searchParams.sort = "desc" === t ? "asc" : "desc"),
      this.setData({
        "searchParams.pageNum": 1,
        "searchParams.sort": this.data.searchParams.sort,
        isDone: !1,
      }));
    this.getAllCustomer(!0);
  },
  updataList: function () {
    (this.setData({
      customerList: [],
      "searchParams.pageNum": 1,
      isDone: !1,
    }),
      this.getAllCustomer(!0));
  },
  handleClickCustom: function (t) {
    var toConsumableArray = t.currentTarget.dataset,
      objectSpread2 = toConsumableArray.id,
      mpValue = toConsumableArray.fullname,
      o = toConsumableArray.mobile,
      app = getCurrentPages(),
      ServicesCustomer = app.find(function (t) {
        return "pages/order-create/offline/create" === t.route;
      });
    if (ServicesCustomer)
      (ServicesCustomer.updateCustomer({
        id: objectSpread2,
        fullname: mpValue,
        mobile: o,
      }),
        wx.navigateBack({
          delta: 1,
        }));
    else {
      var util =
        "/pages/customer-management/all-customer-detail/all-customer-detail?customerId=".concat(
          objectSpread2,
        );
      wx.navigateTo({
        url: util,
      });
    }
  },
  getIndexData: function (t) {
    for (
      var toConsumableArray = t.importantCount,
        objectSpread2 = t.potentialCount,
        mpValue = t.visitorCount,
        o = t.blackCount,
        app = t.totalCount,
        ServicesCustomer = [toConsumableArray, objectSpread2, mpValue, o],
        util = this.data.panel,
        login = 0;
      login < util.length;
      login++
    )
      util[login].count = "".concat(ServicesCustomer[login], "人");
    this.setData({
      customerTotal: app,
      panel: util,
    });
  },
  toCustomDetail: function (t) {
    var toConsumableArray = t.currentTarget.dataset.type;
    wx.navigateTo({
      url: "/pages/customer-management/customer-list/customer-list?grouping=".concat(
        toConsumableArray,
      ),
    });
  },
  toNewsCenter: function () {
    wx.navigateTo({
      url: "/pages/customer-management/news-center/news-center",
    });
  },
  toAddCustomer: function () {
    wx.navigateTo({
      url: "/pages/customer-management/add-customer/add-customer",
    });
  },
  getAllCustomer: function (t) {
    var mpValue = this;
    wx.showLoading();
    this.data.customerList;
    var o = {
      size: this.data.searchParams.pageSize,
      page: this.data.searchParams.pageNum,
      keyword: this.data.searchParams.keyword,
      sort: this.data.searchParams.sort,
    };
    ServicesCustomer.allCustomerList(o).then(function (t) {
      if (0 === t.code) {
        var o = t.data.pageResult,
          app = t.data.customerGroupResp;
        mpValue.getIndexData(app);
        var ServicesCustomer = o.content.map(function (t) {
          return objectSpread2(
            objectSpread2({}, t),
            {},
            {
              headImg: util.addDefaultAvatar(t.avatar),
            },
          );
        });
        (mpValue.setData({
          customerList:
            1 === mpValue.data.searchParams.pageNum
              ? ServicesCustomer
              : [].concat(
                  toConsumableArray(mpValue.data.customerList),
                  toConsumableArray(ServicesCustomer),
                ),
          isDone: o.totalPage <= mpValue.data.searchParams.pageNum,
          totalPage: o.totalPage,
        }),
          wx.hideLoading());
      } else
        (wx.showToast({
          title: t.msg,
          icon: "none",
        }),
          wx.hideLoading());
    });
  },
  onLoad: function (t) {
    (login.getUserInfo(),
      wx.hideShareMenu(),
      this.setData({
        userAuthList: app.userAuthList,
        "searchParams.pageNum": 1,
        customerList: [],
      }),
      o.servicesUserLog.setUserHandleLog(300),
      this.getAllCustomer());
  },
  onReady: function () {},
  onShow: function () {},
  onHide: function () {},
  onUnload: function () {},
  onPullDownRefresh: function () {},
  onReachBottom: function () {
    var t = this.data,
      toConsumableArray = (t.isDone, t.totalPage),
      objectSpread2 = t.searchParams;
    toConsumableArray > objectSpread2.pageNum &&
      (this.setData({
        "searchParams.pageNum": (objectSpread2.pageNum += 1),
      }),
      console.log(objectSpread2.pageNum),
      this.getAllCustomer());
  },
  onShareAppMessage: function () {},
  toAllCustomList: function () {
    wx.navigateTo({
      url: "/pages/customer-management/all-customer-list/all-customer-list",
    });
  },
});
