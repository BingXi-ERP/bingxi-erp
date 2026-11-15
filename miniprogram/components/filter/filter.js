Component({
  properties: {
    filterList: {
      type: Array,
      value: [],
    },
  },
  data: {
    _value: "",
    sortType: "all",
    idx: 0,
  },
  methods: {
    filterTap: function (t) {
      var a = t.currentTarget.dataset,
        e = a.value,
        s = a.sort,
        r = a.index;
      (s
        ? "asc" == this.data.sortType || "all" == this.data.sortType
          ? this.setData({
              sortType: "desc",
            })
          : "desc" == this.data.sortType &&
            this.setData({
              sortType: "asc",
            })
        : this.setData({
            sortType: "all",
          }),
        this.setData({
          _value: e,
          idx: r,
        }),
        this.triggerEvent("filterTap", {
          value: e,
          sortType: this.data.sortType,
        }));
    },
  },
});
