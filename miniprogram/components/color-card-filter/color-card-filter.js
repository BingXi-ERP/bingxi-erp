var objectSpread2 = require("../../@babel/runtime/helpers/objectSpread2"),
  app = getApp();
Component({
  properties: {
    count: {
      type: Object,
      value: {
        on: "0",
        off: "0",
      },
    },
    userType: {
      type: String,
      value: "0",
    },
  },
  data: {
    tab: {
      active: 0,
      lineWidth: 20,
      color: "#2f7bfd",
      border: !1,
    },
    filterArr: [
      {
        name: "时间",
        action: "time",
        checked: !1,
        icon: "/assets/images/icon2nd/Icon_Sorting_NotSelect_Gray@2x.png",
        onOrDown: !0,
      },
      {
        name: "浏览量",
        action: "see",
        checked: !1,
        icon: "/assets/images/icon2nd/Icon_Sorting_NotSelect_Gray@2x.png",
        onOrDown: !0,
      },
      {
        name: "收藏量",
        action: "star",
        checked: !1,
        icon: "/assets/images/icon2nd/Icon_Sorting_NotSelect_Gray@2x.png",
        onOrDown: !0,
      },
    ],
    filter: {
      icon: "".concat(app.config.imgHost, "/img/customer/ic_shuaixuan@3x.png"),
      list: [
        {
          name: "时间由近到远",
          activeIcon: "".concat(app.config.imgHost, "/img/customer/ic_xzsx@3x.png"),
          filterKey: 2,
          filterId: 0,
        },
        {
          name: "时间由远到近",
          activeIcon: "".concat(app.config.imgHost, "/img/customer/ic_xzsx@3x.png"),
          filterKey: 1,
          filterId: 1,
        },
        {
          name: "浏览量由低到高",
          activeIcon: "".concat(app.config.imgHost, "/img/customer/ic_xzsx@3x.png"),
          filterKey: 3,
          filterId: 2,
        },
        {
          name: "浏览量由高到低",
          activeIcon: "".concat(app.config.imgHost, "/img/customer/ic_xzsx@3x.png"),
          filterKey: 4,
          filterId: 3,
        },
        {
          name: "收藏量由低到高",
          activeIcon: "".concat(app.config.imgHost, "/img/customer/ic_xzsx@3x.png"),
          filterKey: 5,
          filterId: 4,
        },
        {
          name: "收藏量由高到低",
          activeIcon: "".concat(app.config.imgHost, "/img/customer/ic_xzsx@3x.png"),
          filterKey: 6,
          filterId: 5,
        },
      ],
      show: !1,
      activeId: 0,
      filterKey: 2,
    },
    tabActive: 0,
  },
  methods: {
    onChange: function (t) {
      var app = t.currentTarget.dataset.index;
      0 == app
        ? (this.setData({
            tabActive: 0,
          }),
          this.triggerEvent("changeTab", {
            saleStatus: 0,
          }))
        : 1 == app &&
          (this.setData({
            tabActive: 1,
          }),
          this.triggerEvent("changeTab", {
            saleStatus: 1,
          }));
    },
    changeFilter: function (t) {
      var app,
        i = t.currentTarget.dataset,
        n = i.action,
        r = i.onOrDown,
        c = null;
      switch (n) {
        case "time":
          ((e = 1 === (c = r ? 0 : 1) ? 1 : 2),
            this.triggerEvent("filterConfirm", {
              filterKey: app,
              orderType: c,
            }),
            this.changeFilterArr(n));
          break;
        case "see":
          ((e = 1 === (c = r ? 0 : 1) ? 3 : 4),
            this.triggerEvent("filterConfirm", {
              filterKey: app,
              orderType: c,
            }),
            this.changeFilterArr(n));
          break;
        case "star":
          ((e = 1 === (c = r ? 0 : 1) ? 5 : 6),
            this.triggerEvent("filterConfirm", {
              filterKey: app,
              orderType: c,
            }),
            this.changeFilterArr(n));
      }
    },
    changeFilterArr: function (i) {
      var n = this.data.filterArr.map(function (n) {
        return i === n.action
          ? objectSpread2(
              objectSpread2({}, n),
              {},
              {
                checked: !0,
                icon: n.onOrDown
                  ? "/assets/images/icon2nd/Icon_Sorting_Up_Gray@2x.png"
                  : "".concat(
                      app.config.imgHost,
                      "/img/customer/duibuIcon/icon/Icon_Sorting_Down_Gray@2x.png",
                    ),
                onOrDown: !n.onOrDown,
              },
            )
          : objectSpread2(
              objectSpread2({}, n),
              {},
              {
                checked: !1,
                icon: "/assets/images/icon2nd/Icon_Sorting_NotSelect_Gray@2x.png",
                onOrDown: !0,
              },
            );
      });
      this.setData({
        filterArr: n,
      });
    },
    showFilter: function () {
      ((this.data.filter.show = !this.data.filter.show),
        this.setData({
          "filter.show": this.data.filter.show,
        }));
    },
    filterTap: function (t) {
      var app = t.currentTarget.dataset,
        i = app.filterid,
        n = app.filterkey;
      this.setData({
        "filter.activeId": i,
        "filter.filterKey": n,
      });
    },
    cancel: function () {
      this.setData({
        "filter.show": !1,
      });
    },
    confirm: function () {
      (this.triggerEvent("filterConfirm", {
        filterKey: this.data.filter.filterKey,
      }),
        this.setData({
          "filter.show": !1,
        }));
    },
  },
});
