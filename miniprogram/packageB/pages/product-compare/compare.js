var t,
  e = require("../../../@babel/runtime/helpers/regeneratorRuntime"),
  a = require("../../../@babel/runtime/helpers/asyncToGenerator"),
  conversation = require("../../../libs/services/conversation"),
  app = getApp();
Page({
  data: {
    products: [],
    showResult: !1,
    selectedProducts: [],
    pageNo: "",
    pageSize: "",
  },
  onLoad: async function () {
    conversation.setData({
      products: app.globalData.contentData,
      chatId: t.chatId,
    });
  },
  getData:
    ((t = a(
      e().mark(function t(a) {
        var o,
          s,
          c,
          i,
          u = arguments;
        return e().wrap(function (t) {
          for (;;)
            switch ((t.prev = t.next)) {
              case 0:
                return (
                  (o = u.length > 1 && void 0 !== u[1] ? u[1] : ""),
                  (t.next = 1),
                  conversation.conversationApi.getProductGroup({
                    currentChatId: a,
                    searchId: app.globalData.searchId,
                    page: o,
                    size: 10,
                  })
                );
              case 1:
                if (((s = t.sent), (c = s.code), (i = s.data), 0 !== c)) {
                  t.next = 2;
                  break;
                }
                return t.abrupt("return", i);
              case 2:
              case "end":
                return t.stop();
            }
        }, t);
      }),
    )),
    function (e) {
      return t.apply(this, arguments);
    }),
  checkboxChange: function (t) {
    console.log(11, t);
    var e = t.currentTarget.dataset.index,
      a = this.data.products;
    ((a[e].checked = t.detail),
      this.setData({
        products: a,
      }));
  },
  startCompare: function () {
    (console.log(22), console.log(this.data.products));
    var t = this.data.products.filter(function (t) {
      return t.checked;
    });
    if ((console.log(t, "查看数组长度"), t.length < 2))
      return (
        console.log(11),
        void wx.showToast({
          title: "至少要选中2款面料",
          icon: "none",
        })
      );
    this.setData({
      showResult: !0,
      selectedProducts: t,
    });
  },
  closeResult: function () {
    this.setData({
      showResult: !1,
      selectedProducts: [],
    });
  },
  leftPageFn: function () {
    var t = this.data.pageNo;
    1 !== t
      ? this.getData(t - 1)
      : wx.showToast({
          title: "当前已是第一页",
          icon: "none",
          duration: 1500,
        });
  },
  rightPageFn: function () {
    var t = this.data,
      e = t.currentPage;
    e !== t.totalPage
      ? this.getData(e + 1)
      : wx.showToast({
          title: "当前已是最后一页",
          icon: "none",
          duration: 1500,
        });
  },
});
