var e = require("../../../@babel/runtime/helpers/interopRequireDefault").default,
  getFormId = require("../../utils/getFormId"),
  isVisitor = e(require("../../../libs/utils/isVisitor"));
Component({
  externalClasses: ["btn-class"],
  properties: {
    title: {
      type: String,
      value: "确认",
    },
    disabled: {
      type: Boolean,
    },
  },
  data: {},
  methods: {
    formSubmit: function (e) {
      var r = this;
      (getFormId.saveFormId.getformId(e.detail.formId),
        isVisitor.default.isVisitor().then(function (e) {
          r.triggerEvent("toPath");
        }));
    },
  },
});
