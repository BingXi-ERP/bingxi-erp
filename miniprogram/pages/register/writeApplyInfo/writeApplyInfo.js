var e = require("../../../@babel/runtime/helpers/defineProperty"),
  app = getApp(),
  ServicesShop = require("../../../libs/services/ServicesShop.js").servicesShop,
  global = require("../../../libs/services/global.js"),
  o = global.getProvince,
  n = global.getCity,
  s = global.getArea;
Page({
  data: {
    category: "",
    imagePre: [
      "".concat(app.config.imgHostFile, "/bdd/xcx/illustration.jpg"),
      "".concat(app.config.rootHost, "/html/static/img/eg_biz_license.jpg"),
    ],
    region: [],
    regionCode: [],
    icon: {
      hi: "".concat(app.config.imgHost, "/img/customer/bg_hi.svg"),
    },
    shopName: "",
    contacts: "",
    shopAddress: "",
    mobile: null,
    remoteImageFiles: [],
    licenseImageFiles: [],
    banSubmit: !1,
    isProfessor: !1,
    cascaderValue: "",
    showArea: !1,
    areaOptions: [],
    fieldNames: {
      text: "name",
      value: "id",
      children: "children",
    },
  },
  onLoad: function (e) {
    if (e.userInfo) {
      var app = getApp().globalData.userInfo;
      this.getUserInfo(app);
    }
    (this.setData({
      mobile: e.mobile,
      isProfessor: !!e.isProfessor,
    }),
      this.shopApplyLog(),
      this.getProvinceData());
  },
  onShow: function () {
    var e = wx.getStorageSync("categoryCache");
    this.setData({
      category: e,
    });
  },
  onUnload: function () {
    wx.removeStorageSync("categoryCache");
  },
  getProvinceData: function () {
    var e = this;
    o().then(function (t) {
      if (0 === t.code) {
        var ServicesShop = t.data.slice(0, 34);
        (ServicesShop.forEach(function (e) {
          e.children = [];
        }),
          e.setData({
            areaOptions: ServicesShop,
          }));
      }
    });
  },
  onShowSelectArea: function () {
    this.setData({
      showArea: !0,
    });
  },
  onAreaClose: function () {
    this.setData({
      showArea: !1,
    });
  },
  onAreaChange: function (t) {
    var ServicesShop = this,
      global = t.detail,
      o = global.value,
      r = global.selectedOptions,
      c = global.tabIndex,
      d = this.data.areaOptions;
    switch (c) {
      case 0:
        var g = d.findIndex(function (e) {
          return e.id === o;
        });
        n(o).then(function (t) {
          if (0 === t.code) {
            var global = t.data;
            (global.forEach(function (e) {
              e.children = [];
            }),
              ServicesShop.setData({
                ["areaOptions[".concat(g, "].children")]: global,
              }));
          }
        });
        break;
      case 1:
        var l = r[0].id,
          h = d.find(function (e) {
            return e.id === l;
          }),
          u = d.findIndex(function (e) {
            return e.id === l;
          }),
          m = r[1].id,
          f = h.children.findIndex(function (e) {
            return e.id === m;
          });
        s(o).then(function (t) {
          if (0 === t.code) {
            var global = t.data;
            ServicesShop.setData({
              ["areaOptions[".concat(u, "].children[").concat(f, "].children")]: global,
            });
          }
        });
    }
  },
  choseCategory: function (e) {
    var app = wx.getStorageSync("categoryCache");
    wx.navigateTo({
      url: "/pages/register/mainCategory/index?type=".concat(app),
    });
  },
  onAreaFinish: function (e) {
    var app = e.detail.selectedOptions;
    this.setData({
      region: [app[0].name, app[1].name, app[2].name],
      regionCode: [app[0].id, app[1].id, app[2].id],
      showArea: !1,
    });
  },
  getWxCode: function () {
    return new Promise(function (e, t) {
      wx.login({
        success: function (a) {
          a.code ? e(a.code) : t();
        },
      });
    });
  },
  formSubmit: function () {
    var e = this;
    "" != e.data.shopName
      ? "" != e.data.contacts
        ? this.data.region && 0 !== this.data.region.length
          ? "" != e.data.shopAddress
            ? this.saveFormSubmit()
            : wx.showToast({
                title: "详细地址不能为空",
                icon: "none",
              })
          : wx.showToast({
              title: "请选择所在地区",
              icon: "none",
            })
        : wx.showToast({
            title: "联系人不能为空",
            icon: "none",
          })
      : wx.showToast({
          title: "档口名称不能为空",
          icon: "none",
        });
  },
  saveFormSubmit: function (e) {
    var global = this,
      o = this,
      n = wx.getStorageSync("inviteUserId"),
      s = o.data,
      r = s.shopName,
      c = s.contacts,
      d = s.mobile,
      g = s.shopAddress,
      l = s.region,
      h = s.regionCode,
      u = s.category,
      m = [];
    (u && (m = u.split(",")),
      this.getWxCode().then(function (e) {
        var s = {
          clusterNames: m,
          companyName: r,
          contacts: c,
          phone: d,
          addr: g,
          inviteUserId: n || "0",
          channel: app.globalData.inChannel,
          subChannel: app.globalData.subChannel,
          wxCode: e,
          provinceId: h[0],
          shopProvince: l[0],
          shopCity: l[1],
          cityId: h[1],
          shopArea: l[2],
          areaId: h[2],
          imageUrls: o.data.remoteImageFiles,
          licences: o.data.licenseImageFiles,
          wxId: app.globalData.wxId,
        };
        (global.setData({
          banSubmit: !0,
        }),
          ServicesShop.submitShopApply(s).then(function (e) {
            if (
              (global.setData({
                banSubmit: !1,
              }),
              0 === e.code)
            ) {
              (wx.showToast({
                title: "提交成功",
                icon: "succeess",
              }),
                (app.globalData.wxId = ""),
                wx.removeStorageSync("inviteUserId"),
                wx.removeStorageSync("categoryCache"));
              var ServicesShop = setTimeout(function () {
                (clearTimeout(ServicesShop),
                  wx.redirectTo({
                    url: "/pages/register/infoExamine/infoExamine",
                  }));
              }, 1e3);
            } else
              wx.showToast({
                title: e.msg,
                icon: "none",
              });
          }));
      }));
  },
  previewImage: function (e) {
    var app = this.data.imagePre,
      ServicesShop = app[0],
      global = [app[0]];
    wx.previewImage({
      current: ServicesShop,
      urls: global,
    });
  },
  bindRegionChange: function (e) {
    this.setData({
      region: e.detail.value,
      regionCode: e.detail.code,
    });
  },
  input_val: function (t) {
    this.setData({
      [t.currentTarget.dataset.name]: t.detail.value,
    });
  },
  choseImage: function (a) {
    var global = this,
      o = (a.currentTarget.id, a.currentTarget.dataset.type),
      n = a.currentTarget.dataset.index;
    wx.chooseMedia({
      count: 1,
      sizeType: ["original", "compressed"],
      sourceType: ["album", "camera"],
      mediaType: ["image"],
      success: function (a) {
        var s = 0;
        a.tempFiles.map(function (r) {
          (setTimeout(function () {
            wx.showLoading({
              title: "上传中",
            });
          }, 500),
            global.setData({
              isLoadingPhoto: 1,
            }),
            wx.uploadFile({
              header: {
                "Content-Type": "multipart/form-data",
                Authorization: wx.getStorageSync("token"),
                terminalSource: 6,
              },
              formData: {
                filePath: "/bdd/head",
              },
              url: "".concat(app.config.bingxiHost, "/app-api/file/upload/notToken"),
              filePath: r.tempFilePath,
              name: "file",
              success: function (t) {
                try {
                  var r = JSON.parse(t.data);
                  if (0 == r.code) {
                    var c =
                      "1" === o ? global.data.remoteImageFiles : global.data.licenseImageFiles;
                    c[n] = r.data;
                    var d = "1" === o ? "remoteImageFiles" : "licenseImageFiles";
                    global.setData({
                      d: c,
                      isLoadingPhoto: 0,
                    });
                  } else
                    (global.data.imageList.pop(),
                      global.setData({
                        imageList: global.data.imageList,
                      }),
                      wx.showToast({
                        icon: "none",
                        title: global.data.msg,
                      }));
                } catch (e) {
                  (global.data.imageList.pop(),
                    global.setData({
                      imageList: global.data.imageList,
                    }),
                    wx.showToast({
                      icon: "none",
                      title: "上传图片失败",
                    }));
                }
                (s += 1) &&
                  s === a.tempFiles.length &&
                  setTimeout(function () {
                    wx.hideLoading();
                  }, 500);
              },
              fail: function (e) {
                setTimeout(function () {
                  (global.data.imageList.pop(),
                    wx.hideLoading(),
                    global.setData({
                      imageList: global.data.imageList,
                    }));
                }, 500);
              },
            }));
        });
      },
      fail: function () {
        wx.hideLoading();
      },
    });
  },
  shopApplyLog: function () {
    var e = this;
    wx.login({
      success: function (t) {
        (t.code, e.data.mobile);
      },
    });
  },
  getUserInfo: function (e) {
    var app = e.shopName,
      ServicesShop = e.shopAddress,
      global = e.shopProvince,
      o = e.shopCity,
      n = e.shopArea,
      s = e.nickName,
      r = [global, o, n];
    this.setData({
      shopName: app,
      shopAddress: ServicesShop,
      region: r,
      contacts: s,
    });
  },
});
