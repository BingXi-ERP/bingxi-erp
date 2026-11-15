var createForOfIteratorHelper = require("../../@babel/runtime/helpers/createForOfIteratorHelper"),
  app = getApp();
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
    colorCardList: {
      type: Array,
      value: [],
    },
  },
  data: {
    list: [],
    total: "",
    delBg: "".concat(app.config.imgHost, "/ic_quxiaoseka@3x.png"),
  },
  methods: {
    countTotal: function (e) {
      var o,
        n = 0,
        i = createForOfIteratorHelper(e);
      try {
        for (i.s(); !(o = i.n()).done;) {
          n += 1 * o.value.count;
        }
      } catch (t) {
        i.e(t);
      } finally {
        i.f();
      }
      this.setData({
        total: n,
      });
    },
    onClose: function () {
      this.triggerEvent("onClose", {});
    },
    delList: function () {
      this.triggerEvent("delList", {});
    },
    confirm: function () {
      this.triggerEvent("confirm", {});
    },
    minTap: function (t) {
      var app = t.currentTarget.dataset.index;
      this.triggerEvent("minTap", {
        index: app,
      });
    },
  },
});
