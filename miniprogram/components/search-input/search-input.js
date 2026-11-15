Component({
  properties: {
    placeholder: {
      type: String,
      value: "请输入搜索内容",
    },
    val: {
      type: String,
      value: "",
    },
    rightType: {
      type: String,
      value: "0",
    },
    width: {
      type: String,
      value: "532",
    },
  },
  data: {
    value: "",
    rightType: "",
  },
  observers: {
    val: function (t) {
      this.setData({
        value: t || "",
      });
    },
  },
  attached: function () {
    this.setData({
      rightType: this.properties.rightType,
    });
  },
  methods: {
    cancel: function () {
      this.setData({
        value: "",
      });
    },
    input: function (t) {
      var e = t.detail.value;
      this.triggerEvent("getValue", {
        value: e,
      });
    },
    scan: function (t) {
      this.triggerEvent("scan");
    },
    search: function () {
      this.triggerEvent("search");
    },
    confirm: function (t) {
      var e = t.detail.value;
      this.triggerEvent("confirm", {
        value: e,
      });
    },
  },
});
