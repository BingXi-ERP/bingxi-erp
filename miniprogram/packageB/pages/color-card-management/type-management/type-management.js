var t = require("../../../../@babel/runtime/helpers/interopRequireDefault").default,
  ServicesUserLog = require("../../../../libs/services/ServicesUserLog.js"),
  mta_analysis = t(require("../../../../utils/mta_analysis.js")),
  ServicesCardType = require("../../../../libs/services/ServicesCardType.js").ServicesCardType,
  app = getApp();
Page({
  data: {
    userAuthList: {},
    classifyList: [],
    searchVal: "",
    icon: {
      everyone: "".concat(app.config.imgHost, "/img/v2.14.0/Icon_Little_Person@2x.png"),
      onlyone: "".concat(app.config.imgHost, "/img/v2.14.0/Icon_Little_Lock@2x.png"),
      moveup: "".concat(app.config.imgHost, "/img/v2.14.0/Icon_Top_Up@2x.png"),
      movedown: "".concat(app.config.imgHost, "/img/v2.14.0/Icon_Top_Down@2x.png"),
      moveupDisable: "".concat(app.config.imgHost, "/img/v2.14.0/Icon_Top_Up_Disable@2x.png"),
      movedownDisable: "".concat(app.config.imgHost, "/img/v2.14.0/Icon_Top_Down_Disable@2x.png"),
      edit: "".concat(app.config.imgHost, "/img/v2.14.0/Icon_Edit_Light@2x.png"),
      del: "".concat(app.config.imgHost, "/img/v2.14.0/Icon_Delete_Light@2x.png"),
      rightArrow: "".concat(app.config.imgHost, "/img/customer/ic_jinru.png"),
      addBtn: "".concat(app.config.imgHost, "/img/customer/ic_tianjia@2x.png"),
    },
  },
  onLoad: function (t) {
    (mta_analysis.default.Page.init(),
      this.setData({
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
        mta_analysis = {
          classifyId: t.currentTarget.dataset.id,
          type: 2,
        };
      ServicesCardType.sort(mta_analysis).then(function (t) {
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
        mta_analysis = {
          classifyId: t.currentTarget.dataset.id,
          type: 1,
        };
      ServicesCardType.sort(mta_analysis).then(function (t) {
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
    var mta_analysis = this,
      app = t.currentTarget.dataset.id;
    wx.showModal({
      content: "删除后该分类的所有色卡将公开，确认删除分类？",
      success: function (t) {
        t.confirm &&
          ServicesCardType.delete(app).then(function (t) {
            0 === t.code
              ? (ServicesUserLog.servicesUserLog.setUserHandleLog(106), mta_analysis.list())
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
      mta_analysis = t.currentTarget.dataset.item;
    (wx.setStorageSync("categoryEdit", mta_analysis),
      wx.navigateTo({
        url: "/packageB/pages/color-card-management/newAdd-type/newAdd-type?categoryId="
          .concat(ServicesUserLog, "&permissionFlag=")
          .concat(mta_analysis.visiableFlag),
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
