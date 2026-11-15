/**
 * 设置页（packageB）
 * ---------------------------------------------------------------
 * 功能：按用户类型与权限渲染设置入口，并提供退出登录
 * 调用方：packageB/pages/personal-center 的设置入口与 accountsetting 的返回路径
 * 入参：无（读 wx.storage 的档案键与 app.globalData 与 app.userAuthList）
 * 传给谁：请求经 libs/services/request.js 与 apiGateway 的 requestContract 发出；
 *   会话作废统一走 libs/utils/checkToken.js 的 clearLoginFlag
 * 存什么：QRcodeRed 一个红点标记；不再读写任何凭据键
 * 存哪里：wx.storage
 */
var e = (0, require("../../../../@babel/runtime/helpers/interopRequireDefault").default)(
    require("../../../utils/mta_analysis.js"),
  ),
  login = require("../../../libs/utils/login"),
  ServicesIndex = require("../../../libs/services/ServicesIndex.js").ServicesIndex,
  checkToken = require("../../../libs/utils/checkToken.js").checkToken,
  app = getApp();
Page({
  data: {
    userType: "",
    QRcodeRed: "",
    stallData: {
      feedbackUrl: "/packageB/pages/personal-center/setting/feedback/feedback",
      accountUrl: "/packageB/pages/personal-center/setting/accountsetting/accountsetting",
      panel: [],
      teach: [],
      userAuthList: {},
    },
  },
  onLoad: function () {
    (e.default.Page.init(), login.login.getUserInfo(), wx.hideShareMenu());
    var ServicesIndex = wx.getStorageSync("QRcodeRed") || "";
    this.setData({
      QRcodeRed: ServicesIndex,
      userType: app.globalData.userInfo.type,
      userAuthList: app.userAuthList,
    });
  },
  onShow: function () {
    "type" === this.data.userType ? this.professorList() : this.hasPower();
  },
  toDetail: function (e) {
    var login = e.currentTarget.dataset.pagesDetail;
    wx.navigateTo({
      url: login,
    });
  },
  /**
   * 退出登录
   * 调用方：本页 wxml 的退出按钮
   * 入参：无
   * 传给谁：POST /api/v1/erp/auth/logout（frontend/scripts/route-snapshot.txt:1065
   *   auth_handler_session::logout，无请求体），本地作废统一交给
   *   libs/utils/checkToken.js 的 clearLoginFlag（清 apiGateway 会话快照与一次性 CSRF 令牌、
   *   清用户档案键并回登录页），本页不再手抄一份键清单
   * 存什么/存哪里：不写任何凭据键。原写法把 token 与 devToken 与 demoToken 与 productionToken 与
   *   loginToken 与 logoutFlag 当成登录痕迹来读写，而后端 LoginResponse 无 token 字段
   *   （backend/src/handlers/auth_handler.rs），这些键的落盘值永远是 undefined，
   *   重建 globalData 时再把它们读回来等于用空凭据冒充登录态；userRole 与 lastAccessShopId 与
   *   paramShopId 与 newShop 四键实测全仓零读方（复核见交付报告）
   * 判据一条：后端登出失败也照样作废旧会话，因为用户意图是退出，本地保留半截会话更危险；
   *   失败原因一律 toast 外显，不静默吞
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
  hasPower: function () {
    var e = this.data.userAuthList,
      login = [
        {
          title: "店铺设置",
          icon: "".concat(app.config.imgHost, "/img/customer/ic_dianpu@4.5x.png"),
          action: "shop",
        },
        {
          img: "".concat(app.config.imgHost, "/img/customer/ic_yhcard@4.5x.png"),
          title: "银行账户管理",
          showBorder: !0,
          action: "bankCard",
        },
        {
          img: "".concat(app.config.imgHost, "/img/customer/ic_yhcard@4.5x.png"),
          title: "收款码",
          showBorder: !0,
          action: "QRcode",
        },
        {
          img: "".concat(app.config.imgHost, "/img/customer/ic_zhanghao_svg.svg"),
          title: "账号与安全",
          showBorder: !1,
          action: "account",
        },
        {
          img: "".concat(app.config.imgHost, "/img/customer/ic_zhanghao_svg.svg"),
          title: "语言",
          showBorder: !1,
          action: "language",
        },
        {
          img: "".concat(app.config.imgHost, "/img/customer/ic_zhanghao_svg.svg"),
          title: "关于我们",
          showBorder: !1,
          action: "aboutUS",
        },
      ];
    (e["basic:shop:updateShop"] ||
      (t = login.filter(function (e) {
        return "shop" !== e.action;
      })),
      e["basic:user:subAccount"] ||
        (t = login.filter(function (e) {
          return "children" !== e.action;
        })),
      e["basic:bank:list"] ||
        (t = login.filter(function (e) {
          return "bankCard" !== e.action;
        })),
      this.setData({
        panel: login,
        teach: [],
      }));
  },
  professorList: function () {
    var e = [
      {
        img: "".concat(app.config.imgHost, "/img/customer/ic_zhanghao_svg.svg"),
        title: "账号与安全",
        showBorder: !1,
        action: "account",
      },
      {
        img: "".concat(app.config.imgHost, "/img/customer/ic_yijian_4X4.svg"),
        title: "意见反馈",
        showBorder: !0,
        action: "advice",
      },
    ];
    this.setData({
      panel: e,
    });
  },
  toDetailTap: function (e) {
    var login = e.currentTarget.dataset.action,
      ServicesIndex = {
        children: "/packageB/pages/personal-center/children/children",
        shop: "/packageB/pages/personal-center/edit-shop/edit-shop",
        myAddress: "/packageA/pages/demand/my-demand/address-manage/address-manage",
        bankCard: "/packageB/pages/personal-center/bank-card/bank-card",
        account: "/packageB/pages/personal-center/setting/accountsetting/accountsetting",
        study: "/packageB/pages/personal-center/use-teach/use-teach",
        touchVideo: "/packageB/pages/personal-center/teach-video/index",
        advice: "/packageB/pages/personal-center/setting/feedback/feedback",
        QRcode: "/packageB/pages/personal-center/setting/accountsetting/QR-code/index",
        aboutUS: "/packageC/pages/aboutUS/aboutUS",
        language: "/packageC/pages/language/language",
      };
    if ("QRcode" === login)
      return (
        console.log(app.globalData.userInfo.type),
        wx.setStorageSync("QRcodeRed", "QRcodeRed"),
        wx.navigateTo({
          url: ServicesIndex[login],
        }),
        void this.setData({
          QRcodeRed: "QRcodeRed",
        })
      );
    wx.navigateTo({
      url: ServicesIndex[login],
    });
  },
});
