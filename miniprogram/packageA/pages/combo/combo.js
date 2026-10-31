var toConsumableArray = require("../../../@babel/runtime/helpers/toConsumableArray"),
  objectSpread2 = require("../../../@babel/runtime/helpers/objectSpread2"),
  app = getApp(),
  Combo = require("../../services/Combo.js").Combo,
  a = null,
  i = 2e3;
Page({
  data: {
    open: !1,
    useImg: "".concat(app.config.imgHost, "/img/customer/duibuIcon/use_empty.png"),
    customsPhoneNum: "",
    canPurchase: !1,
    curRow: null,
    comboList: [],
    pageNum: 1,
    noDataBg: "".concat(app.config.imgHost, "/img/customer/duibuIcon/dz@2x.png"),
  },
  onLoad: function (o) {
    this.setData({
      canPurchase: "true" === o.canPurchase,
      customsPhoneNum: app.customsPhoneNum,
    });
  },
  onShow: function () {
    (this.setData({
      pageNum: 1,
      comboList: [],
    }),
      this.comboList());
  },
  callServicePhone: function () {
    wx.makePhoneCall({
      phoneNumber: this.data.customsPhoneNum,
    });
  },
  agreeHandle: function () {
    wx.downloadFile({
      url: "".concat(app.config.imgHost, "/product/ffxy.docx"),
      success: function (o) {
        var objectSpread2 = o.tempFilePath;
        wx.openDocument({
          filePath: objectSpread2,
          showMenu: !0,
          success: function (o) {
            console.log("打开文档成功");
          },
        });
      },
    });
  },
  comboList: function () {
    var app = this,
      a = {
        pageSize: 10,
        pageNum: this.data.pageNum,
      };
    (wx.showLoading(),
      Combo.comboList(a)
        .then(function (n) {
          if (0 === n.code) {
            var a = (n.data || []).map(function (o) {
              return objectSpread2(
                objectSpread2({}, o),
                {},
                {
                  benefitDescArr: o.benefitDesc ? o.benefitDesc.split("\n") : [],
                  duration: o.durationDesc ? o.durationDesc.split("个月")[0] : "",
                },
              );
            });
            app.setData({
              comboList: [].concat(toConsumableArray(app.data.comboList), toConsumableArray(a)),
            });
          } else
            wx.showToast({
              title: n.msg,
              icon: "none",
            });
        })
        .catch(function (o) {
          (console.error("获取套餐列表失败", o),
            wx.showToast({
              title: "获取套餐列表失败",
              icon: "none",
            }));
        })
        .finally(function () {
          return wx.hideLoading();
        }));
  },
  selectCombo: function (o) {
    this.data.canPurchase
      ? (this.setData({
          curRow: o.currentTarget.dataset.item,
        }),
        this.comboCreate())
      : this.setData({
          open: !0,
        });
  },
  comboCreate: function () {
    var toConsumableArray = this;
    (wx.showLoading({
      title: "正在下单",
    }),
      wx.login({
        success: function (t) {
          if ("login:ok" === t.errMsg) {
            var app = {
              channel: 1,
              packageId: toConsumableArray.data.curRow.id,
              wxCode: t.code,
            };
            Combo.comboCreate(app)
              .then(function (t) {
                if (0 !== t.code)
                  return (
                    wx.showToast({
                      title: t.msg,
                      icon: "none",
                    }),
                    void wx.hideLoading()
                  );
                var app = t.data.payNo;
                wx.requestPayment({
                  timeStamp: t.data.jsapiParameters.timeStamp,
                  nonceStr: t.data.jsapiParameters.nonceStr,
                  package: t.data.jsapiParameters.package,
                  signType: t.data.jsapiParameters.signType,
                  paySign: t.data.jsapiParameters.paySign,
                  success: function () {
                    (wx.showToast({
                      title: "支付成功",
                    }),
                      toConsumableArray.startPollPayResult(app));
                  },
                  fail: function (o) {
                    console.log("支付失败详情", o);
                    var objectSpread2 = "支付失败";
                    (o.errMsg.includes("cancel") && (t = "用户取消支付"),
                      wx.showToast({
                        title: objectSpread2,
                        icon: "none",
                      }));
                  },
                  complete: function () {
                    wx.hideLoading();
                  },
                });
              })
              .catch(function (o) {
                (console.error("下单接口异常", o),
                  wx.showToast({
                    title: "创建订单失败",
                    icon: "none",
                  }),
                  wx.hideLoading());
              });
          } else
            (wx.hideLoading(),
              wx.showToast({
                title: "登录失败，请重试",
                icon: "none",
              }));
        },
        fail: function () {
          (wx.hideLoading(),
            wx.showToast({
              title: "登录失败，请重试",
              icon: "none",
            }));
        },
      }));
  },
  startPollPayResult: function (o) {
    var objectSpread2 = this;
    a && (clearTimeout(a), (a = null));
    var app = 0;
    wx.showLoading({
      title: "查询订单状态...",
    });
    var s = function () {
      (app++,
        Combo.payResult(o)
          .then(function (o) {
            if (0 === o.code && o.data) {
              if ("SUCCESS" === o.data.state)
                return (
                  (a = null),
                  wx.hideLoading(),
                  wx.showToast({
                    title: "订单已生效",
                  }),
                  objectSpread2.onShow(),
                  void objectSpread2.setData({
                    canPurchase: !1,
                  })
                );
              if (2 === o.data.state)
                return (
                  (a = null),
                  wx.hideLoading(),
                  void wx.showToast({
                    title: "订单支付未成功",
                    icon: "none",
                  })
                );
            }
            if (app >= 20)
              return (
                (a = null),
                wx.hideLoading(),
                void wx.showToast({
                  title: "查询超时，请稍后查看订单状态",
                  icon: "none",
                })
              );
            a = setTimeout(s, i);
          })
          .catch(function (o) {
            if ((console.error("查询订单接口报错", o), app >= 20))
              return (
                (a = null),
                wx.hideLoading(),
                void wx.showToast({
                  title: "查询订单失败，请稍后查看订单状态",
                  icon: "none",
                })
              );
            a = setTimeout(s, i);
          }));
    };
    a = setTimeout(s, i);
  },
  onUnload: function () {
    a && (clearTimeout(a), (a = null), wx.hideLoading());
  },
});
