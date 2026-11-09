var e = 0,
  app = getApp();
Page({
  data: {
    imgNo: "/assets/images/icon2nd/select_s_no@2x.png",
    imgS: "".concat(app.config.imgHost, "/img/customer/select_s@2x.png"),
    image: {
      search: "/assets/images/icon2nd/symbols-search.png",
      clearicon: "".concat(app.config.imgHost, "/img/customer/duibuIcon/icon/del@2x.png"),
    },
    search_name: "",
    searchList: [],
    list: [],
    listNull: !1,
    btnShow: !0,
    resList: [],
  },
  onLoad: function (t) {
    (this.setData({
      list: wx.getStorageSync("categoriesList"),
    }),
      (e =
        null == wx.getStorageSync("categoriesLength") ? 0 : wx.getStorageSync("categoriesLength")),
      wx.hideShareMenu());
  },
  inputShow: function (e) {
    var app = this,
      i = [];
    (app.data.list.map(function (e) {
      e.childList.map(function (a) {
        a.childList.map(function (s, n) {
          var c = [s].filter(function (e) {
            return ~e.name.indexOf(app.data.search_name);
          });
          if (c.length > 0) {
            1 == c[0].isChecked &&
              app.setData({
                btnShow: !1,
              });
            var o = [
              {
                name: e.name,
                id: e.id,
                isChecked: e.isChecked,
                childList: [
                  {
                    name: a.name,
                    id: a.id,
                    isChecked: a.isChecked,
                    childList: c,
                  },
                ],
              },
            ];
            i = i.concat(o);
          }
        });
      });
    }),
      i.length > 0
        ? app.setData({
            listNull: !1,
          })
        : app.setData({
            listNull: !0,
          }),
      app.setData({
        resList: i,
      }));
  },
  checkCategories: function (t) {
    console.log(t);
    var i = this;
    console.log(t.currentTarget.id);
    t.currentTarget.dataset.parent;
    (i.data.resList.map(function (a) {
      a.childList.map(function (a) {
        a.childList.map(function (a) {
          t.currentTarget.id == a.id &&
            (e < 5 || 1 == a.isChecked
              ? (1 == a.isChecked
                  ? ((a.isChecked = 0), (e -= 1), console.log("取消勾选的长度", e))
                  : ((a.isChecked = 1),
                    i.setData({
                      btnShow: !1,
                    }),
                    (e += 1),
                    console.log("勾选的长度", e)),
                i.data.list.map(function (e) {
                  e.childList.map(function (e) {
                    e.childList.map(function (t) {
                      a.name == t.name &&
                        ((t.isChecked = a.isChecked),
                        1 == a.isChecked ? (e.isChecked = 1) : (e.isChecked = 0));
                    });
                  });
                }))
              : wx.showToast({
                  title: "所选类目不能超过5个",
                  icon: "none",
                  duration: 1e3,
                }));
        });
      });
    }),
      i.setData({
        resList: i.data.resList,
      }));
  },
  clearName: function (e) {
    this.setData({
      search_name: "",
    });
  },
  inputTyping: function (e) {
    var app = e.detail.value;
    this.setData({
      search_name: app,
    });
  },
  canleSearch: function () {
    wx.navigateBack({
      delta: 1,
    });
  },
  sureCheck: function () {
    var e = this,
      app = [];
    if (0 == e.data.btnShow) {
      (console.log("总的列表", e.data.list),
        e.data.list.forEach(function (e) {
          e.childList.forEach(function (i) {
            i.childList.forEach(function (a) {
              1 == a.isChecked &&
                app.push({
                  id: e.id,
                  childId: i.id,
                  subChildId: [a.id],
                });
            });
          });
        }));
      for (var i = app, a = [], s = [], n = 0; n < i.length; n++)
        for (var c = n + 1; c < i.length; c++)
          if (n !== c && i[n].childId === i[c].childId) {
            for (var o = 0; o < i[c].subChildId.length; o++)
              -1 == i[n].subChildId.indexOf(i[c].subChildId[o]) &&
                i[n].subChildId.push(i[c].subChildId[o]);
            -1 == a.indexOf(c) && a.push(c);
          }
      for (n = 0; n < i.length; n++) -1 == a.indexOf(n) && s.push(i[n]);
      (wx.setStorageSync("checkCategories", s),
        console.log("点击确认的存储数据", s),
        wx.navigateBack({
          delta: 1,
        }));
    }
  },
});
