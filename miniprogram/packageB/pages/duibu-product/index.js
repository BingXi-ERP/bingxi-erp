var ServicesSearch = require("../../libs/services/ServicesSearch"),
  util = require("../../libs/utils/util"),
  app = getApp();
Page({
  data: {
    globalApp: app,
    formInline: {},
    duibuImgConfig: [
      {
        label: "1倍正面",
        prop: "imageOne",
        value: [],
        faceKey: 0,
        multipleKey: 0,
      },
      {
        label: "1倍反面",
        prop: "imageOneBack",
        value: [],
        faceKey: 1,
        multipleKey: 0,
      },
      {
        label: "2倍正面",
        prop: "imageTwo",
        value: [],
        faceKey: 0,
        multipleKey: 1,
      },
      {
        label: "2倍反面",
        prop: "imageTwoBack",
        value: [],
        faceKey: 1,
        multipleKey: 1,
      },
      {
        label: "3倍正面",
        prop: "imageThree",
        value: [],
        faceKey: 0,
        multipleKey: 3,
      },
      {
        label: "3倍反面",
        prop: "imageThreeBack",
        value: [],
        faceKey: 1,
        multipleKey: 3,
      },
      {
        label: "5倍正面",
        prop: "imageFive",
        value: [],
        faceKey: 0,
        multipleKey: 5,
      },
      {
        label: "5倍反面",
        prop: "imageFiveBack",
        value: [],
        faceKey: 1,
        multipleKey: 5,
      },
    ],
    infoConfig: [
      {
        label: "基本信息",
        value: 1,
        options: [
          {
            label: "商品编号",
            prop: "spuNumber",
          },
          {
            label: "家族别称",
            prop: "name",
          },
          {
            label: "耳标号",
            prop: "earTagNumber",
          },
          {
            label: "商品区域",
            prop: "region",
          },
          {
            label: "别名1",
            prop: "byname1",
          },
          {
            label: "商家品名",
            prop: "businessProductName",
          },
        ],
      },
      {
        label: "参数信息",
        value: 2,
        options: [
          {
            label: "克重",
            prop: "gramWeight",
            unitProp: "weightUnit",
          },
          {
            label: "门幅",
            prop: "clothWidth",
            unitProp: "clothWidthUnit",
          },
          {
            label: "空差",
            prop: "clothEnough",
          },
          {
            label: "出米数",
            prop: "outMeterNumber",
          },
          {
            label: "后工艺",
            prop: "finishingProcessFront",
          },
          {
            label: "成分",
            prop: "baiBuMaterial",
          },
        ],
      },
    ],
  },
  handleClickPreviewImg: function (e) {
    var app = e.currentTarget.dataset,
      l = app.type,
      t = app.item;
    if ((1 !== l || t.value.length) && (2 !== l || t.colorChartPathMini)) {
      var o = this.data,
        r = o.duibuImgConfig,
        n = o.formInline;
      wx.previewImage({
        current: 1 === l ? t.value[0] : t.colorChartPathMini,
        urls:
          1 === l
            ? r.map(function (e) {
                return util.utils.replImage(e.value[0]);
              })
            : n.colorChartRespList.map(function (e) {
                return util.utils.replImage(e.colorChartPathMini);
              }),
      });
    }
  },
  imgGroupFormat: function (e) {
    var util = this.data.duibuImgConfig;
    (util.forEach(function (e) {
      e.value = [];
    }),
      e.productImages &&
        e.productImages.map(function (e) {
          var app = e.type.split("_"),
            l = parseInt(app[0]),
            t = parseInt(app[1]),
            o = util.find(function (e) {
              return e.faceKey === t && e.multipleKey === l;
            });
          o && o.value.push(e.storagePath);
        }),
      this.setData({
        duibuImgConfig: util,
        formInline: e,
        showPopupVisible: !0,
      }));
  },
  getDuiBuDetailData: function (a) {
    var app = this;
    (wx.showLoading({
      title: "拼命加载中...",
    }),
      ServicesSearch.ServicesSearch.getDuiBuDetail(a).then(function (e) {
        (0 === e.code && app.imgGroupFormat(e.data), wx.hideLoading());
      }));
  },
  onLoad: function (e) {
    var util = e.id;
    this.getDuiBuDetailData(util);
  },
  onReady: function () {},
  onShow: function () {},
  onHide: function () {},
  onUnload: function () {},
  onPullDownRefresh: function () {},
  onReachBottom: function () {},
  onShareAppMessage: function () {},
});
