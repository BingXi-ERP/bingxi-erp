/**
 * 开店资料已提交页
 * ---------------------------------------------------------------
 * 功能：提示资料已提交并等待联系，账号已归属组织时给出回到登录页的按钮
 * 调用方：app.json 在册页面（实测全仓只有 registered 被 pages/register/submission/submission.js:341
 *   跳转，本页零活跳转来源，属"在册不可达"，已登记待拍板；本次不删文件）
 * 入参：onLoad 的页面参数（本页不使用）
 * 传给谁：getUserInfo 经 libs/utils/login.js 的 getUserInfo -> ServicesUser.getUserInfo ->
 *   libs/services/request.js -> libs/utils/apiGateway.js 的 requestContract，
 *   打到 GET /api/v1/erp/users/me（frontend/scripts/route-snapshot.txt:968 get_user_me）
 * 存什么：由 login.js 落用户档案键；本页不再写 token 与 loginToken 与 logoutFlag 与
 *   userRole 与 lastAccessShopId 与 paramShopId 这些后端不出参的键
 * 存哪里：wx.storage（键由 libs/utils/login.js 定义）
 *
 * 原写法两处必假：一 裸 wx.request 把 storage 的 token 当查询参数发出，而后端凭据是 httpOnly
 * Cookie（backend/src/middleware/auth.rs），JS 侧从来没有 token；二 绕开网关没有 200 转 0 的
 * 信封归一（backend/src/utils/response.rs），0 === a.data.code 恒判假，只会弹一条
 * a.data.msg.result 的空提示。旧路径 /app-api/user/detai（原样即拼写残缺）在本仓无同形端点，
 * 其语义"当前用户详情"对应仓内 GET /api/v1/erp/users/me，故按真实契约改接。
 */
var app = getApp(),
  login = require("../../libs/utils/login.js").login;
Page({
  data: {
    showBtn: !0,
    headerimg: "".concat(app.config.imgHost, "/html/static/img/shop-registered-bg.png"),
  },
  onLoad: function (a) {
    (wx.hideShareMenu(), this.getUserInfo());
  },
  toLogin: function () {
    /**
     * newShop 全仓零读方（复核见交付报告），保留写入只为不扩大本片段改动面，
     * 已登记待拍板；原写法用 globalData.userInfo.role 做门，
     * 而 users/me 的 UserResponse 没有 role 字段（backend/src/handlers/user_handler.rs:108），
     * 该门恒判假等于按钮永远不出现，属假判据，已去掉
     */
    (wx.setStorageSync("newShop", "yes"),
      wx.reLaunch({
        url: "/pages/register/login/login",
        success: function (a) {
          var t = getCurrentPages().pop();
          null != t && null != t && t.onLoad();
        },
      }));
  },
  /**
   * 回读当前会话的用户档案并决定是否给出登录入口
   * 入参：无
   * 传给谁：login.getUserInfo（经网关归一化），结果落 globalData.userInfo 与档案键
   * 存什么/存哪里：由 login.js 决定，本页只按回读结果 setData
   * 判据：账号启用（is_active）且已归属组织（department_id 非空）才允许进店铺，
   *   对应 users/me 出参 UserResponse 的真实字段
   */
  getUserInfo: function () {
    wx.showLoading({
      title: "加载中...",
    });
    var t = this;
    return login
      .getUserInfo()
      .then(function (res) {
        wx.hideLoading();
        var u = (res && res.code === 0 && res.data) || {};
        t.setData({
          showBtn: !!u.is_active && u.department_id !== null && u.department_id !== undefined,
        });
        return res;
      })
      .catch(function (err) {
        wx.hideLoading();
        return err;
      });
  },
});
