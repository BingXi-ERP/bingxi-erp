var e = require("../../../@babel/runtime/helpers/interopRequireDefault").default,
  t = require("../../../@babel/runtime/helpers/defineProperty"),
  mta_analysis = e(require("../../../utils/mta_analysis.js")),
  util = require("../../../libs/utils/util"),
  s =
    (require("../../../libs/utils/cpcl-exp.js"),
    require("../../../libs/services/ServicesCard.js").servicesCard),
  app = getApp();
Page({
  data: {
    image: {
      topStaff: "".concat(app.config.imgHost, "/img/customer/duibuIcon/icon/chi2@2x.png"),
      leftStaff: "".concat(app.config.imgHost, "/img/customer/duibuIcon/icon/chi1@2x.png"),
      unSelect: "/assets/images/icon2nd/symbols-no-select.png",
      select: "/assets/images/icon2nd/symbols-select.png",
    },
    nowList: [],
    selectSortList: [],
    miniCodeImgPath: "",
    customColorImage: "",
    productId: "",
    count: 0,
    detailsData: {},
    input_val: 1,
    labelType: 0,
    remark: "",
    remarkLimit: 18,
    newPrintType: null,
    remarkFocus: !1,
    langType: "1",
    showLoading: !0,
    showCreateColorCard: !1,
    dateLayTime: 0,
    delaySetInterval: null,
    delImgIcon: "".concat(app.config.imgHost, "/img/customer/Icon_Delete.png?imageView2/2/w/50"),
  },
  onLoad: function (e) {
    mta_analysis.default.Page.init();
    var t = wx.getStorageSync("colorCaraSetting");
    ((t.isRepeatUpload = !1),
      this.setData({
        productId: t.productId,
        nowList: t,
        customColorImage: t.customColorImage ? util.utils.replImage(t.customColorImage, 300) : "",
      }),
      wx.hideShareMenu());
  },
  onShow: function () {
    wx.removeStorageSync("creterColor");
  },
  deleteImage: function (e) {
    var t = this;
    wx.showModal({
      title: "提示",
      content: "确定要删除此图片吗？",
      success: function (e) {
        if (e.confirm)
          t.setData({
            customColorImage: "",
            "nowList.isRepeatUpload": !1,
          });
        else if (e.cancel) return !1;
      },
    });
  },
  goodsColorImgTap: function (e) {
    var t = e.currentTarget.dataset.src;
    wx.previewImage({
      current: t,
      urls: [t],
    });
  },
  chooseImage: function (e) {
    var t = this;
    wx.chooseMedia({
      sourceType: ["camera", "album"],
      sizeType: ["compressed", "original"],
      count: 1,
      mediaType: ["image"],
      success: function (e) {
        setTimeout(function () {
          wx.showLoading({
            title: "上传中",
          });
        }, 500);
        var mta_analysis = 0;
        e.tempFiles.map(function (s) {
          wx.uploadFile({
            header: {
              "Content-Type": "multipart/form-data",
              Authorization: wx.getStorageSync("token"),
              terminalSource: 6,
              terminalType: 81,
            },
            formData: {
              type: 4,
            },
            url: "".concat(app.config.bingxiHost, "/app-api/oss/upload"),
            filePath: s.tempFilePath,
            name: "file",
            success: function (s) {
              try {
                var app = JSON.parse(s.data);
                if (0 === app.code) {
                  var n = app.data;
                  (t.setData({
                    customColorImage: util.utils.replImage(n, 300),
                    "nowList.customColorImage": n,
                    "nowList.isRepeatUpload": !0,
                  }),
                    t.onSubColorSettingData());
                } else
                  401 === app.code
                    ? wx.showToast({
                        icon: "none",
                        title: "token失效,请重新上传",
                      })
                    : wx.showToast({
                        icon: "none",
                        title: t.data.msg,
                      });
              } catch (e) {
                wx.showToast({
                  icon: "none",
                  title: "上传图片失败",
                });
              }
              (a += 1) &&
                mta_analysis === e.tempFiles.length &&
                setTimeout(function () {
                  (console.log("上传完成"), wx.hideLoading());
                }, 500);
            },
            fail: function (e) {},
          });
        });
      },
    });
  },
  onCloseCreateCard: function () {
    (clearInterval(this.data.delaySetInterval),
      this.setData({
        showCreateColorCard: !1,
        delaySetInterval: null,
      }),
      wx.navigateBack({
        delta: 1,
      }));
  },
  carterColorCard: function () {
    if (2 !== this.data.nowList.colorImage || this.data.customColorImage) {
      if (
        (wx.setStorageSync("creterColor", this.data.productId),
        2 === this.data.nowList.colorImage &&
          this.data.nowList.customColorImage &&
          this.data.nowList.isRepeatUpload)
      ) {
        var e = this;
        this.data.nowList.colorValCount > 0 &&
          (this.setData({
            showCreateColorCard: !0,
            dateLayTime: 3 * this.data.nowList.colorValCount,
          }),
          (this.data.delaySetInterval = setInterval(function () {
            (e.setData({
              dateLayTime: e.data.dateLayTime - 1,
            }),
              0 === e.data.dateLayTime && e.onCloseCreateCard());
          }, 1e3)));
      } else this.onCloseCreateCard();
    } else
      wx.showToast({
        title: "自定义图片不能为空",
        icon: "error",
      });
  },
  getColorCardDetails: function () {
    var e = this;
    wx.showLoading({
      title: "加载中",
    });
    var t = {
      productId: this.data.productId,
    };
    s.colorCardDetails(t).then(function (t) {
      if ((console.log("获取色卡设置信息"), console.log(t), 0 === t.code)) {
        var mta_analysis = t.data;
        e.setData({
          nowList: mta_analysis,
          labelType: mta_analysis.labelType,
        });
      }
      wx.hideLoading();
    });
  },
  inputgetName: function (e) {
    (this.setData({
      [e.currentTarget.dataset.name]: e.detail.value,
    }),
      this.onChangeSetting("remark", e.detail.value));
  },
  changeStatus: function (e) {
    var t,
      mta_analysis = this.data.nowList;
    switch (e.currentTarget.id) {
      case "shape":
        ((t = 1 == mta_analysis.shape ? 0 : 1), this.onChangeSetting("shape", t));
        break;
      case "shape2":
        ((t = 2 == mta_analysis.shape ? 0 : 2), this.onChangeSetting("shape", t));
        break;
      case "colorImage":
        ((t = 1 == mta_analysis.colorImage ? 0 : 1), this.onChangeSetting("colorImage", t));
        break;
      case "colorImage2":
        ((t = 2 == mta_analysis.colorImage ? 0 : 2), this.onChangeSetting("colorImage", t));
        break;
      case "showImageTwo":
        ((t = 1 == mta_analysis.showImageTwo ? 0 : 1), this.onChangeSetting("showImageTwo", t));
        break;
      case "showImageTwo2":
        ((t = 0 == mta_analysis.showImageTwo ? 1 : 0), this.onChangeSetting("showImageTwo", t));
        break;
      case "showQrcode":
        ((t = 1 == mta_analysis.showQrcode ? 0 : 1), this.onChangeSetting("showQrcode", t));
        break;
      case "showProductName":
        ((t = 1 == mta_analysis.showProductName ? 0 : 1),
          this.onChangeSetting("showProductName", t));
        break;
      case "showShelvesNumber":
        ((t = 1 == mta_analysis.showShelvesNumber ? 0 : 1),
          this.onChangeSetting("showShelvesNumber", t));
        break;
      case "showPrice":
        ((t = 1 == mta_analysis.showPrice ? 0 : 1), this.onChangeSetting("showPrice", t));
        break;
      case "showContacts":
        ((t = 1 == mta_analysis.showContacts ? 0 : 1), this.onChangeSetting("showContacts", t));
        break;
      case "showRemark":
        ((t = 1 == mta_analysis.showRemark ? 0 : 1), this.onChangeSetting("showRemark", t));
        break;
      case "showMaterial":
        ((t = 1 == mta_analysis.showMaterial ? 0 : 1), this.onChangeSetting("showMaterial", t));
        break;
      case "showGramWeight":
        ((t = 1 == mta_analysis.showGramWeight ? 0 : 1), this.onChangeSetting("showGramWeight", t));
        break;
      case "showClothWidth":
        ((t = 1 == mta_analysis.showClothWidth ? 0 : 1), this.onChangeSetting("showClothWidth", t));
        break;
      case "showClothEnough":
        ((t = 1 == mta_analysis.showClothEnough ? 0 : 1),
          this.onChangeSetting("showClothEnough", t));
    }
  },
  onSubColorSettingData: function () {
    var e = this;
    s.colorCardSetting(this.data.nowList).then(function (t) {
      0 === t.code && wx.setStorageSync("colorCaraSetting", e.data.nowList);
    });
  },
  onChangeSetting: function (e, t) {
    ((this.data.nowList[e] = t),
      this.setData({
        nowList: this.data.nowList,
      }),
      ("colorImage" !== e || 2 !== t || this.data.customColorImage) &&
        this.onSubColorSettingData());
  },
});
