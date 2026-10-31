Component({
  externalClasses: ["custom-search-bar", "custom-search-wrapper"],
  properties: {
    placeholder: {
      type: String,
      value: "请输入搜索内容",
    },
    autoFocus: {
      type: Boolean,
      value: !1,
    },
  },
  data: {
    value: "",
  },
  ready: function () {},
  methods: {
    onKeyInput: function (t) {
      (this.setData({
        value: t.detail.value,
      }),
        this.triggerEvent("input", t.detail.value));
    },
    onConfirm: function (t) {
      var e = this.data.value;
      this.triggerEvent("confirm", e);
    },
    onClearInput: function () {
      this.setData({
        value: "",
      });
    },
  },
});
