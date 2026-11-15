var t = (0, require("../../../../@babel/runtime/helpers/interopRequireDefault").default)(
    require("../../../utils/bankData"),
  ),
  app = getApp(),
  ServicesUser = require("../../../libs/services/ServicesUser").servicesUser;
Page({
  data: {
    type: "",
    icon: {
      delete: "".concat(app.config.imgHost, "/img/customer/duibuIcon/icon2nd/deltel@2x.png"),
      bank: "".concat(app.config.imgHost, "/img/customer/bank/"),
    },
    bankAccountInfo: {
      accountList: [],
    },
  },
  onShow: function () {
    this.bankAccountList();
  },
  cator: function () {
    this.setData({
      type: "editor" == this.data.type ? "" : "editor",
    });
  },
  addBankCard: function () {
    wx.navigateTo({
      url: "/packageB/pages/personal-center/add-bank-card/add-bank-card",
    });
  },
  deleteBankCard: function (t) {
    var app = this,
      c = t.currentTarget.dataset.pickerindex,
      o = t.currentTarget.dataset.id || null;
    wx.showModal({
      title: "删除银行卡账户",
      content: "您确定要删除“".concat(t.currentTarget.dataset.card, "”账户信息？"),
      success: function (t) {
        t.confirm
          ? (app.data.bankAccountInfo.accountList.splice(c, 1),
            app.setData({
              type: 0 == app.data.bankAccountInfo.accountList.length ? "" : app.data.type,
              "bankAccountInfo.accountList": app.data.bankAccountInfo.accountList,
            }),
            o &&
              ServicesUser.delBankAccount({
                id: o,
              }))
          : t.cancel && console.log("用户点击取消");
      },
    });
  },
  bankAccountList: function () {
    var app = this;
    (wx.showLoading(),
      ServicesUser.bankAccountList({}).then(function (n) {
        (wx.hideLoading(),
          0 === n.code
            ? (n.data && n.data.length > 0 && (app.data.bankAccountInfo.accountList = n.data),
              app.data.bankAccountInfo.accountList &&
                app.data.bankAccountInfo.accountList.length > 0 &&
                (app.data.bankAccountInfo.accountList.forEach(function (n, c) {
                  ((n.account =
                    n.account.slice(0, 4) +
                    " " +
                    n.account.slice(4, 8) +
                    " " +
                    n.account.slice(8, 12) +
                    " " +
                    n.account.slice(12, 16) +
                    " " +
                    n.account.slice(16)),
                    t.default.forEach(function (t, o) {
                      (n.bankName != t.name && n.shortName != t.shortName) ||
                        ((app.data.bankAccountInfo.accountList[c].icon = t.icon),
                        (app.data.bankAccountInfo.accountList[c].color = t.color));
                    }));
                }),
                app.setData({
                  bankAccountInfo: app.data.bankAccountInfo,
                })))
            : wx.showToast({
                title: n.msg,
                icon: "none",
              }));
      }));
  },
});
