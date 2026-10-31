var createClass = require("../../@babel/runtime/helpers/createClass"),
  classCallCheck = require("../../@babel/runtime/helpers/classCallCheck"),
  app = getApp(),
  request = require("./request.js").request,
  o = createClass(function e(o) {
    (classCallCheck(this, e),
      (this.addressList = function (e) {
        return request.POST("".concat(app.config.bingxiHost, "/app-api/addressee/pageList"), e);
      }),
      (this.saveAddress = function (e) {
        return request.POST("".concat(app.config.bingxiHost, "/app-api/addressee/create"), e);
      }),
      (this.editAddress = function (e) {
        return request.POST("".concat(app.config.bingxiHost, "/app-api/addressee/modify"), e);
      }),
      (this.removeAddress = function (e) {
        return request.POST("".concat(app.config.bingxiHost, "/app-api/addressee/delete"), e);
      }),
      (this.addressDetail = function (e) {
        return request.POST("".concat(app.config.bingxiHost, "/app-api/addressee/load"), e);
      }),
      (this.selfTakeAddress = function (e) {
        return request.GET(
          "".concat(app.config.bingxiHost, "/app-api/basic/address/selfTakeAddress"),
          e,
        );
      }),
      (this.orderSave = function (e) {
        return request.POST("".concat(app.config.bingxiHost, "/app-api/goods/ask/order/save"), e, {
          headers: {
            "content-type": "application/json",
          },
        });
      }),
      (this.defaultAddress = function (e) {
        return request.GET(
          "".concat(app.config.bingxiHost, "/app-api/basic/address/defaultAddress"),
          e,
          {
            headers: {
              "content-type": "application/json",
            },
          },
        );
      }));
  });
module.exports = {
  ServicesAddressManage: new o(),
};
