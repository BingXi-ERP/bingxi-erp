getApp();
Component({
  properties: {
    count: {
      type: Object,
      value: {
        inTransitCount: "0",
        breakCount: "0",
        inReviewCount: "0",
      },
    },
    userType: {
      type: String,
      value: "1",
    },
  },
  data: {
    tab: {
      active: 1,
      lineWidth: 20,
      color: "#2f7bfd",
      border: !1,
    },
    tabActive: 1,
  },
  methods: {
    onChange: function (t) {
      var e = t.currentTarget.dataset.index;
      (this.setData({
        tabActive: e,
      }),
        this.triggerEvent("changeTab", {
          saleStatus: e,
        }));
    },
  },
});
