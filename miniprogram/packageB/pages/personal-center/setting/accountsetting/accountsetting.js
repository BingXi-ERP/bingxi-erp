/**
 * 账号与安全页（packageB）
 * ---------------------------------------------------------------
 * 功能：展示当前账号的昵称与手机号，并给出改手机号与绑微信的入口
 * 调用方：packageB/pages/personal-center/setting 的"账号与安全"入口（wxml 绑定 toDetail）
 * 入参：无
 * 传给谁：档案回读经 libs/utils/login.js 的 getUserInfo -> ServicesUser.getUserInfo -> 传输层 ->
 *   libs/utils/apiGateway.js 的 requestContract，打到 GET /api/v1/erp/users/me
 *   （frontend/scripts/route-snapshot.txt:968 get_user_me）
 * 存什么：只由 login.js 落用户档案键
 * 存哪里：wx.storage（键由 libs/utils/login.js 定义）
 *
 * 退场依据：本页原先把 users/me 的响应字段当 roleName 与 lastAccessShopId 与 companyId 与
 * loginToken 与 logoutFlag 与 wechatId 与 wxOpenId 读并写进 storage，而 UserResponse
 * （backend/src/handlers/user_handler.rs:108 到 123）只有 id 与 username 与 real_name 与 avatar
 * 与 email 与 phone 与 role_id 与 department_id 与 is_active 与 created_at 与 department_name
 * 与 role_names，那些键落盘值永远是 undefined；userRole 与 lastAccessShopId 与 wxId 与 wxOpenId
 * 四键实测全仓零读方（复核见交付报告），loginToken 与 logoutFlag 属凭据冒充登录态，一并停止写入。
 */
var e = (0, require("../../../../../@babel/runtime/helpers/interopRequireDefault").default)(
    require("../../../../../utils/mta_analysis.js"),
  ),
  login = require("../../../../libs/utils/login.js").login,
  app = getApp();
Page({
  data: {
    stallData: {
      phoneUrl: "/packageB/pages/personal-center/setting/accountsetting/phone/phone",
      wetchatUrl: "/packageB/pages/personal-center/setting/accountsetting/wechat/wechat",
    },
    nickName: "",
    mobile: "",
    wxId: "",
  },
  toDetail: function (e) {
    var ServicesUser = e.currentTarget.dataset.pagesDetail;
    wx.navigateTo({
      url: ServicesUser,
    });
  },
  /**
   * 回读当前会话的用户档案
   * 调用方：本页 onShow
   * 入参：无
   * 传给谁：libs/utils/login.js 的 getUserInfo（统一经网关并归一化，档案键由它单点落盘）
   * 存什么/存哪里：由 login.js 决定，本方法只把用户对象交给调用方展示
   * 落定一次：无论成功失败都 resolve 用户对象（失败给空对象）。原写法失败分支 resolve undefined，
   *   紧随的 onShow 取值会直接 TypeError，属静默崩而不是外显错误
   */
  getUserInfo: function () {
    return login.getUserInfo().then(function (t) {
      return (t && t.code === 0 && t.data) || {};
    });
  },
  onLoad: function (t) {
    (e.default.Page.init(), wx.hideShareMenu());
  },
  onShow: function () {
    var e = this;
    this.getUserInfo().then(function (t) {
      (console.log(t),
        e.setData({
          nickName: t.nickName,
          // 显示一律以后端实际出参为准：users/me 的 phone 是本人号码的权威形态
          // （backend/src/handlers/auth_handler.rs UserInfo.phone 即为用户中心展示而补），
          // 前端自行 substring 拼 "****" 属自造第二套掩码判据，一律取消；
          // 后端回 null 时留空，不再拿假值填充（原写法 phone 为 null 直接 TypeError）。
          mobile: t.phone || "",
          // 微信绑定状态无仓内出参：UserResponse 与 UserInfo 都没有 wechatId，
          // 且快照 1821 条内没有微信绑定端点，原样留空并登记待拍板，不拿假值填充
          wxId: t.wechatId,
        }));
    });
  },
});
