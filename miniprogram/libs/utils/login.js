/**
 * 登录链（bingxi-erp 会话版）
 * ---------------------------------------------------------------
 * 调用方：pages/register/login/login.js、pages/register/login/wxLogin/index.js、
 *   pages/register/verifyCode/verifyCode.js、packageB 的 professer-category 与 submission 页
 * 入参：各登录入口的账号凭据（用户名密码 / 短信码 / 微信授权码）
 * 传给谁：ServicesUser.login2 -> libs/utils/apiGateway.js 的 adaptLogin 归一化，再由 verifySession 回读会话
 * 存什么：用户档案（id、myShopId、nickName、mobile、avatar、fullName、resCodeList、userType）与
 *   一次性 CSRF 令牌；登录态本身由 apiGateway 写 bingxiSession 会话快照
 * 存哪里：wx.storage
 *
 * 登录成功判据：后端登录返回码 0 且 GET /api/v1/erp/users/me 回读通过（valid 或 denied）
 * 本文件不再写 storage 的 token / loginToken：backend/src/handlers/auth_handler.rs 的 LoginResponse
 * 只有 csrf_token、user、permissions、password_expired，凭据在 httpOnly Cookie 里，JS 侧取不到也没有
 */
var e = require("../../@babel/runtime/helpers/interopRequireDefault").default,
  createClass = require("../../@babel/runtime/helpers/createClass"),
  classCallCheck = require("../../@babel/runtime/helpers/classCallCheck"),
  o = (require("../services/ServicesSubscription"), e(require("./getWxInfo")), getApp()),
  ServicesUser = require("../services/ServicesUser.js").servicesUser,
  apiGateway = require("./apiGateway.js"),
  util = require("./util.js").utils;

/**
 * 缓存登录出参里的用户档案
 * 入参 user adaptLogin 归一后的小程序用户形状
 * 传给谁：wx.storage 与 app.globalData.userInfo
 * 存什么：展示与权限判断要读的档案键
 * 存哪里：wx.storage
 */
function cacheProfile(user) {
  wx.setStorageSync("id", user.id);
  wx.setStorageSync("myShopId", user.companyId);
  wx.setStorageSync("nickName", user.nickName);
  wx.setStorageSync("mobile", user.phone);
  wx.setStorageSync("avatar", user.avatar || util.addDefaultAvatar());
  wx.setStorageSync("fullName", user.fullName);
  wx.setStorageSync("resCodeList", user.perms);
  wx.setStorageSync("userType", 2);
  o.globalData.userInfo = user;
  wx.getSystemInfo({
    success: function (res) {
      o.globalData.mobileInfo = res;
    },
  });
}

/**
 * 登录出参收尾：后端返回码为 0 后立刻回读 users/me 确认会话，确认通过才落登录态
 * 入参 res adaptLogin 的归一结果
 * 传给谁：登录入口的 Promise（页面按 code === 0 决定是否跳首页）
 * 存什么：会话有效时落用户档案；会话不成立时清会话与一次性令牌
 * 存哪里：wx.storage
 */
function finishLogin(res) {
  if (!res || res.code !== 0) return Promise.resolve(res);
  return apiGateway.verifySession().then(function (v) {
    if (v.state === "valid" || v.state === "denied") {
      cacheProfile(res.data.user);
      return res;
    }
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

var s = createClass(function e() {
  var t = this;
  (classCallCheck(this, e),
    (this.loginByMobile = function (username, password, loginType) {
      var i = {
        fromUserId: wx.getStorageSync("fromUserId") || "",
        shopId: wx.getStorageSync("shopId") || "",
        goodsId: wx.getStorageSync("goodsId") || "",
        mpVersion: o.globalData.mpVersion,
        loginType: loginType,
        username: username,
        wxId: o.globalData.wxId,
      };
      i[2 === loginType ? "code" : "password"] = password;
      return ServicesUser.login2(i).then(finishLogin);
    }),
    (this.loginByWX = function (wxCode, userInfo) {
      var c = {
        wxCode: wxCode,
        miniAppPhoneKey: userInfo.phoneKey,
        unionId: userInfo.encryptedData,
        iv: userInfo.iv,
        loginType: 3,
        wxLoginType: 1,
        channelMobile: "",
        channel: "",
        subChannel: "",
      };
      return ServicesUser.login2(c).then(finishLogin);
    }),
    (this.loginByWX2 = function (wxCode, userInfo) {
      var code = arguments.length > 2 && void 0 !== arguments[2] ? arguments[2] : "",
        username = arguments.length > 3 && void 0 !== arguments[3] ? arguments[3] : "";
      if ("getUserProfile:ok" != userInfo.errMsg) {
        wx.showToast({
          title: "授权失败",
          icon: "none",
          duration: 3e3,
        });
        return Promise.resolve();
      }
      var g = {
        code: code,
        username: username,
        wxCode: wxCode,
        unionId: userInfo.encryptedData,
        iv: userInfo.iv,
        wxId: o.globalData.wxId,
        miniAppPhoneKey: userInfo.code,
        wxMiniUserInfo: userInfo.rawData,
        loginType: 3,
        wxLoginType: 2,
      };
      return ServicesUser.login2(g).then(finishLogin);
    }),
    (this.loginByLoginToken = function (payload) {
      return ServicesUser.login2(payload).then(finishLogin);
    }),
    (this.getUserInfo = function (profileOnly) {
      return new Promise(function (t, a) {
        ServicesUser.getUserInfo({})
          .then(function (res) {
            if (res && res.code === 0) {
              var u = res.data || {};
              // users/me 出参是 UserResponse（id/username/real_name/avatar/phone/department_name/role_names），
              // 不含权限码；权限只在登录响应与 auth/me 里下发，这里缺失就不覆盖已落盘的 resCodeList
              if (u.permissions) {
                wx.setStorageSync("resCodeList", u.permissions);
                o.userAuthList = util.getResList(u.permissions);
              }
              o.globalData.userInfo = u;
              if (!profileOnly) {
                wx.setStorageSync("id", u.id);
                wx.setStorageSync("nickName", u.username || u.nickName || "");
                wx.setStorageSync("fullName", u.real_name || u.fullName || "");
                wx.setStorageSync("mobile", u.phone || "");
                wx.setStorageSync("avatar", u.avatar || util.addDefaultAvatar());
                wx.setStorageSync("myShopId", u.companyId || u.department_id || "");
                wx.setStorageSync("userType", u.type);
              }
              t(res);
              return;
            }
            wx.showToast({
              title: res && res.msg ? res.msg : "请求失败",
              icon: "none",
              duration: 4e3,
            });
            t(res);
          })
          .catch(function (err) {
            a(err);
          });
      });
    }));
});

module.exports = {
  login: new s(),
};
