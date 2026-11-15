var e = require("../../../@babel/runtime/helpers/interopRequireDefault").default,
  toConsumableArray = require("../../../@babel/runtime/helpers/toConsumableArray"),
  createForOfIteratorHelper = require("../../../@babel/runtime/helpers/createForOfIteratorHelper"),
  toast = e(require("@vant/weapp/toast/toast")),
  ServicesShop = require("../../../libs/services/ServicesShop.js").servicesShop;
Page({
  data: {
    searchValue: "",
    backendData: [],
    originData: [],
    checkedArr: [],
    from: "0",
  },
  onLoad: function (e) {
    var toConsumableArray,
      createForOfIteratorHelper = e.type,
      toast = e.from;
    ((a = createForOfIteratorHelper ? createForOfIteratorHelper.split(",") : []),
      this.getData(toConsumableArray),
      toast &&
        this.setData({
          from: toast,
        }));
  },
  onReady: function () {},
  onShow: function () {
    wx.hideHomeButton();
  },
  onHide: function () {},
  onUnload: function () {},
  onPullDownRefresh: function () {},
  onReachBottom: function () {},
  onShareAppMessage: function () {},
  onChange: function (e) {
    this.setData({
      searchValue: e.detail,
    });
  },
  onSearch: function () {
    var e = this.fuzzySearch(this.data.originData, this.data.checkedArr, this.data.searchValue);
    this.setData({
      backendData: e,
    });
  },
  fuzzySearch: function (e, a, t) {
    var toast = [];
    return (
      e.forEach(function (e) {
        e.name.includes(t) && toast.push(e);
      }),
      a.forEach(function (e) {
        if (
          ((e.checked = !0),
          toast.some(function (a) {
            return a.name === e.name;
          }))
        ) {
          var toConsumableArray = toast.findIndex(function (a) {
            return a.name === e.name;
          });
          -1 !== toConsumableArray && (toast[toConsumableArray] = e);
        }
      }),
      toast
    );
  },
  handleClick: function (e) {
    var toConsumableArray = e.currentTarget.dataset.item,
      createForOfIteratorHelper = e.currentTarget.dataset.index;
    if (
      this.data.checkedArr.some(function (e) {
        return e.name === toConsumableArray.name;
      })
    ) {
      var ServicesShop = this.data.checkedArr.findIndex(function (e) {
          return JSON.stringify(e) === JSON.stringify(toConsumableArray);
        }),
        i = JSON.parse(JSON.stringify(this.data.checkedArr));
      i.splice(ServicesShop, 1);
      var c = JSON.parse(JSON.stringify(this.data.backendData));
      ((c[createForOfIteratorHelper].checked = !1),
        this.setData({
          backendData: c,
          checkedArr: i,
        }));
    } else if (this.data.checkedArr.length <= 4) {
      var s = JSON.parse(JSON.stringify(this.data.backendData));
      s[createForOfIteratorHelper].checked = !0;
      var h = JSON.parse(JSON.stringify(this.data.checkedArr));
      (h.push(toConsumableArray),
        this.setData({
          backendData: s,
          checkedArr: h,
        }));
    } else (0, toast.default)("类目最多只能选5个");
  },
  handleChecked: function (e, n) {
    var ServicesShop,
      i = createForOfIteratorHelper(e);
    try {
      for (i.s(); !(r = i.n()).done;) {
        var c = ServicesShop.value;
        c.checked = !1;
        var s,
          h = createForOfIteratorHelper(n);
        try {
          for (h.s(); !(s = h.n()).done;) {
            var d = s.value;
            if (c.name === d) {
              ((c.checked = !0),
                this.setData({
                  checkedArr: [c].concat(toConsumableArray(this.data.checkedArr)),
                }));
              break;
            }
          }
        } catch (e) {
          h.e(e);
        } finally {
          h.f();
        }
      }
    } catch (e) {
      i.e(e);
    } finally {
      i.f();
    }
    return e;
  },
  getData: function () {
    var e = this,
      toConsumableArray = arguments.length > 0 && void 0 !== arguments[0] ? arguments[0] : [],
      createForOfIteratorHelper = this;
    ServicesShop.getCategory().then(function (n) {
      if (0 === n.code)
        if (toConsumableArray.length) {
          var ServicesShop = createForOfIteratorHelper.handleChecked(n.data, toConsumableArray);
          e.setData({
            backendData: ServicesShop,
            originData: ServicesShop,
          });
        } else
          (n.data.map(function (e) {
            e.checked = !1;
          }),
            createForOfIteratorHelper.setData({
              backendData: n.data,
              originData: n.data,
            }));
    });
  },
  feedback: function () {
    wx.navigateTo({
      url: "/pages/register/feedback/index",
    });
  },
  submit: function () {
    var e = this;
    if (this.data.checkedArr.length) {
      var toConsumableArray = "";
      (this.data.checkedArr.map(function (t, n) {
        n !== e.data.checkedArr.length - 1 ? (a = toConsumableArray + t.name + ",") : (a += t.name);
      }),
        toConsumableArray && wx.setStorageSync("categoryCache", toConsumableArray),
        wx.navigateBack({
          delta: 1,
        }));
    } else (0, toast.default)("类目至少选一个");
  },
});
