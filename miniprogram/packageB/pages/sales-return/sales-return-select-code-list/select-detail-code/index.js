require("../../../../../@babel/runtime/helpers/Arrayincludes");
var objectSpread2 = require("../../../../../@babel/runtime/helpers/objectSpread2"),
  util = require("../../../../libs/utils/util"),
  app = getApp();
Page({
  data: {
    selectCodeArr: [],
    selectedColor: [],
    deviationList: ["", "X", "+", "-"],
    setUp: !1,
    icon: {
      checked: "".concat(app.config.imgHost, "/img/customer/duibuIcon/phone_check@2x.png"),
      noCheck: "".concat(app.config.imgHost, "/img/customer/duibuIcon/phone_uncheck@2x.png"),
      down: "".concat(app.config.imgHost, "/img/customer/duibuIcon/color_down@2x.png"),
      up: "".concat(app.config.imgHost, "/img/customer/duibuIcon/color_up@2x.png"),
    },
    codeInfo: {
      id: "123",
      goodsImgPath: "".concat(app.config.imgHost, "/HD_PIC_1dg6zmmv2bmga144.png"),
      title: "123123123ask两地分居阿瓦隆看得见啊",
    },
    totalReturnNum: null,
    orderDetailInfo: {},
  },
  onLoad: function (t) {
    (t.id &&
      this.setData({
        orderId: t.id,
        orderDetailInfo: wx.getStorageSync("return_sales_rowdata"),
      }),
      this.getDataForm());
  },
  detailDisplay: function () {
    this.setData({
      setUp: !this.data.setUp,
    });
  },
  detailTableDisplay: function (t) {
    var util = t.currentTarget.dataset.index,
      app = this.data.orderDetailInfo;
    ((app.tabCurrentColorId = app.billingGoodsColorModels[util].goodsColorId),
      (app.tabCurrentColor = app.billingGoodsColorModels[util].colorNo),
      (app.tabCurrentColorName = app.billingGoodsColorModels[util].colorName),
      (app.tabCurrentDyelot = app.billingGoodsColorModels[util].dyelotModelList),
      (app.tabCurrentDyelotId = app.billingGoodsColorModels[util].dyelotModelList[0].dyelot),
      (app.tabCurrentColorList =
        app.billingGoodsColorModels[util].dyelotModelList[0].refundableQuantityModelList),
      this.setData({
        orderDetailInfo: app,
      }));
  },
  changeCurrentDyelot: function (t) {
    var util = t.currentTarget.dataset,
      app = util.index,
      r = util.productItem.tabCurrentColorId,
      n = this.data.orderDetailInfo,
      i = n.billingGoodsColorModels.find(function (t) {
        return t.goodsColorId === r;
      });
    ((n.tabCurrentDyelot = i.dyelotModelList),
      (n.tabCurrentDyelotId = i.dyelotModelList[app].dyelot),
      (n.tabCurrentColorList = i.dyelotModelList[app].refundableQuantityModelList),
      this.setData({
        orderDetailInfo: n,
      }));
  },
  selectCode: function (t) {
    var util = t.currentTarget.dataset,
      app = util.id,
      r = util.selectItem,
      n = util.productItem,
      i = util.dyelot,
      l = this.data.selectCodeArr,
      d = n.tabCurrentColorId,
      a = this.data.orderDetailInfo.billingGoodsColorModels
        .find(function (t) {
          return t.goodsColorId === d;
        })
        .dyelotModelList.find(function (t) {
          return t.dyelot === i;
        })
        .refundableQuantityModelList.find(function (t) {
          return t.id === app;
        });
    (a.checked
      ? ((a.checked = !1), (a.fixedColorAmount = 0))
      : ((a.checked = !0),
        (a.fixedColorAmount =
          Number(a.fixedQuantity ? a.fixedQuantity : a.refundableQuantity) * Number(a.colorPrice))),
      l.find(function (t) {
        return t.id === r.id;
      })
        ? (l = l.filter(function (t) {
            return t.id !== r.id;
          }))
        : l.push(r),
      this.setData({
        selectCodeArr: l,
        orderDetailInfo: this.data.orderDetailInfo,
      }),
      this.countReturnNum(),
      console.log(this.data.selectCodeArr));
  },
  handleUpdateColorFineCode: function (e) {
    var app = e.detail.value,
      r = e.currentTarget.dataset,
      n = r.id,
      i = (r.productId, r.productItem),
      l = r.dyelot,
      d = this.data.selectCodeArr,
      a = i.tabCurrentColorId,
      u = this.data.orderDetailInfo.billingGoodsColorModels
        .find(function (t) {
          return t.goodsColorId === a;
        })
        .dyelotModelList.find(function (t) {
          return t.dyelot === l;
        })
        .refundableQuantityModelList.find(function (t) {
          return t.id === n;
        });
    ("" == app || 0 == app
      ? (wx.showToast({
          title: "数值不能为空或0",
          icon: "none",
        }),
        (o = 1))
      : app > u.refundableQuantity &&
        (wx.showToast({
          title: "输入的退货数量不可超出可退数量",
          icon: "none",
        }),
        (o = u.refundableQuantity)),
      (u.fixedQuantity = app),
      (u.fixedColorAmount = app * u.colorPrice),
      (d = d.map(function (e) {
        return (
          console.log(app),
          console.log(u.colorPrice),
          e.id === n
            ? objectSpread2(
                objectSpread2({}, e),
                {},
                {
                  fixedQuantity: app,
                  fixedColorAmount: Number(app) * u.colorPrice,
                },
              )
            : e
        );
      })),
      console.log(d),
      this.setData({
        orderDetailInfo: this.data.orderDetailInfo,
        selectCodeArr: d,
      }),
      this.countReturnNum());
  },
  handleInputDecimalLengOne: function (t) {
    var util = /^(\.*)(\d+)(\.?)(\d{0,2}).*$/g,
      app = t.detail.value;
    return util.test(app) ? app.replace(util, "$2$3$4") : "";
  },
  countFixedGoodsAmount: function () {
    var objectSpread2 = 0;
    (this.data.totalReturnNum.length > 0 &&
      this.data.totalReturnNum.forEach(function (e) {
        t = Number(e.totalPrice) + Number(objectSpread2);
      }),
      (t = util.utils.rounded(Number(objectSpread2), 2)),
      console.log(objectSpread2),
      this.setData({
        fixedGoodsAmount: objectSpread2,
      }));
  },
  countReturnNum: function () {
    var objectSpread2 = this,
      util = this.data.selectCodeArr,
      app = [],
      r = [];
    (util.forEach(function (e) {
      ((o = objectSpread2.getTotalReturnNum(app, e)),
        r.includes(e.goodsColorId) || r.push(e.goodsColorId));
    }),
      this.setData({
        totalReturnNum: app,
        selectedColor: r,
      }),
      this.countFixedGoodsAmount());
  },
  getTotalReturnNum: function (t, o) {
    if (0 === t.length) {
      var r = {
        refundableQuantity: util.utils.rounded(Number(o.fixedQuantity || o.refundableQuantity), 2),
        quantityUnit: o.quantityUnit,
        totalPrice: util.utils.rounded(
          Number(o.colorPrice) * Number(o.fixedQuantity || o.refundableQuantity),
          2,
        ),
      };
      t.push(r);
    } else {
      var n = t.findIndex(function (t) {
        return t.quantityUnit === o.quantityUnit;
      });
      if (n >= 0) {
        var i = util.utils.rounded(
            Number(t[n].refundableQuantity) + Number(o.fixedQuantity || o.refundableQuantity),
            2,
          ),
          l =
            Number(t[n].totalPrice) +
            Number(o.colorPrice) * Number(o.fixedQuantity || o.refundableQuantity),
          d = {
            quantityUnit: t[n].quantityUnit,
            refundableQuantity: i,
            totalPrice: util.utils.rounded(l, 2),
          };
        t[n] = d;
      } else {
        var a = {
          refundableQuantity: util.utils.rounded(
            Number(o.fixedQuantity || o.refundableQuantity),
            2,
          ),
          quantityUnit: o.quantityUnit,
          totalPrice: util.utils.rounded(
            Number(o.colorPrice) * Number(o.fixedQuantity || o.refundableQuantity),
            2,
          ),
        };
        t.push(a);
      }
    }
    return t;
  },
  handleComfirm: function () {
    var util = this.data,
      app = util.selectCodeArr,
      r = util.totalReturnNum,
      n = util.selectedColor,
      i = util.orderDetailInfo,
      l = getCurrentPages(),
      d = l.find(function (t) {
        return "packageB/pages/sales-return/sales-return-select-code-list/index" === t.route;
      });
    ((i = objectSpread2(
      objectSpread2({}, i),
      {},
      {
        selectCodeArr: app,
        totalReturnNum: r,
        selectedColor: n,
      },
    )),
      d.updateReturnCode(i),
      this.handleCancel());
  },
  handleCancel: function () {
    wx.navigateBack({
      delta: 1,
    });
  },
  getDataForm: function () {
    var objectSpread2 = this.data.orderDetailInfo;
    objectSpread2 &&
      (console.log("==================jinru ============="),
      (objectSpread2.display = !1),
      objectSpread2.billingGoodsColorModels.forEach(function (e, o) {
        var r = objectSpread2.billingGoodsColorModels;
        ((objectSpread2.billingGoodsColorModels[o].choosedColorItem = 0),
          (objectSpread2.tabCurrentColorId = r[0].goodsColorId),
          (objectSpread2.tabCurrentColor = r[0].colorNo),
          (objectSpread2.tabCurrentColorName = r[0].colorName),
          (objectSpread2.tabCurrentColorList = r[0].dyelotModelList[0].refundableQuantityModelList),
          (objectSpread2.tabCurrentDyelot = r[0].dyelotModelList),
          (objectSpread2.tabCurrentDyelotId = r[0].dyelotModelList[0].dyelot));
      }));
    var util = objectSpread2.selectCodeArr,
      app = objectSpread2.totalReturnNum,
      r = objectSpread2.selectedColor;
    (this.setData({
      orderDetailInfo: objectSpread2,
      selectCodeArr: util || [],
      totalReturnNum: app || [],
      selectedColor: r || [],
    }),
      this.countFixedGoodsAmount());
  },
});
