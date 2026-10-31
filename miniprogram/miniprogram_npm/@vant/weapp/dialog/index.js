Object.defineProperty(exports, "__esModule", { value: !0 });
var t = require("../common/component"),
  o = require("../mixins/button"),
  e = require("../common/color"),
  n = require("../common/utils");
(0, t.VantComponent)({
  mixins: [o.button],
  classes: ["cancle-button-class", "confirm-button-class"],
  props: {
    show: {
      type: Boolean,
      observer: function (t) {
        !t && this.stopLoading();
      },
    },
    title: String,
    message: String,
    theme: { type: String, value: "default" },
    confirmButtonId: String,
    className: String,
    customStyle: String,
    asyncClose: Boolean,
    messageAlign: String,
    beforeClose: null,
    overlayStyle: String,
    useSlot: Boolean,
    useTitleSlot: Boolean,
    useConfirmButtonSlot: Boolean,
    useCancelButtonSlot: Boolean,
    showCancelButton: Boolean,
    closeOnClickOverlay: Boolean,
    confirmButtonOpenType: String,
    width: null,
    zIndex: { type: Number, value: 2e3 },
    confirmButtonText: { type: String, value: "确认" },
    cancelButtonText: { type: String, value: "取消" },
    confirmButtonColor: { type: String, value: e.RED },
    cancelButtonColor: { type: String, value: e.GRAY },
    showConfirmButton: { type: Boolean, value: !0 },
    overlay: { type: Boolean, value: !0 },
    transition: { type: String, value: "scale" },
    rootPortal: { type: Boolean, value: !1 },
  },
  data: { loading: { confirm: !1, cancel: !1 }, callback: function () {} },
  methods: {
    onConfirm: function () {
      this.handleAction("confirm");
    },
    onCancel: function () {
      this.handleAction("cancel");
    },
    onClickOverlay: function () {
      this.close("overlay");
    },
    close: function (t) {
      this.setData({ show: !1 }), (this.closeAction = t);
    },
    onAfterLeave: function () {
      var t = this.closeAction;
      this.$emit("close", t);
      var o = this.data.callback;
      o && o(t, this);
    },
    stopLoading: function () {
      this.setData({ loading: { confirm: !1, cancel: !1 } });
    },
    handleAction: function (t) {
      var o,
        e = this;
      this.$emit(t, { dialog: this });
      var i = this.data,
        l = i.asyncClose,
        a = i.beforeClose;
      l || a
        ? (this.setData((((o = {})["loading.".concat(t)] = !0), o)),
          a &&
            (0, n.toPromise)(a(t)).then(function (o) {
              o ? e.close(t) : e.stopLoading();
            }))
        : this.close(t);
    },
  },
});
