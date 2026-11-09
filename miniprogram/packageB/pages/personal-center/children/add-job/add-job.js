require("../../../../../@babel/runtime/helpers/Arrayincludes");
var app = getApp(),
  ServicesCenter = require("../../../../libs/services/ServicesCenter.js").servicesCenter;
Page({
  data: {
    noSelect: "/assets/images/icon2nd/symbols-no-select.png",
    childrenName: "",
    roleName: "",
    roleRemark: "",
    roleType: "",
    authId: "",
    authList: [],
    authName: "",
    pageType: "add",
    roleId: "",
    icon: {
      del: "".concat(app.config.imgHost, "/img/customer/ic_del_red.svg"),
      rightArrow: "".concat(app.config.imgHost, "/img/customer/ic_jinru.png"),
    },
  },
  onLoad: function (e) {
    (1 == e.type &&
      this.setData({
        pageType: "edit",
      }),
      wx.setNavigationBarTitle({
        title: 1 == e.type ? "修改岗位" : "新增岗位",
      }),
      wx.hideShareMenu());
  },
  onShow: function () {
    if ("edit" == this.data.pageType) {
      var app = wx.getStorageSync("roleItem");
      this.setData({
        roleName: app.name,
        roleRemark: app.remark,
        authId: app.menuIds,
        authName: app.menuNames && app.menuNames.join("/"),
        roleId: app.id,
        roleType: app.roleType,
      });
    }
    (this.getAuthList(), this.getChooseId());
  },
  onUnload: function () {
    ((app.chooseId = []), (app.chooseName = []));
  },
  toPath: function () {
    var ServicesCenter = wx.getStorageSync("roleItem"),
      a = JSON.stringify(this.data.authList);
    ((app.chooseId = ServicesCenter.menuIds),
      (app.chooseName = ServicesCenter.menuNames),
      wx.navigateTo({
        url: "../../add-job-list/index?list=".concat(a, "&type=").concat(this.data.pageType),
      }));
  },
  getChooseId: function () {
    app.chooseId.length > 0 &&
      ((this.data.authId = app.chooseId),
      this.setData({
        authName: app.chooseName && app.chooseName.join("/"),
      }));
  },
  clearChooseId: function () {
    app.chooseId && app.chooseId.length > 0 && (app.chooseId = []);
  },
  input_val: function (e) {
    this.setData({
      roleName: e.detail.value,
    });
  },
  input_text: function (e) {
    this.setData({
      roleRemark: e.detail.value,
    });
  },
  onChange: function (e) {
    var ServicesCenter = e.currentTarget.dataset.roleid;
    (this.data.authList.map(function (e) {
      e.id == ServicesCenter && (0 == e.checked ? (e.checked = 1) : (e.checked = 0));
    }),
      this.setData({
        authList: this.data.authList,
      }));
  },
  getAuthList: function () {
    var app = this,
      a = [];
    (wx.showLoading({
      title: "加载中...",
    }),
      "edit" === this.data.pageType && (a = this.data.authId),
      ServicesCenter.authList().then(function (t) {
        if (0 === t.code) {
          var o = t.data || [],
            i = o.filter(function (e) {
              return 1 === e.terminalType;
            }),
            n = o.filter(function (e) {
              return 3 === e.terminalType;
            });
          (n.length &&
            i.push({
              id: "999999",
              name: "对布仪",
              terminalType: 3,
              permission: "",
              children: n
                .map(function (e) {
                  return e.children || [];
                })
                .flat(1 / 0),
            }),
            i.length > 0 &&
              (i.map(function (o) {
                var i;
                ((o.checked = 0), "edit" === app.data.pageType)
                  ? null === (i = o.children) ||
                    void 0 === i ||
                    i.forEach(function (e) {
                      ((e.isChecked = 0), a && a.includes(e.id) && (e.isChecked = 1));
                    })
                  : "add" === app.data.pageType &&
                    t.data.map(function (e) {
                      var ServicesCenter;
                      null === (t = e.children) ||
                        void 0 === ServicesCenter ||
                        ServicesCenter.forEach(function (e) {
                          ((e.isChecked = 0),
                            ("20001" !== e.id && "30001" !== e.id && "40001" !== e.id) ||
                              (e.isChecked = 1));
                        });
                    });
              }),
              app.setData({
                authList: i,
              })));
        } else
          wx.showToast({
            title: t.msg,
            icon: "none",
          });
        wx.hideLoading();
      }));
  },
  addRole: function () {
    var a = this,
      o = this;
    if ("" != o.data.roleName) {
      if ("" != o.data.roleRemark) {
        if ("" != o.data.authId) {
          var i = "",
            n = "",
            s = "POST";
          "add" == o.data.pageType
            ? ((i = "".concat(app.config.bingxiHost, "/app-api/shop/user/role/add")),
              (n = "新增成功"),
              (s = "POST"))
            : ((i = "".concat(app.config.bingxiHost, "/app-api/shop/user/role/edit")),
              (n = "修改成功"),
              (s = "PUT"));
          var c = {
            name: o.data.roleName,
            remark: o.data.roleRemark,
            menuIds: o.data.authId,
            roleType: o.data.roleType,
          };
          ("edit" == o.data.pageType && (c.id = o.data.roleId),
            ServicesCenter.addOrChangeRole(c, i, s).then(function (e) {
              0 === e.code
                ? (a.clearChooseId(),
                  wx.navigateBack({
                    delta: 1,
                  }),
                  wx.showToast({
                    title: n,
                    icon: "success",
                  }))
                : wx.showToast({
                    title: e.msg,
                    icon: "none",
                  });
            }));
        } else
          wx.showToast({
            title: "请选择权限",
            icon: "none",
          });
      } else
        wx.showToast({
          title: "请输入岗位描述",
          icon: "none",
        });
    } else
      wx.showToast({
        title: "请输入岗位名称",
        icon: "none",
      });
  },
  delRole: function () {
    var app = this;
    wx.showModal({
      content: "删除岗位后，已关联该岗位的子账号将会关闭，需重新选择岗位后开启。",
      showCancel: !0,
      cancelText: "取消",
      cancelColor: "#3B96FF",
      confirmText: "删除",
      confirmColor: "#3B96FF",
      success: function (a) {
        if (a.confirm) {
          var o = {
            roleId: app.data.roleId,
          };
          ServicesCenter.delRole(o).then(function (e) {
            0 === e.code
              ? (wx.navigateBack({
                  delta: 1,
                }),
                wx.showToast({
                  title: "删除成功",
                  icon: "success",
                }))
              : wx.showToast({
                  title: e.msg.result,
                  icon: "none",
                });
          });
        }
      },
    });
  },
});
