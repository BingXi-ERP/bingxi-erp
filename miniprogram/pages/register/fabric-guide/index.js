/**
 * 面料供货商引导页（申请成为供货商）
 * ---------------------------------------------------------------
 * 功能：展示当前账号的开店申请状态，按状态给出对应入口，并提供退出登录
 * 调用方：pages/register 的供货商引导入口（wxml 绑定 goPath 与 logout）
 * 入参：无（读 libs/utils/login.js 回读的用户档案）
 * 传给谁：档案回读经 login.getUserInfo -> ServicesUser.getUserInfo -> 传输层 -> apiGateway 的
 *   requestContract，打到 GET /api/v1/erp/users/me（快照:968）；
 *   退出经 POST /api/v1/erp/auth/logout（快照:1065），本地作废由
 *   libs/utils/checkToken.js 的 clearLoginFlag 单点完成
 * 存什么：不写任何凭据键。原写法把 token 与 devToken 与 demoToken 与 productionToken 与 loginToken
 *   与 logoutFlag 当登录痕迹清除并重建进 globalData，而后端 LoginResponse 无 token 字段
 *   （backend/src/handlers/auth_handler.rs），这些键落盘值永远是 undefined，属凭据冒充登录态
 * 存哪里：无
 *
 * 待拍板一条：本页 openShopStatus 取自档案的 shopApplyStatus，取值 -1 与 0 与 1 分别对应
 *   "可再申请"与"审核中"与"已开通"。users/me 的 UserResponse
 *   （backend/src/handlers/user_handler.rs:108）与 auth/me 的 UserInfo 都没有该出参，
 *   本仓也无"供货商开店申请状态机"端点（快照 1821 条内无 apply/audit 形态的供货商申请路径），
 *   故此处原样保留并登记待拍板，不改成像（见交付报告待拍板清单）。
 */
var login = require("../../../libs/utils/login.js").login,
  ServicesIndex = require("../../../libs/services/ServicesIndex.js").ServicesIndex,
  checkToken = require("../../../libs/utils/checkToken.js").checkToken,
  app = getApp();
Page({
  data: {
    openShopStatus: "",
    userInfoList: {},
    img: {
      info: "".concat(app.config.imgHost, "/img/v3.0.0/info.png"),
    },
  },
  getUserInfo: function () {
    var ServicesIndex = this;
    return new Promise(function (n, t) {
      login
        .getUserInfo()
        .then(function (e) {
          (ServicesIndex.setData({
            userInfoList: e.data,
            openShopStatus: e.data.shopApplyStatus,
          }),
            n());
        })
        .catch(function () {
          t();
        });
    });
  },
  goPath: function () {
    switch (this.data.openShopStatus) {
      case -1:
        var login = this.data.userInfoList,
          ServicesIndex = {
            shopAddress: login.shopAddress,
            shopArea: login.shopArea,
            shopCity: login.shopCity,
            shopProvince: login.shopProvince,
            shopName: login.shopName,
            nickName: login.nickName,
          };
        wx.navigateTo({
          url: "/pages/register/writeApplyInfo/writeApplyInfo?isProfessor=true&userInfo=".concat(
            JSON.stringify(ServicesIndex),
          ),
        });
        break;
      case 0:
        wx.navigateTo({
          url: "/pages/register/infoExamine/infoExamine",
        });
        break;
      case 1:
        this.setData({
          openShopPopup: !0,
        });
    }
  },
  /**
   * 退出登录
   * 调用方：本页 wxml 的退出入口
   * 入参：无
   * 传给谁：POST /api/v1/erp/auth/logout（快照:1065 auth_handler_session::logout，无请求体），
   *   本地作废交给 libs/utils/checkToken.js 的 clearLoginFlag（清会话快照与一次性 CSRF 令牌
   *   与用户档案键并回登录页）
   * 存什么/存哪里：不写任何凭据键
   * 判据一条：后端登出失败也照样作废旧会话并把原因 toast 外显，不静默吞。
   *   原写法先 setStorageSync("logoutFlag", 1) 再 removeStorageSync("logoutFlag")，
   *   同一函数里写了又删属自相矛盾，且 globalData 重建时把 token 与 loginToken 读回来
   *   冒充登录态，一并退场
   */
  logout: function () {
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
  onLoad: function (e) {
    var ServicesIndex = this;
    this.getUserInfo().then(function () {
      wx.setNavigationBarTitle({
        title: 0 === ServicesIndex.data.openShopStatus ? "查看进度" : "申请成为供货商",
      });
    });
  },
  onReady: function () {},
  onShow: function () {},
  onHide: function () {},
  onUnload: function () {},
  onPullDownRefresh: function () {},
  onReachBottom: function () {},
  onShareAppMessage: function () {},
});
