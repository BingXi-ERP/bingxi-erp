var services_demand = require("../../../../services/services-demand"),
  app = getApp();
Page({
  data: {
    replyId: "",
    itemId: "",
    curtomerPhone: "123123",
    swiperError: 0,
    current: 0,
    productDate: {
      auditNoPassReason: "",
      bulkPrice: "",
      bulkPriceUnit: "",
      bulkStatus: "",
      fetchColorCardStatus: 0,
      id: "",
      imgArr: [],
      matchStatus: "",
      partPrice: "",
      partPriceUnit: "",
      partStatus: 0,
      remark: "",
      replyNo: "",
      stockGoods: 0,
      matchStatusName: "",
    },
    icon: {
      phone: "".concat(app.config.imgHost, "/img/v2.7.5/dianhua@2x.png"),
    },
  },
  showService: function () {
    if (
      (services_demand.ServicesDemand.contactLog({
        replyId: this.data.replyId,
      }).then(function (t) {
        0 !== t.code && console.log("联系商家日志提交错误" + t.msg);
      }),
      2 != this.data.productDate.contactAlertStyle)
    ) {
      var app = this;
      wx.showActionSheet({
        itemList: app.data.productDate.shopTelephones,
        itemColor: "#4C7CF9",
        success: function (t) {
          app.makeCall(t.tapIndex);
        },
        fail: function (t) {
          console.log(t.errMsg);
        },
      });
    } else
      wx.showToast({
        title: "请联系回复图片中提供的供应商号码",
        icon: "none",
      });
  },
  makeCall: function (t) {
    var app = this.data.productDate;
    0 != app.shopTelephones.length
      ? wx.makePhoneCall({
          phoneNumber: app.shopTelephones[t],
        })
      : wx.showToast({
          title: "暂无联系电话",
          icon: "none",
        });
  },
  copyText: function (t) {
    var app = t.currentTarget.dataset.text;
    wx.setClipboardData({
      data: app,
    });
  },
  noMatching: function (t) {
    var app = t.currentTarget.dataset.itemId,
      a = this;
    wx.showModal({
      title: "不匹配",
      content: "是否确认该反馈与您发起的需求不匹配？",
      confirmColor: "#2D74EE",
      cancelColor: "#373C55",
      success: function (t) {
        t.confirm && a._saveNoMatch(app);
      },
    });
  },
  changeGoodsSwip: function (t) {
    "touch" == t.detail.source &&
      this.setData({
        current: t.detail.current,
      });
  },
  toPostResult: function (t) {
    var app = t.currentTarget.dataset.type,
      a = this.data.productDate.id,
      o = t.currentTarget.dataset.itemType,
      n = this.data.replyId;
    wx.navigateTo({
      url: "/packageA/pages/demand/my-demand/my-post-result-choose/my-post-result-choose?listId="
        .concat(a, "&&itemType=")
        .concat(o, "&&type=")
        .concat(app, "&&replyId=")
        .concat(n),
    });
  },
  previewImage: function (t) {
    var app = t.target.dataset.src;
    wx.previewImage({
      current: app,
      urls: this.data.productDate.imgArr,
    });
  },
  getListDetail: function (e) {
    var a = this,
      o = e.replyId;
    o &&
      services_demand.ServicesDemand.matchDetail({
        replyId: o,
      }).then(function (t) {
        var app = t.data;
        a.setData({
          productDate: app,
        });
      });
  },
  _saveNoMatch: function (e) {
    services_demand.ServicesDemand.saveNoMatch({
      replyId: e,
    }).then(function (t) {
      0 === t.code &&
        wx.showToast({
          title: "提交成功",
          icon: "none",
        });
    });
  },
  onLoad: function (t) {
    (this.setData({
      replyId: t.replyId,
    }),
      this.getListDetail(t));
  },
  onReady: function () {},
  onShow: function () {},
  onHide: function () {},
  onUnload: function () {},
  onPullDownRefresh: function () {},
  onReachBottom: function () {},
  onShareAppMessage: function () {},
});
