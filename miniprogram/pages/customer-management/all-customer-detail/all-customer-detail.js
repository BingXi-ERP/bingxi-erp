var t = require("../../../@babel/runtime/helpers/interopRequireDefault").default,
  ServicesUserLog = require("../../../libs/services/ServicesUserLog.js"),
  mta_analysis = t(require("../../../utils/mta_analysis.js")),
  app = getApp(),
  util = require("../../../libs/utils/util.js").utils,
  ServicesCustomer = require("../../../libs/services/ServicesCustomer.js").servicesCustomer;
require("../../../libs/utils/time").parseTime;
Page({
  data: {
    userAuthList: {},
    displayContent: 2,
    chooseItemActive: 0,
    noworderRecordSearchState: 0,
    chooseModalDisplay: !1,
    customerDealState: {},
    customerOrderRecordNum: {},
    orderRecordList: [],
    refundList: [],
    orderRecordPageNum: 1,
    totalPage: 1,
    trackRecordPageNum: 1,
    refundRecordPageNum: 1,
    refundRecordTotalPage: 1,
    customerId: "",
    active: 1,
    tabList: [
      {
        name: "客户跟踪",
      },
    ],
    customerRecordList: [],
    customerInfo: {},
    icon: {
      activeIcon: "".concat(app.config.imgHost, "/img/customer/ic_xzsx@3x.png"),
      customerBg: "".concat(app.config.imgHost, "/img/customer/img_kehuxiangq@3x.png"),
      mobile: "".concat(app.config.imgHost, "/img/customer/ic_dianhua.svg"),
      edit: "".concat(app.config.imgHost, "/img/v2.7.8/Icon_KH_Edit@2x.png"),
      contact: "".concat(app.config.imgHost, "/img/v2.7.8/lxkh@2x.png"),
      saixuan01: "".concat(app.config.imgHost, "/img/customer/duibuIcon/icon/ic_saixuan01@2x.png"),
      saixuan: "".concat(app.config.imgHost, "/img/customer/duibuIcon/icon/saixuan.png"),
    },
    fixedTab: !1,
    orderChoosedCondition: "筛选",
    isIp6: !1,
    pageHeight: null,
  },
  chooseModalDisplayCon: function () {
    (this.setData({
      chooseItemActive: this.data.noworderRecordSearchState,
    }),
      this.setData({
        chooseModalDisplay: !this.data.chooseModalDisplay,
      }));
  },
  changechooseItem: function (t) {
    var mta_analysis = t.currentTarget.dataset.index;
    (this.setData({
      chooseItemActive: mta_analysis,
    }),
      0 == t.currentTarget.dataset.index
        ? this.setData({
            orderChoosedCondition: "全部",
          })
        : 10 == t.currentTarget.dataset.index
          ? this.setData({
              orderChoosedCondition: "待处理",
            })
          : 20 == t.currentTarget.dataset.index
            ? this.setData({
                orderChoosedCondition: "交易完成",
              })
            : 30 == t.currentTarget.dataset.index
              ? this.setData({
                  orderChoosedCondition: "未结算",
                })
              : -10 == t.currentTarget.dataset.index &&
                this.setData({
                  orderChoosedCondition: "已关闭",
                }),
      ServicesUserLog.servicesUserLog.setUserHandleLog(313),
      this.chooseModalConfirm());
  },
  chooseModalConfirm: function () {
    (this.setData({
      chooseModalDisplay: !1,
    }),
      (this.data.noworderRecordSearchState = this.data.chooseItemActive),
      this.setData({
        orderRecordPageNum: 1,
      }),
      this.customerOrderList(this.data.customerId, 1, !1, this.data.noworderRecordSearchState));
  },
  closeChoosedModal: function () {
    this.setData({
      chooseModalDisplay: !1,
    });
  },
  costomerFollowTab: function () {
    (this.setData({
      displayContent: 1,
      chooseModalDisplay: !1,
      trackRecordPageNum: 1,
      customerRecordList: [],
    }),
      ServicesUserLog.servicesUserLog.setUserHandleLog(311),
      this.trackRecordList(this.data.customerId));
  },
  orderRecordTab: function () {
    (this.setData({
      displayContent: 2,
      orderRecordPageNum: 1,
      orderRecordList: [],
    }),
      this.customerOrderList(this.data.customerId));
  },
  rebackTab: function () {
    (this.setData({
      displayContent: 3,
      refundRecordPageNum: 1,
      refundList: [],
    }),
      ServicesUserLog.servicesUserLog.setUserHandleLog(312),
      this.refundOrderList(this.data.customerId));
  },
  getCustomerDetail: function (t) {
    var ServicesUserLog = this,
      mta_analysis = {
        customerId: t,
      };
    ServicesCustomer.customerDetail(mta_analysis).then(function (t) {
      0 === t.code
        ? ((t.data.headImg = util.addDefaultAvatar(t.data.avatar)),
          ServicesUserLog.setData({
            customerInfo: t.data,
          }))
        : wx.showToast({
            title: t.msg,
            icon: "none",
          });
    });
  },
  customerOrderRecordNum: function (t) {
    var ServicesUserLog = this,
      mta_analysis = this,
      app = {
        customerId: t,
      };
    ServicesCustomer.customerOrderRecordNum(app).then(function (t) {
      0 === t.code
        ? ((ServicesUserLog.data.customerOrderRecordNum = t.data),
          mta_analysis.setData({
            customerOrderRecordNum: ServicesUserLog.data.customerOrderRecordNum,
          }))
        : wx.showToast({
            title: t.msg,
            icon: "none",
          });
    });
  },
  trackRecordList: function (t) {
    var ServicesUserLog = this,
      mta_analysis = arguments.length > 1 && void 0 !== arguments[1] && arguments[1],
      app = this,
      util = {
        id: t,
        size: 10,
        page: app.data.trackRecordPageNum,
      };
    (wx.showLoading({
      title: "",
    }),
      ServicesCustomer.trackRecordList(util).then(function (t) {
        if ((wx.hideLoading(), 0 === t.code)) {
          var util = t.data.content || [];
          util.length > 0 &&
            (mta_analysis
              ? (util.forEach(function (t, e) {
                  ((t.recordTime = app.getNowFormatDate(t.recordTime)),
                    t.recordTime ==
                    app.data.customerRecordList[app.data.customerRecordList.length - 1].recordTime
                      ? t.recordList.forEach(function (t) {
                          ((t.createTime = app.getHourM(t.createTime)),
                            app.data.customerRecordList[
                              app.data.customerRecordList.length - 1
                            ].recordList.push(t));
                        })
                      : ((t.recordTime = app.getNowFormatDate(t.recordTime)),
                        t.recordList.forEach(function (t) {
                          t.createTime = app.getHourM(t.createTime);
                        }),
                        app.data.customerRecordList.push(t)));
                }),
                ServicesUserLog.setData({
                  customerRecordList: app.data.customerRecordList,
                }))
              : ((app.data.customerRecordList = util),
                app.data.customerRecordList.map(function (t) {
                  ((t.recordTime = app.getNowFormatDate(t.recordTime)),
                    t.recordList.map(function (t) {
                      t.createTime = app.getHourM(t.createTime);
                    }));
                }),
                ServicesUserLog.setData({
                  customerRecordList: app.data.customerRecordList,
                })));
        } else
          wx.showToast({
            title: t.msg,
            icon: "none",
          });
      }));
  },
  customerOrderList: function (t) {
    var ServicesUserLog = this,
      mta_analysis = arguments.length > 2 && void 0 !== arguments[2] && arguments[2],
      app = this,
      i = {
        id: t,
        pageSize: 10,
        pageNum: arguments.length > 1 && void 0 !== arguments[1] ? arguments[1] : 1,
        status: arguments.length > 3 && void 0 !== arguments[3] ? arguments[3] : 0,
      };
    (wx.showLoading(),
      ServicesCustomer.customerOrderList(i).then(function (t) {
        if ((wx.hideLoading(), 0 === t.code)) {
          var ServicesCustomer = t.data.content;
          (ServicesCustomer &&
            ServicesCustomer.forEach(function (t) {
              t.orderGoods &&
                t.orderGoods.length > 0 &&
                t.orderGoods.forEach(function (t) {
                  t.goodsImgPath = util.replImage(t.goodsImgPath, 110);
                });
            }),
            ServicesUserLog.setData({
              totalPage: t.data.totalPage,
            }),
            mta_analysis
              ? ServicesCustomer &&
                ServicesCustomer.length > 0 &&
                ServicesCustomer.forEach(function (t) {
                  (app.data.orderRecordList.push(t),
                    app.setData({
                      orderRecordList: app.data.orderRecordList,
                    }));
                })
              : ((ServicesUserLog.data.orderRecordList = ServicesCustomer),
                ServicesUserLog.setData({
                  orderRecordList: ServicesUserLog.data.orderRecordList,
                })));
        } else
          wx.showToast({
            title: t.msg,
            icon: "none",
          });
      }));
  },
  refundOrderList: function (t) {
    var ServicesUserLog = this,
      mta_analysis = arguments.length > 1 && void 0 !== arguments[1] && arguments[1],
      app = this,
      i = {
        customerId: t,
        pageSize: 10,
        pageNum: app.data.refundRecordPageNum,
      };
    (wx.showLoading(),
      ServicesCustomer.refundrOrderList(i).then(function (t) {
        if ((wx.hideLoading(), 0 === t.code)) {
          var ServicesCustomer = t.data.content || [];
          (ServicesCustomer.forEach(function (t) {
            t.refundGoodsDetailModels &&
              t.refundGoodsDetailModels.length &&
              t.refundGoodsDetailModels.forEach(function (t) {
                t.goodsImgPath = util.replImage(t.goodsImgPath, 200);
              });
          }),
            mta_analysis
              ? ServicesCustomer.length > 0 &&
                ServicesCustomer.forEach(function (t) {
                  app.data.refundList.push(t);
                })
              : (ServicesUserLog.data.refundList = ServicesCustomer),
            ServicesUserLog.setData({
              refundList: ServicesUserLog.data.refundList,
              refundRecordTotalPage: t.data.totalPage,
            }));
        } else
          wx.showToast({
            title: t.msg,
            icon: "none",
          });
      }));
  },
  toCustomerDeit: function () {
    var t = wx.getStorageSync("customerId");
    wx.navigateTo({
      url: "/pages/customer-management/edit-customer-info/edit-customer-info?customerId=".concat(t),
    });
  },
  toaddRecord: function () {
    -1 != this.data.customerInfo.status
      ? wx.navigateTo({
          url: "/pages/customer-management/add-record/add-record",
        })
      : wx.showToast({
          title: "黑名单不能添加记录",
          icon: "none",
        });
  },
  toRecordCondition: function (t) {
    if (1 != t.currentTarget.dataset.flag) {
      var ServicesUserLog = t.currentTarget.dataset.index.id;
      wx.navigateTo({
        url: "/pages/customer-management/record-condition/record-condition?trackRecordId=".concat(
          ServicesUserLog,
        ),
      });
    }
  },
  getNowFormatDate: function (t) {
    return t ? t.split(" ")[0] : "";
  },
  bindServiceTel: function () {
    this.data.customerInfo.customerPhone
      ? (ServicesUserLog.servicesUserLog.setUserHandleLog(304),
        wx.makePhoneCall({
          phoneNumber: this.data.customerInfo.customerPhone,
        }))
      : wx.showToast({
          title: "联系电话为空",
          icon: "none",
        });
  },
  toDetailPage: function (t) {
    var mta_analysis = t.currentTarget.dataset.state,
      app = t.currentTarget.dataset.id,
      util = t.currentTarget.dataset.orderNo;
    if ((ServicesUserLog.servicesUserLog.setUserHandleLog(310), 10 == mta_analysis)) {
      if (!this.data.userAuthList["order:saveBilling"])
        return void wx.showToast({
          title: "没有权限",
          icon: "none",
        });
      var ServicesCustomer = "/pages/order-create/offline/create?id=&orderNo="
        .concat(util, "&orderId=")
        .concat(app);
      wx.navigateTo({
        url: ServicesCustomer,
      });
    } else if (30 == mta_analysis) {
      if (!this.data.userAuthList["order:saveBilling"])
        return void wx.showToast({
          title: "没有权限",
          icon: "none",
        });
      var i = "/pages/order-create/offline/create?id="
        .concat(app, "&orderNo=")
        .concat(util, "&orderId=&isFromPin=1");
      wx.navigateTo({
        url: i,
      });
    } else if (0 == mta_analysis) {
      if (!this.data.userAuthList["order:saveBilling"])
        return void wx.showToast({
          title: "没有权限",
          icon: "none",
        });
      var d =
        "/packageB/pages/sales-return/sales-return-list/sales-return-list-detail/index?id=".concat(
          app,
        );
      wx.navigateTo({
        url: d,
      });
    } else {
      if (!this.data.userAuthList["order:query"])
        return void wx.showToast({
          title: "没有权限",
          icon: "none",
        });
      wx.navigateTo({
        url: "/pages/order/detail/index?orderId=".concat(app),
      });
    }
  },
  getHourM: function (t) {
    return t ? t.split(" ")[1] : "";
  },
  onPageScroll: function (t) {
    t.scrollTop > 154
      ? this.setData({
          fixedTab: !0,
        })
      : this.setData({
          fixedTab: !1,
        });
  },
  onLoad: function (t) {
    (mta_analysis.default.Page.init(),
      this.setData({
        userAuthList: app.userAuthList,
      }),
      this.setData({
        pageHeight: 2 * wx.getSystemInfoSync().screenHeight,
      }),
      (375 != app.globalData.mobileInfo.screenWidth &&
        414 != app.globalData.mobileInfo.screenWidth) ||
        this.setData({
          isIp6: !0,
        }),
      wx.setStorageSync("customerId", t.customerId),
      this.setData({
        customerId: t.customerId,
      }),
      this.customerOrderList(this.data.customerId),
      wx.hideShareMenu());
  },
  onReady: function () {},
  onShow: function () {
    (wx.removeStorageSync("pickColorCard"),
      this.getCustomerDetail(this.data.customerId),
      this.setData({
        trackRecordPageNum: 1,
        refundRecordPageNum: 1,
      }),
      2 == this.data.displayContent
        ? this.orderRecordTab()
        : 3 == this.data.displayContent
          ? this.rebackTab()
          : this.trackRecordList(this.data.customerId),
      this.customerOrderRecordNum(this.data.customerId));
  },
  onHide: function () {},
  onUnload: function () {
    console.log(1233232);
  },
  onPullDownRefresh: function () {},
  onReachBottom: function () {
    if (
      (1 == this.data.displayContent &&
        (this.setData({
          trackRecordPageNum: ++this.data.trackRecordPageNum,
        }),
        this.trackRecordList(this.data.customerId, !0)),
      2 == this.data.displayContent)
    ) {
      var t =
          this.data.totalPage > this.data.orderRecordPageNum
            ? ++this.data.orderRecordPageNum
            : this.data.orderRecordPageNum,
        ServicesUserLog = this.data.noworderRecordSearchState;
      this.data.totalPage > t &&
        this.customerOrderList(this.data.customerId, t, this.data.totalPage > t, ServicesUserLog);
    }
    if (3 == this.data.displayContent) {
      var mta_analysis = ++this.data.refundRecordPageNum;
      if (mta_analysis > this.data.refundRecordTotalPage)
        return (
          (this.data.refundRecordPageNum = this.data.refundRecordTotalPage),
          void this.setData({
            refundRecordPageNum: this.data.refundRecordTotalPage,
          })
        );
      (this.setData({
        refundRecordPageNum: mta_analysis,
      }),
        this.refundOrderList(this.data.customerId, mta_analysis < this.data.refundRecordTotalPage));
    }
  },
  onShareAppMessage: function () {},
});
