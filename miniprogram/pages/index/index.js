var t,
  e,
  a = require("../../@babel/runtime/helpers/interopRequireDefault").default,
  n = require("../../@babel/runtime/helpers/defineProperty"),
  o = require("../../@babel/runtime/helpers/regeneratorRuntime"),
  s = require("../../@babel/runtime/helpers/asyncToGenerator"),
  mta_analysis = a(require("../../utils/mta_analysis")),
  formatRichText = require("../../utils/formatRichText.js"),
  global = require("../../libs/services/global"),
  request = require("../../libs/services/request.js").request,
  apiGateway = require("../../libs/utils/apiGateway.js"),
  uploadGateway = require("../../libs/utils/uploadGateway.js"),
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
    /**
     * 首页以图搜索的图片上传
     * 调用方：本页 wxml 的拍照搜布入口
     * 入参：wx.chooseMedia 选中的临时文件清单
     * 传给谁：libs/utils/uploadGateway.js 的 upload（内部由 libs/utils/apiGateway.js 的
     *   requestContract 发出并归一化），不再直发 wx.uploadFile 也不自拼 Authorization 头——
     *   后端凭据是 httpOnly Cookie（backend/src/middleware/auth.rs 的优先级
     *   access_token Cookie 到 jwt Cookie 到 Authorization 头），JS 侧 storage 里从来没有 token，
     *   那条头永远为空并被 auth.rs 判"无效的认证头格式"，属凭据冒充登录态
     * 存什么/存哪里：只把返回的相对地址并入本页 remoteImageFiles，不落任何凭据键
     * 待拍板一条：旧路径 /app-api/oss/upload 在本仓权威面
     *   frontend/scripts/route-snapshot.txt（1821 条）内没有等价的对象存储上传端点
     *   （multipart 腿只有 user/avatar 与 supplier 资质附件 与 system-update/upload 与 data-import），
     *   原样保留并登记，禁止改成会 404 的假接入
     */
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
              uploadGateway
                .upload({
                  header: {
                    terminalSource: 6,
                    terminalType: 81,
                  },
                  formData: {
                    type: 1,
                  },
                  url: "".concat(app.config.bingxiHost, "/app-api/oss/upload"),
                  filePath: n.tempFilePath,
                  name: "file",
                })
                .then(function (o) {
                  if (o && 0 === o.code) {
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
                    401 === (o && o.code)
                      ? wx.showToast({
                          icon: "none",
                          title: "会话失效,请重新登录",
                        })
                      : wx.showToast({
                          icon: "none",
                          title: (o && o.msg) || "上传图片失败",
                        });
                  (t.getWidth(),
                    (a += 1) &&
                      a === e.tempFiles.length &&
                      setTimeout(function () {
                        wx.hideLoading();
                      }, 500));
                }, function () {
                  wx.showToast({
                    icon: "none",
                    title: "上传图片失败",
                  });
                  (t.getWidth(),
                    (a += 1) &&
                      a === e.tempFiles.length &&
                      setTimeout(function () {
                        wx.hideLoading();
                      }, 500));
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
    /**
     * 记录渠道落地访问
     * 调用方：本页 onShow 在统计次数为零时
     * 入参：t 页面启动参数，取 c 与 sc 两枚渠道码
     * 传给谁：ServicesUser.getChannel 即 POST /api/v1/erp/page-view（快照:1351 track_page_view）
     * 存什么/存哪里：不落盘
     * 凭据一条：原载荷里带 token: wx.getStorageSync("token")，
     *   而 PageViewRequest（backend/src/handlers/tracking_handler.rs:34 到 46）的入参只有
     *   path 与 timestamp 与 session_id 与 referrer 与 user_agent 与 ip_address，没有 token，
     *   且后端凭据是 httpOnly Cookie，JS 侧从来没有 token，所以这条参数既非契约所需又永远为空，
     *   按"不需要就删掉该参数而不是传空串"退场。
     * 待拍板一条：PageViewRequest 必填 path 与 timestamp，本处传的 channel 与 subChannel 与
     *   wxCode 三枚都不在其入参内，等于这腿必 400；渠道归因能力在本仓没有承载面，
     *   不改成像（不拿 path 拼一条假访问），登记待拍板清单
     */
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
        };
        ServicesUser.getChannel(o);
      }
    },
    toLogin: function () {
      wx.reLaunch({
        url: "/pages/register/login/login",
      });
    },
    /**
     * 首页加载：只有会话成立才拉档案与消息与广告
     * 判据由 wx.getStorageSync("token") 换成 apiGateway.isLoggedIn()：
     *   后端登录出参没有 token 字段（backend/src/handlers/auth_handler.rs 的 LoginResponse
     *   只有 csrf_token 与 user 与 permissions 与 password_expired），storage 的 token 永远为空，
     *   拿它当门等于恒判未登录，首页整块内容永不加载，属凭据冒充登录态；
     *   isLoggedIn() 读的是 users/me 回读确认后写入的会话快照 bingxiSession，是真判据。
     *   会话过期由传输层在收到 401 时经 checkToken.checkLogin() 回读复核并跳登录页。
     */
    onLoad: async function (e) {
      if (apiGateway.isLoggedIn()) {
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
    /** 同 onLoad：登录门改为会话快照判据，不再读永为空的 storage token */
    onShow: function () {
      var t = this,
        e = this;
      (apiGateway.isLoggedIn() &&
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
          apiGateway.isLoggedIn() && ServicesUserLog.servicesUserLog.setUserHandleLog(600),
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
            url: "/packageB/pages/color-card-management/color-card-management",
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
    /**
     * 上报订阅消息 formId
     * 调用方：本页表单 submit 后取到 formId 时
     * 入参：无（读本页 data.formId 与 wx.login 的 code）
     * 传给谁：libs/services/request.js 的传输层，再由 libs/utils/apiGateway.js 的 requestContract
     *   发出；地址仍由 libs/services/global.js 的 saveFormId 给出
     * 存什么/存哪里：不落盘
     * 三处退场：一 不再把 storage 的 token 放进请求体（后端凭据是 httpOnly Cookie，
     *   JS 侧从来没有 token，传过去必为空）；二 不再自拼 Authorization 头；
     *   三 不再写空的 success 回调把失败静默吞掉，失败一律经传输层外显
     * 待拍板一条：旧路径 /app-api/pubMsg/saveFormId 仓内无等价端点，原样保留并登记
     */
    getformId: function () {
      var t = this,
        e = (0, global.saveFormId)();
      wx.login({
        success: function (a) {
          var n = {
            formId: t.data.formId,
            code: a.code,
          };
          request.POST(e, n, {
            headers: {
              "content-type": "application/x-www-form-urlencoded",
              terminalSource: 6,
              terminalType: 81,
            },
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
