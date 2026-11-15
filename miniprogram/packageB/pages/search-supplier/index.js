var ServicesSearch = require("../../libs/services/ServicesSearch"),
  getDictData = require("../../libs/utils/getDictData"),
  util = require("../../libs/utils/util.js").utils;
getApp();
Page({
  data: {
    supplierData: [],
    formInline: {
      searchId: "",
      uuid: "",
      spuNumber: "",
    },
    dictData: {
      supplierAdrTypeOption: [],
      defaultTypeOption: [],
      supplierTypeOption: [],
    },
    contactColumns: [
      {
        label: "联系人类型",
        prop: "contactType",
      },
      {
        label: "联系人姓名",
        prop: "name",
      },
      {
        label: "手机号码",
        prop: "phone",
      },
    ],
    addressColumns: [
      {
        label: "地址类型",
        prop: "addressType",
      },
      {
        label: "地址",
        prop: "address",
      },
      {
        label: "商圈",
        prop: "tradingArea",
      },
      {
        label: "是否默认地址",
        prop: "isDefault",
      },
    ],
  },
  colValCompute: function (t, e) {
    return (console.log(t, e), "");
  },
  getSupplierData: function () {
    var getDictData = this,
      util = this.data.formInline,
      i = util.searchId,
      n = util.uuid,
      p = util.spuNumber;
    i && n && p
      ? ServicesSearch.ServicesSearch.getSupplierMsg(this.data.formInline).then(function (t) {
          getDictData.setData({
            supplierData: t.data,
          });
        })
      : wx.showToast({
          title: "参数有误,请重试",
          icon: "error",
        });
  },
  onLoad: function (t) {
    var i = this;
    (this.setData({
      formInline: util.formatUrlQuery(t),
    }),
      (0, getDictData.getDictData)("supplier_address_type").then(function (t) {
        i.setData({
          "dictData.supplierAdrTypeOption": t,
        });
      }),
      (0, getDictData.getDictData)("default_type").then(function (t) {
        i.setData({
          "dictData.defaultTypeOption": t,
        });
      }),
      (0, getDictData.getDictData)("supplier_type").then(function (t) {
        i.setData({
          "dictData.supplierTypeOption": t,
        });
      }),
      this.getSupplierData());
  },
  onReady: function () {},
  onShow: function () {},
  onHide: function () {},
  onUnload: function () {},
  onPullDownRefresh: function () {},
  onReachBottom: function () {},
  onShareAppMessage: function () {},
});
