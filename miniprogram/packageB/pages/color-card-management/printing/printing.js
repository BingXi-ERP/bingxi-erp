var objectSpread2 = require("../../../../@babel/runtime/helpers/objectSpread2"),
  ServicesPrint = require("../../../../libs/services/ServicesPrint"),
  app = getApp(),
  ServicesCard = require("../../../../libs/services/ServicesCard.js").servicesCard,
  ServicesShop = require("../../../../libs/services/ServicesShop.js").servicesShop;
Page({
  data: {
    headType: "",
    printType: "",
    printList: [],
    sendData64: [],
    sendData64Gp: [],
    sendData64TTR: [],
    showM: !1,
    remark: "",
    remarkIndex: "",
    isUseful: !0,
    maskDispaly: !1,
    successText: "返回",
    icon: {
      print: "".concat(app.config.imgHost, "/img/customer/duibuIcon/icon/Icon_Priint_Ok.png"),
    },
  },
  onLoad: function (e) {
    var ServicesPrint = wx.getSystemInfoSync();
    ((this.data.sysInfo = ServicesPrint),
      this.selectPackgeLength(),
      wx.hideShareMenu(),
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
    var objectSpread2 = wx.getStorageSync("printList");
    objectSpread2 && objectSpread2.length > 0
      ? (this.setData({
          printList: objectSpread2,
        }),
        ServicesShop.operateAccess({
          type: "108",
          content: objectSpread2.length,
        }).then(function (e) {}))
      : wx.showModal({
          content: "未连接打印机，是否现在连接",
          confirmText: "是",
          success: function (e) {
            e.confirm
              ? wx.navigateTo({
                  url: "/packageB/pages/personal-center/link-print/link-print",
                  success: function () {},
                })
              : e.cancel && console.log("用户点击取消");
          },
        });
  },
  selectPackgeLength: function () {
    var objectSpread2 = wx.getStorageSync("printCommand");
    this.setData({
      sendData64: objectSpread2,
    });
    var ServicesPrint = wx.getStorageSync("printCommandGp") || [];
    this.setData({
      sendData64Gp: ServicesPrint,
    });
    var app = wx.getStorageSync("printCommandTTR") || [];
    this.setData({
      sendData64TTR: app,
    });
  },
  testPrint: function (e) {
    (this.start(e.currentTarget.dataset.index), (this.data.isUseful = !0));
  },
  start: function (e) {
    var ServicesPrint = this;
    wx.openBluetoothAdapter({
      complete: function (i) {
        ServicesPrint.getBluetoothAdapterState(e);
      },
    });
  },
  getBluetoothAdapterState: function (e) {
    var ServicesPrint = this;
    wx.getBluetoothAdapterState({
      complete: function (i) {
        i && i.available ? ServicesPrint.startSearch(e) : ServicesPrint.showTip("请开启手机蓝牙");
      },
    });
  },
  startSearch: function (e) {
    var ServicesPrint = this;
    wx.startBluetoothDevicesDiscovery({
      services: [],
      complete: function (i) {
        (wx.showLoading({
          title: "连接打印机",
          mask: !0,
        }),
          ServicesPrint.getDevicesFun(1, ServicesPrint.data.printList[e].deviceId, e));
      },
    });
  },
  getDevicesFun: function (e, t, i) {
    var ServicesCard = this;
    e > 100
      ? ServicesCard.showTip("打印机未打开或离手机太远")
      : setTimeout(function () {
          wx.getBluetoothDevices({
            success: function (n) {
              var s = ServicesCard.filterPrint(n.devices, t);
              s.length > 0
                ? ServicesCard.connectDevice(s, i)
                : ServicesCard.getDevicesFun(++e, t, i);
            },
          });
        }, 300);
  },
  filterPrint: function (e, t) {
    for (var app = [], ServicesCard = 0; ServicesCard < e.length; ServicesCard++)
      if (e[ServicesCard].hasOwnProperty("deviceId") && e[ServicesCard].deviceId == t) {
        app.push(e[ServicesCard]);
        break;
      }
    return app;
  },
  connectDevice: function (e, t) {
    var app = this,
      ServicesCard = !1,
      ServicesShop = e[0].deviceId;
    (console.log("开始连接设备：", e, t),
      wx.createBLEConnection({
        deviceId: ServicesShop,
        success: function (e) {
          ((a = !0), wx.stopBluetoothDevicesDiscovery({}), app.getDeviceService(ServicesShop, t));
        },
        fail: function (e) {
          ServicesCard || ((a = !0), app.connectFail());
        },
      }),
      setTimeout(function () {
        ServicesCard || ((a = !0), app.connectFail());
      }, 35e3));
  },
  connectFail: function () {
    (wx.hideLoading(), this.showTip("设备连接错误，请重启设备后重试"));
  },
  getDeviceService: function (e, t) {
    var app = this;
    wx.getBLEDeviceServices({
      deviceId: e,
      success: function (a) {
        console.log("搜索设备服务成功", a);
        var ServicesShop = app.filterService(a.services);
        (console.log("serviceId:", ServicesShop),
          "" != ServicesShop
            ? app.getDeviceCharacter(e, ServicesShop, t)
            : (app.showTip("没有找到主服务"), app.closeBLEConnection(e)));
      },
      fail: function (t) {
        (app.showTip("搜索设备服务失败"), app.closeBLEConnection(e));
      },
    });
  },
  filterCharacter: function (e, t) {
    for (var app = "", ServicesCard = 0; ServicesCard < e.length; ServicesCard++) {
      var ServicesShop = e[ServicesCard];
      if (ServicesShop.properties[t]) {
        if ("write" !== t) {
          i = ServicesShop.uuid;
          break;
        }
        if (
          (app || (i = ServicesShop.uuid),
          "49535343-8841-43F4-A8D4-ECBE34729BB3" === ServicesShop.uuid)
        ) {
          i = ServicesShop.uuid;
          break;
        }
      }
    }
    return app;
  },
  filterService: function (e) {
    for (var ServicesPrint = "", app = 0; app < e.length; app++) {
      var ServicesCard = e[app].uuid.toUpperCase();
      if (
        -1 != ServicesCard.indexOf("0000EEE0-0000-1000-8000-00805F9B34FB") ||
        -1 != ServicesCard.indexOf("0000FF00-0000-1000-8000-00805F9B34FB") ||
        -1 != ServicesCard.indexOf("49535343-FE7D-4AE5-8FA9-9FAFD205E455")
      ) {
        t = e[app].uuid;
        break;
      }
    }
    return ServicesPrint;
  },
  getDeviceCharacter: function (e, t, i) {
    var ServicesCard = this,
      ServicesShop = ServicesCard.data.printList[i];
    console.log("device:", ServicesShop);
    var s = ServicesCard.data.sendData64;
    ((ServicesShop.name || "").startsWith("QR") &&
      ServicesCard.data.sendData64Gp.length > 0 &&
      (s = ServicesCard.data.sendData64Gp),
      (ServicesShop.name || "").startsWith("HT") &&
        ServicesCard.data.sendData64TTR.length > 0 &&
        (s = ServicesCard.data.sendData64TTR),
      wx.getBLEDeviceCharacteristics({
        deviceId: e,
        serviceId: t,
        success: function (n) {
          console.log("获取特征值成功", n);
          var c = ServicesCard.filterCharacter(n.characteristics, "write"),
            r = ServicesCard.filterCharacter(n.characteristics, "notify");
          (ServicesCard.notifyBLECharacteristicValueChange(e, t, r),
            "" != c
              ? (setTimeout(function () {
                  var app = new Date().getTime();
                  (ServicesCard.setData({
                    time: app,
                  }),
                    ServicesCard.writeBLECharacteristicValue(e, t, c, s, 1),
                    setTimeout(function () {
                      ServicesCard.data.isUseful &&
                        wx.showLoading({
                          title: "传输中...",
                          mask: !0,
                        });
                    }, 500));
                }, 1e3),
                console.log("serviceId:", t),
                console.log("writeId:", c),
                (ServicesCard.data.printList[i].serviceId = t),
                (ServicesCard.data.printList[i].writeId = c),
                wx.setStorageSync("printList", ServicesCard.data.printList),
                ServicesCard.setData({
                  currentIndex: i,
                }))
              : (ServicesCard.showTip("获取特征值失败"), ServicesCard.closeBLEConnection(e)));
        },
        fail: function (t) {
          (ServicesCard.showTip("获取特征值失败"), ServicesCard.closeBLEConnection(e));
        },
      }));
  },
  writeBLECharacteristicValue: function (e, t, i, a, n) {
    var s = this;
    if (a.length >= n)
      "ios" == s.data.sysInfo.platform
        ? s.writeData(e, t, i, a, n)
        : setTimeout(function () {
            s.writeData(e, t, i, a, n);
          }, 10);
    else {
      var c = (new Date().getTime() - s.data.time) / 1e3;
      (wx.hideLoading(), s.askResult(c), s.closeBLEConnection(e));
    }
  },
  writeData: function (e, t, i, a, n) {
    var s = this;
    s.data.isUseful
      ? wx.writeBLECharacteristicValue({
          deviceId: e,
          serviceId: t,
          characteristicId: i,
          value: wx.base64ToArrayBuffer(a[n - 1]),
          success: function (c) {
            s.writeBLECharacteristicValue(e, t, i, a, ++n);
          },
          fail: function (a) {
            (s.showTip("数据传输失败，请检查后重试"), s.lastWriteForError(e, t, i));
          },
        })
      : s.lastWriteForError(e, t, i);
  },
  lastWriteForError: function (e, t, i) {
    var ServicesCard = this;
    wx.writeBLECharacteristicValue({
      deviceId: e,
      serviceId: t,
      characteristicId: i,
      value: wx.base64ToArrayBuffer("G2hQUklOVA0K"),
      complete: function (t) {
        ServicesCard.closeBLEConnection(e);
      },
    });
  },
  notifyBLECharacteristicValueChange: function (e, t, i) {
    var ServicesCard = this;
    wx.notifyBLECharacteristicValueChange({
      state: !0,
      deviceId: e,
      serviceId: t,
      characteristicId: i,
      success: function (e) {
        ServicesCard.onBLECharacteristicValueChange();
      },
    });
  },
  ab2hex: function (e) {
    return Array.prototype.map
      .call(new Uint8Array(e), function (e) {
        return ("00" + e.toString(16)).slice(-2);
      })
      .join("");
  },
  onBLECharacteristicValueChange: function () {
    var objectSpread2 = this;
    wx.onBLECharacteristicValueChange(function (t) {
      var app = "打印机就绪！",
        ServicesCard = !1;
      switch (objectSpread2.ab2hex(t.value)) {
        case "02":
          i = "打印机缺纸！";
          break;
        case "04":
        case "06":
          i = "打印机纸仓未关闭！";
          break;
        default:
          a = !0;
      }
      ServicesCard || (wx.hideLoading(), objectSpread2.showTip(app));
    });
  },
  closeBLEConnection: function (e) {
    wx.closeBLEConnection({
      deviceId: e,
      success: function (e) {},
    });
  },
  askResult: function (i) {
    var ServicesShop = this;
    if (
      ((this.data.isUseful = !1),
      wx.showToast({
        title: "打印成功",
        icon: "success",
        duration: 1e3,
      }),
      2 == this.data.printType)
    ) {
      this.setData({
        maskDispaly: !0,
      });
      var s = wx.getStorageSync("printParams");
      1 == this.data.headType
        ? (0, ServicesPrint.neadendPrintLog)(s).then(function (e) {
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
          (0, ServicesPrint.orderHeadPrintLog)(s).then(function (e) {
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
      var c = wx.getStorageSync("printParams"),
        r = objectSpread2(
          {
            id: c.goodsId,
            printCopies: c.copies,
          },
          c,
        );
      ServicesCard.updatePrintInfoCount(r).then(function (e) {
        0 === e.code ? console.log("打印标签成功") : wx.hideLoading();
      });
    }
  },
  upListdata: function (e) {
    (wx.setStorage({
      key: "printList",
      data: e,
    }),
      this.setData({
        printList: e,
      }));
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
    (ServicesPrint.forEach(function (i, a) {
      "packageB/pages/color-card-management/color-card-management" == i.route &&
        (e = ServicesPrint.length - a);
    }),
      wx.navigateBack({
        delta: objectSpread2 - 1,
      }));
  },
});
