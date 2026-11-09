var t = (0, require("../../../@babel/runtime/helpers/interopRequireDefault").default)(
    require("../../../utils/mta_analysis.js"),
  ),
  login = require("../.../../../../libs/utils/login"),
  app = getApp();
Page({
  data: {
    userAuthList: {},
    shopId: null,
    backImg: "".concat(app.config.imgHost, "/img/customer/index-block-bg3.png"),
    panel: [
      {
        img: "".concat(
          app.config.imgHost,
          "/img/customer/duibuIcon/icon/Icon_DataCenter_Sales@2x.png",
        ),
        title: "销售报表",
        subTitle: "最近销售业绩统计",
        showBorder: !0,
        customerType: 1,
        auth: app.userAuthList["stat:summary"] || app.userAuthList["stat:summary:person"],
      },
      {
        img: "".concat(app.config.imgHost, "/img/customer/Icon_DataCenter_Color_Card@2x.png"),
        title: "色卡数据",
        subTitle: "最近色卡领取统计",
        showBorder: !0,
        customerType: 2,
        auth: app.userAuthList["stat:goods:data"],
      },
      {
        img: "".concat(app.config.imgHost, "/img/customer/Icon_DataCenter_PV@2x.png"),
        title: "访问分析",
        subTitle: "线上店铺和商品访问量统计",
        showBorder: !0,
        customerType: 3,
        auth: app.userAuthList["stat:customer:data"],
      },
      {
        img: "".concat(app.config.imgHost, "/img/customer/Icon_DataCenter_Color_Card@2x.png"),
        title: "放货数据",
        subTitle: "店铺放货搜索数统计",
        showBorder: !0,
        customerType: 5,
        auth: app.userAuthList["release:cargo:pass:data"],
      },
      {
        img: "".concat(app.config.imgHost, "/img/customer/Icon_DataCenter_PV@2x.png"),
        title: "产品销售",
        subTitle: "店铺各产品销售销售情况统计",
        showBorder: !0,
        customerType: 6,
        auth: app.userAuthList["stat:goods:markting"],
      },
    ],
  },
  onLoad: function (o) {
    (t.default.Page.init(),
      login.login.getUserInfo(),
      this.setData({
        shopId: o.shopId,
        userAuthList: app.userAuthList,
      }));
  },
  onReady: function () {},
  onShow: function () {},
  onHide: function () {},
  onUnload: function () {},
  onPullDownRefresh: function () {},
  onReachBottom: function () {},
  onShareAppMessage: function () {},
  toCustomDetail: function (t) {
    var login = t.detail.customertype;
    (console.log(login),
      1 == login
        ? wx.navigateTo({
            url: "/packageA/pages/new-data-center/sale-reports/sale-reports",
          })
        : 2 == login
          ? wx.navigateTo({
              url: "/packageA/pages/new-data-center/color-card-data/color-card-data?shopId=".concat(
                this.data.shopId,
              ),
            })
          : 3 == login
            ? wx.navigateTo({
                url: "/packageA/pages/new-data-center/visit-analysis/visit-analysis?shopId=".concat(
                  this.data.shopId,
                ),
              })
            : 4 == login
              ? wx.navigateTo({
                  url: "/packageA/pages/new-data-center/customer-balance-due/customer-balance-due?shopId=".concat(
                    this.data.shopId,
                  ),
                })
              : 5 == login
                ? wx.navigateTo({
                    url: "/packageA/pages/new-data-center/cargo-pass-data/cargo-pass-data?shopId=".concat(
                      this.data.shopId,
                    ),
                  })
                : 6 == login &&
                  wx.navigateTo({
                    url: "/packageA/pages/new-data-center/marketing/marketing",
                  }));
  },
  formSubmit: function (t) {
    (console.log(111), console.log(t));
  },
});
