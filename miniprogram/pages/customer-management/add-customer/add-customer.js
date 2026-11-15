var e = require("../../../@babel/runtime/helpers/defineProperty"),
  getLocation = require("../../../libs/utils/getLocation"),
  ServicesUserLog = require("../../../libs/services/ServicesUserLog.js"),
  ServicesCustomer = require("../../../libs/services/ServicesCustomer.js").servicesCustomer,
  app = getApp();
Page({
  data: {
    region: [],
    customerInfo: {
      customerName: "",
      customerPhone: "",
      customerCompany: "",
      province: "",
      areaId: "",
      city: "",
      cityId: "",
      area: "",
      areaId: "",
      addr: "",
      remark: "",
      status: 0,
    },
    icon: {
      rightArrow: "".concat(app.config.imgHost, "/img/customer/ic_jinru.png"),
    },
  },
  onLoad: function () {
    wx.hideShareMenu();
  },
  switch1Change: function (e) {
    this.setData({
      "customerInfo.status": e.detail.value,
    });
  },
  bindRegionChange: function (t) {
    (this.setData({
      region: t.detail.value,
    }),
      this.setData({
        "customerInfo.province": t.detail.value[0],
      }),
      this.setData({
        "customerInfo.city": t.detail.value[1],
      }),
      this.setData({
        "customerInfo.area": t.detail.value[2],
      }));
  },
  inputgetName: function (t) {
    this.setData({
      [t.currentTarget.dataset.name]: t.detail.value,
    });
  },
  setLocationId: function () {
    var e = this;
    0 !== this.data.region.length
      ? (0, getLocation.getAddressId)(this.data.region).then(function (t) {
          (e.setData({
            "customerInfo.provinceId": t[0],
            "customerInfo.cityId": t[1],
            "customerInfo.areaId": t[2],
          }),
            e.saveCustomerInfo());
        })
      : this.saveCustomerInfo();
  },
  saveCustomerInfo: function () {
    var e = this.data.customerInfo;
    if (!e.customerName)
      return (
        wx.showToast({
          title: "请输入客户的姓名",
          icon: "none",
          duration: 1500,
        }),
        !1
      );
    ((e.status = e.status ? 0 : 1),
      ServicesCustomer.saveCustomer(e).then(function (t) {
        if (0 === t.code) {
          ServicesUserLog.servicesUserLog.setUserHandleLog(301);
          var ServicesCustomer = getCurrentPages(),
            app = ServicesCustomer.find(function (e) {
              return "pages/customer-management/customer-management" === e.route;
            }),
            r = ServicesCustomer.find(function (e) {
              return (
                "pages/customer-management/all-customer-list-choose/all-customer-list-choose" ===
                e.route
              );
            });
          if ((app && app.updataList(), r))
            (ServicesCustomer.find(function (e) {
              return "pages/order-create/offline/create" === e.route;
            }).updateCustomer({
              id: t.data || 0,
              fullname: e.customerName,
              mobile: e.customerPhone,
            }),
              wx.navigateBack({
                delta: 2,
              }));
          else
            wx.navigateBack({
              delta: 1,
              success: function () {
                wx.showToast({
                  title: "添加成功",
                  icon: "success",
                });
              },
            });
        } else
          wx.showToast({
            title: t.msg,
            icon: "none",
          });
      }));
  },
});
