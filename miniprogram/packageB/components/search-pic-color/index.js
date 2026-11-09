var util = require("../../../libs/utils/util"),
  app = getApp();
Component({
  properties: {
    data: {
      type: Object,
      value: {},
      observer: function (a) {
        this.formatImage(a);
      },
    },
    disabled: {
      type: Boolean,
      value: !1,
    },
    isCompare: {
      type: Boolean,
      value: !1,
    },
    colorCompare: {
      type: Boolean,
      value: !1,
    },
    sampleData: {
      type: Object,
      value: {},
      observer: function (a) {
        this.setData({
          sampleSourceData: a,
        });
      },
    },
  },
  data: {
    imageData: {},
    imgOptions: [],
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
    app: app,
    defBg: "".concat(app.config.imgHost, "/img/customer/duibuIcon/no_img.png"),
    noColorBg: "".concat(app.config.imgHost, "/img/customer/duibuIcon/icon2nd/emptyColor@2x.png"),
    searchImg: {},
    showCompare: !1,
    compareData: {},
    sampleSourceData: {},
    isCompareColor: !1,
  },
  methods: {
    onImageError: function (a) {
      var app = JSON.parse(JSON.stringify(this.data.searchImg)),
        o = a.target.dataset.prop;
      ((app[o] = app[o].replace("/shop", "")),
        this.setData({
          searchImg: app,
        }));
    },
    formatImage: function (e) {
      e &&
        (this.data.isCompare
          ? this.setData({
              imgOptions: [
                {
                  label: "2倍正面",
                  prop: "imageTwo",
                  id: 0,
                },
                {
                  label: "2倍倍面",
                  prop: "imageTwoBack",
                  id: 1,
                },
              ],
            })
          : this.setData({
              imgOptions: [
                {
                  label: "2倍正面",
                  prop: "imageTwo",
                  id: 0,
                },
                {
                  label: "5倍正面",
                  prop: "imageFive",
                  id: 1,
                },
              ],
            }),
        this.data.imgOptions.forEach(function (o) {
          e[o.prop] = util.utils.replImage(e[o.prop], 128);
        }),
        this.setData({
          searchImg: e,
        }));
    },
    onShowCompare: function (e) {
      if (this.data.disabled) this.triggerEvent("childFunc");
      else {
        var o = e.currentTarget.dataset.type,
          t = this.data,
          p = t.data,
          r = t.sampleSourceData,
          i = t.compareImgOptions,
          m = t.compareData,
          s = t.isCompare,
          l = t.colorCompare,
          c = t.isCompareColor;
        (s &&
          (m = {
            compareImg: {},
            sampleImg: {},
          }),
          (c = "color" === o && l)
            ? (m = {
                compareImg: p,
                sampleImg: r,
              })
            : i.forEach(function (e) {
                var o = util.utils.replImage(p[e.prop]);
                if (s) {
                  var t = util.utils.replImage(r[e.prop]);
                  ((m.compareImg[e.prop] = o), (m.sampleImg[e.prop] = t));
                } else m[e.prop] = o;
              }),
          this.setData({
            isCompareColor: c,
            compareData: m,
            showCompare: !0,
          }));
      }
    },
  },
});
