var e = require("../../../@babel/runtime/helpers/interopRequireDefault").default,
  t = require("../../../@babel/runtime/helpers/defineProperty"),
  mta_analysis = e(require("../../../utils/mta_analysis.js")),
  i =
    (require("../../../libs/utils/cpcl-exp.js"),
    require("../../../libs/services/ServicesCard.js").servicesCard),
  app = getApp();
Page({
  data: {
    image: {
      topStaff: "".concat(app.config.imgHost, "/img/customer/duibuIcon/icon/chi2@2x.png"),
      leftStaff: "".concat(app.config.imgHost, "/img/customer/duibuIcon/icon/chi1@2x.png"),
      unSelect: "/assets/images/icon2nd/symbols-no-select.png",
      select: "/assets/images/icon2nd/symbols-select.png",
    },
    nowList: [],
    selectSortList: [],
    miniCodeImgPath: "",
    productId: "",
    count: 0,
    detailsData: {},
    input_val: 1,
    labelType: 0,
    remark: "",
    remarkLimit: 18,
    newPrintType: null,
    remarkFocus: !1,
    langType: "1",
    showLoading: !0,
  },
  onLoad: function (e) {
    mta_analysis.default.Page.init();
    var t = wx.getStorageSync("colorCaraSetting");
    (this.setData({
      productId: t.productId,
      nowList: t,
    }),
      wx.hideShareMenu());
  },
  onShow: function () {
    wx.removeStorageSync("creterProdShare");
  },
  carterProdShare: function () {
    (wx.setStorageSync("creterProdShare", this.data.productId),
      wx.setStorageSync("colorCaraSetting", this.data.nowList),
      i.productSetting(this.data.nowList).then(function (e) {
        0 === e.code &&
          wx.navigateBack({
            delta: 1,
          });
      }));
  },
  getColorCardDetails: function () {
    var e = this;
    wx.showLoading({
      title: "加载中",
    });
    var t = {
      productId: this.data.productId,
    };
    i.colorCardDetails(t).then(function (t) {
      if ((console.log("获取色卡设置信息"), console.log(t), 0 === t.code)) {
        var mta_analysis = t.data;
        e.setData({
          nowList: mta_analysis,
          labelType: mta_analysis.labelType,
        });
      }
      wx.hideLoading();
    });
  },
  inputgetName: function (e) {
    (this.setData({
      [e.currentTarget.dataset.name]: e.detail.value,
    }),
      this.onChangeSetting("remark", e.detail.value));
  },
  changeStatus: function (e) {
    var t,
      mta_analysis = this.data.nowList;
    switch (e.currentTarget.id) {
      case "showQrcode":
        ((t = 1 == mta_analysis.showQrcode ? 0 : 1), this.onChangeSetting("showQrcode", t));
        break;
      case "showProductName":
        ((t = 1 == mta_analysis.showProductName ? 0 : 1),
          this.onChangeSetting("showProductName", t));
        break;
      case "showPrice":
        ((t = 1 == mta_analysis.showPrice ? 0 : 1), this.onChangeSetting("showPrice", t));
        break;
      case "showShelvesNumber":
        ((t = 1 == mta_analysis.showShelvesNumber ? 0 : 1),
          this.onChangeSetting("showShelvesNumber", t));
        break;
      case "showMaterial":
        ((t = 1 == mta_analysis.showMaterial ? 0 : 1), this.onChangeSetting("showMaterial", t));
    }
  },
  onChangeSetting: function (e, t) {
    ((this.data.nowList[e] = t),
      this.setData({
        nowList: this.data.nowList,
      }));
  },
});
