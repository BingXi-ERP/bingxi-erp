var t = require("../../../@babel/runtime/helpers/interopRequireDefault").default,
  slicedToArray = require("../../../@babel/runtime/helpers/slicedToArray"),
  mta_analysis = t(require("../../../utils/mta_analysis.js")),
  toast = t(require("../../../miniprogram_npm/@vant/weapp/toast/toast")),
  s =
    (t(require("../../../miniprogram_npm/@vant/weapp/dialog/dialog")),
    require("../../../libs/services/orderCreate")),
  ServicesUserLog = require("../../../libs/services/ServicesUserLog.js"),
  app = getApp(),
  d = {
    0: "undeal|待开单",
    1: "unpay|未结算",
    2: "payed|已结算",
    3: "closed|已关闭",
  },
  h =
    (require("../../../libs/utils/time").parseTime,
    require("../../../libs/services/ServicesOrder").ServicesOrder);
Page({
  data: {
    activedIndex: 0,
    tab: {
      lineWidth: 20,
      color: "#2f7bfd",
      border: !1,
    },
    pinCount: 29,
    list: [[], [], [], []],
    orderConditon: {
      10: "待处理 ",
      30: "挂单中",
      40: "未结算",
      45: "未结算",
      50: "已结算",
      "-10": "已关闭",
      "-20": "已作废",
    },
    show: !1,
    closeId: null,
    closeReason: "",
    searchCondition: "",
    nowPageNum: 1,
    currentPageNum: 1,
    ishasNextPage: !0,
    autoFocus: !0,
    globalApp: {},
    historyList: {},
    icon: {
      noData: "".concat(app.config.imgHost, "/img/customer/img_wuxinx@3x.png"),
      del: "".concat(app.config.imgHost, "/img/customer/icon_trash.png"),
    },
  },
  onLoad: function (t) {
    (mta_analysis.default.Page.init(),
      this.setData({
        globalApp: app,
        userAuthList: app.userAuthList,
      }),
      this.getHistoryList());
  },
  onReady: function () {},
  onShow: function () {
    this.data.activedIndex;
    this.setData({
      nowPageNum: 1,
    });
  },
  onHide: function () {},
  onUnload: function () {},
  onPullDownRefresh: function () {},
  onReachBottom: function () {},
  onShareAppMessage: function () {},
  getHistoryList: function () {
    var t = this;
    h.searchHistoryList({
      page: 1,
      size: 10,
    }).then(function (e) {
      t.setData({
        historyList: e.data.content,
      });
    });
  },
  delHistory: function () {
    var t = this;
    (wx.showLoading(),
      h
        .delHistoryList({
          ids: [],
        })
        .then(function (e) {
          (wx.hideLoading(),
            t.setData({
              historyList: [],
            }));
        }));
  },
  historyTap: function (t) {
    var e = t.currentTarget.dataset.keyword;
    (this.setData({
      "input.value": e.keyword,
    }),
      this.getShopOrderList(e.keyword));
  },
  hanleOrderCreate: function (t) {
    var e = t.currentTarget.dataset,
      slicedToArray = e.id,
      mta_analysis = e.orderNo,
      toast = "/pages/order-create/offline/create?id=&orderNo="
        .concat(mta_analysis, "&orderId=")
        .concat(slicedToArray);
    wx.navigateTo({
      url: toast,
    });
  },
  toDetail: function (t) {
    var e = t.currentTarget.dataset.orderid;
    if (30 === t.currentTarget.dataset.orderstatus) {
      var slicedToArray = t.currentTarget.dataset.orderno,
        mta_analysis = "/pages/order-create/offline/create?id="
          .concat(e, "&orderNo=")
          .concat(slicedToArray, "&orderId=&isFromPin=1");
      wx.navigateTo({
        url: mta_analysis,
      });
    } else
      wx.navigateTo({
        url: "/pages/order/detail/index?orderId=".concat(e),
      });
  },
  getShopOrderList: function () {
    var t = this,
      e = arguments.length > 1 && void 0 !== arguments[1] ? arguments[1] : 10,
      slicedToArray = arguments.length > 3 && void 0 !== arguments[3] && arguments[3],
      mta_analysis = this,
      toast = {
        status: 0,
        saleType: 0,
        keyword: arguments.length > 0 && void 0 !== arguments[0] ? arguments[0] : "",
        page: arguments.length > 2 && void 0 !== arguments[2] ? arguments[2] : 1,
        size: 10,
      };
    (wx.showLoading(),
      h.shopOrderList(toast).then(function (o) {
        if ((wx.hideLoading(), 0 === o.code)) {
          ServicesUserLog.servicesUserLog.setUserHandleLog(213);
          var s = o.data.content || [];
          (s.forEach(function (t, e) {
            "" == s[e].buyerHeadImg &&
              (s[e].buyerHeadImg = "".concat(
                app.config.imgHost,
                "/Face_User_Face_Man_Default@3x.png",
              ));
          }),
            10 == e
              ? slicedToArray
                ? s &&
                  s.length > 0 &&
                  s.forEach(function (t) {
                    mta_analysis.data.list[0].push(t);
                  })
                : (mta_analysis.data.list[0] = s)
              : 40 == e
                ? slicedToArray
                  ? s &&
                    s.length > 0 &&
                    s.forEach(function (t) {
                      mta_analysis.data.list[1].push(t);
                    })
                  : (mta_analysis.data.list[1] = s)
                : 50 == e
                  ? slicedToArray
                    ? s &&
                      s.length > 0 &&
                      s.forEach(function (t) {
                        mta_analysis.data.list[2].push(t);
                      })
                    : (mta_analysis.data.list[2] = s)
                  : -10 == e &&
                    (slicedToArray
                      ? s &&
                        s.length > 0 &&
                        s.forEach(function (t) {
                          mta_analysis.data.list[3].push(t);
                        })
                      : (mta_analysis.data.list[3] = s)),
            (t.data.currentPageNum = o.data.pageNo));
          var d = o.data.totalPage > o.data.pageNo;
          ((t.data.nowPageNum = d ? o.data.pageNo + 1 : o.data.pageNo),
            (t.data.ishasNextPage = d),
            mta_analysis.setData({
              list: mta_analysis.data.list,
              nowPageNum: t.data.nowPageNum,
              ishasNextPage: t.data.ishasNextPage,
            }));
        } else
          wx.showToast({
            title: o.msg,
            icon: "none",
          });
      }));
  },
  handleConfirm: function (t) {
    var e = t.detail;
    this.setData({
      searchCondition: e,
    });
    var slicedToArray = this.data.activedIndex;
    (0 == slicedToArray
      ? this.getShopOrderList(e, 10, 1)
      : 1 == slicedToArray
        ? this.getShopOrderList(e, 40, 1)
        : 2 == slicedToArray
          ? this.getShopOrderList(e, 50, 1)
          : 3 == slicedToArray && this.getShopOrderList(e, -10, 1),
      this.getHistoryList());
  },
  handleInput: function (t) {
    var e = t.detail;
    this.setData({
      searchCondition: e,
    });
  },
  arrivedBottom: function () {
    if (this.data.ishasNextPage && this.data.currentPageNum != this.data.nowPageNum) {
      var t = this.data.activedIndex,
        e = this.data.nowPageNum,
        slicedToArray = this.data.searchCondition;
      0 == t
        ? this.getShopOrderList(slicedToArray, 10, e, !0)
        : 1 == t
          ? this.getShopOrderList(slicedToArray, 40, e, !0)
          : 2 == t
            ? this.getShopOrderList(slicedToArray, 50, e, !0)
            : 3 == t && this.getShopOrderList(slicedToArray, -10, e, !0);
    }
  },
  closeOrder: function (t, e) {
    var slicedToArray = this,
      mta_analysis = {
        billingId: t,
        closeReason: e,
      };
    h.closeOrder(mta_analysis).then(function (t) {
      0 === t.code
        ? slicedToArray.getShopOrderList()
        : wx.showToast({
            title: t.msg,
            icon: "none",
          });
    });
  },
  hanleCloseOrder: function (t) {
    var e = t.currentTarget.dataset.id;
    this.setData({
      show: !0,
      className: "text-gray",
      closeId: e,
    });
  },
  closeDialog: function () {
    this.data.closing ||
      this.setData({
        show: !1,
      });
  },
  handleCloseOrder: function (t) {
    if (this.data.closing) t.detail.dialog.stopLoading();
    else {
      if ("" === this.data.closeReason)
        return (
          (0, toast.default)({
            message: "关闭订单理由不能为空",
            duration: 1e3,
          }),
          void t.detail.dialog.stopLoading()
        );
      var e = this.data.closeId,
        slicedToArray = this.data.closeReason;
      (this.closeOrder(e, slicedToArray),
        this.setData({
          show: !1,
        }));
    }
  },
  handleCloseOrderNoreason: function () {
    var t = this.data.closeId;
    (this.closeOrder(t, ""),
      this.data.closing
        ? e.detail.dialog.stopLoading()
        : this.setData({
            show: !1,
          }));
  },
  hanleConcatCustom: function (t) {
    var e = t.currentTarget.dataset.mobild;
    e
      ? wx.makePhoneCall({
          phoneNumber: e,
        })
      : wx.showToast({
          title: "电话号码为空",
          icon: "none",
        });
  },
  handleOrderPrint: function (t) {
    var e = t.currentTarget.dataset.orderid;
    wx.navigateTo({
      url: "/pages/printing/order/index?orderId=".concat(e, "&printType=order"),
    });
  },
  hanlePay: function (t) {
    var e = t.currentTarget.dataset.item;
    wx.navigateTo({
      url: "/pages/order/receipt/index?id=".concat(e.id),
    });
  },
  getOrders: function () {
    wx.showLoading({
      title: "加载中",
    });
    var t = this.data.activedIndex,
      e = d[t].split("|"),
      mta_analysis = slicedToArray(e, 2);
    (mta_analysis[0], mta_analysis[1]);
  },
  handleTabChange: function (t) {
    var e = t.detail.index;
    this.setData({
      activedIndex: e,
    });
    var slicedToArray = this.data.searchCondition;
    0 == e
      ? this.getShopOrderList(slicedToArray, 10)
      : 1 == e
        ? this.getShopOrderList(slicedToArray, 40)
        : 2 == e
          ? this.getShopOrderList(slicedToArray, 50)
          : 3 == e && this.getShopOrderList(slicedToArray, -10);
  },
  handleInputReason: function (t) {
    var e = t.detail.value;
    this.setData({
      closeReason: e,
    });
  },
  handleShowShareOrder: function (t) {
    var e = this,
      slicedToArray = t.currentTarget.dataset.id;
    (wx.showLoading({
      title: "正在生成图片",
    }),
      (0, s.getQRCode)(slicedToArray, app.envVersion)
        .then(function (t) {
          (wx.hideLoading(),
            0 === t.code
              ? e.setData({
                  QRCode: t.data,
                  showShareImage: !0,
                })
              : (0, toast.default)({
                  message: t.msg || "生成失败, 请重试",
                }));
        })
        .catch(function (t) {
          (console.log(t), wx.hideLoading());
        }));
  },
  handleCloseShareOrder: function () {
    this.setData({
      showShareImage: !1,
    });
  },
  handleDownload: function () {
    var t = this;
    this.handleCloseShareOrder();
    var e = this.data.QRCode;
    wx.downloadFile({
      url: e,
      success: function (e) {
        wx.saveImageToPhotosAlbum({
          filePath: e.tempFilePath,
          success: function () {
            wx.showToast({
              title: "保存成功",
              icon: "success",
              duration: 2e3,
            });
          },
          fail: function (e) {
            "saveImageToPhotosAlbum:fail auth deny" === e.errMsg &&
              wx.showModal({
                title: "提示",
                content: "您拒绝了保存权限，请打开保存权限",
                success: function (e) {
                  e.confirm &&
                    wx.openSetting({
                      success: function (t) {
                        t.authSetting = {
                          "scope.writePhotosAlbum": !0,
                        };
                      },
                      fail: function (e) {
                        t.setData({
                          showAuth: !0,
                        });
                      },
                    });
                },
              });
          },
        });
      },
    });
  },
  handleCloseAuthDialog: function () {
    this.setData({
      showAuth: !1,
    });
  },
});
