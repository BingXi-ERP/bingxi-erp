var t = require("../../../../@babel/runtime/helpers/interopRequireDefault").default,
  e = require("../../../../@babel/runtime/helpers/defineProperty"),
  a =
    (t(require("../../../utils/mta_analysis.js")),
    getApp(),
    require("../../../libs/services/ServicesUser").servicesUser);
Page({
  data: {
    selectedIndex: null,
    bankName: "",
    account: "",
    bankList: [],
    bankDetailedList: [],
    noChoice: "请选择",
  },
  onLoad: function () {
    this.bankList();
  },
  bankPickerChange: function (t) {
    this.setData({
      selectedIndex: t.detail.value,
    });
  },
  inputVal: function (t) {
    this.setData({
      [t.currentTarget.dataset.name]: t.detail.value,
    });
  },
  saveBankAccount: function () {
    if (this.data.accountName) {
      if (this.data.account) {
        if (this.data.account.length < 16 || this.data.account.length > 19)
          wx.showToast({
            title: "银行卡号长度必须在16到19之间",
            icon: "none",
          });
        else if (this.data.selectedIndex) {
          var t = {
            bankName: this.data.bankDetailedList[this.data.selectedIndex].bankName,
            account: this.data.account,
            cardNo: this.data.account,
            accountName: this.data.accountName,
            sortName: this.data.bankDetailedList[this.data.selectedIndex].sortName,
          };
          a.saveBankAccount([t]).then(function (t) {
            0 === t.code
              ? (wx.showToast({
                  title: "银行卡添加成功",
                  icon: "none",
                }),
                setTimeout(function () {
                  wx.navigateBack({
                    delta: 1,
                  });
                }, 500))
              : wx.showToast({
                  title: t.msg,
                  icon: "none",
                });
          });
        } else
          wx.showToast({
            title: "请选择银行",
            icon: "none",
          });
      } else
        wx.showToast({
          title: "请输入银行卡号",
          icon: "none",
        });
    } else
      wx.showToast({
        title: "请输入持卡人名称",
        icon: "none",
      });
  },
  bankList: function () {
    var t = this;
    a.bankList({
      pageNum: 1,
      pageSize: 100,
    }).then(function (e) {
      if (0 === e.code) {
        var a = e.data.content;
        a &&
          a.length > 0 &&
          (a.forEach(function (e) {
            t.data.bankList.push(e.bankName);
          }),
          t.setData({
            bankDetailedList: a,
            bankList: t.data.bankList,
          }));
      } else
        wx.showToast({
          title: e.msg,
          icon: "none",
        });
    });
  },
});
