var aes_util = require("./utils/aes_util.js");
Component({
  options: {
    multipleSlots: !0,
  },
  properties: {
    opt: {
      type: Object,
      value: null,
    },
  },
  data: {
    show: !1,
    token: "",
    secretKey: "",
    originalImageBase64: "",
    jigsawImageBase64: "",
    verifyImgOutHeight: "",
    verifySubBlockWidth: "",
    verifySubBlockTop: "",
    leftBarClass: "status-1",
    verifyTipsClass: "",
    verifyTipsText: "",
    verifyMsgText: "",
    verifyBarAreaClass: "",
    clickWordTapName: "",
    clickWordTapNum: 0,
    clickWordXYList: [],
    clickWordPointList: [
      {
        left: 0,
        top: 0,
        display: "none",
      },
      {
        left: 0,
        top: 0,
        display: "none",
      },
      {
        left: 0,
        top: 0,
        display: "none",
      },
      {
        left: 0,
        top: 0,
        display: "none",
      },
      {
        left: 0,
        top: 0,
        display: "none",
      },
    ],
    backImgLeft: 0,
    backImgTop: 0,
  },
  lifetimes: {
    attached: function () {
      var aes_util = this,
        e = aes_util._extend(
          {
            baseUrl: "https://captcha.anji-plus.com/captcha-api",
            mode: "pop",
            captchaType: "blockPuzzle",
            imgSize: {
              width: "310px",
              height: "155px",
            },
            barHeight: "40px",
            vSpace: 5,
            success: function (t) {},
            fail: function (t) {},
          },
          aes_util.data.opt,
        );
      (console.log(e),
        "clickWord" == e.captchaType &&
          "fixed" == e.mode &&
          wx
            .createSelectorQuery()
            .in(aes_util)
            .select(".backImg")
            .boundingClientRect(function (e) {
              (console.log(e),
                aes_util.setData({
                  backImgLeft: e.left,
                  backImgTop: e.top,
                }));
            })
            .exec(),
        aes_util.setData({
          verifyImgOutHeight: parseInt(e.imgSize.height) + parseInt(e.vSpace) + "px",
          verifySubBlockWidth: Math.floor((47 * parseInt(e.imgSize.width)) / 310) + "px",
          verifySubBlockTop: "-" + (parseInt(e.imgSize.height) + parseInt(e.vSpace)) + "px",
          show: "pop" != e.mode,
        }),
        aes_util._uuid(),
        aes_util._refresh());
    },
  },
  methods: {
    show: function () {
      var aes_util = this;
      this.setData(
        {
          show: !0,
        },
        function () {
          "clickWord" == aes_util.data.opt.captchaType &&
            "pop" == aes_util.data.opt.mode &&
            wx
              .createSelectorQuery()
              .in(aes_util)
              .select(".backImg")
              .boundingClientRect(function (e) {
                (console.log(e),
                  aes_util.setData({
                    backImgLeft: e.left,
                    backImgTop: e.top,
                  }));
              })
              .exec();
        },
      );
    },
    hide: function () {
      (this.setData({
        show: !1,
      }),
        this.triggerEvent("close"));
    },
    reload: function () {
      var aes_util = this,
        e = aes_util.data.opt;
      (console.log(e),
        "clickWord" == e.captchaType &&
          "fixed" == e.mode &&
          wx
            .createSelectorQuery()
            .in(aes_util)
            .select(".backImg")
            .boundingClientRect(function (e) {
              aes_util.setData({
                backImgLeft: e.left,
                backImgTop: e.top,
              });
            })
            .exec(),
        aes_util.setData({
          verifyImgOutHeight: parseInt(e.imgSize.height) + parseInt(e.vSpace) + "px",
          verifySubBlockWidth: Math.floor((47 * parseInt(e.imgSize.width)) / 310) + "px",
          verifySubBlockTop: "-" + (parseInt(e.imgSize.height) + parseInt(e.vSpace)) + "px",
          show: "pop" != e.mode,
        }),
        aes_util._refresh());
    },
    _blockPuzzleCheck: function (e) {
      console.log("开始校验：" + JSON.stringify(e));
      var a = this,
        o = a.data.opt.baseUrl + "/captcha/check",
        i = (i =
          "blockPuzzle" == a.data.opt.captchaType
            ? wx.getStorageSync("slider")
            : wx.getStorageSync("point")),
        s = (e.offsetX / parseInt(a.data.opt.imgSize.width)) * 310;
      console.log("移动距离:" + e.offsetX + "\t换算比例距离X:" + s);
      var c = JSON.stringify({
          x: s,
          y: 5,
        }),
        r = {
          captchaType: a.data.opt.captchaType,
          pointJson: a.data.secretKey ? aes_util.AesEncrypt(c, a.data.secretKey) : c,
          token: a.data.token,
          clientUid: i,
          ts: Date.now(),
        };
      a._postData(o, r, function (o) {
        "0000" == o.data.repCode
          ? (console.log(e.expendTime + "s验证成功"),
            a.setData({
              leftBarClass: "status-4",
              verifyTipsClass: "suc-bg",
              verifyTipsText: e.expendTime + "s验证成功",
            }),
            setTimeout(function () {
              (a._refresh(), "pop" == a.data.opt.mode && a.hide());
              var e = a.data.token + "---" + c;
              ((e = a.data.secretKey ? aes_util.AesEncrypt(e, a.data.secretKey) : e),
                "function" == typeof a.data.opt.success &&
                  a.data.opt.success({
                    captchaVerification: e,
                    clientUid: i,
                  }),
                a.triggerEvent("success", {
                  captchaVerification: e,
                  clientUid: i,
                }));
            }, 700))
          : (a.setData({
              leftBarClass: "status-3",
              verifyTipsClass: "err-bg",
              verifyTipsText: o.data.repMsg,
            }),
            "function" == typeof a.data.opt.fail && a.data.opt.fail(o.data),
            setTimeout(function () {
              a._refresh();
            }, 700));
      });
    },
    _clickWordTap: function (e) {
      var a = this;
      console.log(e);
      var o = e.detail.x,
        i = e.detail.y;
      if (
        (a._setPoint(o, i),
        console.log(a.data.clickWordTapNum),
        console.log(a.data.clickWordXYList),
        a.data.clickWordTapNum > 2)
      ) {
        a.setData({
          clickWordTapName: "",
        });
        var s = a.data.opt.baseUrl + "/captcha/check",
          c = (c =
            "blockPuzzle" == a.data.opt.captchaType
              ? wx.getStorageSync("slider")
              : wx.getStorageSync("point")),
          r = JSON.stringify(a.data.clickWordXYList),
          p = {
            captchaType: a.data.opt.captchaType,
            pointJson: a.data.secretKey ? aes_util.AesEncrypt(r, a.data.secretKey) : r,
            token: a.data.token,
            clientUid: c,
            ts: Date.now(),
          };
        (console.log(p),
          a._postData(s, p, function (e) {
            "0000" == e.data.repCode
              ? (a.setData({
                  verifyMsgText: "验证成功",
                  verifyBarAreaClass: "suc-area",
                }),
                setTimeout(function () {
                  (a._refresh(), "pop" == a.data.opt.mode && a.hide());
                  var e = a.data.token + "---" + r;
                  ((e = a.data.secretKey ? aes_util.AesEncrypt(e, a.data.secretKey) : e),
                    "function" == typeof a.data.opt.success &&
                      a.data.opt.success({
                        captchaVerification: e,
                      }),
                    a.triggerEvent("success", {
                      captchaVerification: e,
                    }));
                }, 700))
              : (a.setData({
                  verifyMsgText: "验证失败",
                  verifyBarAreaClass: "err-area",
                }),
                "function" == typeof a.data.opt.fail && a.data.opt.fail(e.data),
                setTimeout(function () {
                  a._refresh();
                }, 700));
          }));
      }
    },
    _setPoint: function (t, e) {
      var a = this,
        o = a.data.clickWordXYList,
        i = a.data.clickWordPointList,
        s = t - a.data.backImgLeft,
        c = e - a.data.backImgTop;
      console.log(
        "点击位置：" +
          t +
          "\t" +
          e +
          "\t底图位置：" +
          a.data.backImgLeft +
          "\t" +
          a.data.backImgTop,
      );
      var r = (s / parseInt(a.data.opt.imgSize.width)) * 310,
        p = (c / parseInt(a.data.opt.imgSize.width)) * 310;
      (o.push({
        x: r,
        y: p,
      }),
        (i[a.data.clickWordTapNum] = {
          left: s - 10 + "px",
          top: c - 10 + "px",
          display: "block",
        }),
        a.setData({
          clickWordTapNum: ++a.data.clickWordTapNum,
          clickWordXYList: o,
          clickWordPointList: i,
        }));
    },
    _refresh: function () {
      var aes_util = this,
        e = aes_util.data.opt.baseUrl + "/captcha/get",
        a = "";
      a =
        "blockPuzzle" == aes_util.data.opt.captchaType
          ? wx.getStorageSync("slider")
          : wx.getStorageSync("point");
      var o = {
        captchaType: aes_util.data.opt.captchaType,
        clientUid: a,
        ts: Date.now(),
      };
      (console.log(o),
        aes_util._postData(e, o, function (e) {
          if ("0000" == e.data.repCode) {
            var a =
              "blockPuzzle" == o.captchaType
                ? "向右滑动完成验证"
                : "请依次点击【" + e.data.repData.wordList.join(",") + "】";
            aes_util.setData({
              originalImageBase64: "data:image/png;base64," + e.data.repData.originalImageBase64,
              jigsawImageBase64: "data:image/png;base64," + e.data.repData.jigsawImageBase64,
              secretKey: e.data.repData.secretKey,
              token: e.data.repData.token,
              leftBarClass: "status-1",
              verifyTipsClass: "",
              verifyTipsText: "",
              verifyMsgText: a,
              verifyBarAreaClass: "",
              clickWordTapName: "blockPuzzle" == o.captchaType ? "" : "_clickWordTap",
              clickWordTapNum: 0,
              clickWordXYList: [],
              clickWordPointList: [
                {
                  left: 0,
                  top: 0,
                  display: "none",
                },
                {
                  left: 0,
                  top: 0,
                  display: "none",
                },
                {
                  left: 0,
                  top: 0,
                  display: "none",
                },
                {
                  left: 0,
                  top: 0,
                  display: "none",
                },
                {
                  left: 0,
                  top: 0,
                  display: "none",
                },
              ],
            });
          } else
            (aes_util.setData({
              leftBarClass: "status-3",
              verifyTipsClass: "err-bg",
              verifyTipsText: e.data.repMsg,
            }),
              setTimeout(function () {
                aes_util._refresh();
              }, 700));
        }));
    },
    _uuid: function () {
      for (var aes_util = [], e = "0123456789abcdef", a = 0; a < 36; a++)
        aes_util[a] = e.substr(Math.floor(16 * Math.random()), 1);
      ((aes_util[14] = "4"),
        (aes_util[19] = e.substr((3 & aes_util[19]) | 8, 1)),
        (aes_util[8] = aes_util[13] = aes_util[18] = aes_util[23] = "-"));
      var o = "slider-" + aes_util.join(""),
        i = "point-" + aes_util.join("");
      (wx.getStorageSync("slider") || wx.setStorageSync("slider", o),
        wx.getStorageSync("point") || wx.setStorageSync("point", i));
    },
    _postData: function (t, e, a) {
      wx.request({
        url: t,
        data: JSON.stringify(e),
        method: "POST",
        enableCache: !1,
        header: {
          "Content-Type": "application/json;charset=UTF-8",
        },
        success: function (t) {
          var e = t.statusCode;
          200 != e
            ? wx.showToast({
                title: "响应错误:\t" + e,
                icon: "error",
                duration: 2e3,
              })
            : "function" == typeof a && a(t);
        },
        fail: function (t) {
          wx.showToast({
            title: "网络错误",
            icon: "error",
            duration: 2e3,
          });
        },
      });
    },
    _extend: function (t, e) {
      var a = {};
      for (var o in t) a[o] = t[o];
      for (var o in e) a[o] = e[o];
      return (
        this.setData({
          opt: a,
        }),
        a
      );
    },
  },
});
