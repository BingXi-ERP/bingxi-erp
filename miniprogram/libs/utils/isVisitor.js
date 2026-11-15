/**
 * 登录门禁（bingxi-erp 会话版）
 * ---------------------------------------------------------------
 * 调用方：components/tab-bar、pages/index、pages/demand-square、pages/personal-center、
 *   packageA/components/color-btn、packageB/components/color-btn、
 *   packageB/pages/personal-center/device-connection（经 packageB/libs/utils/isVisitor.js 转手）
 * 入参：无
 * 传给谁：libs/utils/checkToken.js 的 requireLogin() —— 本地无会话快照直接判未登录（不发请求），
 *   本地有会话快照仍要回读 GET /api/v1/erp/auth/me 确认才算已登录
 * 存什么 / 存哪里：本文件不落任何数据；会话快照与一次性令牌由 apiGateway 读写 wx.storage
 *
 * 结算契约（消费方共 25 处一律写成 isVisitor.default.isVisitor().then(cb) 且都没有 catch 分支，
 * 这里刻意保持"未登录就不落定"的既有形状，改成 reject 会让这 25 处同时冒出未处理的 Promise 拒绝）：
 *   已登录        —— resolve()，调用方回调照常执行
 *   本地无快照    —— 弹「登录提示」，确认后跳登录页；本 Promise 不落定，调用方回调不执行
 *   回读 401 或 403 —— requireLogin 内部已清会话与档案并 reLaunch 登录页，本文件不再重复提示；不落定
 *   网络失败或 5xx —— 判据未知：提示「网络异常，请稍后重试」，不清会话、不跳登录；不落定
 *
 * 退场口径：本文件历史实现用 wx.getStorageSync("token") 当门。后端登录出参没有 token 字段
 * （backend/src/handlers/auth_handler.rs 的 LoginResponse 只有 csrf_token、user、permissions、
 * password_expired，凭据走 httpOnly Cookie），全仓已无任何一处写这枚键，
 * 拿它当门等于恒判未登录：所有需要登录的入口对已登录用户也一律弹「前往登录」。
 * 同理退场的是原实现开头那条 `app.userAuthList, app.globalData.userInfo.type` 的逗号表达式，
 * 它求值后被丢弃，既不参与判定也从未写过 userInfo.type，留着只会让人误以为有档案判定。
 */
Object.defineProperty(exports, "__esModule", {
  value: !0,
});
exports.default = void 0;

var checkToken = require("./checkToken.js").checkToken;

/**
 * 判定当前会话是否成立；成立才让调用方的后续动作执行
 * 入参：无
 * 传给谁：各页面与组件的登录门禁调用点
 * 存什么 / 存哪里：不落盘，只经 checkToken.requireLogin 读写会话
 */
function isVisitor() {
  return new Promise(function (resolve) {
    checkToken.requireLogin().then(
      function () {
        resolve();
      },
      function (v) {
        var state = (v && v.state) || "none";
        if (state === "error") {
          wx.showToast({
            title: "网络异常，请稍后重试",
            icon: "none",
            duration: 3e3,
          });
          return;
        }
        if (state === "invalid") return;
        wx.showModal({
          title: "登录提示",
          confirmText: "登录",
          content: "此功能需登录后使用，是否立即前往登录？",
          success: function (r) {
            r.confirm &&
              wx.navigateTo({
                url: "/pages/register/login/login",
              });
          },
          fail: function () {},
        });
      },
    );
  });
}

exports.default = {
  isVisitor: isVisitor,
};
