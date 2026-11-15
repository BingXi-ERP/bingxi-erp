var t = require("@babel/runtime/helpers/interopRequireDefault").default,
  envConfig = t(require("./envConfig")),
  apiGateway = require("./libs/utils/apiGateway.js");
App({
  environment: "",
  envVersion: "release",
  appVersion: "2.6.1.20190824",
  config: {},
  tabBarActice: 0,
  type: "",
  changeType: "",
  searchId: "",
  contentData: [],
  chooseId: [],
  chooseName: "",
  customsPhoneNum: envConfig.default.contacts.customsPhoneNum,
  showStopPop: !1,
  userAuthList: {},
  statisticsCount: 0,
  client: "MP-Shop",
  AppUserAgent: "",
  areaCode: "",
  onLaunch: function (t) {
    (this.updateVersion(), this.initEnv(), this.getSystemInfo());
  },
  updateVersion: function () {
    if (wx.canIUse("getUpdateManager")) {
      var t = wx.getUpdateManager();
      (t.onCheckForUpdate(function (t) {
        t.hasUpdate &&
          wx.showToast({
            title: "即将有更新请留意",
          });
      }),
        t.onUpdateReady(function () {
          wx.showModal({
            title: "更新提示",
            showCancel: !1,
            content: "新版本已经准备好，请重启应用！",
            success: function (e) {
              e.confirm && t.applyUpdate();
            },
          });
        }));
    }
  },
  /**
   * 前台自检：本地有会话快照时回读 GET /api/v1/erp/auth/me 确认会话真伪，判定以回读为唯一准绳
   * 入参：无
   * 传给谁：libs/utils/apiGateway.js 的 verifySession 与 clearLoginState
   * 存什么：valid 时 verifySession 已刷新 bingxiSession 的 verifiedAt；invalid（401 与 403）时
   *   经 clearLoginState 清会话、令牌与用户档案缓存并回登录页；error（网络失败与 5xx）判据未知，
   *   保留既有快照不清退，只留可追踪的日志，不把抖动当掉线
   * 存哪里：wx.storage 与 app.globalData（落点在 apiGateway）
   */
  onShow: function () {
    if (!apiGateway.isLoggedIn()) return;
    apiGateway.verifySession().then(function (v) {
      if (v.state === "invalid") {
        apiGateway.clearLoginState();
        return;
      }
      if (v.state === "error") {
        console.log("会话回读未确认，保留本地快照：" + v.msg);
      }
    });
  },
  getSystemInfo: function () {
    var t = this;
    wx.getSystemInfo({
      success: function (e) {
        t.globalData.mobileInfo = e;
      },
    });
    var mta_analysis = "Client/".concat(this.client, ";");
    if (this.globalData.mobileInfo) {
      var envConfig = this.globalData.mobileInfo,
        o = envConfig.model,
        i = envConfig.system,
        a = envConfig.version;
      e = "Client/"
        .concat(this.client, ";Device/")
        .concat(o, ";OSver/")
        .concat(i, ";ClientVer/")
        .concat(a, ";");
    }
    this.AppUserAgent = mta_analysis;
  },
  initEnv: function () {
    var envPage =
      wx.getStorageSync("envPage") || envConfig.default.envPage;
    var target =
      envConfig.default.envList[envPage] ||
      envConfig.default.envList[envConfig.default.envPage];
    ((this.config = target),
      (this.appVersion = envConfig.default.appVersion),
      this.judgeConfig());
  },
  judgeConfig: function (t) {
    switch (this.config.rootHost) {
      case "https://tshop.duibu.cn":
        ((this.environment = "dev"), (this.envVersion = "trial"));
        break;
      case "https://tshop.duibu.cn":
        ((this.environment = "test"), (this.envVersion = "trial"));
        break;
      case "https://ushop.duibu.cn":
        ((this.environment = "uat"), (this.envVersion = "trial"));
        break;
      case "https://shop.duibu.cn":
        ((this.environment = "production"), (this.envVersion = "release"));
    }
  },
  onHide: function () {
    console.log("关闭");
  },
  globalData: {
    agreeCheck: "",
    userOpenIdFlag: "",
    statusBarHeight: 0,
    titleBarHeight: 0,
    isLoginPage: !1,
    userInfo: {},
    // 本地快照只说明曾通过回读，不等于本次会话仍成立；冷启动一律记 unverified，
    // 由 onShow 自检经 auth/me 回读改写为 valid 或 invalid（apiGateway 的两处写入）
    loginState: apiGateway.isLoggedIn() ? "unverified" : "none",
    logoutFlag: wx.getStorageSync("logoutFlag"),
    mpVersion: "3.2.8",
    categoriesList: [],
    mobileInfo: {},
    formIds: [],
    inChannel: "",
    subChannel: "",
    wxId: "",
  },
});
