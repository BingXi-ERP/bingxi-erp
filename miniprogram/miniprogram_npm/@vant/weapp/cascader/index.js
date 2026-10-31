var e = function (e, t, a) {
  if (a || 2 === arguments.length)
    for (var i, n = 0, l = t.length; n < l; n++)
      (!i && n in t) ||
        (i || (i = Array.prototype.slice.call(t, 0, n)), (i[n] = t[n]));
  return e.concat(i || Array.prototype.slice.call(t));
};
Object.defineProperty(exports, "__esModule", { value: !0 });
var t,
  a = require("../common/component");
!(function (e) {
  (e.TEXT = "text"), (e.VALUE = "value"), (e.CHILDREN = "children");
})(t || (t = {}));
var i = { text: t.TEXT, value: t.VALUE, children: t.CHILDREN };
(0, a.VantComponent)({
  props: {
    title: String,
    value: { type: String },
    placeholder: { type: String, value: "请选择" },
    activeColor: { type: String, value: "#1989fa" },
    options: { type: Array, value: [] },
    swipeable: { type: Boolean, value: !1 },
    closeable: { type: Boolean, value: !0 },
    ellipsis: { type: Boolean, value: !0 },
    showHeader: { type: Boolean, value: !0 },
    closeIcon: { type: String, value: "cross" },
    fieldNames: { type: Object, value: i, observer: "updateFieldNames" },
    useTitleSlot: Boolean,
  },
  data: {
    tabs: [],
    activeTab: 0,
    textKey: t.TEXT,
    valueKey: t.VALUE,
    childrenKey: t.CHILDREN,
    innerValue: "",
  },
  watch: {
    options: function () {
      this.updateTabs();
    },
    value: function (e) {
      this.updateValue(e);
    },
  },
  created: function () {
    this.updateTabs();
  },
  methods: {
    updateValue: function (e) {
      var t = this;
      if (
        void 0 !== e &&
        this.data.tabs
          .map(function (e) {
            return e.selected && e.selected[t.data.valueKey];
          })
          .indexOf(e) > -1
      )
        return;
      (this.innerValue = e), this.updateTabs();
    },
    updateFieldNames: function () {
      var e = this.data.fieldNames || i,
        t = e.text,
        a = void 0 === t ? "text" : t,
        n = e.value,
        l = void 0 === n ? "value" : n,
        s = e.children,
        o = void 0 === s ? "children" : s;
      this.setData({ textKey: a, valueKey: l, childrenKey: o });
    },
    getSelectedOptionsByValue: function (t, a) {
      for (var i = 0; i < t.length; i++) {
        var n = t[i];
        if (n[this.data.valueKey] === a) return [n];
        if (n[this.data.childrenKey]) {
          var l = this.getSelectedOptionsByValue(n[this.data.childrenKey], a);
          if (l) return e([n], l, !0);
        }
      }
    },
    updateTabs: function () {
      var e = this,
        t = this.data.options,
        a = this.innerValue;
      if (t.length) {
        if (void 0 !== a) {
          var i = this.getSelectedOptionsByValue(t, a);
          if (i) {
            var n = t,
              l = i.map(function (t) {
                var a = { options: n, selected: t },
                  i = n.find(function (a) {
                    return a[e.data.valueKey] === t[e.data.valueKey];
                  });
                return i && (n = i[e.data.childrenKey]), a;
              });
            return (
              n && l.push({ options: n, selected: null }),
              this.setData({ tabs: l }),
              void wx.nextTick(function () {
                e.setData({ activeTab: l.length - 1 });
              })
            );
          }
        }
        this.setData({ tabs: [{ options: t, selected: null }], activeTab: 0 });
      }
    },
    onClose: function () {
      this.$emit("close");
    },
    onClickTab: function (e) {
      var t = e.detail,
        a = t.index,
        i = t.title;
      this.$emit("click-tab", { title: i, tabIndex: a }),
        this.setData({ activeTab: a });
    },
    onSelect: function (e) {
      var t = this,
        a = e.currentTarget.dataset,
        i = a.option,
        n = a.tabIndex;
      if (!i || !i.disabled) {
        var l = this.data,
          s = l.valueKey,
          o = l.childrenKey,
          r = this.data.tabs;
        if (
          ((r[n].selected = i),
          r.length > n + 1 && (r = r.slice(0, n + 1)),
          i[o])
        ) {
          var u = { options: i[o], selected: null };
          r[n + 1] ? (r[n + 1] = u) : r.push(u),
            wx.nextTick(function () {
              t.setData({ activeTab: n + 1 });
            });
        }
        this.setData({ tabs: r });
        var c = r
            .map(function (e) {
              return e.selected;
            })
            .filter(Boolean),
          d = i[s],
          v = { value: d, tabIndex: n, selectedOptions: c };
        (this.innerValue = d),
          this.$emit("change", v),
          i[o] || this.$emit("finish", v);
      }
    },
  },
});
