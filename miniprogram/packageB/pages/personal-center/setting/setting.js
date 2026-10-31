var e = (0, require("../../../../@babel/runtime/helpers/interopRequireDefault").default)(
    require("../../../utils/mta_analysis.js"),
  ),
  login = require("../../../libs/utils/login"),
  ServicesIndex = require("../../../libs/services/ServicesIndex.js").ServicesIndex,
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
  loginout: function () {
    (wx.showLoading({
      title: "正在退出...",
    }),
      ServicesIndex.logout().then(function (e) {
        (wx.hideLoading(),
          0 === e.code
            ? (wx.setStorageSync("logoutFlag", 1),
              wx.removeStorageSync("token"),
              wx.removeStorageSync("devToken"),
              wx.removeStorageSync("testToken"),
              wx.removeStorageSync("uatToken"),
              wx.removeStorageSync("productionToken"),
              wx.removeStorageSync("wxId"),
              wx.removeStorageSync("wxOpenId"),
              wx.removeStorageSync("id"),
              wx.removeStorageSync("nickName"),
              wx.removeStorageSync("mobile"),
              wx.removeStorageSync("myShopId"),
              wx.removeStorageSync("resCodeList"),
              wx.removeStorageSync("userType"),
              wx.removeStorageSync("loginToken"),
              wx.removeStorageSync("avatar"),
              wx.removeStorageSync("logoutFlag"),
              wx.removeStorageSync("fullName"),
              (app.userAuthList = []),
              (app.statisticsCount = 0),
              (app.globalData = {
                userInfo: {},
                userOpenIdFlag: "",
                token: wx.getStorageSync("token"),
                loginToken: wx.getStorageSync("loginToken"),
                logoutFlag: wx.getStorageSync("logoutFlag"),
                mpVersion: "3.2.8",
                categoriesList: [],
                mobileInfo: {},
                formIds: [],
                inChannel: "",
                subChannel: "",
                wxId: "",
              }),
              wx.reLaunch({
                url: "/pages/register/login/login",
              }))
            : wx.showToast({
                title: e.msg,
                icon: "none",
              }));
      }));
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
