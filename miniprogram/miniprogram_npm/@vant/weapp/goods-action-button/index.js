Object.defineProperty(exports, "__esModule", { value: !0 });
var e = require("../common/component"),
  t = require("../common/relation"),
  i = require("../mixins/button"),
  n = require("../mixins/link");
(0, e.VantComponent)({
  mixins: [n.link, i.button],
  relation: (0, t.useParent)("goods-action"),
  props: {
    text: String,
    color: String,
    size: { type: String, value: "normal" },
    loading: Boolean,
    disabled: Boolean,
    plain: Boolean,
    type: { type: String, value: "danger" },
    customStyle: { type: String, value: "" },
  },
  methods: {
    onClick: function (e) {
      this.$emit("click", e.detail), this.jumpLink();
    },
    updateStyle: function () {
      if (null != this.parent) {
        var e = this.index,
          t = this.parent.children,
          i = void 0 === t ? [] : t;
        this.setData({ isFirst: 0 === e, isLast: e === i.length - 1 });
      }
    },
  },
});
