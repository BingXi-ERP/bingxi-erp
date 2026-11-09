var t = require("../../../../@babel/runtime/helpers/interopRequireDefault").default,
  createForOfIteratorHelper = require("../../../../@babel/runtime/helpers/createForOfIteratorHelper"),
  a =
    (require("../../../libs/services/ServicesUserLog.js"),
    t(require("../../../utils/mta_analysis.js"))),
  app = getApp(),
  releaseCargoPass = require("../../../libs/services/releaseCargoPass.js").servicesCargoPass;
Page({
  data: {
    app: app,
    allItem: !1,
    userAuthList: {},
    typeId: "",
    categoryList: [],
    icon: {
      checked: "".concat(app.config.imgHost, "/img/v2.7.4/Control_Choiced@2x.png"),
      noCheck: "".concat(app.config.imgHost, "/img/v2.7.4/Control_NotChoice@2x.png"),
      noAllChecked: "".concat(app.config.imgHost, "/img/v2.7.4/Icon_Not_Select@2x.png"),
    },
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
  getList: function () {
    var t = this,
      a = arguments.length > 0 && void 0 !== arguments[0] ? arguments[0] : "";
    return new Promise(function (i, s) {
      wx.showNavigationBarLoading();
      var n = t.data,
        r = n.saleStatus,
        c = n.filterKey,
        l = n.pageNum,
        d = n.pageSize,
        u = n.colorCardList,
        g = {
          onSale: Number(r),
          filterKey: c,
          page: l,
          size: d,
          keyword: a,
          searchField: a,
        };
      ("" != t.data.typeId && (g.classifyId = t.data.typeId),
        releaseCargoPass.notPlatformList(g).then(function (a) {
          if ((wx.hideNavigationBarLoading(), 0 === a.code)) {
            1 === l && (u = []);
            var releaseCargoPass,
              s = createForOfIteratorHelper(a.data.content);
            try {
              for (s.s(); !(o = s.n()).done;) {
                var n = releaseCargoPass.value;
                u.push(n);
              }
            } catch (t) {
              s.e(t);
            } finally {
              s.f();
            }
            (u.forEach(function (e) {
              e.check = t.data.selectedArr.some(function (t) {
                return t.goodsid === e.id;
              });
            }),
              t.setData({
                colorCardList: u,
              }),
              0 === a.data.content.length &&
                l > 1 &&
                t.setData({
                  isDone: !0,
                }),
              i(a));
          } else
            (wx.showToast({
              title: a.msg,
              icon: "none",
            }),
              i(a));
        }));
    });
  },
  allChoice: function () {
    var t = this.data,
      createForOfIteratorHelper = t.colorCardList,
      a = t.selectedArr,
      app =
        (t.selectedStatusArr,
        createForOfIteratorHelper.filter(function (t) {
          return t.twoFiveImageFlag && t.material && t.gramWeight;
        }));
    if (this.data.allItem)
      (this.setData({
        allItem: !1,
      }),
        (a = []),
        createForOfIteratorHelper.forEach(function (t) {
          return (t.check = !1);
        }));
    else {
      if (!app.length)
        return (
          wx.showToast({
            title: "无符合条件的产品",
            icon: "none",
          }),
          void this.setData({
            selectedArr: [],
          })
        );
      (this.setData({
        allItem: !0,
      }),
        (a = []),
        app.forEach(function (t, i) {
          var releaseCargoPass = createForOfIteratorHelper.find(function (e) {
            return e.id === t.id;
          });
          (a.push({
            goodsid: t.id,
            mainimgpath: t.mainImgPath,
            goodsno: t.goodsNo,
            goodsname: t.goodsName,
          }),
            (releaseCargoPass.check = !0));
        }));
    }
    (this.setData({
      selectedArr: a,
      colorCardList: createForOfIteratorHelper,
    }),
      console.log(a));
  },
  toDetail: function (t) {
    var createForOfIteratorHelper = t.currentTarget.dataset.goodsid;
    wx.navigateTo({
      url: "/packageB/pages/color-card-management/preview/preview?goodsId=".concat(
        createForOfIteratorHelper,
      ),
    });
  },
  checkTap: function (t) {
    var createForOfIteratorHelper = t.currentTarget.dataset,
      a = createForOfIteratorHelper.goodsid,
      app = (createForOfIteratorHelper.index, createForOfIteratorHelper.mainimgpath),
      releaseCargoPass = createForOfIteratorHelper.goodsno,
      s = createForOfIteratorHelper.goodsname,
      n = createForOfIteratorHelper.item,
      r = this.data,
      c = r.colorCardList,
      l = r.selectedArr;
    r.selectedStatusArr;
    if (n.twoFiveImageFlag && n.material && n.gramWeight) {
      var d = c.findIndex(function (t) {
          return t.id === a;
        }),
        u = l.findIndex(function (t) {
          return t.goodsid === a;
        });
      (u < 0
        ? (l.push({
            goodsid: a,
            mainimgpath: app,
            goodsno: releaseCargoPass,
            goodsname: s,
            count: 1,
          }),
          c.length === l.length &&
            this.setData({
              allItem: !0,
            }),
          (c[d].check = !0))
        : (l.splice(u, 1),
          (c[d].check = !1),
          c.length !== l.length &&
            this.setData({
              allItem: !1,
            })),
        this.setData({
          colorCardList: c,
          selectedArr: l,
        }),
        console.log(l));
    }
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
        this.getList()));
  },
  search: function () {
    (this.setData({
      colorCardList: [],
      pageNum: 1,
    }),
      this.getList(this.data.inputValue).then(function (t) {
        0 == (t.data.content || []).length &&
          wx.showToast({
            title: "未查询到搜索数据",
            icon: "none",
          });
      }));
  },
  submit: function (t) {
    if (!(this.data.selectedArr.length < 1)) {
      var createForOfIteratorHelper = this.data.selectedArr.map(function (t) {
        return t.goodsid;
      });
      releaseCargoPass
        .releaseCargoPassAdd({
          productIds: createForOfIteratorHelper,
        })
        .then(function (t) {
          0 === t.code &&
            wx.navigateTo({
              url: "/packageB/pages/release-cargo-pass/cargo-tip/cargo-tip",
            });
        });
    }
  },
  onLoad: function (t) {
    (a.default.Page.init(),
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
      wx.removeStorageSync("changeBottomCard"));
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
        return "packageB/pages/release-cargo-pass/index" === t.route;
      });
    (console.log(createForOfIteratorHelper),
      createForOfIteratorHelper &&
        createForOfIteratorHelper.reset &&
        (createForOfIteratorHelper.reset(), createForOfIteratorHelper.getCargoList()));
  },
  onShow: function () {
    this.getList();
  },
  onUnload: function () {
    this.usePreFunction();
  },
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
        this.getList());
  },
});
