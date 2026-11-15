/**
 * packageB 登录链（bingxi-erp 会话版）
 * ---------------------------------------------------------------
 * 调用方：packageB 的 bind-phone、authSetting、release-cargo-pass 等页面
 * 入参：各登录入口的账号凭据（手机号与验证码 / 微信授权结果 / 子账号登录参数）
 * 传给谁：packageB/libs/services/ServicesUser.js 的 login2 -> libs/utils/apiGateway.js 的 adaptLogin 归一化，
 *   再由 verifySession 回读 GET /api/v1/erp/auth/me 确认会话（快照:230，只产出
 *   valid invalid error 三态；历史上针对 /users/me 403 权限面拒绝的 denied 态已随端点切换退场）
 * 存什么：用户档案（id、nickName、mobile、avatar、fullName、resCodeList、userType）与一次性 CSRF 令牌、
 *   会话快照 bingxiSession
 * 存哪里：wx.storage
 *
 * 不再写 storage 的 token / loginToken：后端登录出参（backend/src/handlers/auth_handler.rs 的
 * LoginResponse）只有 csrf_token、user、permissions、password_expired，凭据在 httpOnly Cookie 里
 *
 * 已退场的 loginByLoginToken 入口：原写法把注册接口返回的 loginToken 塞进 POST /api/v1/erp/auth/login
 * 请求体做"注册后免密登录"。后端 LoginRequest 只有 username（必填 3 到 50）与 password（必填 6 到 128）
 * 与可选 totp_token 与 recovery_code（backend/src/handlers/auth_handler.rs 的 LoginRequest），
 * 没有 loginToken 字段，也没有任何签发它的端点，所以那条腿必 400，属假接入；
 * 调用方 packageB/pages/register/professer-category/professer-category.js 改为走应用已有的
 * "请重新登录"回登录页分支，免密登录能力记入待拍板清单。
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
 * 入参 raw ServicesUser.login2 的返回值（该方法内部已经过 apiGateway.adaptLogin，此处不再二次归一）
 * 传给谁：登录入口的 Promise（页面按 code === 0 判定）
 * 存什么：会话有效时由 login2 落的用户档案与会话快照保持不变；无效时清会话与一次性令牌
 * 存哪里：wx.storage
 */
function finishLogin(res) {
  if (!res || res.code !== 0) {
    wx.showToast({
      title: (res && res.msg) || "登录失败",
      icon: "none",
      duration: 4e3,
    });
    return Promise.resolve(res);
  }
  return apiGateway.verifySession().then(function (v) {
    if (v.state === "valid") return res;
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
        // 取值键与 auth/me 出参 UserInfo 逐键对表（backend/src/handlers/auth_handler.rs）：
        // 原写法 u.companyId 与 u.type 不在出参里恒取不到，u.department_id 兜店铺是字段挪用；
        // myShopId 写空保读方现状，userType 停写（storage 键无真值读方，登记需后端补字段）
        wx.setStorageSync("id", u.id);
        wx.setStorageSync("myShopId", "");
        wx.setStorageSync("nickName", u.username || "");
        wx.setStorageSync("mobile", u.phone || "");
        wx.setStorageSync("avatar", u.avatar || util.addDefaultAvatar());
        wx.setStorageSync("fullName", u.real_name || u.username || "");
        // auth/me 出参是 UserInfo（backend/src/handlers/auth_handler.rs），带 permissions，
        // 缺失时不覆盖已落盘的 resCodeList；real_name 与 avatar 当前恒为 None（需后端补字段）
        if (u.permissions) wx.setStorageSync("resCodeList", u.permissions);
        return res;
      });
    }));
});

module.exports = {
  login: new r(),
};
