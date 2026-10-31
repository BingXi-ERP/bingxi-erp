var ServicesReturn = require("../../../libs/services/ServicesReturn"),
  ServicesOrder = require("../../../libs/services/ServicesOrder").ServicesOrder,
  app = getApp();
Page({
  data: {
    showImgList: [],
    inputValue: "",
    id: "",
    icon: {
      upload: "".concat(app.config.imgHost, "/img/customer/upload@2x.png"),
    },
    iconSize: {
      width: 50,
      height: 50,
    },
  },
  onLoad: function (t) {
    ("saleReturn" === t.orderType &&
      wx.setNavigationBarTitle({
        title: "修改其他信息",
      }),
      this.setData({
        id: t.id,
        orderType: t.orderType ? t.orderType : "",
        showImgList: t.list.length ? t.list.split(",") : [],
      }));
  },
  onReady: function () {},
  onShow: function () {},
  uploadImg: function (t) {
    var ServicesOrder = t.detail.showImgList;
    this.setData({
      showImgList: ServicesOrder,
    });
  },
  delImg: function (t) {
    var ServicesOrder = t.detail.showImgList;
    this.setData({
      showImgList: ServicesOrder,
    });
  },
  submit: function () {
    var app = this.data,
      n = app.showImgList,
      o = app.id;
    if (0 != n.length) {
      var s = {
        id: o,
        billingId: o,
        billingPurchaseImgList: n,
      };
      "saleReturn" === this.data.orderType
        ? ServicesReturn.ServicesReturn.refundImg(s).then(function (t) {
            0 === t.code
              ? wx.navigateBack({
                  delta: 1,
                  success: function () {
                    wx.showToast({
                      title: "添加成功",
                      icon: "none",
                    });
                  },
                })
              : wx.showToast({
                  title: t.msg,
                  icon: "none",
                });
          })
        : ServicesOrder.saveImage(s).then(function (t) {
            0 === t.code
              ? wx.navigateBack({
                  delta: 1,
                  success: function () {
                    wx.showToast({
                      title: "添加成功",
                      icon: "none",
                    });
                  },
                })
              : wx.showToast({
                  title: t.msg,
                  icon: "none",
                });
          });
    } else
      wx.showToast({
        title: "请上传图片",
        icon: "none",
      });
  },
  saveRemark: function () {
    this.submit();
  },
  onHide: function () {},
  onUnload: function () {},
  onPullDownRefresh: function () {},
  onReachBottom: function () {},
  onShareAppMessage: function () {},
});
