/**
 * 登录态校验（bingxi-erp 会话版）
 * ---------------------------------------------------------------
 * 调用方：libs/services/request.js 在收到 401 时调 checkLogin()；各页面需要登录门禁处可调 checkLogin()
 * 入参：无（读 app.config.bingxiHost 与 wx.storage 中的会话快照）
 * 传给谁：apiGateway.verifySession() —— 内部发 GET /api/v1/erp/users/me 并按回读结果判登录态
 * 存什么：会话成立与否由 apiGateway 写 bingxiSession；本文件只负责在会话不成立时清登录标记与用户档案缓存
 * 存哪里：wx.storage、app.globalData
 *
 * 判据口径（backend/src/handlers/auth_handler.rs 的 LoginResponse 无 token 字段，凭据只在 httpOnly Cookie）：
 *   valid   —— users/me 回读 200，会话成立
 *   denied  —— users/me 回读 403，permission.rs 的 users:read 面拒绝，但 auth.rs 已放行，会话同样成立
 *   invalid —— users/me 回读 401（auth.rs 的"缺少认证凭据/令牌无效"），会话不成立，清标记并跳登录页
 *   error   —— 网络失败或 5xx，判据未知：不清会话，避免把抖动当掉线；调用方自行决定重试
 * 本文件不再读写任何 token 存储键：JS 侧不持有凭据，写空 token 冒充登录态会让所有门禁恒判未登录
 */
var createClass = require("../../@babel/runtime/helpers/createClass"),
  classCallCheck = require("../../@babel/runtime/helpers/classCallCheck"),
  apiGateway = require("./apiGateway.js"),
  app = getApp();

/** 会话不成立时需要一并作废的用户档案缓存键 */
var PROFILE_KEYS = [
  "id",
  "nickName",
  "mobile",
  "myShopId",
  "resCodeList",
  "userType",
  "avatar",
  "fullName",
  "wxId",
  "wxOpenId",
];

var n = createClass(function e() {
  var self = this;
  classCallCheck(this, e);

  /** 回读后端确认会话；resolve 表示已登录，reject 表示需要重新登录 */
  this.checkLogin = function () {
    return apiGateway.verifySession().then(function (v) {
      wx.hideLoading();
      if (v.state === "valid" || v.state === "denied") return v;
      if (v.state === "error") return Promise.reject(v);
      self.clearLoginFlag();
      return Promise.reject(v);
    });
  };

  /**
   * 登录门的唯一入口：判据以后端回读为准，本地键存在不等于已登录
   * 入参：无
   * 传给谁：libs/utils/isVisitor.js 的登录门禁（各页面与组件经它消费本方法）
   * 存什么：会话确认成立时由 apiGateway.verifySession 刷新 bingxiSession 的 verifiedAt；
   *   会话不成立（401）时由 checkLogin -> clearLoginFlag 清会话、令牌与用户档案缓存
   * 存哪里：wx.storage、app.globalData
   *
   * 判定分支（与 backend/src/routes/iam.rs 的 /users/me 与 middleware_bootstrap.rs 的层序同源）：
   *   resolve                    —— 本地有会话快照且回读 200（valid）或 403（denied，
   *                                 auth.rs 已放行、permission.rs 的 users:read 面拒绝，会话成立）
   *   reject { state: "none" }    —— 本地无会话快照：同步判未登录，不发请求
   *   reject { state: "invalid" } —— 回读 401：会话不成立，本方法内部已清档案并 reLaunch 登录页
   *   reject { state: "error" }   —— 网络失败或 5xx：判据未知，保留既有快照，不据此登出
   */
  this.requireLogin = function () {
    if (!apiGateway.isLoggedIn())
      return Promise.reject({ state: "none", status: 0, msg: "本地无会话快照" });
    return self.checkLogin();
  };

  /** 作废本地登录痕迹并回到登录页 */
  this.clearLoginFlag = function () {
    wx.setStorageSync("logoutFlag", 1);
    apiGateway.clearSession();
    for (var i = 0; i < PROFILE_KEYS.length; i++)
      wx.removeStorageSync(PROFILE_KEYS[i]);
    app.userAuthList = [];
    app.statisticsCount = 0;
    app.globalData = {
      agreeCheck: "",
      userOpenIdFlag: "",
      statusBarHeight: 0,
      titleBarHeight: 0,
      isLoginPage: app.globalData ? app.globalData.isLoginPage : !1,
      userInfo: {},
      loginState: "invalid",
      logoutFlag: 1,
      mpVersion: "3.2.8",
      categoriesList: [],
      mobileInfo: {},
      formIds: [],
      inChannel: "",
      subChannel: "",
      wxId: "",
    };
    if (!(app.globalData && app.globalData.isLoginPage)) {
      wx.reLaunch({
        url: "/pages/register/login/login",
        success: function () {
          app.globalData.isLoginPage = !0;
        },
      });
    }
  };
});

module.exports = {
  checkToken: new n(),
};
