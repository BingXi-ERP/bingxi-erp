var ServicesDataCenter = require("../../../services/ServicesDataCenter");
Page({
  data: {
    active: 0,
    billingItemCount: 0,
    billingPricingQuantity: 0,
    orderAmount: 0,
    productList1: [],
    productList2: [],
    quantityunit: "",
    time: "111",
  },
  onChange: function (t) {
    (console.log(t.detail.name),
      this.setData({
        active: t.detail.name,
      }));
  },
  sortArrayByField: function (t, i, a) {
    return t.sort(function (t, s) {
      return "asc" === a ? t[i] - s[i] : s[i] - t[i];
    });
  },
  sortFn: function (t) {
    if ((console.log(this.data.active), !this.data.active))
      if ("asc" === t.detail.sort && "销售数量" === t.detail.text) {
        var i = this.sortArrayByField(this.data.productList1, "billingPricingQuantity", "asc");
        this.setData({
          productList1: i,
        });
      } else if ("desc" === t.detail.sort && "销售数量" === t.detail.text) {
        var a = this.sortArrayByField(this.data.productList1, "billingPricingQuantity", "desc");
        this.setData({
          productList1: a,
        });
      } else if ("asc" === t.detail.sort && "销售金额" === t.detail.text) {
        var s = this.sortArrayByField(this.data.productList1, "colorAmount", "asc");
        this.setData({
          productList1: s,
        });
      } else if ("desc" === t.detail.sort && "销售金额" === t.detail.text) {
        var e = this.sortArrayByField(this.data.productList1, "colorAmount", "desc");
        this.setData({
          productList1: e,
        });
      }
    if (1 == this.data.active)
      if ("asc" === t.detail.sort && "销售数量" === t.detail.text) {
        var o = this.sortArrayByField(this.data.productList2, "billingPricingQuantity", "asc");
        this.setData({
          productList2: o,
        });
      } else if ("desc" === t.detail.sort && "销售数量" === t.detail.text) {
        var r = this.sortArrayByField(this.data.productList2, "billingPricingQuantity", "desc");
        this.setData({
          productList2: r,
        });
      } else if ("asc" === t.detail.sort && "销售金额" === t.detail.text) {
        var n = this.sortArrayByField(this.data.productList2, "colorAmount", "asc");
        this.setData({
          productList2: n,
        });
      } else if ("desc" === t.detail.sort && "销售金额" === t.detail.text) {
        var d = this.sortArrayByField(this.data.productList2, "colorAmount", "desc");
        this.setData({
          productList2: d,
        });
      }
  },
  onLoad: function (i) {
    var a = this;
    console.log(i);
    var s = i.billingItemCount,
      e = i.billingPricingQuantity,
      o = i.billingids,
      r = i.goodsid,
      n = i.orderAmount,
      d = i.quantityunit,
      c = i.goodsname,
      l = i.time;
    (console.log(l, "-------------"),
      wx.setNavigationBarTitle({
        title: c,
      }),
      this.setData({
        billingItemCount: s,
        billingPricingQuantity: e,
        orderAmount: n,
        quantityunit: d,
        time: l,
      }));
    var u = o.split(",");
    (console.log(u, "2222"),
      ServicesDataCenter.ServicesDataCenter.productDetail({
        billingIds: u,
        goodsId: r,
        quantityUnit: d,
      }).then(function (t) {
        0 === t.code &&
          a.setData({
            productList1: t.data.colorRespList,
            productList2: t.data.customerRespList,
          });
      }));
  },
  onReady: function () {},
  onShow: function () {},
  onHide: function () {},
  onUnload: function () {},
  onPullDownRefresh: function () {},
  onReachBottom: function () {},
  onShareAppMessage: function () {},
});
