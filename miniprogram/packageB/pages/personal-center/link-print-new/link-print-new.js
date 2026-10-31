var t = (0, require("../../../../@babel/runtime/helpers/interopRequireDefault").default)(
    require("../../../utils/mta_analysis.js"),
  ),
  app = getApp();
Page({
  data: {
    totalList: [],
    printList: [],
    storageList: [],
    icon: {
      printquest: "".concat(
        app.config.imgHost,
        "/img/customer/duibuIcon/icon/ic_printquest@2x.png",
      ),
      imageSm: "".concat(app.config.imgHost, "/img/customer/duibuIcon/icon/sm@2x.png"),
      delete: "".concat(app.config.imgHost, "/img/customer/duibuIcon/icon/del@2x.png"),
    },
    contentStatus: !1,
    platform: "",
    showExplain: !1,
  },
  onLoad: function (i) {
    (t.default.Page.init(), wx.hideShareMenu());
    wx.getStorageSync("storageList").length > 0 && wx.getStorageSync("storageList");
    var a,
      o = wx.getStorageSync("printList").length > 0 ? wx.getStorageSync("printList") : [];
    this.setData({
      printList: o,
    });
    var n = app.globalData.mobileInfo;
    ((a = !(!n || (-1 == n.brand.search("HUAWEI") && -1 == n.brand.search("HONOR")))),
      this.setData({
        isHUAWEI: a,
        platform: n ? n.platform : "",
      }));
  },
  onShowExplain: function () {
    this.setData({
      showExplain: !this.data.showExplain,
    });
  },
  delAdvice: function (t) {
    var app = wx.getStorageSync("printList");
    (app.map(function (i, a) {
      a === parseInt(t.currentTarget.id) && app.splice(a, 1);
    }),
      this.setData({
        printList: app,
      }),
      wx.setStorageSync("printList", app),
      this.showTip("移除设备成功"));
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
    var t = this;
    wx.openBluetoothAdapter
      ? wx.openBluetoothAdapter({
          complete: function (e) {
            t.getBluetoothAdapterState();
          },
        })
      : this.showTip("当前微信版本过低，无法使用该功能，请升级到最新微信版本后重试。");
  },
  getBluetoothAdapterState: function () {
    var t = this;
    wx.getBluetoothAdapterState({
      complete: function (e) {
        e && e.available ? t.startSearch(0) : t.showTip("请开启手机蓝牙");
      },
    });
  },
  startSearch: function (t) {
    var app = this;
    ((1 === t && app.data.isHUAWEI) ||
      wx.showLoading({
        title: "搜索中",
        mask: !0,
      }),
      wx.startBluetoothDevicesDiscovery({
        services: [],
        complete: function (i) {
          setTimeout(function () {
            (wx.getBluetoothDevices({
              complete: function (i) {
                (0 === t && app.data.isHUAWEI) || wx.hideLoading();
                var a = app.filterPrint(i.devices, t);
                (app.setData({
                  storageList: a,
                }),
                  0 == a.length &&
                    ("android" == app.data.platform
                      ? app.showTip(
                          "没有发现新的设备哦~ \r\n请检查打印机状态\r\n尝试打开手机定位\r\n及微信授权位置信息后重试！",
                        )
                      : app.showTip("没有发现新的设备哦")));
              },
            }),
              wx.stopBluetoothDevicesDiscovery({
                success: function (t) {},
              }));
          }, 5e3);
        },
      }));
  },
  filterPrint: function (t, e) {
    var i = this,
      a = [],
      o = i.data.printList;
    0 === e && i.data.isHUAWEI && i.startSearch(1);
    for (var n = 0; n < t.length; n++)
      if (t[n].advertisData) {
        wx.arrayBufferToBase64(t[n].advertisData);
        var r = Array.prototype.map
          .call(new Uint8Array(t[n].advertisData), function (t) {
            return ("00" + t.toString(16)).slice(-2);
          })
          .join("");
        if (16 == r.length) {
          for (var s = !1, c = 0; c < o.length; c++)
            if (o[c].deviceId == t[n].deviceId) {
              s = !0;
              break;
            }
          s || ((t[n].address = r.toUpperCase()), a.push(t[n]));
        }
      }
    return a;
  },
  connectDevice: function (t) {
    for (
      var app = this,
        i = t.currentTarget.dataset.index,
        a = app.data.printList,
        o = app.data.storageList,
        n = o[i],
        r = !1,
        s = 0;
      s < a.length;
      s++
    )
      if (a[s].deviceId == n.deviceId) {
        r = !0;
        break;
      }
    r || a.push(n);
    for (var c = [], u = 0; u < o.length; u++)
      o[u].deviceId != n.deviceId && c.push(app.data.storageList[u]);
    (app.setData({
      storageList: c,
      printList: a,
    }),
      wx.setStorageSync("storageList", c),
      wx.setStorageSync("printList", a));
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
});
