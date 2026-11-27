var t = require("../../../../@babel/runtime/helpers/interopRequireDefault").default,
  ServicesUserLog = require("../../../../libs/services/ServicesUserLog.js"),
  ServicesCardType = require("../../../../libs/services/ServicesCardType.js").ServicesCardType,
  app = getApp();
Page({
  data: {
    userAuthList: {},
    classifyList: [],
    searchVal: "",
    icon: {
      everyone: "/assets/icons/no_img.png",
      onlyone: "/assets/icons/no_img.png",
      moveup: "/assets/icons/no_img.png",
      movedown: "/assets/icons/no_img.png",
      moveupDisable: "/assets/icons/no_img.png",
      movedownDisable: "/assets/icons/no_img.png",
      edit: "/assets/icons/no_img.png",
      del: "/assets/icons/Icon_Delete.png",
      rightArrow: "/assets/icons/ic_jinru.png",
      addBtn: "/assets/icons/color_add@2x.png",
    },
  },
  onLoad: function (t) {
    (this.setData({
        userAuthList: app.userAuthList,
      }),
      wx.hideShareMenu());
  },
  onReady: function () {},
  onShow: function () {
    this.list();
  },
  onHide: function () {},
  onUnload: function () {},
  onPullDownRefresh: function () {},
  onReachBottom: function () {},
  onShareAppMessage: function () {},
  list: function () {
    var t = this;
    (wx.showLoading(),
      ServicesCardType.list().then(function (e) {
        (wx.hideLoading(),
          0 === e.code
            ? t.setData({
                classifyList: e.data,
              })
            : wx.showToast({
                title: e.msg,
                icon: "none",
              }));
      }));
  },
  toAddType: function () {
    wx.navigateTo({
      url: "/packageB/pages/color-card-management/newAdd-type/newAdd-type",
    });
  },
  movedown: function (t) {
    if (t.currentTarget.dataset.index != this.data.classifyList.length - 1) {
      var ServicesUserLog = this,
        mpValue = {
          classifyId: t.currentTarget.dataset.id,
          type: 2,
        };
      ServicesCardType.sort(mpValue).then(function (t) {
        0 === t.code
          ? ServicesUserLog.list()
          : wx.showToast({
              title: t.msg,
              icon: "none",
            });
      });
    }
  },
  moveUp: function (t) {
    if (0 != t.currentTarget.dataset.index) {
      var ServicesUserLog = this,
        mpValue = {
          classifyId: t.currentTarget.dataset.id,
          type: 1,
        };
      ServicesCardType.sort(mpValue).then(function (t) {
        0 === t.code
          ? ServicesUserLog.list()
          : wx.showToast({
              title: t.msg,
              icon: "none",
            });
      });
    }
  },
  delete: function (t) {
    var mpValue = this,
      app = t.currentTarget.dataset.id;
    wx.showModal({
      content: "删除后该分类的所有色卡将公开，确认删除分类？",
      success: function (t) {
        t.confirm &&
          ServicesCardType.delete(app).then(function (t) {
            0 === t.code
              ? (ServicesUserLog.servicesUserLog.setUserHandleLog(106), mpValue.list())
              : wx.showToast({
                  title: t.msg,
                  icon: "none",
                });
          });
      },
    });
  },
  typeEdit: function (t) {
    var ServicesUserLog = t.currentTarget.dataset.id,
      mpValue = t.currentTarget.dataset.item;
    (wx.setStorageSync("categoryEdit", mpValue),
      wx.navigateTo({
        url: "/packageB/pages/color-card-management/newAdd-type/newAdd-type?categoryId="
          .concat(ServicesUserLog, "&permissionFlag=")
          .concat(mpValue.visiableFlag),
      }));
  },
  toBatchManagement: function (t) {
    wx.navigateTo({
      url: "/packageB/pages/color-card-management/type-management/batch-management/batch-management?id="
        .concat(t.currentTarget.dataset.id, "&typename=")
        .concat(t.currentTarget.dataset.name),
    });
  },
});
