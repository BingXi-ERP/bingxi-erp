var app = getApp();
Page({
  data: {
    mobile: "",
    roleList: [
      {
        role: "boss",
        img: "".concat(app.config.imgHost, "/img/customer/boss.png"),
        illustrate: "目前仅支持老板创建公司，员工请联系老板以便加入自己所在的公司。",
      },
      {
        role: "professer",
        img: "".concat(app.config.imgHost, "/img/customer/newprofesser.png"),
        illustrate:
          "不是老板，没有档口，怎么办？注册为面料专家立即赚补贴！踊跃回复需求广场需求，经采购商采纳后，即可获得丰厚补贴，随时提现，无门槛赚外快的同时，还能为档口带来更多订单。",
      },
    ],
  },
  topath: function (e) {
    var o = e.currentTarget.dataset.role,
      t = {
        boss: "/pages/register/writeApplyInfo/writeApplyInfo?mobile=".concat(this.data.mobile),
        professer: "/packageB/pages/register/register-professer/register-professer?mobile=".concat(
          this.data.mobile,
        ),
      };
    t[o] &&
      wx.navigateTo({
        url: t[o],
      });
  },
  onLoad: function (e) {
    var o = wx.getStorageSync("mobile");
    this.setData({
      mobile: o,
    });
  },
  onReady: function () {},
  onShow: function () {},
  onHide: function () {},
  onUnload: function () {},
  onPullDownRefresh: function () {},
  onReachBottom: function () {},
  onShareAppMessage: function () {},
});
