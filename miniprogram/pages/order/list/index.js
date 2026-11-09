var t = require("../../../@babel/runtime/helpers/interopRequireDefault").default,
  slicedToArray = require("../../../@babel/runtime/helpers/slicedToArray"),
  mta_analysis = t(require("../../../utils/mta_analysis.js")),
  getWxInfo = t(require("../../../libs/utils/getWxInfo")),
  isVisitor = t(require("../../../libs/utils/isVisitor")),
  throttle = t(require("../../../utils/throttle")),
  login = require("../../../libs/utils/login.js"),
  toast = t(require("../../../miniprogram_npm/@vant/weapp/toast/toast")),
  dialog = t(require("../../../miniprogram_npm/@vant/weapp/dialog/dialog")),
  orderCreate = require("../../../libs/services/orderCreate"),
  ServicesUserLog = require("../../../libs/services/ServicesUserLog.js"),
  app = getApp(),
  u = {
    0: "undeal|待开单",
    1: "unpay|未结算",
    2: "payed|已结算",
    3: "closed|已关闭",
  },
  g =
    (require("../../../libs/utils/time").parseTime,
    require("../../../libs/services/ServicesOrder").ServicesOrder),
  ServicesCard = require("../../../libs/services/ServicesCard").servicesCard,
  util = require("../../../libs/utils/util.js").utils;
Page({
  data: {
    pageHeight: null,
    newPrintType: null,
    userAuthList: {},
    activedIndex: 0,
    tab: {
      lineWidth: 20,
      color: "#ffffff",
      border: !1,
    },
    pinCount: 29,
    list: [],
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
    ishasNextPage: !0,
    showDrop: !1,
    chooseTitle: "全部",
    noworderRecordSearchState: "",
    chooseStatus: 0,
    globalApp: app,
    searchIconUrl: "".concat(
      app.config.imgHost,
      "/img/customer/duibuIcon/icon/Icon_Nav_Search_White@2x.png",
    ),
    testFace: "".concat(app.config.imgHost, "/img/customer/duibuIcon/test_face.png"),
    beforeCloses: !0,
    startDate: "",
    endDate: "",
  },
  onResetDate: function () {
    this.setData({
      startDate: "",
      endDate: "",
      list: [],
    });
    var t,
      e = this.data.activedIndex;
    (0 === e ? (t = this.data.chooseStatus) : 1 === e ? (t = 10) : 2 === e && (t = 30),
      this.getShopOrderList("", t));
  },
  bindStartDateChange: function (t) {
    var e = t.detail.value;
    this.data.endDate && e.replace(/-/g, "") > this.data.endDate.replace(/-/g, "")
      ? wx.showToast({
          title: "开始日期不能大于结束日期",
          icon: "none",
        })
      : (this.setData({
          startDate: t.detail.value,
          list: [],
        }),
        this.getShopOrderList());
  },
  bindEndDateChange: function (t) {
    var e = t.detail.value;
    this.data.startDate.replace(/-/g, "") > e.replace(/-/g, "")
      ? wx.showToast({
          title: "开始日期不能大于结束日期",
          icon: "none",
        })
      : (this.setData({
          endDate: t.detail.value,
          list: [],
        }),
        this.getShopOrderList());
  },
  tabBar: function () {
    this.setData({
      active: "2",
    });
  },
  onLoad: function (t) {
    (mta_analysis.default.Page.init(),
      login.login.getUserInfo(),
      this.setData({
        userAuthList: app.userAuthList,
      }),
      this.setData({
        pageHeight: 2 * wx.getSystemInfoSync().screenHeight,
      }));
  },
  onReady: function () {},
  onShow: function () {
    this.tabBar();
    var t = this.data.activedIndex,
      self = this;
    (this.setData({
      nowPageNum: 1,
    }),
      // 登录门：判据为后端 GET /api/v1/erp/users/me 的回读结果，本地 token 键已不是判据
      // （全仓无任何一处写 storage 的 token，原写法等于订单列表永不加载）
      isVisitor.default.isVisitor().then(function () {
        (self.getNewPrintType(),
          0 == t
            ? self.getShopOrderList("", self.data.chooseStatus)
            : 1 == t
              ? self.getShopOrderList("", 10)
              : 2 == t && self.getShopOrderList("", 30));
      }));
  },
  banScroll: function () {},
  chooseModalDisplayCon: function () {
    (this.setData({
      chooseStatus: this.data.noworderRecordSearchState,
    }),
      this.setData({
        showDrop: !this.data.showDrop,
      }));
  },
  changechooseItem: function (t) {
    var e = t.currentTarget.dataset.index;
    (this.setData({
      chooseStatus: e,
    }),
      0 == t.currentTarget.dataset.index
        ? this.setData({
            chooseTitle: "全部",
          })
        : 40 == t.currentTarget.dataset.index
          ? this.setData({
              chooseTitle: "未结算",
            })
          : 50 == t.currentTarget.dataset.index
            ? this.setData({
                chooseTitle: "已结算",
              })
            : -20 == t.currentTarget.dataset.index
              ? this.setData({
                  chooseTitle: "已作废",
                })
              : -10 == t.currentTarget.dataset.index &&
                this.setData({
                  chooseTitle: "已关闭",
                }),
      this.chooseModalConfirm());
  },
  chooseModalConfirm: function () {
    (this.setData({
      showDrop: !1,
    }),
      this.getShopOrderList(this.data.searchCondition, this.data.chooseStatus, 1));
  },
  closeChoosedModal: function () {
    this.setData({
      showDrop: !1,
    });
  },
  onHide: function () {},
  onUnload: function () {},
  onPullDownRefresh: function () {},
  onReachBottom: function () {
    this.arrivedBottom();
  },
  onShareAppMessage: function () {},
  changeDropShow: function () {
    ((this.data.showDrop = !this.data.showDrop),
      this.setData({
        showDrop: this.data.showDrop,
      }));
  },
  getNewPrintType: function () {
    var t = this;
    ServicesCard.newLabelPrint({}).then(function (e) {
      if (0 === e.code) {
        if (null !== e.data) {
          var slicedToArray = e.data.mpNewLabelPrint;
          t.setData({
            newPrintType: slicedToArray,
          });
        }
        wx.hideLoading();
      } else
        wx.showToast({
          title: e.msg,
          icon: "none",
        });
    });
  },
  toSearchList: function () {
    wx.navigateTo({
      url: "/pages/order/search-list/search-list",
    });
  },
  hanleOrderCreate: throttle.default.throttle(function (t) {
    getWxInfo.default
      .wxSubscription([
        "ALvdDpDgXPaXX4pJMVLwPjEo_vxdxvFmwRJxfP9mW-c",
        "aQ2Lau609g2t4ThsXJGmOxkxp2tdyjYEPX1dZfUIeS8",
      ])
      .then(function () {
        var e = t.currentTarget.dataset,
          slicedToArray = e.id,
          mta_analysis = e.orderNo,
          getWxInfo = "/pages/order-create/offline/create?id=&orderNo="
            .concat(mta_analysis, "&orderId=")
            .concat(slicedToArray, "&onlineOrder=")
            .concat(1);
        wx.navigateTo({
          url: getWxInfo,
        });
      });
  }),
  againOrderCreate: function (t) {
    var e = t.currentTarget.dataset,
      slicedToArray = e.id,
      mta_analysis = e.orderNo,
      getWxInfo = "/pages/order-create/offline/create?id=&orderNo="
        .concat(mta_analysis, "&orderId=&reBillingId=")
        .concat(slicedToArray);
    wx.navigateTo({
      url: getWxInfo,
    });
  },
  hanleCreateOn: function (t) {
    var e = t.currentTarget.dataset,
      slicedToArray = e.id,
      mta_analysis = e.orderNo,
      getWxInfo = "/pages/order-create/offline/create?id="
        .concat(slicedToArray, "&orderNo=")
        .concat(mta_analysis, "&orderId=&isFromPin=1");
    wx.navigateTo({
      url: getWxInfo,
    });
  },
  toDetail: function (t) {
    var e = t.currentTarget.dataset.orderid,
      slicedToArray = t.currentTarget.dataset.orderstatus;
    if (2 == this.data.activedIndex || (0 == this.data.activedIndex && 30 == slicedToArray)) {
      if (!this.data.userAuthList["order:saveBilling"])
        return void wx.showToast({
          title: "没有权限",
          icon: "none",
        });
      var mta_analysis = t.currentTarget.dataset.orderno,
        getWxInfo = "/pages/order-create/offline/create?id="
          .concat(e, "&orderNo=")
          .concat(mta_analysis, "&orderId=&isFromPin=1");
      wx.navigateTo({
        url: getWxInfo,
      });
    } else {
      if (!this.data.userAuthList["order:query"])
        return void wx.showToast({
          title: "没有权限",
          icon: "none",
        });
      wx.navigateTo({
        url: "/pages/order/detail/index?orderId=".concat(e),
      });
    }
  },
  getShopOrderList: function () {
    var t = this,
      e = arguments.length > 3 && void 0 !== arguments[3] && arguments[3],
      slicedToArray = this,
      mta_analysis = {
        status: (arguments.length > 1 && void 0 !== arguments[1] ? arguments[1] : 0) || 0,
        saleType: 0,
        keyword: arguments.length > 0 && void 0 !== arguments[0] ? arguments[0] : "",
        page: arguments.length > 2 && void 0 !== arguments[2] ? arguments[2] : 1,
        size: 10,
        startTime: this.data.startDate,
        endTime: this.data.endDate,
      };
    (wx.showLoading(),
      g.shopOrderList(mta_analysis).then(function (o) {
        if ((wx.hideLoading(), 0 === o.code)) {
          if (o.data) {
            var getWxInfo = o.data.content;
            (getWxInfo.forEach(function (t, e) {
              (getWxInfo[e].buyerHeadImg ||
                (getWxInfo[e].buyerHeadImg = "".concat(
                  app.config.imgHost,
                  "/Face_User_Face_Man_Default@3x.png",
                )),
                getWxInfo[e].orderGoods.forEach(function (t, e) {
                  t.goodsImgPath = t.goodsImgPath
                    ? util.replImage(t.goodsImgPath, 88)
                    : "".concat(app.config.imgHost, "/img/customer/duibuIcon/no_img.png");
                }));
            }),
              e
                ? getWxInfo &&
                  getWxInfo.length > 0 &&
                  getWxInfo.forEach(function (t) {
                    slicedToArray.data.list.push(t);
                  })
                : (slicedToArray.data.list = getWxInfo),
              (slicedToArray.data.nowPageNum = o.data.pageNo),
              (slicedToArray.data.nowPageNum =
                o.data.totalPage > o.data.pageNo
                  ? slicedToArray.data.nowPageNum + 1
                  : slicedToArray.data.nowPageNum),
              (slicedToArray.data.ishasNextPage = o.data.totalPage > o.data.pageNo),
              t.setData({
                list: slicedToArray.data.list,
                nowPageNum: slicedToArray.data.nowPageNum,
                ishasNextPage: slicedToArray.data.ishasNextPage,
              }));
          } else
            slicedToArray.setData({
              list: [],
            });
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
    0 == slicedToArray
      ? this.getShopOrderList(e, this.data.chooseStatus, 1)
      : 1 == slicedToArray
        ? this.getShopOrderList(e, 10, 1)
        : 2 == slicedToArray && this.getShopOrderList(e, 30, 1);
  },
  handleInput: function (t) {
    var e = t.detail;
    this.setData({
      searchCondition: e,
    });
  },
  arrivedBottom: function () {
    if (this.data.ishasNextPage) {
      var t = this.data.activedIndex,
        e = this.data.nowPageNum,
        slicedToArray = this.data.searchCondition;
      0 == t
        ? this.getShopOrderList(slicedToArray, this.data.chooseStatus, e, !0)
        : 1 == t
          ? this.getShopOrderList(slicedToArray, 10, e, !0)
          : 2 == t && this.getShopOrderList(slicedToArray, 30, e, !0);
    }
  },
  toHandledOrder: function (t) {
    wx.navigateTo({
      url: "/pages/order/pin/index",
    });
  },
  closeOrder: function (t, e) {
    var slicedToArray = this,
      mta_analysis = {
        billingId: t,
        closeReason: e,
      };
    g.closeOrder(mta_analysis).then(function (t) {
      0 === t.code
        ? (ServicesUserLog.servicesUserLog.setUserHandleLog(205), slicedToArray.getShopOrderList())
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
          wx.showToast({
            title: "理由不能为空",
            icon: "error",
          }),
          t.detail.dialog.stopLoading(),
          !1
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
      ? (ServicesUserLog.servicesUserLog.setUserHandleLog(209),
        wx.makePhoneCall({
          phoneNumber: e,
        }))
      : wx.showToast({
          title: "电话号码为空",
          icon: "none",
        });
  },
  handleOrderPrint: function (t) {
    var e = t.currentTarget.dataset.orderid,
      slicedToArray = t.currentTarget.dataset.mobile,
      mta_analysis = t.currentTarget.dataset.id,
      getWxInfo = this.data.newPrintType,
      throttle = [
        function () {
          wx.navigateTo({
            url: "/pages/printing/order/index?orderId=".concat(e, "&printType=order"),
          });
        },
        function () {
          wx.navigateTo({
            url: "/packageB/pages/color-card-management/print-cloth-head/print-format/print-format?orderId="
              .concat(e, "&customMobile=")
              .concat(slicedToArray, "&&billingId=")
              .concat(mta_analysis, "&&newPrintType=")
              .concat(getWxInfo),
          });
        },
      ];
    wx.showActionSheet({
      itemList: ["打印码单", "打印布头"],
      itemColor: "#4C7CF9",
      success: function (t) {
        throttle[t.tapIndex]();
      },
      fail: function (t) {
        console.log(t.errMsg);
      },
    });
  },
  handleOrderDelete: function (t) {
    var e = this,
      slicedToArray = t.currentTarget.dataset.id;
    dialog.default
      .confirm({
        title: "提示",
        message: "删除后将无法查看此条记录，您确定删除吗 ？",
      })
      .then(function () {
        e.deleteOrder(slicedToArray);
      })
      .catch(function (t) {
        (0, toast.default)({
          duration: 1e3,
          message: "已取消",
        });
      });
  },
  deleteOrder: function (t) {
    var e = this;
    g.deleteOrder(t).then(function (t) {
      0 === t.code
        ? (wx.showToast({
            title: "订单已删除",
            icon: "success",
            duration: 2e3,
          }),
          e.getShopOrderList(e.data.searchCondition, e.data.chooseStatus))
        : wx.showToast({
            title: t.msg,
            icon: "none",
          });
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
      e = u[t].split("|"),
      mta_analysis = slicedToArray(e, 2);
    (mta_analysis[0], mta_analysis[1]);
  },
  handleTabClick: function (t) {
    0 == t.detail.index &&
      this.setData({
        showDrop: !0,
      });
  },
  handleTabChange: function (t) {
    var e = t.detail.index;
    this.setData({
      activedIndex: e,
      chooseStatus: this.data.chooseStatus,
      chooseTitle: this.data.chooseTitle,
    });
    var slicedToArray = this.data.searchCondition;
    0 == e
      ? this.getShopOrderList("", this.data.chooseStatus)
      : 1 == e
        ? (this.getShopOrderList(slicedToArray, 10),
          this.setData({
            showDrop: !1,
          }))
        : 2 == e &&
          (this.setData({
            showDrop: !1,
          }),
          this.getShopOrderList(slicedToArray, 30));
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
      (0, orderCreate.getQRCode)(slicedToArray, app.envVersion)
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
    ((e = e.replace("http:", "https:")),
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
      }));
  },
  handleCloseAuthDialog: function () {
    this.setData({
      showAuth: !1,
    });
  },
});
