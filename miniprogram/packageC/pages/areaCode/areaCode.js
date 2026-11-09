var t = require("../../../@babel/runtime/helpers/interopRequireDefault").default,
  toConsumableArray = require("../../../@babel/runtime/helpers/toConsumableArray"),
  country_data = t(require("../../utils/country-data")),
  app = getApp();
Page({
  data: {
    page: 1,
    totalPage: 12,
    list: [],
    cacheList: [],
    icon: "".concat(app.config.imgHost, "/img/customer/duibuIcon/flags/"),
  },
  onLoad: function () {
    this.getData();
  },
  onReachBottom: function () {
    this.data.page < this.data.totalPage &&
      (this.setData({
        page: this.data.page + 1,
      }),
      this.getData());
  },
  getData: function () {
    this.setData({
      list: [].concat(
        toConsumableArray(this.data.list),
        toConsumableArray(
          country_data.default.slice(20 * (this.data.page - 1), 20 * this.data.page),
        ),
      ),
      cacheList: [].concat(
        toConsumableArray(this.data.list),
        toConsumableArray(
          country_data.default.slice(20 * (this.data.page - 1), 20 * this.data.page),
        ),
      ),
    });
  },
  inputgetName: function (t) {
    var toConsumableArray = this.data.cacheList.filter(function (a) {
      return a.localName.includes(t.detail.value);
    });
    this.setData({
      list: toConsumableArray,
    });
  },
  clickHandle: function (t) {
    ((app.areaCode = t.currentTarget.dataset.code),
      wx.navigateBack({
        delta: 1,
      }));
  },
});
