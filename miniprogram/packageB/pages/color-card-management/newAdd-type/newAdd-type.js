var a = require("../../../../@babel/runtime/helpers/defineProperty"),
  app = getApp(),
  ServicesCardType = require("../../../../libs/services/ServicesCardType.js").ServicesCardType,
  ServicesUserLog = require("../../../../libs/services/ServicesUserLog.js").servicesUserLog;
Page({
  data: {
    addParams: {
      isEdit: !1,
      categoryName: "",
      permissionFlag: 1,
      categoryId: "",
      userIds: [],
    },
    customerList: [],
    radio: [
      {
        value: "1",
        checked: !0,
      },
      {
        value: "2",
        checked: !1,
      },
      {
        value: "4",
        checked: !1,
      },
      {
        value: "3",
        checked: !1,
      },
    ],
    icon: {
      comfirm: "".concat(app.config.imgHost, "/img/customer/select_s@2x.png"),
      checked: "".concat(app.config.imgHost, "/img/customer/ic_dagou@3x.png"),
      noCheck: "".concat(app.config.imgHost, "/img/customer/ic_weixuan@3x.png"),
      rightArrow: "".concat(app.config.imgHost, "/img/customer/ic_jinru.png"),
    },
  },
  onLoad: function (a) {
    var app = this;
    if (
      (a.typeName &&
        null != a.typeName &&
        this.setData({
          "addParams.categoryName": a.typeName,
        }),
      a.categoryId &&
        "" != a.categoryId &&
        (wx.setNavigationBarTitle({
          title: "编辑分类",
        }),
        this.setData({
          categoryId: a.categoryId,
        }),
        this.categoryDetail()),
      a.customer && "" != a.customer)
    ) {
      var ServicesCardType = JSON.parse(a.customer);
      (this.setData({
        customerList: ServicesCardType,
      }),
        app.setData({
          "addParams.permissionFlag": 3,
        }),
        delete app.data.radio[0].checked,
        (app.data.radio[2].checked = !0),
        this.setData({
          radio: app.data.radio,
        }));
    }
    if (a.permissionFlag && null != a.permissionFlag) {
      console.log(a.permissionFlag, "这里");
      var ServicesUserLog = JSON.parse(JSON.stringify(app.data.radio));
      (ServicesUserLog.map(function (e) {
        e.value == a.permissionFlag
          ? (console.log(e.value, a.permissionFlag), (e.checked = !0))
          : (e.checked = !1);
      }),
        app.setData({
          radio: ServicesUserLog,
        }));
    }
    wx.hideShareMenu();
  },
  onReady: function () {},
  onShow: function () {},
  onHide: function () {},
  onUnload: function () {},
  onPullDownRefresh: function () {},
  onReachBottom: function () {},
  onShareAppMessage: function () {},
  inputgetName: function (e) {
    this.setData({
      [e.currentTarget.dataset.name]: e.detail.value,
    });
  },
  toChooseCustomer: function () {
    var a = this.data.addParams.categoryName,
      app = JSON.stringify(this.data.customerList);
    null != this.data.categoryId
      ? wx.redirectTo({
          url: "/packageB/pages/color-card-management/choose-customer/choose-customer?categoryId="
            .concat(this.data.categoryId, "&customerList=")
            .concat(app, "&permissionFlag=")
            .concat(3),
        })
      : wx.redirectTo({
          url: "/packageB/pages/color-card-management/choose-customer/choose-customer?typeName="
            .concat(a, "&permissionFlag=")
            .concat(3),
        });
  },
  radioChange: function (a) {
    this.setData({
      "addParams.permissionFlag": a.detail.value,
    });
  },
  comfirmAdd: function () {
    var a = this,
      app = [];
    (console.log(a.data.addParams.permissionFlag),
      this.data.customerList.length > 0 &&
        this.data.customerList.map(function (a) {
          app.push(a.id);
        }));
    var i = {};
    (1 == a.data.addParams.permissionFlag &&
      (i = {
        name: a.data.addParams.categoryName,
        visiableFlag: a.data.addParams.permissionFlag,
      }),
      3 != a.data.addParams.permissionFlag ||
      ((i = {
        name: a.data.addParams.categoryName,
        visiableFlag: a.data.addParams.permissionFlag,
        customerIds: app,
      }),
      0 != app.length)
        ? (2 == a.data.addParams.permissionFlag &&
            (i = {
              name: a.data.addParams.categoryName,
              visiableFlag: a.data.addParams.permissionFlag,
            }),
          4 == a.data.addParams.permissionFlag &&
            (i = {
              name: a.data.addParams.categoryName,
              visiableFlag: a.data.addParams.permissionFlag,
            }),
          a.data.isEdit
            ? ((i.classifyId = a.data.categoryId),
              ServicesCardType.save(i).then(function (a) {
                0 === a.code
                  ? (ServicesUserLog.setUserHandleLog(105),
                    wx.navigateBack({
                      delta: 1,
                    }))
                  : wx.showToast({
                      title: a.msg,
                      icon: "none",
                    });
              }))
            : ServicesCardType.add(i).then(function (a) {
                0 === a.code
                  ? (ServicesUserLog.setUserHandleLog(104),
                    wx.navigateBack({
                      delta: 1,
                    }))
                  : wx.showToast({
                      title: a.msg,
                      icon: "none",
                    });
              }))
        : wx.showToast({
            title: "请选择指定可见客户",
            icon: "none",
          }));
  },
  categoryDetail: function () {
    var a = this,
      app = wx.getStorageSync("categoryEdit"),
      ServicesCardType = app.visiableFlag,
      ServicesUserLog = app.customerList || [];
    (this.setData({
      "addParams.categoryName": app.name,
    }),
      "" != app.name
        ? a.setData({
            isEdit: !0,
          })
        : a.setData({
            isEdit: !1,
          }),
      ServicesCardType && null != ServicesCardType
        ? 3 == ServicesCardType
          ? ServicesUserLog.length > 0
            ? (a.setData({
                "addParams.permissionFlag": ServicesCardType,
                customerList: ServicesUserLog,
              }),
              delete a.data.radio[0].checked,
              (a.data.radio[2].checked = !0),
              this.setData({
                radio: a.data.radio,
              }))
            : (a.setData({
                "addParams.permissionFlag": ServicesCardType,
              }),
              delete a.data.radio[1].checked,
              delete a.data.radio[2].checked,
              (a.data.radio[0].checked = !0),
              this.setData({
                radio: a.data.radio,
              }))
          : 2 == ServicesCardType
            ? (a.setData({
                "addParams.permissionFlag": ServicesCardType,
              }),
              delete a.data.radio[0].checked,
              delete a.data.radio[2].checked,
              (a.data.radio[1].checked = !0),
              this.setData({
                radio: a.data.radio,
              }))
            : 1 == ServicesCardType &&
              (a.setData({
                "addParams.permissionFlag": ServicesCardType,
              }),
              delete a.data.radio[1].checked,
              delete a.data.radio[2].checked,
              (a.data.radio[0].checked = !0),
              this.setData({
                radio: a.data.radio,
              }))
        : 1 == ServicesCardType
          ? (a.setData({
              "addParams.permissionFlag": app.visiableFlag,
            }),
            delete a.data.radio[1].checked,
            delete a.data.radio[2].checked,
            (a.data.radio[0].checked = !0),
            this.setData({
              radio: a.data.radio,
            }))
          : 2 == ServicesCardType
            ? (a.setData({
                "addParams.permissionFlag": app.visiableFlag,
              }),
              delete a.data.radio[0].checked,
              delete a.data.radio[2].checked,
              (a.data.radio[1].checked = !0),
              this.setData({
                radio: a.data.radio,
              }))
            : 3 == app.visiableFlag &&
              (a.setData({
                "addParams.permissionFlag": app.visiableFlag,
              }),
              delete a.data.radio[0].checked,
              delete a.data.radio[1].checked,
              (a.data.radio[2].checked = !0),
              this.setData({
                radio: a.data.radio,
              })));
  },
  searchAllCustomerList: function (a) {
    var app = this,
      ServicesUserLog = {
        keyword: "",
        categoryId: a,
        page: 1,
        size: 400,
      };
    ServicesCardType.permissionUser(ServicesUserLog).then(function (a) {
      0 === a.code
        ? a.data.content.length > 0 &&
          app.setData({
            customerList: a.data.content,
          })
        : wx.showToast({
            title: a.msg,
            icon: "none",
          });
    });
  },
});
