var e = (0, require("../../../../../@babel/runtime/helpers/interopRequireDefault").default)(
    require("../../../../../utils/mta_analysis.js"),
  ),
  ServicesUser = require("../../../../libs/services/ServicesUser.js").servicesUser,
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
  getUserInfo: function () {
    return new Promise(function (e, n) {
      ServicesUser.getUserInfo({})
        .then(function (t) {
          0 === t.code
            ? ((app.globalData.userInfo = t.data),
              wx.setStorageSync("userRole", t.data.roleName),
              wx.setStorageSync("lastAccessShopId", t.data.lastAccessShopId),
              wx.setStorageSync("myShopId", t.data.companyId),
              wx.setStorageSync("loginToken", t.data.loginToken),
              wx.setStorageSync("logoutFlag", t.data.logoutFlag),
              wx.setStorageSync("wxId", t.data.wechatId),
              wx.setStorageSync("wxOpenId", t.data.wxOpenId),
              e(t.data))
            : (wx.showToast({
                title: t.msg,
                icon: "none",
              }),
              e());
        })
        .catch(function (e) {
          (console.log(e), n(e));
        });
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
          wxId: t.wechatId,
        }));
    });
  },
});
