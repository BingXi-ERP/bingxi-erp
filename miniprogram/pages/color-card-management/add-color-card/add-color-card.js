var t = require("../../../@babel/runtime/helpers/interopRequireDefault").default;
require("../../../@babel/runtime/helpers/Arrayincludes");
var e,
  a,
  o,
  i,
  s,
  r,
  objectSpread2 = require("../../../@babel/runtime/helpers/objectSpread2"),
  createForOfIteratorHelper = require("../../../@babel/runtime/helpers/createForOfIteratorHelper"),
  c = require("../../../@babel/runtime/helpers/regeneratorRuntime"),
  l = require("../../../@babel/runtime/helpers/asyncToGenerator"),
  u = require("../../../@babel/runtime/helpers/defineProperty"),
  mta_analysis = t(require("../../../utils/mta_analysis.js")),
  util = require("../../../libs/utils/util"),
  ServicesUserLog = require("../../../libs/services/ServicesUserLog.js"),
  ServicesBase = require("../../../libs/services/ServicesBase.js"),
  f = [["camera"], ["album"], ["camera", "album"]],
  y = [["compressed"], ["original"], ["compressed", "original"]],
  app = getApp(),
  ServicesCard = require("../../../libs/services/ServicesCard.js").servicesCard,
  x = getCurrentPages(),
  I =
    (x[x.length - 2],
    function (t) {
      return Math.floor((t / 750) * wx.getSystemInfoSync().windowWidth);
    });
Page({
  data: {
    app: app,
    add: !1,
    productType: "",
    detailInfo: {},
    uploadPiece: 9,
    showIngredientText: "",
    userAuthList: {},
    showPop: !1,
    initPrice: !1,
    backupEvent: "",
    icon: {
      add: "".concat(app.config.imgHost, "/img/customer/ic_tianjia@4.5x.png"),
      enter: "".concat(app.config.imgHost, "/img/customer/duibuIcon/enter.png"),
      upload: "".concat(app.config.imgHost, "/img/customer/upload@2x.png"),
    },
    typeFrom: "",
    typeId: "",
    delImgIcon: "".concat(app.config.imgHost, "/img/customer/Icon_Delete.png?imageView2/2/w/50"),
    showClassification: 0,
    showAdd: 0,
    showType: "addclassify",
    classifyName: "",
    cover: wx.canIUse("cover-view"),
    imageList: [],
    remoteImageFiles: [],
    detailImageFiles: [],
    duibuImageFiles: [
      {
        label: "2倍正面",
        value: "",
        prop: "imageTwo0",
      },
      {
        label: "2倍背面",
        value: "",
        prop: "imageTwoBack0",
      },
      {
        label: "5倍正面",
        value: "",
        prop: "imageFive0",
      },
      {
        label: "5倍背面",
        value: "",
        prop: "imageFiveBack0",
      },
    ],
    sourceTypeIndex: 2,
    sourceType: ["拍照", "相册", "拍照或相册"],
    sizeTypeIndex: 2,
    sizeType: ["压缩", "原图", "压缩或原图"],
    array: ["米", "码", "公斤"],
    index: 0,
    array2: [
      "中国国家标准(GB)",
      "中国纺织行业标准(FZ)",
      "美国纺织化学家和染料家协会(AATCC)",
      "加拿大国家标准协会(CAN/CGSB)",
      "美国消费品安全委员会(CPSC)",
      "日本工业协会(JIS)",
      "欧洲标准协会(EN)",
      "德国标准协会(DIN)",
      "美国国家标准协会(NIST)",
      "英国标准协会(BS)",
      "墨西哥官方协会(NOMS)",
      "美国测试和材料协会(ASTM)",
      "法国标准协会(NF)",
      "其他(通过知名大牌测试请自填)",
    ],
    index2: 0,
    qualityStandardShow: 0,
    array3: ["g", "g/m", "g/m²", "oz/y²"],
    index3: 0,
    array4: ["cm", "inch"],
    index4: 0,
    array5: ["经编", "纬编"],
    index5: 0,
    commodityType: {},
    goodsId: "",
    isRepeat: !1,
    cardDetailsInfo: {},
    editSourceProductName: "",
    editSourceSpuNumber: "",
    isLoadingPhoto: "",
    lastTapDiffTime: 0,
    marginFixable: "",
    current: -1,
    current2: -1,
    current3: -1,
    current4: -1,
    s_v: I(16),
    s_h: I(16),
    u_w: I(144),
    u_h: I(144),
    s_v2: 8,
    s_h2: 8,
    u_w2: I(144),
    u_h2: I(144),
    s_v3: 8,
    s_h3: 8,
    u_w3: I(144),
    u_h3: I(144),
    s_v4: 8,
    s_h4: 8,
    u_w4: I(144),
    u_h4: I(144),
    all_width: "",
    all_width2: "",
    all_width3: "",
    all_width4: "",
    move_x: "",
    move_y: "",
    move2_x: "",
    move2_y: "",
    move3_x: "",
    move3_y: "",
    move4_x: "",
    move4_y: "",
    colorLength: "",
    minPrice: "",
    maxPrice: "",
    unitName: "",
    sureCategoryGoodsList: [],
    categoryGoodsList: [],
    baseListStatus: "",
    bottomCardList: [],
    checkList: "",
    categoryId: "",
    leaveType: 0,
    delType: 0,
    isEdit: !1,
    tabDisplay: 0,
    goodsSampleImgList: [],
    goodsColorImgList: [],
    textareadisplay: !1,
    remarkFocus: !1,
    banFinishB: !1,
    isIphone6: !1,
    productNameError: "",
    shelvesNumberError: "",
    Fabricdemo: ["".concat(app.config.imgHost, "/img/customer/Fabric.jpg?imageView2/2/w/800")],
    SampleClothes: ["".concat(app.config.imgHost, "/SampleClothes.jpg?imageView2/2/w/800")],
    detailDemo: ["".concat(app.config.imgHost, "/detail.jpg?imageView2/2/w/800")],
    colorImgSample: ["".concat(app.config.imgHost, "/img/demo/colorImgSample.jpg")],
  },
  getDictData: function (t, e) {
    var a = this;
    ServicesBase.servicesBase
      .getDictDataByType({
        value: t,
      })
      .then(function (t) {
        0 === t.code &&
          a.setData({
            e: t.data.map(function (t) {
              return t.label;
            }),
          });
      });
  },
  updateIngredientList: function (t) {
    var e = "";
    (t.forEach(function (t) {
      e = e + t.name + t.ratio + "".concat(t.ratio ? "%," : ",");
    }),
      (e = e.substring(0, e.length - 1)),
      this.setData({
        "cardDetailsInfo.materialList": t,
        "cardDetailsInfo.materialNew": e,
      }));
  },
  onBlurProductName: function (t) {
    var e = this;
    this.setData({
      productNameError: "",
    });
    var a = t.detail.value;
    if (a && (!this.data.editSourceProductName || this.data.editSourceProductName !== a)) {
      var o = {
        companyId: app.globalData.userInfo.companyId,
        productName: a,
        type: 1,
      };
      ServicesCard.checkRepeatProductName(o).then(function (t) {
        0 === t.code &&
          t.data &&
          (e.setData({
            productNameError: "该品名已存在,是否要重复输入？",
          }),
          setTimeout(function () {
            e.setData({
              productNameError: "",
            });
          }, 2e3));
      });
    }
  },
  getInput: function (t) {
    this.setData({
      [t.currentTarget.dataset.name]: t.detail.value,
    });
  },
  onInputShelvesNumber: function (t) {
    var e = this;
    this.setData({
      shelvesNumberError: "",
    });
    var a = t.detail.value;
    if (a && (!this.data.editSourceSpuNumber || this.data.editSourceSpuNumber !== a)) {
      var o = {
        companyId: app.globalData.userInfo.companyId,
        shelvesNumber: a,
        type: 1,
      };
      ServicesCard.checkRepeatShelvesNumber(o).then(function (t) {
        0 === t.code &&
          t.data &&
          (e.setData({
            shelvesNumberError: "该编号已存在,是否要重复输入？",
          }),
          setTimeout(function () {
            e.setData({
              shelvesNumberError: "",
            });
          }, 2e3));
      });
    }
  },
  isRepeatNameOrNumber: function (t) {
    var e = this;
    return l(
      c().mark(function a() {
        var o, i, s;
        return c().wrap(function (a) {
          for (;;)
            switch ((a.prev = a.next)) {
              case 0:
                if (
                  !e.data.editSourceProductName ||
                  e.data.editSourceProductName !== t.businessProductName
                ) {
                  a.next = 1;
                  break;
                }
                return a.abrupt("return", !1);
              case 1:
                if (!e.data.editSourceSpuNumber || e.data.editSourceSpuNumber !== t.spuNumber) {
                  a.next = 2;
                  break;
                }
                return a.abrupt("return", !1);
              case 2:
                if (
                  ((o = {
                    companyId: app.globalData.userInfo.companyId,
                    productName: t.businessProductName,
                    shelvesNumber: t.spuNumber,
                    type: 1,
                  }),
                  (i = !1),
                  t.businessProductName)
                ) {
                  a.next = 3;
                  break;
                }
                return a.abrupt("return", i);
              case 3:
                return (
                  (a.next = 4),
                  ServicesCard.checkRepeatProductName(o).then(function (t) {
                    0 === t.code && (i = t.data);
                  })
                );
              case 4:
                if (t.spuNumber) {
                  a.next = 5;
                  break;
                }
                return a.abrupt("return", i);
              case 5:
                return (
                  (s = !1),
                  (a.next = 6),
                  ServicesCard.checkRepeatShelvesNumber(o).then(function (t) {
                    0 === t.code && (s = t.data);
                  })
                );
              case 6:
                return a.abrupt("return", s || i);
              case 7:
              case "end":
                return a.stop();
            }
        }, a);
      }),
    )();
  },
  toIngredient: function () {
    wx.navigateTo({
      url: "/packageB/pages/color-card-management/ingredient/index?list=".concat(
        JSON.stringify(this.data.cardDetailsInfo.materialList),
      ),
    });
  },
  dataConfirm: function () {
    (this.changeShowPop(),
      this.setData({
        initPrice: !0,
      }),
      this.formSubmit(this.data.backupEvent));
  },
  dataAddPrice: function () {
    (this.changeShowPop(), this.toPrice());
  },
  changeShowPop: function () {
    this.setData({
      showPop: !this.data.showPop,
    });
  },
  getColorCardId: function () {
    var t = this;
    ServicesCard.getColorCardId({}).then(function (e) {
      0 === e.code
        ? t.setData({
            goodsId: e.data,
          })
        : wx.showToast({
            title: e.msg,
            icon: "none",
          });
    });
  },
  detailImgTap: function (t) {
    var e,
      a = t.currentTarget.dataset.index,
      o = this.data.detailImageFiles,
      i = [],
      s = createForOfIteratorHelper(o);
    try {
      for (s.s(); !(e = s.n()).done;) {
        var r = e.value;
        i.push(util.utils.moveImageOssSize(r.text));
      }
    } catch (t) {
      s.e(t);
    } finally {
      s.f();
    }
    wx.previewImage({
      current: i[a],
      urls: i,
    });
  },
  colorCardImgTap: function (t) {
    var e,
      a = t.currentTarget.dataset.index,
      o = this.data.remoteImageFiles,
      i = [],
      s = createForOfIteratorHelper(o);
    try {
      for (s.s(); !(e = s.n()).done;) {
        var r = e.value;
        i.push(util.utils.moveImageOssSize(r.text));
      }
    } catch (t) {
      s.e(t);
    } finally {
      s.f();
    }
    wx.previewImage({
      current: i[a],
      urls: i,
    });
  },
  goodsSampleImgTap: function (t) {
    var e,
      a = t.currentTarget.dataset.index,
      o = this.data.goodsSampleImgList,
      i = [],
      s = createForOfIteratorHelper(o);
    try {
      for (s.s(); !(e = s.n()).done;) {
        var r = e.value;
        i.push(util.utils.moveImageOssSize(r.text));
      }
    } catch (t) {
      s.e(t);
    } finally {
      s.f();
    }
    wx.previewImage({
      current: i[a],
      urls: i,
    });
  },
  detailImgDuibuTap: function (t) {
    var e = t.currentTarget.dataset.index,
      a = this.data.duibuImageFiles;
    if (a[e].value) {
      var o,
        i = [],
        s = createForOfIteratorHelper(a);
      try {
        for (s.s(); !(o = s.n()).done;) {
          var r = o.value;
          i.push(util.utils.moveImageOssSize(r.value));
        }
      } catch (t) {
        s.e(t);
      } finally {
        s.f();
      }
      wx.previewImage({
        current: i[e],
        urls: i,
      });
    } else
      wx.showToast({
        icon: "none",
        title: "无图片可预览",
      });
  },
  goodsColorImgTap: function (t) {
    var e,
      a = t.currentTarget.dataset.index,
      o = this.data.goodsColorImgList,
      i = [],
      s = createForOfIteratorHelper(o);
    try {
      for (s.s(); !(e = s.n()).done;) {
        var r = e.value;
        i.push(util.utils.moveImageOssSize(r.text));
      }
    } catch (t) {
      s.e(t);
    } finally {
      s.f();
    }
    wx.previewImage({
      current: i[a],
      urls: i,
    });
  },
  colorCardPrev: function () {
    wx.previewImage({
      urls: this.data.Fabricdemo,
    });
  },
  goodsSamplePrev: function () {
    wx.previewImage({
      urls: this.data.SampleClothes,
    });
  },
  detailImgPrev: function () {
    wx.previewImage({
      urls: this.data.detailDemo,
    });
  },
  goodsColorImgPrev: function () {
    wx.previewImage({
      urls: this.data.colorImgSample,
    });
  },
  chooseImage: function (t) {
    var e = this,
      a = this.data.uploadPiece,
      o = a - e.data.remoteImageFiles.length;
    wx.chooseMedia({
      sourceType: f[e.data.sourceTypeIndex],
      sizeType: y[e.data.sizeTypeIndex],
      count: o,
      mediaType: ["image"],
      success: function (t) {
        setTimeout(function () {
          wx.showLoading({
            title: "上传中",
          });
        }, 500);
        var o = 0;
        (e.setData({
          isLoadingPhoto: 1,
        }),
          t.tempFiles.map(function (i) {
            wx.uploadFile({
              header: {
                "Content-Type": "multipart/form-data",
                Authorization: wx.getStorageSync("token"),
                terminalSource: 6,
                terminalType: 81,
              },
              formData: {
                type: 1,
              },
              url: "".concat(app.config.bingxiHost, "/app-api/oss/upload"),
              filePath: i.tempFilePath,
              name: "file",
              success: function (i) {
                try {
                  var s = JSON.parse(i.data);
                  if (0 === s.code) {
                    var r = s.data;
                    (e.data.remoteImageFiles.push({
                      text: util.utils.replImage(r, 300),
                      name: r.substr(r.lastIndexOf("/") + 1),
                      storagePath: util.utils.replImage(r, 300),
                    }),
                      e.data.remoteImageFiles.length > a && (e.data.remoteImageFiles.length = a),
                      e.setData({
                        remoteImageFiles: e.data.remoteImageFiles,
                        isLoadingPhoto: 0,
                      }));
                  } else
                    401 === s.code
                      ? wx.showToast({
                          icon: "none",
                          title: "token失效,请重新上传",
                        })
                      : wx.showToast({
                          icon: "none",
                          title: e.data.msg.result,
                        });
                } catch (t) {
                  wx.showToast({
                    icon: "none",
                    title: "上传图片失败",
                  });
                }
                (e.getWidth(),
                  (o += 1) &&
                    o === t.tempFiles.length &&
                    setTimeout(function () {
                      wx.hideLoading();
                    }, 500));
              },
              fail: function (t) {},
            });
          }));
      },
    });
  },
  chooseImage2: function () {
    var t = this,
      e = this.data.uploadPiece,
      a = e - t.data.detailImageFiles.length;
    wx.chooseMedia({
      sourceType: f[t.data.sourceTypeIndex],
      sizeType: y[t.data.sizeTypeIndex],
      count: a,
      mediaType: ["image"],
      success: function (a) {
        setTimeout(function () {
          (wx.showLoading({
            title: "上传中",
          }),
            console.log("上传中"));
        }, 500);
        var o = 0;
        (t.setData({
          isLoadingPhoto: 1,
        }),
          a.tempFiles.map(function (i) {
            wx.uploadFile({
              header: {
                "Content-Type": "multipart/form-data",
                Authorization: wx.getStorageSync("token"),
                terminalSource: 6,
                terminalType: 81,
              },
              formData: {
                type: 7,
                goodsId: t.data.goodsId || "",
              },
              url: "".concat(app.config.bingxiHost, "/app-api/oss/uploadDetailImage"),
              filePath: i.tempFilePath,
              name: "file",
              success: function (i) {
                try {
                  var s = JSON.parse(i.data);
                  if (0 === s.code) {
                    var r = s.data;
                    (t.data.detailImageFiles.push({
                      text: util.utils.replImage(r, 300),
                      name: r.substr(r.lastIndexOf("/") + 1),
                      storagePath: util.utils.replImage(r, 300),
                    }),
                      t.data.detailImageFiles.length > e && (t.data.detailImageFiles.length = e),
                      t.setData({
                        detailImageFiles: t.data.detailImageFiles,
                        isLoadingPhoto: 0,
                      }),
                      console.log(t.data.detailImageFiles));
                  } else
                    401 === s.code
                      ? wx.showToast({
                          icon: "none",
                          title: "token失效,请重新上传",
                        })
                      : wx.showToast({
                          icon: "none",
                          title: t.data.msg.result,
                        });
                } catch (t) {
                  wx.showToast({
                    icon: "none",
                    title: "上传图片失败",
                  });
                }
                (t.getWidth2(),
                  (o += 1) &&
                    o === a.tempFiles.length &&
                    setTimeout(function () {
                      (console.log("上传完成"), wx.hideLoading());
                    }, 500));
              },
              fail: function (t) {},
            });
          }));
      },
    });
  },
  chooseImage3: function (t) {
    var e = this,
      a = this.data.uploadPiece,
      o = a - e.data.goodsSampleImgList.length;
    wx.chooseMedia({
      sourceType: f[e.data.sourceTypeIndex],
      sizeType: y[e.data.sizeTypeIndex],
      count: o,
      mediaType: ["image"],
      success: function (t) {
        setTimeout(function () {
          wx.showLoading({
            title: "上传中",
          });
        }, 500);
        var o = 0;
        (e.setData({
          isLoadingPhoto: 1,
        }),
          t.tempFiles.map(function (i) {
            wx.uploadFile({
              header: {
                "Content-Type": "multipart/form-data",
                Authorization: wx.getStorageSync("token"),
                terminalSource: 6,
                terminalType: 81,
              },
              formData: {
                type: 2,
              },
              url: "".concat(app.config.bingxiHost, "/app-api/oss/upload"),
              filePath: i.tempFilePath,
              name: "file",
              success: function (i) {
                try {
                  var s = JSON.parse(i.data);
                  if (0 === s.code) {
                    var r = s.data;
                    (e.data.goodsSampleImgList.push({
                      text: util.utils.replImage(r, 300),
                      name: r.substr(r.lastIndexOf("/") + 1),
                      storagePath: util.utils.replImage(r, 300),
                    }),
                      e.data.goodsSampleImgList.length > a &&
                        (e.data.goodsSampleImgList.length = a),
                      e.setData({
                        goodsSampleImgList: e.data.goodsSampleImgList,
                        isLoadingPhoto: 0,
                      }));
                  } else
                    401 === s.code
                      ? wx.showToast({
                          icon: "none",
                          title: "token失效,请重新上传",
                        })
                      : wx.showToast({
                          icon: "none",
                          title: e.data.msg.result,
                        });
                } catch (t) {
                  wx.showToast({
                    icon: "none",
                    title: "上传图片失败",
                  });
                }
                (e.getWidth3(),
                  (o += 1) &&
                    o === t.tempFiles.length &&
                    setTimeout(function () {
                      (console.log("上传完成"), wx.hideLoading());
                    }, 500));
              },
              fail: function (t) {},
            });
          }));
      },
    });
  },
  chooseImage4: function (t) {
    var e = this,
      a = this.data.uploadPiece,
      o = a - e.data.goodsColorImgList.length;
    wx.chooseMedia({
      sourceType: f[e.data.sourceTypeIndex],
      sizeType: y[e.data.sizeTypeIndex],
      count: o,
      mediaType: ["image"],
      success: function (t) {
        setTimeout(function () {
          wx.showLoading({
            title: "上传中",
          });
        }, 500);
        var o = 0;
        (e.setData({
          isLoadingPhoto: 1,
        }),
          t.tempFiles.map(function (i) {
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
              filePath: i.tempFilePath,
              name: "file",
              success: function (i) {
                try {
                  var s = JSON.parse(i.data);
                  if (0 === s.code) {
                    var r = s.data;
                    (e.data.goodsColorImgList.push({
                      text: util.utils.replImage(r, 300),
                      name: r.substr(r.lastIndexOf("/") + 1),
                      storagePath: util.utils.replImage(r, 300),
                    }),
                      e.data.goodsColorImgList.length > a && (e.data.goodsColorImgList.length = a),
                      e.setData({
                        goodsColorImgList: e.data.goodsColorImgList,
                        isLoadingPhoto: 0,
                      }));
                  } else
                    401 === s.code
                      ? wx.showToast({
                          icon: "none",
                          title: "token失效,请重新上传",
                        })
                      : wx.showToast({
                          icon: "none",
                          title: e.data.msg,
                        });
                } catch (t) {
                  wx.showToast({
                    icon: "none",
                    title: "上传图片失败",
                  });
                }
                (e.getWidth4(),
                  (o += 1) &&
                    o === t.tempFiles.length &&
                    setTimeout(function () {
                      (console.log("上传完成"), wx.hideLoading());
                    }, 500));
              },
              fail: function (t) {},
            });
          }));
      },
    });
  },
  previewImage: function (t) {
    var e = [];
    (this.data.remoteImageFiles.map(function (t) {
      e.push(t.text);
    }),
      wx.previewImage({
        current: e[t.currentTarget.id],
        urls: e,
      }));
  },
  soltImage: function (t) {
    if (0 != t.currentTarget.id) {
      var e = t.currentTarget.id,
        a = t.currentTarget.id - 1,
        o = t.currentTarget.dataset.src,
        i = this.data.remoteImageFiles[a];
      ((this.data.remoteImageFiles[a] = o),
        (this.data.remoteImageFiles[e] = i),
        this.setData({
          remoteImageFiles: this.data.remoteImageFiles,
        }));
    } else
      wx.showToast({
        icon: "none",
        title: "当前图片为第一张，无法移动",
      });
  },
  deleteImage: function (t) {
    var e = this,
      a = e.data.remoteImageFiles,
      o = t.currentTarget.id;
    wx.showModal({
      title: "提示",
      content: "确定要删除此图片吗？",
      success: function (t) {
        if (t.confirm) a.splice(o, 1);
        else if (t.cancel) return !1;
        (e.getWidth(),
          e.setData({
            remoteImageFiles: a,
          }));
      },
    });
  },
  deleteImage2: function (t) {
    var e = this,
      a = e.data.detailImageFiles,
      o = t.currentTarget.id;
    wx.showModal({
      title: "提示",
      content: "确定要删除此图片吗？",
      success: function (t) {
        if (t.confirm) a.splice(o, 1);
        else if (t.cancel) return !1;
        (e.getWidth2(),
          e.setData({
            detailImageFiles: a,
          }));
      },
    });
  },
  deleteImage3: function (t) {
    var e = this,
      a = e.data.goodsSampleImgList,
      o = t.currentTarget.id;
    wx.showModal({
      title: "提示",
      content: "确定要删除此图片吗？",
      success: function (t) {
        if (t.confirm) a.splice(o, 1);
        else if (t.cancel) return !1;
        (e.getWidth3(),
          e.setData({
            goodsSampleImgList: a,
          }));
      },
    });
  },
  deleteImage4: function (t) {
    var e = this,
      a = e.data.goodsColorImgList,
      o = t.currentTarget.id;
    wx.showModal({
      title: "提示",
      content: "确定要删除此图片吗？",
      success: function (t) {
        if (t.confirm) a.splice(o, 1);
        else if (t.cancel) return !1;
        (e.getWidth4(),
          e.setData({
            goodsColorImgList: a,
          }));
      },
    });
  },
  bindPickerChange: function (t) {
    this.setData({
      index: t.detail.value,
    });
  },
  bindPickerChange2: function (t) {
    var e = wx.getStorageSync("commodityType");
    (this.setData({
      index2: t.detail.value,
    }),
      e &&
        ((e.qualityStandardName = this.data.array2[t.detail.value]),
        wx.setStorageSync("commodityType", e)));
  },
  bindPickerChange3: function (t) {
    this.setData({
      index3: t.detail.value,
    });
  },
  bindPickerChange4: function (t) {
    this.setData({
      index4: t.detail.value,
    });
  },
  bindPickerChange5: function (t) {
    var e = wx.getStorageSync("commodityType");
    (this.setData({
      index5: t.detail.value,
    }),
      e &&
        ((e.wrapWeftName = this.data.array5[t.detail.value]),
        wx.setStorageSync("commodityType", e)));
  },
  onLoad: function (t) {
    switch (
      (console.log(app.config.imgHost),
      this.getCategoryGoodsList(),
      mta_analysis.default.Page.init(),
      this.getDictData("weightUnit", "array3"),
      this.getDictData("clothWidthUnit", "array4"),
      this.setData({
        userAuthList: app.userAuthList,
      }),
      console.log(t),
      t.add &&
        this.setData({
          add: !0,
          productType: t.productType,
        }),
      "" != t.typeId &&
        null != t.typeId &&
        this.setData({
          typeId: t.typeId,
        }),
      "" != t.categoryId &&
        null != t.categoryId &&
        this.setData({
          categoryId: t.categoryId,
        }),
      "1" === t.type
        ? (wx.setNavigationBarTitle({
            title: "面料编辑",
          }),
          this.setData({
            goodsId: t.goodsId,
            typeFrom: t.type,
          }),
          this.getCardDetailsData(),
          this.setData({
            isEdit: !0,
          }))
        : "0" === t.type &&
          (wx.setNavigationBarTitle({
            title: "新增面料",
          }),
          wx.setStorageSync("baseListId", ""),
          this.setData({
            cardDetailsInfo: {},
            imageList: [],
            remoteImageFiles: [],
            typeFrom: t.type,
          })),
      "1" === t.delType &&
        this.setData({
          delType: 1,
        }),
      wx.hideShareMenu(),
      app.globalData.mobileInfo.screenWidth)
    ) {
      case 360:
        this.setData({
          marginFixable: "20rpx 0 0 32rpx",
        });
        break;
      case 375:
        this.setData({
          isIphone6: !0,
          marginFixable: "20rpx 0 0 20rpx",
        });
        break;
      case 411:
      case 412:
        this.setData({
          marginFixable: "8rpx 0 0 8rpx",
        });
        break;
      case 414:
        this.setData({
          isIp6P: !0,
          marginFixable: "20rpx 0rpx 0 24rpx",
        });
        break;
      case 768:
        this.setData({
          u_w: 180,
          u_h: 180,
          u_w2: 180,
          u_h2: 180,
          marginFixable: "0rpx 0 0 0rpx",
        });
        break;
      case 834:
        this.setData({
          u_w: 200,
          u_h: 200,
          u_w2: 200,
          u_h2: 200,
          marginFixable: "0rpx 0 0 0rpx",
        });
        break;
      case 1024:
        this.setData({
          u_w: 250,
          u_h: 250,
          u_w2: 250,
          u_h2: 250,
          marginFixable: "0rpx 0 0 0rpx",
        });
    }
  },
  onShow: function () {
    var t = this,
      e = wx.getStorageSync("colorColorList"),
      a = wx.getStorageSync("goodsPriceJson"),
      o = wx.getStorageSync("commodityType"),
      i = wx.getStorageSync("baseListId"),
      s = wx.getStorageSync("bottomCardInfo"),
      r = wx.getStorageSync("sureCategoryGoodsList"),
      objectSpread2 = wx.getStorageSync("checkCategoryName");
    "" != e &&
      null != e &&
      ((this.data.colorLength = e.length),
      this.setData({
        colorLength: "合计" + this.data.colorLength + "种色号",
      }));
    var createForOfIteratorHelper,
      c,
      l = this.data.detailInfo,
      u = l.price,
      mta_analysis = l.priceUnit;
    ("" != a && null != a
      ? this.setData({
          minPrice: wx.getStorageSync("miniNum") || u,
          maxPrice: wx.getStorageSync("maxNum") || u,
          unitName: wx.getStorageSync("unitName") || mta_analysis,
        })
      : this.setData({
          minPrice: u || "",
          maxPrice: u || "",
          unitName: mta_analysis || "",
        }),
    "" != o && null != o) &&
      (this.setData({
        qualityStandardShow: 1,
        commodityType: o,
      }),
      null === (d = this.data.array2) ||
        void 0 === createForOfIteratorHelper ||
        createForOfIteratorHelper.map(function (e, a) {
          e == o.qualityStandardName &&
            t.setData({
              index2: a,
            });
        }),
      null === (c = this.data.array5) ||
        void 0 === c ||
        c.map(function (e, a) {
          e == o.wrapWeftName &&
            t.setData({
              index5: a,
            });
        }));
    (("" != i && null != i && i.length > 0) || s
      ? this.setData({
          baseListStatus: "已添加",
        })
      : this.setData({
          baseListStatus: "",
        }),
      "" != r &&
        null != r &&
        this.setData({
          sureCategoryGoodsList: r,
          categoryGoodsList: r,
        }),
      "" != objectSpread2 &&
        null != objectSpread2 &&
        this.setData({
          checkList: objectSpread2,
        }));
  },
  onUnload: function () {
    (wx.removeStorageSync("goodsPriceJson"),
      wx.removeStorageSync("sureCategoryGoodsList"),
      wx.removeStorageSync("checkCategoryName"),
      wx.removeStorageSync("colorColorList"),
      wx.removeStorageSync("colorColorId"),
      wx.removeStorageSync("unitName"),
      wx.removeStorageSync("miniNum"),
      wx.removeStorageSync("maxNum"),
      wx.removeStorageSync("priceType"),
      wx.removeStorageSync("baseListId"),
      wx.removeStorageSync("checkColorItem"),
      wx.removeStorageSync("commodityType"),
      wx.removeStorageSync("bottomCardInfo"));
  },
  getWidth: function () {
    var t = this;
    wx.getSystemInfo({
      success: function (e) {
        var a = 0.975 * e.screenWidth;
        t.setData({
          all_width: 0.975 * e.screenWidth,
        });
        var o = 0,
          i = 0,
          s = 0,
          r = [].concat(t.data.remoteImageFiles);
        (r.forEach(function (e, r) {
          ((e.left = (t.data.u_w + t.data.s_v) * i),
            (e.top = (t.data.u_h + t.data.s_h) * s),
            (e._left = e.left),
            (e._top = e.top),
            (o += t.data.u_w + t.data.s_h) + t.data.u_w + t.data.s_h > a
              ? ((o = 0), (i = 0), s++)
              : i++);
        }),
          t.setData({
            remoteImageFiles: r,
          }));
      },
    });
  },
  getWidth2: function () {
    var t = this;
    wx.getSystemInfo({
      success: function (e) {
        var a = (t.data.all_width2 = 0.98 * e.screenWidth),
          o = 0,
          i = 0,
          s = 0,
          r = [].concat(t.data.detailImageFiles);
        (r.forEach(function (e, r) {
          ((e.left = (t.data.u_w2 + t.data.s_h2) * i),
            (e.top = (t.data.u_h2 + t.data.s_v2) * s),
            (e._left = e.left),
            (e._top = e.top),
            (o += t.data.u_w2 + t.data.s_h2) + t.data.u_w2 + t.data.s_h2 > a
              ? ((o = 0), (i = 0), s++)
              : i++);
        }),
          t.setData({
            detailImageFiles: r,
          }));
      },
    });
  },
  getWidth3: function () {
    var t = this;
    wx.getSystemInfo({
      success: function (e) {
        var a = (t.data.all_width3 = 0.98 * e.screenWidth),
          o = 0,
          i = 0,
          s = 0,
          r = [].concat(t.data.goodsSampleImgList);
        (r.forEach(function (e, r) {
          ((e.left = (t.data.u_w3 + t.data.s_h3) * i),
            (e.top = (t.data.u_h3 + t.data.s_v3) * s),
            (e._left = e.left),
            (e._top = e.top),
            (o += t.data.u_w3 + t.data.s_h3) + t.data.u_w3 + t.data.s_h3 > a
              ? ((o = 0), (i = 0), s++)
              : i++);
        }),
          t.setData({
            goodsSampleImgList: r,
          }));
      },
    });
  },
  getWidth4: function () {
    var t = this;
    wx.getSystemInfo({
      success: function (e) {
        var a = (t.data.all_width4 = 0.98 * e.screenWidth),
          o = 0,
          i = 0,
          s = 0,
          r = [].concat(t.data.goodsColorImgList);
        (r.forEach(function (e, r) {
          ((e.left = (t.data.u_w4 + t.data.s_h4) * i),
            (e.top = (t.data.u_h4 + t.data.s_v4) * s),
            (e._left = e.left),
            (e._top = e.top),
            (o += t.data.u_w4 + t.data.s_h4) + t.data.u_w4 + t.data.s_h4 > a
              ? ((o = 0), (i = 0), s++)
              : i++);
        }),
          t.setData({
            goodsColorImgList: r,
          }));
      },
    });
  },
  deleteShop: function () {
    var t = this;
    wx.showModal({
      title: "提示",
      content: "是否确认删除色卡?",
      success: function (e) {
        if (e.confirm) {
          wx.showLoading({
            title: "删除中",
          });
          var a = {
            id: t.data.goodsId,
          };
          ServicesCard.delColorCard(a, t.data.goodsId).then(function (e) {
            var a;
            (wx.hideLoading(), 0 === e.code)
              ? (ServicesUserLog.servicesUserLog.setUserHandleLog(103),
                wx.showToast({
                  icon: "none",
                  title: "删除成功",
                }),
                getCurrentPages().forEach(function (t, e) {
                  ("pages/color-card-management/color-card-management" != t.route &&
                    "pages/search/search" != t.route) ||
                    (a = t);
                }),
                a.deleteItem(),
                1 == t.data.delType
                  ? wx.navigateBack({
                      delta: 1,
                    })
                  : wx.navigateBack({
                      delta: 2,
                    }))
              : (wx.hideLoading(),
                wx.showToast({
                  title: e.msg,
                  icon: "none",
                }));
          });
        } else e.cancel;
      },
    });
  },
  _saveCloth: function (t, e) {
    var a = this;
    return l(
      c().mark(function o() {
        var i;
        return c().wrap(function (o) {
          for (;;)
            switch ((o.prev = o.next)) {
              case 0:
                ((i = a),
                  wx.showLoading({
                    title: "提交中...",
                  }),
                  ServicesCard.addOrUpdateColorCard(t, e)
                    .then(function (e) {
                      if (
                        (wx.hideLoading(),
                        console.log(e, "---0--0-0-090909------"),
                        i.setData({
                          banFinishB: !1,
                        }),
                        0 == e.code)
                      ) {
                        if (
                          (ServicesUserLog.servicesUserLog.setUserHandleLog(
                            "1" == a.data.typeFrom ? 102 : 101,
                          ),
                          wx.showToast({
                            icon: "success",
                            title: "提交成功",
                          }),
                          wx.removeStorageSync("sureCategoryGoodsList"),
                          wx.removeStorageSync("checkCategoryName"),
                          wx.removeStorageSync("colorColorList"),
                          wx.removeStorageSync("colorColorId"),
                          wx.removeStorageSync("goodsPriceJson"),
                          wx.removeStorageSync("unitName"),
                          wx.removeStorageSync("miniNum"),
                          wx.removeStorageSync("maxNum"),
                          wx.removeStorageSync("priceType"),
                          wx.removeStorageSync("baseListId"),
                          wx.removeStorageSync("checkColorItem"),
                          wx.removeStorageSync("commodityType"),
                          wx.removeStorageSync("bottomCardInfo"),
                          i.setData({
                            isRepeat: !1,
                          }),
                          wx.hideLoading(),
                          a.data.add)
                        )
                          return void wx.navigateTo({
                            url: "/pages/order-create/product-full/index?productType="
                              .concat(a.data.productType, "&openType=offline&colorCardId=")
                              .concat(e.data, "&to=open"),
                          });
                        if ((wx.navigateBack(), a.data.isEdit)) {
                          var o, s;
                          (getCurrentPages().forEach(function (t, e) {
                            ("pages/color-card-management/color-card-management" != t.route &&
                              "pages/search/search" != t.route) ||
                              (s = t);
                          }),
                            a.data.minPrice == a.data.maxPrice
                              ? (t.price = a.data.minPrice)
                              : (t.price = a.data.minPrice + "~" + a.data.maxPrice),
                            (t.priceUnit = a.data.unitName),
                            (t.mainImgPath = t.imageInfoList
                              ? null === (o = t.imageInfoList[0]) || void 0 === o
                                ? void 0
                                : o.storagePath
                              : ""));
                          var r = JSON.stringify(t);
                          s.isUpdate(r);
                        } else {
                          var objectSpread2;
                          (getCurrentPages().forEach(function (t, e) {
                            ("pages/color-card-management/color-card-management" != t.route &&
                              "pages/search/search" != t.route) ||
                              (n = t);
                          }),
                            objectSpread2.deleteItem());
                        }
                      } else
                        (wx.showToast({
                          title: e.msg,
                          icon: "none",
                        }),
                          i.setData({
                            initPrice: !1,
                          }));
                    })
                    .finally(function () {
                      i.setData({
                        isRepeat: !1,
                      });
                    }));
              case 1:
              case "end":
                return o.stop();
            }
        }, o);
      }),
    )();
  },
  formSubmit: function (t) {
    var e = this;
    return l(
      c().mark(function a() {
        var o,
          i,
          s,
          r,
          objectSpread2,
          createForOfIteratorHelper,
          l,
          u,
          mta_analysis,
          ServicesUserLog,
          ServicesBase,
          f,
          y;
        return c().wrap(function (a) {
          for (;;)
            switch ((a.prev = a.next)) {
              case 0:
                if (((e.data.backupEvent = t), 0 != e.data.remoteImageFiles.length)) {
                  a.next = 1;
                  break;
                }
                return (
                  wx.showToast({
                    icon: "none",
                    title: "请先上传面料图片",
                  }),
                  e.setData({
                    tabDisplay: 1,
                  }),
                  a.abrupt("return")
                );
              case 1:
                if (1 != e.data.isLoadingPhoto) {
                  a.next = 2;
                  break;
                }
                return (
                  wx.showToast({
                    icon: "none",
                    title: "图片上传中暂不能提交",
                  }),
                  a.abrupt("return")
                );
              case 2:
                if ("" != e.data.colorLength) {
                  a.next = 3;
                  break;
                }
                return (
                  wx.showToast({
                    icon: "none",
                    title: "请添加色号",
                  }),
                  e.setData({
                    tabDisplay: 0,
                  }),
                  a.abrupt("return")
                );
              case 3:
                if ("" !== e.data.cardDetailsInfo.businessProductName) {
                  a.next = 4;
                  break;
                }
                return (
                  wx.showToast({
                    icon: "none",
                    title: "请输入品名",
                  }),
                  e.setData({
                    tabDisplay: 0,
                  }),
                  a.abrupt("return")
                );
              case 4:
                if (!e.data.isRepeat) {
                  a.next = 5;
                  break;
                }
                return a.abrupt("return");
              case 5:
                if (
                  (e.setData({
                    isRepeat: !0,
                  }),
                  "1" == e.data.typeFrom
                    ? ((o = "".concat(app.config.bingxiHost, "/app-api/product/edit")),
                      (i = e.data.goodsId))
                    : "0" == e.data.typeFrom &&
                      ((o = "".concat(app.config.bingxiHost, "/app-api/product/add")),
                      (i = e.data.goodsId)),
                  (s = e).data.remoteImageFiles.forEach(function (t) {
                    ((t.text = util.utils.moveImageOssSize(t.text)),
                      (t.storagePath = util.utils.moveImageOssSize(t.storagePath)));
                  }),
                  s.data.detailImageFiles.forEach(function (t) {
                    ((t.text = util.utils.moveImageOssSize(t.text)),
                      (t.storagePath = util.utils.moveImageOssSize(t.storagePath)));
                  }),
                  s.data.goodsSampleImgList.forEach(function (t) {
                    ((t.text = util.utils.moveImageOssSize(t.text)),
                      (t.storagePath = util.utils.moveImageOssSize(t.storagePath)));
                  }),
                  s.data.goodsColorImgList.forEach(function (t) {
                    ((t.text = util.utils.moveImageOssSize(t.text)),
                      (t.storagePath = util.utils.moveImageOssSize(t.storagePath)));
                  }),
                  (r = wx.getStorageSync("goodsPriceJson")),
                  (n = wx.getStorageSync("priceType")),
                  (d = {
                    imageDetailList: s.data.detailImageFiles,
                    imageInfoList: s.data.remoteImageFiles,
                    imageSampleList: s.data.goodsSampleImgList,
                    imageColorList: s.data.goodsColorImgList,
                    companyId: wx.getStorageSync("myShopId"),
                    businessProductName: e.data.cardDetailsInfo.businessProductName,
                    englishProductName: e.data.cardDetailsInfo.englishProductName,
                    spuNumber: e.data.cardDetailsInfo.spuNumber,
                    gramWeight: e.data.cardDetailsInfo.gramWeight || "",
                    weightUnit: s.data.array3[s.data.index3],
                    classifyList: e.data.cardDetailsInfo.ingredient,
                    clothWidth: e.data.cardDetailsInfo.clothWidth || "",
                    clothWidthUnit: s.data.array4[s.data.index4],
                    priceUnit: wx.getStorageSync("unitName"),
                    colorList: wx.getStorageSync("colorColorList") || [],
                    shrinkage: e.data.cardDetailsInfo.shrinkage,
                    remark: e.data.cardDetailsInfo.remark ? e.data.cardDetailsInfo.remark : "",
                    id: i,
                    materialList: e.data.cardDetailsInfo.materialList,
                    priceReq: {
                      bulkPriceReq: (2 == objectSpread2 && r) || [],
                      shearingPriceReq: (1 == objectSpread2 && r) || [],
                    },
                  }),
                  "" != e.data.typeId && (createForOfIteratorHelper.categoryIds = s.data.typeId),
                  (l = wx.getStorageSync("commodityType")),
                  (u = wx.getStorageSync("baseListId")),
                  (g = wx.getStorageSync("sureCategoryGoodsList")),
                  "" == r || null == r)
                ) {
                  a.next = 8;
                  break;
                }
                if (1 != wx.getStorageSync("priceType")) {
                  a.next = 6;
                  break;
                }
                a.next = 7;
                break;
              case 6:
                if (2 != wx.getStorageSync("priceType") || e.data.initPrice) {
                  a.next = 7;
                  break;
                }
                if (
                  !r.filter(function (t) {
                    return !t.hasOwnProperty("bulkPrice");
                  }).length
                ) {
                  a.next = 7;
                  break;
                }
                return (
                  wx.hideLoading(),
                  e.changeShowPop(),
                  e.setData({
                    minPrice: 0,
                    isRepeat: !1,
                  }),
                  a.abrupt("return")
                );
              case 7:
                ((createForOfIteratorHelper.priceType = wx.getStorageSync("priceType")),
                  (a.next = 9));
                break;
              case 8:
                (console.log("还没选择价格"),
                  (r = (r = [
                    {
                      priceType: null,
                      quantity: "0",
                      quantityPrice: "0",
                    },
                  ]).concat(wx.getStorageSync("colorColorList"))),
                  (createForOfIteratorHelper.priceType = null));
              case 9:
                return (
                  "" != l &&
                    null != l &&
                    ((createForOfIteratorHelper.meterLength = l.meterLength),
                    (createForOfIteratorHelper.clothEnough = l.clothEnough),
                    (createForOfIteratorHelper.wrapWeftName = l.wrapWeftName),
                    (createForOfIteratorHelper.qualityStandardName = l.qualityStandardName),
                    (createForOfIteratorHelper.yarnCountFront = l.yarnCountFront),
                    (createForOfIteratorHelper.density1 = l.density1),
                    e.setData({
                      commodityType: l,
                    })),
                  "" != u && null != u && (createForOfIteratorHelper.bottomCardIds = u),
                  "" != mta_analysis && null != mta_analysis
                    ? ((m = []),
                      null == mta_analysis ||
                        mta_analysis.map(function (t) {
                          1 == t.checked && ServicesUserLog.push(t.id);
                        }),
                      (createForOfIteratorHelper.classifyIds = ServicesUserLog))
                    : "" != e.data.sureCategoryGoodsList &&
                      e.data.sureCategoryGoodsList.length > 0 &&
                      ((f = []),
                      (y = 1),
                      null === (p = e.data.sureCategoryGoodsList) ||
                        void 0 === ServicesBase ||
                        ServicesBase.map(function (t) {
                          1 == t.checked && (f.push(t.id), (y = 2));
                        }),
                      2 == y && (createForOfIteratorHelper.classifyIds = f)),
                  e.setData({
                    banFinishB: !0,
                  }),
                  (a.next = 10),
                  s.isRepeatNameOrNumber(createForOfIteratorHelper)
                );
              case 10:
                if (!a.sent) {
                  a.next = 11;
                  break;
                }
                return (
                  wx.showModal({
                    title: "温馨提示",
                    content: "品名/编号与已有面料重复，是否保存？",
                    confirmColor: "#2D74EE",
                    cancelColor: "#373C55",
                    success: function (t) {
                      (t.confirm && s._saveCloth(createForOfIteratorHelper, o),
                        t.cancel &&
                          s.setData({
                            isRepeat: !1,
                            banFinishB: !1,
                          }));
                    },
                  }),
                  a.abrupt("return")
                );
              case 11:
                s._saveCloth(createForOfIteratorHelper, o);
              case 12:
              case "end":
                return a.stop();
            }
        }, a);
      }),
    )();
  },
  getCardDetailsData: function () {
    var t = this;
    wx.showLoading({
      title: "加载中",
      mask: !0,
    });
    ServicesCard.colorCardDetail({}, this.data.goodsId).then(function (e) {
      if (0 === e.code) {
        if (null !== e.data.data) {
          var a,
            o,
            i,
            s,
            r,
            createForOfIteratorHelper,
            c,
            l,
            u,
            mta_analysis,
            ServicesUserLog,
            ServicesBase = e.data;
          if (
            (t.setData({
              detailInfo: ServicesBase,
            }),
            "inch" === ServicesBase.clothWidthUnit &&
              t.setData({
                index4: 1,
              }),
            t.setData({
              index3: t.data.array3.indexOf(ServicesBase.weightUnit),
            }),
            (null === (a = ServicesBase.bottomCardList) || void 0 === a ? void 0 : a.length) > 0)
          ) {
            var f;
            t.setData({
              bottomCardList: ServicesBase.bottomCardList,
              baseListStatus: "已添加",
            });
            var y = [];
            (null === (f = ServicesBase.bottomCardList) ||
              void 0 === f ||
              f.map(function (t) {
                y.push(t.id);
              }),
              wx.setStorageSync("baseListId", y));
          } else wx.removeStorageSync("baseListId");
          if (
            (wx.setStorageSync("colorColorList", ServicesBase.colorList),
            (null === (o = ServicesBase.colorList) || void 0 === o ? void 0 : o.length) > 0 &&
              t.setData({
                colorLength: "合计" + ServicesBase.colorList.length + "种色号",
              }),
            ServicesBase.classifyList.length &&
              (t.data.categoryGoodsList.forEach(function (t) {
                ServicesBase.classifyList.forEach(function (e) {
                  t.id === e.id ? (t.checked = 1) : (t.checked = 0);
                });
              }),
              t.setData({
                categoryGoodsList: t.data.categoryGoodsList,
              }),
              wx.setStorageSync("sureCategoryGoodsList", t.data.categoryGoodsList)),
            wx.setStorageSync("priceType", ServicesBase.priceType),
            1 == ServicesBase.priceType)
          )
            (null === (c = ServicesBase.priceResp) ||
              void 0 === c ||
              null === (c = c.shearingPriceResps) ||
              void 0 === c ||
              c.map(function (t) {
                t.priceType = 1;
              }),
              wx.setStorageSync(
                "goodsPriceJson",
                null === (l = ServicesBase.priceResp) || void 0 === l
                  ? void 0
                  : l.shearingPriceResps,
              ));
          else
            (null === (u = ServicesBase.colorList) ||
              void 0 === u ||
              u.map(function (t) {
                ((t.bulkNumUnit = ServicesBase.priceUnit),
                  (t.bulkSaleUnit = "元/" + ServicesBase.priceUnit),
                  (t.priceType = 2));
              }),
              wx.setStorageSync(
                "goodsPriceJson",
                (null === (g = ServicesBase.priceResp) || void 0 === mta_analysis
                  ? void 0
                  : mta_analysis.bulkPriceResps.length) > 0
                  ? null === (m = ServicesBase.priceResp) || void 0 === ServicesUserLog
                    ? void 0
                    : ServicesUserLog.bulkPriceResps
                  : ServicesBase.colorList,
              ));
          ("" != ServicesBase.qualityStandardName &&
            t.data.array2.map(function (e, a) {
              ServicesBase.qualityStandardName == e &&
                t.setData({
                  index2: a,
                });
            }),
            "" != ServicesBase.wrapWeftName &&
              t.data.array5.map(function (e, a) {
                ServicesBase.wrapWeftName == e &&
                  t.setData({
                    qualityStandardShow: 1,
                    index5: a,
                  });
              }));
          var app = {
            meterLength: ServicesBase.meterLength,
            yarnCountFront: ServicesBase.yarnCountFront,
            clothEnough: ServicesBase.clothEnough,
            wrapWeftName: ServicesBase.wrapWeftName,
            qualityStandardName: ServicesBase.qualityStandardName,
            density1: ServicesBase.density1,
          };
          (wx.setStorageSync("commodityType", app),
            t.setData({
              commodityType: app,
            }),
            wx.setStorageSync("unitName", ServicesBase.priceUnit),
            wx.setStorageSync("miniNum", ServicesBase.goodsPriceMin),
            wx.setStorageSync("maxNum", ServicesBase.goodsPriceMax));
          var ServicesCard = [],
            x = [];
          (ServicesBase.classifyList.map(function (t) {
            (ServicesCard.push(t.name), x.push(t.id));
          }),
            t.data.categoryGoodsList.map(function (t) {
              -1 == x.indexOf(t.id) ? (t.checked = 0) : (t.checked = 1);
            }),
            t.setData({
              sureCategoryGoodsList: t.data.categoryGoodsList,
            }),
            null === (i = ServicesBase.imageInfoList) ||
              void 0 === i ||
              i.forEach(function (e) {
                t.data.remoteImageFiles.push(
                  objectSpread2(
                    objectSpread2({}, e),
                    {},
                    {
                      text: util.utils.replImage(e.storagePath, 300),
                    },
                  ),
                );
              }),
            null === (s = ServicesBase.imageDetailList) ||
              void 0 === s ||
              s.forEach(function (e) {
                t.data.detailImageFiles.push(
                  objectSpread2(
                    objectSpread2({}, e),
                    {},
                    {
                      text: util.utils.replImage(e.storagePath, 300),
                    },
                  ),
                );
              }),
            null === (r = ServicesBase.imageSampleList) ||
              void 0 === r ||
              r.forEach(function (e) {
                t.data.goodsSampleImgList.push(
                  objectSpread2(
                    objectSpread2({}, e),
                    {},
                    {
                      text: util.utils.replImage(e.storagePath, 300),
                    },
                  ),
                );
              }),
            null === (d = ServicesBase.imageColorList) ||
              void 0 === createForOfIteratorHelper ||
              createForOfIteratorHelper.forEach(function (e) {
                t.data.goodsColorImgList.push(
                  objectSpread2(
                    objectSpread2({}, e),
                    {},
                    {
                      text: util.utils.replImage(e.storagePath, 300),
                    },
                  ),
                );
              }),
            t.data.duibuImageFiles.forEach(function (t) {
              t.value = util.utils.replImage(ServicesBase.detailImage[t.prop], 300);
            }),
            t.setData({
              minPrice: ServicesBase.price || "",
              maxPrice: ServicesBase.price || "",
              unitName: ServicesBase.priceUnit || "",
              checkList: ServicesCard.join("，"),
              cardDetailsInfo: ServicesBase,
              remoteImageFiles: t.data.remoteImageFiles,
              categoryGoodsList: t.data.categoryGoodsList,
              detailImageFiles: t.data.detailImageFiles,
              goodsSampleImgList: t.data.goodsSampleImgList,
              duibuImageFiles: t.data.duibuImageFiles,
              goodsColorImgList: t.data.goodsColorImgList,
              editSourceProductName: ServicesBase.businessProductName,
              editSourceSpuNumber: ServicesBase.spuNumber,
            }),
            t.getWidth(),
            t.getWidth2(),
            t.getWidth3(),
            t.getWidth4());
        }
        wx.hideLoading();
      } else
        wx.showToast({
          title: e.msg.result,
          icon: "none",
        });
    });
  },
  movestart: function (t) {
    ((e = t.touches[0].clientX),
      (a = t.touches[0].clientY),
      (o = t.currentTarget.offsetLeft),
      (i = t.currentTarget.offsetTop),
      this.setData({
        current: t.target.dataset.index,
        move_x: o,
        move_y: i,
      }));
  },
  movestart2: function (t) {
    ((e = t.touches[0].clientX),
      (a = t.touches[0].clientY),
      (o = t.currentTarget.offsetLeft),
      (i = t.currentTarget.offsetTop),
      this.setData({
        current2: t.target.dataset.index,
        move2_x: o,
        move2_y: i,
      }));
  },
  movestart3: function (t) {
    ((e = t.touches[0].clientX),
      (a = t.touches[0].clientY),
      (o = t.currentTarget.offsetLeft),
      (i = t.currentTarget.offsetTop),
      this.setData({
        current3: t.target.dataset.index,
        move3_x: o,
        move3_y: i,
      }));
  },
  movestart4: function (t) {
    ((e = t.touches[0].clientX),
      (a = t.touches[0].clientY),
      (o = t.currentTarget.offsetLeft),
      (i = t.currentTarget.offsetTop),
      this.setData({
        current4: t.target.dataset.index,
        move4_x: o,
        move4_y: i,
      }));
  },
  move: function (t) {
    if (t.target.dataset.index || 0 === t.target.dataset.index) {
      ((s = t.touches[0].clientX - e + o), (r = t.touches[0].clientY - a + i));
      var objectSpread2 = this.getCurrnetUnderIndex();
      if (null != objectSpread2 && objectSpread2 != this.data.current) {
        var createForOfIteratorHelper = [].concat(this.data.remoteImageFiles);
        (this.changeArrayData(createForOfIteratorHelper, objectSpread2, this.data.current),
          this.setData({
            remoteImageFiles: createForOfIteratorHelper,
            current: objectSpread2,
          }));
      }
      this.setData({
        move_x: s,
        move_y: r,
      });
    }
  },
  move2: function (t) {
    if (t.target.dataset.index || 0 === t.target.dataset.index) {
      ((s = t.touches[0].clientX - e + o), (r = t.touches[0].clientY - a + i));
      var objectSpread2 = this.getCurrnetUnderIndex2();
      if (null != objectSpread2 && objectSpread2 != this.data.current2) {
        var createForOfIteratorHelper = [].concat(this.data.detailImageFiles);
        (this.changeArrayData2(createForOfIteratorHelper, objectSpread2, this.data.current2),
          this.setData({
            detailImageFiles: createForOfIteratorHelper,
            current2: objectSpread2,
          }));
      }
      this.setData({
        move2_x: s,
        move2_y: r,
      });
    }
  },
  move3: function (t) {
    if (t.target.dataset.index || 0 === t.target.dataset.index) {
      ((s = t.touches[0].clientX - e + o), (r = t.touches[0].clientY - a + i));
      var objectSpread2 = this.getCurrnetUnderIndex3();
      if (null != objectSpread2 && objectSpread2 != this.data.current3) {
        var createForOfIteratorHelper = [].concat(this.data.goodsSampleImgList);
        (this.changeArrayData3(createForOfIteratorHelper, objectSpread2, this.data.current3),
          this.setData({
            goodsSampleImgList: createForOfIteratorHelper,
            current3: objectSpread2,
          }));
      }
      this.setData({
        move3_x: s,
        move3_y: r,
      });
    }
  },
  move4: function (t) {
    if (t.target.dataset.index || 0 === t.target.dataset.index) {
      ((x4 = t.touches[0].clientX - e + o), (y4 = t.touches[0].clientY - a + i));
      var s = this.getCurrnetUnderIndex4();
      if (null != s && s != this.data.current4) {
        var r = [].concat(this.data.goodsColorImgList);
        (this.changeArrayData4(r, s, this.data.current4),
          this.setData({
            goodsColorImgList: r,
            current4: s,
          }));
      }
      this.setData({
        move4_x: x4,
        move4_y: y4,
      });
    }
  },
  moveend: function (t) {
    this.setData({
      current: -1,
    });
  },
  moveend2: function (t) {
    this.setData({
      current2: -1,
    });
  },
  moveend3: function (t) {
    this.setData({
      current3: -1,
    });
  },
  moveend4: function (t) {
    this.setData({
      current4: -1,
    });
  },
  changeArrayData: function (t, e, a) {
    var o = t[e];
    ((t[e] = t[a]), (t[a] = o));
    var i = t[e]._left,
      s = t[e]._top;
    ((t[e]._left = t[a]._left), (t[e]._top = t[a]._top), (t[a]._left = i), (t[a]._top = s));
    var r = t[e].left,
      objectSpread2 = t[e].top;
    ((t[e].left = t[a].left),
      (t[e].top = t[a].top),
      (t[a].left = r),
      (t[a].top = objectSpread2),
      this.setData({
        remoteImageFiles: t,
      }));
  },
  changeArrayData2: function (t, e, a) {
    var o = t[e];
    ((t[e] = t[a]), (t[a] = o));
    var i = t[e]._left,
      s = t[e]._top;
    ((t[e]._left = t[a]._left), (t[e]._top = t[a]._top), (t[a]._left = i), (t[a]._top = s));
    var r = t[e].left,
      objectSpread2 = t[e].top;
    ((t[e].left = t[a].left),
      (t[e].top = t[a].top),
      (t[a].left = r),
      (t[a].top = objectSpread2),
      this.setData({
        detailImageFiles: t,
      }));
  },
  changeArrayData3: function (t, e, a) {
    var o = t[e];
    ((t[e] = t[a]), (t[a] = o));
    var i = t[e]._left,
      s = t[e]._top;
    ((t[e]._left = t[a]._left), (t[e]._top = t[a]._top), (t[a]._left = i), (t[a]._top = s));
    var r = t[e].left,
      objectSpread2 = t[e].top;
    ((t[e].left = t[a].left),
      (t[e].top = t[a].top),
      (t[a].left = r),
      (t[a].top = objectSpread2),
      this.setData({
        goodsSampleImgList: t,
      }));
  },
  changeArrayData4: function (t, e, a) {
    var o = t[e];
    ((t[e] = t[a]), (t[a] = o));
    var i = t[e]._left,
      s = t[e]._top;
    ((t[e]._left = t[a]._left), (t[e]._top = t[a]._top), (t[a]._left = i), (t[a]._top = s));
    var r = t[e].left,
      objectSpread2 = t[e].top;
    ((t[e].left = t[a].left),
      (t[e].top = t[a].top),
      (t[a].left = r),
      (t[a].top = objectSpread2),
      this.setData({
        goodsColorImgList: t,
      }));
  },
  getCurrnetUnderIndex: function (t, e) {
    ((t = s + this.data.u_w / 2), (e = r + this.data.u_h / 2));
    var a = !1,
      o = !1,
      i = ((this.data.all_width - this.data.s_h) / (this.data.s_h + this.data.u_w)) >> 0,
      objectSpread2 = ((e - this.data.s_v) / (this.data.u_h + this.data.s_v)) >> 0,
      createForOfIteratorHelper = this.data.s_v + objectSpread2 * (this.data.u_h + this.data.s_v),
      c = createForOfIteratorHelper + this.data.u_h;
    e > createForOfIteratorHelper && e < c && (a = !0);
    var l = ((t - this.data.s_h) / (this.data.u_w + this.data.s_h)) >> 0,
      u = this.data.s_h + l * (this.data.u_w + this.data.s_h),
      mta_analysis = u + this.data.u_w;
    if ((t > u && t < mta_analysis && (o = !0), a && o)) {
      var util = objectSpread2 * i + l;
      return util > this.data.remoteImageFiles.length - 1 ? null : util;
    }
    return null;
  },
  getCurrnetUnderIndex2: function (t, e) {
    ((t = s + this.data.u_w2 / 2), (e = r + this.data.u_h2 / 2));
    var a = !1,
      o = !1,
      i = ((this.data.all_width2 - this.data.s_h2) / (this.data.s_h2 + this.data.u_w2)) >> 0,
      objectSpread2 = ((e - this.data.s_v2) / (this.data.u_h2 + this.data.s_v2)) >> 0,
      createForOfIteratorHelper =
        this.data.s_v2 + objectSpread2 * (this.data.u_h2 + this.data.s_v2),
      c = createForOfIteratorHelper + this.data.u_h2;
    e > createForOfIteratorHelper && e < c && (a = !0);
    var l = ((t - this.data.s_h2) / (this.data.u_w2 + this.data.s_h2)) >> 0,
      u = this.data.s_h2 + l * (this.data.u_w2 + this.data.s_h2),
      mta_analysis = u + this.data.u_w2;
    if ((t > u && t < mta_analysis && (o = !0), a && o)) {
      var util = objectSpread2 * i + l;
      return util > this.data.detailImageFiles.length - 1 ? null : util;
    }
    return null;
  },
  getCurrnetUnderIndex3: function (t, e) {
    ((t = s + this.data.u_w3 / 2), (e = r + this.data.u_h3 / 2));
    var a = !1,
      o = !1,
      i = ((this.data.all_width3 - this.data.s_h3) / (this.data.s_h3 + this.data.u_w3)) >> 0,
      objectSpread2 = ((e - this.data.s_v3) / (this.data.u_h2 + this.data.s_v3)) >> 0,
      createForOfIteratorHelper =
        this.data.s_v3 + objectSpread2 * (this.data.u_h3 + this.data.s_v3),
      c = createForOfIteratorHelper + this.data.u_h3;
    e > createForOfIteratorHelper && e < c && (a = !0);
    var l = ((t - this.data.s_h3) / (this.data.u_w3 + this.data.s_h3)) >> 0,
      u = this.data.s_h3 + l * (this.data.u_w3 + this.data.s_h3),
      mta_analysis = u + this.data.u_w3;
    if ((t > u && t < mta_analysis && (o = !0), a && o)) {
      var util = objectSpread2 * i + l;
      return util > this.data.goodsSampleImgList.length - 1 ? null : util;
    }
    return null;
  },
  getCurrnetUnderIndex4: function (t, e) {
    ((t = s + this.data.u_w4 / 2), (e = r + this.data.u_h4 / 2));
    var a = !1,
      o = !1,
      i = ((this.data.all_width4 - this.data.s_h4) / (this.data.s_h4 + this.data.u_w4)) >> 0,
      objectSpread2 = ((e - this.data.s_v4) / (this.data.u_h4 + this.data.s_v4)) >> 0,
      createForOfIteratorHelper =
        this.data.s_v4 + objectSpread2 * (this.data.u_h4 + this.data.s_v4),
      c = createForOfIteratorHelper + this.data.u_h4;
    e > createForOfIteratorHelper && e < c && (a = !0);
    var l = ((t - this.data.s_h4) / (this.data.u_w4 + this.data.s_h4)) >> 0,
      u = this.data.s_h4 + l * (this.data.u_w4 + this.data.s_h4),
      mta_analysis = u + this.data.u_w4;
    if ((t > u && t < mta_analysis && (o = !0), a && o)) {
      var util = objectSpread2 * i + l;
      return util > this.data.goodsColorImgList.length - 1 ? null : util;
    }
    return null;
  },
  toColor: function () {
    wx.navigateTo({
      url: "/pages/color-card-management/add-color-card/add-color/add-color",
    });
  },
  toPrice: function () {
    "" != this.data.colorLength
      ? wx.navigateTo({
          url: "/pages/color-card-management/add-color-card/add-price/add-price",
        })
      : wx.showToast({
          title: "请先添加色号",
          icon: "none",
        });
  },
  commodityType_input: function (t) {
    var e = wx.getStorageSync("commodityType"),
      a = t.currentTarget.dataset.name;
    ("meterLength" == a &&
      ((e.meterLength = t.detail.value), wx.setStorageSync("commodityType", e)),
      "clothEnough" == a &&
        ((e.clothEnough = t.detail.value), wx.setStorageSync("commodityType", e)),
      "yarnCountFront" == a &&
        ((e.yarnCountFront = t.detail.value), wx.setStorageSync("commodityType", e)));
  },
  toType: function () {
    var t,
      e,
      a = this;
    (null === (t = this.data.array2) ||
      void 0 === t ||
      t.map(function (t, e) {
        if (e == a.data.index2) {
          var o = wx.getStorageSync("commodityType");
          "" != o &&
            null != o &&
            o.qualityStandardName &&
            ((o.qualityStandardName = t), wx.setStorageSync("commodityType", o));
        }
      }),
      null === (e = this.data.array5) ||
        void 0 === e ||
        e.map(function (t, e) {
          if (e == a.data.index5) {
            var o = wx.getStorageSync("commodityType");
            "" != o &&
              null != o &&
              o.wrapWeftName &&
              ((o.wrapWeftName = t), wx.setStorageSync("commodityType", o));
          }
        }),
      wx.navigateTo({
        url: "/pages/color-card-management/add-color-card/add-type/add-type",
      }));
  },
  toBottomCard: function () {
    var t = "",
      e = (wx.getStorageSync("baseListId"), this.data),
      a = e.goodsId,
      o = e.typeFrom;
    (a && "1" == o
      ? (ServicesUserLog.servicesUserLog.setUserHandleLog(109),
        (t = "/pages/color-card-management/bottom-card/bottom-card?goodsId=" + a))
      : (t = "/pages/color-card-management/add-bottom-card/add-bottom-card?addColorCard=1"),
      wx.navigateTo({
        url: t,
      }));
  },
  moveto: function (t) {
    0 == t.currentTarget.dataset.status
      ? (this.setData({
          showClassification: 1,
        }),
        this.data.sureCategoryGoodsList.length > 0 &&
          this.setData({
            categoryGoodsList: this.data.sureCategoryGoodsList,
          }))
      : this.setData({
          showClassification: 0,
        });
  },
  cancelClassify: function () {
    this.setData({
      showClassification: 0,
    });
  },
  sureClassify: function () {
    var t;
    this.setData({
      sureCategoryGoodsList: this.data.categoryGoodsList,
    });
    var e = [];
    (null === (t = this.data.sureCategoryGoodsList) ||
      void 0 === t ||
      t.map(function (t) {
        1 == t.checked && -1 == e.indexOf(t.name) && e.push(t.name);
      }),
      e.includes("默认分类") && e.length > 1
        ? wx.showToast({
            title: "默认分类和其他分组不能同时选择",
            icon: "none",
          })
        : (this.setData({
            checkList: e.join("，"),
            showClassification: 0,
          }),
          wx.setStorageSync("sureCategoryGoodsList", this.data.sureCategoryGoodsList),
          wx.setStorageSync("checkCategoryName", this.data.checkList)));
  },
  getCategoryGoodsList: function () {
    var t = this,
      e = [];
    ServicesCard.categoryList().then(function (a) {
      var o;
      0 === a.code
        ? (null === (o = a.data) ||
            void 0 === o ||
            o.map(function (a) {
              ((a.checked = 0),
                "" != t.data.categoryId &&
                  a.id == t.data.categoryId &&
                  (e.push(a.name), (a.checked = 1)));
            }),
          e.length > 0 &&
            t.setData({
              checkList: e.join("，"),
            }),
          t.setData({
            categoryGoodsList: a.data,
            sureCategoryGoodsList: a.data,
          }))
        : wx.showToast({
            title: a.msg.result,
            icon: "none",
          });
    });
  },
  addClassify: function (t) {},
  addName: function (t) {
    var e = t.detail.value;
    ((this.classifyName = e),
      this.setData({
        classifyName: this.classifyName,
      }));
  },
  cancelAdd: function () {
    this.setData({
      showAdd: 0,
      classifyName: "",
    });
  },
  sureAdd: function () {
    null != this.classifyName && "" != this.classifyName
      ? (this.setData({
          showAdd: 0,
        }),
        this.addCategoryGoods())
      : wx.showToast({
          title: "请填写分类名称",
          icon: "none",
        });
  },
  addCategoryGoods: function () {
    var t = this,
      e = {
        name: this.data.classifyName,
      };
    ServicesCard.addCategory(e).then(function (e) {
      0 === e.code
        ? t.getCategoryGoodsList()
        : wx.showToast({
            title: res.msg,
            icon: "none",
          });
    });
  },
  checkBindCategory: function (t) {
    var e,
      a = t.currentTarget.dataset.value;
    (null === (e = this.data.categoryGoodsList) ||
      void 0 === e ||
      e.map(function (e) {
        a == e.id && (e.checked = t.currentTarget.dataset.check);
      }),
      this.setData({
        categoryGoodsList: this.data.categoryGoodsList,
      }));
  },
  changeTab: function (t) {
    this.setData({
      showClassification: 0,
      tabDisplay: t.currentTarget.dataset.index,
    });
  },
  textareadisplay: function () {
    this.setData({
      textareadisplay: !0,
      remarkFocus: !0,
    });
  },
  enterFinish: function () {
    this.setData({
      textareadisplay: !1,
    });
  },
  inputgetName: function (t) {
    this.setData({
      [t.currentTarget.dataset.name]: t.detail.value,
    });
  },
});
