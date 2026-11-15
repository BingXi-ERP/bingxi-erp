Component({
  properties: {
    customerList: {
      type: Object,
      value: {},
    },
  },
  attached: function () {
    console.log(this.properties.customerList);
  },
  data: {},
  methods: {
    tabBlock: function (t) {
      var e = t.currentTarget.dataset,
        i = e.uid,
        o = e.cid;
      this.triggerEvent("tabBlock", {
        id: i,
        cid: o,
      });
    },
  },
});
