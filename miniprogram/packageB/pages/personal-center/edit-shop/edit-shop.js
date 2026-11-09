var e = require("../../../../@babel/runtime/helpers/interopRequireDefault").default,
  objectSpread2 = require("../../../../@babel/runtime/helpers/objectSpread2"),
  t = require("../../../../@babel/runtime/helpers/defineProperty"),
  mta_analysis = e(require("../../../utils/mta_analysis.js")),
  util = require("../../../utils/util"),
  getLocation = require("../../../libs/utils/getLocation"),
  ServicesCenter = require("../../../libs/services/ServicesCenter.js").servicesCenter,
  ServicesShop = require("../../../libs/services/ServicesShop.js").servicesShop,
  uploadGateway = require("../../../libs/utils/uploadGateway.js"),
  app = getApp();
Page({
  data: {
    toParams: "",
    updateReason: "",
    showChangeReason: !1,
    region: [],
    region2: [],
    regionCode: [],
    region2Code: [],
    isRepeat: !1,
    phoneHide: 0,
    phoneHide_second: 0,
    phoneHide_three: 0,
    faxHide: 0,
    faxHide_second: 0,
    shopList: "",
    backupList: "",
    telPhone: [],
    faxNo: [],
    autoFocus: !0,
    companyName: "",
    contacts: "",
    mobile: "",
    storeAddress: "",
    shopAddress: "",
    faxNo_delete0: "",
    faxNo_delete1: "",
    telephone_delete0: "",
    telephone_delete1: "",
    category: "",
    shopImg: "",
    bannerImg: "",
    icon: {
      avatar: "",
      rightArrow: "".concat(app.config.imgHost, "/img/customer/ic_jinru.png"),
      buleAdd: "".concat(app.config.imgHost, "/img/shareFile/Icon_Add_Blue@2x.png"),
      delete: "".concat(app.config.imgHost, "/img/customer/duibuIcon/icon2nd/deltel@2x.png"),
    },
    formParams: {
      logo: "",
      background: "",
      companyName: "",
      wechatId: "",
      contacts: "",
      phone: "",
      clusterNames: "",
      telephone: "",
      faxNo: "",
      addr: "",
      provinceId: "",
      cityId: "",
      areaId: "",
      warehouseAddr: "",
      warehouseProvinceId: "",
      warehouseCityId: "",
      warehouseAreaId: "",
    },
    multiArray: [],
    multiIndex: [0, 0, 0],
    type: 0,
  },
  /**
   * 选图并上传店铺 logo
   * 调用方：本页 wxml 的 logo 区
   * 入参：wx.chooseMedia 回调里的首个临时文件
   * 传给谁：libs/utils/uploadGateway.js 的 upload（内部由 apiGateway.requestContract 发出），
   *   不再直发 wx.uploadFile 也不自拼 Authorization 头——凭据是后端 httpOnly Cookie
   *   （backend/src/middleware/auth.rs），JS 侧 storage 里从来没有 token，
   *   空值与裸值都会被 auth.rs 判"无效的认证头格式"，这条头永远为假
   * 存什么/存哪里：只把返回的相对地址放进本页 data，不落任何凭据键
   * 待拍板一条：旧路径 /app-api/file/upload 在本仓权威面
   *   frontend/scripts/route-snapshot.txt（1821 条）内没有等价的通用图片上传端点
   *   （multipart 腿只有 user/avatar 与 supplier 资质附件 与 system-update/upload 与 data-import），
   *   故原样保留并登记，禁止改成会 404 的假接入；去向见交付报告待拍板清单
   */
  changeAvatar: function () {
    var e = this;
    wx.chooseMedia({
      count: 1,
      sizeType: ["original", "compressed"],
      sourceType: ["album", "camera"],
      mediaType: ["image"],
      success: function (a) {
        wx.showLoading({
          title: "头像上传中",
        });
        uploadGateway
          .upload({
            url: "".concat(app.config.bingxiHost, "/app-api/file/upload"),
            filePath: a.tempFiles[0].tempFilePath,
            name: "file",
            header: {
              terminalSource: 6,
            },
            formData: {
              filePath: "/bdd/head",
            },
          })
          .then(
            function (t) {
              wx.hideLoading();
              if (t && 0 === t.code) {
                e.setData({
                  "formParams.logo": t.data,
                });
                wx.showToast({
                  title: "头像上传成功",
                });
                return;
              }
              // 失败原因一律外显；原写法取 a.msg.result（把 msg 当对象再取 result）必抛 TypeError
              wx.showToast({
                title: (t && t.msg) || "头像上传失败",
                icon: "none",
              });
            },
            function (err) {
              wx.hideLoading();
              wx.showToast({
                title: (err && err.errMsg) || "头像上传失败",
                icon: "none",
              });
            },
          );
      },
    });
  },
  /**
   * 选图并上传店铺背景图
   * 调用方：本页 wxml 的背景图区
   * 入参：wx.chooseMedia 回调里的首个临时文件
   * 传给谁：libs/utils/uploadGateway.js 的 upload（经 apiGateway.requestContract），
   *   去掉自拼 Authorization 头与手工 Content-Type（multipart 的 boundary 由 wx.uploadFile 生成，
   *   写死无 boundary 的 multipart/form-data 会让后端解析不到文件字段）
   * 存什么/存哪里：只把返回的相对地址放进本页 data，不落任何凭据键
   * 待拍板一条：同 changeAvatar，旧路径 /app-api/file/upload 仓内无等价端点，原样保留并登记
   */
  changeBanner: function () {
    var e = this;
    wx.chooseMedia({
      count: 1,
      sizeType: ["original", "compressed"],
      sourceType: ["album", "camera"],
      mediaType: ["image"],
      success: function (a) {
        wx.showLoading({
          title: "图片上传中",
        });
        uploadGateway
          .upload({
            url: "".concat(app.config.bingxiHost, "/app-api/file/upload"),
            filePath: a.tempFiles[0].tempFilePath,
            name: "file",
            header: {
              terminalSource: 6,
            },
            formData: {
              filePath: "/bdd/head",
            },
          })
          .then(
            function (t) {
              wx.hideLoading();
              if (t && 0 === t.code) {
                e.setData({
                  "formParams.background": t.data,
                });
                wx.showToast({
                  title: "上传成功",
                });
                return;
              }
              wx.showToast({
                title: (t && t.msg) || "上传失败",
                icon: "none",
              });
            },
            function (err) {
              wx.hideLoading();
              wx.showToast({
                title: (err && err.errMsg) || "上传失败",
                icon: "none",
              });
            },
          );
      },
    });
  },
  choseType: function () {
    wx.navigateTo({
      url: "/pages/register/mainCategory/index?type=".concat(
        this.data.formParams.clusterNames,
        "&from=1",
      ),
    });
  },
  toShopDetail: function () {
    wx.navigateTo({
      url: "/packageB/pages/personal-center/edit-shop/shop-detail/shop-detail",
    });
  },
  setLocationId: function (e) {
    var objectSpread2 = this,
      t = arguments.length > 1 && void 0 !== arguments[1] ? arguments[1] : 1;
    0 !== e.length &&
      (0, getLocation.getAddressId)(e).then(function (e) {
        1 === t
          ? objectSpread2.setData({
              "formParams.provinceId": e[0],
              "formParams.cityId": e[1],
              "formParams.areaId": e[2],
            })
          : objectSpread2.setData({
              "formParams.warehouseProvinceId": e[0],
              "formParams.warehouseCityId": e[1],
              "formParams.warehouseAreaId": e[2],
            });
      });
  },
  bindRegionChange: function (e) {
    (console.log("picker发送选择改变，携带值为", e.detail.value),
      this.setData({
        region: e.detail.value,
      }),
      this.setLocationId(e.detail.value, 1));
  },
  bindRegionChange2: function (e) {
    (console.log("picker发送选择改变，携带值为", e.detail.value),
      this.setData({
        region2: e.detail.value,
      }),
      this.setLocationId(e.detail.value, 2));
  },
  addContact: function (e) {
    if (1 === e.currentTarget.dataset.type) {
      var objectSpread2 = this.data.telPhone;
      if (objectSpread2.length >= 3) return;
      (this.data.telPhone.push({
        name: "电话".concat(objectSpread2.length + 1),
        value: "",
      }),
        this.setData({
          telPhone: this.data.telPhone,
        }));
    } else {
      var t = this.data.faxNo;
      if (t.length >= 3) return;
      (this.data.faxNo.push({
        name: "传真".concat(t.length + 1),
        value: "",
      }),
        this.setData({
          faxNo: this.data.faxNo,
        }));
    }
  },
  removeContact: function (e) {
    var objectSpread2 = e.currentTarget.dataset.type,
      mta_analysis = e.currentTarget.dataset.item,
      util = 1 === objectSpread2 ? "telPhone" : "faxNo",
      getLocation = this.data[util],
      ServicesCenter = getLocation.findIndex(function (e) {
        return e.name === mta_analysis.name;
      });
    ServicesCenter > -1 &&
      (getLocation.splice(ServicesCenter, 1),
      getLocation.forEach(function (e, t) {
        e.name = 1 === objectSpread2 ? "电话".concat(t + 1) : "传真".concat(t + 1);
      }),
      this.setData({
        util: getLocation,
      }));
  },
  removePhone_three: function () {
    this.setData({
      phoneHide_three: 0,
    });
  },
  removePhone_first: function () {
    this.setData({
      phoneHide: 0,
    });
  },
  removePhone_second: function () {
    this.setData({
      phoneHide_second: 0,
    });
  },
  addFax: function () {
    (1 == this.data.faxHide &&
      this.setData({
        faxHide_second: 1,
      }),
      this.setData({
        faxHide: 1,
      }));
  },
  removeFax_first: function () {
    this.setData({
      faxHide: 0,
    });
  },
  removeFax_second: function () {
    this.setData({
      faxHide_second: 0,
    });
  },
  onLoad: function (e) {
    (mta_analysis.default.Page.init(), wx.hideShareMenu(), this.getShopId());
  },
  getShopCategory: function () {
    ServicesShop.allShopCategoryV2({}).then(function (e) {
      0 === e.code
        ? ((getApp().globalData.categoriesList = e.data), console.log())
        : wx.showToast({
            title: e.msg,
            icon: "none",
          });
    });
  },
  input_val: function (e) {
    var objectSpread2 = e.detail.value,
      mta_analysis = e.currentTarget.dataset.name,
      util = "formParams.".concat(mta_analysis);
    this.setData({
      util: objectSpread2,
    });
  },
  input_val2: function (e) {
    var objectSpread2 = e.currentTarget.dataset.type,
      mta_analysis = e.currentTarget.dataset.index,
      util = 1 === objectSpread2 ? "telPhone" : "faxNo";
    ((this.data[util][mta_analysis].value = e.detail.value),
      this.setData({
        util: this.data[util],
      }),
      console.log(e));
  },
  tocategories: function () {
    var e = this,
      objectSpread2 = {
        shopName: e.data.companyName,
        contacts: e.data.contacts,
        mobile: e.data.mobile,
        storeAddress: e.data.storeAddress,
        shopAddress: e.data.shopAddress,
        faxNo_delete0: e.data.faxNo_delete0,
        faxNo_delete1: e.data.faxNo_delete1,
        telephone_delete0: e.data.telephone_delete0,
        telephone_delete1: e.data.telephone_delete1,
        region: e.data.region,
      };
    (wx.setStorageSync("exitShopList", objectSpread2),
      wx.setStorageSync("categoriesString", e.data.shopList.category),
      wx.navigateTo({
        url: "/packageB/pages/personal-center/category/category",
      }));
  },
  onShow: function () {
    var e = wx.getStorageSync("categoryCache");
    e &&
      this.setData({
        "formParams.clusterNames": e,
      });
  },
  onHide: function () {
    (console.log("移除主营类目数据"),
      wx.removeStorageSync("categoriesList"),
      wx.removeStorageSync("checkCategories"));
  },
  onUnload: function () {
    (console.log("移除主营类目数据"),
      wx.removeStorageSync("categoriesString"),
      wx.removeStorageSync("categoriesList"),
      wx.removeStorageSync("checkCategories"),
      wx.removeStorageSync("exitShopList"),
      wx.removeStorageSync("categoryCache"));
  },
  onPullDownRefresh: function () {},
  onReachBottom: function () {},
  onShareAppMessage: function () {},
  getShopId: function () {
    var e = this,
      objectSpread2 = {
        id: app.globalData.userInfo.companyId,
      };
    if (objectSpread2.id) {
      var t = function (a, t) {
          var mta_analysis =
              1 === t
                ? ["province", "city", "area"]
                : ["warehouseProvince", "warehouseCity", "warehouseArea"],
            util = a[mta_analysis[0]]
              ? mta_analysis.map(function (e) {
                  return a[e];
                })
              : [];
          return (e.setLocationId(util, t), util);
        },
        mta_analysis = function (e, a) {
          return e
            ? null == e
              ? void 0
              : e.split(",").map(function (e, t) {
                  return {
                    name: "".concat(a).concat(t + 1),
                    value: e,
                  };
                })
            : [];
        };
      ServicesCenter.shopDetail2(objectSpread2).then(function (a) {
        0 === a.code
          ? (e.setData({
              formParams: a.data,
              "formParams.clusterNames":
                a.data.clusterNames && a.data.clusterNames.length > 0
                  ? a.data.clusterNames.join(",")
                  : "",
              region: t(a.data, 1),
              region2: t(a.data, 2),
              shopList: a.data,
              backupList: a.data,
              shopImg: util.utils.addDefaultAvatar(a.data.ownerHeadImg),
              bannerImg: a.data.bannerImg,
              telPhone: mta_analysis(a.data.telephone, "电话"),
              faxNo: mta_analysis(a.data.faxNo, "传真"),
            }),
            console.log(app.changeType),
            app.changeType)
          : wx.showToast({
              title: a.msg,
              icon: "none",
            });
      });
    }
  },
  changeOldShopList: function () {
    var e = this,
      objectSpread2 = wx.getStorageSync("exitShopList");
    ("" != objectSpread2.companyName &&
      e.setData({
        "shopList.companyName": objectSpread2.companyName,
      }),
      "" != objectSpread2.contacts &&
        e.setData({
          "shopList.contacts": objectSpread2.contacts,
        }),
      "" != objectSpread2.mobile &&
        e.setData({
          "shopList.mobile": objectSpread2.mobile,
        }),
      "" != objectSpread2.telephone_delete2 &&
        e.setData({
          "telPhone[2]": objectSpread2.telephone_delete2,
        }),
      "" != objectSpread2.telephone_delete1 &&
        e.setData({
          "telPhone[1]": objectSpread2.telephone_delete1,
        }),
      "" != objectSpread2.telephone_delete0 &&
        e.setData({
          "telPhone[0]": objectSpread2.telephone_delete0,
        }),
      "" != objectSpread2.telephone_delete1 &&
        e.setData({
          "faxNo[1]": objectSpread2.faxNo_delete1,
        }),
      "" != objectSpread2.telephone_delete0 &&
        e.setData({
          "faxNo[0]": objectSpread2.faxNo_delete0,
        }),
      "" != objectSpread2.shopAddress &&
        e.setData({
          "shopList.shopAddress": objectSpread2.shopAddress,
        }),
      "" != objectSpread2.storeAddress &&
        e.setData({
          "shopList.storeAddress": objectSpread2.storeAddress,
        }),
      wx.removeStorageSync("exitShopList"));
  },
  formSubmit: function (e) {
    console.log(e);
    var objectSpread2 = this;
    if (e.detail.value.companyName) {
      if (e.detail.value.contacts) {
        if (e.detail.value.phone) {
          var t, mta_analysis, util;
          ("",
            1 == objectSpread2.data.phoneHide && (t = e.detail.value.telephone_delete0),
            1 == objectSpread2.data.phoneHide_second && (o = e.detail.value.telephone_delete1),
            1 == objectSpread2.data.phoneHide_three && (n = e.detail.value.telephone_delete2),
            "undefined" != t &&
              "" != t &&
              null != t &&
              void 0 !== t &&
              (t = e.detail.value.telephone_delete0),
            "undefined" != mta_analysis &&
              "" != mta_analysis &&
              null != mta_analysis &&
              void 0 !== mta_analysis &&
              (o = e.detail.value.telephone_delete1),
            "undefined" != util &&
              "" != util &&
              null != util &&
              void 0 !== util &&
              (n = e.detail.value.telephone_delete2),
            "" != t && null != t
              ? "" != mta_analysis && null != mta_analysis
                ? "" != util && null != util
                  ? t + "," + mta_analysis + "," + util
                  : t + "," + mta_analysis
                : "" != util && null != util
                  ? t + "," + util
                  : t
              : "" != mta_analysis && null != mta_analysis
                ? "" != util && null != util
                  ? mta_analysis + "," + util
                  : mta_analysis
                : "" != util && null != util && util);
          var getLocation, ServicesCenter;
          if (
            (1 == objectSpread2.data.faxHide && (i = e.detail.value.faxNo_delete0),
            1 == objectSpread2.data.phoneHide_second && (s = e.detail.value.faxNo_delete1),
            "undefined" != getLocation &&
              "" != getLocation &&
              null != getLocation &&
              void 0 !== getLocation &&
              e.detail.value.faxNo_delete0,
            "undefined" != ServicesCenter &&
              "" != ServicesCenter &&
              null != ServicesCenter &&
              void 0 !== ServicesCenter &&
              e.detail.value.faxNo_delete1,
            null != getLocation && getLocation,
            null != ServicesCenter &&
              (null != getLocation ? getLocation + "," + ServicesCenter : ServicesCenter),
            !objectSpread2.data.isRepeat)
          ) {
            (objectSpread2.setData({
              isRepeat: !0,
            }),
              wx.showLoading({
                title: "编辑中",
              }));
            (e.detail.value.wechatNo,
              e.detail.value.companyName,
              e.detail.value.contacts,
              e.detail.value.mobile,
              e.detail.value.category,
              objectSpread2.data.region[0],
              objectSpread2.data.region[1],
              objectSpread2.data.region[2],
              e.detail.value.shopAddress,
              objectSpread2.data.region2[0],
              objectSpread2.data.region2[1],
              objectSpread2.data.region2[2],
              e.detail.value.storeAddress,
              objectSpread2.data.shopImg,
              objectSpread2.data.bannerImg);
            this.uploadData();
          }
        } else
          wx.showToast({
            icon: "none",
            title: "手机不能为空",
          });
      } else
        wx.showToast({
          icon: "none",
          title: "联系人不能为空",
        });
    } else
      wx.showToast({
        icon: "none",
        title: "档口名称不能为空",
      });
  },
  toEqual: function (e) {
    var objectSpread2 = this.data.backupList;
    for (var t in e) {
      if (!objectSpread2.hasOwnProperty(t)) return !1;
      if (!Object.is(e[t], objectSpread2[t])) return !1;
    }
    return !0;
  },
  uploadData: function () {
    var e = this,
      t = this,
      mta_analysis = this.data,
      util = mta_analysis.formParams,
      getLocation = mta_analysis.telPhone,
      ServicesShop = mta_analysis.faxNo,
      l = objectSpread2(
        objectSpread2({}, util),
        {},
        {
          id: app.globalData.userInfo.companyId,
          clusterNames: util.clusterNames ? util.clusterNames.split(",") : [],
          telephone:
            null == getLocation
              ? void 0
              : getLocation
                  .map(function (e) {
                    return e.value;
                  })
                  .join(","),
          faxNo:
            null == ServicesShop
              ? void 0
              : ServicesShop.map(function (e) {
                  return e.value;
                }).join(","),
        },
      );
    ServicesCenter.updateShop(l).then(function (a) {
      0 === a.code
        ? (wx.setStorageSync("shopAvatar", e.data.shopImg),
          wx.hideLoading(),
          wx.showToast({
            icon: "success",
            title: "提交成功",
          }),
          setTimeout(function () {
            (t.setData({
              isRepeat: !1,
            }),
              wx.hideLoading(),
              wx.navigateBack());
          }, 1800),
          wx.removeStorageSync("categoryCache"))
        : (t.setData({
            isRepeat: !1,
          }),
          wx.hideLoading(),
          wx.showToast({
            title: a.msg,
            icon: "none",
          }));
    });
  },
});
