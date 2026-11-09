var e = require("../../../../../@babel/runtime/helpers/interopRequireDefault").default,
  t = require("../../../../../@babel/runtime/helpers/defineProperty"),
  ServicesInvite = e(require("../../../../libs/services/ServicesInvite")),
  util = require("../../../../utils/util"),
  app = getApp(),
  a = null;
Page({
  data: {
    check: !1,
    userHeadImg: "",
    icon: {
      headerImg: "".concat(app.config.imgHost, "/img/shareFile/invite_header_img.png"),
      textContent: "".concat(app.config.imgHost, "/img/shareFile/textContent.png"),
      selected: "".concat(app.config.imgHost, "/img/shareFile/Icon_Selected@2x.png"),
    },
    mobile: "",
    code: "",
    currentTime: 61,
    codeName: "获取验证码",
    disabled: !1,
    userId: "",
  },
  checkboxChange: function () {
    this.setData({
      check: !this.data.check,
    });
  },
  agreePage: function () {
    wx.downloadFile({
      url: "".concat(app.config.imgHost, "/product/syxy.docx"),
      success: function (e) {
        var t = e.tempFilePath;
        wx.openDocument({
          filePath: t,
          showMenu: !0,
          success: function (e) {
            console.log("打开文档成功");
          },
        });
      },
    });
  },
  toPrivacy: function () {
    wx.downloadFile({
      url: "".concat(app.config.imgHost, "/product/yszc.docx"),
      success: function (e) {
        var t = e.tempFilePath;
        wx.openDocument({
          filePath: t,
          showMenu: !0,
          success: function (e) {
            console.log("打开文档成功");
          },
        });
      },
    });
  },
  toPath: function () {
    var e = this;
    this.checkInviteCode().then(function (t) {
      "success" === t &&
        (wx.setStorageSync("mobile", e.data.mobile),
        wx.setStorageSync("inviteUserId", e.data.userId),
        wx.reLaunch({
          url: "/packageB/pages/register/index",
        }));
    });
  },
  inputVal: function (e) {
    var ServicesInvite = e.detail.value,
      util = e.currentTarget.dataset.type;
    this.setData({
      util: ServicesInvite,
    });
  },
  checkInviteCode: function () {
    var e = this.data,
      t = e.mobile,
      util = e.code;
    return new Promise(function (e, o) {
      ServicesInvite.default
        .checkInviteCode({
          mobile: t,
          code: util,
        })
        .then(function (t) {
          0 === t.code && "success" == t.msg
            ? e(t.msg)
            : (wx.showToast({
                title: t.msg,
                icon: "none",
              }),
              o());
        });
    });
  },
  inviteUserImg: function () {
    var e = this,
      t = arguments.length > 0 && void 0 !== arguments[0] ? arguments[0] : "0";
    ServicesInvite.default
      .inviteUserImg({
        userId: t,
      })
      .then(function (t) {
        0 === t.code &&
          e.setData({
            userHeadImg: util.utils.addDefaultAvatar(t.data),
          });
      });
  },
  getVerificationCode: function () {
    if (11 === this.data.mobile.length) {
      if (/^1\d{10}$/.test(this.data.mobile)) {
        this.inviteCode();
      } else
        wx.showToast({
          title: "请输入正确的手机号",
          icon: "none",
          duration: 1e3,
        });
    } else
      wx.showToast({
        title: "请输入完整手机号",
        icon: "none",
        duration: 1e3,
      });
  },
  inviteCode: function () {
    var e = this,
      t = this.data.mobile;
    ServicesInvite.default
      .inviteCode({
        mobile: t,
      })
      .then(function (t) {
        0 === t.code
          ? (wx.showToast({
              title: "发送成功，验证码有效期为10分钟",
              icon: "none",
            }),
            e.setData({
              disabled: !0,
            }),
            e.getCode())
          : wx.showToast({
              title: t.msg,
              icon: "none",
            });
      });
  },
  getCode: function (e) {
    var t = this,
      ServicesInvite = t.data.currentTime;
    a = setInterval(function () {
      (ServicesInvite--,
        t.setData({
          codeName: "重新获取(" + ServicesInvite + ")",
        }),
        ServicesInvite <= 0 &&
          (clearInterval(a),
          t.setData({
            codeName: "获取验证码",
            currentTime: 61,
            disabled: !1,
          })));
    }, 1e3);
  },
  getCodeInfo: function (e) {
    var t = util.utils.getParam(e, "userId", "0");
    ((this.data.userId = t), this.inviteUserImg(this.data.userId));
  },
  onLoad: function (e) {
    this.getCodeInfo(e);
  },
  onReady: function () {},
  onShow: function () {},
  onHide: function () {},
  onUnload: function () {},
  onPullDownRefresh: function () {},
  onReachBottom: function () {},
  onShareAppMessage: function () {},
});
