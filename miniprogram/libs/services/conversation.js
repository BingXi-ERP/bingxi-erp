var createClass = require("../../@babel/runtime/helpers/createClass"),
  classCallCheck = require("../../@babel/runtime/helpers/classCallCheck"),
  app = getApp(),
  request = require("./request.js").request,
  i = createClass(function t() {
    (classCallCheck(this, t),
      (this.conversationTalk = function (t) {
        return request.POST("".concat(app.config.bingxiHost, "/app-api/ai/chat/conversation"), t);
      }),
      (this.historytalk = function (t) {
        return request.POST(
          "".concat(app.config.bingxiHost, "/app-api/ai/chat/conversation/history"),
          t,
        );
      }),
      (this.newtalk = function (t) {
        return request.POST("".concat(app.config.bingxiHost, "/app-api/ai/chat/createSession"), t);
      }),
      (this.historyList = function (t) {
        return request.POST("".concat(app.config.bingxiHost, "/app-api/ai/chat/list"), t);
      }),
      (this.getProductGroup = function (t) {
        return request.POST(
          "".concat(app.config.bingxiHost, "/app-api/ai/chat/listSessionProduct"),
          t,
        );
      }),
      (this.anotherOne = function (t) {
        return (
          console.log(123),
          console.log(t),
          request.GET(
            ""
              .concat(app.config.bingxiHost, "/app-api/ai/chat/refreshProductRecommend/")
              .concat(t.searchId),
            t,
          )
        );
      }));
  });
module.exports = {
  conversationApi: new i(),
};
