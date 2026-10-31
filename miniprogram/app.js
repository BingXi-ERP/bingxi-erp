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
  customsPhoneNum: "13727172916",
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
  onShow: function () {
    apiGateway.isLoggedIn() && apiGateway.verifySession();
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
    loginState: apiGateway.isLoggedIn() ? "valid" : "none",
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
