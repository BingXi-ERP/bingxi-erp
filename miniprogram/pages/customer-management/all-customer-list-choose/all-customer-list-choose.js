var t = require("../../../@babel/runtime/helpers/interopRequireDefault").default,
  toConsumableArray = require("../../../@babel/runtime/helpers/toConsumableArray"),
  createForOfIteratorHelper = require("../../../@babel/runtime/helpers/createForOfIteratorHelper"),
  mta_analysis = t(require("../../../utils/mta_analysis")),
  ServicesCustomer = require("../../../libs/services/ServicesCustomer.js").servicesCustomer,
  util = require("../../../libs/utils/util.js").utils,
  app = getApp();
Page({
  data: {
    searchLoading: !1,
    userAuthList: {},
    lettList: [],
    customerObj: {},
    customerData: [],
    customerList: [],
    searchParams: {
      pageSize: 15,
      pageNum: 1,
      keyword: "",
      isFirstLetterAsc: "",
    },
    totalPage: 1,
    total: 0,
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
    icon: {
      allCustomerBg: "".concat(app.config.imgHost, "/img/customer/img_quanbu@3x.png"),
      allCustomer: "".concat(app.config.imgHost, "/img/customer/ic_kehuquanbu@3x.png"),
      newsCenter: "".concat(app.config.imgHost, "/img/customer/ic_xiaoxi@3x.png"),
      addBtn: "".concat(app.config.imgHost, "/img/customer/ic_tianjia.svg"),
    },
    listHeight: [],
    currentIndex: 0,
    fixedTitle: "",
    fixedTop: 56,
    toView: "",
    scrollViewHeight: 0,
  },
  onLoad: function (t) {
    (mta_analysis.default.Page.init(),
      wx.hideShareMenu(),
      this.setData({
        userAuthList: app.userAuthList,
      }));
  },
  onReady: function () {},
  scrollToview: function (t) {
    var toConsumableArray = t.target.dataset.id;
    this.setData({
      toView: toConsumableArray,
    });
  },
  _calculateHeight: function () {
    var t = [],
      toConsumableArray = this,
      createForOfIteratorHelper = 0;
    (t.push(createForOfIteratorHelper),
      wx
        .createSelectorQuery()
        .selectAll(".list-group")
        .boundingClientRect(function (a) {
          for (
            var mta_analysis = a, ServicesCustomer = mta_analysis.length, util = 0;
            util < ServicesCustomer;
            util++
          )
            ((e += mta_analysis[util].height), t.push(createForOfIteratorHelper));
        })
        .exec());
    var mta_analysis = setInterval(function () {
      t != [0] &&
        (toConsumableArray.setData({
          listHeight: t,
        }),
        clearInterval(mta_analysis));
    }, 1e3);
  },
  scroll: function (t) {
    var toConsumableArray = t.detail.scrollTop + 16;
    this.scrollY(toConsumableArray);
  },
  scrollY: function (t) {
    var toConsumableArray = this.data.listHeight;
    if (0 == t || t < 0)
      this.setData({
        currentIndex: 0,
        fixedTitle: "",
      });
    else {
      for (
        var createForOfIteratorHelper = 0;
        createForOfIteratorHelper < toConsumableArray.length - 1;
        createForOfIteratorHelper++
      ) {
        var mta_analysis = toConsumableArray[createForOfIteratorHelper],
          ServicesCustomer = toConsumableArray[createForOfIteratorHelper + 1];
        if (t >= mta_analysis && t < ServicesCustomer)
          return void this.setData({
            currentIndex: createForOfIteratorHelper,
            fixedTitle: this.data.customerList[createForOfIteratorHelper]
              ? this.data.customerList[createForOfIteratorHelper].letter
              : "",
          });
      }
      this.setData({
        currentIndex: toConsumableArray.length - 2,
        fixedTitle: this.data.customerList[toConsumableArray.length - 2]
          ? this.data.customerList[toConsumableArray.length - 2].letter
          : "",
      });
    }
  },
  toAddCustomer: function () {
    wx.navigateTo({
      url: "/pages/customer-management/add-customer/add-customer",
    });
  },
  handleClickCustom: function (t) {
    var toConsumableArray,
      createForOfIteratorHelper = t.currentTarget.dataset,
      mta_analysis = createForOfIteratorHelper.id,
      ServicesCustomer = createForOfIteratorHelper.fullname,
      util = createForOfIteratorHelper.mobile,
      app = getCurrentPages(),
      o = [
        "pages/order-create/offline/create",
        "pages/color-card-management/print-cloth-head/print-format/print-format",
        "packageB/pages/sales-return/index",
      ];
    if (
      (app.map(function (t) {
        o.some(function (e) {
          if (e == t.route) return ((a = t), !0);
        });
      }),
      toConsumableArray)
    )
      (toConsumableArray.updateCustomer({
        id: mta_analysis,
        fullname: ServicesCustomer,
        mobile: util,
      }),
        wx.navigateBack({
          delta: 1,
        }));
    else {
      var n =
        "/pages/customer-management/all-customer-detail/all-customer-detail?customerId=".concat(
          mta_analysis,
        );
      wx.navigateTo({
        url: n,
      });
    }
  },
  search: function () {
    (this.setData({
      "searchParams.pageNum": 1,
    }),
      this.setData({
        customerObj: {},
        customerList: [],
        customerData: [],
      }),
      this.searchList());
  },
  sliderBottom: function () {
    var t = this.data,
      toConsumableArray = t.searchParams;
    t.totalPage > toConsumableArray.pageNum &&
      (this.setData({
        "searchParams.pageNum": toConsumableArray.pageNum + 1,
      }),
      this.searchList());
  },
  searchList: function () {
    var t = this;
    1 === this.data.searchParams.pageNum && wx.showLoading();
    var mta_analysis = this,
      app = this.data,
      o = (app.customerList, app.nav, app.customerObj),
      n = {
        size: mta_analysis.data.searchParams.pageSize,
        page: mta_analysis.data.searchParams.pageNum,
        keyword: mta_analysis.data.searchParams.keyword,
        isFirstLetterAsc: mta_analysis.data.searchParams.isFirstLetterAsc,
      };
    ServicesCustomer.selectPageList(n).then(function (r) {
      if (0 === r.code) {
        var app = r.data.content || [];
        ((t.data.totalPage = r.data.totalPage), (t.data.total = r.data.total));
        var n,
          u = createForOfIteratorHelper(app);
        try {
          for (u.s(); !(n = u.n()).done;) {
            var h = n.value;
            h.headImg = util.addDefaultAvatar(h.avatar);
          }
        } catch (t) {
          u.e(t);
        } finally {
          u.f();
        }
        (mta_analysis.setData({
          totalPage: r.data.totalPage,
          total: r.data.total,
          customerObj: o,
          customerList:
            1 === mta_analysis.data.searchParams.pageNum
              ? app
              : [].concat(
                  toConsumableArray(mta_analysis.data.customerList),
                  toConsumableArray(app),
                ),
        }),
          r.data.totalPage <= mta_analysis.data.searchParams.pageNum &&
            0 === app.length &&
            mta_analysis.setData({
              isDone: !0,
            }),
          t._calculateHeight());
      } else
        wx.showToast({
          title: r.msg,
          icon: "none",
        });
      wx.hideLoading();
    });
  },
  compare: function (t) {
    return function (a, e) {
      return [a[t], e[t]].sort()[0] != a[t] ? 1 : -1;
    };
  },
  toCustomerDetail: function (t) {
    wx.navigateTo({
      url: "/pages/customer-management/all-customer-detail/all-customer-detail?customerId=params.customerId",
    });
  },
  getValue: function (t) {
    (this.setData({
      "searchParams.keyword": t.detail.value,
    }),
      "" == t.detail.value &&
        (this.setData({
          "searchParams.pageNum": 1,
          "searchParams.keyword": "",
          customerList: [],
          isDone: !1,
        }),
        this.searchList()));
  },
  getFilterTap: function (t) {
    var toConsumableArray = this;
    ("all" == t.detail.sortType
      ? ((toConsumableArray.data.searchParams.isFirstLetterAsc = ""),
        this.setData({
          "searchParams.isFirstLetterAsc": toConsumableArray.data.searchParams.isFirstLetterAsc,
        }))
      : "desc" == t.detail.sortType
        ? ((toConsumableArray.data.searchParams.isFirstLetterAsc = "1"),
          this.setData({
            "searchParams.isFirstLetterAsc": toConsumableArray.data.searchParams.isFirstLetterAsc,
          }))
        : "asc" == t.detail.sortType &&
          ((toConsumableArray.data.searchParams.isFirstLetterAsc = "0"),
          this.setData({
            "searchParams.isFirstLetterAsc": toConsumableArray.data.searchParams.isFirstLetterAsc,
          })),
      this.setData({
        "searchParams.pageNum": 1,
      }),
      toConsumableArray.searchList());
  },
  onShow: function () {
    (this.setData({
      "searchParams.pageNum": 1,
      customerList: [],
      isDone: !1,
    }),
      this.countHeight(),
      this.searchList());
  },
  onReachBottom: function () {
    var t = this;
    this.data.totalPage > t.data.searchParams.pageNum
      ? ((t.data.searchParams.pageNum = t.data.searchParams.pageNum + 1),
        this.setData({
          "searchParams.pageNum": t.data.searchParams.pageNum,
        }),
        this.searchList())
      : wx.showToast({
          title: "数据已全部加载完毕",
          icon: "none",
        });
  },
  countHeight: function () {
    var t = this;
    wx.getSystemInfo({
      success: function (a) {
        t.setData({
          windowHeight: a.windowHeight,
        });
      },
    });
  },
  drawStart: function (t) {
    var toConsumableArray = this,
      createForOfIteratorHelper = t.touches[0],
      mta_analysis = t.currentTarget.dataset.findex,
      ServicesCustomer = t.currentTarget.dataset.index;
    (this.data.customerList.forEach(function (t, e) {
      t.childer.forEach(function (t, i) {
        (e == mta_analysis && ServicesCustomer == i) ||
          (toConsumableArray.data.customerList[e].childer[i].right = 0);
      });
    }),
      this.setData({
        customerList: this.data.customerList,
        startX: createForOfIteratorHelper.clientX,
      }));
  },
  drawMove: function (t) {
    var toConsumableArray = t.currentTarget.dataset.findex,
      createForOfIteratorHelper = t.currentTarget.dataset.index,
      mta_analysis = t.touches[0],
      ServicesCustomer =
        this.data.customerList[toConsumableArray].childer[createForOfIteratorHelper],
      util = this.data.startX - mta_analysis.clientX;
    util >= 20
      ? (util > this.data.delBtnWidth && (i = this.data.delBtnWidth),
        (ServicesCustomer.right = util),
        this.setData({
          isScroll: !1,
          customerList: this.data.customerList,
        }))
      : ((ServicesCustomer.right = 0),
        this.setData({
          isScroll: !0,
          customerList: this.data.customerList,
        }));
  },
  drawEnd: function (t) {
    var toConsumableArray = t.currentTarget.dataset.findex,
      createForOfIteratorHelper = t.currentTarget.dataset.index,
      mta_analysis = this.data.customerList[toConsumableArray].childer[createForOfIteratorHelper];
    mta_analysis.right >= this.data.delBtnWidth / 2
      ? ((mta_analysis.right = this.data.delBtnWidth),
        this.setData({
          isScroll: !0,
          customerList: this.data.customerList,
        }))
      : ((mta_analysis.right = 0),
        this.setData({
          isScroll: !0,
          customerList: this.data.customerList,
        }));
  },
});
