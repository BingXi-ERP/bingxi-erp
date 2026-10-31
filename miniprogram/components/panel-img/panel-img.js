var global = require("../../libs/services/global");
Component({
  properties: {
    list: {
      type: Object,
      value: {},
    },
    rightType: {
      type: String,
      value: "1",
    },
    showBorder: {
      type: Boolean,
      value: !1,
    },
    fontRed: {
      type: Boolean,
      value: !1,
    },
    iconSize: {
      type: Object,
      value: {
        width: 80,
        height: 80,
      },
    },
  },
  data: {
    BlockType: "",
  },
  ready: function () {
    this.setData({
      BlockType: this.properties.rightType,
    });
  },
  methods: {
    toCustomDetail: function (t) {
      var e = t.currentTarget.dataset,
        o = e.customertype,
        r = e.id,
        i = e.action;
      this.triggerEvent("toCustomDetail", {
        customertype: o,
        id: r,
        action: i,
      });
    },
    formSubmit: function (t) {
      this.data.formId = t.detail.formId;
    },
    getformId: function (e) {
      var o = this,
        r = (0, global.saveFormId)();
      wx.login({
        success: function (t) {
          var e = {
            formId: o.data.formId,
            code: t.code,
          };
          wx.request({
            url: r,
            method: "POST",
            data: e,
            header: {
              Authorization: wx.getStorageSync("token"),
              terminalSource: 6,
              "content-type": "application/x-www-form-urlencoded",
            },
            success: function (t) {},
          });
        },
      });
    },
  },
});
