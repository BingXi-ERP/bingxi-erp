var createClass = require("../../@babel/runtime/helpers/createClass"),
  classCallCheck = require("../../@babel/runtime/helpers/classCallCheck"),
  app = getApp(),
  request = require("./request.js").request,
  u = createClass(function e(u) {
    (classCallCheck(this, e),
      (this.setUserHandleLog = function (e, r) {
        // 功能 上报一条店铺操作埋点（libs 份带附加维度对象）
        // 调用方 libs 与 pages 各操作腿，如 pages/color-card-management/batch-management/batch-management.js
        // 入参 e 旧侧的操作类型编号（数值），r 可选的附加维度对象
        // 传给谁 本仓 behavior 埋点写口 POST（route-snapshot.txt 第 1077 行），
        //   载荷键按 BehaviorRequest 的 event_type 与 event_data 两字段
        //   （backend/src/handlers/tracking_handler.rs 第 59 行）
        // 存什么 旧侧把附加维度拼在 URL 查询串上，本仓改为 event_data 结构化键；
        //   r 缺席时该键不发送（后端按可选列处理），旧编号到事件名的词表本仓不存在，
        //   该形态差异已登记进映射报告
        // 存哪里 不写本地缓存
        var body = {
          event_type: String(e),
        };
        if (r) body.event_data = r;
        return request.POST("".concat(app.config.bingxiHost, "/api/v1/erp/behavior"), body);
      }));
  });
module.exports = {
  servicesUserLog: new u(),
};
