/**
 * 意见反馈页（packageB）
 * ---------------------------------------------------------------
 * 功能：采集反馈正文并提交，提交前可选授权回填手机号
 * 调用方：packageB/pages/personal-center/setting 的"意见反馈"入口（wxml 绑定 formSubmit 与
 *   getPhoneNumber）
 * 入参：表单 textarea 的正文与微信手机号授权的 iv 与 encryptedData
 * 传给谁：一律经 libs/services/request.js 的传输层，再由 libs/utils/apiGateway.js 的
 *   requestContract 归一化与处理 CSRF 一次性令牌；本页不再直发 wx.request，
 *   也不再自拼 Authorization 头（凭据是后端 httpOnly Cookie，由 wx 网络层自动维护，
 *   storage 里从来没有 token，读它当凭据发出必被 backend/src/middleware/auth.rs 判未认证）
 * 存什么：不写任何凭据键，也不写 userRole 与 lastAccessShopId 与 loginToken 与 logoutFlag
 *   这些非后端出参的键
 * 存哪里：无
 */
var e = (0, require("../../../../../@babel/runtime/helpers/interopRequireDefault").default)(
    require("../../../../utils/mta_analysis.js"),
  ),
  ServicesUser = require("../../../../libs/services/ServicesUser.js"),
  login = require("../../../../libs/utils/login.js").login,
  request = require("../../../../libs/services/request.js").request,
  app = getApp();

/**
 * 意见反馈的提交地址
 * 待拍板一条：本仓权威面 frontend/scripts/route-snapshot.txt（1821 条）内没有"用户意见反馈"端点，
 * 只有生产流转卡反馈 POST /api/v1/erp/production/flow-cards/feedbacks（快照:1426，
 * flow_card_handler::create_feedback），语义是车间反馈而非 App 用户意见，不能拿来冒充。
 * 故旧路径原样保留并登记，禁止改成会 404 的假接入；去向见交付报告待拍板清单
 */
var FEEDBACK_ADD_PATH = "/app-api/feedback/add";

Page({
  data: {
    textarea_feedback: "",
    showPhone: "",
    userRole: 0,
  },
  onLoad: function (t) {
    (e.default.Page.init(),
      this.setData({
        showPhone: app.globalData.userInfo.phone,
        userRole: app.globalData.userInfo.role,
      }),
      wx.hideShareMenu());
  },
  textarea_val: function (e) {
    var ServicesUser = e.detail.value;
    this.setData({
      textarea_feedback: ServicesUser,
    });
  },
  getPhoneNumber: function (e) {
    (console.log(e.currentTarget.dataset.goodsId),
      console.log(e.detail.errMsg),
      console.log(e.detail.iv),
      console.log(e.detail.encryptedData),
      "getPhoneNumber:fail user deny" == e.detail.errMsg ||
      null == e.detail.iv ||
      null == e.detail.encryptedData
        ? wx.showToast({
            title: "您已取消授权，无法提交反馈",
            icon: "none",
          })
        : this.upLoad(e, e.detail.iv, e.detail.encryptedData));
  },
  /**
   * 回填授权手机号
   * 入参 i 载荷（id 与 iv 与 mobile，mobile 实为 encryptedData，沿用原字段名不改形态）
   * 传给谁：ServicesUser.uploadUserInfo -> 传输层 -> 契约层（POST /app-api/user，仓内无等价端点，
   *   已登记待拍板）
   * 存什么/存哪里：本页不落盘，成功后改由 login.getUserInfo 回读后端档案
   */
  upLoad: function (e, o, n) {
    var s = this,
      i = {
        id: app.globalData.userInfo.id,
        iv: o,
        mobile: n,
      };
    ServicesUser.servicesUser.uploadUserInfo(i).then(function (e) {
      0 === e.code
        ? s.getUserInfo()
        : wx.showToast({
            title: e.msg,
            icon: "none",
          });
    });
  },
  /**
   * 提交反馈前先回读一次档案，确保用的是后端认过的当前用户
   * 入参：无
   * 传给谁：libs/utils/login.js 的 getUserInfo（GET /api/v1/erp/users/me，快照:968），
   *   档案键由 login.js 单点落盘；原先在此重复写 userRole 与 lastAccessShopId 与 myShopId 与
   *   loginToken 与 logoutFlag 的分支已退场，因 UserResponse
   *   （backend/src/handlers/user_handler.rs:108）不出这些字段，写入值永远是 undefined
   * 存什么/存哪里：见 libs/utils/login.js
   */
  getUserInfo: function () {
    var e = this;
    return login.getUserInfo().then(function (t) {
      if (t && 0 === t.code) {
        e.setData({
          showPhone: (t.data && t.data.phone) || "",
        });
        return e.formSubmit();
      }
      // 失败已由 login.getUserInfo 与传输层 onErrer 外显，这里不重复弹同一条
    });
  },
  /**
   * 提交反馈正文
   * 调用方：本页 wxml 表单 submit 与 getUserInfo 的成功分支
   * 入参：无（读 this.data.textarea_feedback）
   * 传给谁：传输层 request.POST -> apiGateway.requestContract（归一化与令牌与 403 重放在契约层）
   * 存什么/存哪里：不落盘
   * 判据一条：经网关后成功信封 code 200 被归一成 0（backend/src/utils/response.rs），
   *   原先直发 wx.request 时 0 === e.data.code 对后端 200 恒判假，属真缺陷
   */
  formSubmit: function (e) {
    if ("" === this.data.textarea_feedback)
      wx.showToast({
        title: "请输入反馈内容",
        icon: "none",
      });
    else {
      var ServicesUser = {
        content: this.data.textarea_feedback,
      };
      request
        .POST("".concat(app.config.bingxiHost).concat(FEEDBACK_ADD_PATH), ServicesUser, {
          headers: {
            "content-type": "application/json",
            terminalType: 81,
          },
        })
        .then(function (res) {
          if (res && 0 === res.code) {
            (setTimeout(function () {
              wx.showToast({
                title: "意见反馈已成功提交",
                icon: "none",
              });
            }, 100),
              wx.navigateBack({
                delta: 1,
              }));
            return;
          }
          // 失败已由传输层 onErrer 外显并处理 401 跳登录，这里不重复弹同一条，也不静默跳过
        });
    }
  },
});
