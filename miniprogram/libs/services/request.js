/**
 * 请求层（bingxi-erp 会话版）
 * ---------------------------------------------------------------
 * 调用方：libs/services/*.js 各业务 service、libs/utils/checkToken.js、各页面
 * 入参：url、data、可选 { headers }
 * 传给谁：libs/utils/apiGateway.js 的契约层（CSRF 取用/轮换/串行），再由 apiGateway 调 wx.request
 * 存什么：不存任何凭据；会话与 CSRF 令牌由 apiGateway 统一落 wx.storage
 * 存哪里：无
 *
 * 分层规则：
 *   - 本文件只负责组装请求头、发一次 wx.request、把原始响应交给契约层归一化，并保证每条 Promise 恰好落定一次
 *   - 会话凭据是 httpOnly Cookie（backend/src/handlers/auth_handler.rs 的 LoginResponse 无 token 字段），
 *     由 wx.request 自动维护，本层不再读写 Authorization 头，也不再读 storage 里的 token
 *   - CSRF 一次性令牌的取用、轮换回填与 403 重放全部在 apiGateway.requestContract 内完成
 *   - 401 的"回读会话 -> 最多重发一次"排在契约层之外执行，避免在串行槽位里再排一次队
 */
var createClass = require("../../@babel/runtime/helpers/createClass"),
  classCallCheck = require("../../@babel/runtime/helpers/classCallCheck"),
  apiGateway = require("../utils/apiGateway.js"),
  checkToken = require("../utils/checkToken.js").checkToken,
  app = getApp();

var METHODS = ["GET", "POST", "_POST", "PUT", "DELETE"];

/** 每个方法的固有部分（登录态判定不再依赖这里的任何字段） */
function fixedHeaders(kind) {
  var h = {
    "App-User-Agent": app.AppUserAgent,
    terminalSource: 6,
    terminalSourceV2: 81,
  };
  if (kind === "GET" || kind === "DELETE")
    h["content-type"] = "application/x-www-form-urlencoded";
  else if (kind === "POST") h["content-type"] = "application/json";
  return h;
}

/** 传给 wx.request 的方法名：_POST 是历史命名，实际发 POST */
function wireMethod(kind) {
  return kind === "_POST" ? "POST" : kind;
}

var a = createClass(function e() {
  var i = this;
  classCallCheck(this, e);

  /**
   * 单次传输：发一条 wx.request 并落定一次
   * 入参 kind 本层方法名、url 请求地址、data 请求体、headers 已合并好的请求头
   * 传给谁：apiGateway.tagResponse 与 apiGateway.normalize（仅 bingxi 域名）
   * 存什么/存哪里：不落盘
   */
  this.transport = function (kind, url, data, headers) {
    return new Promise(function (resolve, reject) {
      wx.request({
        url: url,
        data: data,
        method: wireMethod(kind),
        header: headers,
        success: function (res) {
          var isBingxi = apiGateway.isBingxiUrl(url);
          if (isBingxi) apiGateway.tagResponse(res);
          var body = res.data;
          if (isBingxi && body) body = apiGateway.normalize(body, !0);
          if (res.statusCode === 500 || res.statusCode === 502) {
            wx.showToast({
              title: "服务器异常",
              icon: "none",
              duration: 3e3,
            });
          }
          if (body && typeof body === "object") {
            resolve(body);
            return;
          }
          resolve({
            code: res.statusCode,
            msg: "服务器异常",
            data: {},
          });
        },
        fail: function (err) {
          wx.hideLoading();
          wx.showToast({
            title: (err && err.errMsg) || "",
            icon: "none",
            duration: 3e3,
          });
          reject(err);
        },
      });
    });
  };

  METHODS.forEach(function (kind) {
    i[kind] = function (url, data) {
      var opts = arguments.length > 2 && void 0 !== arguments[2] ? arguments[2] : {};
      var headers = Object.assign(fixedHeaders(kind), opts.headers || {});
      return i.transport(kind, url, data, headers);
    };
  });

  /**
   * 失败外显：文案 + 会话失效时清会话并跳登录
   * 入参 res 归一化后的响应体（code 非 0）
   */
  this.onErrer = function (res) {
    wx.showToast({
      title: (res && res.msg) || "请求失败",
      icon: "none",
      duration: 3e3,
    });
    var code = res && res.code;
    if (code === 401 || code === 3001) {
      if (code === 401) apiGateway.clearSession();
      if (!(app.globalData && app.globalData.isLoginPage)) i.signLogin();
    }
  };

  this.signLogin = function () {
    wx.hideLoading();
    wx.reLaunch({
      url: "/pages/register/login/login",
      success: function () {
        if (app.globalData) app.globalData.isLoginPage = !0;
      },
    });
  };
});

/**
 * 契约包装：把 CSRF 一次性令牌与串行交给 apiGateway，把 401 的会话回读重发排在槽位之外
 * 入参 inst 请求层实例
 */
function attachContract(inst) {
  var raw = {};
  METHODS.forEach(function (kind) {
    raw[kind] = inst[kind];
  });
  METHODS.forEach(function (kind) {
    if (typeof raw[kind] !== "function") return;
    inst[kind] = function (url, data) {
      var opts = arguments.length > 2 && void 0 !== arguments[2] ? arguments[2] : {};
      var g = apiGateway.adapt(url, kind, data);
      var exec =
        g.isBingxi && typeof raw[g.method] === "function" ? g.method : kind;
      var send = function (contractHeaders) {
        return raw[exec].call(inst, g.url, g.data, {
          headers: Object.assign({}, opts.headers || {}, contractHeaders || {}),
        });
      };
      var spec = { url: g.url, method: g.method, send: send };
      return apiGateway
        .requestContract(spec)
        .then(function (res) {
          if (res && typeof res === "object" && res.code === 0) return res;
          if (g.isBingxi && res && typeof res === "object" && res.code === 401) {
            return checkToken
              .checkLogin()
              .then(function () {
                return apiGateway.requestContract(spec);
              })
              .catch(function () {
                return res;
              });
          }
          return res;
        })
        .then(function (res) {
          if (res && typeof res === "object" && res.code !== 0) inst.onErrer(res);
          return res;
        });
    };
  });
}

var __inst = new a();
attachContract(__inst);

module.exports = {
  request: __inst,
};
