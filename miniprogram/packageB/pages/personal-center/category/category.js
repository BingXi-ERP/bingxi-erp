var app = getApp();
Page({
  data: {
    image: {
      search: "/assets/images/icon2nd/symbols-search.png",
    },
    childList: [],
    checkStatus: [],
    list: [],
    first: !0,
  },
  onLoad: function (e) {
    var i = this;
    (i.setData({
      list: app.globalData.categoriesList,
      first: !0,
    }),
      1 == i.data.first && i.getCountLength(),
      wx.hideShareMenu());
  },
  getCountLength: function () {
    console.log(wx.getStorageSync("categoriesString"));
    var app = this;
    if ("" !== wx.getStorageSync("categoriesString")) {
      var e = [];
      wx.getStorageSync("categoriesString")
        .split(",")
        .map(function (i) {
          app.data.list.map(function (t, a) {
            t.childList.map(function (a, s) {
              a.childList.map(function (s, n) {
                s.name == i &&
                  e.push({
                    id: t.id,
                    childId: a.id,
                    subChildId: [s.id],
                  });
              });
            });
          });
        });
      for (var i = e, a = [], s = [], n = 0; n < i.length; n++)
        for (var c = n + 1; c < i.length; c++)
          if (n !== c && i[n].childId === i[c].childId) {
            for (var o = 0; o < i[c].subChildId.length; o++)
              -1 == i[n].subChildId.indexOf(i[c].subChildId[o]) &&
                i[n].subChildId.push(i[c].subChildId[o]);
            -1 == a.indexOf(c) && a.push(c);
          }
      for (n = 0; n < i.length; n++) -1 == a.indexOf(n) && s.push(i[n]);
      (console.log("exitItem", s),
        wx.setStorageSync("checkCategories", s),
        wx.removeStorageSync("categoriesLength"));
      app.data.list;
      app.setData({
        list: app.data.list,
      });
    }
  },
  inputTyping: function () {
    (wx.setStorageSync("categoriesList", this.data.list),
      wx.navigateTo({
        url: "/packageB/pages/personal-center/category/category-search/category-search",
      }));
  },
  changeChild: function (t) {
    var e = this;
    (e.data.list.map(function (i) {
      i.id === parseInt(t.currentTarget.id)
        ? ((i.isChecked = 1),
          e.setData({
            childList: i.childList,
          }))
        : (i.isChecked = 0);
    }),
      e.setData({
        list: e.data.list,
      }));
  },
  changeSubChild: function (t) {
    (console.log(t),
      wx.setStorageSync("categoriesList", this.data.list),
      wx.navigateTo({
        url:
          "/packageB/pages/personal-center/category/category-select/category-select?id=" +
          t.currentTarget.dataset.parentId +
          "&childId=" +
          t.currentTarget.id,
      }));
  },
  onReady: function () {},
  onShow: function () {
    wx.showLoading({
      title: "加载中...",
      mask: !0,
    });
    var app = this;
    app.setData({
      first: !1,
    });
    var e = wx.getStorageSync("categoriesList");
    ("" !== e &&
      app.setData({
        list: e,
      }),
      wx.removeStorageSync("categoriesList"),
      console.log("onshow数据", app.data.list),
      app.data.list.map(function (e, i) {
        (0 == i && (e.isChecked = 1),
          1 === e.isChecked &&
            app.setData({
              childList: e.childList,
            }));
      }));
    var i = wx.getStorageSync("checkCategories");
    if (
      (app.setData({
        checkStatus: i,
      }),
      console.log("存储的已选择的数据", app.data.checkStatus),
      i.length > 0)
    ) {
      var a = [];
      app.data.list.map(function (t, e) {
        i.map(function (e, i) {
          t.id === e.id &&
            t.childList.map(function (t, i) {
              t.id === e.childId &&
                ((t.isChecked = 1),
                t.childList.map(function (t, i) {
                  e.subChildId.map(function (e, i) {
                    t.id === e
                      ? (a.push(t.id), (t.isChecked = 1))
                      : -1 == a.indexOf(t.id) && (t.isChecked = 0);
                  });
                }));
            });
        });
      });
      app.data.list;
    }
    var s = 0;
    (app.data.list.map(function (t) {
      var e = 0;
      (t.childList.map(function (t, i) {
        (1 == t.isChecked && (e += 1),
          t.childList.map(function (t) {
            1 == t.isChecked && (s += 1);
          }),
          (t.selectedCount = s));
      }),
        (t.selectedCount = e));
    }),
      wx.setStorageSync("categoriesLength", s),
      console.log("三级选择的数据", wx.getStorageSync("categoriesLength")),
      app.setData({
        list: app.data.list,
      }),
      wx.hideLoading(),
      console.log("主营类目选择三级或搜索完后的列表", app.data.list));
  },
  onHide: function () {},
  onUnload: function () {
    var app = "";
    (this.data.list.map(function (e) {
      e.childList.map(function (e) {
        e.childList.map(function (e) {
          1 == e.isChecked && (t = "" == app ? e.name : app + "," + e.name);
        });
      });
    }),
      wx.setStorageSync("categoriesString", app),
      wx.removeStorageSync("categoriesLength"),
      wx.removeStorageSync("checkCategories"));
  },
});
