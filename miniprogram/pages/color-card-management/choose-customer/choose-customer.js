var createForOfIteratorHelper = require("../../../@babel/runtime/helpers/createForOfIteratorHelper"),
  app = getApp(),
  ServicesCardType = require("../../../libs/services/ServicesCardType.js").ServicesCardType,
  util = require("../../../libs/utils/util.js").utils;
Page({
  data: {
    typeName: "",
    permissionFlag: null,
    avatarUrl: "".concat(app.config.imgHost, "/Face_User_Face_Man_Default@3x.png"),
    allCustomerList: [],
    customerList: [],
    allChecked: !1,
    allDisplay: !1,
    categoryId: "",
    icon: {
      checked: "".concat(app.config.imgHost, "/img/customer/ic_dagou@3x.png"),
      noCheck: "".concat(app.config.imgHost, "/img/customer/ic_weixuan@3x.png"),
    },
    pageNum: 1,
    pageSize: 10,
    isDone: !1,
  },
  onLoad: function (t) {
    (t.typeName &&
      null != t.typeName &&
      this.setData({
        typeName: t.typeName,
      }),
      t.permissionFlag &&
        null != t.permissionFlag &&
        this.setData({
          permissionFlag: t.permissionFlag,
        }),
      t.categoryId &&
        null != t.categoryId &&
        (t.customerList && t.customerList.length > 0
          ? this.setData({
              allCustomerList: JSON.parse(t.customerList),
            })
          : this.searchAllCustomerList(t.categoryId),
        this.setData({
          categoryId: t.categoryId,
        })),
      wx.hideShareMenu());
  },
  onReady: function () {},
  onShow: function () {},
  onHide: function () {},
  onUnload: function () {},
  onPullDownRefresh: function () {},
  onReachBottom: function () {
    var createForOfIteratorHelper = this.data,
      app = createForOfIteratorHelper.pageNum;
    createForOfIteratorHelper.isDone
      ? wx.showToast({
          title: "数据已全部加载完毕",
          icon: "none",
        })
      : (app++,
        this.setData({
          pageNum: app,
        }),
        this.searchList());
  },
  onShareAppMessage: function () {},
  itemIscheck: function (t) {
    (this.data.customerList.map(function (a) {
      a.id == t.currentTarget.dataset.id && (a.ischeck = !a.ischeck);
    }),
      this.setData({
        customerList: this.data.customerList,
      }));
  },
  isCheckedAll: function () {
    ((this.data.allChecked = !this.data.allChecked),
      this.setData({
        allChecked: this.data.allChecked,
      }),
      this.data.allChecked
        ? this.data.customerList.map(function (t) {
            t.ischeck = !0;
          })
        : this.data.customerList.map(function (t) {
            t.ischeck = !1;
          }),
      this.setData({
        customerList: this.data.customerList,
      }));
  },
  addCustomer: function () {
    ((this.data.allDisplay = !0),
      this.setData({
        allDisplay: this.data.allDisplay,
      }),
      this.searchList());
  },
  searchAllCustomerList: function (a) {
    var i = this,
      o = {
        keyword: "",
        categoryId: a,
      };
    (wx.showLoading(),
      ServicesCardType.permissionUser(o).then(function (a) {
        if ((wx.hideLoading(), 0 === a.code)) {
          if (a.data.content.length > 0) {
            var ServicesCardType,
              o = createForOfIteratorHelper(a.data.content);
            try {
              for (o.s(); !(e = o.n()).done;) {
                var n = ServicesCardType.value;
                n.headImg = util.addDefaultAvatar(n.avatar);
              }
            } catch (t) {
              o.e(t);
            } finally {
              o.f();
            }
            i.setData({
              allCustomerList: a.data.content,
            });
          }
        } else
          wx.showToast({
            title: a.msg,
            icon: "none",
          });
      }));
  },
  searchList: function () {
    var createForOfIteratorHelper = this,
      app = arguments.length > 0 && void 0 !== arguments[0] ? arguments[0] : "";
    wx.showLoading({
      title: "加载中",
    });
    var i = this,
      o = this.data.customerList,
      n = {
        keyword: app,
        categoryId: "",
        page: this.data.pageNum,
        size: this.data.pageSize,
      };
    ServicesCardType.permissionUser(n).then(function (a) {
      0 === a.code
        ? (a.data.content.map(function (t) {
            t.ischeck = !1;
          }),
          a.data.content.forEach(function (t) {
            var app = !1;
            (o.map(function (e) {
              e.id == t.id && (a = !0);
            }),
              app || o.push(t),
              (t.headImg = util.addDefaultAvatar(t.avatar)),
              i.data.allCustomerList.forEach(function (a) {
                a.id == t.id && (t.ischeck = !0);
              }));
          }),
          0 == a.data.content.length &&
            createForOfIteratorHelper.data.pageNum > 1 &&
            createForOfIteratorHelper.setData({
              isDone: !0,
            }),
          i.setData({
            customerList: o,
          }),
          wx.hideLoading())
        : (wx.hideLoading(),
          wx.showToast({
            title: a.msg,
            icon: "none",
          }));
    });
  },
  addALLcustomer: function () {
    var createForOfIteratorHelper = this;
    ((createForOfIteratorHelper.data.allCustomerList = []),
      createForOfIteratorHelper.data.customerList.map(function (a) {
        if (1 == a.ischeck) {
          var ServicesCardType = !0;
          (createForOfIteratorHelper.data.allCustomerList.map(function (t) {
            a.id == t.id && (e = !1);
          }),
            ServicesCardType && createForOfIteratorHelper.data.allCustomerList.push(a));
        }
      }),
      this.setData({
        allCustomerList: createForOfIteratorHelper.data.allCustomerList,
      }),
      0 != createForOfIteratorHelper.data.allCustomerList.length
        ? ((this.data.allDisplay = !1),
          this.setData({
            allDisplay: this.data.allDisplay,
          }))
        : wx.showToast({
            title: "请选择指定可见客户",
            icon: "none",
          }));
  },
  choosedAll: function () {
    var createForOfIteratorHelper = this.data.typeName,
      app = this.data.permissionFlag,
      ServicesCardType = JSON.stringify(this.data.allCustomerList);
    "" != this.data.typeName || null != this.data.permissionFlag
      ? wx.redirectTo({
          url: "/pages/color-card-management/newAdd-type/newAdd-type?customer="
            .concat(ServicesCardType, "&categoryId=")
            .concat(this.data.categoryId, "&typeName=")
            .concat(createForOfIteratorHelper, "&permissionFlag=")
            .concat(app),
        })
      : wx.redirectTo({
          url: "/pages/color-card-management/newAdd-type/newAdd-type?customer="
            .concat(ServicesCardType, "&categoryId=")
            .concat(this.data.categoryId),
        });
  },
  getValue: function (t) {
    var app = t.detail.value;
    this.searchList(app);
  },
  deleteItem: function (t) {
    (this.data.allCustomerList.splice(t.target.dataset.index, 1),
      this.setData({
        allCustomerList: this.data.allCustomerList,
      }));
  },
});
