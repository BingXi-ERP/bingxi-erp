var t = require("../../../@babel/runtime/helpers/interopRequireDefault").default,
  createForOfIteratorHelper = require("../../../@babel/runtime/helpers/createForOfIteratorHelper"),
  mta_analysis = t(require("../../../utils/mta_analysis.js")),
  app = getApp(),
  ServicesCustomer = require("../../../libs/services/ServicesCustomer.js").servicesCustomer,
  util = require("../../../libs/utils/util.js").utils;
Page({
  data: {
    app: app,
    placeholder: "请输入色卡编号、品名搜索",
    inputValue: "",
    colorCardList: [],
    selectedStatusArr: [],
    selectedArr: [],
    icon: {
      checked: "".concat(app.config.imgHost, "/img/customer/ic_dagou@3x.png"),
      noCheck: "".concat(app.config.imgHost, "/img/customer/ic_weixuan@3x.png"),
    },
    popupStepper: {
      show: !1,
    },
    pageNum: 1,
    pageSize: 10,
    isDone: !1,
    delAllTxet: !1,
  },
  getColorCardList: function () {
    var t = this;
    return new Promise(function (e, o) {
      var app = {
          onSale: 1,
          page: t.data.pageNum,
          size: t.data.pageSize,
        },
        util = t.data,
        r = util.selectedStatusArr,
        n = util.selectedArr,
        d = util.colorCardList,
        l = util.delAllTxet;
      ServicesCustomer.colorCardList(app).then(function (o) {
        if (0 === o.code) {
          for (
            var app = o.data.content || [], ServicesCustomer = 0;
            ServicesCustomer < app.length;
            ServicesCustomer++
          )
            (r.push(!1), d.push(app[ServicesCustomer]));
          if (
            (t.setData({
              selectedStatusArr: r,
              colorCardList: d,
            }),
            0 === app.length &&
              t.data.pageNum > 1 &&
              t.setData({
                isDone: !0,
              }),
            l)
          )
            for (var util = 0; util < n.length; util++)
              for (var c = 0; c < d.length; c++)
                n[util].goodsid == d[c].id &&
                  ((r[c] = !0),
                  t.setData({
                    selectedStatusArr: r,
                  }),
                  console.log(t.data.selectedStatusArr));
          (console.log(t.data.colorCardList), e(o));
        } else
          wx.showToast({
            title: o.msg,
            icon: "none",
          });
      });
    });
  },
  checkTap: function (t) {
    var createForOfIteratorHelper = t.currentTarget.dataset,
      mta_analysis = createForOfIteratorHelper.goodsid,
      app = createForOfIteratorHelper.index,
      ServicesCustomer = createForOfIteratorHelper.mainimgpath,
      util = createForOfIteratorHelper.goodsno,
      r = createForOfIteratorHelper.goodsname,
      n = this.data.selectedStatusArr,
      d = this.data.selectedArr;
    if (((n[app] = !n[app]), n[app]))
      d.push({
        goodsid: mta_analysis,
        mainimgpath: ServicesCustomer,
        goodsno: util,
        goodsname: r,
        count: 1,
      });
    else for (var l = 0; l < d.length; l++) d[l].goodsid == mta_analysis && d.splice(l, 1);
    (this.setData({
      selectedStatusArr: n,
      selectedArr: d,
    }),
      console.log(this.data.selectedArr));
  },
  showPopupStepper: function () {
    this.setData({
      "popupStepper.show": !0,
    });
  },
  closePopupStepper: function () {
    this.setData({
      "popupStepper.show": !1,
    });
  },
  toAddRecord: function () {
    (wx.setStorageSync("pickColorCard", this.data.selectedArr),
      wx.navigateBack({
        delta: 1,
      }));
  },
  confirmColorCard: function () {
    (wx.setStorageSync("pickColorCard", this.data.selectedArr),
      wx.navigateBack({
        delta: 1,
      }));
  },
  delList: function () {
    for (
      var t = this.data,
        createForOfIteratorHelper = (t.colorCardList, t.selectedStatusArr),
        mta_analysis = t.selectedArr,
        app = 0;
      app < this.data.colorCardList.length;
      app++
    )
      createForOfIteratorHelper[app] = !1;
    ((o = []),
      this.setData({
        selectedStatusArr: createForOfIteratorHelper,
        selectedArr: mta_analysis,
      }));
  },
  minTap: function (t) {
    for (
      var createForOfIteratorHelper = t.detail.index,
        mta_analysis = this.data,
        app = mta_analysis.selectedArr,
        ServicesCustomer = mta_analysis.colorCardList,
        util = mta_analysis.selectedStatusArr,
        r = 0;
      r < ServicesCustomer.length;
      r++
    )
      ServicesCustomer[r].id == app[createForOfIteratorHelper].goodsid && (util[r] = !1);
    (app.splice(createForOfIteratorHelper, 1),
      this.setData({
        selectedArr: app,
        selectedStatusArr: util,
      }));
  },
  scan: function () {
    var t = this,
      mta_analysis = this.data.selectedArr;
    wx.scanCode({
      onlyFromCamera: !0,
      success: function (a) {
        var r = a.result;
        if (r) {
          var n = util.getQueryString(r, "goodsId");
          if ((console.log("扫码goodsId：", n), n && "" != n)) {
            var d,
              l = createForOfIteratorHelper(mta_analysis);
            try {
              for (l.s(); !(d = l.n()).done;) {
                if (d.value.goodsid == n)
                  return void wx.showToast({
                    title: "此色卡已添加",
                    icon: "none",
                  });
              }
            } catch (t) {
              l.e(t);
            } finally {
              l.f();
            }
            ServicesCustomer.goodsDetail(n, {}).then(function (e) {
              if (0 === e.code) {
                var app = e.data;
                if (wx.getStorageSync("myShopId") != app.shopId)
                  return void wx.showToast({
                    title: "不能添加别家店铺色卡",
                    icon: "none",
                  });
                (mta_analysis.push({
                  goodsid: app.id,
                  mainimgpath: app.mainImgPath,
                  goodsno: app.goodsNo,
                  goodsname: app.goodsName,
                  count: 1,
                }),
                  t.setData({
                    selectedArr: mta_analysis,
                  }),
                  console.log(t.data.selectedArr));
              } else
                wx.showToast({
                  title: e.msg,
                  icon: "none",
                });
            });
          } else
            wx.showToast({
              title: "找不到此色卡！",
              icon: "none",
            });
        } else
          wx.showToast({
            icon: "none",
            title: "扫码结果：无内容",
          });
      },
      fail: function (t) {
        wx.showToast({
          icon: "none",
          title: "扫码失败！",
        });
      },
    });
  },
  search: function () {
    var t = this;
    if ("" != this.data.inputValue) {
      this.setData({
        pageNum: 1,
      });
      var createForOfIteratorHelper = {
          page: this.data.pageNum,
          size: this.data.pageSize,
          keyword: this.data.inputValue,
        },
        mta_analysis = this.data,
        app = mta_analysis.selectedStatusArr,
        util = (mta_analysis.selectedArr, mta_analysis.colorCardList);
      ServicesCustomer.colorCardList(createForOfIteratorHelper).then(function (e) {
        if (0 === e.code) {
          var mta_analysis = e.data.content || [];
          if (0 == mta_analysis.length)
            return void wx.showToast({
              title: "搜索不到色卡",
              icon: "none",
            });
          i = [];
          for (var ServicesCustomer = 0; ServicesCustomer < mta_analysis.length; ServicesCustomer++)
            ((app[ServicesCustomer] = !1), util.push(mta_analysis[ServicesCustomer]));
          t.setData({
            selectedStatusArr: app,
            colorCardList: util,
          });
        } else
          wx.showToast({
            title: e.msg,
            icon: "none",
          });
      });
    } else
      wx.showToast({
        title: "请输入要搜索的色卡编号或品名",
        icon: "none",
      });
  },
  confirm: function () {
    var t = this;
    if ("" != this.data.inputValue) {
      this.setData({
        pageNum: 1,
      });
      var createForOfIteratorHelper = {
          page: this.data.pageNum,
          size: this.data.pageSize,
          keyword: this.data.inputValue,
        },
        mta_analysis = this.data,
        app = mta_analysis.selectedStatusArr,
        util = (mta_analysis.selectedArr, mta_analysis.colorCardList);
      ServicesCustomer.colorCardList(createForOfIteratorHelper).then(function (e) {
        if (0 === e.code) {
          var mta_analysis = e.data.content || [];
          if (0 == mta_analysis.length)
            return void wx.showToast({
              title: "搜索不到色卡",
              icon: "none",
            });
          i = [];
          for (var ServicesCustomer = 0; ServicesCustomer < mta_analysis.length; ServicesCustomer++)
            ((app[ServicesCustomer] = !1), util.push(mta_analysis[ServicesCustomer]));
          t.setData({
            selectedStatusArr: app,
            colorCardList: util,
          });
        } else
          wx.showToast({
            title: e.msg,
            icon: "none",
          });
      });
    } else
      wx.showToast({
        title: "请输入要搜索的色卡编号或品名",
        icon: "none",
      });
  },
  getValue: function (t) {
    var createForOfIteratorHelper = t.detail.value;
    (this.setData({
      inputValue: createForOfIteratorHelper,
    }),
      "" == createForOfIteratorHelper
        ? (this.setData({
            colorCardList: [],
            selectedStatusArr: [],
            delAllTxet: !0,
          }),
          this.getColorCardList())
        : this.setData({
            delAllTxet: !1,
          }));
  },
  onLoad: function (t) {
    (mta_analysis.default.Page.init(), this.getColorCardList(), wx.hideShareMenu());
  },
  onReady: function () {},
  onShow: function () {},
  onHide: function () {},
  onUnload: function () {},
  onPullDownRefresh: function () {},
  onReachBottom: function () {
    var t = this.data,
      createForOfIteratorHelper = t.pageNum;
    t.isDone
      ? wx.showToast({
          title: "数据已全部加载完毕",
          icon: "none",
        })
      : (wx.showLoading({
          title: "色卡加载中",
        }),
        createForOfIteratorHelper++,
        this.setData({
          pageNum: createForOfIteratorHelper,
        }),
        this.getColorCardList().then(function () {
          wx.hideLoading();
        }));
  },
  onShareAppMessage: function () {},
});
