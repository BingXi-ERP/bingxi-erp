var t = require("../../../@babel/runtime/helpers/interopRequireDefault").default,
  ServicesUserLog = require("../../../libs/services/ServicesUserLog.js"),
  app = getApp(),
  ServicesCustomer = require("../../../libs/services/ServicesCustomer.js").servicesCustomer;
require("../../../libs/utils/util.js").utils;
Page({
  data: {
    showImgList: [],
    panel: {
      img: "/assets/icons/color_add@2x.png",
      title: "选择领取的色卡",
      subTitle: " ",
    },
    colorCardArr: [],
    inputValue: "",
    customerId: "",
    iconSize: {
      width: 50,
      height: 50,
    },
    confirmDisplay: !1,
  },
  toColorCardList: function () {
    wx.navigateTo({
      url: "/pages/customer-management/color-card-list/color-card-list",
    });
  },
  bindinput: function (t) {
    var ServicesUserLog = t.detail.value;
    this.setData({
      inputValue: ServicesUserLog,
    });
  },
  uoloadImg: function (t) {
    var ServicesUserLog = t.detail.showImgList;
    (this.setData({
      showImgList: ServicesUserLog,
    }),
      console.log(this.data.showImgList));
  },
  delImg: function (t) {
    var ServicesUserLog = t.detail.showImgList;
    (this.setData({
      showImgList: ServicesUserLog,
    }),
      console.log(this.data.showImgList));
  },
  submit: function () {
    var t = this.data,
      mpValue = t.inputValue,
      app = t.showImgList,
      n = t.colorCardArr,
      a = t.customerId;
    if ("" != mpValue || 0 != app.length || 0 != n.length) {
      for (var r = [], c = 0; c < n.length; c++) r.push(n[c].goodsid);
      var u = {
        customerId: a,
        content: mpValue,
        recordImgPathList: app,
        goodsIdList: r,
      };
      ServicesCustomer.saveTrackRecord(u).then(function (t) {
        0 === t.code
          ? (ServicesUserLog.servicesUserLog.setUserHandleLog(314),
            wx.navigateBack({
              delta: 1,
              success: function () {
                (wx.showToast({
                  title: "添加成功",
                  icon: "none",
                }),
                  wx.removeStorageSync("pickColorCard"));
              },
            }))
          : wx.showToast({
              title: t.msg,
              icon: "none",
            });
      });
    } else
      wx.showToast({
        title: "请输入内容或图片或色卡",
        icon: "none",
      });
  },
  onLoad: function (t) {
    (wx.hideShareMenu());
  },
  onReady: function () {},
  onShow: function () {
    this.setData({
      colorCardArr: wx.getStorageSync("pickColorCard"),
      customerId: wx.getStorageSync("customerId"),
    });
  },
  onHide: function () {},
  onUnload: function () {},
  onPullDownRefresh: function () {},
  onReachBottom: function () {},
  onShareAppMessage: function () {},
});
