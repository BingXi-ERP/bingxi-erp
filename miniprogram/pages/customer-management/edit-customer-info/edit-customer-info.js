var t = require("../../../@babel/runtime/helpers/interopRequireDefault").default,
  objectSpread2 = require("../../../@babel/runtime/helpers/objectSpread2"),
  o = require("../../../@babel/runtime/helpers/defineProperty"),
  mta_analysis = t(require("../../../utils/mta_analysis.js")),
  getLocation = require("../../../libs/utils/getLocation"),
  ServicesUserLog = require("../../../libs/services/ServicesUserLog.js"),
  ServicesCustomer = require("../../../libs/services/ServicesCustomer.js").servicesCustomer,
  app = getApp();
Page({
  data: {
    showTextArea: !0,
    userAuthList: {},
    region: [],
    modalHidden: !0,
    isRegister: !1,
    customerInfo: null,
    customerId: "",
    icon: {
      rightArrow: "".concat(app.config.imgHost, "/img/customer/ic_jinru.png"),
    },
    dialog: {
      show: !1,
      title: "请输入备注",
    },
  },
  onClose: function () {
    this.setData({
      show: !1,
    });
  },
  inputgetName: function (t) {
    this.setData({
      [t.currentTarget.dataset.name]: t.detail.value,
    });
  },
  addExplain: function () {
    this.setData({
      "dialog.show": !0,
    });
  },
  getExplain: function (t) {
    this.setData({
      "dialog.show": !1,
    });
  },
  onLoad: function (t) {
    (mta_analysis.default.Page.init(),
      this.setData({
        userAuthList: app.userAuthList,
      }),
      this.setData({
        customerId: t.customerId,
      }),
      wx.hideShareMenu(),
      this.getCustomerInfo());
  },
  onReady: function () {},
  onShow: function () {},
  onHide: function () {},
  onUnload: function () {},
  onPullDownRefresh: function () {},
  onReachBottom: function () {},
  onShareAppMessage: function () {},
  changeShow: function () {
    this.setData({
      showTextArea: !this.data.showTextArea,
    });
  },
  bindRegionChange: function (t) {
    (console.log("picker发送选择改变，携带值为", t.detail.value),
      this.setData({
        region: t.detail.value,
      }),
      this.setData({
        "customerInfo.province": t.detail.value[0],
        "customerInfo.city": t.detail.value[1],
        "customerInfo.area": t.detail.value[2],
      }));
  },
  getCustomerInfo: function () {
    var t = this,
      objectSpread2 = {
        customerId: this.data.customerId,
      };
    ServicesCustomer.customerDetail(objectSpread2).then(function (e) {
      if (0 === e.code) {
        if (
          (t.setData({
            customerInfo: e.data,
          }),
          t.setData({
            "customerInfo.customerId": t.data.customerId,
          }),
          t.data.customerInfo.userId &&
            t.data.customerInfo.userId.length > 5 &&
            t.setData({
              isRegister: !0,
            }),
          "" != t.data.customerInfo.area)
        ) {
          t.setData({
            region: [],
          });
          var o = t.data.customerInfo,
            mta_analysis = o.provinceName,
            getLocation = o.cityName,
            ServicesUserLog = o.areaName;
          ((t.data.region = mta_analysis ? [mta_analysis, getLocation, ServicesUserLog] : []),
            t.setData({
              region: t.data.region,
            }));
        }
      } else
        wx.showToast({
          title: e.msg,
          icon: "none",
        });
    });
  },
  setLocationId: function () {
    var t = this;
    0 !== this.data.region.length
      ? (0, getLocation.getAddressId)(this.data.region).then(function (e) {
          (t.setData({
            "customerInfo.provinceId": e[0],
            "customerInfo.cityId": e[1],
            "customerInfo.areaId": e[2],
          }),
            t.saveCustomerInfo());
        })
      : this.saveCustomerInfo();
  },
  saveCustomerInfo: function () {
    if (3 === this.data.customerInfo.grouping || "" != this.data.customerInfo.fullname) {
      var t = objectSpread2(
        {
          id: this.data.customerInfo.id,
        },
        this.data.customerInfo,
      );
      ServicesCustomer.editCustomer(t).then(function (e) {
        if (0 === e.code) {
          (ServicesUserLog.servicesUserLog.setUserHandleLog(302),
            0 === t.status && ServicesUserLog.servicesUserLog.setUserHandleLog(303));
          var o = getCurrentPages(),
            mta_analysis = o.find(function (t) {
              return "pages/customer-management/customer-management" === t.route;
            });
          (mta_analysis && mta_analysis.updataList(),
            wx.navigateBack({
              delta: 1,
              success: function () {
                wx.showToast({
                  title: "成功",
                  icon: "success",
                  duration: 2e3,
                });
              },
            }));
        } else
          wx.showToast({
            title: e.msg,
            icon: "none",
          });
      });
    } else
      wx.showToast({
        title: "姓名和电话不能为空",
        icon: "none",
      });
  },
  switch1Change: function () {
    0 == this.data.customerInfo.status
      ? this.setData({
          "customerInfo.status": 1,
        })
      : this.setData({
          "customerInfo.status": 0,
        });
  },
  inviteRegister: function () {
    var t = this;
    this.data.customerInfo.customerPhone
      ? wx.showModal({
          content: "确认发送短信至".concat(
            this.data.customerInfo.customerName,
            "，邀请他注册秉羲工作台？",
          ),
          success: function (e) {
            e.confirm ? t.modalSure() : e.cancel && console.log("用户点击取消");
          },
        })
      : wx.showToast({
          title: "请先填写电话号码",
          icon: "error",
          duration: 2e3,
        });
  },
  modalCancle: function () {
    this.setData({
      modalHidden: !0,
    });
  },
  modalSure: function () {
    var t = this;
    ServicesCustomer.sendInviteMsg(this.data.customerInfo.customerPhone).then(function (e) {
      0 === e.code
        ? (t.setData({
            modalHidden: !0,
          }),
          wx.showToast({
            title: "发送成功",
            icon: "success",
            duration: 2e3,
          }))
        : wx.showToast({
            title: e.msg,
            icon: "none",
          });
    });
  },
});
