var app = getApp();
Page({
  data: {
    colorcolorList: [],
    goodsPriceJson: [],
    lastNumbers: 0,
    numbers: "",
    showAddNumber: 0,
    showClearNumber: 0,
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
  },
  onLoad: function (o) {
    wx.hideShareMenu();
  },
  onReady: function () {},
  onShow: function () {
    var app = getCurrentPages(),
      t = null;
    app.length && (t = app[app.length - 2]);
    var a = t.route;
    (this.setData({
      currentType: a,
    }),
      console.log(a));
    var e = this;
    ((e.data.colorcolorList =
      "pages/color-card-management/add-bottom-card/add-bottom-card" === this.data.currentType
        ? wx.getStorageSync("colorColorCardList")
        : wx.getStorageSync("colorColorList")),
      (e.data.goodsPriceJson = wx.getStorageSync("goodsPriceJson")));
    var r = wx.getStorageSync("checkColorItem");
    ("" != r &&
      (e.data.colorcolorList.map(function (o, t) {
        t == wx.getStorageSync("colorColorId") &&
          ((o.colorName = r.colorName), (o.engColorName = r.engColorName));
      }),
      e.data.goodsPriceJson.map(function (o, t) {
        t == wx.getStorageSync("colorColorId") &&
          ((o.colorName = r.colorName), (o.engColorName = r.engColorName));
      })),
      e.setData({
        colorcolorList: e.data.colorcolorList,
        goodsPriceJson: e.data.goodsPriceJson,
        totalPage:
          e.data.colorcolorList && e.data.colorcolorList.length
            ? Math.ceil(e.data.colorcolorList.length / e.data.size)
            : 0,
      }),
      this.getColorLastNumber(),
      this.colorListPaging(e.data.colorcolorList, "" === r, "" !== r),
      "" != e.data.colorcolorList &&
        null != e.data.colorcolorList &&
        e.setData({
          hideType: 1,
        }));
  },
  onReachBottom: function () {
    var app = this.data,
      t = app.page;
    t >= app.totalPage ||
      (t++,
      this.setData({
        page: t,
      }),
      this.colorListPaging(this.data.colorcolorList));
  },
  onHide: function () {},
  onUnload: function () {
    0 == this.data.hideType &&
      ("pages/color-card-management/add-bottom-card/add-bottom-card" === this.data.currentType
        ? wx.removeStorageSync("colorColorCardList")
        : wx.removeStorageSync("colorColorList"),
      wx.removeStorageSync("colorColorId"),
      wx.removeStorageSync("checkColorItem"));
  },
  handleRpSort: function () {
    var app = this.data.pageColorList,
      t = this.data.colorcolorList;
    app.length < 2 ||
      (app.sort(function (o, t) {
        return o.colorVal.match(/\d+(\.\d+)?/g) - t.colorVal.match(/\d+(\.\d+)?/g);
      }),
      t.sort(function (o, t) {
        return o.colorVal.match(/\d+(\.\d+)?/g) - t.colorVal.match(/\d+(\.\d+)?/g);
      }),
      this.setData({
        pageColorList: app,
        colorcolorList: t,
      }));
  },
  saveColorList: function () {
    var app,
      t,
      a,
      e = this,
      r = wx.getStorageSync("unitName");
    if (
      (this.data.colorcolorList &&
        (null === (o = this.data.colorcolorList) || void 0 === app ? void 0 : app.length) > 0 &&
        this.data.colorcolorList.forEach(function (o, t) {
          "" == o.colorVal && "" == o.colorName && e.data.colorcolorList.splice(t, 1);
        }),
      this.data.goodsPriceJson &&
        (null === (t = this.data.goodsPriceJson) || void 0 === t ? void 0 : t.length) > 0 &&
        this.data.goodsPriceJson.forEach(function (o, t) {
          "" == o.colorVal && "" == o.colorName && e.data.goodsPriceJson.splice(t, 1);
        }),
      this.setData({
        hideType: 1,
      }),
      1 == this.data.clearPrice)
    ) {
      var c = wx.getStorageSync("priceType");
      if (2 == c && null != c) {
        var i,
          s = [];
        if (
          (this.data.colorcolorList.forEach(function (o) {
            o.colorPrice && s.push(o.colorPrice);
          }),
          null != s && s.length)
        ) {
          var l = Math.max.apply(Math, s),
            n = Math.min.apply(Math, s);
          (wx.setStorageSync("miniNum", n), wx.setStorageSync("maxNum", l));
        } else (wx.removeStorageSync("miniNum"), wx.removeStorageSync("maxNum"));
        if (1 == (null === (i = this.data.colorcolorList) || void 0 === i ? void 0 : i.length)) {
          var d = this.data.colorcolorList[0].colorPrice;
          (wx.setStorageSync("miniNum", d), wx.setStorageSync("maxNum", d));
        }
      }
    }
    (null === (a = this.data.colorcolorList) || void 0 === a ? void 0 : a.length) > 0
      ? ("pages/color-card-management/add-bottom-card/add-bottom-card" === this.data.currentType
          ? wx.setStorageSync("colorColorCardList", this.data.colorcolorList)
          : wx.setStorageSync("colorColorList", this.data.colorcolorList),
        2 == wx.getStorageSync("priceType") &&
          (this.data.goodsPriceJson.forEach(function (o) {
            (o.bulkNumUnit || (o.bulkNumUnit = r),
              o.bulkSaleUnit || (o.bulkSaleUnit = "元/" + r),
              (o.bulkPrice = o.bulkPrice || 0));
          }),
          wx.setStorageSync("goodsPriceJson", this.data.goodsPriceJson)),
        wx.navigateBack({
          delta: 1,
        }))
      : wx.navigateBack({
          delta: 1,
        });
  },
  toColorName: function (o) {
    var t = this;
    (wx.showLoading({
      mask: !0,
    }),
      clearTimeout(this.data.stopConut),
      (this.data.stopConut = setTimeout(function () {
        (t.setData({
          hideType: 1,
        }),
          wx.removeStorageSync("checkColorItem"),
          "pages/color-card-management/add-bottom-card/add-bottom-card" === t.data.currentType
            ? wx.setStorageSync("colorColorCardList", t.data.colorcolorList)
            : wx.setStorageSync("colorColorList", t.data.colorcolorList),
          wx.setStorageSync("goodsPriceJson", t.data.goodsPriceJson),
          wx.setStorageSync("colorColorItem", o.currentTarget.dataset.item),
          wx.setStorageSync("colorColorId", o.currentTarget.dataset.id),
          wx.navigateTo({
            url: "/pages/color-card-management/add-color-card/new-add-color-name/new-add-color-name",
            complete: function () {
              wx.hideLoading();
            },
          }));
      }, 500)));
  },
  addNumber: function (o) {
    o.detail.value;
    ((this.numbers = o.detail.value),
      this.setData({
        numbers: this.numbers,
      }));
  },
  addColorList: function (o) {
    this.setData({
      showAddNumber: 1,
      numbers: "",
    });
  },
  cancelAdd: function () {
    this.setData({
      showAddNumber: 0,
      showClearNumber: 0,
    });
  },
  getColorLastNumber: function () {
    var app,
      t = 0,
      a = this.data.colorcolorList;
    a &&
      a.length &&
      (t =
        null === (o = a[a.length - 1].colorVal) || void 0 === app
          ? void 0
          : app.replace(/[^0-9]/gi, ""));
    this.setData({
      lastNumbers: parseInt(t),
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
    var t = this;
    if (!this.data.numbers || parseInt(this.data.numbers) <= 0)
      wx.showToast({
        title: "请输入添加色号数量",
        icon: "none",
      });
    else {
      var a = this.data.colorcolorList || [],
        e = this.data.goodsPriceJson || [],
        r = this.data.numbers;
      if (Number(r) > 2e3)
        wx.showToast({
          title: "一次添加色号不能超过2000个",
          icon: "none",
        });
      else {
        for (var c = 1; c <= r; c++) {
          var i;
          if ((null === (i = a) || void 0 === i ? void 0 : i.length) > 0) {
            var s = {
              colorVal: parseInt(this.data.lastNumbers || 0) + c + "#",
              engColorName: "",
              colorName: "",
              id: "",
              priceType: "2",
            };
            (a.push(s), e.push(s));
          } else
            ((a = [
              {
                colorVal: c + "#",
                engColorName: "",
                colorName: "",
                id: "",
                priceType: "2",
              },
            ]),
              (e = [
                {
                  colorVal: c + "#",
                  engColorName: "",
                  colorName: "",
                  id: "",
                  priceType: "2",
                },
              ]));
        }
        (this.colorListPaging(a, !1, !0),
          this.setData({
            showAddNumber: 0,
            colorcolorList: a,
            goodsPriceJson: e,
            totalPage: Math.ceil(a.length / this.data.size),
          }),
          this.getColorLastNumber(),
          wx.nextTick(function () {
            (t.data.lastNumbers > 0 &&
              t.setData({
                clearPrice: !0,
              }),
              t.onReachBottom(),
              t.onPageScrollBottom());
          }));
      }
    }
  },
  colorListPaging: function (o, t, a) {
    var e = this.data,
      r = e.page,
      c = (r - 1) * e.size,
      i = c + 20,
      s = o ? o.slice(c, i) : [];
    if (t) {
      var l = wx.getStorageSync("checkColorItem");
      "" != l &&
        this.data.pageColorList.map(function (o, t) {
          t == wx.getStorageSync("colorColorId") &&
            ((o.colorName = l.colorName), (o.engColorName = l.engColorName));
        });
    }
    (a && ((s = o.slice(0, i)), (this.data.pageColorList = s)),
      1 === r || a || (this.data.pageColorList = this.data.pageColorList.concat(s)),
      this.setData({
        pageColorList: 1 === r ? s : this.data.pageColorList,
      }));
  },
  addSingleColorList: function () {
    var app,
      t = this,
      a = this.data.colorcolorList || [],
      e = this.data.goodsPriceJson || [];
    if (Number(1) > 2e3)
      wx.showToast({
        title: "一次添加色号不能超过2000个",
        icon: "none",
      });
    else {
      if ((null === (o = a) || void 0 === app ? void 0 : app.length) > 0) {
        var r = {
          colorVal: parseInt(this.data.lastNumbers || 0) + 1 + "#",
          engColorName: "",
          colorName: "",
          id: "",
          priceType: "2",
        };
        (a.push(r), e.push(r));
      } else
        ((e = [
          {
            colorVal: "1#",
            engColorName: "",
            colorName: "",
            id: "",
            priceType: "2",
          },
        ]),
          (a = [
            {
              colorVal: "1#",
              engColorName: "",
              colorName: "",
              id: "",
              priceType: "2",
            },
          ]));
      (this.colorListPaging(a, !1, !0),
        this.setData({
          showAddNumber: 0,
          colorcolorList: a,
          goodsPriceJson: e,
          totalPage: Math.ceil(a.length / this.data.size),
        }),
        this.getColorLastNumber(),
        wx.nextTick(function () {
          (t.data.lastNumbers > 0 &&
            t.setData({
              clearPrice: !0,
            }),
            t.onReachBottom(),
            t.onPageScrollBottom());
        }));
    }
  },
  removeColorList: function () {
    this.setData({
      showClearNumber: 1,
      lastNumbers: 0,
    });
  },
  sureClear: function () {
    (this.setData({
      showClearNumber: 0,
      pageColorList: [],
      colorcolorList: [],
      goodsPriceJson: [],
      clearPrice: !0,
    }),
      wx.setStorageSync("goodsPriceJson", this.data.goodsPriceJson),
      "pages/color-card-management/add-bottom-card/add-bottom-card" === this.data.currentType
        ? wx.setStorageSync("colorColorCardList", this.data.colorcolorList)
        : wx.setStorageSync("colorColorList", this.data.colorcolorList),
      wx.nextTick(function () {
        wx.pageScrollTo({
          scrollTop: 0,
        });
      }));
  },
  removeIndex: function (o) {
    var t;
    (this.data.colorcolorList.splice(o.currentTarget.id, 1),
      this.data.pageColorList.splice(o.currentTarget.id, 1));
    var a = o.currentTarget.dataset.colorval,
      e = -1;
    ((e = a
      ? this.data.goodsPriceJson.findIndex(function (o) {
          return o.colorVal === a;
        })
      : o.currentTarget.id) > -1 && this.data.goodsPriceJson.splice(e, 1),
      0 == (null === (t = this.data.colorcolorList) || void 0 === t ? void 0 : t.length) &&
        this.setData({
          lastNumbers: 0,
        }),
      this.setData({
        clearPrice: !0,
        pageColorList: this.data.pageColorList,
        colorcolorList: this.data.colorcolorList,
        goodsPriceJson: this.data.goodsPriceJson,
      }),
      wx.setStorageSync("goodsPriceJson", this.data.goodsPriceJson),
      "pages/color-card-management/add-bottom-card/add-bottom-card" === this.data.currentType
        ? wx.setStorageSync("colorColorCardList", this.data.colorcolorList)
        : wx.setStorageSync("colorColorList", this.data.colorcolorList));
  },
  inputgetName: function (o) {
    ((this.data.colorcolorList[o.currentTarget.dataset.index].colorVal = o.detail.value.replace(
      /^\s+|\s+$/g,
      "",
    )),
      (this.data.pageColorList[o.currentTarget.dataset.index].colorVal = o.detail.value.replace(
        /^\s+|\s+$/g,
        "",
      )),
      (this.data.goodsPriceJson[o.currentTarget.dataset.index].colorVal = o.detail.value.replace(
        /^\s+|\s+$/g,
        "",
      )),
      this.setData({
        pageColorList: this.data.pageColorList,
        colorcolorList: this.data.colorcolorList,
        goodsPriceJson: this.data.goodsPriceJson,
      }));
  },
  colorValInputBlur: function (o) {
    var t = o.detail.value.replace(/^\s+|\s+$/g, ""),
      a = o.currentTarget.dataset.index;
    t &&
      this.data.pageColorList.some(function (o, e) {
        return o.colorVal === t && e !== a;
      }) &&
      (wx.showToast({
        title: "色号".concat(t, "已存在，请重新设置"),
        icon: "none",
      }),
      (this.data.pageColorList[a].colorVal = ""),
      (this.data.colorcolorList[a].colorVal = ""),
      (this.data.goodsPriceJson[a].colorVal = ""),
      this.setData({
        pageColorList: this.data.pageColorList,
        colorcolorList: this.data.colorcolorList,
        goodsPriceJson: this.data.goodsPriceJson,
      }));
  },
});
