var e = require("../../../../@babel/runtime/helpers/interopRequireDefault").default,
  toConsumableArray = require("../../../../@babel/runtime/helpers/toConsumableArray"),
  objectSpread2 = require("../../../../@babel/runtime/helpers/objectSpread2"),
  n =
    (require("../../../libs/services/ServicesOrder"),
    require("../../../utils/shareCanvas"),
    require("../../../utils/util")),
  ServicesInvite = e(require("../../../libs/services/ServicesInvite")),
  app = getApp();
Page({
  data: {
    showShareFriend: !1,
    showSelect: !1,
    friendImg: "",
    inviteData: {},
    inviteList: [],
    pageNum: 0,
    pageSize: 10,
    isAll: !1,
    icon: {
      content: "".concat(app.config.imgHost, "/img/shareFile/content.png?imageView2/2/w/900"),
      headerImg: "".concat(app.config.imgHost, "/img/shareFile/headerImg.png?imageView2/2/w/900"),
      step: "".concat(app.config.imgHost, "/img/shareFile/step.png?imageView2/2/w/900"),
      wxIcon: "".concat(app.config.imgHost, "/img/shareFile/weixin.png"),
      firendIcon: "".concat(app.config.imgHost, "/img/shareFile/pyq.png"),
      transmitBg: "".concat(app.config.imgHost, "/img/shareFile/shareToWx.png"),
      closeIcon: "".concat(app.config.imgHost, "/img/shareFile/Icon_Nav_Close.png"),
      saveImgBg: "".concat(app.config.imgHost, "/img/shareFile/BtnDownload_Img.png"),
    },
  },
  toPath: function () {
    this.setData({
      showSelect: !this.data.showSelect,
    });
  },
  onCancel: function () {
    this.setData({
      showSelect: !this.data.showSelect,
    });
  },
  shareBtn: function () {
    (this.inviteImage(),
      this.setData({
        showShareFriend: !this.data.showShareFriend,
        showSelect: !this.data.showSelect,
      }));
  },
  closeImg: function () {
    this.setData({
      showShareFriend: !this.data.showShareFriend,
    });
  },
  saveImg: function () {
    var e = this;
    (ServicesInvite.default.countInvite({
      type: 114,
    }),
      wx.showLoading({
        title: "正在保存图片...",
        mask: !0,
      }),
      wx.downloadFile({
        url: this.data.friendImg,
        success: function (t) {
          wx.saveImageToPhotosAlbum({
            filePath: t.tempFilePath,
            success: function () {
              (wx.hideLoading(),
                wx.showToast({
                  title: "保存成功",
                  icon: "success",
                  duration: 2e3,
                }),
                e.closeImg());
            },
            fail: function (e) {
              (wx.hideLoading(),
                "saveImageToPhotosAlbum:fail auth deny" === e.errMsg &&
                  wx.showModal({
                    title: "提示",
                    content: "检测到你相册权限未开启",
                    success: function (e) {
                      e.confirm
                        ? wx.openSetting({
                            success: function (e) {
                              e.authSetting = {
                                "scope.writePhotosAlbum": !0,
                              };
                            },
                            fail: function (e) {},
                          })
                        : e.cancel && console.log("用户点击取消");
                    },
                  }));
            },
          });
        },
      }));
  },
  pageScrollToBottom: function () {
    wx.createSelectorQuery()
      .select(".invitation")
      .boundingClientRect(function (e) {
        wx.pageScrollTo({
          scrollTop: e.bottom,
        });
      })
      .exec();
  },
  inviteData: function () {
    var e = this;
    ServicesInvite.default.inviteData().then(function (t) {
      e.setData({
        inviteData: t.data,
      });
    });
  },
  inviteList: function () {
    var e = this,
      app = this.data,
      s = app.pageNum,
      c = app.pageSize,
      r = app.isAll,
      l = app.inviteList;
    r ||
      (s++,
      ServicesInvite.default
        .inviteList({
          pageNum: s,
          pageSize: c,
        })
        .then(function (a) {
          if (0 === a.code) {
            var app = a.data.list.map(function (e) {
              return objectSpread2(
                objectSpread2({}, e),
                {},
                {
                  headImg: n.utils.addDefaultAvatar(e.headImg),
                },
              );
            });
            e.setData({
              inviteList: [].concat(toConsumableArray(l), toConsumableArray(app)),
              pageNum: s,
              isAll: a.data.isLastPage,
            });
          }
        }));
  },
  inviteImage: function () {
    var e = this;
    (wx.showLoading({
      title: "正在获取图片...",
      mask: !0,
    }),
      ServicesInvite.default.inviteImage().then(function (t) {
        wx.hideLoading();
        var objectSpread2 = t.data.replace("http", "https");
        e.setData({
          friendImg: objectSpread2,
        });
      }));
  },
  onLoad: function (e) {
    this.data.inviteUserId = e.inviteUserId;
  },
  onReady: function () {
    (this.inviteData(), this.inviteList());
  },
  onShow: function () {},
  onHide: function () {},
  onUnload: function () {},
  onPullDownRefresh: function () {},
  onReachBottom: function () {
    this.inviteList();
  },
  onShareAppMessage: function (e) {
    var toConsumableArray = app.globalData.userInfo.id;
    return (
      ServicesInvite.default.countInvite({
        type: 114,
      }),
      {
        title: "首次回复需求, 过审即可获得",
        path: "/packageB/pages/personal-center/invitation/inviteRegister/index?userId=".concat(
          toConsumableArray,
        ),
        imageUrl: this.data.icon.transmitBg,
        success: function (e) {
          (this.onCancel(), console.log(e.shareTickets));
        },
        fail: function (e) {},
      }
    );
  },
});
