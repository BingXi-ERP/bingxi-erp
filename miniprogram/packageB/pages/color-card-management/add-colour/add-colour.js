var app = getApp(),
  ServicesCard = require("../../../../libs/services/ServicesCard.js").servicesCard;
Page({
  data: {
    currentActiveIndex: -1,
    arr: [],
    writeCharId: "",
    notifyCharId: "",
    colorcolorList: [],
    goodsPriceJson: [],
    lastNumbers: 0,
    numbers: "",
    showClearNumber: !1,
    hideType: 0,
    clearPrice: !1,
    icon: {
      add: "".concat(app.config.imgHost, "/img/customer/duibuIcon/add3@2x.png"),
      del: "".concat(app.config.imgHost, "/img/customer/duibuIcon/del@2x.png"),
      moreAdd: "".concat(app.config.imgHost, "/img/customer/duibuIcon/batch-add@2x.png"),
      noDataBg: "".concat(app.config.imgHost, "/img/customer/duibuIcon/dz@2x.png"),
      delete: "".concat(app.config.imgHost, "/img/customer/duibuIcon/icon2nd/deltel@2x.png"),
    },
    noColorBg: "".concat(app.config.imgHost, "/img/customer/duibuIcon/icon2nd/emptyColor@2x.png"),
    pageColorList: [],
    page: 1,
    size: 20,
    totalPage: 0,
    currentType: "",
    goodsId: "",
    flag: 1,
    colorValue: "",
    colorName: "",
    duibuColorValue: "",
    duibuColorName: "",
    lab: "",
    skuId: "",
  },
  onLoad: function (o) {
    (this.setData({
      goodsId: o.goodsId,
    }),
      this.getColorList(),
      wx.hideShareMenu());
  },
  onShow: function () {
    var app = this;
    this.openBluetoothAdapter();
    var ServicesCard = wx.getStorageSync("checkColorItem");
    "" != ServicesCard &&
      this.data.colorcolorList.map(function (e, a) {
        a == wx.getStorageSync("colorColorId") &&
          (app.setData({
            colorName: ServicesCard.colorName,
            colorValue: e.colorVal,
            duibuColorName: ServicesCard.colorName,
            duibuColorValue: e.duibuColorValue || "#",
            skuId: e.id,
            flag: -1 == app.data.currentActiveIndex ? 1 : 2,
          }),
          app.saveColorList());
      });
  },
  onReachBottom: function () {
    var app = this.data,
      ServicesCard = app.page;
    ServicesCard >= app.totalPage ||
      (ServicesCard++,
      this.setData({
        page: ServicesCard,
      }),
      this.colorListPaging(this.data.colorcolorList));
  },
  openBluetoothAdapter: function () {
    var app = this;
    wx.openBluetoothAdapter
      ? wx.openBluetoothAdapter({
          complete: function (t) {
            (console.log("蓝牙适配器初始化成功", t), app.createBLEConnection());
          },
        })
      : this.showTip("当前微信版本过低，无法使用该功能，请升级到最新微信版本后重试。");
  },
  createBLEConnection: function () {
    var ServicesCard = this,
      e = wx.getStorageSync("printList");
    if ((console.log("printList", e), e && e.length > 0)) {
      var a = e.find(function (o) {
        return o.name.includes("CJ");
      });
      wx.createBLEConnection({
        deviceId: a.deviceId,
        success: function (e) {
          if ((console.log("连接成功", e), app.globalData.mobileInfo.system.includes("Android"))) {
            wx.setBLEMTU({
              deviceId: a.deviceId,
              mtu: 512,
              success: function (o) {
                (console.log("setBLEMTU success>>", o),
                  ServicesCard.getBLEDeviceServices(a.deviceId));
              },
              fail: function (o) {
                console.log("setBLEMTU fail>>", o);
              },
            });
          } else ServicesCard.getBLEDeviceServices(a.deviceId);
        },
        fail: function (o) {
          (console.error("连接失败", o),
            console.log("已连接，直接获取服务"),
            ServicesCard.getBLEDeviceServices(a.deviceId));
        },
      });
    } else
      wx.showModal({
        content: "未连接色差仪，是否现在连接",
        confirmText: "是",
        success: function (o) {
          o.confirm
            ? (wx.removeStorageSync("checkColorItem"),
              wx.navigateTo({
                url: "/packageB/pages/personal-center/link-print/link-print?title=色差仪",
                success: function () {},
              }))
            : o.cancel && console.log("用户点击取消");
        },
      });
  },
  getBLEDeviceServices: function (o) {
    var ServicesCard = this;
    wx.getBLEDeviceServices({
      deviceId: o,
      success: function (e) {
        var a = e.services[0].uuid;
        (console.log("获取服务成功 servicesRes", e),
          console.log("获取服务成功 serviceId", a),
          ServicesCard.getBLEDeviceCharacteristics(o, a));
      },
      fail: function (o) {
        console.error("获取服务失败", o);
      },
    });
  },
  getBLEDeviceCharacteristics: function (o, t) {
    var r = this;
    (console.log("deviceId", o),
      console.log("serviceId", t),
      wx.getBLEDeviceCharacteristics({
        deviceId: o,
        serviceId: t,
        success: function (e) {
          console.log("获取特征值成功", e);
          var a = e.characteristics.find(function (o) {
            return o.properties.notify || o.properties.indicate;
          });
          console.log("notifyChar", a);
          var c = e.characteristics.find(function (o) {
            return o.properties.write;
          });
          (console.log("writeChar", c),
            a &&
              (r.setData({
                notifyCharId: a.uuid,
              }),
              r.enableNotify(o, t, a.uuid)),
            c &&
              r.setData({
                writeCharId: c.uuid,
              }));
        },
        fail: function (o) {
          (a.showTip("获取特征值失败"), a.closeBLEConnection(e));
        },
      }));
  },
  enableNotify: function (o, t, e) {
    var a = this;
    (console.log("启用蓝牙低功耗设备特征值变化时的 notify 功能 deviceId", o),
      console.log("启用蓝牙低功耗设备特征值变化时的 notify 功能 serviceId", t),
      console.log("启用蓝牙低功耗设备特征值变化时的 notify 功能 characteristicId", e),
      wx.notifyBLECharacteristicValueChange({
        state: !0,
        deviceId: o,
        serviceId: t,
        characteristicId: e,
        success: function (o) {
          (console.log("已启用通知"),
            wx.onBLECharacteristicValueChange(function (o) {
              (console.log("接收到数据", o), a.handleData(a, o.value));
            }));
        },
      }));
  },
  handleData: function (o, t) {
    var e = o;
    console.log("arrayBuffer", t);
    var a = Array.prototype.map.call(new Uint8Array(t), function (o) {
      return ("00" + o.toString(16)).slice(-2);
    });
    (this.setData({
      arr: a,
    }),
      console.log("hexArr", a));
    var r = new DataView(t);
    console.log("dataView", r);
    var c = [r.getInt16(6, 8) / 100, r.getInt16(8, 10) / 100, r.getInt16(10, 12) / 100];
    console.log("解析后的色度值:", c);
    var i = e.rgbValue(),
      n = "";
    if (-1 == this.data.currentActiveIndex) {
      if (e.data.colorcolorList.length > 0) {
        var s = e.data.colorcolorList[e.data.colorcolorList.length - 1].colorVal,
          l = Number(s.split("#")[0]) || 0;
        n = "".concat(l + 1, "#");
      } else n = "1#";
    } else n = this.data.colorValue;
    (console.log("colorValue", n),
      e.setData({
        colorName: this.data.colorName,
        colorValue: n,
        duibuColorName: "",
        duibuColorValue: "#".concat(i),
        lab: c.join(","),
        flag: -1 == this.data.currentActiveIndex ? 1 : 2,
      }),
      e.saveColorList());
  },
  getDataStr: function () {
    return this.data.arr.map(function (o) {
      var ServicesCard = o.toString(16).toUpperCase();
      return ServicesCard.length < 2 ? "0" + ServicesCard : ServicesCard;
    });
  },
  getRgbStr: function () {
    return this.getDataStr().slice(74, 77);
  },
  rgbValue: function () {
    return this.getRgbStr().join("");
  },
  serviceConnnet: function () {
    (wx.removeStorageSync("checkColorItem"),
      wx.navigateTo({
        url: "/packageB/pages/personal-center/link-print/link-print?title=色差仪",
      }));
  },
  toColorName: function (o) {
    var ServicesCard = this;
    (wx.showLoading({
      mask: !0,
    }),
      clearTimeout(this.data.stopConut),
      (this.data.stopConut = setTimeout(function () {
        (ServicesCard.setData({
          hideType: 1,
        }),
          wx.removeStorageSync("checkColorItem"),
          "packageB/pages/color-card-management/add-bottom-card/add-bottom-card" ===
          ServicesCard.data.currentType
            ? wx.setStorageSync("colorColorCardList", ServicesCard.data.colorcolorList)
            : wx.setStorageSync("colorColorList", ServicesCard.data.colorcolorList),
          wx.setStorageSync("goodsPriceJson", ServicesCard.data.goodsPriceJson),
          wx.setStorageSync("colorColorItem", o.currentTarget.dataset.item),
          wx.setStorageSync("colorColorId", o.currentTarget.dataset.id),
          wx.navigateTo({
            url: "/packageB/pages/color-card-management/add-color-card/new-add-color-name/new-add-color-name",
            complete: function () {
              wx.hideLoading();
            },
          }));
      }, 500)));
  },
  addNumber: function (o) {
    ((this.numbers = o.detail.value),
      this.setData({
        numbers: this.numbers,
      }));
  },
  cancelAdd: function () {
    this.setData({
      showClearNumber: !1,
    });
  },
  getColorLastNumber: function () {
    var app,
      ServicesCard = 0,
      e = this.data.colorcolorList;
    e &&
      e.length &&
      (t =
        null === (o = e[e.length - 1].colorVal) || void 0 === app
          ? void 0
          : app.replace(/[^0-9]/gi, ""));
    this.setData({
      lastNumbers: parseInt(ServicesCard),
    });
  },
  onPageScrollBottom: function () {
    var app = this;
    wx.createSelectorQuery()
      .select("#viewColorContent")
      .boundingClientRect(function (t) {
        wx.pageScrollTo({
          scrollTop: (null == t ? void 0 : t.height) + 100,
          duration: 100,
          success: function () {
            app.data.page < app.data.totalPage && (app.onReachBottom(), app.onPageScrollBottom());
          },
        });
      })
      .exec();
  },
  sureAdd: function (o) {
    var ServicesCard = this;
    if (!this.data.numbers || parseInt(this.data.numbers) <= 0)
      wx.showToast({
        title: "请输入添加色号数量",
        icon: "none",
      });
    else {
      var e = this.data.colorcolorList || [],
        a = this.data.goodsPriceJson || [],
        r = this.data.numbers;
      if (Number(r) > 2e3)
        wx.showToast({
          title: "一次添加色号不能超过2000个",
          icon: "none",
        });
      else {
        for (var c = 1; c <= r; c++) {
          var i;
          if ((null === (i = e) || void 0 === i ? void 0 : i.length) > 0) {
            var n = {
              colorVal: parseInt(this.data.lastNumbers || 0) + c + "#",
              engColorName: "",
              colorName: "",
              id: "",
              priceType: "2",
            };
            (e.push(n), a.push(n));
          } else
            ((e = [
              {
                colorVal: c + "#",
                engColorName: "",
                colorName: "",
                id: "",
                priceType: "2",
              },
            ]),
              (a = [
                {
                  colorVal: c + "#",
                  engColorName: "",
                  colorName: "",
                  id: "",
                  priceType: "2",
                },
              ]));
        }
        (this.colorListPaging(e, !1, !0),
          this.setData({
            colorcolorList: e,
            goodsPriceJson: a,
            totalPage: Math.ceil(e.length / this.data.size),
          }),
          this.getColorLastNumber(),
          wx.nextTick(function () {
            (ServicesCard.data.lastNumbers > 0 &&
              ServicesCard.setData({
                clearPrice: !0,
              }),
              ServicesCard.onReachBottom(),
              ServicesCard.onPageScrollBottom());
          }));
      }
    }
  },
  colorListPaging: function (o, t, e) {
    var a = this.data,
      r = a.page,
      c = (r - 1) * a.size,
      i = c + 20,
      n = o ? o.slice(c, i) : [];
    if (t) {
      var s = wx.getStorageSync("checkColorItem");
      "" != s &&
        this.data.pageColorList.map(function (o, t) {
          t == wx.getStorageSync("colorColorId") &&
            ((o.colorName = s.colorName), (o.engColorName = s.engColorName));
        });
    }
    (e && ((n = o.slice(0, i)), (this.data.pageColorList = n)),
      1 === r || e || (this.data.pageColorList = this.data.pageColorList.concat(n)),
      this.setData({
        pageColorList: 1 === r ? n : this.data.pageColorList,
      }));
  },
  clickHandle: function (o) {
    var ServicesCard = o.currentTarget.dataset.index,
      e = -1 == ServicesCard ? "" : this.data.colorcolorList[ServicesCard].colorName,
      a = -1 == ServicesCard ? "" : this.data.colorcolorList[ServicesCard].colorVal,
      r = -1 == ServicesCard ? "" : this.data.colorcolorList[ServicesCard].id;
    this.setData({
      currentActiveIndex: ServicesCard,
      colorValue: a,
      colorName: e,
      skuId: r,
    });
  },
  removeColorList: function () {
    var app = this;
    wx.showModal({
      title: "提示",
      content: "要清空所有色号？",
      success: function (e) {
        var a = this;
        e.confirm &&
          (app.data.colorcolorList.some(function (o) {
            return o.id;
          })
            ? ServicesCard.clearAllColor(app.data.goodsId).then(function (t) {
                (app.getColorList(),
                  a.setData({
                    currentActiveIndex: -1,
                  }));
              })
            : app.setData({
                colorcolorList: [],
              }));
      },
      fail: function () {
        reject();
      },
    });
  },
  sureClear: function () {
    (this.setData({
      showClearNumber: !1,
      pageColorList: [],
      colorcolorList: [],
      goodsPriceJson: [],
      clearPrice: !0,
    }),
      wx.setStorageSync("goodsPriceJson", this.data.goodsPriceJson),
      "packageB/pages/color-card-management/add-bottom-card/add-bottom-card" === this.data.currentType
        ? wx.setStorageSync("colorColorCardList", this.data.colorcolorList)
        : wx.setStorageSync("colorColorList", this.data.colorcolorList),
      wx.nextTick(function () {
        wx.pageScrollTo({
          scrollTop: 0,
        });
      }));
  },
  removeIndex: function (o) {
    if (o.currentTarget.dataset.id)
      (this.setData({
        colorName: o.currentTarget.dataset.colorname,
        colorValue: o.currentTarget.dataset.colorval,
        skuId: o.currentTarget.dataset.id,
        flag: 3,
      }),
        this.saveColorList());
    else {
      var ServicesCard = o.currentTarget.dataset.index;
      (this.data.colorcolorList.splice(ServicesCard, 1),
        this.setData({
          colorcolorList: this.data.colorcolorList,
          currentActiveIndex: -1,
        }));
    }
  },
  colorValInputBlur: function (o) {
    var ServicesCard = o.detail.value.replace(/^\s+|\s+$/g, ""),
      e = o.currentTarget.dataset.name,
      a = o.currentTarget.dataset.dbvalue,
      r = o.currentTarget.dataset.l
        ? ""
            .concat(o.currentTarget.dataset.l, ",")
            .concat(o.currentTarget.dataset.a, ",")
            .concat(o.currentTarget.dataset.b)
        : "";
    (this.setData({
      colorName: e,
      colorValue: ServicesCard,
      duibuColorName: "",
      duibuColorValue: "".concat(a),
      skuId: o.currentTarget.dataset.id,
      lab: r,
      flag: "" == o.currentTarget.dataset.id ? 1 : 2,
    }),
      this.saveColorList());
  },
  getColorList: function () {
    var app = this,
      e = {
        page: 1,
        size: 1e3,
        id: this.data.goodsId,
      };
    ServicesCard.getColorList(e).then(function (t) {
      var e = t.data.content ? t.data.content : [];
      app.setData({
        colorcolorList: e,
      });
    });
  },
  saveColorList: function () {
    var app = this,
      e = {
        colorName: this.data.colorName,
        colorVal: this.data.colorValue,
        duibuColorName: "",
        duibuColorValue: this.data.duibuColorValue,
        flag: this.data.flag,
        lab: this.data.lab,
      };
    (2 != this.data.flag && 3 != this.data.flag) ||
      Object.assign(e, {
        skuId: this.data.skuId,
      });
    var a = {
      itemList: [e],
      productId: this.data.goodsId,
    };
    ServicesCard.saveColor(a).then(function (t) {
      if ((app.getColorList(), 1 == app.data.flag))
        app.setData({
          colorName: "",
          colorValue: "",
          currentActiveIndex: -1,
        });
      else if (app.data.currentActiveIndex < app.data.colorcolorList.length - 1) {
        var e = Number(app.data.currentActiveIndex) + 1;
        app.setData({
          currentActiveIndex: e,
          colorName: app.data.colorcolorList[e].colorName,
          colorValue: app.data.colorcolorList[e].colorVal,
          skuId: app.data.colorcolorList[e].id,
        });
      } else
        app.setData({
          colorName: "",
          colorValue: "",
          currentActiveIndex: -1,
        });
    });
  },
});
