require("../../../../@babel/runtime/helpers/Arrayincludes");
var t = require("../../../../@babel/runtime/helpers/defineProperty"),
  services_demand = require("../../../services/services-demand"),
  app = getApp();
Page({
  data: {
    showNoData: !1,
    searchType: "join",
    shopId: null,
    inputValue: "",
    icon: {
      noData: "".concat(app.config.imgHost, "/img/customer/img_wuxinx@3x.png"),
      del: "".concat(app.config.imgHost, "/img/customer/icon_trash.png"),
      delete: "".concat(app.config.imgHost, "/img/customer/duibuIcon/icon/del@2x.png"),
    },
    noData: !1,
    searchType: "",
    joinHistoryList: [],
    postHistoryList: [],
  },
  getValue: function (t) {
    var services_demand = t.detail.value;
    this.setData({
      inputValue: services_demand,
    });
  },
  getSearchType: function (t) {
    var services_demand = t.tabsIndex;
    "0" === services_demand
      ? this.setData({
          searchType: "join",
        })
      : "1" === services_demand &&
        this.setData({
          searchType: "post",
        });
  },
  getShopId: function () {
    var t = wx.getStorageSync("myShopId");
    this.setData({
      shopId: t,
    });
  },
  toItemData: function (t) {
    var services_demand = t.currentTarget.dataset.keyword;
    (this.setData({
      inputValue: services_demand,
    }),
      this.getList());
  },
  historyClear: function () {
    var t = this.data.searchType;
    ("join" === t &&
      (wx.removeStorageSync("joinHistoryList"),
      this.setData({
        joinHistoryList: [],
      })),
      "post" === t &&
        (wx.removeStorageSync("postHistoryList"),
        this.setData({
          postHistoryList: [],
        })));
  },
  confirm: function () {
    this.getList();
  },
  searchCancel: function () {
    this.setData({
      inputValue: "",
    });
  },
  backPage: function () {
    wx.navigateBack();
  },
  getList: function () {
    this.data.inputValue;
    this.toSearchResult();
  },
  toSearchResult: function () {
    var t = this,
      app = this.data.inputValue;
    console.log(app);
    var o = this.data.searchType,
      i = this.data.shopId + 1;
    ("join" === o &&
      services_demand.ServicesDemand.myJoinList({
        keyword: app,
        shopId: i,
      }).then(function (e) {
        if (0 !== e.code)
          return (
            wx.showToast({
              title: "暂无数据",
              icon: "none",
            }),
            void t.setData({
              showNoData: !0,
            })
          );
        (t.setData({
          showNoData: !1,
        }),
          e.data.list.length > 0 && t.setStorage(app));
        var o = e.data.list.map(function (t) {
          return {
            replyId: t.replyId,
            id: t.id,
            askNo: t.askNo,
            statusName: t.matchStatusName,
            img: t.imgPath,
            titleName: t.remark,
            status: t.status,
            buyNum: t.quantity,
            unit: t.partPriceUnit,
            noMatchReason: t.noMatchReason,
          };
        });
        o &&
          wx.navigateTo({
            url: "./search-join/search-join?keyword=".concat(app, "&&data=").concat(o),
          });
      }),
      "post" === o &&
        services_demand.ServicesDemand.myPostList({
          keyword: app,
        }).then(function (e) {
          if ((e.data.list.length > 0 && t.setStorage(app), 0 !== e.code))
            return (
              wx.showToast({
                title: "暂无数据",
                icon: "none",
              }),
              void t.setData({
                showNoData: !0,
              })
            );
          t.setData({
            showNoData: !1,
          });
          var o = e.data.list.map(function (t) {
            return {
              id: t.id,
              replyId: t.replyId,
              askNo: t.askNo,
              statusName: t.statusName.trim(),
              img: t.imgPath,
              detailText: t.remark,
              createTime: t.createTime,
              scheduleTime: t.auditTime,
              isMatch: t.isMatch,
              optTime: t.optTime,
            };
          });
          o &&
            wx.navigateTo({
              url: "./search-post/search-post?keyword=".concat(app, "&&data=").concat(o),
            });
        }));
  },
  setStorage: function (t) {
    var app = this.data.searchType;
    if ((console.log("type====>"), console.log(app), "join" === app)) {
      var o = this.data.joinHistoryList;
      (o.includes(t) || o.unshift(t),
        o.length > 30 && o.pop(),
        wx.setStorageSync("joinHistoryList", o),
        this.setData({
          joinHistoryList: o,
        }));
      String(o);
      services_demand.ServicesDemand.addSearchHistory({
        keyword: t,
        sourceType: 3,
        searchType: 140,
      }).then(function (t) {
        return console.log(t);
      });
    }
    if ("post" === app) {
      var i = this.data.postHistoryList;
      (i.includes(t) || i.unshift(t),
        i.length > 30 && i.pop(),
        wx.setStorageSync("postHistoryList", i),
        this.setData({
          postHistoryList: i,
        }));
      String(i);
      services_demand.ServicesDemand.addSearchHistory({
        keyword: t,
        sourceType: 3,
        searchType: 142,
      }).then(function (t) {
        return console.log(t);
      });
    }
  },
  getStorageList: function () {
    var t = this.data.searchType;
    if ("join" === t) {
      var services_demand = wx.getStorageSync("joinHistoryList");
      services_demand &&
        this.setData({
          joinHistoryList: services_demand,
        });
    }
    if ("post" === t) {
      var app = wx.getStorageSync("postHistoryList");
      app &&
        this.setData({
          postHistoryList: app,
        });
    }
  },
  onLoad: function (t) {
    (this.getSearchType(t), this.getShopId());
  },
  onReady: function () {
    (this.getStorageList(), console.log(this.data.postHistoryList));
  },
  onShow: function () {},
  onHide: function () {},
  onUnload: function () {},
  onPullDownRefresh: function () {},
  onReachBottom: function () {},
  onShareAppMessage: function () {},
});
