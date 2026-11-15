var a,
  e,
  t = require("../../../../@babel/runtime/helpers/interopRequireDefault").default,
  i = require("../../../../@babel/runtime/helpers/defineProperty"),
  mta_analysis = t(require("../../../../utils/mta_analysis.js")),
  util = require("../../../../libs/utils/util"),
  ServicesUserLog = require("../../../../libs/services/ServicesUserLog.js"),
  ServicesCardType = require("../../../../libs/services/ServicesCardType.js").ServicesCardType,
  ServicesCard = require("../../../../libs/services/ServicesCard.js").servicesCard,
  app = getApp();
Page(
  ((e = {
    data:
      ((a = {
        icon: {
          edit: "".concat(app.config.imgHost, "/img/customer/ic_bianjidika.svg"),
          add: "".concat(app.config.imgHost, "/img/customer/ic_tianjia@4.5x.png"),
          phone: "".concat(app.config.imgHost, "/img/customer/duibuIcon/icon/phone.png"),
        },
        uploadPiece: 6,
        priceUnitChange: {
          0: "米",
          1: "公斤",
          2: "码",
          3: "吨",
          4: "盎司",
          5: "个",
        },
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
        imageList: [],
        viewDisplay: "add",
        showAdd: 0,
        showType: "addclassify",
        classifyName: "",
        cover: wx.canIUse("cover-view"),
        remoteImageFiles: [],
        sourceTypeIndex: 2,
        sourceType: ["拍照", "相册", "拍照或相册"],
        sizeTypeIndex: 0,
        sizeType: ["压缩", "原图", "压缩或原图"],
        countIndex: 8,
        count: [1, 2, 3, 4, 5, 6, 7, 8, 9],
      }),
      i(
        i(
          i(
            i(
              i(
                i(
                  i(
                    i(
                      i(i(a, "array2", ["米", "公斤", "码", "吨", "盎司", "个"]), "index2", 0),
                      "goodsId",
                      "",
                    ),
                    "isRepeat",
                    !1,
                  ),
                  "array3",
                  ["g", "g/m", "g/m²", "oz/y²"],
                ),
                "index3",
                0,
              ),
              "array4",
              ["cm", "inch"],
            ),
            "index4",
            0,
          ),
          "icon",
          {
            add: "".concat(app.config.imgHost, "/img/customer/ic_tianjia@4.5x.png"),
          },
        ),
        "colorLength",
        "",
      ),
      i(
        i(
          i(
            i(
              i(
                i(
                  i(
                    i(
                      i(
                        i(a, "cardDetailsInfo", {
                          imgList: [],
                          businessProductName: "",
                          spuNumber: "",
                          price: "",
                          priceUnit: "米",
                          companyName: "",
                          contacter: "",
                          mobileNumber: "",
                          faxNumber: "",
                          warehouseAddress: "",
                          factoryAddress: "",
                          remark: "",
                          telephoneNumber: "",
                          materialList: null,
                          materialNew: null,
                          gramWeight: "",
                          clothWidth: "",
                          shrinkage: "",
                        }),
                        "productNameError",
                        "",
                      ),
                      "shelvesNumberError",
                      "",
                    ),
                    "editSourceProductName",
                    "",
                  ),
                  "editSourceSpuNumber",
                  "",
                ),
                "isLoadingPhoto",
                "",
              ),
              "lastTapDiffTime",
              0,
            ),
            "current",
            -1,
          ),
          "s_v",
          10,
        ),
        "s_h",
        10,
      ),
      i(
        i(
          i(
            i(i(i(i(i(a, "u_w", 77), "u_h", 77), "all_width", ""), "move_x", ""), "move_y", ""),
            "gbcId",
            "",
          ),
          "duibuImageFiles",
          [
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
        ),
        "isShowTwo",
        !1,
      )),
    uoloadImg: function (a) {
      var e = a.detail.showImgList;
      this.setData({
        imageList: e,
      });
    },
    delImg: function (a) {
      var e = a.detail.showImgList;
      this.setData({
        imageList: e,
      });
    },
    inputgetName: function (a) {
      this.setData({
        [a.currentTarget.dataset.name]: a.detail.value,
      });
    },
    addList: function () {
      if (
        (console.log(this.data.cardDetailsInfo),
        "" != this.data.cardDetailsInfo.businessProductName)
      ) {
        if (this.data.cardDetailsInfo.price)
          if (this.sum(this.data.cardDetailsInfo.price, ".") > 1)
            return void wx.showToast({
              icon: "none",
              title: "请填写正确的价格",
            });
        var a = this,
          e = {
            imgList: a.data.imageList.map(function (a) {
              return {
                storagePath: a,
                name: a,
              };
            }),
            businessProductName: a.data.cardDetailsInfo.businessProductName,
            spuNumber: a.data.cardDetailsInfo.spuNumber,
            colorList: wx.getStorageSync("colorColorCardList")
              ? wx.getStorageSync("colorColorCardList")
              : null,
            goodsShelves: a.data.cardDetailsInfo.goodsShelves,
            gramWeight: a.data.cardDetailsInfo.gramWeight || "",
            weightUnit: a.data.array3[a.data.index3],
            materialList: this.data.cardDetailsInfo.materialList,
            clothWidth: this.data.cardDetailsInfo.clothWidth || "",
            clothWidthUnit: a.data.array4[a.data.index4],
            shrinkage: this.data.cardDetailsInfo.shrinkage,
            price: a.data.cardDetailsInfo.price,
            priceUnit: a.data.cardDetailsInfo.priceUnit,
            companyName: a.data.cardDetailsInfo.companyName,
            contacter: a.data.cardDetailsInfo.contacter,
            mobileNumber: a.data.cardDetailsInfo.mobileNumber,
            telephoneNumber: a.data.cardDetailsInfo.telephoneNumber,
            faxNumber: a.data.cardDetailsInfo.faxNumber,
            warehouseAddress: a.data.cardDetailsInfo.warehouseAddress,
            factoryAddress: a.data.cardDetailsInfo.factoryAddress,
            remark: a.data.cardDetailsInfo.remark,
            productId: a.data.goodsId,
          },
          t = wx.getStorageSync("commodityType");
        ("" != t &&
          null != t &&
          ((e.meterLength = t.meterLength),
          (e.clothEnough = t.clothEnough),
          (e.wrapWeftName = t.wrapWeftName),
          (e.wrapWeftId = t.wrapWeftId),
          (e.qualityStandardName = t.qualityStandardName),
          (e.qualityStandardId = t.qualityStandardId),
          (e.yarnCountFront = t.yarnCountFront),
          (e.density1 = t.density1),
          this.setData({
            commodityType: t,
          })),
          ServicesCardType.addBaseCard(e).then(function (t) {
            if (0 === t.code) {
              (ServicesUserLog.servicesUserLog.setUserHandleLog(107),
                a.data.goodsId || ((e.id = t.data), wx.setStorageSync("bottomCardInfo", e)));
              var i = wx.getStorageSync("baseListId") || [];
              (i.push(t.data),
                wx.setStorageSync("baseListId", i),
                wx.removeStorageSync("colorColorCardList"),
                wx.removeStorageSync("commodityType"),
                wx.navigateBack({}));
            } else
              wx.showToast({
                title: t.msg,
                icon: "none",
              });
          }));
      } else
        wx.showToast({
          icon: "none",
          title: "请填写品名",
        });
    },
    bindPickerChange2: function (a) {
      (this.setData({
        "cardDetailsInfo.priceUnit": this.data.priceUnitChange[a.detail.value],
        "cardDetailsInfo.priceUnit": this.data.priceUnitChange[a.detail.value],
      }),
        console.log("picker发送选择改变，携带值为", this.data.cardDetailsInfo.priceUnit),
        this.setData({
          index2: a.detail.value,
        }));
    },
    onInputValuation: function (a) {
      var e = a.currentTarget.dataset.name,
        t = a.detail;
      this.setData({
        ["cardDetailsInfo." + e]: t,
      });
    },
    onInputProductName: function (a) {
      var e = this;
      this.setData({
        productNameError: "",
      });
      var t = a.detail.value;
      if (t && (!this.data.editSourceProductName || this.data.editSourceProductName !== t)) {
        var i = {
          companyId: app.globalData.userInfo.companyId,
          productName: t,
          type: 2,
        };
        ServicesCard.checkRepeatProductName(i).then(function (a) {
          0 === a.code &&
            a.data &&
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
    onInputShelvesNumber: function (a) {
      var e = this;
      this.setData({
        shelvesNumberError: "",
      });
      var t = a.detail.value;
      if (t && (!this.data.editSourceSpuNumber || this.data.editSourceSpuNumber !== t)) {
        var i = {
          companyId: app.globalData.userInfo.companyId,
          shelvesNumber: t,
          type: 2,
        };
        ServicesCard.checkRepeatShelvesNumber(i).then(function (a) {
          0 === a.code &&
            a.data &&
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
    baseCardDetail: function (a) {
      var e = this,
        t = this,
        i = {
          id: a,
          productId: t.data.goodsId,
        };
      ServicesCardType.baseCardDetail(i).then(function (a) {
        if (0 === a.code) {
          e.setData({
            colorLength: "合计" + a.data.colorList.length + "种色号",
            cardDetailsInfo: a.data,
            editSourceProductName: a.data.businessProductName,
            editSourceSpuNumber: a.data.spuNumber,
          });
          var i = {};
          ((i.meterLength = a.data.meterLength),
            (i.clothEnough = a.data.clothEnough),
            (i.wrapWeftName = a.data.wrapWeftName),
            (i.wrapWeftId = a.data.wrapWeftId),
            (i.qualityStandardName = a.data.qualityStandardName),
            (i.qualityStandardId = a.data.qualityStandardId),
            (i.yarnCountFront = a.data.yarnCountFront),
            (i.density1 = a.data.density1),
            e.setData({
              commodityType: i,
            }),
            wx.setStorageSync("commodityType", i),
            wx.setStorageSync("colorColorCardList", a.data.colorList));
          var mta_analysis = a.data.imgList.map(function (a) {
            return util.utils.replImage(a.storagePath);
          });
          (a.data.detailImage.imageFive0 && a.data.detailImage.imageTwo0
            ? t.setData({
                isShowTwo: !0,
              })
            : t.setData({
                isShowTwo: !1,
              }),
            e.data.duibuImageFiles.forEach(function (e) {
              e.value = util.utils.replImage(a.data.detailImage[e.prop]);
            }),
            t.setData({
              cardDetailsInfo: t.data.cardDetailsInfo,
              imageList: mta_analysis,
              duibuImageFiles: e.data.duibuImageFiles,
            }));
        } else
          wx.showToast({
            title: a.msg,
            icon: "none",
          });
      });
    },
    toColor: function () {
      wx.navigateTo({
        url: "/packageB/pages/color-card-management/add-color-card/add-color/add-color",
      });
    },
    swipclick: function (a) {
      var e = a.currentTarget.dataset.index,
        t = [];
      (this.data.imageList.forEach(function (a) {
        t.push(a + "?imageView2/2/w/1000");
      }),
        wx.previewImage({
          current: e,
          urls: t,
        }));
    },
    toIngredient: function () {
      wx.navigateTo({
        url: "/packageB/pages/color-card-management/ingredient/index?list=".concat(
          JSON.stringify(this.data.cardDetailsInfo.materialList),
        ),
      });
    },
    commodityType_input: function (a) {
      var e = wx.getStorageSync("commodityType"),
        t = a.currentTarget.dataset.name;
      ("meterLength" == t &&
        ((e.meterLength = a.detail.value), wx.setStorageSync("commodityType", e)),
        "clothEnough" == t &&
          ((e.clothEnough = a.detail.value), wx.setStorageSync("commodityType", e)),
        "yarnCountFront" == t &&
          ((e.yarnCountFront = a.detail.value), wx.setStorageSync("commodityType", e)));
    },
    toType: function () {
      var a,
        e,
        t = this;
      (null === (a = this.data.array2) ||
        void 0 === a ||
        a.map(function (a, e) {
          if (e == t.data.index2) {
            var i = wx.getStorageSync("commodityType");
            "" != i &&
              null != i &&
              i.qualityStandardName &&
              ((i.qualityStandardName = a), wx.setStorageSync("commodityType", i));
          }
        }),
        null === (e = this.data.array5) ||
          void 0 === e ||
          e.map(function (a, e) {
            if (e == t.data.index5) {
              var i = wx.getStorageSync("commodityType");
              "" != i &&
                null != i &&
                i.wrapWeftName &&
                ((i.wrapWeftName = a), wx.setStorageSync("commodityType", i));
            }
          }),
        wx.navigateTo({
          url: "/packageB/pages/color-card-management/add-color-card/add-type/add-type",
        }));
    },
    onLoad: function (a) {
      (mta_analysis.default.Page.init(),
        a.goodsId &&
          (this.setData({
            goodsId: a.goodsId,
          }),
          this.setData({
            viewDisplay: "add",
          })),
        a.id &&
          "undefined" != a.id &&
          (wx.setNavigationBarTitle({
            title: "底卡预览",
          }),
          this.baseCardDetail(a.id),
          this.setData({
            gbcId: a.id,
          }),
          this.setData({
            viewDisplay: "see",
          })),
        wx.hideShareMenu());
    },
    edit: function () {
      (wx.setNavigationBarTitle({
        title: "编辑底卡",
      }),
        this.setData({
          viewDisplay: "edit",
        }));
    },
    deleteBaseCard: function () {
      var a = this;
      wx.showModal({
        title: "提示",
        content: "确定删除底卡？",
        success: function (e) {
          if (e.confirm) {
            var t = {
                id: a.data.gbcId,
                productId: a.data.goodsId,
              },
              i = wx.getStorageSync("baseListId");
            ServicesCardType.deleteBaseCard(t).then(function (e) {
              if (0 === e.code) {
                if ((ServicesUserLog.servicesUserLog.setUserHandleLog(110), i.length > 0)) {
                  for (var t = 0; t < i.length; t++)
                    if (a.data.gbcId === i[t]) {
                      i.splice(t, 1);
                      break;
                    }
                  wx.setStorageSync("baseListId", i);
                }
                wx.showToast({
                  icon: "none",
                  title: "删除成功",
                  success: function () {
                    wx.navigateBack({
                      delta: 1,
                    });
                  },
                });
              } else
                wx.showToast({
                  title: e.msg,
                  icon: "none",
                });
            });
          } else e.cancel && console.log("用户点击取消");
        },
      });
    },
    sum: function (a, e) {
      for (var t = a.indexOf(e), i = 0; -1 !== t;) (console.log(t), i++, (t = a.indexOf(e, t + 1)));
      return i;
    },
    updateBaseCard: function () {
      var a = this;
      if (a.data.cardDetailsInfo.price && a.sum(a.data.cardDetailsInfo.price, ".") > 1)
        return void wx.showToast({
          icon: "none",
          title: "请填写正确的价格",
        });
      if (a.data.cardDetailsInfo.businessProductName) {
        wx.showLoading({
          title: "拼命加载中...",
        });
        var e = {
            imgList: a.data.imageList.map(function (a) {
              return {
                storagePath: a,
                name: a,
              };
            }),
            businessProductName: a.data.cardDetailsInfo.businessProductName,
            spuNumber: a.data.cardDetailsInfo.spuNumber,
            colorList: wx.getStorageSync("colorColorCardList")
              ? wx.getStorageSync("colorColorCardList")
              : null,
            goodsShelves: a.data.cardDetailsInfo.goodsShelves,
            gramWeight: a.data.cardDetailsInfo.gramWeight || "",
            weightUnit: a.data.array3[a.data.index3],
            materialList: this.data.cardDetailsInfo.materialList,
            clothWidth: this.data.cardDetailsInfo.clothWidth || "",
            clothWidthUnit: a.data.array4[a.data.index4],
            shrinkage: this.data.cardDetailsInfo.shrinkage,
            price: a.data.cardDetailsInfo.price,
            priceUnit: a.data.cardDetailsInfo.priceUnit,
            companyName: a.data.cardDetailsInfo.companyName,
            contacter: a.data.cardDetailsInfo.contacter,
            mobileNumber: a.data.cardDetailsInfo.mobileNumber,
            telephoneNumber: a.data.cardDetailsInfo.telephoneNumber,
            faxNumber: a.data.cardDetailsInfo.faxNumber,
            warehouseAddress: a.data.cardDetailsInfo.warehouseAddress,
            factoryAddress: a.data.cardDetailsInfo.factoryAddress,
            remark: a.data.cardDetailsInfo.remark,
            productId: a.data.goodsId,
            id: a.data.gbcId,
          },
          t = wx.getStorageSync("commodityType");
        ("" != t &&
          null != t &&
          ((e.meterLength = t.meterLength),
          (e.clothEnough = t.clothEnough),
          (e.wrapWeftName = t.wrapWeftName),
          (e.wrapWeftId = t.wrapWeftId),
          (e.qualityStandardName = t.qualityStandardName),
          (e.qualityStandardId = t.qualityStandardId),
          (e.yarnCountFront = t.yarnCountFront),
          (e.density1 = t.density1),
          this.setData({
            commodityType: t,
          })),
          ServicesCardType.updateBaseCard(e).then(function (t) {
            0 === t.code
              ? (ServicesUserLog.servicesUserLog.setUserHandleLog(108),
                a.setData({
                  viewDisplay: "see",
                  "cardDetailsInfo.colorList": e.colorList,
                }),
                wx.setNavigationBarTitle({
                  title: "底卡预览",
                }),
                wx.hideLoading(),
                wx.showToast({
                  icon: "none",
                  title: "成功",
                }))
              : wx.showToast({
                  title: t.msg,
                  icon: "none",
                });
          }));
      } else
        wx.showToast({
          icon: "none",
          title: "请填写品名",
        });
    },
    callSeller: function (a) {
      wx.makePhoneCall({
        phoneNumber: a.currentTarget.dataset.phone,
      });
    },
    updateIngredientList: function (a) {
      var e = "";
      (a.forEach(function (a) {
        e = e + a.name + a.ratio + "".concat(a.ratio ? "%," : ",");
      }),
        (e = e.substring(0, e.length - 1)),
        this.setData({
          "cardDetailsInfo.materialList": a,
          "cardDetailsInfo.materialNew": e,
          "cardDetailsInfo.material": e,
        }));
    },
  }),
  i(
    i(
      i(
        i(
          i(
            i(
              i(
                i(
                  i(
                    i(e, "toIngredient", function () {
                      wx.navigateTo({
                        url: "/packageB/pages/color-card-management/ingredient/index?list=".concat(
                          JSON.stringify(this.data.cardDetailsInfo.materialList),
                          '&&type="card"',
                        ),
                      });
                    }),
                    "bindPickerChange3",
                    function (a) {
                      this.setData({
                        index3: a.detail.value,
                      });
                    },
                  ),
                  "bindPickerChange4",
                  function (a) {
                    this.setData({
                      index4: a.detail.value,
                    });
                  },
                ),
                "toColor",
                function () {
                  wx.navigateTo({
                    url: "/packageB/pages/color-card-management/add-color-card/add-color/add-color",
                  });
                },
              ),
              "toType",
              function () {
                wx.navigateTo({
                  url: "/packageB/pages/color-card-management/add-color-card/add-type/add-type",
                });
              },
            ),
            "detailImgDuibuTap",
            function (a) {
              var e = a.currentTarget.dataset.index,
                t = [];
              (this.data.duibuImageFiles.forEach(function (a) {
                t.push(a.value + "?imageView2/2/w/1000");
              }),
                wx.previewImage({
                  current: t[e],
                  urls: t,
                }));
            },
          ),
          "onReady",
          function () {},
        ),
        "onShow",
        function () {
          var a = wx.getStorageSync("bottomCardInfo"),
            e = wx.getStorageSync("colorColorCardList");
          if (
            ("" != e &&
              null != e &&
              ((this.data.colorLength = e.length),
              this.setData({
                colorLength: "合计" + this.data.colorLength + "种色号",
              })),
            !this.data.gbcId && a)
          ) {
            var t,
              i = a,
              mta_analysis =
                null === (t = a.imgList) || void 0 === t
                  ? void 0
                  : t.map(function (a) {
                      return util.utils.replImage(a.storagePath);
                    });
            this.setData({
              cardDetailsInfo: i,
              imageList: mta_analysis,
            });
          }
        },
      ),
      "onHide",
      function () {},
    ),
    "onUnload",
    function () {
      (wx.removeStorageSync("colorColorCardList"), wx.removeStorageSync("commodityType"));
    },
  ),
  i(
    i(
      i(e, "onPullDownRefresh", function () {}),
      "onReachBottom",
      function () {},
    ),
    "onShareAppMessage",
    function () {},
  )),
);
