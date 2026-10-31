var objectSpread2 = require("../../../@babel/runtime/helpers/objectSpread2"),
  ServicesPrint = require("../../../libs/services/ServicesPrint.js"),
  ServicesCard = require("../../../libs/services/ServicesCard.js").servicesCard,
  ServicesShop = require("../../../libs/services/ServicesShop.js").servicesShop;
var app = getApp();
Page({
  data: {
    headType: "",
    printType: "",
    printList: [],
    currentIndex: "",
    sendData: [],
    sendData64: [],
    sendData64Gp: [],
    sendData64TTR: [],
    showM: !1,
    remark: "",
    remarkIndex: "",
    isUseful: !0,
    maskDispaly: !1,
    successText: "返回",
    platform: "android",
    deviceId: "",
    serviceId: "",
    writeId: "",
    readId: "",
    notifyId: "",
    icon: {
      print: "".concat(app.config.imgHost, "/img/customer/duibuIcon/icon/Icon_Priint_Ok.png"),
    },
  },
  selectPackgeLength: function () {
    console.log("selectPackgeLength");
    var objectSpread2 = wx.getStorageSync("printCommand");
    (console.log("printCommand:", objectSpread2),
      this.setData({
        sendData64: objectSpread2,
      }));
    var ServicesPrint = wx.getStorageSync("printCommandGp") || [];
    (console.log("printCommandGp:", ServicesPrint),
      this.setData({
        sendData64Gp: ServicesPrint,
      }));
    var ServicesCard = wx.getStorageSync("printCommandTTR") || [];
    (console.log("printCommandTTR:", ServicesCard),
      this.setData({
        sendData64TTR: ServicesCard,
      }));
  },
  onLoad: function (e) {
    ((this.data.sysInfo = wx.getSystemInfoSync()),
      wx.hideShareMenu(),
      this.setData({
        platform: this.data.sysInfo.platform,
      }),
      e.printType &&
        this.setData({
          printType: e.printType,
        }),
      e.headType &&
        this.setData({
          headType: e.headType,
        }));
  },
  onShow: function () {
    this.selectPackgeLength();
    var objectSpread2 = wx.getStorageSync("printList");
    objectSpread2 && 0 !== objectSpread2.length
      ? objectSpread2.length > 0 &&
        (this.setData({
          printList: objectSpread2,
        }),
        ServicesShop.operateAccess({
          type: "108",
          content: objectSpread2.length,
        }).then(function (e) {}))
      : this.setData({
          printList: [],
        });
  },
  goSearch: function () {
    wx.navigateTo({
      url: "/packageB/pages/personal-center/link-print-new/link-print-new",
    });
  },
  testPrint: function (e) {
    var ServicesPrint = this;
    (ServicesPrint.setData({
      deviceId: ServicesPrint.data.printList[e.currentTarget.dataset.index].deviceId,
      currentIndex: e.currentTarget.dataset.index,
    }),
      wx.openBluetoothAdapter({
        complete: function (a) {
          ServicesPrint.connectDevice(e.currentTarget.dataset.index);
        },
      }));
  },
  connectDevice: function (e) {
    var ServicesPrint = this,
      ServicesCard = ServicesPrint.data.printList[e].deviceId;
    (wx.showLoading({
      title: "连接中...",
      mask: !0,
    }),
      wx.createBLEConnection({
        deviceId: ServicesCard,
        success: function (e) {
          (wx.hideLoading(),
            ServicesCard &&
              "" !== ServicesCard &&
              (wx.showToast({
                title: "连接成功",
                printList: [],
              }),
              ServicesPrint.setData({
                deviceId: ServicesCard,
              }),
              ServicesPrint.getDeviceService(ServicesCard)));
        },
        fail: function (e) {
          ServicesCard &&
            "" !== ServicesCard &&
            (console.log("连接失败"), ServicesPrint.connectFail());
        },
      }));
  },
  notConnected: function () {
    (this.showTip("打印机未打开或离手机太远,请确认后重试"),
      wx.closeBluetoothAdapter({
        complete: function (e) {},
      }));
  },
  connectFail: function () {
    (wx.hideLoading(),
      this.showTip("设备连接错误，请重新扫描连接"),
      wx.closeBluetoothAdapter({
        complete: function (e) {},
      }));
  },
  getDeviceService: function (e) {
    var ServicesPrint = this;
    new Promise(function (a, i) {
      wx.getBLEDeviceServices({
        deviceId: e,
        success: function (n) {
          var s = ServicesPrint.filterService(n.services);
          ("" != s
            ? (ServicesPrint.setData({
                serviceId: s,
              }),
              ServicesPrint.getDeviceCharacter(ServicesPrint.data.currentIndex))
            : (ServicesPrint.closeBLEConnection(e), i("没有找到主服务")),
            console.log("success"),
            a(s));
        },
        fail: function (a) {
          (ServicesPrint.closeBLEConnection(e), i("搜索设备服务失败"));
        },
      });
    })
      .then(function (e) {
        "" !== e &&
          (ServicesPrint.setData({
            serviceId: serviceId,
          }),
          ServicesPrint.getDeviceCharacter(this.data.currentIndex));
      })
      .catch(function (e) {
        ServicesPrint.showTip(e);
      });
  },
  getDeviceCharacter: function (e) {
    var ServicesPrint = this,
      ServicesCard = ServicesPrint.data.printList[e];
    ServicesPrint.data.sendData64;
    ((ServicesCard.name || "").startsWith("QR") &&
      ServicesPrint.data.sendData64Gp.length > 0 &&
      ServicesPrint.data.sendData64Gp,
      (ServicesCard.name || "").startsWith("HT") &&
        ServicesPrint.data.sendData64TTR.length > 0 &&
        ServicesPrint.data.sendData64TTR,
      wx.getBLEDeviceCharacteristics({
        deviceId: ServicesPrint.data.deviceId,
        serviceId: ServicesPrint.data.serviceId,
        success: function (e) {
          (ServicesPrint.filterCharacter(e.characteristics),
            "" == ServicesPrint.data.writeId &&
              (ServicesPrint.closeBLEConnection(), ServicesPrint.showTip("获取特征值失败")));
        },
        fail: function (e) {
          (ServicesPrint.closeBLEConnection(), ServicesPrint.showTip("获取特征值失败"));
        },
      }));
  },
  passData: function () {
    var objectSpread2 = this.data.deviceId,
      ServicesPrint = this.data.serviceId,
      ServicesCard = this.data.writeId,
      ServicesShop = (this.data.readId, this);
    new Promise(function (n, s) {
      (ServicesShop.writeBLECharacteristicValue(objectSpread2, ServicesPrint, ServicesCard, 1),
        n("ok"));
    })
      .then(function (e) {})
      .catch(function (e) {
        console.log("my error:" + e);
      });
  },
  filterService: function (e) {
    for (var ServicesPrint = "", ServicesCard = 0; ServicesCard < e.length; ServicesCard++) {
      var ServicesShop = e[ServicesCard].uuid.toUpperCase();
      if (
        -1 != ServicesShop.indexOf("0000EEE0-0000-1000-8000-00805F9B34FB") ||
        -1 != ServicesShop.indexOf("0000FF00-0000-1000-8000-00805F9B34FB") ||
        -1 != ServicesShop.indexOf("49535343-FE7D-4AE5-8FA9-9FAFD205E455") ||
        -1 != ServicesShop.indexOf("49535343-FE7D-4AE5-8FA9-9FAFD205E455")
      ) {
        t = e[ServicesCard].uuid;
        break;
      }
    }
    return ServicesPrint;
  },
  filterCharacter: function (e) {
    for (
      var ServicesPrint = this,
        ServicesCard = (ServicesPrint.data.deviceId, ServicesPrint.data.serviceId, ""),
        ServicesShop = "",
        app = "",
        s = 0;
      s < e.length;
      s++
    ) {
      var c = e[s];
      (c.properties.write && (a = c.uuid),
        c.properties.read && (i = c.uuid),
        c.properties.notify && (n = c.uuid));
    }
    (ServicesPrint.setData({
      writeId: ServicesCard,
      readId: ServicesShop,
      notifyId: app,
    }),
      this.passData());
  },
  writeBLECharacteristicValue: function (e, t, a, i) {
    var app = this,
      s = (app.data.printList[app.data.currentIndex], app.data.sendData64);
    if (s.length >= i)
      wx.writeBLECharacteristicValue({
        deviceId: e,
        serviceId: t,
        characteristicId: a,
        value: wx.base64ToArrayBuffer(s[i - 1]),
        success: function (s) {
          (wx.showLoading({
            title: "传输中...",
            mask: !0,
          }),
            app.writeBLECharacteristicValue(e, t, a, ++i));
        },
        fail: function (i) {
          (console.log("deviceId:" + e),
            console.log("serviceId:" + t),
            console.log("writeId:" + a),
            app.showTip("传输失败"),
            app.closeBLEConnection());
        },
      });
    else {
      (console.log("======数据完成 ======="), wx.hideLoading());
      var c = app.data.readId;
      (wx.readBLECharacteristicValue({
        deviceId: e,
        serviceId: t,
        characteristicId: c,
        success: function (e) {
          console.log("readBLECharacteristicValue:", e);
        },
      }),
        app.askResult(),
        app.closeBLEConnection());
    }
  },
  closeBLEConnection: function () {
    wx.closeBLEConnection({
      deviceId: this.data.deviceId,
      success: function (e) {},
    });
  },
  askResult: function () {
    var ServicesShop = this;
    if (((this.data.isUseful = !1), 2 == this.data.printType)) {
      this.setData({
        maskDispaly: !0,
      });
      var app = wx.getStorageSync("printParams");
      1 == this.data.headType
        ? (0, ServicesPrint.neadendPrintLog)(app).then(function (e) {
            0 === e.code
              ? ServicesShop.setData({
                  successText: "返回色卡管理",
                })
              : wx.showToast({
                  title: e.msg,
                  icon: "none",
                });
          })
        : 2 == this.data.headType &&
          (0, ServicesPrint.orderHeadPrintLog)(app).then(function (e) {
            0 === e.code
              ? ServicesShop.setData({
                  successText: "返回",
                })
              : wx.showToast({
                  title: e.msg,
                  icon: "none",
                });
          });
    } else {
      this.showTip("打印完成");
      var s = wx.getStorageSync("printParams"),
        c = objectSpread2(
          {
            id: s.goodsId,
            printCopies: s.copies,
          },
          s,
        );
      ServicesCard.updatePrintInfoCount(c).then(function (e) {
        0 === e.code ? console.log("打印标签成功") : wx.hideLoading();
      });
    }
  },
  showTip: function (e) {
    ((this.data.isUseful = !1),
      wx.hideLoading(),
      wx.showModal({
        content: e,
        showCancel: !1,
      }));
  },
  closeMask: function () {
    this.setData({
      maskDispaly: !1,
    });
  },
  gobackColorCard: function () {
    var objectSpread2,
      ServicesPrint = getCurrentPages();
    (ServicesPrint.forEach(function (a, i) {
      "pages/color-card-management/color-card-management" == a.route &&
        (e = ServicesPrint.length - i);
    }),
      wx.navigateBack({
        delta: objectSpread2 - 1,
      }));
  },
});
