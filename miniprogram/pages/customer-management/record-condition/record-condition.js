var ServicesCustomer = require("../../../libs/services/ServicesCustomer.js").servicesCustomer;
require("../../../libs/utils/util.js").utils;
Page({
  data: {
    recordInfo: {},
    trackRecordId: "",
    modalHidden: !0,
    imgPreviewArr: [],
  },
  previewImage: function (e) {
    wx.previewImage({
      current: e.currentTarget.id,
      urls: [e.currentTarget.id],
    });
  },
  previewNumImage: function (e) {
    wx.previewImage({
      current: e.currentTarget.id,
      urls: this.data.imgPreviewArr,
    });
  },
  getTrackRecordDetail: function () {
    var t = this,
      r = this,
      a = {
        trackRecordId: this.data.trackRecordId,
      };
    ServicesCustomer.trackRecordDetail(a).then(function (e) {
      0 === e.code
        ? (t.setData({
            recordInfo: e.data,
          }),
          t.data.recordInfo.trackRecordImgList.map(function (e) {
            r.data.imgPreviewArr.push(e.imgPath);
          }),
          t.setData({
            imgPreviewArr: r.data.imgPreviewArr,
          }))
        : wx.showToast({
            title: e.msg,
            icon: "none",
          });
    });
  },
  removeTrackRecord: function () {
    this.setData({
      modalHidden: !1,
    });
  },
  getNowFormatDate: function (e) {
    var t = new Date(e),
      r = "" + (t.getMonth() + 1),
      a = "" + t.getDate(),
      o = t.getFullYear();
    return (r.length < 2 && (r = "0" + r), a.length < 2 && (a = "0" + a), [o, r, a].join("-"));
  },
  modalConfirm: function () {
    var t = this,
      r = {
        trackId: this.data.trackRecordId,
        customerId: this.data.recordInfo.customerId,
      };
    ServicesCustomer.removeTrackRecord(r).then(function (e) {
      if (0 === e.code) {
        t.setData({
          modalHidden: !0,
        });
        wx.getStorageSync("customerId");
        wx.navigateBack({
          delta: 1,
        });
      } else
        wx.showToast({
          title: e.msg,
          icon: "none",
        });
    });
  },
  modalCancel: function () {
    this.setData({
      modalHidden: !0,
    });
  },
  onLoad: function (e) {
    (this.setData({
      trackRecordId: e.trackRecordId,
    }),
      wx.hideShareMenu(),
      this.getTrackRecordDetail());
  },
  onReady: function () {},
  onShow: function () {},
  onHide: function () {},
  onUnload: function () {},
  onPullDownRefresh: function () {},
  onReachBottom: function () {},
  onShareAppMessage: function () {},
});
