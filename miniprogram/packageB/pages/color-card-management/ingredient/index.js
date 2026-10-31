var e = require("../../../../@babel/runtime/helpers/interopRequireDefault").default;
require("../../../../@babel/runtime/helpers/Arrayincludes");
var toConsumableArray = require("../../../../@babel/runtime/helpers/toConsumableArray"),
  objectSpread2 = require("../../../../@babel/runtime/helpers/objectSpread2"),
  i = require("../../../../@babel/runtime/helpers/defineProperty"),
  ServicesCard = require("../../../libs/services/ServicesCard"),
  dialog = e(require("../../../../miniprogram_npm/@vant/weapp/dialog/dialog")),
  ServicesUserLog = require("../../../../libs/services/ServicesUserLog"),
  app = getApp();
Page({
  data: {
    isEdit: !1,
    isCard: !1,
    saveNewCustomIngredient: !1,
    deletCustomIngredientArr: [],
    chooseIngredientList: [],
    commonIngredientList: "",
    otherIngredientList: "",
    customIngredientList: "",
    showChooseIngredient: !1,
    showAddIngredient: !1,
    addColorName: "",
    addColorEngName: "",
    originData: {},
    keyword: "",
    icon: {
      add: "".concat(app.config.imgHost, "/img/customer/ic_tianjia@2x.png?imageView2/2/w/800"),
      moreAdd: "".concat(
        app.config.imgHost,
        "/img/v2.12.0/Icon_Batch_Add@2x.png?imageView2/2/w/800",
      ),
      delete: "".concat(app.config.imgHost, "/img/customer/duibuIcon/icon2nd/deltel@2x.png"),
      edit: "".concat(app.config.imgHost, "/img/customer/duibuIcon/color_editor@2x.png"),
      delIngredient: "".concat(
        app.config.imgHost,
        "/img/customer/Icon_Delete.png?imageView2/2/w/50",
      ),
      centern: "".concat(app.config.imgHost, "/img/customer/duibuIcon/centern@2x.png"),
      delIngredient: "".concat(app.config.imgHost, "/img/customer/duibuIcon/define5@2x.png"),
      del: "".concat(app.config.imgHost, "/img/customer/duibuIcon/del@2x.png"),
      noDataBg: "".concat(app.config.imgHost, "/img/customer/duibuIcon/dz@2x.png"),
    },
    ingredientList: [],
  },
  options: {
    styleIsolation: "shared",
  },
  onSearch: function (e) {
    (console.log(e.detail),
      this.setData({
        commonIngredientList: this.filterKey(this.data.originData.common, e.detail),
        otherIngredientList: this.filterKey(this.data.originData.other, e.detail),
        customIngredientList: this.filterKey(this.data.originData.edit, e.detail),
      }));
  },
  deepCopy: function (e) {
    return JSON.parse(JSON.stringify(e));
  },
  clearAll: function () {
    this.setData({
      ingredientList: [],
    });
  },
  saveIngredientList: function () {
    var e = getCurrentPages(),
      toConsumableArray = this.data.isCard
        ? "pages/color-card-management/add-bottom-card/add-bottom-card"
        : "pages/color-card-management/add-color-card/add-color-card",
      i = e.find(function (e) {
        return e.route === toConsumableArray;
      });
    if (i) {
      var ServicesCard = this.data.ingredientList.map(function (e) {
        return e.ratio
          ? e
          : objectSpread2(
              objectSpread2({}, e),
              {},
              {
                ratio: "",
              },
            );
      });
      (i.updateIngredientList(ServicesCard),
        ServicesUserLog.servicesUserLog.setUserHandleLog(112),
        wx.navigateBack({
          delta: 1,
        }));
    }
  },
  savePushIngredient: function () {
    var e = this.data,
      objectSpread2 = e.ingredientList,
      i = e.chooseIngredientList;
    console.log(1111, objectSpread2, i);
    var ServicesCard;
    (i.forEach(function (e) {
      var toConsumableArray = objectSpread2.find(function (t) {
        return t.enName === e.enName;
      });
      toConsumableArray && toConsumableArray;
    }),
      (a = [].concat(toConsumableArray(objectSpread2), toConsumableArray(i))).length > 10
        ? wx.showToast({
            title: "对不起，单面料最多支持配置10个成分",
            icon: "none",
          })
        : (this.setData({
            ingredientList: ServicesCard,
          }),
          this.chooseIngredient()));
  },
  updateCustomIngredient: function () {
    var e = this,
      toConsumableArray = this.data,
      objectSpread2 = toConsumableArray.deletCustomIngredientArr,
      i = toConsumableArray.chooseIngredientList.filter(function (e) {
        return !objectSpread2.includes(e.id);
      });
    ServicesCard.servicesCard
      .shopIngredientDelete({
        ids: objectSpread2,
      })
      .then(function (t) {
        0 === t.code &&
          (e.setData({
            chooseIngredientList: i,
            isEdit: !e.data.isEdit,
            saveNewCustomIngredient: !1,
            deletCustomIngredientArr: [],
          }),
          objectSpread2.forEach(function (t) {
            var objectSpread2 = e.data.ingredientList.findIndex(function (e) {
              return e.id === t;
            });
            e.delItem({
              currentTarget: {
                dataset: {
                  index: objectSpread2,
                },
              },
            });
          }));
      });
  },
  changeEdit: function () {
    var e = this.data,
      toConsumableArray = e.isEdit,
      objectSpread2 = e.saveNewCustomIngredient;
    toConsumableArray && objectSpread2
      ? this.updateCustomIngredient()
      : this.setData({
          isEdit: !this.data.isEdit,
          saveNewCustomIngredient: !1,
          deletCustomIngredientArr: [],
        });
  },
  delCustomIngredient: function (e) {
    var toConsumableArray = this,
      objectSpread2 = e.currentTarget.dataset.item,
      i = this.data;
    (i.customIngredientList, i.deletCustomIngredientArr);
    ServicesCard.servicesCard
      .materialQueryCount({
        ids: [objectSpread2.id],
      })
      .then(function (e) {
        0 === e.code &&
          (e.data && e.data.length > 0
            ? dialog.default
                .confirm({
                  message: "该成分关联其他面料，是否确认删除？",
                })
                .then(function () {
                  toConsumableArray.delIngredient(objectSpread2);
                })
                .catch(function () {})
            : toConsumableArray.delIngredient(objectSpread2));
      });
  },
  delIngredient: function (e) {
    var objectSpread2 = this.data,
      i = objectSpread2.customIngredientList,
      ServicesCard = objectSpread2.deletCustomIngredientArr,
      dialog = i.filter(function (t) {
        return t.id !== e.id;
      });
    (this.setData({
      customIngredientList: dialog,
      saveNewCustomIngredient: !0,
      deletCustomIngredientArr: [].concat(toConsumableArray(ServicesCard), [e.id]),
    }),
      0 === this.data.customIngredientList.length && this.changeEdit());
  },
  handleChooseIngredient: function (e) {
    if (!this.data.isEdit) {
      var toConsumableArray = e.currentTarget.dataset,
        objectSpread2 = toConsumableArray.item,
        ServicesCard = toConsumableArray.type,
        dialog = this.data.chooseIngredientList,
        ServicesUserLog = this.data[ServicesCard],
        app = ServicesUserLog.find(function (e) {
          return e.id === objectSpread2.id;
        });
      (app.checked ? (app.checked = !1) : (app.checked = !0),
        dialog.find(function (e) {
          return e.id === objectSpread2.id;
        })
          ? (r = dialog.filter(function (e) {
              return e.id !== objectSpread2.id;
            }))
          : dialog.push(objectSpread2),
        this.setData({
          chooseIngredientList: dialog,
          ServicesCard: ServicesUserLog,
        }));
    }
  },
  saveNewIngredient: function () {
    var e = this,
      toConsumableArray = this.data,
      objectSpread2 = toConsumableArray.addColorName,
      i = toConsumableArray.addColorEngName,
      dialog = toConsumableArray.ingredientList;
    if ("" !== objectSpread2) {
      var app = {
          name: objectSpread2,
          enName: i,
          ratio: "",
        },
        s = {
          name: objectSpread2,
          enName: i,
        };
      ServicesCard.servicesCard.shopIngredientAdd(s).then(function (t) {
        if (0 === t.code) {
          if ((ServicesUserLog.servicesUserLog.setUserHandleLog(111), dialog.length >= 10))
            return void wx.showToast({
              title: "对不起，单面料最多支持配置10个成分",
              icon: "none",
            });
          ((app.id = t.data),
            dialog.push(app),
            e.setData({
              ingredientList: dialog,
            }),
            e.handleAddIngredient());
        } else
          wx.showToast({
            title: t.msg,
            icon: "none",
          });
      });
    } else
      wx.showToast({
        title: "中文名称不能为空",
        icon: "none",
      });
  },
  addName: function (e) {
    var toConsumableArray = e.currentTarget.dataset.name;
    this.setData({
      toConsumableArray: e.detail.value.trim(),
    });
  },
  handleAddIngredient: function () {
    this.setData({
      addColorName: "",
      addColorEngName: "",
      showAddIngredient: !this.data.showAddIngredient,
    });
  },
  delItem: function (e) {
    var toConsumableArray = e.currentTarget.dataset.index,
      objectSpread2 = this.data.ingredientList.filter(function (e, n) {
        return toConsumableArray != n;
      });
    this.setData({
      ingredientList: objectSpread2,
    });
  },
  inputIngredient: function (e) {
    var toConsumableArray = /^(\.*)(\d+)(\.?)(\d{0,2}).*$/g,
      objectSpread2 = e.detail.value;
    return toConsumableArray.test(objectSpread2)
      ? objectSpread2.replace(toConsumableArray, "$2$3$4")
      : "";
  },
  handleUpdateIngredient: function (e) {
    var toConsumableArray = e.detail.value,
      i = e.currentTarget.dataset.index,
      ServicesCard = this.data.ingredientList.map(function (e, a) {
        return a === i
          ? objectSpread2(
              objectSpread2({}, e),
              {},
              {
                ratio:
                  toConsumableArray > 100
                    ? (wx.showToast({
                        title: "成分比例不能超过100%",
                        icon: "none",
                      }),
                      e.ratio)
                    : toConsumableArray <= 0
                      ? (wx.showToast({
                          title: "成分比例不能少于0.1%",
                          icon: "none",
                        }),
                        e.ratio)
                      : toConsumableArray,
              },
            )
          : e;
      });
    this.setData({
      ingredientList: ServicesCard,
    });
  },
  filterKey: function (e, t) {
    return e.filter(function (e) {
      return e.name.includes(t) || e.enName.includes(t);
    });
  },
  chooseIngredient: function () {
    var e = this,
      toConsumableArray = this.data.ingredientList.map(function (e) {
        return e.id;
      });
    this.data.showChooseIngredient
      ? this.setData({
          showChooseIngredient: !this.data.showChooseIngredient,
          chooseIngredientList: [],
        })
      : (wx.showLoading(),
        ServicesCard.servicesCard.shopIngredient().then(function (n) {
          if (0 === n.code) {
            var i = n.data;
            (console.log(i),
              e.setData({
                commonIngredientList: i
                  .filter(function (e) {
                    return 1 === e.type;
                  })
                  .map(function (e) {
                    return {
                      name: e.name,
                      enName: e.enName,
                      id: e.id,
                      checked: toConsumableArray.includes(e.id),
                    };
                  }),
                otherIngredientList: i
                  .filter(function (e) {
                    return 2 === e.type;
                  })
                  .map(function (e) {
                    return {
                      name: e.name,
                      enName: e.enName,
                      id: e.id,
                      checked: toConsumableArray.includes(e.id),
                    };
                  }),
                customIngredientList: i
                  .filter(function (e) {
                    return 3 === e.type;
                  })
                  .map(function (e) {
                    return {
                      name: e.name,
                      enName: e.enName,
                      id: e.id,
                      checked: toConsumableArray.includes(e.id),
                    };
                  }),
                showChooseIngredient: !e.data.showChooseIngredient,
                originData: {
                  common: e.deepCopy(
                    i
                      .filter(function (e) {
                        return 1 === e.type;
                      })
                      .map(function (e) {
                        return {
                          name: e.name,
                          enName: e.enName,
                          id: e.id,
                          checked: toConsumableArray.includes(e.id),
                        };
                      }),
                  ),
                  other: e.deepCopy(
                    i
                      .filter(function (e) {
                        return 2 === e.type;
                      })
                      .map(function (e) {
                        return {
                          name: e.name,
                          enName: e.enName,
                          id: e.id,
                          checked: toConsumableArray.includes(e.id),
                        };
                      }),
                  ),
                  edit: e.deepCopy(
                    i
                      .filter(function (e) {
                        return 3 === e.type;
                      })
                      .map(function (e) {
                        return {
                          name: e.name,
                          enName: e.enName,
                          id: e.id,
                          checked: toConsumableArray.includes(e.id),
                        };
                      }),
                  ),
                },
              }));
          } else
            wx.showToast({
              title: n.msg,
              icon: "none",
              duration: 4e3,
            });
          wx.hideLoading();
        }));
  },
  onLoad: function (e) {
    ("undefined" !== e.list &&
      "null" !== e.list &&
      this.setData({
        ingredientList: JSON.parse(e.list),
      }),
      e.type &&
        this.setData({
          isCard: !0,
        }));
  },
  onReady: function () {},
  onShow: function () {},
  onHide: function () {},
  onUnload: function () {},
  onPullDownRefresh: function () {},
  onReachBottom: function () {},
  onShareAppMessage: function () {},
});
