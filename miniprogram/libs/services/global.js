var request = require("./request.js").request,
  app = getApp();
module.exports = {
  /**
   * 订阅消息单条 formId 上报地址
   * 调用方：components/panel-img/panel-img.js、pages/index/index.js 的 getformId
   * 入参：无  传给谁：调用方自己交给传输层发出  存什么：不存  存哪里：无
   * 旧路径 /app-api/pubMsg/saveFormId 仓内无等价端点，按原样保留并登记待拍板清单
   */
  saveFormId: function () {
    return "".concat(app.config.bingxiHost, "/app-api/pubMsg/saveFormId");
  },
  /**
   * 订阅消息批量 formId 上报
   * 调用方：libs/services/*.js 与页面批量补 formId 处
   * 入参：e 形如 {formIds:[...]} 的批量载荷，内部再并入 wx.login 拿到的 code
   * 传给谁：libs/services/request.js 传输层，经 libs/utils/apiGateway.js 的 requestContract
   *   做响应归一化与 CSRF 取用轮换；凭据是后端 httpOnly Cookie，由 wx.request 自动携带，
   *   本文件不再自拼 Authorization 头，也不再读 storage 的 token
   * 存什么：不落盘  存哪里：无
   * 旧路径 /app-api/pubMsg/saveFormIds 仓内无等价端点，按原样保留并登记待拍板清单
   */
  saveFormIds: function (e) {
    var n;
    wx.login({
      success: function (r) {
        n = r.code;
        var a = Object.assign({}, e, {
          code: n,
        });
        return request.POST("".concat(app.config.bingxiHost, "/app-api/pubMsg/saveFormIds"), a, {
          headers: {
            terminalSource: 6,
            "Content-Type": "application/json",
          },
        });
      },
    });
  },
  getAddressIdList: function (e) {
    return request.POST("".concat(app.config.bingxiHost, "/app-api/shopArea/getAddressIdList"), e, {
      headers: {
        "content-type": "application/x-www-form-urlencoded",
      },
    });
  },
  getProvince: function () {
    return request.GET("".concat(app.config.bingxiHost, "/app-api/shopArea/province"));
  },
  getCity: function (e) {
    return request.GET("".concat(app.config.bingxiHost, "/app-api/shopArea/city/").concat(e));
  },
  getArea: function (e) {
    return request.GET("".concat(app.config.bingxiHost, "/app-api/shopArea/area/").concat(e));
  },
};
