var t = require("../../../../@babel/runtime/helpers/regeneratorRuntime"),
  a = require("../../../../@babel/runtime/helpers/asyncToGenerator"),
  e = require("../../../../@babel/runtime/helpers/defineProperty"),
  getDictData = require("../../../libs/utils/getDictData"),
  releaseCargoPass = require("../../../libs/services/releaseCargoPass.js").servicesCargoPass,
  app = getApp();
Page({
  data: {
    domain: "",
    supplierAdrTypeOption: [],
    tabsActive: 1,
    jhtListIcon: "".concat(app.config.imgHost, "/img/customer/duibuIcon/icon/jht_list.png"),
    iconGramWeight: "".concat(
      app.config.imgHost,
      "/img/customer/duibuIcon/icon/icon_gramweight.png",
    ),
    iconMaterial: "".concat(app.config.imgHost, "/img/customer/duibuIcon/icon/icon_material.png"),
    productShowMode: !1,
    globalApp: app,
    supplierData: {},
    loadParams: {
      classifyId: "",
      productCompanyId: "",
      page: 1,
      size: 10,
      totalPage: 0,
    },
    curIndex: 0,
    titleType: [],
    formInline: {
      page: 1,
      size: 10,
      gramWeightSort: "desc",
      keyword: "1",
    },
    companyId: "",
    restockData: [],
    supplierAdrTypeOption: [],
  },
  onScrollLower: function () {
    this.getRestockList();
  },
  getRestockList: function () {
    var t = this,
      a = this.data.formInline,
      e = a.page,
      getDictData = a.totalPage;
    e > getDictData && 0 !== getDictData
      ? (e = getDictData)
      : (wx.showLoading({
          title: "拼命加载中...",
        }),
        releaseCargoPass
          .getProductList(this.data.loadParams)
          .then(function (a) {
            if (0 === a.code) {
              ++e;
              var getDictData = a.data ? a.data.pageResult.content : [];
              t.setData({
                searchNo: a.data.searchNo,
                "loadParams.page": e,
                restockData: 1 === e ? getDictData : t.data.restockData.concat(getDictData),
                "loadParams.totalPage": a.data.pageResult.totalPage,
                "loadParams.searchNo": a.data.searchNo,
              });
            }
            wx.hideLoading();
          })
          .catch(function () {
            wx.hideLoading();
          }));
  },
  onChangeListMode: function () {
    this.setData({
      productShowMode: !this.data.productShowMode,
    });
  },
  onViewDetail: function (t) {
    var a = t.currentTarget.dataset.item;
    wx.navigateTo({
      url: "../../restock-product/index?productId="
        .concat(a.id, "&searchNo=")
        .concat(this.data.searchNo),
    });
  },
  getShopProuductListFn: function (e) {
    var getDictData = this;
    return a(
      t().mark(function a() {
        var app;
        return t().wrap(function (t) {
          for (;;)
            switch ((t.prev = t.next)) {
              case 0:
                return ((t.next = 1), releaseCargoPass.getShopProuductList(e));
              case 1:
                0 === (r = t.sent).code &&
                  getDictData.setData({
                    titleType: app.data,
                    "loadParams.classifyId": app.data[0].id,
                  });
              case 2:
              case "end":
                return t.stop();
            }
        }, a);
      }),
    )();
  },
  handleType: function (t) {
    console.log(t);
    var a = t.target.dataset.id;
    (console.log(a),
      this.setData({
        "loadParams.classifyId": a,
        "loadParams.page": 1,
        curIndex: t.target.dataset.index,
        restockData: [],
      }),
      this.getRestockList());
  },
  getSupplierData: function (e, o, r) {
    var i = this;
    return a(
      t().mark(function a() {
        var s, c, d, u, p, l;
        return t().wrap(function (t) {
          for (;;)
            switch ((t.prev = t.next)) {
              case 0:
                if (((s = i.data), (c = s.supplierData), s.productData, !Object.keys(c).length)) {
                  t.next = 1;
                  break;
                }
                return t.abrupt("return");
              case 1:
                return (
                  wx.showLoading({
                    title: "拼命加载中...",
                  }),
                  (d = {
                    companyId: e,
                    searchNo: r,
                    productId: o,
                  }),
                  (t.next = 2),
                  releaseCargoPass.getRestockCompany(d, i.data.domain)
                );
              case 2:
                ((u = t.sent),
                  (p = u.code),
                  (l = u.data),
                  0 === p &&
                    i.setData({
                      supplierData: l,
                    }),
                  wx.hideLoading());
              case 3:
              case "end":
                return t.stop();
            }
        }, a);
      }),
    )();
  },
  onLoad: async function () {
    return (
      console.log(e),
      releaseCargoPass.setData({
        domain: e.domain,
      }),
      (0, getDictData.getDictData)("one_supplier_area").then(function (t) {
        releaseCargoPass.setData({
          supplierAdrTypeOption: t,
        });
      }),
      wx.setNavigationBarTitle({
        title: e.companyName,
      }),
      (t.next = 1),
      releaseCargoPass.getShopProuductListFn(e.companyId)
    );
    (releaseCargoPass.setData({
      "loadParams.productCompanyId": e.companyId,
    }),
      releaseCargoPass.getRestockList(),
      releaseCargoPass.getSupplierData(e.companyId, e.productId, e.searchNo));
  },
  onReady: function () {},
  onShow: function () {},
  onHide: function () {},
  onUnload: function () {},
  onPullDownRefresh: function () {},
  onReachBottom: function () {},
  onShareAppMessage: function () {},
});
