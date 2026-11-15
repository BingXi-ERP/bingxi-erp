var ServicesShop = require("../../../libs/services/ServicesShop"),
  login = require("../../../libs/utils/login"),
  app = getApp();
Page({
  data: {
    userInfo: {},
    chooseList: [],
    hasList: [],
  },
  getHasList: function (e) {
    var login = String(e.detail.hasList);
    this.setData({
      hasList: login,
    });
  },
  getWxCode: function () {
    return new Promise(function (e, o) {
      wx.login({
        success: function (n) {
          n.code ? e(n.code) : o();
        },
      });
    });
  },
  comfirm: function (t) {
    var i = this,
      s = this.data.userInfo,
      a = s.region,
      r = s.userName,
      c = s.shopName,
      u = s.address,
      g = s.mobile,
      h = wx.getStorageSync("inviteUserId");
    this.getWxCode().then(function (t) {
      var s = {
        mobile: g,
        nickName: r,
        shopName: c,
        shopProvince: a[0],
        shopCity: a[1],
        shopArea: a[2],
        shopAddress: u,
        category: i.data.hasList,
        inviteUserId: h || "0",
        channel: app.globalData.inChannel,
        subChannel: app.globalData.subChannel,
        wxCode: t,
        wxId: app.globalData.wxId,
      };
      ServicesShop.servicesShop.postProfessorData(s).then(function (e) {
        if (0 == e.code) {
          (wx.showToast({
            title: "提交成功",
            icon: "success",
            image: "".concat(
              app.config.imgHost,
              "/img/customer/duibuIcon/icon/icon_successful.png",
            ),
          }),
            wx.removeStorageSync("inviteUserId"),
            (app.globalData.wxId = ""));
          // 申请提交成功后一律回到登录页重新登录。
          // 原先这里把后端返回体当 loginToken 塞进 POST /api/v1/erp/auth/login 做"注册后免密登录"，
          // 但后端 LoginRequest 只认 username 与 password 与可选 totp_token 与 recovery_code
          // （backend/src/handlers/auth_handler.rs 的 LoginRequest），没有 loginToken 字段，
          // 全仓也没有签发该字段的端点（frontend/scripts/route-snapshot.txt 1821 条内 grep loginToken
          // 零命中），那条腿必 400，属凭据冒充登录态的假接入，已按本文件原有的"请重新登录"分支退场；
          // "供货商申请通过后免密进入"这一功能面记入待拍板清单。
          (wx.showToast({
            title: "请重新登录",
            icon: "none",
          }),
            wx.reLaunch({
              url: "/pages/register/login/login",
            }));
        } else
          wx.showToast({
            title: e.data.msg,
            icon: "",
          });
      });
    });
  },
  getCategory: function () {
    var login = this;
    ServicesShop.servicesShop.getProfessorCategory().then(function (e) {
      var app = e.data.map(function (e) {
        return {
          title: e,
          isChoose: !1,
        };
      });
      login.setData({
        chooseList: app,
      });
    });
  },
  onLoad: function (e) {
    var login = JSON.parse(e.info);
    this.setData({
      userInfo: login,
    });
  },
  onReady: function () {},
  onShow: function () {
    this.getCategory();
  },
  onHide: function () {
    wx.removeStorageSync("mobile");
  },
  onUnload: function () {
    wx.removeStorageSync("mobile");
  },
  onPullDownRefresh: function () {},
  onReachBottom: function () {},
  onShareAppMessage: function () {},
});
