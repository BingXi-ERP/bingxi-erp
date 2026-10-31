var ServicesCenter = require("../../../libs/services/ServicesCenter.js").servicesCenter,
  ServicesUser = require("../../../libs/services/ServicesUser.js").servicesUser,
  app = getApp();
Page({
  data: {
    cameraImg: "".concat(app.config.imgHost, "/img/customer/duibuIcon/camera@2x.png"),
    avatar: "",
    nickName: "",
    mobile: "",
  },
  onShow: function () {
    var ServicesCenter = this;
    this.getUserInfo().then(function () {
      ServicesCenter.setData({
        avatar: app.globalData.userInfo.avatar,
        nickName: app.globalData.userInfo.nickName,
        mobile: app.globalData.userInfo.phone,
        shopName: app.globalData.userInfo.companyName,
      });
    });
  },
  changeAvatar: function () {
    var ServicesCenter = this;
    wx.chooseMedia({
      count: 1,
      sizeType: ["original", "compressed"],
      sourceType: ["album", "camera"],
      mediaType: ["image"],
      success: function (e) {
        (wx.showLoading({
          title: "头像上传中",
        }),
          wx.uploadFile({
            url: "".concat(app.config.bingxiHost, "/app-api/file/upload"),
            filePath: e.tempFiles[0].tempFilePath,
            name: "file",
            header: {
              "Content-Type": "multipart/form-data",
              Authorization: wx.getStorageSync("token"),
              terminalSource: 6,
              terminalType: 81,
            },
            formData: {
              filePath: "/bdd/head",
            },
            success: function (e) {
              var app = JSON.parse(e.data);
              (console.log(app),
                0 === app.code
                  ? (ServicesCenter.setData({
                      avatar: "".concat(app.data),
                      "icon.avatar": app.data,
                    }),
                    wx.hideLoading(),
                    wx.showToast({
                      title: "头像上传成功",
                    }),
                    ServicesCenter.formSubmit())
                  : (wx.hideLoading(),
                    wx.showToast({
                      title: e.msg.result,
                    })));
            },
          }));
      },
    });
  },
  changeNickName: function () {
    wx.navigateTo({
      url: "/packageB/pages/personal-center/edit-info-nickname/edit-info-nickname?nickName="
        .concat(this.data.nickName, "&avatar=")
        .concat(this.data.avatar),
    });
  },
  formSubmit: function () {
    var ServicesUser = this,
      o = {
        userId: app.globalData.userInfo.id,
        avatar: this.data.avatar,
        nickName: this.data.nickName,
      };
    ServicesCenter.updateUser(o).then(function (a) {
      0 === a.code
        ? ServicesUser.getUserInfo()
        : wx.showToast({
            title: a.msg.result,
            icon: "none",
          });
    });
  },
  getUserInfo: function () {
    return new Promise(function (a, t) {
      ServicesUser.getUserInfo({}).then(function (e) {
        0 === e.code
          ? ((getApp().globalData.userInfo = e.data),
            wx.setStorageSync("userRole", e.data.role),
            wx.setStorageSync("avatar", e.data.avatar),
            wx.setStorageSync("nickName", e.data.nickName),
            wx.setStorageSync("category", e.data.category),
            wx.setStorageSync("shopName", e.data.shopName),
            wx.setStorageSync("shopAddress", e.data.shopAddress),
            wx.setStorageSync("lastAccessShopId", e.data.lastAccessShopId),
            wx.setStorageSync("myShopId", e.data.shopId),
            wx.setStorageSync("mobile", e.data.mobile),
            wx.setStorageSync("telephone", e.data.telephone),
            wx.setStorageSync("loginToken", e.data.loginToken),
            wx.setStorageSync("logoutFlag", e.data.logoutFlag),
            wx.setStorageSync("wxId", e.data.wxId),
            wx.setStorageSync("wxOpenId", e.data.wxOpenId),
            a())
          : (wx.showToast({
              title: e.msg,
              icon: "none",
            }),
            a());
      });
    });
  },
});
