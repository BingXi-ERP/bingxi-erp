var app = getApp(),
  ServicesCenter = require("../../../../libs/services/ServicesCenter.js").servicesCenter;
Page({
  data: {
    index: 0,
    jobList: [],
    arrays: "",
    checked: !1,
    pictureCollectionAccountFlag: !1,
    subAccountId: "",
    subAccountDetail: {},
    pageParams: {
      lockStatus: 0,
      nickName: "",
      phone: "",
      roleIds: "",
      roleName: "",
      userId: "",
      pictureCollectionAccountFlag: 0,
    },
    icon: {
      del: "".concat(app.config.imgHost, "/img/customer/ic_del_red.svg"),
    },
    showJobs: !1,
    checkGangWei: [],
  },
  onLoad: function (a) {
    (null != a.id &&
      this.setData({
        subAccountId: a.id,
      }),
      wx.hideShareMenu());
  },
  onReady: function () {},
  onShow: function () {
    this.getsubAccountDetail();
  },
  onCheckSubChange: function (a) {
    this.setData({
      checkGangWei: a.detail,
    });
  },
  onJobsClose: function () {
    var app = this;
    ((this.data.pageParams.roleName = this.data.jobList
      .filter(function (t) {
        return app.data.checkGangWei.includes(t.id);
      })
      .map(function (a) {
        return a.name;
      })
      .join(",")),
      (this.data.pageParams.roleIds = this.data.checkGangWei),
      ServicesCenter.editChilder(this.data.pageParams).then(function (t) {
        0 === t.code
          ? (app.setData({
              "pageParams.roleName": app.data.pageParams.roleName,
              showJobs: !1,
            }),
            wx.showToast({
              title: "修改岗位成功",
              icon: "success",
            }))
          : wx.showToast({
              title: t.msg,
              icon: "none",
            });
      }));
  },
  toName: function (a) {
    wx.navigateTo({
      url:
        "/packageB/pages/personal-center/children/children-name/add-children-name?id=" +
        this.data.subAccountDetail.id +
        "&name=" +
        this.data.subAccountDetail.nickName,
    });
  },
  switchChange: function (a) {
    if (0 == this.data.jobList.length)
      return (
        wx.showToast({
          title: "请先添加岗位，再启用子账号",
          icon: "none",
        }),
        void this.setData({
          checked: !1,
        })
      );
    if (0 == this.data.pageParams.roleIds.length)
      return (
        wx.showToast({
          title: "请先选择岗位，再启用子账号",
          icon: "none",
        }),
        void this.setData({
          checked: !1,
        })
      );
    this.setData({
      checked: a.detail.value,
    });
    var e = this;
    ((e.data.pageParams.lockStatus = e.data.checked ? 0 : 1),
      this.setData({
        "pageParams.lockStatus": e.data.pageParams.lockStatus,
      }),
      ServicesCenter.editChilder(e.data.pageParams).then(function (a) {
        0 === a.code
          ? wx.showToast({
              title: e.data.checked ? "启用成功" : "停用成功",
              icon: "success",
            })
          : wx.showToast({
              title: a.msg,
              icon: "none",
            });
      }));
  },
  switchDbRobotChange: function (a) {
    this.setData({
      pictureCollectionAccountFlag: a.detail.value,
    });
    var e = this;
    ((e.data.pageParams.pictureCollectionAccountFlag = e.data.pictureCollectionAccountFlag ? 1 : 0),
      this.setData({
        "pageParams.pictureCollectionAccountFlag": e.data.pageParams.pictureCollectionAccountFlag,
      }),
      ServicesCenter.editChilder(e.data.pageParams).then(function (a) {
        0 === a.code
          ? wx.showToast({
              title: "变更成功",
              icon: "success",
            })
          : wx.showToast({
              title: a.msg,
              icon: "none",
            });
      }));
  },
  onSelectRoles: function () {
    this.setData({
      showJobs: !0,
    });
  },
  getsubAccountDetail: function () {
    var app = this,
      e = this,
      o = {
        id: e.data.subAccountId,
      };
    ServicesCenter.getChildrenInfo(o).then(function (t) {
      0 === t.code
        ? (Object.keys(e.data.pageParams).forEach(function (a) {
            e.data.pageParams[a] = "userId" === a ? t.data.id : t.data[a];
          }),
          (e.data.pageParams.lockStatus = t.data.isLock),
          (e.data.pageParams.roleName = t.data.roleInfos
            .map(function (a) {
              return a.roleName;
            })
            .join(",")),
          (e.data.pageParams.roleIds = t.data.roleInfos.map(function (a) {
            return a.roleId;
          })),
          (e.data.checkGangWei = e.data.pageParams.roleIds),
          app.setData({
            pageParams: e.data.pageParams,
            subAccountDetail: t.data,
            checkGangWei: e.data.checkGangWei,
            checked: 0 == t.data.isLock,
            pictureCollectionAccountFlag: 1 === t.data.pictureCollectionAccountFlag,
          }),
          app.getRoleList())
        : wx.showToast({
            title: t.msg,
            icon: "none",
          });
    });
  },
  getRoleList: function () {
    var app = this;
    ServicesCenter.roleList({}).then(function (t) {
      if (0 === t.code) {
        var e = [];
        (t.data.content.map(function (t, o) {
          (e.push({
            name: t.name,
            id: t.id,
          }),
            app.data.subAccountDetail.roleId == t.id &&
              app.setData({
                index: o,
              }));
        }),
          app.setData({
            jobList: e,
            roleList: t.data.content,
          }));
      } else
        wx.showToast({
          title: t.msg,
          icon: "none",
        });
    });
  },
  tipNoRole: function () {
    wx.showModal({
      content: "你还未创建任何岗位,请先前往创建",
      showCancel: !1,
      confirmText: "确定",
      confirmColor: "#3B96FF",
      success: function (a) {},
    });
  },
  delSubAccount: function () {
    var app = this;
    wx.showModal({
      content: "确认删除该子账号吗？",
      showCancel: !0,
      cancelText: "取消",
      cancelColor: "#3B96FF",
      confirmText: "删除",
      confirmColor: "#FF6065",
      success: function (e) {
        if (e.confirm) {
          var o = {
            subAccountId: app.data.subAccountId,
          };
          ServicesCenter.delChildren(o).then(function (a) {
            0 === a.code
              ? (wx.navigateBack({
                  delta: 1,
                }),
                wx.showToast({
                  title: "删除子账号成功",
                  icon: "success",
                }))
              : wx.showToast({
                  title: a.msg,
                  icon: "none",
                });
          });
        }
      },
    });
  },
  onHide: function () {},
  onUnload: function () {},
  onPullDownRefresh: function () {},
  onReachBottom: function () {},
  onShareAppMessage: function () {},
});
