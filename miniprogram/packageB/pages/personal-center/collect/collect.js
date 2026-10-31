var t = require("../../../../@babel/runtime/helpers/defineProperty"),
  app = getApp(),
  ServicesCenter = require("../../../libs/services/ServicesCenter.js").servicesCenter;
Page({
  data: {
    height: 600,
    tabArr: {
      curHdIndex: 0,
      curBdIndex: 0,
    },
    bgiconGray: "../../../../assets/images/icon2nd/icon-remark.png",
    cardList: [],
    shopList: [],
    pageNum: 1,
    page: 1,
    totalPage: 0,
    total: 0,
    favoriteId: "",
    remark: "",
    textContent: "",
    showModal: !1,
    userMobile: !0,
    scrollTop: 0,
  },
  changeActive: function (t) {
    var app = t.currentTarget.id,
      ServicesCenter = {};
    ((ServicesCenter.curHdIndex = app),
      (ServicesCenter.curBdIndex = app),
      this.setData({
        tabArr: ServicesCenter,
      }),
      0 == app
        ? (console.log(app),
          this.setData({
            pageNum: 1,
          }),
          this.getGoodsFavoriteList())
        : (console.log(app),
          this.setData({
            page: 1,
            scrollTop: 0,
          }),
          this.getShopList()));
  },
  toSearch: function (t) {
    wx.navigateTo({
      url: "/pages/personal-center/collect/search/search?pageType=" + t.target.id,
    });
  },
  toShop: function (t) {
    (wx.removeStorageSync("paramShopId"),
      wx.setStorageSync("paramShopId", t.currentTarget.id),
      wx.switchTab({
        url: "/pages/component/index",
        success: function (t) {},
      }));
  },
  onLoad: function (t) {
    wx.hideShareMenu();
  },
  onShow: function () {
    (this.setData({
      pageNum: 1,
    }),
      this.getGoodsFavoriteList(),
      ("" !== getApp().globalData.userInfo.mobile &&
        null !== getApp().globalData.userInfo.mobile) ||
        this.setData({
          userMobile: !1,
        }));
  },
  onPullDownRefresh: function () {
    0 == this.data.tabArr.curHdIndex
      ? (console.log("色卡刷新"),
        wx.stopPullDownRefresh(),
        this.setData({
          pageNum: 1,
        }),
        this.getGoodsFavoriteList())
      : (console.log("档口刷新"),
        wx.stopPullDownRefresh(),
        this.setData({
          page: 1,
        }),
        this.getShopList());
  },
  onReachBottom: function () {
    if (0 == this.data.tabArr.curHdIndex) {
      console.log("色卡加载更多");
      var t = this.data.pageNum + 1;
      (this.setData({
        pageNum: t,
      }),
        this.getGoodsFavoriteList("pagination"));
    } else {
      console.log("档口加载更多");
      var app = this.data.page + 1;
      (this.setData({
        page: app,
      }),
        this.getShopList("pagination"));
    }
  },
  getGoodsFavoriteList: function (t) {
    var o = this;
    wx.showLoading({
      title: "加载中",
    });
    var i = {
      userId: app.globalData.userInfo.id,
      pageNum: this.data.pageNum,
      pageSize: 10,
    };
    ServicesCenter.colorCardCollectList(i).then(function (e) {
      if ((wx.hideLoading(), 0 === e.code)) {
        if (null !== e.data) {
          var ServicesCenter = e.data.list;
          ("pagination" === t && (a = o.data.cardList.concat(ServicesCenter)),
            o.setData({
              cardList: ServicesCenter,
            }));
        }
      } else
        wx.showToast({
          title: e.msg.result,
          icon: "none",
        });
    });
  },
  getShopList: function (t) {
    var app = this;
    wx.showLoading({
      title: "加载中",
    });
    var o = {
      pageNum: this.data.page,
      pageSize: 25,
    };
    ServicesCenter.shopCollectList(o).then(function (a) {
      if (0 === a.code) {
        if (null !== a.data) {
          var o = a.data.list;
          ("pagination" === t && (o = app.data.shopList.concat(a.data.list)),
            app.setData({
              shopList: o,
              total: a.data.total,
            }));
        }
        wx.hideLoading();
      } else
        (wx.hideLoading(),
          wx.showToast({
            icon: "none",
            title: a.msg.result,
          }));
    });
  },
  addFavoriteRemark: function (t) {
    var app = this;
    wx.showLoading({
      title: "提交中",
    });
    var o = {
      remark: t,
      id: this.data.favoriteId,
    };
    ServicesCenter.addOrUpdateColorCard(o).then(function (t) {
      (wx.hideLoading(),
        0 === t.code
          ? (wx.showToast({
              title: "提交成功",
              icon: "success",
              duration: 2e3,
            }),
            app.hideModal(),
            app.setData({
              pageNum: 1,
            }),
            app.getGoodsFavoriteList())
          : wx.showToast({
              icon: "none",
              title: t.msg.result,
            }));
    });
  },
  onJump: function (t) {
    console.log(t);
    var app = t.currentTarget.id;
    wx.navigateTo({
      url: "../../../../../seller/colorcard/colorcard-detail?goodsId=" + app,
    });
  },
  showDialogBtn: function (t) {
    (console.log(t),
      this.setData({
        showModal: !0,
        favoriteId: t.currentTarget.id,
        textContent: t.currentTarget.dataset.value,
      }));
  },
  preventTouchMove: function () {},
  hideModal: function () {
    this.setData({
      showModal: !1,
    });
  },
  onCancel: function () {
    this.hideModal();
  },
  bindFormSubmit: function (t) {
    this.addFavoriteRemark(t.detail.value.textarea);
  },
  preventTouchMove: function (t) {},
});
