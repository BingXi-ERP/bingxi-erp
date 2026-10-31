var e = require("../../../../../../@babel/runtime/helpers/interopRequireDefault").default,
  objectSpread2 = require("../../../../../../@babel/runtime/helpers/objectSpread2");
require("../../../../../../@babel/runtime/helpers/Arrayincludes");
var ServicesQRCode = require("../../../../../libs/services/ServicesQRCode.js"),
  dialog = e(require("../../../../../../miniprogram_npm/@vant/weapp/dialog/dialog")),
  app = getApp();
Page({
  data: {
    printImgIndex: 0,
    showImgList: [],
    curUploadType: "",
    codeImg: [
      {
        type: "wx",
        imgUrl: "",
        auditStatus: "null",
      },
      {
        type: "ali",
        imgUrl: "",
        auditStatus: "null",
      },
    ],
    icon: {
      tipsToMove: "".concat(app.config.imgHost, "/img/v2.8.0/tipsMove.png"),
      wxIcon: "".concat(app.config.imgHost, "/img/v2.12.0/weixinzhifu@2x.png"),
      aliPlay: "".concat(app.config.imgHost, "/img/v2.12.0/zhifubao@2x.png"),
      upload: "".concat(app.config.imgHost, "/img/customer/duibuIcon/upload@2x.png"),
      success: "".concat(app.config.imgHost, "/img/v2.12.0/Icon_Add_QRCode_Sucess@2x.png"),
      demoImg: "".concat(app.config.imgHost, "/img/customer/duibuIcon/qrcode@2x.png"),
    },
    isShowDelBtn: !1,
  },
  onLoad: function (e) {
    this.getCode();
  },
  showPopur: function () {
    this.setData({
      showDemo: !this.data.showDemo,
    });
  },
  changeSwiper: function (e) {
    var objectSpread2 = e.detail.current;
    this.setData({
      printImgIndex: objectSpread2,
      isShowDelBtn: !!this.data.codeImg[objectSpread2].id,
    });
  },
  onDelCode: function () {
    var e = this,
      objectSpread2 = 0 === this.data.printImgIndex ? "微信收款码" : "支付宝收款码";
    dialog.default
      .confirm({
        title: "温馨提示",
        message: "确认要删除".concat(objectSpread2, "吗？"),
      })
      .then(function () {
        var objectSpread2 = e.data.codeImg[e.data.printImgIndex].id;
        ServicesQRCode.ServicesQRCode.delMoneyCode(objectSpread2).then(function (t) {
          0 === t.code && e.getCode();
        });
      })
      .catch(function () {});
  },
  updateMoneyCode: function (e) {
    var objectSpread2 = this,
      dialog = this.data.curUploadType,
      n = {
        companyId: app.globalData.userInfo.companyId,
        type: "wx" === dialog ? 1 : 2,
        qrCodeUrl: e,
      };
    ServicesQRCode.ServicesQRCode.updateMoneyCode(n).then(function (e) {
      0 === e.code
        ? objectSpread2.getCode()
        : wx.showToast({
            title: e.msg,
            icon: "none",
          });
    });
  },
  uploadCode: function (e) {
    if ([3, 4].includes(app.globalData.userInfo.type)) {
      var objectSpread2 = e.currentTarget.dataset.type,
        ServicesQRCode = this;
      wx.showActionSheet({
        itemList: ["从相册中选择", "拍照"],
        success: function (e) {
          e.cancel ||
            (0 == e.tapIndex
              ? (ServicesQRCode.chooseWxImage("album"),
                ServicesQRCode.setData({
                  curUploadType: objectSpread2,
                }))
              : 1 == e.tapIndex &&
                (ServicesQRCode.chooseWxImage("camera"),
                ServicesQRCode.setData({
                  curUploadType: objectSpread2,
                })));
        },
      });
    } else
      wx.showToast({
        title: "无权限",
        icon: "none",
      });
  },
  chooseWxImage: function (e) {
    var objectSpread2 = this;
    this.data.showImgList;
    (setTimeout(function () {
      wx.showLoading({
        title: "上传中",
      });
    }, 500),
      wx.chooseMedia({
        count: 1,
        sizeType: ["original", "compressed"],
        sourceType: [e],
        mediaType: ["image"],
        success: function (e) {
          var ServicesQRCode = e.tempFiles[0].tempFilePath;
          (setTimeout(function () {
            (wx.showLoading({
              title: "上传中",
            }),
              console.log("上传中"));
          }, 500),
            console.log(ServicesQRCode),
            wx.uploadFile({
              url: "".concat(app.config.bingxiHost, "/app-api/file/upload"),
              filePath: ServicesQRCode,
              name: "file",
              header: {
                "Content-Type": "multipart/form-data",
                Authorization: wx.getStorageSync("token"),
                terminalSource: 6,
                terminalType: 81,
              },
              formData: {
                filePath: "/bdd/pay",
              },
              success: function (e) {
                var ServicesQRCode = JSON.parse(e.data);
                0 === ServicesQRCode.code
                  ? (console.log(e),
                    wx.hideLoading(),
                    objectSpread2.updateMoneyCode(ServicesQRCode.data),
                    setTimeout(function () {
                      wx.hideLoading();
                    }, 1500))
                  : (setTimeout(function () {
                      wx.hideLoading();
                    }, 500),
                    wx.showToast({
                      title: ServicesQRCode.msg.result,
                      icon: "none",
                    }));
              },
              fail: function () {
                (objectSpread2.setData({
                  curUploadType: "",
                }),
                  setTimeout(function () {
                    (wx.hideLoading(),
                      wx.showToast({
                        title: "上传失败",
                        icon: "none",
                      }));
                  }, 500));
              },
            }));
        },
        fail: function () {
          (wx.hideLoading(),
            objectSpread2.setData({
              curUploadType: "",
            }));
        },
      }));
  },
  getCode: function () {
    var e = this,
      dialog = this.data.codeImg;
    ServicesQRCode.ServicesQRCode.moneyCode().then(function (o) {
      if (0 === o.code) {
        var app = {
            type: "wx",
            imgUrl: "",
            auditStatus: "null",
          },
          n = {
            type: "ali",
            imgUrl: "",
            auditStatus: "null",
          };
        o.data &&
          o.data.forEach(function (e) {
            var ServicesQRCode = objectSpread2(
              objectSpread2({}, e),
              {},
              {
                imgUrl: e.qrCodeUrl || "",
                auditStatus: e.qrCodeUrl ? "1" : "null",
                type: 1 === e.type ? "wx" : "ali",
                id: e.id,
              },
            );
            1 === e.type ? (a = ServicesQRCode) : 2 === e.type && (n = ServicesQRCode);
          });
        var c = dialog.map(function (e) {
          return "wx" === e.type ? app : n;
        });
        e.setData({
          codeImg: c,
          isShowDelBtn: 0 === e.data.printImgIndex ? !!app.id : !!n.id,
        });
      }
    });
  },
});
