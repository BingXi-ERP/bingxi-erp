var toConsumableArray = require("../../../../@babel/runtime/helpers/toConsumableArray"),
  objectSpread2 = require("../../../../@babel/runtime/helpers/objectSpread2"),
  e = require("../../../../@babel/runtime/helpers/defineProperty"),
  services_demand = require("../../../services/services-demand"),
  util = require("../../../utils/util"),
  getFormId = require("../../../utils/getFormId").saveFormId,
  app = getApp();
Page({
  data: {
    moreIcon: !0,
    shopId: null,
    userType: "",
    tabSelect: "0",
    statusText: "",
    pageNum: 0,
    pageSize: 10,
    isAll: !1,
    myJoinTabIndex: 0,
    myPostTabIndex: 0,
    popup: {
      showPopup: !1,
      popupRadio: "",
    },
    icon: {
      avatar: "",
      rightArrow: "".concat(app.config.imgHost, "/img/customer/ic_jinru.png"),
      search: "".concat(
        app.config.imgHost,
        "/img/customer/duibuIcon/icon/Icon_Nav_Search_White@2x.png",
      ),
    },
    myJionTab: ["全部", "待审核", "审核通过", "审核失败"],
    myJoin: [],
    myPostTab: ["全部", "审核中", "找版中", "找版成功", "找版失败", "审核失败"],
    myPost: [],
    closeForm: {
      id: "",
      closeReason: "",
    },
  },
  changeTab: function (t) {
    var objectSpread2 = t.target.id;
    this.data.tabSelect !== objectSpread2 &&
      (objectSpread2 &&
        this.setData({
          tabSelect: objectSpread2,
          pageNum: 0,
          pageSize: 10,
          myJoinTabIndex: 0,
          myPostTabIndex: 0,
          myPost: [],
          myJoin: [],
          isAll: !1,
        }),
      this.toGetWhatList());
  },
  toGetWhatList: function () {
    "0" === this.data.tabSelect ? this.getMyJoinList() : this.getMyPostList();
  },
  changeVanTab: function (t) {
    "0" === this.data.tabSelect
      ? (this.setData({
          myJoinTabIndex: t.detail.index,
          pageNum: 0,
          pageSize: 10,
          myPost: [],
          myJoin: [],
          isAll: !1,
        }),
        this.getMyJoinList())
      : (this.setData({
          myPostTabIndex: t.detail.index,
          pageNum: 0,
          pageSize: 10,
          myPost: [],
          myJoin: [],
          isAll: !1,
        }),
        this.getMyPostList());
  },
  formSubmit: function (t) {
    getFormId.getformId(t.detail.formId);
  },
  closeDemand: function (t) {
    var objectSpread2 = t.currentTarget.dataset.itemId;
    this.setData({
      "popup.showPopup": !0,
      "closeForm.id": objectSpread2,
    });
  },
  popupClose: function () {
    this.setData({
      "popup.showPopup": !1,
    });
  },
  popupClick: function (t) {
    var objectSpread2 = t.currentTarget.dataset.name,
      e = "";
    (this.setData({
      "popup.popupRadio": objectSpread2,
    }),
      "1" === objectSpread2 && (e = "已找到，无需匹配"),
      "2" === objectSpread2 && (e = "填写错误，需重新发起需求"),
      this.setData({
        "closeForm.closeReason": e,
      }));
  },
  popupChange: function (t) {
    var objectSpread2 = t.detail,
      e = "";
    (this.setData({
      "popup.popupRadio": objectSpread2,
    }),
      "1" === objectSpread2 && (e = "已找到，无需匹配"),
      "2" === objectSpread2 && (e = "填写错误，需重新发起需求"),
      this.setData({
        "closeForm.closeReason": e,
      }));
  },
  inputgetName: function (t) {
    this.setData({
      [t.currentTarget.dataset.name]: t.detail.value,
    });
  },
  popupComfirm: function (t) {
    var objectSpread2 = this.data.closeForm.id,
      e = this.data.closeForm.closeReason;
    this.toCloseDemand({
      id: objectSpread2,
      closeReason: e,
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
  getShopId: function () {
    var toConsumableArray = wx.getStorageSync("myShopId");
    this.setData({
      shopId: toConsumableArray,
    });
  },
  toEdit: function (t) {
    var objectSpread2 = t.currentTarget.dataset.replyId,
      e = t.currentTarget.dataset.listId,
      services_demand = t.currentTarget.dataset.askNo;
    wx.navigateTo({
      url: "/packageA/pages/demand/demand-detail/offer-info/offer-onfo?listId="
        .concat(e, "&&askNo=")
        .concat(services_demand, "&&replyId=")
        .concat(objectSpread2),
    });
  },
  toPost: function (t) {
    var objectSpread2 = t.currentTarget.dataset.itemId;
    wx.navigateTo({
      url: "/packageA/pages/demand/demand-detail/post-demand/post-demand?itemId=".concat(
        objectSpread2,
      ),
    });
  },
  toPostResult: function (t) {
    var objectSpread2 = t.currentTarget.dataset.itemId;
    wx.navigateTo({
      url: "/packageA/pages/demand/my-demand/my-post-result/my-post-result?itemId=".concat(
        objectSpread2,
      ),
    });
  },
  toJoinDetail: function (t) {
    var objectSpread2 = t.currentTarget.dataset.itemId,
      e = t.currentTarget.dataset.replyId;
    wx.navigateTo({
      url: "/packageA/pages/demand/demand-detail/demand-detail?listId="
        .concat(objectSpread2, "&&replyId=")
        .concat(e, "&&pageReply=1"),
    });
  },
  toPostDetail: function (t) {
    var objectSpread2 = t.currentTarget.dataset.itemId,
      e = t.currentTarget.dataset.type;
    wx.navigateTo({
      url: "/packageA/pages/demand/demand-detail/demand-detail?itemId="
        .concat(objectSpread2, "&&itemType=")
        .concat(e, "&&pageReply=0&&showBtn=true"),
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
  toDemandSchedule: function (t) {
    var objectSpread2 = t.currentTarget.dataset.itemId;
    wx.navigateTo({
      url: "/packageA/pages/demand/my-demand/my-post-schedule/my-post-schedule?itemId=".concat(
        objectSpread2,
      ),
    });
  },
  getMyJoinList: function () {
    var e = this,
      getFormId = this.data,
      app = getFormId.shopId,
      d = getFormId.myJoinTabIndex,
      r = getFormId.pageNum,
      c = getFormId.pageSize,
      m = getFormId.isAll,
      u = getFormId.myJoin;
    if (!m) {
      var p = d - 1;
      (r++,
        wx.showNavigationBarLoading(),
        services_demand.ServicesDemand.myJoinList({
          shopId: app,
          matchStatus: p,
          pageNum: r,
          pageSize: c,
        }).then(function (i) {
          if (0 === i.code) {
            var getFormId = i.data.list.map(function (t) {
              return objectSpread2(
                objectSpread2({}, t),
                {},
                {
                  createTime: util.utils.formatDateTime(t.createTime),
                  statusName: t.matchStatusName,
                  img: t.imgPath,
                  titleName: t.remark,
                  buyNum: t.quantity,
                  unit: t.partPriceUnit,
                },
              );
            });
            (1 === r &&
              e.setData({
                pageNum: r,
                myJoin: getFormId,
                isAll: i.data.isLastPage,
              }),
              r > 1 &&
                e.setData({
                  pageNum: r,
                  myJoin: [].concat(toConsumableArray(u), toConsumableArray(getFormId)),
                  isAll: i.data.isLastPage,
                }),
              wx.hideNavigationBarLoading());
          }
        }));
    }
  },
  getMyPostList: function () {
    var e = this,
      util = this.data,
      getFormId = util.pageNum,
      app = util.myPostTabIndex,
      d = util.pageSize,
      r = util.isAll,
      c = util.myPost;
    if (!r) {
      getFormId++;
      var m = app;
      (wx.showNavigationBarLoading(),
        services_demand.ServicesDemand.myPostList({
          status: m,
          pageNum: getFormId,
          pageSize: d,
        }).then(function (i) {
          if (0 === i.code) {
            var util = i.data.list.map(function (t) {
              return objectSpread2(
                objectSpread2({}, t),
                {},
                {
                  statusName: t.statusName.trim(),
                  img: t.imgPath,
                  detailText: t.remark,
                  createTime: t.createTime,
                  scheduleTime: t.auditTime,
                },
              );
            });
            (1 === getFormId &&
              e.setData({
                pageNum: getFormId,
                myPost: util,
                isAll: i.data.isLastPage,
              }),
              getFormId > 1 &&
                e.setData({
                  pageNum: getFormId,
                  myPost: [].concat(toConsumableArray(c), toConsumableArray(util)),
                  isAll: i.data.isLastPage,
                }),
              wx.hideNavigationBarLoading());
          }
        }));
    }
  },
  toCloseDemand: function (t) {
    var objectSpread2 = this,
      e = t.id,
      util = t.closeReason;
    services_demand.ServicesDemand.closeDemand({
      id: e,
      closeReason: util,
    }).then(function (t) {
      if (0 === t.code) {
        (wx.showToast({
          title: "关闭成功",
          icon: "none",
        }),
          objectSpread2.popupCancle());
        var services_demand = objectSpread2.data.myPost.filter(function (t) {
          return t.id !== e;
        });
        objectSpread2.setData({
          myPost: services_demand,
        });
      }
    });
  },
  onLoad: function (t) {
    t.prevPage;
    var objectSpread2 = t.myJoinTabIndex,
      e = t.toDemandSquare,
      services_demand = void 0 !== e && e;
    (objectSpread2 &&
      this.setData({
        myJoinTabIndex: objectSpread2,
      }),
      this.setData({
        toDemandSquare: services_demand,
        userType: app.globalData.userInfo.type,
      }),
      this.getShopId());
  },
  onReady: function () {
    this.toGetWhatList();
  },
  onUnload: function () {
    this.data.toDemandSquare &&
      wx.reLaunch({
        url: "/pages/demand-square/demand-square",
      });
  },
  onReachBottom: function () {
    this.toGetWhatList();
  },
});
