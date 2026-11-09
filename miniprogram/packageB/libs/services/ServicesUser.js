/**
 * 用户域 service（packageB 副本，与 libs/services/ServicesUser.js 同口径）
 * ---------------------------------------------------------------
 * 调用方：packageB/libs/utils/login.js 与 packageB 各页面
 * 入参：各方法的业务载荷
 * 传给谁：packageB/libs/services/request.js 的传输层，再由 libs/utils/apiGateway.js 的 requestContract
 *   统一做响应归一化、CSRF 一次性令牌取用与轮换、403 重放；凭据是后端 httpOnly Cookie，
 *   由 wx.request 自动维护，本文件不构造 Authorization 头，也不读写 storage 的任何 token 与 loginToken 键
 * 存什么：只有登录链（login2 经 adaptLogin）落一次性 CSRF 令牌与会话快照，本文件自身不落凭据
 * 存哪里：wx.storage（键由 apiGateway 定义）
 */
var createClass = require("../../../@babel/runtime/helpers/createClass"),
  classCallCheck = require("../../../@babel/runtime/helpers/classCallCheck"),
  app = getApp(),
  apiGateway = require("../../../libs/utils/apiGateway.js"),
  request = require("./request.js").request,
  c = createClass(function t(c) {
    (classCallCheck(this, t),
      /**
       * 会话初始化校验
       * 调用方：登录与冷启动需要确认微信侧会话在本仓后端成立时使用（当前全仓零调用方，
       *   复核命令 grep -rn 'userInit' 只命中 libs 与本副本的定义行）
       * 入参：无
       * 传给谁：apiGateway.verifySession() 发 GET /api/v1/erp/auth/me 回读判登录态
       *   （frontend/scripts/route-snapshot.txt:230 get_current_user，AUTH_ONLY_PATHS 内任何
       *   登录态可读；该方法只产出 valid invalid error 三态，判定只认 valid——历史上针对
       *   /users/me 403 权限面拒绝的 denied 态已随端点切换退场，不许复活）
       * 存什么：会话有效时由 apiGateway 写会话快照；不再有按环境分键的 token 缓存
       * 存哪里：wx.storage（键 bingxiSession）
       *
       * 原写法是 wx.login 拿 code 换后端登录并 setStorageSync("token" 与 devToken 与
       * demoToken 与 productionToken", n.data.token)。后端 LoginResponse 无 token 字段
       * （backend/src/handlers/auth_handler.rs 的 LoginResponse 只有 csrf_token、user、
       * permissions、password_expired），这套写入落盘的永远是 undefined，属凭据冒充登录态，
       * 已整段换成 auth/me 回读口径。
       */
      (this.userInit = function () {
        return apiGateway.verifySession().then(function (v) {
          if (v.state === "valid") return v;
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
       * 调用方：packageB/libs/utils/login.js 的 loginByMobile 与 loginByWX
       * 入参：t 登录载荷（后端 LoginRequest 认 username 与 password，另有可选 totp_token 与 recovery_code）
       * 传给谁：apiGateway.requestContract 发出并归一化，再由 adaptLogin 落 csrf_token 与用户档案；
       *   本方法不再裸调 wx.request，CSRF 取用轮换与 403 重放由契约层统一负责
       * 存什么：一次性 CSRF 令牌与后端回读确认的会话快照
       * 存哪里：wx.storage（键 bingxiCsrf 与 bingxiSession，由 apiGateway 写）
       */
      (this.login2 = function (t) {
        var g = apiGateway.adapt(
          "".concat(app.config.bingxiHost, "/api/v1/erp/auth/login"),
          "POST",
          t,
        );
        return apiGateway
          .requestContract({
            url: g.url,
            method: "POST",
            send: function (contractHeaders) {
              return new Promise(function (n, e) {
                wx.request({
                  url: g.url,
                  data: g.data,
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
                    n(apiGateway.normalize(apiGateway.tagResponse(res), g.isBingxi));
                  },
                  fail: function (err) {
                    e(err);
                  },
                });
              });
            },
          })
          .then(function (raw) {
            return apiGateway.adaptLogin(raw, g.isBingxi);
          });
      }),
      (this.logout = function (t) {
        return request.POST("".concat(app.config.bingxiHost, "/api/v1/erp/auth/logout"), t);
      }),
      (this.uploadUserInfo = function (t) {
        return request.POST("".concat(app.config.bingxiHost, "/app-api/user"), t);
      }),
      (this.getUserInfo = function (t) {
        // 档案回读统一走 /auth/me（快照:230，AUTH_ONLY_PATHS，任何登录态可读，出参 UserInfo
        // 含 permissions）；/users/me 按 URL 段派生 users:read 权限码只授内部岗位，
        // 客户与供应商会话必 403，不得作为档案回读端点
        return request.GET("".concat(app.config.bingxiHost, "/api/v1/erp/auth/me"), t);
      }),
      (this.sendCode = function (t) {
        return request.GET("".concat(app.config.bingxiHost, "/app-api/user/sendCode"), t);
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
      (this.requestPost = function (t, n) {
        var app =
          n.indexOf("/setting/unbindWechat") > -1
            ? "application/x-www-form-urlencoded"
            : "application/json";
        return request.POST(n, t, {
          headers: {
            "content-type": app,
          },
        });
      }),
      (this.saveBankAccount = function (t) {
        return request.POST("".concat(app.config.bingxiHost, "/app-api/setting/bankAccount/add"), t);
      }),
      (this.delBankAccount = function (t) {
        return request.POST(
          "".concat(app.config.bingxiHost, "/app-api/setting/bankAccount/remove"),
          t,
          {
            headers: {
              "content-type": "application/x-www-form-urlencoded",
            },
          },
        );
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
      }));
  });
module.exports = {
  servicesUser: new c(),
};
