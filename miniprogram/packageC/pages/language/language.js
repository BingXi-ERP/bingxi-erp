require("../../../@babel/runtime/helpers/Arrayincludes");
getApp();
Page({
  data: {
    list: ["中文"],
    cacheList: ["中文"],
  },
  onLoad: function () {
    this.getData();
  },
  inputgetName: function (t) {
    var e = this.data.cacheList.filter(function (e) {
      return e.includes(t.detail.value);
    });
    this.setData({
      list: e,
    });
  },
});
