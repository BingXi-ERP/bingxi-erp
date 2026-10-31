var t = require("../../../@babel/runtime/helpers/interopRequireDefault").default,
  createForOfIteratorHelper = require("../../../@babel/runtime/helpers/createForOfIteratorHelper"),
  ServicesUserLog = require("../../../libs/services/ServicesUserLog.js"),
  mta_analysis = t(require("../../../utils/mta_analysis.js")),
  app = getApp(),
  ServicesCard = require("../../../libs/services/ServicesCard.js").servicesCard;
Page({
  data: {
    app: app,
    allItem: !1,
    userAuthList: {},
    typeId: "",
    categoryList: [],
    footerBar: [
      {
        name: "移除",
        icon: "".concat(app.config.imgHost, "/img/v2.17.0/Icon_Delete_Color@3x.png"),
        action: "del",
      },
      {
        name: "修改价格",
        icon: "".concat(app.config.imgHost, "/img/v2.7.4/Icon_Change_Price@2x.png"),
        action: "changePrice",
      },
      {
        name: "",
        icon: "",
        action: "",
      },
      {
        name: "分类至",
        icon: "".concat(app.config.imgHost, "/img/v2.7.4/Icon_Classification@2x.png"),
        action: "category",
      },
      {
        name: "转为底卡",
        icon: "".concat(app.config.imgHost, "/img/v2.7.4/Icon_Classification@2x.png"),
        action: "toBottomCard",
      },
    ],
    icon: {
      checked: "".concat(app.config.imgHost, "/img/v2.7.4/Control_Choiced@2x.png"),
      noCheck: "".concat(app.config.imgHost, "/img/v2.7.4/Control_NotChoice@2x.png"),
      noAllChecked: "".concat(app.config.imgHost, "/img/v2.7.4/Icon_Not_Select@2x.png"),
    },
    showPopup: !1,
    hideDel: !1,
    inputValue: "",
    pageNum: 1,
    pageSize: 8,
    saleStatus: 0,
    filterKey: 2,
    colorCardList: [],
    selectedStatusArr: [],
    selectedArr: [],
    isDone: !1,
    delAllTxet: !1,
  },
  getCardList: function () {
    var t = this,
      ServicesUserLog = arguments.length > 0 && void 0 !== arguments[0] ? arguments[0] : "";
    return new Promise(function (o, n) {
      wx.showNavigationBarLoading();
      var i = t.data,
        r = i.saleStatus,
        c = i.filterKey,
        l = i.pageNum,
        d = i.pageSize,
        g = i.colorCardList,
        h = {
          onSale: Number(r),
          filterKey: c,
          page: l,
          size: d,
          keyword: ServicesUserLog,
          searchFiled: ServicesUserLog,
        };
      ("" != t.data.typeId && (h.classifyId = t.data.typeId),
        ServicesCard.colorCardList(h).then(function (a) {
          if ((wx.hideNavigationBarLoading(), 0 === a.code)) {
            1 === l && (g = []);
            var app,
              ServicesCard = createForOfIteratorHelper(a.data.content);
            try {
              for (ServicesCard.s(); !(n = ServicesCard.n()).done;) {
                var i = app.value;
                g.push(i);
              }
            } catch (t) {
              ServicesCard.e(t);
            } finally {
              ServicesCard.f();
            }
            (g.forEach(function (e) {
              e.check = t.data.selectedArr.some(function (t) {
                return t.goodsid === e.id;
              });
            }),
              t.setData({
                colorCardList: g,
              }),
              0 === a.data.content.length &&
                l > 1 &&
                t.setData({
                  isDone: !0,
                }),
              o(a));
          } else
            (wx.showToast({
              title: a.msg,
              icon: "none",
            }),
              o(a));
        }));
    });
  },
  allChoice: function () {
    var t = this.data,
      createForOfIteratorHelper = t.colorCardList,
      ServicesUserLog = t.selectedArr;
    t.selectedStatusArr;
    (createForOfIteratorHelper.length !== ServicesUserLog.length
      ? (this.setData({
          allItem: !0,
        }),
        (a = []),
        createForOfIteratorHelper.forEach(function (t, e) {
          (ServicesUserLog.push({
            goodsid: t.id,
            mainimgpath: t.mainImgPath,
            goodsno: t.goodsNo,
            goodsname: t.goodsName,
          }),
            (t.check = !0));
        }))
      : (this.setData({
          allItem: !1,
        }),
        (a = []),
        createForOfIteratorHelper.forEach(function (t) {
          return (t.check = !1);
        })),
      this.setData({
        selectedArr: ServicesUserLog,
        colorCardList: createForOfIteratorHelper,
      }),
      console.log(ServicesUserLog));
  },
  checkTap: function (t) {
    var createForOfIteratorHelper = t.currentTarget.dataset,
      ServicesUserLog = createForOfIteratorHelper.goodsid,
      mta_analysis = (createForOfIteratorHelper.index, createForOfIteratorHelper.mainimgpath),
      app = createForOfIteratorHelper.goodsno,
      ServicesCard = createForOfIteratorHelper.goodsname,
      i = this.data,
      r = i.colorCardList,
      c = i.selectedArr,
      l =
        (i.selectedStatusArr,
        r.findIndex(function (t) {
          return t.id === ServicesUserLog;
        })),
      d = c.findIndex(function (t) {
        return t.goodsid === ServicesUserLog;
      });
    (d < 0
      ? (c.push({
          goodsid: ServicesUserLog,
          mainimgpath: mta_analysis,
          goodsno: app,
          goodsname: ServicesCard,
          count: 1,
        }),
        r.length === c.length &&
          this.setData({
            allItem: !0,
          }),
        (r[l].check = !0))
      : (c.splice(d, 1),
        (r[l].check = !1),
        r.length !== c.length &&
          this.setData({
            allItem: !1,
          })),
      this.setData({
        colorCardList: r,
        selectedArr: c,
      }),
      console.log(c));
  },
  getValue: function (t) {
    var createForOfIteratorHelper = t.detail.value;
    (this.setData({
      inputValue: createForOfIteratorHelper,
    }),
      "" == createForOfIteratorHelper &&
        (this.setData({
          colorCardList: [],
          pageNum: 1,
        }),
        this.getCardList()));
  },
  search: function () {
    (this.setData({
      colorCardList: [],
      pageNum: 1,
    }),
      this.getCardList(this.data.inputValue).then(function (t) {
        0 == t.data.list.length &&
          wx.showToast({
            title: "搜索不到此色卡",
            icon: "none",
          });
      }));
  },
  keyboardConfirm: function () {
    (this.setData({
      colorCardList: [],
      pageNum: 1,
    }),
      this.getCardList(this.data.inputValue).then(function (t) {
        0 == t.data.list.length &&
          wx.showToast({
            title: "搜索不到此色卡",
            icon: "none",
          });
      }));
  },
  onOrOffShelves: function () {
    var t = this,
      mta_analysis = this.data,
      app = mta_analysis.selectedArr,
      i = mta_analysis.saleStatus,
      r = (mta_analysis.colorCardList, mta_analysis.selectedStatusArr, []),
      c = "";
    c = ServicesCard.batchSetOnSale;
    var l,
      d = createForOfIteratorHelper(app);
    try {
      for (d.s(); !(l = d.n()).done;) {
        var g = l.value;
        r.push(g.goodsid);
      }
    } catch (t) {
      d.e(t);
    } finally {
      d.f();
    }
    c({
      productIds: r,
      onSale: 1 === Number(i) ? 0 : 1,
    }).then(function (e) {
      (0 === e.code
        ? (t.setData({
            pageNum: 1,
            colorCardList: [],
            selectedArr: [],
            selectedStatusArr: [],
          }),
          t.getCardList(),
          1 == i
            ? (ServicesUserLog.servicesUserLog.setUserHandleLog(115),
              wx.showToast({
                title: "色卡下架成功",
                icon: "none",
              }))
            : 0 == i &&
              (ServicesUserLog.servicesUserLog.setUserHandleLog(116),
              wx.showToast({
                title: "色卡上架成功",
                icon: "none",
              })))
        : wx.showToast({
            title: e.msg,
            icon: "none",
          }),
        t.setData({
          allItem: !1,
        }));
    });
  },
  getColorCardCategoryList: function () {
    var t = this;
    ServicesCard.categoryList().then(function (e) {
      0 === e.code
        ? t.setData({
            categoryList: e.data,
          })
        : wx.showToast({
            title: e.msg,
            icon: "none",
          });
    });
  },
  footerBarTap: function (t) {
    var ServicesUserLog = this,
      mta_analysis = t.currentTarget.dataset.action,
      app = this.data,
      i = app.selectedArr,
      r = (app.saleStatus, app.colorCardList, app.typeId);
    if (0 != i.length)
      switch (mta_analysis) {
        case "del":
          var c,
            l = [],
            d = createForOfIteratorHelper(i);
          try {
            for (d.s(); !(c = d.n()).done;) {
              var g = c.value;
              l.push(g.goodsid);
            }
          } catch (t) {
            d.e(t);
          } finally {
            d.f();
          }
          var h = {
            classifyId: r,
            productIds: l,
          };
          ServicesCard.CategoryListRemove(h).then(function (t) {
            0 === t.code
              ? (wx.showToast({
                  title: "移除成功",
                  icon: "none",
                }),
                ServicesUserLog.reset(),
                ServicesUserLog.getCardList())
              : wx.showToast({
                  title: t.msg,
                  icon: "none",
                });
          });
          break;
        case "off":
        case "on":
          this.onOrOffShelves();
          break;
        case "category":
          this.setData({
            showPopup: !0,
          });
          break;
        case "changePrice":
          if (i.length > 1e3)
            return void wx.showToast({
              title: "选择色卡不能大于1000个,请重新选择",
              icon: "none",
            });
          wx.navigateTo({
            url: "/pages/color-card-management/add-color-card/add-price/add-price?isAllChange=true&&selectedArr=".concat(
              JSON.stringify(i),
            ),
          });
          break;
        case "toBottomCard":
          (wx.setStorageSync("changeBottomCard", i),
            wx.navigateTo({
              url: "/pages/color-card-management/batch-management/color-card-select/index",
            }));
      }
    else
      wx.showToast({
        title: "请选择色卡",
        icon: "none",
      });
  },
  confirmPopup: function (t) {
    var mta_analysis,
      app = this,
      i = t.detail.categoryIdList,
      r = [],
      c = createForOfIteratorHelper(this.data.selectedArr);
    try {
      for (c.s(); !(o = c.n()).done;) {
        var l = mta_analysis.value;
        r.push(l.goodsid);
      }
    } catch (t) {
      c.e(t);
    } finally {
      c.f();
    }
    var d = {
      classifyIds: i,
      productIds: r,
    };
    ServicesCard.addCategoryList(d).then(function (t) {
      0 === t.code
        ? (ServicesUserLog.servicesUserLog.setUserHandleLog(105),
          wx.showToast({
            title: "添加分类成功",
            icon: "none",
          }),
          app.setData({
            showPopup: !1,
          }),
          app.getColorCardCategoryList())
        : wx.showToast({
            title: t.msg,
            icon: "none",
          });
    });
  },
  closePopup: function () {
    this.setData({
      showPopup: !1,
    });
  },
  onLoad: function (t) {
    (mta_analysis.default.Page.init(),
      this.setData({
        userAuthList: app.userAuthList,
      }),
      "" != t.id && null != t.id
        ? this.setData({
            typeId: t.id,
          })
        : this.setData({
            hideDel: !0,
          }),
      this.setData({
        saleStatus: t.saleStatus,
      }));
    var createForOfIteratorHelper = this.data.footerBar;
    (1 == t.saleStatus
      ? (e = createForOfIteratorHelper.map(function (t) {
          return "" === t.name
            ? {
                name: "下架",
                icon: "".concat(app.config.imgHost, "/img/v2.7.4/Icon_Off_Shelves_Dark@2x.png"),
                action: "off",
              }
            : t;
        }))
      : 0 == t.saleStatus &&
        (e = createForOfIteratorHelper.map(function (t) {
          return "" === t.name
            ? {
                name: "上架",
                icon: "".concat(app.config.imgHost, "/img/v2.7.4/Icon_Shelves_Dark@2x.png"),
                action: "on",
              }
            : t;
        })),
      this.data.userAuthList["goods:batchSetOnSale"] ||
        (e = createForOfIteratorHelper.filter(function (t) {
          return "上架" !== t.name;
        })),
      this.data.userAuthList["goods:batchSetOffSale"] ||
        (e = createForOfIteratorHelper.filter(function (t) {
          return "下架" !== t.name;
        })),
      this.setData({
        footerBar: createForOfIteratorHelper,
      }),
      wx.hideShareMenu(),
      wx.removeStorageSync("changeBottomCard"),
      this.getColorCardCategoryList());
  },
  reset: function () {
    this.setData({
      pageNum: 1,
      colorCardList: [],
      allItem: !1,
      selectedArr: [],
      selectedStatusArr: [],
      isDone: !1,
    });
  },
  usePreFunction: function () {
    var t = getCurrentPages(),
      createForOfIteratorHelper = t.find(function (t) {
        return "pages/color-card-management/color-card-management" === t.route;
      });
    (console.log(createForOfIteratorHelper),
      createForOfIteratorHelper.reset(),
      createForOfIteratorHelper.getCardList());
  },
  onReady: function () {},
  onShow: function () {
    this.getCardList();
  },
  onHide: function () {},
  onUnload: function () {
    this.usePreFunction();
  },
  onPullDownRefresh: function () {},
  onReachBottom: function () {
    var t = this.data,
      createForOfIteratorHelper = t.pageNum;
    t.isDone
      ? wx.showToast({
          title: "数据已全部加载完毕",
          icon: "none",
        })
      : (createForOfIteratorHelper++,
        this.setData({
          pageNum: createForOfIteratorHelper,
          allItem: !1,
        }),
        this.getCardList());
  },
  onShareAppMessage: function () {},
});
