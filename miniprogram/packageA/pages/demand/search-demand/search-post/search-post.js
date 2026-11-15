var toConsumableArray = require("../../../../../@babel/runtime/helpers/toConsumableArray"),
  objectSpread2 = require("../../../../../@babel/runtime/helpers/objectSpread2"),
  a = require("../../../../../@babel/runtime/helpers/defineProperty"),
  services_demand = require("../../../../services/services-demand"),
  app = getApp();
Page({
  data: {
    noResult: !1,
    keyword: "",
    shopId: null,
    more: !1,
    moreIcon: !0,
    pageNum: 0,
    pageSize: 10,
    total: 1.5,
    isAll: !1,
    popup: {
      showPopup: !1,
      popupRadio: "",
    },
    icon: {
      avatar: "",
      rightArrow: "".concat(app.config.imgHost, "/img/customer/ic_jinru.png"),
    },
    myPost: [],
    closeForm: {
      id: "",
      closeReason: "",
    },
  },
  closeDemand: function (e) {
    var objectSpread2 = e.currentTarget.dataset.itemId;
    (console.log(objectSpread2),
      this.setData({
        "popup.showPopup": !0,
        "closeForm.id": objectSpread2,
      }),
      console.log(this.data.popup.showPopup));
  },
  popupClose: function () {
    this.setData({
      "popup.showPopup": !1,
    });
  },
  popupClick: function (e) {},
  popupChange: function (e) {
    var objectSpread2 = e.detail,
      a = "";
    (this.setData({
      "popup.popupRadio": objectSpread2,
    }),
      "1" === objectSpread2 && (a = "已找到，无需匹配"),
      "2" === objectSpread2 && (a = "填写错误，需重新发起需求"),
      this.setData({
        "closeForm.closeReason": a,
      }),
      console.log(this.data.closeForm.closeReason),
      console.log(this.data.popup.popupRadio));
  },
  inputgetName: function (e) {
    (console.log(e.currentTarget.dataset.name),
      this.setData({
        [e.currentTarget.dataset.name]: e.detail.value,
      }),
      console.log(this.data.closeForm));
  },
  popupComfirm: function (e) {
    var objectSpread2 = this.data.closeForm.id,
      a = this.data.closeForm.closeReason;
    this.toCloseDemand({
      id: objectSpread2,
      closeReason: a,
    });
  },
  popupCancle: function () {
    (this.setData({
      "closeForm.id": "",
      "closeForm.closeReason": "",
      "popup.popupRadio": "",
    }),
      this.popupClose());
  },
  toPost: function (e) {
    var objectSpread2 = e.currentTarget.dataset.itemId;
    (console.log(objectSpread2),
      wx.navigateTo({
        url: "/packageA/pages/demand/demand-detail/post-demand/post-demand?itemId=".concat(
          objectSpread2,
        ),
      }));
  },
  toPostResult: function (e) {
    var objectSpread2 = e.currentTarget.dataset.itemId;
    wx.navigateTo({
      url: "/packageA/pages/demand/my-demand/my-post-result/my-post-result?itemId=".concat(
        objectSpread2,
      ),
    });
  },
  toJoinDetail: function (e) {
    var objectSpread2 = e.currentTarget.dataset.itemId,
      a = e.currentTarget.dataset.replyId;
    wx.navigateTo({
      url: "/packageA/pages/demand/demand-detail/demand-detail?listId="
        .concat(objectSpread2, "&&replyId=")
        .concat(a, "&&pageReply=1"),
    });
  },
  toPostDetail: function (e) {
    var objectSpread2 = e.currentTarget.dataset.itemId,
      a = e.currentTarget.dataset.type;
    wx.navigateTo({
      url: "/packageA/pages/demand/demand-detail/demand-detail?itemId="
        .concat(objectSpread2, "&&itemType=")
        .concat(a, "&&pageReply=0&&showBtn=true"),
    });
  },
  toSearch: function () {
    var toConsumableArray = this.data.tabSelect;
    wx.navigateTo({
      url: "/packageA/pages/demand/search-demand/search-demand?tabsIndex=".concat(
        toConsumableArray,
      ),
    });
  },
  toDemandSchedule: function (e) {
    var objectSpread2 = e.currentTarget.dataset.itemId;
    wx.navigateTo({
      url: "/packageA/pages/demand/my-demand/my-post-schedule/my-post-schedule?itemId=".concat(
        objectSpread2,
      ),
    });
  },
  getMyPostList: function () {
    var a = this,
      app = this.data,
      s = app.pageNum,
      i = app.pageSize,
      d = app.keyword,
      c = app.isAll,
      r = app.myPost;
    app.total;
    c ||
      (s++,
      services_demand.ServicesDemand.myPostList({
        keyword: d,
        pageNum: s,
        pageSize: i,
      }).then(function (o) {
        if (0 === o.code) {
          var app = o.data.list.map(function (e) {
            return objectSpread2(
              objectSpread2({}, e),
              {},
              {
                id: e.id,
                replyId: e.replyId,
                askNo: e.askNo,
                statusName: e.statusName.trim(),
                img: e.imgPath,
                detailText: e.remark,
                createTime: e.createTime,
                scheduleTime: e.auditTime,
                isMatch: e.isMatch,
                optTime: e.optTime,
              },
            );
          });
          a.setData({
            pageNum: s,
            myPost: [].concat(toConsumableArray(r), toConsumableArray(app)),
            isAll: o.data.isLastPage,
          });
        }
      }));
  },
  toCloseDemand: function (e) {
    var objectSpread2 = this,
      a = e.id,
      app = e.closeReason;
    services_demand.ServicesDemand.closeDemand({
      id: a,
      closeReason: app,
    }).then(function (e) {
      if (0 === e.code) {
        (wx.showToast({
          title: "关闭成功",
          icon: "none",
        }),
          objectSpread2.popupCancle());
        var services_demand = objectSpread2.data.myPost.filter(function (e) {
          return e.id !== a;
        });
        objectSpread2.setData({
          myPost: services_demand,
        });
      }
    });
  },
  onLoad: function (e) {
    console.log(e);
    var objectSpread2 = e.keyword;
    e.data;
    (this.setData({
      keyword: objectSpread2,
    }),
      this.getMyPostList());
  },
  onReady: function () {},
  onShow: function () {},
  onHide: function () {},
  onUnload: function () {},
  onPullDownRefresh: function () {},
  onReachBottom: function () {
    this.getMyPostList();
  },
  onShareAppMessage: function () {},
});
