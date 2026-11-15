var t = 0,
  app = getApp();
Page({
  data: {
    allCheck: 0,
    imgNo: "/assets/images/icon2nd/select_s_no@2x.png",
    imgS: "".concat(app.config.imgHost, "/img/customer/select_s@2x.png"),
    list: [],
    subChildList: [],
    listName: "",
    listId: "",
    childName: "",
    childId: "",
    idList: [],
    state: "",
  },
  onLoad: function (t) {
    (this.setData({
      idList: [t.id, t.childId],
    }),
      wx.hideShareMenu());
  },
  onShow: function () {
    wx.showLoading({
      title: "加载中...",
      mask: !0,
    });
    var app = this;
    app.setData({
      list: wx.getStorageSync("categoriesList"),
    });
    var s = 0;
    (console.log(app.data.list),
      app.data.list.map(function (t) {
        t.id === parseInt(app.data.idList[0]) &&
          (app.setData({
            listName: t.name,
            listId: t.id,
          }),
          t.childList.map(function (t) {
            t.id === parseInt(app.data.idList[1]) &&
              (app.setData({
                childName: t.name,
                childId: t.id,
              }),
              t.childList.map(function (t) {
                1 == t.isChecked && (s += 1);
              }),
              app.setData({
                subChildList: t.childList,
              }));
          }));
      }),
      wx.hideLoading(),
      s == app.data.subChildList.length &&
        app.setData({
          allCheck: 1,
        }),
      (t =
        null == wx.getStorageSync("categoriesLength") ? 0 : wx.getStorageSync("categoriesLength")),
      console.log("选择长度", wx.getStorageSync("categoriesLength")));
  },
  changeChildStatus: function () {
    var t = this,
      app = 0;
    (t.data.list.map(function (s) {
      s.id == t.data.idList[0] &&
        s.childList.map(function (s) {
          s.id == t.data.idList[1] &&
            (s.childList.map(function (t) {
              1 == t.isChecked && (i += 1);
            }),
            0 === app && (s.isChecked = 0));
        });
    }),
      t.setData({
        list: t.data.list,
      }));
  },
  checkCategories: function (i) {
    var s = this,
      a = i.currentTarget.dataset.index,
      e = s.data.subChildList[a].isChecked;
    t < 5 || 1 == e
      ? (1 == s.data.subChildList[a].isChecked
          ? ((s.data.subChildList[a].isChecked = 0),
            (t = Number(t) - Number(1)),
            console.log("length+1", t),
            s.setData({
              allCheck: 0,
            }))
          : 0 == s.data.subChildList[a].isChecked &&
            ((s.data.subChildList[a].isChecked = 1),
            (t = Number(t) + Number(1)),
            console.log("length+1", t)),
        console.log(s.data.subChildList[a]),
        s.setData({
          subChildList: s.data.subChildList,
        }),
        this.changeList())
      : wx.showToast({
          title: "所选类目不能超过5个",
          icon: "none",
          duration: 1e3,
        });
  },
  changeList: function () {
    var t = this;
    (t.data.list.map(function (i) {
      i.id == t.data.idList[0] &&
        i.childList.map(function (i) {
          i.id == t.data.idList[1] && (i.childList = t.data.subChildList);
        });
    }),
      t.setData({
        list: t.data.list,
      }),
      t.changeChildStatus());
    var app = [];
    t.data.list.forEach(function (t) {
      t.childList.forEach(function (s) {
        s.childList.forEach(function (a) {
          1 == a.isChecked &&
            app.push({
              id: t.id,
              childId: s.id,
              subChildId: [a.id],
            });
        });
      });
    });
    for (var s = app, a = [], e = [], d = 0; d < s.length; d++)
      for (var l = d + 1; l < s.length; l++)
        if (d !== l && s[d].childId === s[l].childId) {
          for (var h = 0; h < s[l].subChildId.length; h++)
            -1 == s[d].subChildId.indexOf(s[l].subChildId[h]) &&
              s[d].subChildId.push(s[l].subChildId[h]);
          -1 == a.indexOf(l) && a.push(l);
        }
    for (d = 0; d < s.length; d++) -1 == a.indexOf(d) && e.push(s[d]);
    (wx.setStorageSync("checkCategories", e), wx.setStorageSync("categoriesList", t.data.list));
    wx.getStorageSync("categoriesList");
    console.log(wx.getStorageSync("categoriesList"));
  },
  allCheck: function (i) {
    var s = this;
    if ((console.log(i), 0 != 5 - t)) {
      var a = s.data.subChildList.length;
      console.log(a);
      for (var e = 0; e < a; e++)
        1 != s.data.subChildList[e].isChecked &&
          t < 5 &&
          ((s.data.subChildList[e].isChecked = 1), (t += 1));
      (s.setData({
        subChildList: s.data.subChildList,
        allCheck: 1,
      }),
        this.changeList());
    } else
      wx.showToast({
        title: "所选类目不能超过5个",
        icon: "none",
        duration: 1e3,
      });
  },
  allNoCheck: function (i) {
    for (var s = this, a = s.data.subChildList.length, e = 0; e < a; e++)
      1 === s.data.subChildList[e].isChecked &&
        ((s.data.subChildList[e].isChecked = 0),
        console.log("countlength全不选之前", t),
        (t -= 1),
        console.log("countlength全不选", t));
    (s.setData({
      subChildList: s.data.subChildList,
      allCheck: 0,
    }),
      this.changeList(),
      console.log(s.data.subChildList));
  },
});
