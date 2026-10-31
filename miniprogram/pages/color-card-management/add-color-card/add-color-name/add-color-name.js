getApp();
var ServicesCard = require("../../../../libs/services/ServicesCard.js").servicesCard;
Page({
  data: {
    colorColorListName: [],
    colorColorListNames: [],
    showAddColorName: 0,
    colorName: "",
    checkId: "",
    checkItem: "",
  },
  onLoad: function (t) {
    wx.hideShareMenu();
  },
  onReady: function () {},
  onShow: function () {
    (this.getList(), this.getList2());
    var ServicesCard = wx.getStorageSync("colorColorItem");
    ((this.data.checkId = ServicesCard.colorName),
      this.setData({
        checkId: this.data.checkId,
        checkItem: ServicesCard,
      }),
      wx.removeStorageSync("colorColorItem"));
  },
  getList: function () {
    wx.showLoading({
      title: "数据加载中...",
    });
    var ServicesCard = {
      type: 0,
      token: wx.getStorageSync("token"),
    };
    this.getColorName(ServicesCard);
  },
  getList2: function () {
    wx.showLoading({
      title: "数据加载中...",
    });
    var ServicesCard = {
      type: 1,
      token: wx.getStorageSync("token"),
    };
    this.getColorName(ServicesCard);
  },
  getColorName: function (o) {
    var e = this;
    ServicesCard.ColorCardNameList(o).then(function (t) {
      0 === t.code
        ? (console.log(t.data),
          wx.hideLoading(),
          1 == o.type
            ? e.setData({
                colorColorListNames: t.data,
              })
            : e.setData({
                colorColorListName: t.data,
              }))
        : wx.showToast({
            title: t.msg.result,
            icon: "none",
          });
    });
  },
  checkColorName: function (t) {
    this.data.checkId == t.currentTarget.dataset.item.colorName
      ? this.setData({
          checkId: "",
          checkItem: "",
        })
      : (console.log(t.currentTarget.dataset.item),
        (this.data.checkId = t.currentTarget.dataset.item.colorName),
        (this.data.checkItem = t.currentTarget.dataset.item),
        this.setData({
          checkId: this.data.checkId,
          checkItem: this.data.checkItem,
        }));
  },
  colorNameAdd: function () {
    var o = this,
      e = {
        colorName: o.data.colorName,
      };
    ServicesCard.addColorCardName(e).then(function (t) {
      0 === t.code
        ? (wx.hideLoading(),
          wx.showToast({
            title: "新增成功",
            icon: "success",
          }),
          o.getList2())
        : wx.showToast({
            title: t.msg.result,
            icon: "none",
          });
    });
  },
  onHide: function () {},
  onUnload: function () {},
  sureColorName: function () {
    "" != this.data.checkItem
      ? (wx.setStorageSync("checkColorItem", this.data.checkItem),
        wx.navigateBack({
          delta: 1,
        }))
      : wx.showToast({
          title: "请选择颜色",
          icon: "none",
        });
  },
  delName: function (t) {
    var o = this;
    wx.showModal({
      title: "",
      content: "确认删除该颜色？",
      confirmColor: "#FF6065",
      success: function (e) {
        e.confirm ? o.colorNameDel(t) : e.cancel && console.log("用户点击取消");
      },
    });
  },
  colorNameDel: function (o) {
    var e = this;
    ServicesCard.delColorCardName(o.currentTarget.id).then(function (t) {
      0 === t.code
        ? (wx.hideLoading(),
          wx.showToast({
            title: "删除成功",
            icon: "success",
          }),
          e.getList2())
        : wx.showToast({
            title: t.msg.result,
            icon: "none",
          });
    });
  },
  addColorNameModal: function () {
    this.setData({
      showAddColorName: 1,
    });
  },
  addColorName: function (t) {
    ((this.data.colorName = t.detail.value),
      this.setData({
        colorName: this.data.colorName,
      }));
  },
  cancelAdd: function () {
    this.setData({
      showAddColorName: 0,
    });
  },
  sureAddName: function () {
    this.setData({
      showAddColorName: 0,
    });
    var ServicesCard = [];
    (this.data.colorColorListName.map(function (o) {
      ServicesCard.push(o.colorName);
    }),
      this.data.colorColorListNames.length > 0 &&
        this.data.colorColorListNames.map(function (o) {
          ServicesCard.push(o.colorName);
        }),
      -1 == ServicesCard.indexOf(this.data.colorName)
        ? this.colorNameAdd()
        : wx.showToast({
            title: "该颜色已存在",
            icon: "none",
          }));
  },
});
