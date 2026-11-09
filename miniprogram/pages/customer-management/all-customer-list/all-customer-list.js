var a = require("../../../@babel/runtime/helpers/interopRequireDefault").default,
  createForOfIteratorHelper = require("../../../@babel/runtime/helpers/createForOfIteratorHelper"),
  mta_analysis = a(require("../../../utils/mta_analysis.js")),
  ServicesCustomer = require("../../../libs/services/ServicesCustomer.js").servicesCustomer,
  util = require("../../../libs/utils/util.js").utils;
getApp();
Page({
  data: {
    input: {
      placeholder: "请输入要搜索的客户名称",
      value: "",
    },
    customerList: [],
    searchParams: {
      pageSize: 15,
      pageNum: 1,
      keyword: "",
      isFirstLetterAsc: "",
    },
    isDone: !1,
    filterList: [
      {
        value: "全部",
        iconDefault: "/assets/images/icon2nd/ic-kongbai@3x.png",
      },
    ],
    nav: [
      "A",
      "B",
      "C",
      "D",
      "E",
      "F",
      "G",
      "H",
      "I",
      "J",
      "K",
      "L",
      "M",
      "N",
      "O",
      "P",
      "Q",
      "R",
      "S",
      "T",
      "U",
      "V",
      "W",
      "X",
      "Y",
      "Z",
      "#",
    ],
    selected: 0,
    scrollIntoView: "A",
  },
  onLoad: function (a) {
    (mta_analysis.default.Page.init(), wx.hideShareMenu());
  },
  onReady: function () {},
  handleClickCustom: function (a) {
    var createForOfIteratorHelper = a.currentTarget.dataset,
      mta_analysis = createForOfIteratorHelper.id,
      ServicesCustomer = createForOfIteratorHelper.fullname,
      util = createForOfIteratorHelper.mobile,
      i = getCurrentPages(),
      c = i.find(function (a) {
        return "pages/order-create/offline/create" === a.route;
      });
    if (c)
      (c.updateCustomer({
        id: mta_analysis,
        fullname: ServicesCustomer,
        mobile: util,
      }),
        wx.navigateBack({
          delta: 1,
        }));
    else {
      var o =
        "/pages/customer-management/all-customer-detail/all-customer-detail?customerId=".concat(
          mta_analysis,
        );
      wx.navigateTo({
        url: o,
      });
    }
  },
  search: function () {
    (this.setData({
      "searchParams.pageNum": 1,
    }),
      this.setData({
        customerList: [],
      }),
      this.searchList());
  },
  searchList: function () {
    var a = this;
    wx.showLoading();
    var mta_analysis = this,
      i = this.data.customerList,
      c = {
        size: mta_analysis.data.searchParams.pageSize,
        page: mta_analysis.data.searchParams.pageNum,
        keyword: mta_analysis.data.searchParams.keyword,
        isFirstLetterAsc: mta_analysis.data.searchParams.isFirstLetterAsc,
      };
    ServicesCustomer.allCustomerList(c).then(function (s) {
      if (0 === s.code) {
        var c,
          o,
          n = (null === (c = s.data.pageResult) || void 0 === c ? void 0 : c.conten) || [],
          u = createForOfIteratorHelper(n);
        try {
          for (u.s(); !(o = u.n()).done;) {
            var l = o.value;
            ((l.headImg = util.addDefaultAvatar(l.avatar)), i.push(l));
          }
        } catch (a) {
          u.e(a);
        } finally {
          u.f();
        }
        (mta_analysis.setData({
          customerList: i,
        }),
          console.log(a.data.customerList),
          0 == n.length &&
            mta_analysis.data.searchParams.pageNum > 1 &&
            mta_analysis.setData({
              isDone: !0,
            }),
          wx.hideLoading());
      } else
        (wx.showToast({
          title: s.msg,
          icon: "none",
        }),
          wx.hideLoading());
    });
  },
  toCustomerDetail: function (a) {
    wx.navigateTo({
      url: "/pages/customer-management/all-customer-detail/all-customer-detail?customerId=params.customerId",
    });
  },
  getValue: function (a) {
    (this.setData({
      "searchParams.keyword": a.detail.value,
    }),
      "" == a.detail.value &&
        (this.setData({
          "searchParams.pageNum": 1,
          "searchParams.keyword": "",
          customerList: [],
          isDone: !1,
        }),
        this.searchList()));
  },
  getFilterTap: function (a) {
    var createForOfIteratorHelper = this;
    ("all" == a.detail.sortType
      ? ((createForOfIteratorHelper.data.searchParams.isFirstLetterAsc = ""),
        this.setData({
          "searchParams.isFirstLetterAsc":
            createForOfIteratorHelper.data.searchParams.isFirstLetterAsc,
        }))
      : "desc" == a.detail.sortType
        ? ((createForOfIteratorHelper.data.searchParams.isFirstLetterAsc = "1"),
          this.setData({
            "searchParams.isFirstLetterAsc":
              createForOfIteratorHelper.data.searchParams.isFirstLetterAsc,
          }))
        : "asc" == a.detail.sortType &&
          ((createForOfIteratorHelper.data.searchParams.isFirstLetterAsc = "0"),
          this.setData({
            "searchParams.isFirstLetterAsc":
              createForOfIteratorHelper.data.searchParams.isFirstLetterAsc,
          })),
      this.setData({
        "searchParams.pageNum": 1,
      }),
      createForOfIteratorHelper.searchList());
  },
  onShow: function () {
    (this.setData({
      "searchParams.pageNum": 1,
      customerList: [],
      isDone: !1,
    }),
      this.searchList());
  },
  onHide: function () {},
  onUnload: function () {},
  onPullDownRefresh: function () {},
  onReachBottom: function () {
    var a = this;
    this.data.isDone
      ? wx.showToast({
          title: "数据已全部加载完毕",
          icon: "none",
        })
      : ((a.data.searchParams.pageNum = a.data.searchParams.pageNum + 1),
        this.setData({
          "searchParams.pageNum": a.data.searchParams.pageNum,
        }),
        this.searchList());
  },
  onShareAppMessage: function () {},
});
