var e = require("../../@babel/runtime/helpers/interopRequireDefault").default,
  t = (require("../../libs/services/ServicesUser"), require("../../libs/services/ServicesUserLog")),
  getWxInfo = e(require("../../libs/utils/getWxInfo")),
  isVisitor = e(require("../../libs/utils/isVisitor")),
  app = getApp(),
  util = require("../../libs/utils/util.js").utils;
Component({
  properties: {
    active: {
      type: String,
      value: "0",
    },
  },
  observers: {
    active: function (e) {
      this.setData({
        actived: e || 0,
      });
    },
  },
  data: {
    actived: 0,
    curUrl: "",
    tabBarList: [
      {
        pagePath: "/pages/index/index",
        iconPath: "/assets/images/tabbaricon/home1.png",
        selectedIconPath: "/assets/images/tabbaricon/home.png",
        text: "工作台",
        perm: "",
      },
      {
        pagePath: "/pages/order-create/offline/create",
        iconPath: "/assets/images/tabbaricon/order1.png",
        selectedIconPath: "/assets/images/tabbaricon/order.png",
        text: "开单",
        billing: !0,
        perm: "order:saveBilling",
      },
      {
        pagePath: "/pages/order/list/index",
        iconPath: "/assets/images/tabbaricon/sale1.png",
        selectedIconPath: "/assets/images/tabbaricon/sale.png",
        text: "销售单",
        perm: "order:manage",
      },
      {
        pagePath: "/pages/personal-center/personal-center",
        iconPath: "/assets/images/tabbaricon/my1.png",
        selectedIconPath: "/assets/images/tabbaricon/my.png",
        text: "个人中心",
        perm: "",
      },
    ],
    userAuthList: {},
  },
  pageLifetimes: {
    show: function () {
      this.hasPower();
    },
  },
  methods: {
    hasPower: function () {
      var e = wx.getStorageSync("resCodeList");
      ((app.userAuthList = util.getResList(e)),
        this.setData({
          userAuthList: app.userAuthList,
        }));
    },
    onChange: function (e) {},
    getUserTap: function () {
      getWxInfo.default.getWxCode().then(function () {
        app.globalData.wxCode;
      });
    },
    toPath: function (e) {
      var getWxInfo = this,
        util = e.currentTarget.dataset.index,
        n = e.currentTarget.dataset.item.pagePath,
        o = e.currentTarget.dataset.item.billing,
        c = getCurrentPages(),
        g = "/" + c[c.length - 1].route;
      (console.log(util, "tabIndex"),
        1 === util && t.servicesUserLog.setUserHandleLog(200),
        n !== g &&
          ((this.data.curUrl = g),
          this.setData({
            actived: util,
          }),
          o
            ? isVisitor.default.isVisitor().then(function (e) {
                if (!app.userAuthList["order:saveBilling"])
                  return (
                    wx.hideLoading(),
                    void wx.showToast({
                      title: "暂无权限",
                      icon: "none",
                    })
                  );
                wx.navigateTo({
                  url: n,
                  success: function () {
                    getWxInfo.getUserTap();
                  },
                });
              })
            : wx.switchTab({
                url: n,
                success: function () {
                  console.log("跳转成功");
                },
                fail: function (e) {
                  console.error("跳转失败:", e);
                },
              })));
    },
    getNewList: function () {
      this.setData({
        tabBarList: [
          {
            pagePath: "/pages/demand-square/demand-square",
            iconPath: "/assets/images/tabbaricon/Control_Tab_Icon_Demand_Normal@3x.png",
            selectedIconPath: "/assets/images/tabbaricon/Control_Tab_Icon_Demand_Normal@3x(1).png",
            text: "需求广场",
          },
          {
            pagePath: "/pages/personal-center/personal-center",
            iconPath: "/assets/images/tabbaricon/Control_Tab_Icon_Profile_Normal@3x.png",
            selectedIconPath: "/assets/images/tabbaricon/Control_Tab_Icon_Profile_Pressed@3x.png",
            text: "个人中心",
          },
        ],
      });
    },
  },
});
