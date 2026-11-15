var objectSpread2 = require("../../../../../@babel/runtime/helpers/objectSpread2"),
  ServicesCard = require("../../../../../libs/services/ServicesCard"),
  app = getApp();
Page({
  data: {
    radiogroupitems: [
      {
        name: "0",
        value: "米",
        checked: "true",
      },
      {
        name: "1",
        value: "码",
        checked: "",
      },
      {
        name: "2",
        value: "公斤",
        checked: "",
      },
      {
        name: "3",
        value: "吨",
        checked: "",
      },
      {
        name: "4",
        value: "盎司",
        checked: "",
      },
      {
        name: "5",
        value: "个",
        checked: "",
      },
    ],
    contact: "".concat(app.config.imgHost, "/img/customer/duibuIcon/phone@2x.png"),
    unitStatus: 0,
    unitName: "米",
    priceTypes: [
      {
        name: 1,
        value: "按产品数量报价",
        checked: "true",
      },
      {
        name: 2,
        value: "按颜色规格报价",
      },
    ],
    priceType: 1,
    PriceJson1: [],
    PriceJson2: [],
    PriceJson3: [],
    addPriceListShow: 0,
    addPriceListShow1: 0,
    priceColorList: [],
    allPrice: "",
    goodsPriceJson: [],
    saving: 0,
    minShearingSales: !0,
    quantityPrice0: !0,
    quantityPrice1: !0,
    quantityPrice2: !0,
    isAllChange: !1,
    selectedArr: [],
    icon: {
      delete: "".concat(app.config.imgHost, "/img/customer/duibuIcon/icon2nd/deltel@2x.png"),
    },
  },
  onLoad: function (t) {
    var ServicesCard = t.isAllChange,
      app = t.selectedArr;
    (ServicesCard &&
      this.setData({
        isAllChange: ServicesCard,
        selectedArr: JSON.parse(app),
      }),
      wx.hideShareMenu());
  },
  onReady: function () {},
  onShow: function () {
    var objectSpread2 = this;
    this.data.priceColorList = wx.getStorageSync("colorColorList");
    var ServicesCard = wx.getStorageSync("goodsPriceJson"),
      app = wx.getStorageSync("priceType"),
      e = wx.getStorageSync("unitName") || "米";
    (this.data.priceColorList &&
      "" != this.data.priceColorList &&
      2 === app &&
      ((this.data.priceColorList = ServicesCard),
      this.data.priceColorList.map(function (t, i) {
        t.priceType = "2";
      })),
      this.setData({
        priceColorList: this.data.priceColorList,
      }),
      "" != e &&
        (this.data.radiogroupitems.map(function (i) {
          i.value == e
            ? ((i.checked = "true"),
              objectSpread2.setData({
                unitStatus: i.name,
                unitName: e,
              }))
            : (i.checked = "");
        }),
        this.setData({
          radiogroupitems: this.data.radiogroupitems,
        })),
      "" != ServicesCard &&
        (2 == app
          ? ((this.data.priceTypes[1].checked = !0),
            this.setData({
              priceType: 2,
              priceTypes: this.data.priceTypes,
            }))
          : (ServicesCard.length > 0 &&
              1 == ServicesCard[0].priceType &&
              this.data.PriceJson1.push(ServicesCard[0]),
            ServicesCard.length > 1 &&
              1 == ServicesCard[1].priceType &&
              (this.data.PriceJson2.push(ServicesCard[1]), (this.data.addPriceListShow = 1)),
            ServicesCard.length > 2 &&
              1 == ServicesCard[2].priceType &&
              (this.data.PriceJson3.push(ServicesCard[2]), (this.data.addPriceListShow1 = 1)),
            this.setData({
              PriceJson1: this.data.PriceJson1,
              PriceJson2: this.data.PriceJson2,
              PriceJson3: this.data.PriceJson3,
              addPriceListShow: this.data.addPriceListShow,
              addPriceListShow1: this.data.addPriceListShow1,
            }))));
  },
  onHide: function () {},
  onUnload: function () {
    this.usePreFunction();
  },
  statusChange: function (i) {
    if ("unit" == i.currentTarget.dataset.radio) {
      this.unitStatus = i.currentTarget.dataset.value;
      var app = i.currentTarget.dataset.value,
        e = this.data.radiogroupitems.map(function (i) {
          return i.value === app
            ? objectSpread2(
                objectSpread2({}, i),
                {},
                {
                  checked: "true",
                },
              )
            : objectSpread2(
                objectSpread2({}, i),
                {},
                {
                  checked: "",
                },
              );
        });
      (2 === this.data.priceType
        ? this.data.priceColorList &&
          "" != this.data.priceColorList &&
          this.data.priceColorList.map(function (t) {
            ((t.bulkNumUnit = app), (t.bulkSaleUnit = "元/" + app));
          })
        : (this.data.PriceJson1.forEach(function (t) {
            ((t.shearingNumUnit = app), (t.shearingSaleUnit = "元/" + app));
          }),
          this.data.PriceJson2.forEach(function (t) {
            ((t.shearingNumUnit = app), (t.shearingSaleUnit = "元/" + app));
          }),
          this.data.PriceJson3.forEach(function (t) {
            ((t.shearingNumUnit = app), (t.shearingSaleUnit = "元/" + app));
          })),
        this.setData({
          unitStatus: this.unitStatus,
          unitName: app,
          radiogroupitems: e,
          priceColorList: this.data.priceColorList,
        }));
    }
    "price" == i.currentTarget.dataset.radio &&
      this.setData({
        priceType: i.detail.value,
      });
  },
  changeListPrice: function (t) {
    var ServicesCard = this;
    this.data.priceColorList &&
      "" != this.data.priceColorList &&
      (this.data.priceColorList.map(function (a) {
        ((a.bulkNumUnit = ServicesCard.data.unitName),
          (a.bulkPrice = t.detail.value),
          (a.bulkSaleUnit = "元/" + ServicesCard.data.unitName));
      }),
      this.setData({
        priceColorList: this.data.priceColorList,
      }));
  },
  addPriceList: function () {
    this.setData({
      addPriceListShow: 1,
      addPriceListShow1: 1,
    });
  },
  removePriceList: function (t) {
    var ServicesCard = t.currentTarget.id;
    1 == ServicesCard
      ? this.setData({
          addPriceListShow: 0,
          PriceJson2: [],
          shearingPrice: !0,
        })
      : 2 == ServicesCard &&
        this.setData({
          addPriceListShow1: 0,
          PriceJson3: [],
        });
  },
  changeColorPrice: function (t) {
    var ServicesCard = this;
    this.data.priceColorList &&
      "" != this.data.priceColorList &&
      (this.data.priceColorList.map(function (a, e) {
        e == t.currentTarget.dataset.index &&
          ((a.bulkNumUnit = ServicesCard.data.unitName),
          (a.bulkPrice = t.detail.value),
          (a.bulkSaleUnit = "元/" + ServicesCard.data.unitName));
      }),
      this.setData({
        priceColorList: this.data.priceColorList,
      }));
  },
  priceType1_input: function (t) {
    if ("0-1" == t.currentTarget.dataset.id) {
      if (this.data.PriceJson1.length > 0) {
        if (
          this.data.PriceJson2[0] &&
          this.data.PriceJson1[0].minShearingSales &&
          parseFloat(t.detail.value) >= parseFloat(this.data.PriceJson2[0].minShearingSales)
        )
          return (
            wx.showToast({
              title: "输入数需小于下一级数量",
              icon: "none",
            }),
            void this.setData({
              minShearingSales: !1,
            })
          );
        (this.setData({
          minShearingSales: !0,
        }),
          (this.data.PriceJson1[0].minShearingSales = t.detail.value));
      } else
        this.data.PriceJson1.push({
          priceType: 1,
          minShearingSales: t.detail.value,
          shearingNumUnit: this.data.unitName,
          shearingPrice: "",
          shearingSaleUnit: "元/" + this.data.unitName,
        });
    } else if ("0-2" == t.currentTarget.dataset.id)
      if (this.data.PriceJson1.length > 0) {
        if (
          this.data.PriceJson2[0] &&
          this.data.PriceJson2[0].shearingPrice &&
          parseFloat(t.detail.value) <= parseFloat(this.data.PriceJson2[0].shearingPrice)
        )
          return (
            wx.showToast({
              title: "输入数需大于下一级价格",
              icon: "none",
            }),
            void this.setData({
              quantityPrice0: !1,
            })
          );
        (wx.hideToast(),
          this.setData({
            quantityPrice0: !0,
          }),
          (this.data.PriceJson1[0].shearingPrice = t.detail.value));
      } else
        this.data.PriceJson1.push({
          priceType: 1,
          minShearingSales: "",
          shearingNumUnit: this.data.unitName,
          shearingPrice: t.detail.value,
          shearingSaleUnit: "元/" + this.data.unitName,
        });
    if ("1-1" == t.currentTarget.dataset.id) {
      if (!this.data.PriceJson1[0])
        return void wx.showToast({
          title: "请输入上一级价格",
          icon: "none",
        });
      if (parseFloat(t.detail.value) <= parseFloat(this.data.PriceJson1[0].minShearingSales))
        return (
          wx.showToast({
            title: "输入数不能小于/等于起订量",
            icon: "none",
          }),
          void this.setData({
            minShearingSales: !1,
          })
        );
      (this.setData({
        minShearingSales: !0,
      }),
        this.data.PriceJson2.length > 0
          ? (this.data.PriceJson2[0].minShearingSales = t.detail.value)
          : this.data.PriceJson2.push({
              priceType: 1,
              minShearingSales: t.detail.value,
              shearingNumUnit: this.data.unitName,
              shearingPrice: "",
              shearingSaleUnit: "元/" + this.data.unitName,
            }));
    } else if ("1-2" == t.currentTarget.dataset.id) {
      if (0 != parseFloat(t.detail.value) || 0 != parseFloat(t.detail.value)) {
        if (!this.data.PriceJson1[0])
          return void wx.showToast({
            title: "请输入上一级价格",
            icon: "none",
          });
        if (parseFloat(t.detail.value) >= parseFloat(this.data.PriceJson1[0].shearingPrice))
          return (
            wx.showToast({
              title: "输入价格不能大于/等于起订量价格",
              icon: "none",
            }),
            void this.setData({
              quantityPrice1: !1,
            })
          );
      }
      (this.setData({
        quantityPrice1: !0,
      }),
        this.data.PriceJson2.length > 0
          ? (this.data.PriceJson2[0].shearingPrice = t.detail.value)
          : this.data.PriceJson2.push({
              priceType: 1,
              minShearingSales: "",
              shearingNumUnit: this.data.unitName,
              shearingPrice: t.detail.value,
              shearingSaleUnit: "元/" + this.data.unitName,
            }));
    }
    if ("2-1" == t.currentTarget.dataset.id) {
      if (!this.data.PriceJson1[0])
        return void wx.showToast({
          title: "请输入上一级价格",
          icon: "none",
        });
      if (
        parseFloat(t.detail.value) <= parseFloat(this.data.PriceJson1[0].minShearingSales) ||
        parseFloat(t.detail.value) <= parseFloat(this.data.PriceJson2[0].minShearingSales)
      )
        return (
          wx.showToast({
            title: "输入数不能小于/等于上一批起订量",
            icon: "none",
          }),
          void this.setData({
            minShearingSales: !1,
          })
        );
      (this.setData({
        minShearingSales: !0,
      }),
        this.data.PriceJson3.length > 0
          ? (this.data.PriceJson3[0].minShearingSales = t.detail.value)
          : this.data.PriceJson3.push({
              priceType: 1,
              minShearingSales: t.detail.value,
              shearingNumUnit: this.data.unitName,
              shearingPrice: "",
              shearingSaleUnit: "元/" + this.data.unitName,
            }));
    } else if ("2-2" == t.currentTarget.dataset.id) {
      if (0 != parseFloat(t.detail.value) || 0 != parseFloat(t.detail.value)) {
        if (!this.data.PriceJson1[0])
          return void wx.showToast({
            title: "请输入上一级价格",
            icon: "none",
          });
        if (
          parseFloat(t.detail.value) >= parseFloat(this.data.PriceJson1[0].shearingPrice) ||
          parseFloat(t.detail.value) >= parseFloat(this.data.PriceJson2[0].shearingPrice)
        )
          return (
            wx.showToast({
              title: "输入价格不能大于/等于或上一批起订量价格",
              icon: "none",
            }),
            void this.setData({
              quantityPrice2: !1,
            })
          );
      }
      (this.setData({
        quantityPrice2: !0,
      }),
        this.data.PriceJson3.length > 0
          ? (this.data.PriceJson3[0].shearingPrice = t.detail.value)
          : this.data.PriceJson3.push({
              priceType: 1,
              minShearingSales: "",
              shearingNumUnit: this.data.unitName,
              shearingPrice: t.detail.value,
              shearingSaleUnit: "元/" + this.data.unitName,
            }));
    }
    this.setData({
      PriceJson1: this.data.PriceJson1,
      PriceJson2: this.data.PriceJson2,
      PriceJson3: this.data.PriceJson3,
    });
  },
  savePriceList: function () {
    var objectSpread2 = this;
    if (1 === this.data.priceType) {
      if (0 == this.data.minShearingSales)
        return void wx.showToast({
          title: "产品数量报价中数量存在错误，请修改",
          icon: "none",
        });
      if (
        0 == this.data.quantityPrice0 ||
        0 == this.data.quantityPrice1 ||
        0 == this.data.quantityPrice2
      )
        return void wx.showToast({
          title: "产品数量报价中价格存在错误，请修改",
          icon: "none",
        });
      if (1 === this.data.priceType && 0 === this.data.PriceJson1.length)
        return void wx.showToast({
          title: "请填写数量",
          icon: "none",
        });
      if (this.data.PriceJson1.length > 0) {
        if ("" === this.data.PriceJson1[0].minShearingSales)
          return void wx.showToast({
            title: "数量不能为空",
            icon: "none",
          });
        if ("" === this.data.PriceJson1[0].shearingPrice)
          return void wx.showToast({
            title: "价格不能为空",
            icon: "none",
          });
      }
      if (this.data.PriceJson2.length > 0) {
        if ("" === this.data.PriceJson2[0].minShearingSales)
          return void wx.showToast({
            title: "数量不能为空",
            icon: "none",
          });
        if ("" === this.data.PriceJson2[0].shearingPrice)
          return void wx.showToast({
            title: "价格不能为空",
            icon: "none",
          });
      }
      if (this.data.PriceJson3.length > 0) {
        if ("" === this.data.PriceJson3[0].minShearingSales)
          return void wx.showToast({
            title: "数量不能为空",
            icon: "none",
          });
        if ("" === this.data.PriceJson3[0].shearingPrice)
          return void wx.showToast({
            title: "价格不能为空",
            icon: "none",
          });
      }
    }
    if (2 == this.data.priceType) {
      var app = !0;
      if (
        (this.data.priceColorList.forEach(function (t) {
          if (!t.bulkPrice || 0 == t.bulkPrice.length)
            return (
              wx.showToast({
                title: t.colorVal + t.colorName + "请填写价格",
                icon: "none",
              }),
              void (a = !1)
            );
        }),
        0 == app)
      )
        return;
    }
    this.setData({
      saving: 1,
    });
    var e = "",
      s = "";
    if (1 == this.data.priceType) {
      var n = [];
      (this.data.PriceJson1.length > 0 &&
        (this.data.goodsPriceJson = this.data.goodsPriceJson.concat(this.data.PriceJson1)),
        this.data.PriceJson2.length > 0 &&
          (this.data.goodsPriceJson = this.data.goodsPriceJson.concat(this.data.PriceJson2)),
        this.data.PriceJson3.length > 0 &&
          (this.data.goodsPriceJson = this.data.goodsPriceJson.concat(this.data.PriceJson3)),
        this.setData({
          goodsPriceJson: this.data.goodsPriceJson,
        }),
        this.data.goodsPriceJson.map(function (t) {
          n.push(t.shearingPrice);
        }),
        (e = Math.min.apply(n, n)),
        (s = Math.max.apply(n, n)));
    }
    if (2 == this.data.priceType) {
      var r = [];
      (this.setData({
        goodsPriceJson: this.data.priceColorList,
      }),
        this.data.goodsPriceJson.map(function (t) {
          r.push(t.bulkPrice);
        }),
        (e = Math.min.apply(r, r)),
        (s = Math.max.apply(r, r)));
    }
    if (this.data.isAllChange) {
      var o = this.data.selectedArr,
        c = [];
      o.forEach(function (t) {
        c.push(t.goodsid);
      });
      var h = this.data.goodsPriceJson.map(function (i) {
          return {
            minShearingSales: i.minShearingSales,
            shearingNumUnit: objectSpread2.data.unitName,
            shearingPrice: i.shearingPrice,
            shearingSaleUnit: "元/".concat(objectSpread2.data.unitName),
          };
        }),
        d = {
          productIds: c,
          priceList: h,
        };
      ServicesCard.servicesCard.saveBatchUpdatePrice(d).then(function (t) {
        0 === t.code
          ? wx.navigateBack({
              delta: 1,
            })
          : wx.showToast({
              title: t.data.msg,
              icon: "none",
            });
      });
    } else
      (wx.setStorageSync("colorColorList", this.data.priceColorList),
        wx.setStorageSync("goodsPriceJson", this.data.goodsPriceJson),
        wx.setStorageSync("priceType", this.data.priceType),
        wx.setStorageSync("unitName", this.data.unitName),
        wx.setStorageSync("miniNum", e),
        wx.setStorageSync("maxNum", s),
        wx.navigateBack({
          delta: 1,
        }));
  },
  usePreFunction: function () {
    var objectSpread2 = getCurrentPages(),
      ServicesCard = objectSpread2.find(function (t) {
        return "packageB/pages/color-card-management/batch-management/batch-management" === t.route;
      });
    ServicesCard && (ServicesCard.reset(), ServicesCard.getCardList());
  },
});
