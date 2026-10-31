/**
 * bingxi-erp 契约层 v5（会话凭据版）
 * ---------------------------------------------------------------
 * 调用方：libs/services/request.js、packageA/services/request.js、packageB/libs/services/request.js、
 *   libs/services/ServicesUser.js、libs/utils/login.js、三份 checkToken.js、app.js、登录页
 * 入参：wx.request 的 url / method / data 与原始响应对象
 * 传给谁：归一化响应体回给发起请求的业务 service；会话快照与 CSRF 令牌写 wx.storage
 * 存什么：bingxiCsrf（后端签发的一次性 CSRF 令牌）、bingxiSession（后端回读确认的会话快照）
 * 存哪里：wx.storage
 *
 * 契约依据（本仓后端原文，非框架惯例）：
 *   1. backend/src/handlers/auth_handler.rs 的 LoginResponse 只有 csrf_token / user /
 *      permissions / password_expired 四枚字段；access_token 与 refresh_token 走 httpOnly
 *      Cookie，响应体里永远没有 token。
 *   2. backend/src/middleware/auth.rs 凭据优先级为 access_token Cookie > 旧版 jwt Cookie >
 *      Authorization 头（且只接受带 "Bearer " 前缀的形式）。httpOnly Cookie 对小程序 JS 不可读，
 *      会话完全由 wx.request 自动维护的 Cookie 承载，因此本客户端不构造 Authorization 头。
 *   3. backend/src/middleware/csrf.rs：GET/HEAD/OPTIONS 豁免；PUBLIC_PATHS 与 AUTH_ONLY_PATHS
 *      不消费令牌；其余非安全方法强制一次性消费 x-csrf-token，消费成功后新令牌只随响应的
 *      Set-Cookie 下发（无响应头），403 的 MISSING/已消费两种形态另经 x-new-csrf-token 响应头
 *      下发恢复令牌；CSRF_TOKEN_BINDING_MISMATCH 属盗用面，后端不下发恢复令牌、不可自动重放。
 *   3b. backend/src/bootstrap/middleware_bootstrap.rs 的层序是 auth -> omni_audit -> csrf ->
 *      permission：只回 401 而未下发新令牌，说明请求没走到消费那一步，令牌在服务端仍有效。
 *   4. backend/src/utils/response.rs：成功信封 {code:200,data}（message 为空时省略），
 *      失败信封 {code:"UNAUTHORIZED"|"FORBIDDEN"|...,message,trace_id,timestamp} 配 HTTP 状态码，
 *      所以失败判定以状态码为准，业务码只作细分。
 */

var CSRF_KEY = "bingxiCsrf";
var SESSION_KEY = "bingxiSession";
var BINGXI_PREFIX = "/api/v1/erp";
var USERS_ME_PATH = BINGXI_PREFIX + "/users/me";

/** 无副作用方法（backend/src/middleware/csrf.rs is_safe_method 同源） */
var SAFE_METHODS = { GET: !0, HEAD: !0, OPTIONS: !0 };

/** 匿名公开路径：非安全方法只做自定义头检查，不消费一次性令牌（PUBLIC_PATHS 中本客户端会命中的两条） */
var PUBLIC_PATHS = [BINGXI_PREFIX + "/auth/login", BINGXI_PREFIX + "/auth/refresh"];

/** 仅需认证、跳过 CSRF 消费与 RBAC 的路径（AUTH_ONLY_PATHS 同源） */
var AUTH_ONLY_PATHS = [
  BINGXI_PREFIX + "/auth/me",
  BINGXI_PREFIX + "/ws/ticket",
  BINGXI_PREFIX + "/users/change-password",
  BINGXI_PREFIX + "/company-profile",
  BINGXI_PREFIX + "/audit-logs/record-print",
];

/** 失败信封字符串码到 HTTP 状态码的对照（utils/error.rs error_code 词表；仅在拿不到真实状态码时兜底分类） */
var CODE_HTTP = {
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  BAD_REQUEST: 400,
  VALIDATION_ERROR: 400,
  BUSINESS_ERROR: 400,
  CSRF_TOKEN_MISSING: 403,
  CSRF_TOKEN_INVALID: 403,
  CSRF_TOKEN_BINDING_MISMATCH: 403,
  TOO_MANY_REQUESTS: 429,
  TIMEOUT: 504,
  SERVICE_UNAVAILABLE: 503,
  DATABASE_ERROR: 500,
  INTERNAL_ERROR: 500,
  NOT_IMPLEMENTED: 501,
};

// ---------- 工具 ----------
function app_() {
  return getApp() || {};
}

function bingxiBase() {
  var c = app_().config || {};
  return (c.bingxiHost || "").replace(/\/$/, "");
}

function normMethod(method) {
  return String(method || "GET").replace("_", "").toUpperCase();
}

/** 取 URL 的路径段（去掉协议、域名、query 与 hash），供路径白名单比对 */
function pathOf(url) {
  if (!url || typeof url !== "string") return "";
  var p = url.replace(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\/[^/?#]+/, "");
  return p.split(/[?#]/)[0];
}

function inList(list, path) {
  for (var i = 0; i < list.length; i++) if (list[i] === path) return !0;
  return !1;
}

/** 请求 URL 是否指向 bingxi-erp */
function isBingxiUrl(url) {
  if (!url || typeof url !== "string") return !1;
  var base = bingxiBase();
  return !!base && url.indexOf(base) === 0;
}

// ---------- CSRF 令牌仓库（一次性语义，取用即作废） ----------
function peekCsrf() {
  var t = wx.getStorageSync(CSRF_KEY);
  return typeof t === "string" ? t : "";
}

function putCsrf(token) {
  if (typeof token === "string" && token) {
    wx.setStorageSync(CSRF_KEY, token);
    return !0;
  }
  return !1;
}

/** 读出并立刻作废：后端消费成功即作废旧令牌，缓存里绝不留一份已失效的令牌冒充有效 */
function takeCsrf() {
  var t = peekCsrf();
  if (t) wx.removeStorageSync(CSRF_KEY);
  return t;
}

// ---------- 请求适配 ----------
/**
 * 契约预处理：只做 GET 分页参数适配与 bingxi 识别，不改写 URL
 * 返回 { url, data, method, isBingxi }
 */
function adapt(url, method, data) {
  var m = normMethod(method);
  var isBingxi = isBingxiUrl(url);
  var d = data;
  if (isBingxi && m === "GET" && d && typeof d === "object" && !Array.isArray(d)) {
    if (d.pageNum !== undefined || d.pageSize !== undefined) {
      d = Object.assign({}, d);
      if (d.page === undefined && d.pageNum !== undefined) d.page = d.pageNum;
      if (d.page_size === undefined && d.pageSize !== undefined) d.page_size = d.pageSize;
      delete d.pageNum;
      delete d.pageSize;
    }
  }
  return { url: url, data: d, method: m, isBingxi: isBingxi };
}

/**
 * 请求头：X-Requested-With（公开路径 L-1 防御与全站统一）+ 非安全方法的 x-csrf-token
 * 不产出 Authorization：本客户端的凭据是 httpOnly Cookie，JS 侧不持有 token。
 * auth.rs 只在 access_token / jwt 两枚 Cookie 都缺席时才读这个头，且只认带 "Bearer " 前缀的形式，
 * 空值与裸 token 都会被判"无效的认证头格式"，保留这条永远为假的分支等于冒充功能
 * csrfToken 传字符串（含空串）按传入值决定是否发头；传 undefined 时读缓存（供不经队列的调用点使用）
 */
function authHeaders(isBingxi, method, csrfToken) {
  if (!isBingxi) return {};
  var h = { "X-Requested-With": "XMLHttpRequest" };
  if (SAFE_METHODS[normMethod(method)]) return h;
  var tok = csrfToken === undefined ? peekCsrf() : csrfToken;
  if (tok) h["x-csrf-token"] = tok;
  return h;
}

/** 该请求是否会消费一次性令牌 */
function consumesCsrf(url, method) {
  if (SAFE_METHODS[normMethod(method)]) return !1;
  var p = pathOf(url);
  // 只有本仓契约前缀内的路径才经过后端 csrf 中间件；/app-api 这类旧路径（仓内无对应端点）
  // 不能参与令牌取用，否则一次无用请求就把会话里唯一有效的那枚令牌吞掉了
  if (p.indexOf(BINGXI_PREFIX + "/") !== 0) return !1;
  return !inList(PUBLIC_PATHS, p) && !inList(AUTH_ONLY_PATHS, p);
}

// ---------- 响应契约 ----------
/**
 * 把 wx.request 原始响应的传输信息（HTTP 状态码、响应头、响应 Cookie 清单）标注到响应体上
 * CSRF 轮换后的新令牌只出现在 Set-Cookie（成功）与 x-new-csrf-token（403 恢复）里，
 * 小程序没有 document.cookie，只能在这两处读；这里把两个通道都带出来交给归一化层
 */
function tagResponse(res) {
  if (!res) return res;
  var d = res.data;
  if (d && typeof d === "object" && d.__httpStatus === undefined) {
    d.__httpStatus = res.statusCode;
    d.__hdr = res.header || {};
    d.__cookies = res.cookies || [];
  }
  return d;
}

function carryTransport(out, src) {
  if (src.__httpStatus !== undefined) out.__httpStatus = src.__httpStatus;
  if (src.__hdr !== undefined) out.__hdr = src.__hdr;
  if (src.__cookies !== undefined) out.__cookies = src.__cookies;
  return out;
}

function failCode(status, errCode) {
  if (typeof status === "number" && status > 0) return status;
  var mapped = CODE_HTTP[errCode];
  return typeof mapped === "number" ? mapped : 500;
}

/**
 * 响应归一化：成功信封 {code:200,data} -> {code:0,data,msg}；
 * 失败信封 {code:"UNAUTHORIZED",message,...} -> {code:<HTTP 状态码>,msg,errCode}
 * 让调用方既能用 code === 0 判成功，也能用 code === 401/403 判鉴权面
 */
function normalize(resData, isBingxi) {
  if (!isBingxi || !resData || typeof resData !== "object") return resData;
  if (resData.__normalized) return resData;
  var status = resData.__httpStatus;
  if (typeof resData.code === "number") {
    var ok = {
      code: resData.code === 200 ? 0 : resData.code,
      data: resData.data !== undefined ? resData.data : resData,
      msg: resData.message || resData.msg || "",
      __normalized: !0,
    };
    if (typeof resData.total === "number") ok.total = resData.total;
    if (resData.errors) ok.errors = resData.errors;
    return carryTransport(ok, resData);
  }
  if (typeof resData.code === "string") {
    var err = {
      code: failCode(status, resData.code),
      msg: resData.message || resData.msg || "",
      errCode: resData.code,
      __normalized: !0,
    };
    if (resData.trace_id) err.traceId = resData.trace_id;
    if (resData.data !== undefined) err.data = resData.data;
    return carryTransport(err, resData);
  }
  return resData;
}

/** 从归一化响应里取后端下发的新 CSRF 令牌：先读 403 恢复头，再读 Set-Cookie 轮换值 */
function csrfFromResponse(res) {
  if (!res || typeof res !== "object") return "";
  var hdr = res.__hdr || {};
  var fromHdr = hdr["x-new-csrf-token"] || hdr["X-New-Csrf-Token"];
  if (fromHdr) return String(fromHdr);
  var list = [];
  if (res.__cookies && res.__cookies.length) list = res.__cookies;
  else {
    var sc = hdr["set-cookie"] || hdr["Set-Cookie"];
    if (sc) list = Array.isArray(sc) ? sc : [sc];
  }
  for (var i = 0; i < list.length; i++) {
    var m = /(?:^|[;\s])csrf_token=([^;,]+)/.exec(String(list[i]));
    if (m) return m[1];
  }
  return "";
}

/** 是否为 CSRF 一次性令牌校验失败（403 + CSRF_TOKEN_* 业务码） */
function isCsrfFailure(res) {
  if (!res || typeof res !== "object") return !1;
  var st = res.__httpStatus !== undefined ? res.__httpStatus : res.code;
  if (st !== 403 && res.code !== 403) return !1;
  return typeof res.errCode === "string" && res.errCode.indexOf("CSRF_TOKEN") === 0;
}

/**
 * 403 是否可自动重放：仅当响应带回了恢复令牌
 * CSRF_TOKEN_BINDING_MISMATCH 后端不签发恢复令牌，据此判定直接外抛，不替盗用面补令牌重试
 */
function recoverCsrf(res) {
  if (!isCsrfFailure(res)) return !1;
  var neu = csrfFromResponse(res);
  if (!neu) return !1;
  return putCsrf(neu);
}

// ---------- 写请求串行化 ----------
/**
 * 后端把 CSRF 令牌做成"消费即作废 + 逐请求轮换"，两个并发写必然有一个带着已作废的旧令牌撞上 403；
 * 恢复通道每次只下发一枚新令牌，并发场景下不够分。所以把会消费令牌的请求排成一条队，
 * 让"取令牌 -> 发送 -> 收回轮换令牌"成为原子步骤，令牌在任一时刻只被一个请求持有
 */
var writeTail = Promise.resolve();

function settle_() {}

function serializeWrite(runner) {
  var result = writeTail.then(runner, runner);
  writeTail = result.then(settle_, settle_);
  return result;
}

/**
 * 按契约发送一个 bingxi 请求（GET 直发，非安全方法排队并处理一次性令牌）
 * 入参 spec：{ url, method, send }，send(headerOverrides) 由请求层提供，返回归一化响应的 Promise
 * 传给谁：请求层的 Promise 链
 * 令牌规则：取用即从缓存作废；响应带回轮换值或恢复值则回填；带恢复值的 403 只重放一次；
 *   只回 401 且没下发新令牌时把令牌放回缓存（auth 层在 csrf 消费之前拦截）
 */
function requestContract(spec) {
  var url = spec.url;
  var method = normMethod(spec.method);
  var isBingxi = isBingxiUrl(url);
  // 只有打到 bingxi-erp 的请求才参与令牌取用与串行：打旧路径（仓内不存在的端点）的请求
  // 根本不会经过后端 csrf 中间件，若也去 takeCsrf 会把有效令牌白吞掉
  var consume = isBingxi && consumesCsrf(url, method);

  var attempt = function (replayed) {
    var token = consume ? takeCsrf() : "";
    return spec.send(authHeaders(isBingxi, method, consume ? token : "")).then(function (res) {
      if (!consume) return res;
      var neu = csrfFromResponse(res);
      // 中间件层序是 auth -> omni_audit -> csrf -> permission（bootstrap/middleware_bootstrap.rs）：
      // 只带 401 而没有下发新令牌，说明请求根本没走到 csrf 消费那步，这枚令牌在服务端仍然有效，
      // 本地不能把它当已消费丢掉，否则下一次写请求要白吃一次 403
      if (token && !neu && (res.__httpStatus === 401 || res.code === 401)) putCsrf(token);
      if (neu) putCsrf(neu);
      if (!replayed && isCsrfFailure(res) && neu) return attempt(!0);
      return res;
    });
  };

  if (!consume) return attempt(!1);
  return serializeWrite(function () {
    return attempt(!1);
  });
}

// ---------- 登录态（以后端回读为唯一判据） ----------
/** 会话快照写入：只存后端 users/me 认过的身份摘要，不存任何凭据 */
function markSession(user) {
  var snap = {
    id: user && user.id !== undefined ? user.id : 0,
    username: (user && user.username) || "",
    verifiedAt: Date.now(),
  };
  wx.setStorageSync(SESSION_KEY, snap);
  var a = app_();
  if (a.globalData) {
    a.globalData.loginState = "valid";
    a.globalData.userInfo = Object.assign({}, a.globalData.userInfo || {}, {
      id: snap.id,
      username: snap.username,
    });
  }
  return snap;
}

/** 清会话：令牌与会话快照一并作废，避免留下半截凭据 */
function clearSession() {
  wx.removeStorageSync(SESSION_KEY);
  wx.removeStorageSync(CSRF_KEY);
  var a = app_();
  if (a.globalData) {
    a.globalData.loginState = "invalid";
    a.globalData.userInfo = {};
  }
}

function isLoggedIn() {
  return !!wx.getStorageSync(SESSION_KEY);
}

/**
 * 回读 GET /api/v1/erp/users/me 判定登录态
 * 返回 { state: "valid" | "denied" | "invalid" | "error", status, user, msg }
 *   valid   —— HTTP 200 且信封 code 200，会话成立并写入快照
 *   denied  —— HTTP 403：auth.rs 已放行（会话成立），是 permission.rs 的 RBAC 面拒绝（users:read 缺失）
 *   invalid —— HTTP 401：缺少/无效认证凭据，会话不成立并清快照
 *   error   —— 网络失败或 5xx：判据未知，保留既有快照，不据此登出
 */
function verifySession() {
  return new Promise(function (resolve) {
    wx.request({
      url: bingxiBase() + USERS_ME_PATH,
      method: "GET",
      header: authHeaders(!0, "GET"),
      success: function (res) {
        tagResponse(res);
        var data = normalize(res.data, !0);
        var status =
          data && data.__httpStatus !== undefined ? data.__httpStatus : res.statusCode;
        if (status === 200 && data && data.code === 0 && data.data && data.data.id) {
          resolve({ state: "valid", status: status, user: markSession(data.data), msg: data.msg });
          return;
        }
        if (status === 403) {
          // 能走到 403 说明 auth.rs 已放行，是 permission.rs 的 RBAC 面拒绝（users/me 需 users:read）：
          // 会话成立，只是拿不到档案，用登录响应已落盘的用户摘要补写快照，避免把无权限误判成未登录
          resolve({
            state: "denied",
            status: status,
            user: markSession({
              id: wx.getStorageSync("id") || 0,
              username: wx.getStorageSync("nickName") || "",
            }),
            msg: (data && data.msg) || "",
          });
          return;
        }
        if (status === 401) {
          clearSession();
          resolve({ state: "invalid", status: status, msg: (data && data.msg) || "" });
          return;
        }
        resolve({ state: "error", status: status, msg: (data && data.msg) || "" });
      },
      fail: function (err) {
        resolve({ state: "error", status: 0, msg: (err && err.errMsg) || "网络异常" });
      },
    });
  });
}

// ---------- 登录响应适配 ----------
/**
 * 登录出参适配：bingxi {code:200,data:{csrf_token,user,permissions,password_expired}}
 * -> 小程序 {code:0,data:{user,permissions,password_expired}}
 * 落盘内容：csrf_token 进 bingxiCsrf（否则本会话第一个写请求要先吃一次 403 才能拿到恢复令牌）、
 * 用户档案进 wx.storage 的各业务键
 * 登录响应体没有 token 字段，也不写任何 token 键：登录态由 verifySession() 的 users/me 回读确认
 */
function adaptLogin(raw, isBingxi) {
  var res = normalize(raw, isBingxi);
  if (!isBingxi || res.code !== 0) return res;
  var d = res.data || {};
  var u = d.user || {};
  putCsrf(d.csrf_token);
  var user = {
    id: u.id !== undefined ? u.id : "",
    companyId: u.companyId || u.tenant_id || "",
    nickName: u.nickname || u.nickName || u.username || "",
    username: u.username || "",
    phone: u.phone || u.mobile || "",
    avatar: u.avatar || "",
    fullName: u.fullName || u.full_name || u.real_name || u.username || "",
    perms: d.permissions || u.permissions || [],
    roleNames: u.role_names || (u.role_name ? [u.role_name] : []),
    email: u.email || "",
    departmentName: u.department_name || "",
    isTotpEnabled: !!u.is_totp_enabled,
  };
  wx.setStorageSync("id", user.id);
  wx.setStorageSync("myShopId", user.companyId);
  wx.setStorageSync("nickName", user.nickName);
  wx.setStorageSync("mobile", user.phone);
  wx.setStorageSync("avatar", user.avatar);
  wx.setStorageSync("fullName", user.fullName);
  wx.setStorageSync("resCodeList", user.perms);
  var a = app_();
  if (a.globalData) a.globalData.userInfo = Object.assign({}, a.globalData.userInfo, user);
  return {
    code: 0,
    msg: res.msg || "登录成功",
    data: { user: user, permissions: user.perms, password_expired: !!d.password_expired },
    __normalized: !0,
  };
}

module.exports = {
  adapt: adapt,
  normalize: normalize,
  tagResponse: tagResponse,
  isBingxiUrl: isBingxiUrl,
  authHeaders: authHeaders,
  consumesCsrf: consumesCsrf,
  requestContract: requestContract,
  adaptLogin: adaptLogin,
  recoverCsrf: recoverCsrf,
  isCsrfFailure: isCsrfFailure,
  csrfFromResponse: csrfFromResponse,
  peekCsrf: peekCsrf,
  takeCsrf: takeCsrf,
  putCsrf: putCsrf,
  isLoggedIn: isLoggedIn,
  markSession: markSession,
  clearSession: clearSession,
  verifySession: verifySession,
  serializeWrite: serializeWrite,
  CSRF_STORE_KEY: CSRF_KEY,
  SESSION_STORE_KEY: SESSION_KEY,
  USERS_ME_PATH: USERS_ME_PATH,
  BINGXI_PREFIX: BINGXI_PREFIX,
};
