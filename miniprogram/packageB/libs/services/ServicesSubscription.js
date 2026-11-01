var e = require("../../../@babel/runtime/helpers/interopRequireDefault").default,
  createClass = require("../../../@babel/runtime/helpers/createClass"),
  classCallCheck = require("../../../@babel/runtime/helpers/classCallCheck"),
  getWxInfo = e(require("../utils/getWxInfo")),
  app = getApp(),
  request = require("./request.js").request,
  u = createClass(function e(r) {
    (classCallCheck(this, e),
      (this.saveWxOpenId = function () {
        if (!app.globalData.userOpenIdFlag)
          return wx.getStorageSync("wxOpenId")
            ? void (app.globalData.userOpenIdFlag = "1")
            : getWxInfo.default.getWxCode().then(function (e) {
                var createClass = {
                  code: e,
                };
                return request
                  .POST(
                    "".concat(app.config.bingxiHost, "/app-api/wx/maMsg/saveWxOpenId"),
                    createClass,
                  )
                  .then(function (e) {
                    0 === e.code &&
                      e.msg &&
                      "success" == e.msg &&
                      (app.globalData.userOpenIdFlag = "1");
                  });
              });
      }),
      (this.addSubscribeLog = function (e) {
        // 功能 上报订阅消息动作埋点，与主包 libs/services/ServicesSubscription.js 同一口径
        // 调用方 当前全仓零调用方（复核 grep 只命中本定义行），保留方法形状并接回在册写口
        // 入参 e 旧载荷（订阅模板参数对象）
        // 传给谁 本仓行为埋点写口 POST /api/v1/erp/behavior（route-snapshot.txt 第 1077 行
        //   record_behavior，backend/src/handlers/tracking_handler.rs 的 BehaviorRequest）
        // 存什么 不落本地；event_type 取稳定事件名 addSubscribeLog，旧载荷放进 event_data
        // 存哪里 服务端行为分析域（analytics）
        return request.POST("".concat(app.config.bingxiHost, "/api/v1/erp/behavior"), {
          event_type: "addSubscribeLog",
          event_data: e,
        });
      }));
  });
module.exports = {
  ServiceSubscribeLog: new u(),
};
