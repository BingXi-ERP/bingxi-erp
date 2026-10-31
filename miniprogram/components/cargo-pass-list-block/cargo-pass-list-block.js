var ServicesUserLog = require("../../libs/services/ServicesUserLog"),
  util = require("../../libs/utils/util"),
  app = getApp();
require("../../libs/services/ServicesShop.js").servicesShop;
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
  },
  data: {
    storagePath: "",
    userAuthList: app.userAuthList,
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
        name: "编辑",
        icon: "".concat(app.config.imgHost, "/img/v2.7.4/Icon_Edit_Pen@2x.png"),
        action: "edit",
        auth: "goods:update",
      },
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
    list: function (e) {
      this.setData({
        storagePath: util.utils.replImage(e.storagePath, 300),
      });
    },
  },
  methods: {
    moveup: function (e) {
      if (0 != this.data.idx) {
        var util = e.currentTarget.dataset.curid,
          app = {
            categoryId: this.data.categoryId,
            currentGoodsId: util,
            sortType: 1,
          };
        this.triggerEvent("moveitem", app);
      }
    },
    movedown: function (e) {
      if (this.data.listTotle != Number(this.data.idx)) {
        console.log(e);
        var util = e.currentTarget.dataset.curid,
          app = {
            categoryId: this.data.categoryId,
            currentGoodsId: util,
            sortType: 2,
          };
        this.triggerEvent("moveitem", app);
      }
    },
    actionTap: function (o) {
      var i = o.currentTarget.dataset,
        a = i.action,
        s = i.goodsid,
        r = i.name,
        n = i.idx;
      switch ((console.log(o), a)) {
        case "edit":
          (wx.removeStorageSync("checkColorItem"),
            wx.navigateTo({
              url: "/pages/color-card-management/add-color-card/add-color-card?goodsId=".concat(
                s,
                "&type=1&delType=1",
              ),
            }),
            this.triggerEvent("isUpdate", !0));
          break;
        case "preview":
          return (
            wx.navigateTo({
              url: "/pages/color-card-management/preview/preview?goodsId=".concat(s),
            }),
            void this.triggerEvent("isUpdate", !1)
          );
        case "bottom":
          (ServicesUserLog.servicesUserLog.setUserHandleLog(109),
            wx.navigateTo({
              url: "/pages/color-card-management/bottom-card/bottom-card?goodsId=".concat(s),
            }),
            this.triggerEvent("isUpdate", !0));
          break;
        case "off":
          "上架" == r
            ? this.triggerEvent("onOrOff", {
                goodsid: s,
                operateType: 1,
                idx: n,
              })
            : "下架" == r &&
              this.triggerEvent("onOrOff", {
                goodsid: s,
                operateType: 0,
                idx: n,
              });
          break;
        case "share":
          (this.setData({
            popupShow: !0,
          }),
            this.triggerEvent("shareF", {
              goodsid: this.properties.list.id,
              name: this.properties.list.businessProductName || this.properties.list.goodsName,
              img: util.utils.replImage(this.properties.list.storagePath),
              price: this.properties.list.price,
              unit: this.properties.list.priceUnit,
            }));
      }
    },
    popupHide: function () {
      this.setData({
        popupShow: !1,
      });
    },
    goEditPage: function (e) {
      var util = e.currentTarget.dataset.goodsid;
      if (this.properties.isSearch)
        wx.navigateTo({
          url: "/pages/color-card-management/preview/preview?goodsId=".concat(util),
        });
      else {
        if (!this.data.userAuthList["goods:update"])
          return void wx.showToast({
            title: "没有编辑权限",
            icon: "none",
          });
        wx.navigateTo({
          url: "/pages/color-card-management/add-color-card/add-color-card?goodsId=".concat(
            util,
            "&type=1&delType=1",
          ),
        });
      }
      this.triggerEvent("isUpdate", !0);
    },
    revokeApply: function (e) {
      (console.log(this.properties.list),
        this.triggerEvent("revokeApply", {
          status: e.currentTarget.dataset.status,
          id: this.properties.list.id,
        }));
    },
  },
});
