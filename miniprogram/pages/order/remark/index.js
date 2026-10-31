var e = require("../../../@babel/runtime/helpers/defineProperty"),
  ServicesReturn = require("../../../libs/services/ServicesReturn"),
  ServicesOrder = require("../../../libs/services/ServicesOrder").ServicesOrder;
Page({
  data: {
    id: "",
    remarksFocus: !1,
    billingRemark: "",
    orderType: "",
  },
  onLoad: function (e) {
    this.setData({
      id: e.id,
      billingRemark: e.remark,
      orderType: e.orderType ? e.orderType : "",
    });
  },
  onReady: function () {},
  onShow: function () {},
  handleShowTextarea: function () {
    this.setData({
      remarksFocus: !0,
    });
  },
  handleHideTextarea: function () {
    this.setData({
      remarksFocus: !1,
    });
  },
  handleUpdateVal: function (a) {
    var ServicesOrder = a.currentTarget.dataset.key,
      t = a.detail.value;
    this.setData({
      ServicesOrder: t,
    });
  },
  saveRemark: function () {
    this.saveFun();
  },
  saveFun: function () {
    var e = {
      id: this.data.id,
      billingId: this.data.id,
      billingRemark: this.data.billingRemark,
    };
    this.data.orderType
      ? ServicesReturn.ServicesReturn.updateRemarkRefund(e).then(function (e) {
          0 === e.code
            ? wx.navigateBack({
                delta: 1,
              })
            : wx.showToast({
                title: e.msg,
                icon: "none",
              });
        })
      : ServicesOrder.saveRemark(e).then(function (e) {
          0 === e.code
            ? wx.navigateBack({
                delta: 1,
              })
            : wx.showToast({
                title: e.msg,
                icon: "none",
              });
        });
  },
  onHide: function () {},
  onUnload: function () {},
  onPullDownRefresh: function () {},
  onReachBottom: function () {},
  onShareAppMessage: function () {},
});
