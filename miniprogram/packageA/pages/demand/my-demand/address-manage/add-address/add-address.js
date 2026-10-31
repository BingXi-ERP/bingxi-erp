var e = require("../../../../../../@babel/runtime/helpers/defineProperty"),
  getLocation = require("../../../../../../libs/utils/getLocation"),
  ServicesAddressManage =
    require("../../../../../services/ServicesAddressManage.js").ServicesAddressManage;
Page({
  data: {
    region: [],
    addressInfo: {
      name: "",
      phone: "",
      province: "",
      provinceId: "",
      city: "",
      cityId: "",
      area: "",
      areaId: "",
      detailAddress: "",
      defaultFlag: !0,
    },
    addressId: null,
  },
  onLoad: function (e) {
    e.id &&
      (this.setData({
        addressId: e.id,
      }),
      this.getAddressDetail());
  },
  inputgetName: function (a) {
    var ServicesAddressManage = a.detail.value;
    this.setData({
      [a.currentTarget.dataset.name]: ServicesAddressManage,
    });
  },
  inputgetPhone: function (a) {
    var ServicesAddressManage = a.detail.value;
    return (
      (t = ServicesAddressManage.replace(/[^\d]/g, "")),
      this.setData({
        [a.currentTarget.dataset.name]: ServicesAddressManage,
      }),
      ServicesAddressManage
    );
  },
  switch1Change: function (e) {
    this.setData({
      "addressInfo.defaultFlag": e.detail.value,
    });
  },
  bindRegionChange: function (e) {
    this.setData({
      region: e.detail.value,
      "addressInfo.province": e.detail.value[0],
      "addressInfo.provinceId": e.detail.code[0],
      "addressInfo.city": e.detail.value[1],
      "addressInfo.cityId": e.detail.code[1],
      "addressInfo.area": e.detail.value[2],
      "addressInfo.areaId": e.detail.code[2],
    });
  },
  setLocationId: function () {
    var e = this;
    0 !== this.data.region.length
      ? (0, getLocation.getAddressId)(this.data.region).then(function (a) {
          (e.setData({
            "customerInfo.provinceId": a[0],
            "customerInfo.cityId": a[1],
            "customerInfo.areaId": a[2],
          }),
            e.editAddress());
        })
      : this.editAddress();
  },
  editAddress: function () {
    var e = this;
    if (this.data.addressInfo.name) {
      if (this.data.addressInfo.phone) {
        if (/^1\d{10}$/.test(this.data.addressInfo.phone)) {
          if (this.data.addressInfo.name) {
            if (this.data.addressInfo.provinceId) {
              if (this.data.addressInfo.detailAddress) {
                var getLocation;
                a = 1 == this.data.addressInfo.defaultFlag ? 1 : 0;
                var d = {
                    name: this.data.addressInfo.name,
                    phone: this.data.addressInfo.phone,
                    province: this.data.addressInfo.province,
                    provinceId: this.data.addressInfo.provinceId,
                    city: this.data.addressInfo.city,
                    cityId: this.data.addressInfo.cityId,
                    area: this.data.addressInfo.area,
                    areaId: this.data.addressInfo.areaId,
                    detailAddress: this.data.addressInfo.detailAddress,
                    defaultFlag: getLocation,
                  },
                  s = "saveAddress";
                (this.data.addressId && ((d.id = this.data.addressId), (s = "editAddress")),
                  ServicesAddressManage[s](d).then(function (a) {
                    0 === a.code
                      ? (wx.showToast({
                          title: e.data.addressId ? "修改地址成功" : "新增地址成功",
                          icon: "success",
                        }),
                        setTimeout(function () {
                          wx.navigateBack({
                            delta: 1,
                          });
                        }, 500))
                      : wx.showToast({
                          title: a.msg,
                          icon: "none",
                        });
                  }));
              } else
                wx.showToast({
                  title: "请输入详细地址",
                  icon: "none",
                  duration: 1e3,
                });
            } else
              wx.showToast({
                title: "请选择所在地区",
                icon: "none",
                duration: 1e3,
              });
          } else
            wx.showToast({
              title: "请输入收货人",
              icon: "none",
              duration: 1e3,
            });
        } else
          wx.showToast({
            title: "请输入正确的手机号",
            icon: "none",
            duration: 1e3,
          });
      } else
        wx.showToast({
          title: "请输入手机号",
          icon: "none",
          duration: 1e3,
        });
    } else
      wx.showToast({
        title: "请输入收货人",
        icon: "none",
        duration: 1e3,
      });
  },
  getAddressDetail: function () {
    var e = this,
      getLocation = {
        id: this.data.addressId,
      };
    ServicesAddressManage.addressDetail(getLocation).then(function (a) {
      0 === a.code
        ? ((e.data.region[0] = a.data.province),
          (e.data.region[1] = a.data.city),
          (e.data.region[2] = a.data.area),
          e.setData({
            addressInfo: a.data,
            region: e.data.region,
          }))
        : wx.showToast({
            title: a.msg,
            icon: "none",
          });
    });
  },
});
