/**
 * 手机号绑定与更改页（packageB）
 * ---------------------------------------------------------------
 * 功能：用短信验证码绑定或更换本机手机号
 * 调用方：packageB/pages/personal-center/setting/accountsetting 的手机号入口（wxml 绑定 toChange）
 * 入参：页面参数 type（add 或其它）与 mobile，以及验证码输入
 * 传给谁：提交经 ServicesIndex.changeMobile（POST 旧路径 /app-api/setting/changeMobile，
 *   仓内权威面 frontend/scripts/route-snapshot.txt 1821 条内无任何短信与换绑手机号端点，
 *   原样保留并登记待拍板，不改成像）；档案回读经 libs/utils/login.js 的 getUserInfo 走网关
 *   打 GET /api/v1/erp/users/me（快照:968）
 * 存什么：只由 login.js 落用户档案键
 * 存哪里：wx.storage（键由 libs/utils/login.js 定义）
 *
 * 本文件的 getUserInfo 原是全仓最后一处 wx.setStorageSync("token", ...)，还按
 * app.environment 把同一值分写 devToken 与 demoToken 与 productionToken。
 * 三条都必假：后端 users/me 的出参 UserResponse 没有 token 与 loginToken 与 logoutFlag 与
 * shopId 与 nickName 与 headImg 与 resCodeList 这些字段
 * （backend/src/handlers/user_handler.rs:108 到 123 只有 id 与 username 与 real_name 与 avatar
 * 与 email 与 phone 与 role_id 与 department_id 与 is_active 与 created_at 与 department_name
 * 与 role_names），凭据是后端写入的 httpOnly Cookie（backend/src/middleware/auth.rs），
 * 所以这批写入落盘的永远是 undefined，属凭据冒充登录态，整段换成会话口径。
 */
var ServicesIndex = require("../../../../../libs/services/ServicesIndex.js").ServicesIndex,
  login = require("../../../../../libs/utils/login.js").login,
  app = getApp();
Page({
  data: {
    types: "add",
    mobile: "",
    code: "",
  },
  test_code: function (e) {
    this.setData({
      code: e.detail.value,
    });
  },
  toChange: function (t) {
    var util = this;
    if ("" != this.data.code) {
      var n = this,
        s = {
          mobile: this.data.mobile,
          code: this.data.code,
        };
      ("add" == n.data.types
        ? "".concat(app.config.bingxiHost, "/app-api/user/bindMobile")
        : "".concat(app.config.bingxiHost, "/app-api/setting/changeMobile"),
        ServicesIndex.changeMobile(s).then(function (e) {
          if ((wx.hideLoading(), 0 === e.code)) {
            var ServicesUser = "";
            "add" == n.data.types
              ? ((t = "add" == n.data.types ? "绑定手机号成功" : "更改手机号成功"),
                wx.showToast({
                  title: ServicesUser,
                  icon: "success",
                }),
                n.getUserInfo(),
                wx.setStorageSync("mobile", util.data.mobile),
                wx.navigateBack({
                  delta: 3,
                }))
              : ((t = "更改手机号成功"),
                wx.showToast({
                  title: ServicesUser,
                  icon: "success",
                }),
                setTimeout(function () {
                  wx.reLaunch({
                    url: "/pages/register/login/login",
                  });
                }, 600));
          } else
            wx.showToast({
              title: e.msg,
              icon: "none",
            });
        }));
    } else
      wx.showToast({
        title: "请输入验证码",
        icon: "none",
        duration: 1e3,
      });
  },
  /**
   * 换绑成功后回读档案
   * 调用方：本页 toChange 的成功分支
   * 入参：无
   * 传给谁：libs/utils/login.js 的 getUserInfo -> ServicesUser.getUserInfo -> 传输层 ->
   *   apiGateway 的 requestContract，打到 GET /api/v1/erp/users/me（快照:968）
   * 存什么：用户档案键（id 与 nickName 与 fullName 与 mobile 与 avatar 与 myShopId 与
   *   resCodeList 与 userType），由 login.js 单点落盘
   * 存哪里：wx.storage
   * 本方法原先自己写 token 与 devToken 与 demoToken 与 productionToken 与 loginToken 与
   * logoutFlag 与 wxId 与 wxOpenId，其中 token 一族是全仓最后一处凭据写入，
   * 值取自 UserResponse 并不存在的字段，落盘永远是 undefined，已全部退场
   */
  getUserInfo: function () {
    return login.getUserInfo();
  },
  onLoad: function (e) {
    (null != e.type &&
      this.setData({
        types: e.type,
        mobile: e.mobile,
      }),
      wx.hideShareMenu());
  },
  onReady: function () {},
  onShow: function () {},
  onHide: function () {},
  onUnload: function () {},
  onPullDownRefresh: function () {},
  onReachBottom: function () {},
  onShareAppMessage: function () {},
});
