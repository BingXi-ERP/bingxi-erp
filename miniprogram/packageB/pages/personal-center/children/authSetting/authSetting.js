var e = require("../../../../../@babel/runtime/helpers/defineProperty"),
  app = getApp(),
  ServicesUser = require("../../../../libs/services/ServicesUser.js").servicesUser,
  request = require("../../../../libs/services/request.js").request,
  n =
    (require("../../../../libs/utils/login.js").login,
    require("../../../../libs/utils/util.js").utils),
  a = null;
Page({
  data: {
    hasUserInfo: !1,
    userInfo: null,
    queryId: "",
    photo: "",
    userInfos: "",
    mobile: "",
    nickName: "",
    inviteToken: "",
    userId: "",
    inviteShopId: "",
    shopName: "",
    codeStatus: !0,
    login_name: "",
    login_member: "",
    login_code: "",
    wxCode: "",
    currentTime: 61,
    codeName: "获取验证码",
    delImage: "".concat(app.config.imgHost, "/img/customer/duibuIcon/icon/del@2x.png"),
    params: {},
  },
  onLoad: function (e) {
    (null != e.id &&
      this.setData({
        queryId: e.id,
      }),
      console.log(e, "options-zws"));
    var app = n.getParam2(e),
      ServicesUser = wx.getStorageSync("childUserInfo");
    (this.setData({
      userId: app.userId,
      userInfo: ServicesUser,
      hasUserInfo: !!ServicesUser.nickName,
      shopName: decodeURI(app.shopName),
    }),
      wx.hideShareMenu());
  },
  onShow: function () {},
  input_val: function (t) {
    var ServicesUser = t.detail.value,
      n = t.currentTarget.dataset.name;
    this.setData({
      n: ServicesUser,
    });
  },
  code_val: function (e) {
    var app = e.detail.value;
    this.setData({
      login_code: app,
      disable: !1,
    });
  },
  clearInput: function (e) {
    (0 == e.currentTarget.id &&
      this.setData({
        login_member: "",
      }),
      2 == e.currentTarget.id &&
        this.setData({
          login_name: "",
        }),
      1 == e.currentTarget.id &&
        this.setData({
          login_code: "",
          disable: !0,
        }));
  },
  getVerificationCode: function () {
    if (11 == this.data.login_member.length) {
      if (/^1\d{10}$/.test(this.data.login_member)) {
        this.setCodeMobile();
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
  getCode: function (e) {
    var app = this,
      ServicesUser = app.data.currentTime;
    a = setInterval(function () {
      (ServicesUser--,
        app.setData({
          codeName: "(" + ServicesUser + ")重新获取",
        }),
        ServicesUser <= 0 &&
          (clearInterval(a),
          app.setData({
            codeName: "获取验证码",
            currentTime: 61,
            disabled: !1,
          })));
    }, 1e3);
  },
  setCodeMobile: function () {
    var e = this,
      app = {
        mobile: this.data.login_member,
      };
    ServicesUser.subAccountSendCode(app).then(function (t) {
      0 === t.code
        ? (wx.showToast({
            title: "发送成功，验证码有效期为10分钟",
            icon: "none",
          }),
          e.getCode(),
          e.setData({
            disabled: !0,
          }))
        : wx.showToast({
            title: t.msg,
            icon: "none",
          });
    });
  },
  accountLogin: function () {
    var e = this.data,
      app = e.login_member,
      n = e.login_code,
      a = e.login_name,
      i = e.userId;
    if (a) {
      var s = {
        oneTwoFlag: 2,
        superUserId: i,
        name: a,
        mobile: app,
        code: n,
        version: 2,
      };
      (console.log(s),
        ServicesUser.subAccountLogin(s).then(function (e) {
          0 === e.code
            ? wx.showToast({
                title: "绑定子账号成功，等待主账号启用",
                duration: 3e3,
                success: function () {
                  wx.reLaunch({
                    url: "/pages/register/login/login",
                  });
                },
              })
            : wx.showToast({
                title: e.msg,
                icon: "none",
              });
        }));
    } else
      wx.showToast({
        title: "请输入姓名",
        icon: "none",
        duration: 3e3,
      });
  },
  checkSubInviteStatus: function () {
    var e = this;
    // 两条一并收口：一 载荷 token 键是假凭据（storage 从无 token 键），删除；
    // 二 原裸 wx.request 用 0 === t.data.code 判成功，后端成功信封是 code 200（
    // backend/src/utils/response.rs），绕开网关就没有 200 转 0 的归一，恒假只弹空提示，
    // 属真缺陷；接进 ServicesUser.requestPost 走传输层与契约层归一化。
    // 目标 URL 是旧路径且本仓权威面无等价端点，原样保留并登记待拍板，不改成像
    request
      .GET(
        "".concat(app.config.bingxiHost, "/app-api/user/subAccount/checkInviteCodeIsExpire"),
        {
          inviteToken: e.data.inviteToken,
        },
      )
      .then(function (t) {
        0 === t.code
          ? (0 == t.data.status &&
              (wx.showToast({
                title: "邀请二维码已过期",
                icon: "none",
              }),
              e.setData({
                codeStatus: !1,
              })),
            e.setData({
              shopName: t.data.shopName,
            }))
          : wx.showToast({
              title: t.msg || "邀请码校验失败",
              icon: "none",
            });
      });
  },
  onGotUserInfo: function (e) {
    (console.log(e, "个人信息"),
      "getUserInfo:ok" === e.detail.errMsg &&
        ((this.data.userinfo = JSON.parse(e.detail.rawData)),
        this.setData({
          userinfo: this.data.userinfo,
          hasUserInfo: !!this.data.userinfo.nickName,
        }),
        wx.setStorageSync("childUserInfo", this.data.userinfo)));
  },
});
