(Object.defineProperty(exports, "__esModule", {
  value: !0,
}),
  (exports.default = void 0));
var classCallCheck = require("../../@babel/runtime/helpers/classCallCheck"),
  createClass = require("../../@babel/runtime/helpers/createClass"),
  a = (function () {
    return createClass(
      function t() {
        classCallCheck(this, t);
      },
      [
        {
          key: "test",
          value: function () {},
        },
        {
          key: "shareM",
          value: function (e) {
            var createClass = this;
            (wx.showLoading({
              title: "正在生成图片...",
              mask: !0,
            }),
              Promise.all([this.getCanvasImg(), this.getQRCode(e.detail.goodsid)]).then(
                function () {
                  var classCallCheck = createClass.data.popupInit.canvas.canvasId.shareCanvas,
                    a = createClass.data.popupInit.canvas.canvasId.photoCanvas,
                    i = wx.createCanvasContext(classCallCheck),
                    s = wx.createCanvasContext(a),
                    l = createClass.data.shareFriendData.businessProductName,
                    n = "";
                  n =
                    0 == createClass.data.shareFriendData.price ||
                    "0.0" == createClass.data.shareFriendData.price
                      ? "面议"
                      : "¥ "
                          .concat(createClass.data.shareFriendData.price, "/")
                          .concat(createClass.data.shareFriendData.priceUnit);
                  var o = "长按识别",
                    r = "查看更多商品",
                    c = createClass.data.tempImgUrl.goodUrl,
                    u = createClass.data.tempImgUrl.qrUrl;
                  (i.setFillStyle("white"),
                    i.fillRect(0, 0, 250, 450),
                    i.drawImage(c, 25, 40, 200, 267),
                    i.drawImage(u, 140, 345, 100, 100),
                    i.setFontSize(14),
                    i.setFillStyle("#333333"),
                    i.setTextAlign("left"),
                    i.fillText(l, 25, 330),
                    i.setFontSize(14),
                    i.setFillStyle("#ff0000"),
                    i.setTextAlign("left"),
                    i.fillText(n, 25, 355),
                    i.setFontSize(10),
                    i.setFillStyle("#333333"),
                    i.setTextAlign("left"),
                    i.fillText(o, 25, 395),
                    i.setFontSize(10),
                    i.setFillStyle("#333333"),
                    i.setTextAlign("left"),
                    i.fillText(r, 25, 415),
                    i.stroke(),
                    i.draw(),
                    s.setFillStyle("white"),
                    s.fillRect(0, 0, 500, 900),
                    s.drawImage(c, 50, 80, 400, 534),
                    s.drawImage(u, 280, 690, 200, 200),
                    s.setFontSize(28),
                    s.setFillStyle("#333333"),
                    s.setTextAlign("left"),
                    s.fillText(l, 50, 660),
                    s.setFontSize(28),
                    s.setFillStyle("#ff0000"),
                    s.setTextAlign("left"),
                    s.fillText(n, 50, 710),
                    s.setFontSize(20),
                    s.setFillStyle("#333333"),
                    s.setTextAlign("left"),
                    s.fillText(o, 50, 790),
                    s.setFontSize(20),
                    s.setFillStyle("#333333"),
                    s.setTextAlign("left"),
                    s.fillText(r, 50, 830),
                    s.stroke(),
                    s.draw(),
                    wx.hideLoading());
                },
              ));
          },
        },
        {
          key: "saveCanvas",
          value: function (e) {
            var createClass = this,
              a = e;
            wx.showLoading({
              title: "正在保存图片...",
              mask: !0,
            });
            var i = setTimeout(function () {
              wx.canvasToTempFilePath({
                x: 0,
                y: 0,
                width: 750,
                height: 1350,
                destWidth: 750 * utils.getDpr(),
                destHeight: 1350 * utils.getDpr(),
                quality: 1,
                canvasId: a,
                success: function (e) {
                  (wx.hideLoading(),
                    wx.saveImageToPhotosAlbum({
                      filePath: e.tempFilePath,
                      success: function () {
                        (wx.showToast({
                          title: "图片已保存到相册",
                          icon: "success",
                        }),
                          createClass.setData({
                            "popupInit.canvas.show": !1,
                          }));
                      },
                      fail: function (e) {
                        "saveImageToPhotosAlbum:fail auth deny" === e.errMsg &&
                          wx.showModal({
                            title: "提示",
                            content: "您拒绝了保存权限，请打开保存权限",
                            success: function (e) {
                              e.confirm &&
                                wx.openSetting({
                                  success: function (e) {
                                    e.authSetting = {
                                      "scope.writePhotosAlbum": !0,
                                    };
                                  },
                                  fail: function (e) {
                                    createClass.setData({
                                      showAuth: !0,
                                    });
                                  },
                                });
                            },
                          });
                      },
                    }),
                    clearTimeout(i));
                },
              });
            }, 3e3);
          },
        },
      ],
    );
  })();
exports.default = new a();
