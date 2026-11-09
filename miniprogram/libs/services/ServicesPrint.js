var request = require("./request.js").request,
  app = getApp();
module.exports = {
  getColorCard: function (o) {
    return request.GET("".concat(app.config.bingxiHost, "/api/v1/erp/products/", o),
      {},
      {
        headers: {
          "Content-Type": "application/json",
        },
      },
    );
  },
  neadendPrintSetting: function (o) {
    return request.GET(
      "".concat(app.config.bingxiHost, "/app-api/goods/print/neadendPrintSetting"),
      o,
      {
        headers: {
          "Content-Type": "application/json",
        },
      },
    );
  },
  neadendPrintLog: function (o) {
    return request.POST(
      "".concat(app.config.bingxiHost, "/app-api/neadend/print/log/neadend/printLog"),
      o,
      {
        headers: {
          "Content-Type": "application/json",
        },
      },
    );
  },
  neadendPrintCommand: function (o) {
    return request.POST("".concat(app.config.bingxiHost, "/app-api/neadend/print/newCommand"), o);
  },
  orderPrintCommand: function (o) {
    return request.POST(
      "".concat(app.config.bingxiHost, "/app-api/order/sale/billing/neadend/print/encodeCommand"),
      o,
    );
  },
  orderHeadPrintLog: function (o) {
    return request.POST(
      "".concat(app.config.bingxiHost, "/app-api/neadend/print/log/order/neadend/printLog"),
      o,
      {
        headers: {
          "Content-Type": "application/json",
        },
      },
    );
  },
  saveNeadendPrintSetting: function (o) {
    return request.POST(
      "".concat(app.config.bingxiHost, "/app-api/neadend/print/saveSetting"),
      o,
      {},
    );
  },
  logList: function (o) {
    return request.POST(
      "".concat(app.config.bingxiHost, "/app-api/shop/printer/getShopNeadPrintLogs"),
      o,
      {
        headers: {
          "Content-Type": "application/json",
        },
      },
    );
  },
  neadendPrintList: function (o) {
    return request.POST(
      "".concat(app.config.bingxiHost, "/app-api/shop/printer/getShopNeadPrintLogDetailList"),
      o,
      {
        headers: {
          "Content-Type": "application/json",
        },
      },
    );
  },
};
