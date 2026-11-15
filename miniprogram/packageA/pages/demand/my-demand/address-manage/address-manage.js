var toConsumableArray = require("../../../../../@babel/runtime/helpers/toConsumableArray"),
  app = getApp(),
  ServicesAddressManage =
    require("../../../../services/ServicesAddressManage.js").ServicesAddressManage;
Page({
  data: {
    addressInfoList: [],
    pageNum: 1,
    totalPage: 0,
    noDataBg: "".concat(app.config.imgHost, "/img/customer/duibuIcon/dz@2x.png"),
    okk: "".concat(app.config.imgHost, "/img/customer/duibuIcon/okk@2x.png"),
    showDialog: !1,
    delMsg: "",
    delId: "",
  },
  onShow: function () {
    (this.setData({
      pageNum: 1,
      addressInfoList: [],
    }),
      this.addressList());
  },
  onReachBottom: function () {
    if (((this.data.pageNum = this.data.pageNum + 1), this.data.pageNum > this.data.totalPage))
      return wx.showToast({
        title: "已加载全部",
        icon: "none",
      });
    this.addressList();
  },
  addEditAddress: function () {
    wx.navigateTo({
      url: "/packageA/pages/demand/my-demand/address-manage/add-address/add-address",
    });
  },
  saveAddress: function (e) {
    var app = this,
      s = {
        id: e.currentTarget.dataset.item.id,
        name: e.currentTarget.dataset.item.name,
        phone: e.currentTarget.dataset.item.phone,
        province: e.currentTarget.dataset.item.province,
        provinceId: e.currentTarget.dataset.item.provinceId,
        city: e.currentTarget.dataset.item.city,
        cityId: e.currentTarget.dataset.item.cityId,
        area: e.currentTarget.dataset.item.area,
        areaId: e.currentTarget.dataset.item.areaId,
        detailAddress: e.currentTarget.dataset.item.detailAddress,
        defaultFlag: 1,
      };
    ServicesAddressManage.editAddress(s).then(function (a) {
      if (0 === a.code) {
        app.data.addressInfoList.forEach(function (t) {
          ((t.defaultFlag = 0), t.id == e.currentTarget.dataset.item.id && (t.defaultFlag = 1));
        });
        var s = [];
        (app.data.addressInfoList.forEach(function (e) {
          1 == e.defaultFlag ? s.unshift(e) : s.push(e);
        }),
          app.setData({
            addressInfoList: s,
          }));
      } else
        wx.showToast({
          title: a.msg,
          icon: "none",
        });
    });
  },
  editAddress: function (e) {
    var app = e.currentTarget.dataset.id;
    (console.log(app),
      wx.navigateTo({
        url: "/packageA/pages/demand/my-demand/address-manage/add-address/add-address?id=".concat(
          app,
        ),
      }));
  },
  addressList: function () {
    var app = this,
      s = {
        pageSize: 10,
        pageNum: this.data.pageNum,
      };
    (wx.showLoading(),
      ServicesAddressManage.addressList(s).then(function (a) {
        (wx.hideLoading(),
          0 === a.code
            ? (app.setData({
                totalPage: a.data.totalPage,
              }),
              app.setData({
                addressInfoList: [].concat(
                  toConsumableArray(app.data.addressInfoList),
                  toConsumableArray(a.data.content),
                ),
              }))
            : wx.showToast({
                title: a.msg,
                icon: "none",
              }));
      }));
  },
  deleteAddress: function (e) {
    this.setData({
      showDialog: !0,
      delMsg: "您确定要删除“".concat(e.currentTarget.dataset.name, "”地址信息？"),
      delId: e.currentTarget.dataset.id,
    });
  },
  onConfirm: function () {
    var toConsumableArray = this;
    ServicesAddressManage.removeAddress({
      id: this.data.delId,
    }).then(function (t) {
      0 == t.code &&
        ((toConsumableArray.data.pageNum = 1),
        toConsumableArray.setData({
          addressInfoList: [],
        }),
        wx.showToast({
          title: "地址删除成功",
          icon: "success",
        }),
        setTimeout(function () {
          toConsumableArray.addressList();
        }, 500));
    });
  },
  selectDeliveryAddress: function (e) {
    var app = getCurrentPages();
    (app[app.length - 2].setData({
      chooseAddress: e.currentTarget.dataset.item,
      selAddress: "yes",
    }),
      wx.navigateBack({
        delta: 1,
      }));
  },
});
