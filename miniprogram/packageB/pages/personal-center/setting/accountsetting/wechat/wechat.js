/**
 * 微信号绑定与解绑页（packageB）
 * ---------------------------------------------------------------
 * 功能：把当前账号与微信身份绑定或解除绑定，绑定前先取微信授权与 wx.login 的 code
 * 调用方：packageB/pages/personal-center/setting/accountsetting 的微信入口（wxml 绑定
 *   bindUser 与 getUserProfile 与 loginout）
 * 入参：按钮 currentTarget.id（0 解绑 1 绑定）与微信授权回调的 rawData 与 encryptedData 与 iv
 * 传给谁：绑定与解绑经 ServicesUser.requestPost 走传输层与 apiGateway 的 requestContract，
 *   目标是旧路径 /app-api/setting/bindWechat 与 /app-api/setting/unbindWechat
 *   （仓内权威面 frontend/scripts/route-snapshot.txt 1821 条内无微信绑定端点，
 *   原样保留并登记待拍板，不改成像）；档案回读经 libs/utils/login.js 的 getUserInfo 走网关打
 *   GET /api/v1/erp/users/me（快照:968）；退出作废交给 libs/utils/checkToken.js 的 clearLoginFlag
 * 存什么：只由 login.js 落用户档案键；本文件不再写 userRole 与 lastAccessShopId 与 loginToken 与
 *   logoutFlag 与 wxId 与 wxOpenId
 * 存哪里：wx.storage（键由 libs/utils/login.js 定义）
 *
 * 退场依据：users/me 的出参是 UserResponse（backend/src/handlers/user_handler.rs:108 到 123），
 * 只有 id 与 username 与 real_name 与 avatar 与 email 与 phone 与 role_id 与 department_id 与
 * is_active 与 created_at 与 department_name 与 role_names，没有 role 与 lastAccessShopId 与
 * shopId 与 loginToken 与 logoutFlag 与 wxId 与 wxOpenId；
 * POST /api/v1/erp/auth/logout 的出参是 LogoutResponse 只有 success（
 * backend/src/handlers/auth_handler_session.rs 的 logout），把 e.data.logoutFlag 写进 storage
 * 落盘永远是 undefined，属凭据冒充登录态。
 */
var ServicesUser = require("../../../../../libs/services/ServicesUser.js").servicesUser,
  login = require("../../../../../libs/utils/login.js").login,
  checkToken = require("../../../../../libs/utils/checkToken.js").checkToken,
  app = getApp();
Page({
  data: {
    nickName: "",
    headImg: "",
    wxCode: "",
    wxId: "",
    userInfo: getApp().globalData.userInfo,
  },
  onLoad: function (e) {},
  onReady: function () {},
  onShow: function () {
    this.setData({
      nickName: app.globalData.userInfo.nickName,
      headImg: app.globalData.userInfo.avatar,
      wxId: app.globalData.userInfo.wechatId,
    });
  },
  getUserProfile: function (e) {
    var app = this;
    wx.getUserProfile({
      desc: "用于绑定门店信息，便于登录",
      success: function (a) {
        if ("getUserProfile:ok" === a.errMsg) {
          try {
            e.detail.userInfo = JSON.parse(a.rawData);
          } catch (t) {
            e.detail.userInfo = a.userInfo;
          }
          ((e.rawData = a.rawData),
            (e.encryptedData = a.encryptedData),
            (e.iv = a.iv),
            app.bindUser(e));
        }
      },
    });
  },
  bindUser: function (e) {
    var a,
      o,
      n,
      i = this,
      s = "";
    if (
      ("0" == e.currentTarget.id &&
        ((a = "解绑中..."),
        (o = "解绑成功"),
        (s = "".concat(app.config.bingxiHost, "/app-api/setting/unbindWechat")),
        (n = {
          userId: getApp().globalData.userInfo.id,
          openId: getApp().globalData.userInfo.wxOpenId,
          nickName: getApp().globalData.userInfo.nickName,
        }),
        i.bindWx(s, n, o)),
      "1" == e.currentTarget.id)
    ) {
      if (!e.detail.userInfo)
        return void wx.showToast({
          title: "已取消",
          icon: "none",
        });
      ((a = "绑定中..."),
        (o = "绑定成功"),
        (s = "".concat(app.config.bingxiHost, "/app-api/setting/bindWechat")),
        wx.login({
          success: function (t) {
            ((n = {
              wxCode: t.code,
              wxMiniUserInfo: e.rawData,
              nickName: e.detail.userInfo.nickName,
              headImg: e.detail.userInfo.avatarUrl,
              unionId: e.encryptedData,
              iv: e.iv,
            }),
              i.bindWx(s, n, o));
          },
        }));
    }
    wx.showLoading({
      title: a,
    });
  },
  bindWx: function (t, a, o) {
    var n = this;
    ServicesUser.requestPost(a, t).then(function (e) {
      if (0 === e.code) {
        if (
          (wx.showToast({
            title: o,
            icon: "success",
          }),
          n.getUserInfo(),
          "解绑成功" == o)
        )
          var app = setTimeout(function () {
            (clearTimeout(app),
              wx.navigateBack({
                delta: "1",
              }));
          }, 500);
        if ("绑定成功" == o)
          var a = setTimeout(function () {
            (clearTimeout(a),
              wx.navigateBack({
                delta: "1",
              }));
          }, 1e3);
      } else
        wx.showToast({
          title: e.msg,
          icon: "none",
        });
      wx.hideLoading();
    });
  },
  /**
   * 绑定或解绑成功后回读档案
   * 调用方：本页 bindWx 的成功分支
   * 入参：无
   * 传给谁：libs/utils/login.js 的 getUserInfo（经网关打 GET /api/v1/erp/users/me，快照:968）
   * 存什么/存哪里：档案键由 login.js 单点落盘，本页不再重复写一批非后端出参的键
   */
  getUserInfo: function () {
    return login.getUserInfo();
  },
  /**
   * 退出并回到登录页
   * 调用方：本页 wxml 的退出入口
   * 入参：无
   * 传给谁：POST /api/v1/erp/auth/logout（快照:1065），本地作废交给 clearLoginFlag
   * 存什么/存哪里：不写任何凭据键
   * 判据一条：后端登出失败也照样作废旧会话并把原因外显，不静默吞
   */
  loginout: function () {
    ServicesUser.logout({}).then(
      function (e) {
        checkToken.clearLoginFlag();
        if (!e || 0 !== e.code) {
          wx.showToast({
            title: (e && e.msg) || "退出失败",
            icon: "none",
          });
        }
      },
      function (err) {
        checkToken.clearLoginFlag();
        wx.showToast({
          title: (err && err.errMsg) || "退出失败",
          icon: "none",
        });
      },
    );
  },
  onHide: function () {},
  onUnload: function () {},
  onPullDownRefresh: function () {},
  onReachBottom: function () {},
  onShareAppMessage: function () {},
});
