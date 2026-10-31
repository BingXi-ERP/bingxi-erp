var ServicesCenter = require("../../../libs/services/ServicesCenter.js").servicesCenter,
  app = getApp();
Page({
  data: {
    avatar: "",
    nickName: "",
  },
  onLoad: function (a) {
    this.setData({
      nickName: a.nickName,
      avatar: a.avatar,
    });
  },
  input_val: function (a) {
    this.setData({
      nickName: a.detail.value,
    });
  },
  formSubmit: function () {
    var t = {
      userId: app.globalData.userInfo.id,
      avatar: this.data.avatar,
      nickName: this.data.nickName,
    };
    ServicesCenter.updateUser(t).then(function (a) {
      if (0 === a.code) {
        wx.showToast({
          title: "保存成功",
        });
        var app = setTimeout(function () {
          (wx.navigateBack(), clearTimeout(app));
        }, 1e3);
      } else
        wx.showToast({
          title: a.msg.result,
          icon: "none",
        });
    });
  },
});
