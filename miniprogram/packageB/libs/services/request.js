/**
 * packageB 请求层（bingxi-erp 会话版）
 * ---------------------------------------------------------------
 * 调用方：packageB/libs/services/*.js 与 packageB 各页面
 * 入参：url、data、可选 { headers }
 * 传给谁：libs/utils/apiGateway.js 的契约层（CSRF 取用/轮换/串行），再由 apiGateway 调 wx.request
 * 存什么：不存任何凭据；会话与 CSRF 令牌由 apiGateway 统一落 wx.storage
 * 存哪里：无
 *
 * 与主包 libs/services/request.js 同构：会话凭据是后端写入的 httpOnly Cookie，由 wx.request 自动维护，
 * 本层不发 Authorization 头；每条 Promise 恰好落定一次（历史版本里 GET 失败只 reject、
 * POST/_POST/PUT/DELETE 失败既不 resolve 也不 reject，调用方会永远等下去）
 */
var createClass = require("../../../@babel/runtime/helpers/createClass"),
  classCallCheck = require("../../../@babel/runtime/helpers/classCallCheck"),
  apiGateway = require("../../../libs/utils/apiGateway.js"),
  checkToken = require("../utils/checkToken.js").checkToken,
  app = getApp();

var METHODS = ["GET", "POST", "_POST", "PUT", "DELETE"];

function fixedHeaders(kind) {
  var h = {
    "App-User-Agent": app.AppUserAgent,
    terminalSource: 6,
  };
  if (kind === "GET" || kind === "DELETE")
    h["content-type"] = "application/x-www-form-urlencoded";
  else if (kind === "POST") h["content-type"] = "application/json";
  return h;
}

function wireMethod(kind) {
  return kind === "_POST" ? "POST" : kind;
}

var a = createClass(function e() {
  var i = this;
  classCallCheck(this, e);

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
