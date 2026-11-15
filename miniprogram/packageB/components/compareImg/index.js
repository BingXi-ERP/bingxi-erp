var createForOfIteratorHelper = require("../../../@babel/runtime/helpers/createForOfIteratorHelper"),
  app = getApp();
Component({
  properties: {
    show: {
      type: Boolean,
      value: !1,
      observer: function (e) {
        this.formatPopupHeight(e);
      },
    },
    isCompare: {
      type: Boolean,
      value: !1,
    },
    data: {
      type: Object,
      value: {},
    },
    colorCompare: {
      type: Boolean,
      value: !1,
    },
  },
  data: {
    compareImgOptions: [
      {
        label: "2倍正面",
        prop: "imageTwo",
        id: 0,
      },
      {
        label: "2倍背面",
        prop: "imageTwoBack",
        id: 1,
      },
      {
        label: "5倍正面",
        prop: "imageFive",
        id: 2,
      },
      {
        label: "5倍背面",
        prop: "imageFiveBack",
        id: 3,
      },
    ],
    compareColorOptions: [
      {
        label: "样布图颜色",
        prop: "sampleImg",
        id: 0,
      },
      {
        label: "对比图颜色",
        prop: "compareImg",
        id: 1,
      },
    ],
    colorOptions: [
      {
        label: "LAB",
        prop: "labValue",
        id: 2,
        symbol: "=",
        unit: "",
      },
      {
        label: "色号",
        prop: "colorName",
        id: 3,
        symbol: "=",
        unit: "",
      },
    ],
    popupHeight: "95%",
    icon: {
      noImageBg: "../../../assets/images/icon2nd/noPicture@2x.png",
      noColorBg: "".concat(app.config.imgHost, "/img/customer/duibuIcon/icon2nd/emptyColor@2x.png"),
      delete: "".concat(app.config.imgHost, "/img/customer/duibuIcon/icon/del@2x.png"),
    },
  },
  methods: {
    formatPopupHeight: function (e) {
      e &&
        this.setData({
          popupHeight: this.data.colorCompare ? "800rpx" : this.data.isCompare ? "95%" : "1000rpx",
        });
    },
    onCloseCompare: function () {
      this.setData({
        show: !1,
      });
    },
    onPreviewImg: function (o) {
      var a = o.currentTarget.dataset,
        p = a.index,
        t = a.item,
        r = a.value,
        i = this.data,
        l = i.data,
        n = i.compareImgOptions,
        s = i.isCompare;
      if (r) {
        var m,
          c = [],
          u = createForOfIteratorHelper(n);
        try {
          for (u.s(); !(m = u.n()).done;) {
            var g = m.value;
            s ? l[t][g.prop] && c.push(l[t][g.prop]) : l[g.prop] && c.push(l[g.prop]);
          }
        } catch (e) {
          u.e(e);
        } finally {
          u.f();
        }
        wx.previewImage({
          current: c[p],
          urls: c,
        });
      } else
        wx.showToast({
          title: "无图片可预览",
          icon: "error",
        });
    },
  },
});
