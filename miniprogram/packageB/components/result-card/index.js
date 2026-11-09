Component({
  properties: {
    plat: {
      type: Boolean,
      value: !1,
      observer: function () {
        this.computedProductParams();
      },
    },
    data: {
      type: Object,
      value: {},
      observer: function () {
        this.computedProductParams();
      },
    },
    sampleData: {
      type: Object,
      value: {},
    },
    searchId: {
      type: String,
      value: "",
    },
    index: {
      type: Number,
      value: "",
    },
    mainFlag: {
      type: Boolean,
      value: !1,
    },
    platRank: {
      type: Boolean,
      value: !1,
    },
    authList: {
      type: Object,
      required: !1,
      value: {},
    },
  },
  data: {
    productParams: [
      {
        prop: "region",
        label: "商品区域",
        icon: "icon_ResultQY",
        mode: 1,
      },
      {
        prop: "gramWeight",
        label: "克重",
        icon: "icon_ResultKz",
        unitProp: "weightUnit",
      },
      {
        prop: "clothWidth",
        label: "门幅",
        icon: "icon_ResultMf",
        unitProp: "clothWidthUnit",
      },
      {
        prop: "material",
        label: "成分",
        icon: "icon_ResultCf",
        mode: 0,
      },
      {
        prop: "clothEnough",
        label: "空差",
        icon: "icon_ResultKC",
        mode: 1,
      },
      {
        prop: "finishingProcessFront",
        label: "后工艺",
        icon: "icon_ResultHGY",
        mode: 1,
      },
    ],
    ProductParamsComputed: [],
    hasColorCard: !1,
  },
  methods: {
    computedProductParams: function () {
      var a = this.data.plat ? 1 : 0,
        e = this.data.productParams.filter(function (e) {
          return void 0 === e.mode || e.mode === a;
        });
      this.setData({
        ProductParamsComputed: e,
      });
    },
    onNavTo: function (a) {
      var e = a.currentTarget.dataset.goodsid,
        t = a.currentTarget.dataset.mainproduct,
        o = "/packageB/pages/color-card-management/preview/preview?goodsId="
          .concat(e, "&showShare=")
          .concat(t)
          .concat(this.data.plat ? "&searchId=" + this.data.searchId : "");
      wx.navigateTo({
        url: o,
      });
    },
    handleRouterToFamily: function (a) {
      var e = a.currentTarget.dataset.item;
      (wx.setStorageSync("moreRecommendParent", this.data.sampleData),
        wx.navigateTo({
          url: "../search-family/index?id="
            .concat(this.data.searchId, "&duiBuCode=")
            .concat(e.duiBuCode, "&clusterName=")
            .concat(e.clusterName),
        }));
    },
    handleGetSupplierMsg: function (a) {
      var e = a.currentTarget.dataset.item;
      wx.navigateTo({
        url: "../search-supplier/index?searchId="
          .concat(this.data.searchId, "&uuid=")
          .concat(e.uuid, "&spuNumber=")
          .concat(e.spuNumber || e.platformSpuNumber, "}"),
      });
    },
    onViewRecommendProduct: function (a) {
      var e = a.currentTarget.dataset.parentid;
      (wx.setStorageSync("moreRecommendParent", this.data.sampleData),
        wx.navigateTo({
          url: "../search-recommend/index?parentId="
            .concat(e, "&searchId=")
            .concat(this.data.searchId),
        }));
    },
  },
});
