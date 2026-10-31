Page({
  data: {
    array1s: "",
    array1: ["经编", "纬编"],
    index1: null,
    array2s: "",
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
    index2: null,
    cardDetailsInfo: "",
  },
  onLoad: function (a) {
    wx.hideShareMenu();
  },
  onReady: function () {},
  onShow: function () {
    var a = this,
      t = wx.getStorageSync("commodityType");
    "" != t &&
      null != t &&
      (this.setData({
        cardDetailsInfo: t,
      }),
      "" != t.wrapWeftName &&
        this.data.array1.map(function (e, n) {
          e == t.wrapWeftName &&
            a.setData({
              index1: n,
              array1s: "2",
            });
        }),
      "" != t.qualityStandardName &&
        this.data.array2.map(function (e, n) {
          e == t.qualityStandardName &&
            a.setData({
              index2: n,
              array2s: "2",
            });
        }));
  },
  bindPickerChange1: function (a) {
    (console.log("picker发送选择改变，携带值为", a.detail.value),
      this.setData({
        index1: a.detail.value,
        array1s: "2",
      }));
  },
  bindPickerChange2: function (a) {
    (console.log("picker发送选择改变，携带值为", a.detail.value),
      this.setData({
        index2: a.detail.value,
        array2s: "2",
      }));
  },
  formSubmit: function (a) {
    var t = a.detail.value;
    (console.log(a),
      "" != this.data.array1s
        ? ((t.wrapWeftName = this.data.array1[this.data.index1]),
          (t.wrapWeftId = Number(this.data.index1) + 1))
        : ((t.wrapWeftName = ""), (t.wrapWeftId = "")),
      "" != this.data.array2s
        ? ((t.qualityStandardName = this.data.array2[this.data.index2]),
          (t.qualityStandardId = Number(this.data.index2) + 1))
        : ((t.qualityStandardName = ""), (t.qualityStandardId = "")),
      wx.setStorageSync("commodityType", t),
      wx.navigateBack({
        delta: 1,
      }));
  },
  onHide: function () {},
  onUnload: function () {},
  onPullDownRefresh: function () {},
  onReachBottom: function () {},
  onShareAppMessage: function () {},
});
