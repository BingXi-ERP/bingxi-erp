/**
 * 用户域 service（bingxi-erp 会话版）
 * ---------------------------------------------------------------
 * 调用方：libs/utils/login.js、pages/register 各页、pages/personal-center 各页、packageA 与 packageB 页面
 * 入参：各方法的业务载荷
 * 传给谁：libs/services/request.js 的传输层，再由 libs/utils/apiGateway.js 的 requestContract
 *   统一做响应归一化、CSRF 一次性令牌取用与轮换、403 重放；登录与登出与 users/me 走
 *   /api/v1/erp 契约前缀，凭据是后端 httpOnly Cookie，由 wx.request 自动维护，
 *   本文件不构造 Authorization 头，也不读写 storage 的任何 token 与 loginToken 键
 * 存什么：只有登录链（login2 经 adaptLogin）落一次性 CSRF 令牌与会话快照，本文件自身不落凭据
 * 存哪里：wx.storage（键由 apiGateway 定义）
 */
var t = require("../../@babel/runtime/helpers/interopRequireDefault").default,
  createClass = require("../../@babel/runtime/helpers/createClass"),
  classCallCheck = require("../../@babel/runtime/helpers/classCallCheck"),
  getWxInfo = t(require("../utils/getWxInfo")),
  apiGateway = require("../utils/apiGateway.js"),
  app = getApp(),
  request = require("./request.js").request,
  s = createClass(function t(o) {
    (classCallCheck(this, t),
      (this.countInvite = function (t) {
        var createClass = t.type;
        return request.GET("".concat(app.config.bingxiHost, "/app-api/loss/operateAccess"), {
          type: createClass,
        });
      }),
      /**
       * 会话初始化校验
       * 调用方：登录与冷启动需要确认微信侧会话在本仓后端成立时使用（当前全仓零调用方，
       *   改造前先复核：grep -rn 'userInit' 只命中本方法与 packageB 副本的定义行）
       * 入参：无
       * 传给谁：apiGateway.verifySession() 发 GET /api/v1/erp/users/me 回读判登录态
       *   （frontend/scripts/route-snapshot.txt:968）
       * 存什么：会话有效时由 apiGateway 写会话快照；不再有按环境分键的 token 缓存
       * 存哪里：wx.storage（键 bingxiSession）
       *
       * 原写法是 wx.login 拿 code 换后端登录并 setStorageSync("token" 与 devToken 与
       * demoToken 与 productionToken", o.data.token)。后端 LoginResponse 无 token 字段
       * （backend/src/handlers/auth_handler.rs 的 LoginResponse 只有 csrf_token、user、
       * permissions、password_expired），这套写入落盘的永远是 undefined，属凭据冒充登录态，已整段
       * 换成 users/me 回读口径。
       */
      (this.userInit = function () {
        return apiGateway.verifySession().then(function (v) {
          if (v.state === "valid" || v.state === "denied") return v;
          wx.showToast({
            title: v.msg || "登录状态校验失败，请重新登录",
            icon: "none",
          });
          return Promise.reject(v);
        });
      }),
      (this.login = function (t) {
        return request.POST("".concat(app.config.bingxiHost, "/api/v1/erp/auth/login"), t);
      }),
      /**
       * 账号密码登录
       * 调用方：libs/utils/login.js 的 loginByMobile 与 loginByWX 与 loginByWX2
       * 入参：t 登录载荷（后端 LoginRequest 认 username 与 password，另有可选 totp_token 与 recovery_code）
       * 传给谁：libs/utils/apiGateway.js 的 requestContract 发出并归一化，再由 adaptLogin 落
       *   csrf_token 与用户档案；本方法不再裸调 wx.request，CSRF 取用轮换与 403 重放由契约层统一负责
       * 存什么：一次性 CSRF 令牌与后端回读确认的会话快照
       * 存哪里：wx.storage（键 bingxiCsrf 与 bingxiSession，由 apiGateway 写）
       */
      (this.login2 = function (t) {
        var __g = apiGateway.adapt(
          "".concat(app.config.bingxiHost, "/api/v1/erp/auth/login"),
          "POST",
          t,
        );
        return apiGateway
          .requestContract({
            url: __g.url,
            method: "POST",
            send: function (contractHeaders) {
              return new Promise(function (o, n) {
                wx.request({
                  url: __g.url,
                  data: __g.data,
                  method: "POST",
                  header: Object.assign(
                    {
                      "App-User-Agent": app.AppUserAgent,
                      terminalSource: 6,
                      "content-type": "application/json",
                    },
                    contractHeaders || {},
                  ),
                  success: function (res) {
                    o(apiGateway.normalize(apiGateway.tagResponse(res), __g.isBingxi));
                  },
                  fail: function (err) {
                    n(err);
                  },
                });
              });
            },
          })
          .then(function (raw) {
            return apiGateway.adaptLogin(raw, __g.isBingxi);
          });
      }),
      (this.logout = function (t) {
        return request.POST("".concat(app.config.bingxiHost, "/api/v1/erp/auth/logout"), t);
      }),
      (this.uploadUserInfo = function (t) {
        return request.POST("".concat(app.config.bingxiHost, "/app-api/user"), t);
      }),
      (this.getUserInfo = function (t) {
        return app.globalData.wxCode
          ? request.GET("".concat(app.config.bingxiHost, "/api/v1/erp/users/me"), t)
          : getWxInfo.default.getWxCode().then(function (o) {
              return request.GET("".concat(app.config.bingxiHost, "/api/v1/erp/users/me"), t);
            });
      }),
      (this.sendCode = function (t) {
        return request.GET(
          "".concat(app.config.bingxiHost, "/app-api/send/message/login/").concat(t.mobile),
          t,
        );
      }),
      (this.wxSendCode = function (t) {
        return request.GET("".concat(app.config.bingxiHost, "/app-api/user/wx/register/sendCode"), t);
      }),
      (this.sendChildrenCode = function (t) {
        return request.POST(
          "".concat(app.config.bingxiHost, "/app-api/user/subAccount/sendVerCode"),
          t,
        );
      }),
      (this.bindWX = function (t) {
        return request.POST("".concat(app.config.bingxiHost, "/app-api/setting/bindWechat"), t);
      }),
      (this.unbindWx = function (t) {
        return request.POST("".concat(app.config.bingxiHost, "/app-api/setting/unbindWechat"), t);
      }),
      (this.subAccountLogin = function (t) {
        return request.POST("".concat(app.config.bingxiHost, "/api/v1/erp/users"), t);
      }),
      (this.subAccountSendCode = function (t) {
        return request.GET(
          ""
            .concat(app.config.bingxiHost, "/app-api/send/message/account/children/")
            .concat(t.mobile),
          t,
        );
      }),
      (this.requestPost = function (t, o) {
        return request.POST(o, t);
      }),
      (this.saveBankAccount = function (t) {
        return request.POST("".concat(app.config.bingxiHost, "/app-api/setting/bankAccount/add"), t);
      }),
      (this.bankAccountList = function (t) {
        return request.POST(
          "".concat(app.config.bingxiHost, "/app-api/setting/bankAccount/view"),
          t,
          {
            headers: {
              "content-type": "application/x-www-form-urlencoded",
            },
          },
        );
      }),
      (this.bankList = function (t) {
        return request.POST(
          "".concat(app.config.bingxiHost, "/app-api/setting/baseBankAccountList"),
          t,
        );
      }),
      (this.getChannel = function (t) {
        return request.POST("".concat(app.config.bingxiHost, "/api/v1/erp/page-view"), t, {
          headers: {
            "content-type": "application/json",
          },
        });
      }),
      (this.logAccessPage = function (t) {
        return request.GET("".concat(app.config.bingxiHost, "/api/v1/erp/page-view/stats"), t, {
          headers: {
            "content-type": "application/json",
          },
        });
      }));
  });
module.exports = {
  servicesUser: new s(),
};
