var createClass = require("../../@babel/runtime/helpers/createClass"),
  classCallCheck = require("../../@babel/runtime/helpers/classCallCheck"),
  app = getApp(),
  request = require("./request.js").request,
  i = createClass(function e(i) {
    (classCallCheck(this, e),
      (this.setUserHandleLog = function (e) {
        // 功能 上报一条店铺操作埋点
        // 调用方 packageA 各页在增删改动作成功后打点
        // 入参 e 旧侧的操作类型编号（数值），本仓按事件名字符串记录
        // 传给谁 本仓 behavior 埋点写口 POST（route-snapshot.txt 第 1077 行），
        //   载荷键按 BehaviorRequest 的 event_type 字段（backend/src/handlers/tracking_handler.rs 第 59 行）
        // 存什么 只提交 event_type 一键，取值为旧编号的字符串形态，旧编号到事件名的词表
        //   本仓不存在，该形态差异已登记进映射报告
        // 存哪里 不写本地缓存
        return request.POST("".concat(app.config.bingxiHost, "/api/v1/erp/behavior"), {
          event_type: String(e),
        });
      }));
  });
module.exports = {
  servicesUserLog: new i(),
};
