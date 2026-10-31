/**
 * packageB 登录链（bingxi-erp 会话版）
 * ---------------------------------------------------------------
 * 调用方：packageB 的 bind-phone、authSetting、release-cargo-pass 等页面
 * 入参：各登录入口的账号凭据（手机号与验证码 / 微信授权结果 / 子账号登录参数）
 * 传给谁：packageB/libs/services/ServicesUser.js 的 login2 -> libs/utils/apiGateway.js 的 adaptLogin 归一化，
 *   再由 verifySession 回读 GET /api/v1/erp/users/me 确认会话
 * 存什么：用户档案（id、nickName、mobile、avatar、fullName、resCodeList、userType）与一次性 CSRF 令牌、
 *   会话快照 bingxiSession
 * 存哪里：wx.storage
 *
 * 不再写 storage 的 token / loginToken：后端登录出参（backend/src/handlers/auth_handler.rs 的
 * LoginResponse）只有 csrf_token、user、permissions、password_expired，凭据在 httpOnly Cookie 里
 */
var e = require("../../../@babel/runtime/helpers/interopRequireDefault").default,
  createClass = require("../../../@babel/runtime/helpers/createClass"),
  classCallCheck = require("../../../@babel/runtime/helpers/classCallCheck"),
  o = (require("../services/ServicesSubscription"), e(require("./getWxInfo")), getApp()),
  ServicesUser = require("../services/ServicesUser.js").servicesUser,
  apiGateway = require("../../../libs/utils/apiGateway.js"),
  util = require("./util.js").utils;

/**
 * 归一登录出参并在后端会话回读通过后才落登录态
 * 入参 raw ServicesUser.login2 的原始响应体
 * 传给谁：登录入口的 Promise（页面按 code === 0 判定）
 * 存什么：会话有效时落用户档案与会话快照；无效时清会话与一次性令牌
 * 存哪里：wx.storage
 */
function finishLogin(raw) {
  var res = apiGateway.adaptLogin(raw, !0);
  if (res.code !== 0) {
    wx.showToast({
      title: res.msg || "登录失败",
      icon: "none",
      duration: 4e3,
    });
    return Promise.resolve(res);
  }
  return apiGateway.verifySession().then(function (v) {
    if (v.state === "valid" || v.state === "denied") return res;
    apiGateway.clearSession();
    return {
      code: 401,
      msg:
        v.msg ||
        (v.state === "invalid" ? "登录状态校验失败，请重新登录" : "网络异常，请稍后重试"),
      data: {},
    };
  });
}

var r = createClass(function e() {
  var t = this;
  (classCallCheck(this, e),
    (this.loginByMobile = function (mobile, code) {
      var d = {
        fromUserId: wx.getStorageSync("fromUserId") || "",
        shopId: wx.getStorageSync("shopId") || "",
        goodsId: wx.getStorageSync("goodsId") || "",
        mpVersion: o.globalData.mpVersion,
        mobile: mobile,
        code: code,
        wxId: o.globalData.wxId,
      };
      return ServicesUser.login2(d).then(finishLogin);
    }),
    (this.loginByWX = function (wxCode, res) {
      if ("getUserInfo:ok" != res.detail.errMsg) {
        wx.showToast({
          title: "授权失败",
          icon: "none",
        });
        return Promise.resolve();
      }
      var d = {
        code: wxCode,
        wxCode: wxCode,
        unionId: res.detail.encryptedData,
        miniAppPhoneKey: res.detail.code,
        iv: res.detail.iv,
        wxId: o.globalData.wxId,
      };
      return ServicesUser.login2(d).then(finishLogin);
    }),
    (this.loginByLoginToken = function (payload) {
      return ServicesUser.login2(payload).then(finishLogin);
    }),
    (this.getUserInfo = function (profileOnly) {
      return ServicesUser.getUserInfo({}).then(function (res) {
        if (!res || res.code !== 0) {
          wx.showToast({
            title: (res && res.msg) || "请求失败",
            icon: "none",
          });
          return res;
        }
        var u = res.data || {};
        o.globalData.userInfo = u;
        if (profileOnly) {
          if (u.permissions) wx.setStorageSync("resCodeList", u.permissions);
          return res;
        }
        wx.setStorageSync("id", u.id);
        wx.setStorageSync("myShopId", u.companyId || u.department_id || "");
        wx.setStorageSync("nickName", u.username || u.nickName || "");
        wx.setStorageSync("mobile", u.phone || "");
        wx.setStorageSync("avatar", u.avatar || util.addDefaultAvatar());
        wx.setStorageSync("fullName", u.real_name || u.fullName || "");
        // users/me 出参不含权限码，权限只在登录响应与 auth/me 里下发，缺失时不覆盖已落盘的 resCodeList
        if (u.permissions) wx.setStorageSync("resCodeList", u.permissions);
        wx.setStorageSync("userType", u.type);
        return res;
      });
    }));
});

module.exports = {
  login: new r(),
};
