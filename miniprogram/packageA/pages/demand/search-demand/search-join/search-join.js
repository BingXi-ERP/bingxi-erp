var toConsumableArray = require("../../../../../@babel/runtime/helpers/toConsumableArray"),
  objectSpread2 = require("../../../../../@babel/runtime/helpers/objectSpread2"),
  services_demand = require("../../../../services/services-demand"),
  app = getApp();
Page({
  data: {
    noResult: !1,
    keyword: "",
    more: !1,
    moreIcon: !0,
    shopId: null,
    statusText: "",
    pageNum: 0,
    pageSize: 10,
    total: 1.5,
    isAll: !1,
    icon: {
      avatar: "",
      rightArrow: "".concat(app.config.imgHost, "/img/customer/ic_jinru.png"),
    },
    myJoin: [],
  },
  toEdit: function (e) {
    console.log(e);
    var objectSpread2 = e.currentTarget.dataset.replyId,
      services_demand = e.currentTarget.dataset.listId,
      app = e.currentTarget.dataset.askNo;
    (console.log("listId====>" + services_demand),
      console.log("replyId====>" + objectSpread2),
      console.log("askNo====>" + app),
      wx.navigateTo({
        url: "/packageA/pages/demand/demand-detail/offer-info/offer-onfo?listId="
          .concat(services_demand, "&&askNo=")
          .concat(app, "&&replyId=")
          .concat(objectSpread2),
      }));
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
      services_demand = e.currentTarget.dataset.replyId;
    wx.navigateTo({
      url: "/packageA/pages/demand/demand-detail/demand-detail?listId="
        .concat(objectSpread2, "&&replyId=")
        .concat(services_demand, "&&pageReply=1"),
    });
  },
  toPostDetail: function (e) {
    var objectSpread2 = e.currentTarget.dataset.itemId,
      services_demand = e.currentTarget.dataset.type;
    wx.navigateTo({
      url: "/packageA/pages/demand/demand-detail/demand-detail?itemId="
        .concat(objectSpread2, "&&itemType=")
        .concat(services_demand, "&&pageReply=0&&showBtn=true"),
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
  getShopId: function () {
    var toConsumableArray = wx.getStorageSync("myShopId");
    this.setData({
      shopId: toConsumableArray,
    });
  },
  getMyJoinList: function () {
    var app = this,
      o = this.data,
      d = o.keyword,
      i = o.shopId,
      r = o.pageNum,
      s = o.pageSize,
      c = o.myJoin;
    o.isAll ||
      (i++,
      r++,
      services_demand.ServicesDemand.myJoinList({
        keyword: d,
        shopId: i,
        pageNum: r,
        pageSize: s,
      }).then(function (a) {
        if (0 === a.code) {
          var o = a.data.list.map(function (e) {
            return objectSpread2(
              objectSpread2({}, e),
              {},
              {
                replyId: e.replyId,
                id: e.id,
                askNo: e.askNo,
                statusName: e.matchStatusName,
                img: e.imgPath,
                titleName: e.remark,
                status: e.status,
                buyNum: e.quantity,
                unit: e.partPriceUnit,
                noMatchReason: e.noMatchReason,
              },
            );
          });
          app.setData({
            pageNum: r,
            myJoin: [].concat(toConsumableArray(c), toConsumableArray(o)),
            isAll: a.data.isLastPage,
          });
        }
      }));
  },
  onLoad: function (e) {
    var objectSpread2 = e.keyword;
    (console.log(e),
      this.setData({
        keyword: objectSpread2,
      }),
      this.getShopId(),
      this.getMyJoinList());
  },
  onReady: function () {},
  onShow: function () {},
  onHide: function () {},
  onUnload: function () {},
  onPullDownRefresh: function () {},
  onReachBottom: function () {
    this.getMyJoinList();
  },
  onShareAppMessage: function () {},
});
