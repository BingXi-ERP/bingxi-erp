require("../../../../@babel/runtime/helpers/Arrayincludes");
var objectSpread2 = require("../../../../@babel/runtime/helpers/objectSpread2"),
  app = getApp();
Page({
  data: {
    type: "add",
    list: [],
    imgNo: "/assets/images/icon2nd/select_s_no@2x.png",
    imgS: "".concat(app.config.imgHost, "/img/customer/select_s@2x.png"),
    imgDisable: "".concat(
      app.config.imgHost,
      "/img/customer/duibuIcon/icon/Icon_Selected_Disable@2x.png",
    ),
    activeId: [],
    checkStatus: [],
    chooseId: [],
    chooseName: [],
    childList: [],
    currId: null,
  },
  onLoad: function (e) {
    (this.setData({
      type: e.type,
      chooseId: app.chooseId || [],
      chooseName: app.chooseName || [],
    }),
      this.getList(e));
  },
  changeChild: function (e) {
    var app = this;
    (this.setData({
      currId: e.currentTarget.id,
    }),
      this.data.list.map(function (t) {
        t.id === e.currentTarget.id
          ? ((t.checked = 1),
            app.setData({
              childList: t.children,
            }))
          : (t.checked = 0);
      }),
      this.setData({
        list: this.data.list,
      }));
  },
  addName: function (e) {
    var app = this.data.chooseId,
      t = this.data.chooseName;
    (app.includes(e.id) || (app.push(e.id), t.push(e.name)),
      this.setData({
        chooseId: app,
        chooseName: t,
      }));
  },
  cancelName: function (e) {
    var app = this.data.chooseId;
    app.includes(e.id) &&
      (i = app.filter(function (i) {
        return i !== e.id;
      }));
    var t = this.data.chooseName;
    (t.includes(e.name) &&
      (t = t.filter(function (i) {
        return i !== e.name;
      })),
      this.setData({
        chooseId: app,
        chooseName: t,
      }));
  },
  onClickItem: function (e) {
    var app = this,
      t = this.data.currId,
      a = e.target.id,
      c = this.data.list;
    (null == c ||
      c.forEach(function (e) {
        t === e.id &&
          (null == e ||
            e.children.forEach(function (t) {
              (t.id === a &&
                (0 === t.isChecked
                  ? ((t.isChecked = 1),
                    app.addName(t),
                    ("20001" !== t.id && "30001" !== t.id && "40001" !== t.id) ||
                      (e.children = app.changeDisable(t, e)))
                  : ((t.isChecked = 0),
                    app.cancelName(t),
                    ("20001" !== t.id && "30001" !== t.id && "40001" !== t.id) ||
                      (e.children = app.changeDisable(t, e)))),
                app.setData({
                  childList: e.children,
                }));
            }));
      }),
      this.setData({
        list: c,
      }));
  },
  changeDisable: function (i, t) {
    var a = this,
      c = i.id,
      s = t.children;
    return 0 === i.isChecked
      ? s.map(function (i) {
          return (
            a.cancelName(i),
            i.id !== c
              ? objectSpread2(
                  objectSpread2(
                    {
                      disable: !0,
                    },
                    i,
                  ),
                  {},
                  {
                    isChecked: 0,
                  },
                )
              : i
          );
        })
      : s.map(function (e) {
          return e.id !== c ? (e.disable && delete e.disable, e) : e;
        });
  },
  getList: function (e) {
    var app,
      t = this;
    if (e.list) {
      var a;
      try {
        a = JSON.parse(e.list);
      } catch (e) {
        return void console.log("list参数解析失败", e);
      }
      if (Array.isArray(a) && 0 !== a.length) {
        var c = {
          currentTarget: {
            id: a[0].id,
          },
        };
        null === (i = a) ||
          void 0 === app ||
          app.forEach(function (e) {
            var app;
            (null === (i = e.children) ||
              void 0 === app ||
              app.forEach(function (i) {
                ("add" === t.data.type && (i.isChecked = t.data.chooseId.includes(i.id) ? 1 : 0),
                  0 === i.isChecked &&
                    (("20001" !== i.id && "30001" !== i.id && "40001" !== i.id) ||
                      (e.children = t.changeDisable(i, e))));
              }),
              t.setData({
                list: a,
                originID: t.data.chooseId,
              }),
              t.changeChild(c));
          });
      }
    }
  },
  handleLastCheckData: function () {
    var objectSpread2 = this.data.chooseId;
    (this.data.list.forEach(function (i) {
      if (3 !== i.terminalType) {
        var t,
          a =
            null === (t = i.children) || void 0 === t
              ? void 0
              : t.some(function (i) {
                  return objectSpread2.includes(i.id);
                }),
          c = objectSpread2.includes(i.id);
        a
          ? c || objectSpread2.push(i.id)
          : (e = objectSpread2.filter(function (e) {
              return e !== i.id;
            }));
      }
    }),
      this.setData({
        chooseId: objectSpread2,
      }));
  },
  confirm: function () {
    0 !== this.data.chooseId.length
      ? (this.handleLastCheckData(),
        (app.chooseId = this.data.chooseId),
        (app.chooseName = this.data.chooseName),
        wx.navigateBack())
      : wx.showToast({
          title: "请选择权限",
          icon: "none",
        });
  },
  showNode: function () {
    this.data.chooseId.sort().toString() !== this.data.originID.sort().toString() &&
      wx.showModal({
        cancelText: "直接返回",
        cancelColor: "#000",
        confirmText: "保存返回",
        content: "内容有修改,是否需要保存",
        confirmColor: "#4C7CF9",
        success: function (e) {
          e.confirm ? console.log("用户点击确定") : e.cancel && console.log("用户点击取消");
        },
      });
  },
});
