var objectSpread2 = require("../../../@babel/runtime/helpers/objectSpread2"),
  login = require("../../../libs/utils/login"),
  a = (require("../../../libs/utils/util"), getApp()),
  ServicesShop = require("../../../libs/services/ServicesShop.js").servicesShop;
Page({
  data: {
    disable: !1,
    imageList: [],
    remoteImageFiles: [],
    icon: {
      listen: "".concat(a.config.imgHost, "/img/customer/duibuIcon/icon/listen.png"),
    },
    imagePre: [
      "".concat(a.config.rootHost, "/html/static/img/eg_shop_front.jpg"),
      "".concat(a.config.rootHost, "/html/static/img/eg_biz_license.jpg"),
    ],
    isLoadingPhoto: "",
    multiIndex: [0, 0],
    multiArray: [[], []],
    shiqu_area_id: "",
    cityList: [],
    shiquArr: "",
    region: [],
    region2: [],
    customItem: "全部",
    radiogroupitems: [
      {
        name: "0",
        value: "是",
        checked: !1,
      },
      {
        name: "1",
        value: "否",
        checked: !0,
      },
    ],
    getMark: !1,
    hideStoreInfo: !0,
    shopName: "",
    category: "",
    contacts: "",
    mobile: "",
    market: "",
    shopAddress: "",
    shopSize: "",
    salemanNum: "",
    storeStatus: 1,
    storeAddress: "",
    storeSize: "",
    storeWorkerNum: "",
    inviteCode: "",
    shopFrontImg: "",
    businessLicence: "",
    provinceId: "",
    cityId: "",
    areaId: "",
  },
  onLoad: function (e) {
    (wx.hideShareMenu(),
      this.getShopCategory(),
      this.setData({
        mobile: wx.getStorageSync("mobile"),
      }),
      this.getShopApply(),
      this.setData({
        inviteCode: e.inviteCode,
      }));
  },
  getShopApply: function () {
    var objectSpread2 = this,
      login = {};
    ((login.mobile = wx.getStorageSync("mobile")),
      ServicesShop.getShopApply(login).then(function (t) {
        0 == t.code
          ? (objectSpread2.data.remoteImageFiles.push(t.data.shopFrontImg),
            objectSpread2.setData({
              remoteImageFiles: objectSpread2.data.remoteImageFiles,
              shopName: t.data.shopName,
              category: t.data.category,
              contacts: t.data.contacts,
              "region[0]": t.data.shopProvince,
              "region[1]": t.data.shopCity,
              "region[2]": t.data.shopArea,
              shopAddress: t.data.shopAddress,
              id: t.data.id,
            }))
          : wx.showToast({
              title: t.msg,
              icon: "none",
            });
      }));
  },
  getShopCategory: function () {
    ServicesShop.allShopCategoryV2({}).then(function (e) {
      0 === e.code
        ? (getApp().globalData.categoriesList = e.data)
        : wx.showToast({
            title: e.msg,
            icon: "none",
          });
    });
  },
  input_val: function (e) {},
  previewImage: function (e) {
    wx.previewImage({
      current: this.data.imagePre[e.currentTarget.id],
      urls: this.data.imagePre,
    });
  },
  choseImage: function (e) {
    var login = this,
      ServicesShop = e.currentTarget.id;
    wx.chooseMedia({
      count: 1,
      sizeType: ["original", "compressed"],
      sourceType: ["album", "camera"],
      mediaType: ["image"],
      success: function (e) {
        e.tempFiles.map(function (e) {
          (wx.showLoading({
            title: "上传中",
          }),
            login.setData({
              isLoadingPhoto: 1,
            }),
            wx.uploadFile({
              header: {
                "Content-Type": "multipart/form-data",
              },
              formData: {},
              url: "".concat(a.config.bingxiHost, "/app-api/img/uploadV2"),
              filePath: e.tempFilePath,
              name: "picture",
              success: function (e) {
                try {
                  var a = JSON.parse(e.data);
                  0 == a.code
                    ? ((login.data.remoteImageFiles[ServicesShop] = a.data),
                      login.setData({
                        remoteImageFiles: login.data.remoteImageFiles,
                        isLoadingPhoto: 0,
                      }))
                    : 401 === a.code
                      ? wx.showToast({
                          icon: "none",
                          title: "token失效,请重新上传",
                        })
                      : (login.data.imageList.pop(),
                        login.setData({
                          imageList: login.data.imageList,
                        }),
                        wx.showToast({
                          icon: "none",
                          title: login.data.msg.result,
                        }));
                } catch (e) {
                  (login.data.imageList.pop(),
                    login.setData({
                      imageList: login.data.imageList,
                    }),
                    wx.showToast({
                      icon: "none",
                      title: "上传图片失败",
                    }));
                }
                wx.hideLoading();
              },
              fail: function (e) {
                (login.data.imageList.pop(),
                  login.setData({
                    imageList: login.data.imageList,
                  }),
                  wx.hideLoading(),
                  wx.showToast({
                    icon: "none",
                    title: "图片预览失败",
                  }));
              },
            }));
        });
      },
    });
  },
  getMarkList: function () {
    var objectSpread2 = this;
    ServicesShop.marketPlaceV2({}).then(function (t) {
      if (0 === t.code) {
        var a = [],
          ServicesShop = [];
        (t.data.map(function (e) {
          1 == e.level && (a.push(e), null != e.children && ServicesShop.push(e.name));
        }),
          objectSpread2.setData({
            multiArray: [ServicesShop, []],
            cityList: a,
            shiquArr: ServicesShop,
          }));
        var i = a[0].id;
        i && objectSpread2.searchClassInfo(i);
      } else
        wx.showToast({
          title: t.msg.result,
          icon: "none",
        });
    });
  },
  searchClassInfo: function (e) {
    var login = this;
    if (e) {
      this.setData({
        shiqu_area_id: e,
      });
      var a = [];
      login.data.cityList.forEach(function (t) {
        (t.id = e) &&
          null !== t.children &&
          t.children.forEach(function (e) {
            a.push(e);
          });
      });
      var ServicesShop = [];
      login.data.cityList.forEach(function (t) {
        null !== t.children &&
          t.children.forEach(function (t) {
            t.parentId == e && ServicesShop.push(t.name);
          });
      });
      var i = this.data.shiquArr;
      login.setData({
        multiArray: [i, ServicesShop],
        cityAreaArr: ServicesShop,
        cityAreaList: a,
      });
    }
  },
  bindMultiPickerChange: function (e) {
    this.setData({
      multiIndex: e.detail.value,
    });
  },
  bindMultiPickerColumnChange: function (e) {
    var login = Number(e.detail.value) + Number(1);
    ({
      multiArray: this.data.multiArray,
      multiIndex: this.data.multiIndex,
    }).multiIndex[e.detail.column] = login;
    var a,
      ServicesShop = this.data.default_shiqu_id;
    0 === e.detail.column &&
      (this.data.cityList[e.detail.value].children.map(function (e) {
        a = e.parentId;
      }),
      ServicesShop != a && this.searchClassInfo(Number(a)));
  },
  bindRegionChange: function (e) {
    this.setData({
      region: e.detail.value,
    });
  },
  bindRegionChange2: function (e) {
    this.setData({
      region2: e.detail.value,
    });
  },
  radioChange: function (t) {
    var a = t.currentTarget.dataset.item,
      ServicesShop = this.data.radiogroupitems.map(function (t) {
        return objectSpread2(
          objectSpread2({}, t),
          {},
          {
            checked: t.name === a,
          },
        );
      });
    this.setData({
      storeStatus: a,
      radiogroupitems: ServicesShop,
      hideStoreInfo: 1 == a,
    });
  },
  tocategories: function () {
    (wx.setStorageSync("categoriesString", this.data.category),
      wx.navigateTo({
        url: "/packageB/pages/personal-center/category/category",
      }));
  },
  showToast: function (e) {
    wx.showToast({
      title: e,
      icon: "none",
      duration: 1e3,
    });
  },
  formSubmit: function () {
    var objectSpread2 = this;
    0 !== this.data.region.length
      ? getAddressId(this.data.region).then(function (t) {
          (objectSpread2.setData({
            provinceId: t[0],
            cityId: t[1],
            areaId: t[2],
          }),
            objectSpread2.saveFormSubmit());
        })
      : this.saveFormSubmit();
  },
  saveFormSubmit: function (e) {
    var a = this,
      i = e.detail.value,
      s = i;
    ((s.storeStatus = a.data.storeStatus),
      (s.shopProvince = a.data.region[0]),
      (s.shopProvinceId = a.data.provinceId),
      (s.shopCity = a.data.region[1]),
      (s.shopCityId = a.data.cityId),
      (s.shopArea = a.data.region[2]),
      (s.shopAreaId = a.data.areaId),
      (s.inviteCode = a.data.inviteCode),
      (s.id = a.data.id),
      a.data.remoteImageFiles[0] && (s.shopFrontImg = a.data.remoteImageFiles[0]),
      a.data.remoteImageFiles[1] && (s.businessLicence = a.data.remoteImageFiles[1]),
      "" != i.shopName
        ? "" != i.category
          ? "" != i.contacts && "" != i.contacts
            ? "" != i.shopAddress
              ? "" != i.shopSize
                ? "" != i.salemanNum
                  ? "" != i.storeAddress || 0 != i.storeStatus
                    ? "" != i.storeSize || 0 != i.storeStatus
                      ? "" != i.storeWorkerNum || 0 != i.storeStatus
                        ? a.data.remoteImageFiles[0]
                          ? (0 == i.storeStatus &&
                              ((s.storeProvince = a.data.region2[0]),
                              (s.storeCity = a.data.region2[1]),
                              (s.storeArea = a.data.region2[2])),
                            ServicesShop.openShopApply(s).then(function (e) {
                              if ("" == e.data)
                                wx.navigateTo({
                                  url: "/pages/register/registered/registered",
                                });
                              else if (e.data) {
                                // 开店申请通过后回到登录页重新登录。
                                // 原先这里把后端返回体当 loginToken 塞进 POST /api/v1/erp/auth/login
                                // 做"申请后免密登录"，但后端 LoginRequest 只认 username 与 password
                                // 与可选 totp_token 与 recovery_code（backend/src/handlers/auth_handler.rs
                                // 的 LoginRequest），没有 loginToken 字段，全仓在册的 1821 条端点里也没有
                                // 任何签发该字段的入口（frontend/scripts/route-snapshot.txt），
                                // 那条腿必 400，属凭据冒充登录态的假接入，已退场；
                                // "开店申请通过后免密进入"这一功能面记入待拍板清单。
                                (wx.showToast({
                                  title: "提交成功，请重新登录",
                                  icon: "none",
                                }),
                                  wx.reLaunch({
                                    url: "/pages/register/login/login",
                                  }));
                              } else
                                (wx.showToast({
                                  icon: "none",
                                  title: e.msg.result,
                                }),
                                  wx.reLaunch({
                                    url: "/pages/register/login/login",
                                  }));
                            }))
                          : a.showToast("请上传档口门头")
                        : a.showToast("仓库员工数量不能为空")
                      : a.showToast("仓库面积不能为空")
                    : a.showToast("仓库详细地址不能为空")
                  : a.showToast("业务人员数量不能为空")
                : a.showToast("档口面积不能为空")
              : a.showToast("档口详细地址不能为空")
            : a.showToast("联系人不能为空")
          : a.showToast("主营类目不能为空")
        : a.showToast("店铺名称不能为空"));
  },
  onShow: function () {
    var objectSpread2 = wx.getStorageSync("categoriesString");
    ("" !== objectSpread2 &&
      this.setData({
        category: objectSpread2,
      }),
      "" !== wx.getStorageSync("exitOpenShopList") && this.changeOldOpenShopList(),
      this.getMarkList());
  },
  showPicker: function () {
    this.setData({
      getMark: !0,
    });
  },
  changeOldOpenShopList: function () {
    var objectSpread2 = this,
      login = wx.getStorageSync("exitOpenShopList");
    ("" != login.shopName &&
      objectSpread2.setData({
        shopName: login.shopName,
      }),
      "" != login.contacts &&
        objectSpread2.setData({
          contacts: login.contacts,
        }),
      "" != login.mobile &&
        objectSpread2.setData({
          mobile: login.mobile,
        }),
      "" != login.region &&
        objectSpread2.setData({
          region: login.region,
        }),
      "" != login.shopAddress &&
        objectSpread2.setData({
          shopAddress: login.shopAddress,
        }),
      "" != login.shopSize &&
        objectSpread2.setData({
          shopSize: login.shopSize,
        }),
      "" != login.salemanNum &&
        objectSpread2.setData({
          salemanNum: login.salemanNum,
        }),
      "" != login.storeStatus &&
        objectSpread2.setData({
          storeStatus: login.storeStatus,
        }),
      "" != login.storeAddress &&
        objectSpread2.setData({
          storeAddress: login.storeAddress,
        }),
      "" != login.storeSize &&
        objectSpread2.setData({
          storeSize: login.storeSize,
        }),
      "" != login.storeWorkerNum &&
        objectSpread2.setData({
          storeWorkerNum: login.storeWorkerNum,
        }),
      "" != login.shopFrontImg &&
        ((objectSpread2.data.remoteImageFiles[0] = login.shopFrontImg),
        objectSpread2.setData({
          remoteImageFiles: objectSpread2.data.remoteImageFiles,
        })),
      "" != login.businessLicence &&
        ((objectSpread2.data.remoteImageFiles[1] = login.businessLicence),
        objectSpread2.setData({
          remoteImageFiles: objectSpread2.data.remoteImageFiles,
        })),
      wx.removeStorageSync("exitOpenShopList"));
  },
  onUnload: function () {
    (wx.removeStorageSync("categoriesString"),
      wx.removeStorageSync("categoriesList"),
      wx.removeStorageSync("checkCategories"),
      wx.removeStorageSync("exitOpenShopList"));
  },
  onHide: function () {
    (wx.removeStorageSync("categoriesString"),
      wx.removeStorageSync("categoriesList"),
      wx.removeStorageSync("checkCategories"),
      wx.removeStorageSync("exitOpenShopList"));
  },
  chooseImage: function (e) {},
});
