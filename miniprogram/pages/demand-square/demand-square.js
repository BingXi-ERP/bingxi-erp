var t = require("../../@babel/runtime/helpers/interopRequireDefault").default,
  e = require("../../@babel/runtime/helpers/defineProperty"),
  toConsumableArray = require("../../@babel/runtime/helpers/toConsumableArray"),
  objectSpread2 = require("../../@babel/runtime/helpers/objectSpread2"),
  ServicesUser = require("../../libs/services/ServicesUser"),
  ServicesIndex = require("../../libs/services/ServicesIndex"),
  isVisitor = t(require("../../libs/utils/isVisitor")),
  throttle = t(require("../../utils/throttle")),
  app = getApp(),
  servicesDemand = require("../../libs/services/servicesDemand.js").ServicesDemand,
  getFormId = require("../../libs/utils/getFormId").saveFormId,
  wxTimer = require("../../libs/utils/wxTimer.js");
Page({
  data: {
    showStopPop: !1,
    startTime: "",
    startTabTime: "",
    countTime: 500,
    intervalCount: 0,
    itemArr: [],
    pageHeight: "",
    newPropleAward: !1,
    readFlag: !1,
    scrollTop: 0,
    pageNum: 0,
    pageSize: 8,
    isAll: !1,
    category: "",
    chooseId: "",
    isMyAsk: null,
    timerId: "",
    tabItem: "0",
    tabIndex: 4,
    previewBtn: !1,
    showPop: !1,
    banner: {
      header: "".concat(app.config.imgHost, "/img/customer/banner.png?v=1"),
      newPropleAward: "".concat(app.config.imgHost, "/img/customer/newPeopleAward.png"),
      awardRule: "".concat(app.config.imgHost, "/img/customer/awardRuleIcon.gif"),
      demandPopup: "".concat(app.config.imgHost, "/img/shareFile/demand-popur.png"),
      closeIcon: "".concat(app.config.imgHost, "/img/shareFile/Icon_Nav_Close.png"),
      demandIcon: "".concat(app.config.imgHost, "/img/customer/Btn_zb.png"),
      newYear: "".concat(app.config.imgHost, "/img/v2.8.5/merchantNewYearPopup.png"),
    },
    userTab: [],
    tablist: [],
  },
  showService: function () {
    this.setData({
      showPop: !0,
    });
  },
  cancelService: function () {
    this.setData({
      showPop: !1,
    });
  },
  cancleStopPop: function () {
    (this.setData({
      showStopPop: !1,
    }),
      (app.showStopPop = !1));
  },
  closeAward: function () {
    this.setData({
      newPropleAward: !1,
    });
  },
  closeReadFlag: function () {
    this.setData({
      readFlag: !1,
    });
  },
  toItem: function (t) {
    var e = t.currentTarget.dataset.listId;
    wx.navigateTo({
      url: "../../packageA/pages/demand/demand-detail/demand-detail?listId=".concat(e),
    });
  },
  toBanner: function () {
    wx.navigateTo({
      url: "/packageA/pages/demand/demand-detail/demand-banner/demand-banner",
    });
  },
  formSubmit: function (t) {
    var e = this,
      toConsumableArray = t.currentTarget.dataset.itemType;
    (getFormId.getformId(t.detail.formId),
      "toPostDemand" === toConsumableArray &&
        isVisitor.default.isVisitor().then(function (t) {
          1 !== app.globalData.userInfo.freezedStatus ? e.toPostDemand() : e.showService();
        }));
  },
  previewImage: function (t) {
    var e = t.currentTarget.dataset,
      toConsumableArray = e.src,
      objectSpread2 = e.srcList;
    ((this.data.previewBtn = !0),
      wx.previewImage({
        current: toConsumableArray,
        urls: objectSpread2,
      }));
  },
  toPostDemand: throttle.default.throttle(function () {
    wx.navigateTo({
      url: "../../packageA/pages/demand/demand-detail/post-demand/post-demand",
    });
  }),
  toMyDemand: function () {
    wx.navigateTo({
      url: "../../packageA/pages/demand/my-demand/my-demand?prevPage=demandSquare",
    });
  },
  toInfo: function (t) {
    var e = t.currentTarget.dataset,
      toConsumableArray = e.listId,
      objectSpread2 = e.askNo;
    wx.navigateTo({
      url: "../../packageA/pages/demand/demand-detail/offer-info/offer-onfo?listId="
        .concat(toConsumableArray, "&&askNo=")
        .concat(objectSpread2),
    });
  },
  _reset: function () {
    this.setData({
      scrollTop: 0,
      pageNum: 0,
      tablist: [],
      isAll: !1,
    });
  },
  tabText: function (t) {
    var e = t.detail.title,
      toConsumableArray = t.detail.index + 4,
      objectSpread2 = this.data.userTab.filter(function (t) {
        return e === t.category;
      })[0];
    (this.demandTabCount(this.data.tabIndex),
      this.setData({
        category: "全部" === objectSpread2.category ? "" : objectSpread2.category,
        tabItem: objectSpread2,
        tabIndex: toConsumableArray,
        pageNum: 0,
        scrollTop: 0,
        tablist: [],
        isAll: !1,
      }),
      this.getDamendList());
  },
  category: function () {
    var t = this;
    servicesDemand.getCategory().then(function (e) {
      if (0 === e.code) {
        var toConsumableArray = [
          {
            category: "全部",
            categoryId: "",
          },
        ];
        (e.data.length &&
          e.data.forEach(function (t) {
            toConsumableArray.push(t);
          }),
          t.setData({
            userTab: toConsumableArray,
          }));
      } else
        wx.showToast({
          title: e.msg,
          icon: "none",
          duration: 1500,
        });
    });
  },
  getDamendList: function () {
    var t = this,
      ServicesUser = this.data,
      ServicesIndex = ServicesUser.category,
      isVisitor = ServicesUser.pageNum,
      throttle = ServicesUser.pageSize,
      app = ServicesUser.tablist;
    ServicesUser.isAll ||
      (isVisitor++,
      wx.showNavigationBarLoading(),
      servicesDemand
        .demandList({
          category: ServicesIndex,
          pageNum: isVisitor,
          pageSize: throttle,
        })
        .then(function (i) {
          if (0 === i.code) {
            var ServicesIndex = i.data.list;
            console.log(ServicesIndex);
            var throttle = ServicesIndex.map(function (t) {
              return objectSpread2(
                objectSpread2({}, t),
                {},
                {
                  id: t.id,
                  askNo: t.askNo,
                  isMyAsk: t.isMyAsk,
                  contentImg: t.imgArr,
                  rewardAmountNum: t.rewardAmount.toFixed(2).split(".")[0],
                  rewardAmountDecimals: t.rewardAmount.toFixed(2).split(".")[1],
                },
              );
            });
            1 === isVisitor &&
              t.setData({
                tablist: [],
              });
            [].concat(toConsumableArray(app), toConsumableArray(throttle));
            (t.setData({
              ["tablist[" + isVisitor + "]"]: throttle,
              pageNum: isVisitor,
              isAll: i.data.isLastPage,
            }),
              t._toCount());
          } else
            wx.showToast({
              title: i.msg,
              icon: "none",
              duration: 1500,
            });
          (wx.hideNavigationBarLoading(), wx.stopPullDownRefresh());
        }));
  },
  timeCount: function () {
    var t = this;
    (t.data.tablist.forEach(function (t, e) {
      t.lastTimeStr = new wxTimer().dateFormat(t.lastTime);
      var toConsumableArray = Date.now(),
        objectSpread2 = new Date(toConsumableArray + t.lastTime).getTime();
      ((t.countdownTime = toConsumableArray), (t.countdownEndTime = objectSpread2));
    }),
      t.setData({
        tablist: t.data.tablist,
      }),
      t.data.timerId && clearInterval(t.data.timerId));
    var e = setInterval(this.countdown, 350);
    t.setData({
      timerId: e,
    });
  },
  countdown: function () {
    var t = this;
    (t.data.tablist.forEach(function (t) {
      var e = t.countdownEndTime - Date.now();
      t.lastTimeStr = new wxTimer().dateFormat(e);
    }),
      t.setData({
        tablist: t.data.tablist,
      }));
  },
  tabBar: function () {
    var t = app.globalData.userInfo.type;
    (console.log("======>" + this.data.active),
      "type" == t
        ? this.setData({
            active: "0",
          })
        : this.setData({
            active: "1",
          }));
  },
  pullDownRefresh: function (t) {
    var e = this;
    if ("200rpx" === this.data.scrollTop)
      var toConsumableArray = setTimeout(function () {
        (clearTimeout(toConsumableArray), e._reset(), e.getDamendList());
      }, 500);
  },
  arrivedBottom: function (t) {
    this.getDamendList();
  },
  getNotice: function () {
    var t = this;
    servicesDemand.getNotice().then(function (e) {
      0 === e.code && 1 === e.data
        ? t.setData({
            newPropleAward: !0,
          })
        : t.getReadFlag();
    });
  },
  getReadFlag: function () {
    var t = this;
    ServicesIndex.ServicesIndex.readControl({
      noticeId: 5,
    }).then(function (e) {
      0 === e.code &&
        0 === e.data.readFlag &&
        t.setData({
          readFlag: !0,
        });
    });
  },
  onLoad: function (t) {
    (this.category(),
      this.setData({
        pageHeight: wx.getSystemInfoSync().windowHeight,
        userType: app.globalData.userInfo.type,
        userAuthList: app.userAuthList,
        showStopPop: app.showStopPop,
      }),
      this.getNotice(),
      this.getDamendList());
  },
  onReady: function () {},
  onShow: function () {
    (this.tabBar(),
      ServicesUser.servicesUser.countInvite({
        type: 117,
      }),
      (this.data.startTime = new Date()),
      this.startDemandTabCount());
  },
  onHide: function () {
    var t = this;
    (this._toCount(),
      this._getElHeight().then(function () {
        t._stopCount();
      }),
      this.demandInCount(),
      this.demandTabCount(this.data.tabIndex));
  },
  onUnload: function () {
    (this._consoleTheInfo(),
      this._stopCount(),
      this._reset(),
      this.demandInCount(),
      this.demandTabCount(this.data.tabIndex));
  },
  onPullDownRefresh: function () {
    (this._reset(), this.getDamendList(), wx.stopPullDownRefresh());
  },
  onReachBottom: function () {
    this.arrivedBottom();
  },
  onShareAppMessage: function () {},
  demandInCount: function () {
    var t = new Date().getTime() - this.data.startTime;
    servicesDemand.addSquareTabLog({
      stayTime: t,
    });
  },
  startDemandTabCount: function () {
    var t = new Date().getTime();
    this.data.startTabTime = t - 0;
  },
  demandTabCount: function (t) {
    var e = new Date().getTime() - this.data.startTabTime;
    (servicesDemand.addSquareSubTabLog({
      stayTime: e,
      accessType: t,
    }),
      this.startDemandTabCount());
  },
  _getElHeight: function () {
    var t = wx.createSelectorQuery(),
      e = this;
    return (
      t.selectAll(".demandItem").boundingClientRect(),
      t.selectViewport().scrollOffset(),
      new Promise(function (a, n) {
        t.exec(function (t) {
          ((e.data.elHeight = t[0].length ? t[0][0].height : ""), (e.data.itemArr = t[0]), a());
        });
      })
    );
  },
  _stopCount: function () {
    (clearTimeout(this.data.handlePage),
      clearTimeout(this.data.getInterval),
      (this.data.intervalCount = 0));
  },
  _consoleTheInfo: function () {
    var t = this.data,
      e = t.intervalCount,
      toConsumableArray = t.seeingArr,
      objectSpread2 = t.countTime;
    if (e > 50) {
      var ServicesUser = toConsumableArray,
        ServicesIndex = e + objectSpread2;
      servicesDemand.addAskListLog({
        askIds: ServicesUser,
        stayTime: ServicesIndex,
      });
    }
  },
  _countUser: function () {
    var t = this,
      e = [],
      toConsumableArray = this.data,
      objectSpread2 = toConsumableArray.elHeight,
      ServicesUser = toConsumableArray.itemArr,
      ServicesIndex = toConsumableArray.pageHeight,
      isVisitor = toConsumableArray.countTime;
    (ServicesUser.forEach(function (t) {
      t.top >= 45 - objectSpread2 / 2 &&
        t.top <= ServicesIndex - objectSpread2 / 2 - 50 &&
        e.push(t.dataset.listId);
    }),
      (this.data.handlePage = setTimeout(function () {
        ((t.data.seeingArr = e),
          clearTimeout(t.data.getInterval),
          (t.data.getInterval = setInterval(function () {
            t.data.intervalCount += 10;
          }, 10)));
      }, isVisitor)));
  },
  _toCount: function () {
    var t = this;
    this._getElHeight().then(function () {
      (t._consoleTheInfo(),
        t._stopCount(),
        (t.data.tablist[1] && !t.data.tablist[1].length) || t._countUser());
    });
  },
  onPageScroll: function (t) {
    this._toCount();
  },
});
