var objectSpread2 = require("../../@babel/runtime/helpers/objectSpread2"),
  ServicesUserLog = require("../../libs/services/ServicesUserLog"),
  util = require("../../libs/utils/util"),
  app = getApp(),
  ServicesShop = require("../../libs/services/ServicesShop.js").servicesShop;
Component({
  properties: {
    list: {
      type: Object,
      value: {},
    },
    idx: {
      type: String,
      value: "",
    },
    newPrintType: {
      type: Number,
      value: 1,
    },
    showbottom: {
      type: Boolean,
      value: !1,
    },
    categoryId: {
      type: String,
      value: "",
    },
    listTotle: {
      type: Number,
      value: 0,
    },
    filterKey: {
      type: Number,
      value: 0,
    },
    isSearch: {
      type: Boolean,
      value: !1,
    },
    isShareProd: {
      type: Boolean,
      value: !1,
    },
    searchMode: {
      type: Boolean,
      value: !1,
    },
  },
  data: {
    mainImgPath: "",
    userAuthList: {},
    imgOssHost: app.config.imgOssHost,
    imgBg: "".concat(app.config.imgHost, "/img/customer/headimg.jpg"),
    icon: {
      moveup: "".concat(app.config.imgHost, "/img/v2.14.0/Icon_Top_Up@2x.png"),
      movedown: "".concat(app.config.imgHost, "/img/v2.14.0/Icon_Top_Down@2x.png"),
      moveupDisable: "".concat(app.config.imgHost, "/img/v2.14.0/Icon_Top_Up_Disable@2x.png"),
      movedownDisable: "".concat(app.config.imgHost, "/img/v2.14.0/Icon_Top_Down_Disable@2x.png"),
    },
    action: [
      {
        name: "预览",
        icon: "".concat(app.config.imgHost, "/img/v2.7.4/Icon_Preview_Eyes@2x.png"),
        action: "preview",
        auth: "",
      },
      {
        name: "底卡",
        icon: "".concat(app.config.imgHost, "/img/v2.7.4/Icon_Back_Card@2x.png"),
        action: "bottom",
        auth: "goods:baseCard:manage",
      },
      {
        name: "",
        icon: "",
        action: "off",
        auth: "",
      },
      {
        name: "色号",
        icon: "".concat(app.config.imgHost, "/img/v2.7.4/Icon_Back_Card@2x.png"),
        action: "color",
        auth: "",
      },
      {
        name: "分享",
        icon: "".concat(app.config.imgHost, "/img/v2.7.4/Icon_Share@2x.png"),
        action: "share",
        auth: "",
      },
    ],
    permission: {
      all: {
        name: "所有人可见",
        icon: "".concat(app.config.imgHost, "/img/customer/ic_suoyouren@2x.png"),
      },
      some: {
        name: "指定客户可见",
        icon: "".concat(app.config.imgHost, "/img/customer/ic_zhidingyonghu@2x.png"),
      },
    },
    popupShow: !1,
    printType: ["打印标签", "打印布头"],
  },
  observers: {
    list: function (t) {
      this.setData({
        mainImgPath: util.utils.replImage(t.mainImgPath, 300),
      });
    },
  },
  attached: function () {
    this.getAuthList();
  },
  methods: {
    moveup: function (t) {
      if (0 != this.data.idx) {
        var ServicesUserLog = t.currentTarget.dataset.curid,
          util = {
            categoryId: this.data.categoryId,
            currentGoodsId: ServicesUserLog,
            sortType: 1,
          };
        this.triggerEvent("moveitem", util);
      }
    },
    movedown: function (t) {
      if (this.data.listTotle != Number(this.data.idx)) {
        console.log(t);
        var ServicesUserLog = t.currentTarget.dataset.curid,
          util = {
            categoryId: this.data.categoryId,
            currentGoodsId: ServicesUserLog,
            sortType: 2,
          };
        this.triggerEvent("moveitem", util);
      }
    },
    getAuthList: function () {
      var ServicesUserLog = this,
        util = app.userAuthList,
        ServicesShop = this.data.action;
      ((a = ServicesShop.map(function (o) {
        var app, ServicesShop, r;
        return o.name
          ? o
          : objectSpread2(
              objectSpread2({}, o),
              {},
              {
                name:
                  null === (i = ServicesUserLog.properties.list.onOrOff) || void 0 === app
                    ? void 0
                    : app.name,
                icon:
                  null === (a = ServicesUserLog.properties.list.onOrOff) || void 0 === ServicesShop
                    ? void 0
                    : ServicesShop.icon,
                auth:
                  "下架" ===
                  (null === (r = ServicesUserLog.properties.list.onOrOff) || void 0 === r
                    ? void 0
                    : r.name)
                    ? "goods:batchSetOffSale"
                    : "goods:batchSetOnSale",
              },
            );
      })),
        util["goods:update"] ||
          (a = ServicesShop.filter(function (t) {
            return "goods:update" !== t.auth;
          })),
        util["goods:baseCard:manage"] ||
          (a = ServicesShop.filter(function (t) {
            return "goods:baseCard:manage" !== t.auth;
          })),
        util["goods:batchSetOffSale"] ||
          (a = ServicesShop.filter(function (t) {
            return "goods:batchSetOffSale" !== t.auth;
          })),
        util["goods:batchSetOnSale"] ||
          (a = ServicesShop.filter(function (t) {
            return "goods:batchSetOnSale" !== t.auth;
          })),
        this.setData({
          userAuthList: util,
          action: ServicesShop,
        }));
    },
    actionTap: function (t) {
      var app = t.currentTarget.dataset,
        ServicesShop = app.action,
        r = app.goodsid,
        s = app.name,
        n = app.idx;
      switch ((console.log(t), ServicesShop)) {
        case "edit":
          (wx.removeStorageSync("checkColorItem"),
            wx.navigateTo({
              url: "/packageB/pages/color-card-management/add-color-card/add-color-card?goodsId=".concat(
                r,
                "&type=1&delType=1",
              ),
            }),
            this.triggerEvent("isUpdate", !0));
          break;
        case "preview":
          return (
            wx.navigateTo({
              url: "/packageB/pages/color-card-management/preview/preview?goodsId=".concat(r),
            }),
            void this.triggerEvent("isUpdate", !1)
          );
        case "bottom":
          (ServicesUserLog.servicesUserLog.setUserHandleLog(109),
            wx.navigateTo({
              url: "/packageB/pages/color-card-management/bottom-card/bottom-card?goodsId=".concat(r),
            }),
            this.triggerEvent("isUpdate", !0));
          break;
        case "off":
          "上架" == s
            ? this.triggerEvent("onOrOff", {
                goodsid: r,
                operateType: 1,
                idx: n,
              })
            : "下架" == s &&
              this.triggerEvent("onOrOff", {
                goodsid: r,
                operateType: 0,
                idx: n,
              });
          break;
        case "color":
          wx.navigateTo({
            url: "/packageB/pages/color-card-management/add-colour/add-colour?goodsId=".concat(r),
          });
          break;
        case "share":
          (this.setData({
            popupShow: !0,
          }),
            this.triggerEvent("shareF", {
              goodsid: this.properties.list.id,
              name: this.properties.list.businessProductName || this.properties.list.goodsName,
              img: util.utils.replImage(this.properties.list.mainImgPath),
              price: this.properties.list.price,
              unit: this.properties.list.priceUnit,
            }));
      }
    },
    printTap: function (t) {
      ServicesShop.operateAccess({
        type: "103",
      }).then(function (t) {});
      var ServicesUserLog = t.currentTarget.dataset.goodsid,
        util = this.data.newPrintType;
      wx.showActionSheet({
        itemList: ["打印标签", "打印色号", "打印布头"],
        itemColor: "#4C7CF9",
        success: function (t) {
          0 == t.tapIndex
            ? (console.log("打印标签"),
              wx.navigateTo({
                url: "/packageB/pages/color-card-management/print/print?goodsId="
                  .concat(ServicesUserLog, "&&newPrintType=")
                  .concat(util),
              }))
            : 2 == t.tapIndex
              ? (console.log("打印布头"),
                wx.navigateTo({
                  url: "/packageB/pages/color-card-management/print-cloth-head/print-cloth-head?goodsId="
                    .concat(ServicesUserLog, "&&newPrintType=")
                    .concat(util),
                }))
              : 1 == t.tapIndex &&
                (console.log("打印色号"),
                wx.navigateTo({
                  url: "/packageB/pages/color-card-management/print-color-num/index?goodsId="
                    .concat(ServicesUserLog, "&&newPrintType=")
                    .concat(util),
                }));
        },
        fail: function (t) {
          console.log(t.errMsg);
        },
      });
    },
    popupHide: function () {
      this.setData({
        popupShow: !1,
      });
    },
    shareF: function (t) {
      this.setData({
        popupShow: !1,
      });
    },
    shareM: function (t) {
      this.setData({
        popupShow: !1,
      });
      t.detail.goodsid;
      this.triggerEvent("shareM", {
        goodsid: this.properties.list.id,
        name: this.properties.list.businessProductName || this.properties.list.goodsName,
        img: util.utils.replImage(this.properties.list.mainImgPath),
        price: this.properties.list.price,
        unit: this.properties.list.priceUnit,
      });
    },
    shareColorCard: function (t) {
      this.setData({
        popupShow: !1,
      });
      t.detail.goodsid;
      this.triggerEvent("colorCard", {
        goodsid: this.properties.list.id,
        companyName: this.properties.list.companyName,
        name: this.properties.list.businessProductName || this.properties.list.goodsName,
        img: util.utils.replImage(this.properties.list.mainImgPath),
        colorList: this.properties.list.colorList,
        price: this.properties.list.price,
        unit: this.properties.list.priceUnit,
      });
    },
    goEditPage: function (t) {
      var ServicesUserLog = t.currentTarget.dataset,
        util = ServicesUserLog.goodsid,
        app = ServicesUserLog.parentid;
      if (this.properties.isSearch)
        wx.navigateTo({
          url: "/packageB/pages/color-card-management/preview/preview?goodsId=".concat(util),
        });
      else if (this.properties.searchMode && app > 0)
        wx.navigateTo({
          url: "/packageB/pages/color-card-management/add-bottom-card/add-bottom-card?id="
            .concat(util, "&goodsId=")
            .concat(app),
        });
      else {
        if (!this.data.userAuthList["goods:update"])
          return void wx.showToast({
            title: "没有编辑权限",
            icon: "none",
          });
        wx.navigateTo({
          url: "/packageB/pages/color-card-management/add-color-card/add-color-card?goodsId=".concat(
            util,
            "&type=1&delType=1",
          ),
        });
      }
      this.triggerEvent("isUpdate", !0);
    },
    ontoProductCard: function (t) {
      var ServicesUserLog = t.currentTarget.dataset.item;
      this.triggerEvent("moveBottomCard", ServicesUserLog);
    },
  },
});
