var e = (0, require("../../../../@babel/runtime/helpers/interopRequireDefault").default)(
    require("../../../../utils/mta_analysis"),
  ),
  services_demand = require("../../../services/services-demand"),
  ServicesUserLog = require("../../../services/ServicesUserLog"),
  app = getApp();
Page({
  data: {
    userAuthList: [],
    web: "",
    billingIds: [],
    imageList: [],
    index: 0,
    onlyDebt: "",
    queryParams: {},
    isSingleCustomer: !1,
  },
  onLoad: function (t) {
    e.default.Page.init();
    var ServicesUserLog = wx.getStorageSync("token") || "";
    this.setData({
      queryParams: t,
    });
    var n = t.customerId,
      s = t.printCopies,
      o = t.startTime,
      r = t.endTime,
      c = t.billingIds,
      u = t.onlyDebt;
    if (n && "" != n) {
      var l = {
          printCopies: s,
          startTime: o && o + " 00:00:00",
          endTime: r && r + " 23:59:59",
          onlyDebt: u,
          billingIds: c,
        },
        d = app.config.rootHost,
        g = ""
          .concat(d, "/app-api/customer/two/reconciliation/previewImage/")
          .concat(n, "?token=")
          .concat(ServicesUserLog, "&printCopies=")
          .concat(s, "&startTime=")
          .concat(o, "&endTime=")
          .concat(r, "&onlyDebt=")
          .concat(u, "&billingIds=")
          .concat(c);
      (this.setData({
        web: g,
        isSingleCustomer: !0,
      }),
        this.getPreviewImage(n, l));
    } else
      (this.setData({
        isSingleCustomer: !1,
      }),
        this.getAllImage(JSON.parse(t.printConfig)));
  },
  getPreviewImage: function (e, i) {
    var app = this;
    (wx.showLoading({
      title: "",
    }),
      services_demand.ServicesDemand.previewDue(e, i).then(function (e) {
        (wx.hideLoading(),
          0 === e.code
            ? app.setData({
                imageList: e.data,
              })
            : wx.showToast({
                title: e.msg,
                icon: "none",
              }));
      }));
  },
  getAllImage: function (e) {
    var ServicesUserLog = this;
    (wx.showLoading({
      title: "",
    }),
      services_demand.ServicesDemand.previewAllDue(e).then(function (e) {
        (wx.hideLoading(),
          0 === e.code
            ? ServicesUserLog.setData({
                imageList: e.data,
              })
            : wx.showToast({
                title: e.msg,
                icon: "none",
              }));
      }));
  },
  imgPre: function () {
    wx.previewImage({
      urls: this.data.imageList,
    });
  },
  saveImg: function () {
    this.sampleSaveImg();
  },
  sampleSaveImg: function () {
    var e = this;
    wx.downloadFile({
      url: this.data.imageList[this.data.index],
      success: function (t) {
        var app = this;
        wx.saveImageToPhotosAlbum({
          filePath: t.tempFilePath,
          success: function () {
            if (e.data.index == e.data.imageList.length - 1) {
              var services_demand = e.data.queryParams.onlyDebt
                ? "1" === e.data.queryParams.onlyDebt
                  ? 409
                  : e.data.isSingleCustomer
                    ? 408
                    : 407
                : 407;
              return (
                ServicesUserLog.servicesUserLog.setUserHandleLog(services_demand),
                wx.showToast({
                  title: "保存成功",
                  icon: "success",
                  duration: 2e3,
                }),
                void (e.data.index = 0)
              );
            }
            ((e.data.index = e.data.index + 1), e.sampleSaveImg());
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
                        app.setData({
                          showAuth: !0,
                        });
                      },
                    });
                },
              });
          },
        });
      },
      fail: function () {
        wx.showToast({
          title: "保存失败",
          icon: "success",
          duration: 2e3,
        });
      },
    });
  },
  onReady: function () {},
  onShow: function () {},
  onHide: function () {},
  onUnload: function () {},
  onPullDownRefresh: function () {},
  onReachBottom: function () {},
  onShareAppMessage: function () {},
});
