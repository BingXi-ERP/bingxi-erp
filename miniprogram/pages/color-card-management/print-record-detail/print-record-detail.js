var ServicesPrint = require("../../../libs/services/ServicesPrint"),
  a = (require("../../../libs/utils/util.js").utils.formatDateTime, getApp());
Page({
  data: {
    globalApp: {},
    keyword: "",
    parentMsg: {},
    pageNum: 1,
    detailList: [],
    total: 0,
    moreIcon: !0,
    hasNextPage: !1,
    noDataBg: "".concat(a.config.imgHost, "/img/customer/img_wuxinx@3x.png"),
  },
  onLoad: function (t) {
    var e = JSON.parse(t.item);
    (this.setData({
      globalApp: a,
      parentMsg: e,
    }),
      this.getRecordList(e));
  },
  getRecordList: function (a) {
    var e = this,
      o = {
        keyword: this.data.keyword ? this.data.keyword : "",
        goodsId: a.goodsId.toString(),
        quantityUnit: a.goodsUnit,
        pageNum: this.data.pageNum,
        pageSize: 10,
      };
    this.data.detailList.length > this.data.total ||
    (this.data.total > 0 && this.data.pageNum > Math.ceil(this.data.total / this.data.pageSize))
      ? this._closeMore()
      : (0, ServicesPrint.neadendPrintList)(o).then(function (t) {
          if (0 === t.code) {
            var a = t.data.content || [];
            if (
              (t.data.totalPage !== t.data.pageNo ? e._showMore() : e._closeMore(),
              e.setData({
                total: Number(t.data.total),
                hasNextPage: t.data.totalPage > t.data.pageNo,
              }),
              1 === e.data.pageNum &&
                e.setData({
                  detailList: a.map(function (t) {
                    return {
                      customerId: t.customerId,
                      customerName: t.customerName ? t.customerName : "无",
                      customerTel: t.customerTel ? t.customerTel : "无",
                      printTime: t.printTime,
                      quantity: t.quantity,
                      quantityUnit: t.quantityUnit,
                      colorNo: t.colorNo,
                      colorName: t.colorName,
                    };
                  }),
                }),
              e.data.pageNum > 1)
            ) {
              var o = e.data.detailList;
              e.setData({
                detailList: o.concat(
                  a.map(function (t) {
                    return {
                      customerId: t.customerId,
                      customerName: t.customerName ? t.customerName : "无",
                      customerTel: t.customerTel ? t.customerTel : "无",
                      printTime: t.printTime,
                      quantity: t.quantity,
                      quantityUnit: t.quantityUnit,
                      colorNo: t.colorNo,
                      colorName: t.colorName,
                    };
                  }),
                ),
              });
            }
          } else
            wx.showToast({
              title: t.msg,
              icon: "none",
            });
        });
  },
  _showMore: function () {
    this.setData({
      moreIcon: !0,
    });
  },
  _closeMore: function () {
    this.setData({
      moreIcon: !1,
    });
  },
  searchList: function () {
    this.getRecordList(this.data.parentMsg);
  },
  inputgetName: function (t) {
    this.setData({
      keyword: t.detail.value,
    });
  },
  onReady: function (t) {},
  onShow: function () {},
  onHide: function () {},
  onUnload: function () {},
  onPullDownRefresh: function () {},
  onReachBottom: function () {
    (this.setData({
      pageNum: this.data.pageNum + 1,
    }),
      this.data.hasNextPage && this.getRecordList(this.data.parentMsg));
  },
  onShareAppMessage: function () {},
});
