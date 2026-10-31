var t = (0, require("../../../../@babel/runtime/helpers/interopRequireDefault").default)(
    require("../../../utils/mta_analysis.js"),
  ),
  app = getApp();
Page({
  data: {
    spname: "打印机",
    printList: [],
    storageList: [],
    icon: {
      imageSm: "".concat(app.config.imgHost, "/img/customer/duibuIcon/icon/sm@2x.png"),
      imagePrint: "".concat(app.config.imgHost, "/img/customer/duibuIcon/print@2x.png"),
      imagePrint2: "".concat(app.config.imgHost, "/img/customer/duibuIcon/print2@2x.png"),
      imageScanPrint: "".concat(app.config.imgHost, "/img/customer/duibuIcon/scan@2x.png"),
    },
    contentStatus: !1,
    platform: "",
    showExplain: !1,
  },
  onLoad: function (o) {
    (t.default.Page.init(), wx.hideShareMenu());
    var i = wx.getStorageSync("printList");
    (console.log("内存", i),
      i.length > 0 &&
        this.setData({
          storageList: i,
        }),
      this.start());
    var a = app.globalData.mobileInfo;
    (this.setData({
      platform: a ? a.platform : "",
    }),
      o.title &&
        (wx.setNavigationBarTitle({
          title: o.title,
        }),
        this.setData({
          spname: o.title,
        })));
  },
  onShowExplain: function () {
    this.setData({
      showExplain: !this.data.showExplain,
    });
  },
  showActionSheet: function (t) {
    var app = this;
    wx.showModal({
      title: "取消配对",
      content: '您确定要取消"'.concat(t.currentTarget.dataset.qname, '"设备的配对?'),
      success: function (o) {
        if (o.confirm) {
          var i = wx.getStorageSync("printList");
          (i.map(function (e, o) {
            o === parseInt(t.currentTarget.id) && i.splice(o, 1);
          }),
            app.setData({
              storageList: i,
            }),
            wx.setStorageSync("printList", i),
            app.showTip("移除设备成功"));
        } else o.cancel && console.log("用户点击取消");
      },
    });
  },
  research: function () {
    var t = this;
    wx.closeBluetoothAdapter({
      complete: function (e) {
        t.start();
      },
    });
  },
  start: function () {
    if (wx.openBluetoothAdapter) {
      var t = this;
      wx.openBluetoothAdapter({
        complete: function (e) {
          (console.log("蓝牙适配器初始化成功", e), t.getBluetoothAdapterState());
        },
      });
    } else this.showTip("当前微信版本过低，无法使用该功能，请升级到最新微信版本后重试。");
  },
  getBluetoothAdapterState: function () {
    var t = this;
    wx.getBluetoothAdapterState({
      complete: function (e) {
        (console.log("获取本机蓝牙适配器状态", e),
          e && e.available ? t.startSearch() : t.showTip("请开启手机蓝牙"));
      },
    });
  },
  startSearch: function () {
    var t = this;
    (wx.showLoading({
      title: "搜索中",
      mask: !0,
    }),
      wx.startBluetoothDevicesDiscovery({
        services: [],
        complete: function (e) {
          console.log("开启搜索蓝牙设备的返回：", e);
          var o = setTimeout(function () {
            (wx.getBluetoothDevices({
              complete: function (e) {
                (wx.hideLoading(), console.log("搜索到的设备", e));
                var o = t.filterPrintByLocalName(e.devices);
                (console.log("打印机列表：", o),
                  t.setData({
                    printList: o,
                  }),
                  0 == o.length &&
                    ("android" == t.data.platform
                      ? t.showTip(
                          "没有发现新的设备哦~ \r\n请检查打印机状态\r\n尝试打开手机定位\r\n及微信授权位置信息后重试！",
                        )
                      : t.showTip("没有发现新的设备哦")));
              },
            }),
              wx.stopBluetoothDevicesDiscovery({
                success: function (t) {},
              }),
              clearTimeout(o));
          }, 2500);
        },
      }));
  },
  filterPrintByAdvertisData: function (t) {
    for (var app = [], o = this.data.storageList, i = 0; i < t.length; i++)
      if (t[i].hasOwnProperty("advertisData")) {
        wx.arrayBufferToBase64(t[i].advertisData);
        var a = Array.prototype.map
          .call(new Uint8Array(t[i].advertisData), function (t) {
            return ("00" + t.toString(16)).slice(-2);
          })
          .join("");
        if (16 == a.length) {
          for (var n = !1, s = 0; s < o.length; s++)
            if (o[s].deviceId == t[i].deviceId) {
              (console.log("已经存在", i), (n = !0));
              break;
            }
          n || ((t[i].address = a.substring(12).toUpperCase()), app.push(t[i]));
        }
      }
    return app;
  },
  filterPrintByLocalName: function (t) {
    for (var app = [], o = this.data.storageList, i = 0; i < t.length; i++)
      if (t[i].hasOwnProperty("localName") && "" != t[i].localName) {
        for (var a = !1, n = 0; n < o.length; n++)
          if (o[n].deviceId == t[i].deviceId) {
            a = !0;
            break;
          }
        a || app.push(t[i]);
      }
    return app;
  },
  connectDevice: function (t) {
    var app = this,
      o = t.currentTarget.dataset.index,
      i = app.data.printList,
      a = i[o].deviceId;
    (console.log("printList:", app.data.printList),
      console.log("deviceId:", i[o].deviceId),
      wx.showLoading({
        title: "连接中...",
        mask: !0,
      }),
      wx.createBLEConnection({
        deviceId: a,
        success: function (t) {
          console.log("存储：", i[o]);
          var a = app.data.storageList,
            n = app.data.printList;
          (a.push(i[o]),
            wx.setStorageSync("printList", a),
            n.splice(o, 1),
            app.setData({
              storageList: a,
              printList: n,
            }),
            console.log(o, n, app.data.printList),
            wx.hideLoading(),
            wx.showToast({
              title: "连接成功",
              icon: "none",
            }));
        },
        fail: function (t) {
          (wx.hideLoading(), app.showTip("连接失败"));
        },
      }));
  },
  closeBLEConnection: function (t) {
    wx.closeBLEConnection({
      deviceId: t,
      success: function (t) {
        console.log("断开成功", t);
      },
    });
  },
  showTip: function (t) {
    wx.showModal({
      content: t,
      showCancel: !1,
    });
  },
  service: function () {
    this.setData({
      showM: !0,
    });
  },
  cancelR: function () {
    this.setData({
      showM: !1,
    });
  },
  confirmR: function () {
    var t = this;
    wx.setClipboardData({
      // 厂商侧服务号占位：真实号码不再入公开仓库面，如需可达此入口应由接口下发
      data: "gc13800000000",
      success: function (e) {
        (t.cancelR(),
          wx.showToast({
            title: "复制成功",
          }));
      },
    });
  },
});
