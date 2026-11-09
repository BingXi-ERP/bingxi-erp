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
    onKeyInput: function (e) {
      (this.setData({
        value: e.detail.value,
      }),
        this.triggerEvent("input", e.detail.value));
    },
    onConfirm: function (e) {
      var t = this.data.value;
      this.triggerEvent("confirm", t);
    },
  },
});
