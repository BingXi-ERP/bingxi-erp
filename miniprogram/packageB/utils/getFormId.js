/**
 * 订阅消息 formId 上报（packageB 副本，与 libs/utils/getFormId.js 同逻辑）
 * ---------------------------------------------------------------
 * 调用方：packageB/components/color-btn/color-btn.js 在表单 submit 里取 e.detail.formId 后调用
 * 入参：e 微信表单插件下发的 formId（空值直接不发请求）
 * 传给谁：packageB/libs/services/request.js 的传输层，再由 libs/utils/apiGateway.js 的 requestContract
 *   做响应归一化、CSRF 一次性令牌取用与轮换、403 重放；凭据是后端 httpOnly Cookie，由 wx.request
 *   自动携带，本文件不再自拼 Authorization 头，也不再读 storage 的 token
 * 存什么：不落盘
 * 存哪里：无
 *
 * 说明：上报通道 /app-api/pubMsg/saveFormId 是本仓 route-snapshot.txt 里没有的旧路径，
 *   仓内无等价端点，路径按原样保留并登记在待拍板清单；apiGateway.consumesCsrf 只认 /api/v1/erp
 *   前缀，所以这条旧路径不会消费会话里的一次性令牌。
 */
var createClass = require("../../@babel/runtime/helpers/createClass"),
  classCallCheck = require("../../@babel/runtime/helpers/classCallCheck"),
  app = getApp(),
  request = require("../libs/services/request.js").request,
  r = createClass(function e(r) {
    (classCallCheck(this, e),
      (this.getformId = function (e) {
        var classCallCheck = "".concat(app.config.bingxiHost, "/app-api/pubMsg/saveFormId");
        e &&
          wx.login({
            success: function (o) {
              var r = {
                formId: e,
                code: o.code,
              };
              request.POST(classCallCheck, r, {
                headers: {
                  "content-type": "application/x-www-form-urlencoded",
                  terminalSource: 6,
                },
              });
            },
          });
      }));
  });
module.exports = {
  saveFormId: new r(),
};
