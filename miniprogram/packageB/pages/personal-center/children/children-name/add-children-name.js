getApp();
var ServicesCenter = require("../../../../libs/services/ServicesCenter.js").servicesCenter;
Page({
  data: {
    name: "",
    userId: "",
  },
  onLoad: function (e) {
    (this.setData({
      userId: e.id,
    }),
      "" != e.name &&
        this.setData({
          name: e.name,
        }),
      wx.hideShareMenu());
  },
  onReady: function () {},
  input_val: function (e) {
    this.setData({
      name: e.detail.value,
    });
  },
  changeName: function () {
    var a = this;
    if ("" != a.data.name) {
      var t = {
        nickName: a.data.name,
        userId: a.data.userId,
      };
      ServicesCenter.changeChildrenName(t).then(function (e) {
        0 === e.code
          ? (wx.navigateBack({
              delta: 1,
            }),
            wx.showToast({
              title: "姓名修改成功",
              icon: "success",
            }))
          : wx.showToast({
              title: e.msg,
              icon: "none",
            });
      });
    } else
      wx.showToast({
        title: "请填写姓名",
        icon: "none",
      });
  },
});
