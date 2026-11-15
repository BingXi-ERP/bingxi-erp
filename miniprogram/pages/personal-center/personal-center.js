var e = require("../../@babel/runtime/helpers/interopRequireDefault").default,
  mta_analysis = e(require("../../utils/mta_analysis.js")),
  isVisitor = e(require("../../libs/utils/isVisitor")),
  envConfig = e(require("../../envConfig.js")),
  app = getApp(),
  ServicesCenter = require("../../libs/services/ServicesCenter.js").servicesCenter,
  login = require("../../libs/utils/login.js").login,
  apiGateway = require("../../libs/utils/apiGateway.js"),
  util = require("../../libs/utils/util.js").utils;
Page({
  data: {
    comboData: null,
    iconDebug: "".concat(app.config.imgHost, "/img/customer/duibuIcon/icon/icon_debug.png"),
    isShowDebugBtn: !1,
    openShopStatus: "",
    openShopPopup: !1,
    userType: "",
    shopInfo: {},
    toolsBar: [],
    panel: [],
    panelMuen: [],
    redPointList: {},
    panelIconSize: {
      width: 36,
      height: 36,
    },
    nickName: "",
    fullName: "",
    defaultName: "欢迎使用秉羲工作台",
    defaultTitle: "请先登录/注册",
    avatar: "",
    userAuthList: {},
    userInfoList: {},
    icon: {
      invite: "".concat(app.config.imgHost, "/img/shareFile/invite.png"),
      contact: "".concat(app.config.imgHost, "/img/customer/duibuIcon/phone@2x.png"),
      boss: "".concat(app.config.imgHost, "/img/customer/duibuIcon/门店店长@2x.png"),
      worker: "".concat(app.config.imgHost, "/img/customer/duibuIcon/worker@2x.png"),
    },
  },
  onLoad: function () {
    var e = __wxConfig.envVersion;
    (this.setData({
      isShowDebugBtn: "release" !== e,
      userAuthList: app.userAuthList,
      customsPhoneNum: app.customsPhoneNum,
    }),
      mta_analysis.default.Page.init(),
      wx.hideShareMenu(),
      wx.login({
        success: function (e) {
          app.globalData.wxCode = e.code;
        },
      }));
  },
  onShow: function () {
    var e = this;
    // 原门读 storage 的 token 键：登录出参从不产 token，键永不存在，门恒假等于档案永不回读；
    // 判据换成 apiGateway.isLoggedIn()（读的是 auth/me 回读确认后写入的会话快照，是真判据）
    (apiGateway.isLoggedIn()
      ? this.getUserInfo().then(function () {
          var mta_analysis = util.addDefaultAvatar(app.globalData.userInfo.avatar),
            isVisitor = app.globalData.userInfo.type;
          (e.setData({
            avatar: mta_analysis,
            userType: isVisitor,
          }),
            "type" === isVisitor ? e.getProfessData() : e.getShopDetail());
        })
      : this.setData({
          avatar: util.addDefaultAvatar(app.globalData.userInfo.avatar),
          userType: 5,
        }),
      this.combo(),
      this.hasPower(),
      this.tabBar());
  },
  combo: function () {
    var e = this;
    ServicesCenter.combo().then(function (a) {
      0 === a.code &&
        e.setData({
          comboData: a.data,
        });
    });
  },
  openCombo: function () {
    var e = !!this.data.comboData && this.data.comboData.canPurchase;
    wx.navigateTo({
      url: "/packageA/pages/combo/combo?canPurchase=".concat(e),
    });
  },
  tabBar: function () {
    this.setData({
      active: "3",
    });
  },
  toDebug: function () {
    wx.reLaunch({
      url: "/packageDebug/pages/env/index",
    });
  },
  getUserInfo: function () {
    var e = this;
    return new Promise(function (a, t) {
      login
        .getUserInfo()
        .then(function (t) {
          (e.setData({
            userInfoList: t.data,
            openShopStatus: t.data.shopApplyStatus,
          }),
            a());
        })
        .catch(function () {
          t();
        });
    });
  },
  hasPower: function () {
    var e = this,
      mta_analysis = this.data.redPointList,
      isVisitor = [
        {
          name: "待审核",
          icon: "".concat(app.config.imgHost, "/img/customer/Icon_Dsh@2x.png"),
          action: "waitAudit",
          isNew: !1,
        },
        {
          name: "审核通过",
          icon: "".concat(app.config.imgHost, "/img/customer/Icon_Shtg@2x.png"),
          action: "audit",
          isNew: 1 == mta_analysis.passType,
        },
        {
          name: "审核失败",
          icon: "".concat(app.config.imgHost, "/img/customer/Icon_Shsb@2x.png"),
          action: "failAudit",
          isNew: 1 == mta_analysis.rejectType,
        },
      ];
    this.setData({
      toolsBar: isVisitor,
    });
    var ServicesCenter = [
        {
          img: "".concat(app.config.imgHost, "/img/customer/duibuIcon/equipment@2x.png"),
          title: "设备连接",
          showBorder: !0,
          action: "link",
          noAuth: !1,
          bgcolor: "linear-gradient( 180deg, #3E84F8 0%, #78ACFE 100%)",
        },
        {
          img: "".concat(app.config.imgHost, "/img/customer/duibuIcon/address@2x.png"),
          title: "地址管理",
          showBorder: !0,
          action: "myAddress",
          noAuth: !1,
          bgcolor: "linear-gradient( 180deg, #3AC478 0%, #65D497 100%)",
        },
        {
          title: "员工管理",
          img: "".concat(app.config.imgHost, "/img/customer/duibuIcon/account@2x.png"),
          action: "children",
          noAuth: !1,
          perm: "basic:user:subAccount",
          bgcolor: "linear-gradient( 180deg, #FF9C1A 0%, #F7B46E 100%)",
        },
      ],
      login = [
        {
          img: "".concat(app.config.imgHost, "/img/customer/duibuIcon/teach@2x.png"),
          title: "教学视频",
          showBorder: !0,
          action: "teach",
          noAuth: !0,
        },
        {
          img: "".concat(app.config.imgHost, "/img/customer/duibuIcon/setting@2x.png"),
          title: "设置",
          showBorder: !0,
          action: "option",
          noAuth: !1,
        },
        {
          img: "".concat(app.config.imgHost, "/img/customer/duibuIcon/service@2x.png"),
          title: "联系客服",
          showBorder: !0,
          action: "service",
          noAuth: !1,
        },
      ];
    // 判据单点：菜单可见性一律由 perms.js 依登录出参 permissions 计算；
    // 原实现在这里 filter 出 o 却把未过滤的 ServicesCenter setData 回去，
    // 权限筛选结果被整个丢弃，等于任何角色都看到全部入口（假门）。
    // 映射直接从 resCodeList 现算，不依赖首页 hasPower 先跑（冷启动直达本页同样成立）。
    // 注意：本函数下方有 var util 遮蔽，这里必须走 require 取 getResList。
    var authMap = require("../../libs/utils/util.js").utils.getResList(
      wx.getStorageSync("resCodeList")
    );
    app.userAuthList = authMap;
    e.setData({
      userAuthList: authMap,
    });
    o = ServicesCenter.filter(function (a) {
      return !a.perm || e.data.userAuthList[a.perm];
    });
    var util = wx.getStorageSync("mobile");
    // 演示账号特判，本地缓存手机号等于演示号时隐藏登录入口，演示号取自 envConfig.account.demoMobileNum 单点，改号只改那一枚
    ((envConfig.default.account.demoMobileNum != util && util) || login.splice(0, 1),
      this.setData({
        panel: o,
        panelMuen: login,
      }));
  },
  toEditInfo: function () {
    isVisitor.default.isVisitor().then(function (e) {
      wx.redirectTo({
        url: "/packageB/pages/personal-center/edit-info/edit-info",
      });
    });
  },
  toolsTap: function (e) {
    switch (e.currentTarget.dataset.action) {
      case "waitAudit":
        wx.navigateTo({
          url: "/packageA/pages/demand/my-demand/my-demand?myJoinTabIndex=1",
        });
        break;
      case "audit":
        wx.navigateTo({
          url: "/packageA/pages/demand/my-demand/my-demand?myJoinTabIndex=2",
        });
        break;
      case "failAudit":
        wx.navigateTo({
          url: "/packageA/pages/demand/my-demand/my-demand?myJoinTabIndex=3",
        });
    }
  },
  toDetailTap: function (e) {
    var mta_analysis = e.currentTarget.dataset,
      app = mta_analysis.action,
      ServicesCenter = mta_analysis.auth;
    // 原门 wx.getStorageSync("token") 恒假，只剩带 auth 标记的入口可走；凭 token 键判登录态
    // 属假判据，换成会话快照判据，auth 数据属性维持原语义
    if (apiGateway.isLoggedIn() || ServicesCenter)
      switch (app) {
        case "teach":
          wx.navigateTo({
            url: "/packageB/pages/personal-center/teach-video/index",
          });
          break;
        case "link":
          wx.navigateTo({
            url: "/packageB/pages/personal-center/device-connection/index",
          });
          break;
        case "option":
          isVisitor.default.isVisitor().then(function () {
            wx.navigateTo({
              url: "/packageB/pages/personal-center/setting/setting",
            });
          });
          break;
        case "myAddress":
          isVisitor.default.isVisitor().then(function () {
            wx.navigateTo({
              url: "/packageA/pages/demand/my-demand/address-manage/address-manage",
            });
          });
          break;
        case "children":
          isVisitor.default.isVisitor().then(function () {
            wx.navigateTo({
              url: "/packageB/pages/personal-center/children/children",
            });
          });
          break;
        case "advice":
          isVisitor.default.isVisitor().then(function () {
            wx.navigateTo({
              url: "/packageB/pages/personal-center/setting/feedback/feedback",
            });
          });
          break;
        case "service":
          break;
        case "demandOrder":
          wx.navigateTo({
            url: "/packageA/pages/demand/demand-order/index",
          });
      }
    else
      isVisitor.default.isVisitor().then(function (e) {
        wx.navigateTo({
          url: "/packageB/pages/personal-center/edit-info/edit-info",
        });
      });
  },
  closePopup: function () {
    this.setData({
      openShopPopup: !1,
    });
  },
  weapp: function () {
    console.log("click");
  },
  callServicePhone: function () {
    wx.makePhoneCall({
      phoneNumber: this.data.customsPhoneNum,
    });
  },
  getRedPoint: function () {
    var e = this;
    ServicesCenter.redPoint().then(function (a) {
      0 === a.code &&
        e.setData({
          redPointList: a.data,
        });
    });
  },
  getShopDetail: function () {
    this.setData({
      shopInfo: {
        shopName: app.globalData.userInfo.companyName,
        contacts: app.globalData.userInfo.phone,
      },
      userType: app.globalData.userInfo.type,
      nickName: app.globalData.userInfo.nickName,
      fullName: app.globalData.userInfo.fullName,
    });
  },
  getProfessData: function () {
    this.setData({
      userType: app.globalData.userInfo.type,
      nickName: app.globalData.userInfo.nickName,
      fullName: app.globalData.userInfo.fullName,
      "shopInfo.shopName": app.globalData.userInfo.shopName,
      "shopInfo.contacts": app.globalData.userInfo.mobile,
    });
  },
});
