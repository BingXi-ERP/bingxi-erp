Page({
  data: {
    userName: "",
    mobile: "",
  },
  inputVal: function (a) {
    var e = a.detail.value;
    this.setData({
      userName: e,
    });
  },
  toPath: function () {
    wx.navigateTo({
      url: "/packageB/pages/register/professer-info/professer-info?userName="
        .concat(this.data.userName, "&mobile=")
        .concat(this.data.mobile),
    });
  },
  onLoad: function (a) {
    var e = wx.getStorageSync("mobile");
    this.setData({
      mobile: e,
    });
  },
});
