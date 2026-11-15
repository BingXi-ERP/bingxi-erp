/**
 * 登录态校验（bingxi-erp 会话版）
 * ---------------------------------------------------------------
 * 调用方：libs/services/request.js 在收到 401 时调 checkLogin()；各页面需要登录门禁处可调 checkLogin()
 * 入参：无（读 app.config.bingxiHost 与 wx.storage 中的会话快照）
 * 传给谁：apiGateway.verifySession() —— 内部发 GET /api/v1/erp/auth/me 并按回读结果判登录态
 * 存什么：会话成立与否由 apiGateway 写 bingxiSession；本文件只负责在会话不成立时经
 *   apiGateway.clearLoginState 统一清会话、令牌、用户档案缓存并回登录页
 * 存哪里：wx.storage、app.globalData（清退动作落点在 apiGateway，本文件不再自持一份键清单）
 *
 * 判据口径（backend/src/handlers/auth_handler.rs 的 LoginResponse 无 token 字段，凭据只在 httpOnly Cookie）：
 *   valid   —— auth/me 回读 200，会话成立
 *   invalid —— auth/me 回读 401 或 403，会话不被承认，清标记并跳登录页
 *   error   —— 网络失败或 5xx，判据未知：不清会话，避免把抖动当掉线；调用方自行决定重试
 * 端点取自 backend/src/middleware/public_routes.rs 的 AUTH_ONLY_PATHS：auth/me 仅需 JWT 认证、免 RBAC，
 * 所以 403 在这里不再可能是权限面拒绝，出现即会话本身不成立；本文件不再有把 403 当已登录的分支。
 * 本文件不再读写任何 token 存储键：JS 侧不持有凭据，写空 token 冒充登录态会让所有门禁恒判未登录
 */
var createClass = require("../../@babel/runtime/helpers/createClass"),
  classCallCheck = require("../../@babel/runtime/helpers/classCallCheck"),
  apiGateway = require("./apiGateway.js");

var n = createClass(function e() {
  var self = this;
  classCallCheck(this, e);

  /** 回读后端确认会话；resolve 表示已登录，reject 表示需要重新登录 */
  this.checkLogin = function () {
    return apiGateway.verifySession().then(function (v) {
      wx.hideLoading();
      if (v.state === "valid") return v;
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
   *   会话不成立（401 与 403）时由 checkLogin -> clearLoginFlag 清会话、令牌与用户档案缓存
   * 存哪里：wx.storage、app.globalData
   *
   * 判定分支（与 backend/src/routes/auth.rs 挂载的 /auth/me 及 backend/src/middleware/permission.rs
   * 的认证豁免短路同源，该端点免 RBAC，故权限面 403 不在此出现）：
   *   resolve                    —— 本地有会话快照且回读 200（valid）
   *   reject { state: "none" }    —— 本地无会话快照：同步判未登录，不发请求
   *   reject { state: "invalid" } —— 回读 401 或 403：会话不被承认，本方法内部已清档案并 reLaunch 登录页
   *   reject { state: "error" }   —— 网络失败或 5xx：判据未知，保留既有快照，不据此登出
   */
  this.requireLogin = function () {
    if (!apiGateway.isLoggedIn())
      return Promise.reject({ state: "none", status: 0, msg: "本地无会话快照" });
    return self.checkLogin();
  };

  /**
   * 作废本地登录痕迹并回到登录页
   * 入参：无
   * 传给谁：本文件 checkLogin 的 invalid 分支；需要主动登出回到登录页的调用点
   * 存什么 / 存哪里：清退动作全部落点在 apiGateway.clearLoginState（会话、令牌、用户档案缓存键、
   *   logoutFlag 与 globalData 重建与 reLaunch），本文件只保留入口形状，不再自持第二份清退实现
   */
  this.clearLoginFlag = function () {
    apiGateway.clearLoginState();
  };
});

module.exports = {
  checkToken: new n(),
};
