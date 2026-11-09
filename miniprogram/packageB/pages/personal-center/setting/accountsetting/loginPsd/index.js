/**
 * 修改登录密码页（packageB）
 * ---------------------------------------------------------------
 * 功能：提交新密码并在成功后强制退出，让用户用新密码重新登录
 * 调用方：packageB/pages/personal-center/setting/accountsetting 的密码入口（wxml 绑定 save 与 loginout）
 * 入参：本页 data 的 password1 与 password2
 * 传给谁：改密经 packageB/libs/services/ServicesIndex.js 的 editLoginPsd，
 *   即 POST /api/v1/erp/users/change-password（frontend/scripts/route-snapshot.txt:1632
 *   user_handler::change_password）；退出经 POST /api/v1/erp/auth/logout
 *   （同快照:1065）；两者都由 libs/services/request.js 与 apiGateway 的 requestContract 发出。
 *   本地会话作废统一交给 libs/utils/checkToken.js 的 clearLoginFlag
 * 存什么：不写任何凭据键。原写法把 token 与 devToken 与 demoToken 与 productionToken 与 loginToken
 *   与 logoutFlag 当登录痕迹清除并重建进 globalData，而后端 LoginResponse 无 token 字段
 *   （backend/src/handlers/auth_handler.rs），这些键的值永远是 undefined，属凭据冒充登录态
 * 存哪里：无
 */
var e = require("../../../../../../@babel/runtime/helpers/defineProperty"),
  ServicesIndex = require("../../../../../libs/services/ServicesIndex.js").ServicesIndex,
  checkToken = require("../../../../../libs/utils/checkToken.js").checkToken,
  app = getApp();
Page({
  data: {
    password1: "",
    password2: "",
    passwordShow: !0,
    passwordShow2: !0,
    icon: {
      shape: "".concat(app.config.imgHost, "/img/customer/duibuIcon/icon/CombinedShape@2x.png"),
      eye: "".concat(app.config.imgHost, "/img/customer/duibuIcon/icon/Icon_eyes@3x.png"),
    },
  },
  handleInputVal: function (o) {
    var app = o.target.dataset.prop,
      a = o.detail.value;
    this.setData({
      app: a,
    });
  },
  handleClickIcon: function (o) {
    var app = o.target.dataset.prop;
    this.setData({
      app: !this.data[app],
    });
  },
  /**
   * 退出并回到登录页（改密成功后强制重新登录）
   * 调用方：本页 save 的成功分支与 wxml 的退出入口
   * 入参：无
   * 传给谁：POST /api/v1/erp/auth/logout（快照:1065），本地作废由
   *   libs/utils/checkToken.js 的 clearLoginFlag 单点完成
   * 存什么/存哪里：不写任何凭据键（原写法清除并回读的 token 与 devToken 与 demoToken 与
   *   productionToken 与 loginToken 与 logoutFlag 均非后端出参，落盘值恒为 undefined）
   * 判据一条：后端登出失败也照样作废旧会话并把原因 toast 外显，不静默吞
   */
  loginout: function () {
    (wx.showLoading({
      title: "正在退出...",
    }),
      ServicesIndex.logout().then(
        function (e) {
          (wx.hideLoading(),
            checkToken.clearLoginFlag(),
            e && 0 === e.code
              ? void 0
              : wx.showToast({
                  title: (e && e.msg) || "退出失败",
                  icon: "none",
                }));
        },
        function (err) {
          (wx.hideLoading(),
            checkToken.clearLoginFlag(),
            wx.showToast({
              title: (err && err.errMsg) || "退出失败",
              icon: "none",
            }));
        },
      ));
  },
  save: function () {
    var e = this;
    if (this.data.password1.length < 8 || this.data.password2.length < 8)
      wx.showToast({
        title: "密码长度最低不能小于8位",
        icon: "none",
      });
    else if (this.data.password1 && this.data.password2) {
      if (this.data.password1 === this.data.password2) {
        wx.showLoading({
          title: "努力修改中...",
        });
        var app = {
          newPsw: this.data.password1,
          confirmPsw: this.data.password2,
        };
        ServicesIndex.editLoginPsd(app).then(function (o) {
          (wx.hideLoading(),
            0 === o.code
              ? (e.setData({
                  password1: "",
                  password2: "",
                  passwordShow: !1,
                  passwordShow2: !1,
                }),
                wx.showToast({
                  title: "修改成功",
                  icon: "success",
                }),
                e.loginout())
              : wx.showToast({
                  title: o.msg,
                  icon: "none",
                }));
        });
      } else
        wx.showToast({
          title: "两次输入的密码不一致",
          icon: "none",
        });
    } else
      wx.showToast({
        title: "请先输入密码",
        icon: "none",
      });
  },
});
