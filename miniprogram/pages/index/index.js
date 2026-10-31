var t,
  e,
  a = require("../../@babel/runtime/helpers/interopRequireDefault").default,
  n = require("../../@babel/runtime/helpers/defineProperty"),
  o = require("../../@babel/runtime/helpers/regeneratorRuntime"),
  s = require("../../@babel/runtime/helpers/asyncToGenerator"),
  mta_analysis = a(require("../../utils/mta_analysis")),
  formatRichText = require("../../utils/formatRichText.js"),
  global = require("../../libs/services/global"),
  isVisitor = a(require("../../libs/utils/isVisitor")),
  getWxInfo = a(require("../../libs/utils/getWxInfo")),
  ServicesUserLog = require("../../libs/services/ServicesUserLog"),
  app = getApp(),
  login = require("../../libs/utils/login.js").login,
  util = require("../../libs/utils/util.js").utils,
  ServicesUser = require("../../libs/services/ServicesUser.js").servicesUser,
  ServicesIndex = require("../../libs/services/ServicesIndex.js").ServicesIndex,
  ServicesShop = require("../../libs/services/ServicesShop.js").servicesShop;
Page(
  ({
    data: {
      personInfo: {
        nickName: "",
        avatar: "".concat(app.config.imgHost, "/Face_User_Face_Man_Default@3x.png"),
        fullName: "",
      },
      saveOptions: "",
      storeInfo: {},
      storeDataInfo: {},
      noReadCount: 0,
      text: {
        header: ["店铺预览>", "设备连接>", "店铺动态>"],
        todayData: ["今日开单（笔）", "总欠款（元）", "今日收款（元）"],
      },
      icon: {
        rightArrow: "".concat(app.config.imgHost, "/img/customer/ic_jinru.png"),
        rightArrowWhite: "".concat(app.config.imgHost, "/img/customer/ic_jinru_white.svg"),
        customerBg: "".concat(app.config.imgHost, "/img/customer/index-customerMan-bg.svg"),
        colorBg: "".concat(app.config.imgHost, "/img/customer/index-colorMan-bg.svg"),
        newsBg: "".concat(app.config.imgHost, "/img/customer/index-newsMan-bg.svg"),
        customer: "".concat(app.config.imgHost, "/img/customer/ic_index_kehuguanli2@2x.png"),
        color: "".concat(app.config.imgHost, "/img/customer/ic_index_sekaguanli2@2x.png"),
        news: "".concat(app.config.imgHost, "/img/customer/ic_index_dianpudongtai@2x.png"),
        tips: "".concat(app.config.imgHost, "/img/customer/tips.png"),
        toShop: "".concat(app.config.imgHost, "/img/v2.7.8/Icon_Nav_Shop@2x.png"),
        toNews: "".concat(app.config.imgHost, "/img/customer/duibuIcon/news@2x.png"),
        toImgSearch: "".concat(app.config.imgHost, "/img/customer/duibuIcon/search@2x.png"),
        bg: "".concat(app.config.imgHost, "/img/customer/duibuIcon/bg.png"),
        close: "".concat(app.config.imgHost, "/img/customer/duibuIcon/icon/close.png"),
      },
      bussinessIcon: {
        pic1: "".concat(app.config.imgHost, "/img/customer/duibuIcon/1.png"),
        pic2: "".concat(app.config.imgHost, "/img/customer/duibuIcon/2.png"),
        pic3: "".concat(app.config.imgHost, "/img/customer/duibuIcon/3.png"),
        pic4: "".concat(app.config.imgHost, "/img/customer/duibuIcon/4.png"),
        pic5: "".concat(app.config.imgHost, "/img/customer/duibuIcon/5.png"),
        pic6: "".concat(app.config.imgHost, "/img/customer/duibuIcon/6.png"),
        pic7: "".concat(app.config.imgHost, "/img/customer/duibuIcon/7.png"),
        pic8: "".concat(app.config.imgHost, "/img/customer/duibuIcon/8.png"),
        pic9: "".concat(app.config.imgHost, "/img/customer/duibuIcon/9.png"),
      },
      userAuthList: {},
      formId: null,
      modalDisplay: !1,
      currentRoleId: 1,
      showCancelComfirm: !1,
      msgTitle: "提示",
      msgContent: "",
      checkedMessage: !1,
      messageId: [],
      newMessage: "",
      showAdvertising: !1,
      advertisData: {},
      bannerData: "",
    },
    onShareAppMessage: function () {
      return {
        title: "秉羲工作台",
        path: "/pages/index/index",
      };
    },
    upload: function () {
      var t = this;
      wx.chooseMedia({
        mediaType: ["image"],
        success: function (e) {
          var a = 0;
          (t.setData({
            isLoadingPhoto: 1,
          }),
            e.tempFiles.map(function (n) {
              wx.uploadFile({
                header: {
                  "Content-Type": "multipart/form-data",
                  Authorization: wx.getStorageSync("token"),
                  terminalSource: 6,
                  terminalType: 81,
                },
                formData: {
                  type: 1,
                },
                url: "".concat(app.config.bingxiHost, "/app-api/oss/upload"),
                filePath: n.tempFilePath,
                name: "file",
                success: function (n) {
                  try {
                    var o = JSON.parse(n.data);
                    if (0 === o.code) {
                      var s = o.data;
                      (t.data.remoteImageFiles.push({
                        text: util.replImage(s, 300),
                        name: s.substr(s.lastIndexOf("/") + 1),
                        storagePath: util.replImage(s, 300),
                      }),
                        t.data.remoteImageFiles.length > uploadPiece &&
                          (t.data.remoteImageFiles.length = uploadPiece),
                        t.setData({
                          remoteImageFiles: t.data.remoteImageFiles,
                          isLoadingPhoto: 0,
                        }));
                    } else
                      401 === o.code
                        ? wx.showToast({
                            icon: "none",
                            title: "token失效,请重新上传",
                          })
                        : wx.showToast({
                            icon: "none",
                            title: t.data.msg.result,
                          });
                  } catch (t) {
                    wx.showToast({
                      icon: "none",
                      title: "上传图片失败",
                    });
                  }
                  (t.getWidth(),
                    (a += 1) &&
                      a === e.tempFiles.length &&
                      setTimeout(function () {
                        wx.hideLoading();
                      }, 500));
                },
                fail: function (t) {},
              });
            }));
        },
      });
    },
    getUnreadMessageCount: function () {
      var t = this;
      ServicesIndex.getNoReadCount().then(function (e) {
        var a;
        0 === e.code &&
          t.setData({
            noReadCount: null === (a = e.data) || void 0 === a ? void 0 : a.noReadCount,
          });
      });
    },
    onCloseAdvertis: function () {
      this.setData({
        showAdvertising: !1,
      });
    },
    getAdvertisingData: async function () {
      ServicesIndex.getLaststAdvertis(t).then(function (a) {
        0 === a.code &&
          a.data &&
          (3 === t &&
            e.setData({
              advertisData: a.data,
              showAdvertising: !0,
            }),
          4 === t &&
            e.setData({
              bannerData: a.data,
            }));
      });
    },
    onCapAdvertis: function () {
      this.data.advertisData.linkAddress &&
        (ServicesUserLog.servicesUserLog.setUserHandleLog(611, {
          bizData: this.data.advertisData.title,
        }),
        this.data.advertisData.linkAddress.search("bdd") > -1
          ? wx.navigateTo({
              url: "/packageA/pages/".concat(this.data.advertisData.linkAddress, "/index"),
            })
          : wx.navigateTo({
              url: "/packageA/pages/web?url=".concat(this.data.advertisData.linkAddress),
            }));
    },
    onClickBanner: function () {
      var t;
      ServicesUserLog.servicesUserLog.setUserHandleLog(610, {
        bizData: this.data.bannerData.title,
      });
      var e =
        null === (t = this.data.bannerData) ||
        void 0 === t ||
        null === (t = t.linkAddress) ||
        void 0 === t
          ? void 0
          : t.split("/")[2];
      wx.navigateTo({
        url: "/packageA/pages/".concat(e, "/index"),
      });
    },
    tabBar: function () {
      this.setData({
        active: "0",
      });
    },
    toPath: function () {
      "type" == app.globalData.userInfo.type &&
        wx.reLaunch({
          url: "/pages/register/fabric-guide/index",
        });
    },
    getUserTap: function () {
      getWxInfo.default.getWxCode().then(function () {
        app.globalData.wxCode;
      });
    },
    getUserCode: function (t) {
      var e = util.getParam(t, "c", "0"),
        a = util.getParam(t, "sc", "0");
      if (0 != e || 0 != a) {
        var n = app.globalData.wxCode;
        ((app.globalData.inChannel = e), (app.globalData.subChannel = a));
        var o = {
          channel: e,
          subChannel: a,
          wxCode: n,
          token: wx.getStorageSync("token"),
        };
        ServicesUser.getChannel(o);
      }
    },
    toLogin: function () {
      wx.reLaunch({
        url: "/pages/register/login/login",
      });
    },
    onLoad: async function (e) {
      if (wx.getStorageSync("token")) {
        await this.getUserInfo();
        await this.getMessage();
        await this.getAdvertisingData(3);
        await this.getAdvertisingData(4);
        this.getUnreadMessageCount();
      }
      (mta_analysis.default.Page.init(),
        this.setData({
          saveOptions: e,
        }));
    },
    onShow: function () {
      var t = this,
        e = this;
      (wx.getStorageSync("token") &&
        getWxInfo.default
          .getWxCode()
          .then(function () {
            return t.getUserInfo();
          })
          .then(function () {
            (t.setData({
              indexUserInfo: app.globalData.userInfo,
            }),
              0 === app.statisticsCount &&
                (e.getUserCode(t.data.saveOptions),
                ServicesUser.countInvite({
                  type: 115,
                }),
                app.statisticsCount++),
              t.hasPower(),
              t.storeDetail());
            var a = t.data.userAuthList;
            (a["stat:summary:person"]
              ? t.countsDataPer()
              : !a["stat:summary:person"] && a["stat:summary"] && t.countsData(),
              t.NoticeDisplay(),
              (t.data.personInfo.fullName = wx.getStorageSync("fullName") || ""),
              (t.data.personInfo.avatar = wx.getStorageSync("avatar") || ""),
              (t.data.personInfo.nickName = wx.getStorageSync("nickName") || ""),
              (t.data.personInfo.avatar = t.data.personInfo.avatar
                ? t.data.personInfo.avatar + "?imageView2/2/w/200"
                : ""),
              t.setData({
                personInfo: t.data.personInfo,
              }),
              wx.getSystemInfo({
                success: function (t) {
                  app.globalData.mobileInfo = t;
                },
              }));
          }),
        this.tabBar());
    },
    switchRoleTo: function () {
      ((this.data.currentRoleId = 1 == this.data.currentRoleId ? 2 : 1),
        this.countsDataPer(),
        this.setData({
          currentRoleId: this.data.currentRoleId,
        }));
    },
    getUserInfo: function () {
      return new Promise(function (t, e) {
        login.getUserInfo().then(function () {
          t();
        });
      });
    },
    got: function () {
      this.setData({
        showCancelComfirm: !1,
      });
    },
    checkboxChange: function () {
      this.setData({
        checkedMessage: !this.data.checkedMessage,
      });
      var t = wx.getStorageSync("messageTipId");
      if (0 === t.length) {
        var e = {
          id: app.globalData.userInfo.id,
          checked: this.data.checkedMessage,
          messageId: this.data.newMessage.id,
        };
        (this.data.messageId.push(e), wx.setStorageSync("messageTipId", this.data.messageId));
      } else {
        var a = t.findIndex(function (t) {
          return t.id === app.globalData.userInfo.id;
        });
        if (a > 0) {
          var n = {
            id: app.globalData.userInfo.id,
            checked: this.data.checkedMessage,
            messageId: this.data.newMessage.id,
          };
          t.splice(a, 1, n);
        } else {
          var o = {
            id: app.globalData.userInfo.id,
            checked: this.data.checkedMessage,
            messageId: this.data.newMessage.id,
          };
          t.push(o);
        }
        wx.setStorageSync("messageTipId", t);
      }
    },
    getMessage: async function () {
      ServicesIndex.getLastesMessage().then(function (e) {
        if (0 === e.code) {
          var a = e.data && e.data.length ? e.data : [],
            n =
              (a =
                (a = a.filter(function (t) {
                  return 1 === t.showType;
                })) && a[0]
                  ? a[0]
                  : {}).title && a.title.length > 10
                ? a.title.substring(0, 10)
                : a.title,
            o = 1 === a.showType,
            s = a.content ? (0, formatRichText.formatRichText)(a.content) : "",
            mta_analysis = wx.getStorageSync("messageTipId"),
            global =
              mta_analysis &&
              mta_analysis.filter(function (t) {
                return t.id === app.globalData.userInfo.id;
              }),
            isVisitor =
              mta_analysis &&
              mta_analysis.filter(function (t) {
                return t.messageId === a.id;
              });
          t.setData({
            showCancelComfirm:
              global.length > 0 && isVisitor.length > 0 ? !isVisitor[0].checked : o,
            msgTitle: n,
            msgContent: s,
            newMessage: a,
          });
        } else
          wx.showToast({
            title: e.msg,
            icon: "none",
          });
      });
    },
    hasPower: function () {
      var t = wx.getStorageSync("resCodeList");
      ((app.userAuthList = util.getResList(t)),
        this.setData({
          userAuthList: app.userAuthList,
        }));
    },
    toMiniProgram: function () {
      var t = this;
      isVisitor.default.isVisitor().then(function (e) {
        var a = "release";
        ((a = "production" == app.environment ? "release" : "trial"),
          wx.getStorageSync("token") && ServicesUserLog.servicesUserLog.setUserHandleLog(600),
          t.data.storeInfo.companyId &&
          "null" !== t.data.storeInfo.companyId &&
          "undefined" !== t.data.storeInfo.companyId
            ? wx.navigateToMiniProgram({
                appId: "wxa1d4576c3673f704",
                path: "/pages/component/index?shopId=".concat(t.data.storeInfo.companyId),
                extraData: {
                  foo: "bar",
                },
                envVersion: a,
                success: function (t) {},
              })
            : wx.showToast({
                title: "店铺信息获取失败",
                icon: "none",
              }));
      });
    },
    toCustomer: function () {
      (ServicesShop.operateAccess({
        type: "104",
      }).then(function (t) {}),
        isVisitor.default.isVisitor().then(function (t) {
          wx.navigateTo({
            url: "/pages/customer-management/customer-management",
          });
        }));
    },
    toColorCard: function () {
      (ServicesUserLog.servicesUserLog.setUserHandleLog(100),
        isVisitor.default.isVisitor().then(function (t) {
          wx.navigateTo({
            url: "/pages/color-card-management/color-card-management",
          });
        }));
    },
    toDataCenter: function (t) {
      var e = this;
      isVisitor.default.isVisitor().then(function (t) {
        var a = e.data.storeInfo.id;
        wx.navigateTo({
          url: "/packageA/pages/new-data-center/new-data-center?shopId=".concat(a),
        });
      });
    },
    switchRoleTo: function () {
      ((this.data.currentRoleId = 1 == this.data.currentRoleId ? 2 : 1),
        this.countsDataPer(),
        this.setData({
          currentRoleId: this.data.currentRoleId,
        }));
    },
    toNewsCenter: function () {
      isVisitor.default.isVisitor().then(function (t) {
        wx.navigateTo({
          url: "/pages/customer-management/news/index",
        });
      });
    },
    toElColorCard: function () {
      isVisitor.default.isVisitor().then(function (t) {
        wx.navigateTo({
          url: "/pages/color-card/color-card",
        });
      });
    },
    toCustomerAccount: function () {
      var t = this;
      isVisitor.default.isVisitor().then(function (e) {
        wx.navigateTo({
          url: "/packageA/pages/new-data-center/customer-balance-due/customer-balance-due?shopId=".concat(
            t.data.storeInfo.id,
          ),
        });
      });
    },
    tosalesReturn: function () {
      isVisitor.default.isVisitor().then(function (t) {
        wx.navigateTo({
          url: "/packageB/pages/sales-return/index",
        });
      });
    },
    toSearchRecord: function () {
      isVisitor.default.isVisitor().then(function (t) {
        wx.navigateTo({
          url: "/packageB/pages/search-record/index",
        });
      });
    },
    toReleaseCargoPass: function () {
      isVisitor.default.isVisitor().then(function (t) {
        wx.navigateTo({
          url: "/packageB/pages/release-cargo-pass/index",
        });
      });
    },
    toReleaseRestockPass: function () {
      isVisitor.default.isVisitor().then(function (t) {
        wx.navigateTo({
          url: "/packageB/pages/restock/index",
        });
      });
    },
    getformId: function () {
      var t = this,
        e = (0, global.saveFormId)();
      wx.login({
        success: function (a) {
          var n = {
            token: wx.getStorageSync("token"),
            formId: t.data.formId,
            code: a.code,
          };
          wx.request({
            url: e,
            method: "POST",
            data: n,
            header: {
              "content-type": "application/x-www-form-urlencoded",
              Authorization: wx.getStorageSync("token"),
              terminalSource: 6,
              terminalType: 81,
            },
            success: function (t) {},
          });
        },
      });
    },
    toCreatOrder: function () {
      (ServicesShop.operateAccess({
        type: "102",
      }),
        ServicesUserLog.servicesUserLog.setUserHandleLog(200));
      var t = this;
      isVisitor.default.isVisitor().then(function (e) {
        wx.navigateTo({
          url: "/pages/order-create/offline/create",
          success: function () {
            t.getUserTap();
          },
        });
      });
    },
  },
  n(
    n(
      n(
        n(
          n(
            n(
              n(
                n(
                  n(
                    n(t, "toSearchPicture", function () {
                      isVisitor.default.isVisitor().then(function (t) {
                        wx.navigateTo({
                          url: "/pages/search-img/search-img",
                        });
                      });
                    }),
                    "storeDetail",
                    function () {
                      this.setData({
                        storeInfo: app.globalData.userInfo,
                      });
                    },
                  ),
                  "countsData",
                  function () {
                    var t = this;
                    (wx.showLoading(),
                      ServicesIndex.countsData().then(function (e) {
                        (wx.hideLoading(),
                          0 === e.code
                            ? ((e.data.todayShopTurnover = t.formatNumberRgx(
                                e.data.todayShopTurnover,
                              )),
                              (e.data.todayBillingCount = t.formatNumberRgx(
                                e.data.todayBillingCount,
                              )),
                              (e.data.totalDebtAmount = t.formatNumberRgx(e.data.totalDebtAmount)),
                              (e.data.todayAccessCount = t.formatNumberRgx(
                                e.data.todayAccessCount,
                              )),
                              t.setData({
                                storeDataInfo: e.data,
                              }))
                            : wx.showToast({
                                title: e ? e.msg : "",
                                icon: "none",
                              }));
                      }));
                  },
                ),
                "countsDataPer",
                function () {
                  var t = this;
                  wx.showLoading();
                  var e = {
                    companyId: wx.getStorageSync("myShopId"),
                    userId: 1 === this.data.currentRoleId ? app.globalData.userInfo.id : null,
                  };
                  ServicesIndex.countsDataPer(e).then(function (e) {
                    (wx.hideLoading(),
                      0 === e.code
                        ? ((e.data.todayShopTurnover = t.formatNumberRgx(
                            e.data.todayShopTurnover || 0,
                          )),
                          (e.data.todayBillingCount = t.formatNumberRgx(
                            e.data.todayBillingCount || 0,
                          )),
                          (e.data.totalDebtAmount = t.formatNumberRgx(e.data.totalDebtAmount || 0)),
                          (e.data.todayAccessCount = t.formatNumberRgx(
                            e.data.todayAccessCount || 0,
                          )),
                          t.setData({
                            storeDataInfo: e.data,
                          }))
                        : wx.showToast({
                            title: e ? e.msg : "",
                            icon: "none",
                          }));
                  });
                },
              ),
              "formSubmit",
              function (t) {
                (5 == app.globalData.formIds.length && (app.globalData.formIds = []),
                  app.globalData.formIds.push(t.detail.formId),
                  (this.data.formId = t.detail.formId));
              },
            ),
            "formatNumberRgx",
            function (t) {
              if (t) {
                var e = t.toString().split(".");
                return ((e[0] = e[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",")), e.join("."));
              }
              return t;
            },
          ),
          "closeTips",
          function () {
            this.setData({
              modalDisplay: !1,
            });
          },
        ),
        "NoticeDisplay",
        function () {
          ServicesIndex.readControl({
            noticeId: 7,
          }).then(function (t) {
            if (0 === t.code);
            else
              wx.showToast({
                title: t.msg || "",
                icon: "none",
              });
          });
        },
      ),
      "toUserTeac",
      function () {
        wx.navigateTo({
          url: "/packageB/pages/personal-center/use-teach/use-teach",
        });
      },
    ),
    "onPullDownRefresh",
    function () {
      var t = this;
      app.globalData.token
        ? (this.getMessage(),
          wx.showNavigationBarLoading(),
          this.getUserInfo().then(function () {
            (t.hasPower(), t.storeDetail());
            var e = t.data.userAuthList;
            (e["stat:summary:person"]
              ? 1 == t.data.currentRoleId
                ? t.countsDataPer()
                : t.countsData()
              : !e["stat:summary:person"] && e["stat:summary"] && t.countsData(),
              (t.data.personInfo.fullName = wx.getStorageSync("fullName") || ""),
              (t.data.personInfo.avatar = wx.getStorageSync("avatar") || ""),
              (t.data.personInfo.nickName = wx.getStorageSync("nickName") || ""),
              (t.data.personInfo.avatar = t.data.personInfo.avatar
                ? t.data.personInfo.avatar + "?imageView2/2/w/200"
                : ""),
              t.setData({
                personInfo: t.data.personInfo,
              }),
              wx.hideNavigationBarLoading(),
              wx.stopPullDownRefresh());
          }))
        : wx.stopPullDownRefresh();
    },
  )),
);
