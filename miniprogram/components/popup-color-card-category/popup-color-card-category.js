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
    categoryList: {
      type: Array,
      value: [],
    },
  },
  data: {
    list: [],
    icon: {
      noCheckBg: "".concat(app.config.imgHost, "/img/customer/ic_weixuan@3x.png"),
      checkedBg: "".concat(app.config.imgHost, "/img/customer/ic_dagou@3x.png"),
      suoyouren: "".concat(app.config.imgHost, "/img/customer/ic_suoyouren@4.5x.png"),
      zhidingkehu: "".concat(app.config.imgHost, "/img/customer/ic_zhidingren@4.5x.png"),
    },
    selectStatusArr: [],
    selectedArr: [],
    selectedArrName: [],
  },
  attached: function () {
    for (var app = 0; app < this.properties.categoryList.length; app++)
      this.data.selectStatusArr.push(!1);
  },
  methods: {
    onClose: function () {
      this.triggerEvent("onClose", {});
    },
    confirm: function () {
      this.data.selectedArrName.includes("默认分类") && this.data.selectedArrName.length > 1
        ? wx.showToast({
            title: "默认分类和其他分组不能同时选择",
            icon: "none",
          })
        : this.triggerEvent("confirm", {
            categoryIdList: this.data.selectedArr,
          });
    },
    cancel: function () {
      this.triggerEvent("cancel", {});
    },
    checkTap: function (e) {
      var t = e.currentTarget.dataset,
        r = t.index,
        s = t.categoryidlist,
        c = t.categoryname,
        o = this.data,
        i = o.selectedArr,
        a = o.selectStatusArr,
        n = o.selectedArrName;
      if (((a[r] = !a[r]), a[r])) (i.push(s), n.push(c));
      else for (var g = 0; g < i.length; g++) i[g] == s && (i.splice(g, 1), n.splice(g, 1));
      (this.setData({
        selectStatusArr: a,
        selectedArr: i,
        selectedArrName: n,
      }),
        console.log(this.data.selectedArrName));
    },
  },
});
