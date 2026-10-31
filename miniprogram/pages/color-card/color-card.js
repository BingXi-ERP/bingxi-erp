var t = require("../../@babel/runtime/helpers/regeneratorRuntime"),
  a = require("../../@babel/runtime/helpers/asyncToGenerator"),
  toConsumableArray = require("../../@babel/runtime/helpers/toConsumableArray"),
  objectSpread2 = require("../../@babel/runtime/helpers/objectSpread2"),
  app = getApp(),
  ServicesCard = require("../../libs/services/ServicesCard.js").servicesCard;
Page({
  data: {
    filterTabs: [
      {
        label: "全部",
        value: 0,
      },
      {
        label: "已完成",
        value: 1,
      },
      {
        label: "部分采集",
        value: 2,
      },
      {
        label: "未采集",
        value: 3,
      },
    ],
    filterArr: [
      {
        name: "时间",
        action: "time",
        checked: !1,
        icon: "/assets/images/icon2nd/Icon_Sorting_NotSelect_Gray@2x.png",
        onOrDown: !0,
      },
    ],
    getDataListParams: {
      collectStatus: 0,
      keyword: "",
      sortType: void 0,
      page: 1,
      size: 12,
    },
    list: [],
    total: 0,
    pages: 0,
  },
  onLoad: function () {
    this.getDataList();
  },
  getValue: function (t) {
    var a = t.detail.value;
    this.setData({
      "getDataListParams.keyword": a,
    });
  },
  onSearch: function (t) {
    (this.setData({
      getDataListParams: objectSpread2(
        objectSpread2({}, this.data.getDataListParams),
        {},
        {
          page: 1,
        },
      ),
    }),
      this.getDataList());
  },
  getDataList: function () {
    var t = this;
    (wx.showLoading({
      title: "拼命加载中...",
    }),
      ServicesCard.getElColorCardList(this.data.getDataListParams).then(function (a) {
        (0 === a.code
          ? t.setData({
              list: [].concat(toConsumableArray(t.data.list), toConsumableArray(a.data.content)),
              total: a.data.total,
              pages: Math.ceil(a.data.total / t.data.getDataListParams.size),
            })
          : (wx.showToast({
              title: a.msg,
              icon: "none",
            }),
            t.setData({
              isLoad: !1,
            })),
          wx.hideLoading());
      }));
  },
  colorActionTap: function (t) {
    var a = t.currentTarget.dataset.goodsid;
    wx.navigateTo({
      url: "/pages/color-card-management/add-colour/add-colour?goodsId=".concat(a),
    });
  },
  changeStatus: function (e) {
    var app = this;
    return a(
      t().mark(function a() {
        var ServicesCard;
        return t().wrap(function (t) {
          for (;;)
            switch ((t.prev = t.next)) {
              case 0:
                return (
                  (s = e.currentTarget.dataset.value),
                  (t.next = 1),
                  app.setData({
                    list: [],
                    getDataListParams: objectSpread2(
                      objectSpread2({}, app.data.getDataListParams),
                      {},
                      {
                        collectStatus: ServicesCard,
                        page: 1,
                      },
                    ),
                  })
                );
              case 1:
                app.getDataList();
              case 2:
              case "end":
                return t.stop();
            }
        }, a);
      }),
    )();
  },
  colorSetting: function (t) {
    var a = t.currentTarget.dataset.goodsid;
    wx.navigateTo({
      url: "/pages/color-card/color-card-setting/color-card-setting?productId=".concat(a),
    });
  },
  serviceConnnet: function () {
    (wx.removeStorageSync("checkColorItem"),
      wx.navigateTo({
        url: "/packageB/pages/personal-center/link-print/link-print?title=色差仪",
      }));
  },
  onReachBottom: function () {
    this.data.getDataListParams.page >= this.data.pages
      ? wx.showToast({
          title: "数据已全部加载完毕",
          icon: "none",
        })
      : (this.data.getDataListParams.page++,
        this.setData({
          "getDataListParams.page": this.data.getDataListParams.page,
        }),
        this.getDataList());
  },
  changeFilter: function (t) {
    var a,
      toConsumableArray = t.currentTarget.dataset,
      ServicesCard = toConsumableArray.action,
      n = toConsumableArray.onOrDown;
    ((a = n ? 1 : 2),
      this.setData({
        list: [],
        "getDataListParams.page": 1,
        "getDataListParams.sortType": a,
      }),
      console.log(n, "onOrDown"),
      this.getDataList());
    var i = this.data.filterArr.map(function (t) {
      return ServicesCard === t.action
        ? objectSpread2(
            objectSpread2({}, t),
            {},
            {
              checked: !0,
              icon: t.onOrDown
                ? "/assets/images/icon2nd/Icon_Sorting_Up_Gray@2x.png"
                : "".concat(
                    app.config.imgHost,
                    "/img/customer/duibuIcon/icon/Icon_Sorting_Down_Gray@2x.png",
                  ),
              onOrDown: !t.onOrDown,
            },
          )
        : objectSpread2(
            objectSpread2({}, t),
            {},
            {
              checked: !1,
              icon: "/assets/images/icon2nd/Icon_Sorting_NotSelect_Gray@2x.png",
              onOrDown: !0,
            },
          );
    });
    this.setData({
      filterArr: i,
    });
  },
});
