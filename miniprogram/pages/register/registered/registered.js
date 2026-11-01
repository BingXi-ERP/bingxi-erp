/**
 * 开店申请成功页
 * ---------------------------------------------------------------
 * 功能：申请提交成功后展示结果，并提供回到登录页的入口
 * 调用方：pages/register 的注册链（由申请页 navigateTo/redirect 到本页），wxml 绑定 toIndex
 * 入参：onLoad 的页面参数（本页不使用）
 * 传给谁：getUserInfo 经 libs/utils/login.js 的 getUserInfo 发 GET /api/v1/erp/auth/me
 *   （frontend/scripts/route-snapshot.txt:230 get_current_user），由 libs/services/request.js 与
 *   libs/utils/apiGateway.js 的 requestContract 统一归一化与令牌处理
 * 存什么：登录档案摘要（id 与 nickName 与 fullName 与 mobile 与 avatar），由 login.js 落盘；
 *   本页不再写 token 与 loginToken 与 logoutFlag 与 userRole 与 lastAccessShopId 与 paramShopId
 * 存哪里：wx.storage（键由 libs/utils/login.js 定义）
 *
 * 原写法是裸 wx.request 自取 storage 的 token 当查询参数，并用 0 === t.data.code 判成功。
 * 两条都必假：一 后端凭据是 httpOnly Cookie（backend/src/middleware/auth.rs），JS 侧 storage 里
 * 从来没有 token，因此请求根本不带凭据；二 绕开网关就没有 200 转 0 的信封归一
 * （backend/src/utils/response.rs 成功信封是 code 200），判据恒假只剩一条提示，属真缺陷。
 * userRole 与 lastAccessShopId 与 paramShopId 三键全仓零读方（复核见交付报告），
 * loginToken 与 logoutFlag 不是后端出参（UserResponse 见 backend/src/handlers/user_handler.rs:108），
 * 一并停止写入。
 */
var app = getApp(),
  login = require("../../libs/utils/login.js").login;
Page({
  data: {
    headerimg: "".concat(app.config.imgHost, "/html/static/img/shop-registered-bg.png"),
  },
  toIndex: function () {
    (wx.setStorageSync("newShop", "yes"),
      wx.reLaunch({
        url: "/pages/register/login/login",
        success: function (a) {
          var t = getCurrentPages().pop();
          null != t && null != t && t.onLoad();
        },
      }));
  },
  onLoad: function (a) {
    wx.hideShareMenu();
  },
  /**
   * 回读当前会话的用户档案
   * 调用方：本页注册成功后需要刷新档案的入口（当前 wxml 未绑定，保留为可调用能力）
   * 入参：无
   * 传给谁：libs/utils/login.js 的 getUserInfo -> ServicesUser.getUserInfo -> 传输层 -> 契约层
   * 存什么：后端认过的用户档案键
   * 存哪里：wx.storage 与 app.globalData.userInfo
   */
  getUserInfo: function () {
    return login.getUserInfo();
  },
});
