var app = getApp();
Component({
  properties: {
    show: {
      type: Boolean,
      value: !1,
    },
    overlay: {
      type: Boolean,
      value: !0,
    },
    position: {
      type: String,
      value: "bottom",
    },
    goodsId: {
      type: String,
      value: "",
    },
    isShareProd: {
      type: Boolean,
      value: !1,
    },
  },
  data: {
    shareList2: [
      {
        name: "分享产品",
        icon: "".concat(app.config.imgHost, "/img/customer/share_prod.png"),
        action: "moment",
      },
      {
        name: "分享电子色卡",
        icon: "".concat(app.config.imgHost, "/img/customer/share_color.png"),
        action: "colorCard",
      },
    ],
    shareList: [
      {
        name: "分享给好友",
        icon: "".concat(app.config.imgHost, "/img/customer/symbols-share-f.png"),
        action: "friend",
      },
      {
        name: "分享到朋友圈",
        icon: "".concat(app.config.imgHost, "/img/customer/symbols-share-fs.png"),
        action: "moment",
      },
    ],
  },
  methods: {
    onClose: function () {
      this.triggerEvent("onClose", {});
    },
    actionTap: function (o) {
      var e = o.currentTarget.dataset,
        t = e.action,
        n = e.goodsid;
      switch (t) {
        case "friend":
          this.triggerEvent("friend", {
            goodsid: n,
          });
          break;
        case "moment":
          this.triggerEvent("moment", {
            goodsid: n,
          });
          break;
        case "colorCard":
          this.triggerEvent("colorCard", {
            goodsid: n,
          });
      }
    },
  },
});
