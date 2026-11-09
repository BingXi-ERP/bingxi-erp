var objectSpread2 = require("../../@babel/runtime/helpers/objectSpread2");
require("../../@babel/runtime/helpers/Arrayincludes");
getApp();
Component({
  properties: {
    list: {
      type: Array,
      value: [],
      observer: function (t, e) {
        this.getInitData();
      },
    },
    selected: {
      type: String,
      value: "",
    },
    isRadio: {
      type: Boolean,
      value: !1,
    },
  },
  data: {
    hasList: [],
    initData: [],
  },
  attached: function () {
    this.data.selected && this.getInitData();
  },
  methods: {
    getInitData: function () {
      var objectSpread2 = this.data,
        e = objectSpread2.list,
        i = objectSpread2.selected.split(","),
        s = e.map(function (t) {
          return {
            title: t.title,
            isChoose: !!i.includes(t.title),
          };
        }),
        a = s.filter(function (t) {
          return !0 === t.isChoose;
        });
      this.setData({
        chooseList: s,
        hasList: a,
      });
    },
    getItem: function (t) {
      this.data.isRadio ? this.radioChoice(t) : this.multipleChoice(t);
    },
    radioChoice: function (e) {
      var i = e.currentTarget.dataset.item,
        s = this.data.chooseList.map(function (e) {
          return e.title === i
            ? objectSpread2(
                objectSpread2({}, e),
                {},
                {
                  isChoose: !e.isChoose,
                },
              )
            : objectSpread2(
                objectSpread2({}, e),
                {},
                {
                  isChoose: !1,
                },
              );
        });
      this._setChoiceData(s);
    },
    multipleChoice: function (e) {
      var i = e.currentTarget.dataset.item,
        s = this.data.chooseList.map(function (e) {
          return e.title === i
            ? objectSpread2(
                objectSpread2({}, e),
                {},
                {
                  isChoose: !e.isChoose,
                },
              )
            : e;
        });
      this._setChoiceData(s);
    },
    _setChoiceData: function (t) {
      var e = [];
      (t.forEach(function (t) {
        !0 === t.isChoose && e.push(t.title);
      }),
        this.setData({
          chooseList: t,
          hasList: e,
        }),
        this.triggerEvent("onConfirm", {
          hasList: e,
        }),
        this.data.isRadio && this.triggerEvent("onCancel"));
    },
  },
});
