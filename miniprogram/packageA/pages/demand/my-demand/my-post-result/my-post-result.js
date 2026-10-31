var objectSpread2 = require("../../../../../@babel/runtime/helpers/objectSpread2"),
  services_demand = require("../../../../services/services-demand"),
  app = getApp(),
  getFormId = require("../../../../utils/getFormId").saveFormId,
  util = require("../../../../utils/util.js").utils;
Page({
  data: {
    showNoData: !1,
    icon: {
      avatar: "",
      rightArrow: "".concat(app.config.imgHost, "/img/customer/ic_jinru.png"),
      noImg: "".concat(app.config.imgHost, "/img/customer/Defaultpage_Noneed@2x.png"),
    },
    itemId: "",
    pageNum: 1,
    pageSize: 20,
    isAll: !1,
    postResult: [
      {
        id: "",
        status: 0,
        img: "",
        detailText: "",
        matchStatusName: "",
        partPrice: "",
        partPriceUnit: "",
        bulkPrice: "",
        bulkPriceUnit: "",
        pushTime: "",
      },
    ],
  },
  toResultDetail: function (t) {
    var services_demand = t.currentTarget.dataset.itemId;
    wx.navigateTo({
      url: "/packageA/pages/demand/my-demand/my-post-result-detail/my-post-result-detail?replyId=".concat(
        services_demand,
      ),
    });
  },
  noMatching: function (t) {
    var services_demand = t.currentTarget.dataset.itemId,
      app = this;
    wx.showModal({
      title: "不匹配",
      content: "是否确认该反馈与您发起的需求不匹配？",
      confirmColor: "#2D74EE",
      cancelColor: "#373C55",
      success: function (t) {
        t.confirm && app._saveNoMatch(services_demand);
      },
    });
  },
  _reset: function () {
    this.setData({
      pageNum: 1,
      pageSize: 10,
      isAll: !1,
      postResult: [],
    });
  },
  getMatchList: function () {
    var app = this,
      getFormId = this.data.itemId;
    services_demand.ServicesDemand.matchList({
      id: getFormId,
    }).then(function (e) {
      wx.hideNavigationBarLoading();
      var getFormId = e.data.list;
      if (getFormId.length) {
        app.setData({
          showNoData: !1,
        });
        var s = getFormId.map(function (e) {
          return objectSpread2(
            objectSpread2({}, e),
            {},
            {
              id: e.id,
              img: e.imgPath,
              detailText: e.remark,
              partPrice: e.partPrice,
              partPriceUnit: e.partPriceUnit,
              bulkPrice: e.bulkPrice,
              bulkPriceUnit: e.bulkPriceUnit,
              backReplyId: e.backReplyId,
              matchStatusName: e.matchStatusName.trim(),
              pushTime:
                e.pushTime && "" !== e.pushTime ? util.formatDateTime(e.pushTime, !1, !1, !0) : "",
            },
          );
        });
        app.setData({
          postResult: s,
        });
      } else
        app.setData({
          showNoData: !0,
        });
    });
  },
  formSubmit: function (t) {
    getFormId.getformId(t.detail.formId);
  },
  toPostResult: function (t) {
    var services_demand = t.currentTarget.dataset.type,
      app = t.currentTarget.dataset.item,
      getFormId = t.currentTarget.dataset.itemId;
    a = JSON.stringify(app);
    var util = t.currentTarget.dataset.itemType;
    wx.navigateTo({
      url: "/packageA/pages/demand/my-demand/my-post-result-choose/my-post-result-choose?&&replyId="
        .concat(getFormId, "&&itemType=")
        .concat(util, "&&type=")
        .concat(services_demand, "&&item=")
        .concat(app),
    });
  },
  _saveNoMatch: function (t) {
    services_demand.ServicesDemand.saveNoMatch({
      replyId: t,
    }).then(function (t) {
      0 === t.code &&
        wx.showToast({
          title: "提交成功",
          icon: "none",
        });
    });
  },
  getPageInfo: function (t) {
    t.showIcon &&
      this.setData({
        showIcon: 1,
      });
  },
  toHome: function () {
    wx.reLaunch({
      url: "/pages/index/index",
    });
  },
  onLoad: function (t) {
    var services_demand = t.itemId;
    ((this.data.itemId || services_demand) &&
      (this.setData({
        itemId: services_demand,
      }),
      this.getMatchList()),
      this.getPageInfo(t));
  },
});
