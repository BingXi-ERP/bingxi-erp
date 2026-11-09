var e = require("../../../../@babel/runtime/helpers/interopRequireDefault").default,
  mta_analysis = e(require("../../../utils/mta_analysis.js")),
  isVisitor = e(require("../../../libs/utils/isVisitor")),
  ServicesCard = require("../../../libs/services/ServicesCard.js").servicesCard;
Page({
  data: {
    printType: null,
  },
  onLoad: function () {
    mta_analysis.default.Page.init();
  },
  onShow: function () {
    this.getPrintType();
  },
  getPrintType: function () {
    var e = this;
    ServicesCard.newLabelPrint({}).then(function (i) {
      if (0 === i.code) {
        if (null !== i.data) {
          var isVisitor = i.data.mpNewLabelPrint;
          e.setData({
            printType: isVisitor,
          });
        }
        wx.hideLoading();
      } else
        wx.showToast({
          title: i.msg,
          icon: "none",
        });
    });
  },
  handleLinkTo: function (e) {
    var mta_analysis;
    (this.data.printType && 1 === this.data.printType
      ? (console.log("是新打印"),
        (i = "/packageB/pages/personal-center/link-print-new/link-print-new"))
      : (console.log("是旧打印"), (i = "/packageB/pages/personal-center/link-print/link-print")),
      wx.navigateTo({
        url: mta_analysis,
      }));
  },
  handleLinkToZhen: function (e) {
    isVisitor.default.isVisitor().then(function (i) {
      var isVisitor = e.currentTarget.dataset.url;
      wx.navigateTo({
        url: isVisitor,
      });
    });
  },
});
