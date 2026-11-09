var t = require("../../../@babel/runtime/helpers/interopRequireDefault").default,
  ServicesSearch = require("../../libs/services/ServicesSearch"),
  toast = t(require("../../../miniprogram_npm/@vant/weapp/toast/toast")),
  notify = t(require("../../../miniprogram_npm/@vant/weapp/notify/notify")),
  app = getApp();
Component({
  properties: {
    show: {
      type: Boolean,
      value: !1,
      observer: function (t) {
        t && this.onInitParams();
      },
    },
    isAllStation: {
      type: Boolean,
      value: !0,
      observer: function (t) {
        this.setData({
          platStation: t,
        });
      },
    },
    isRestock: {
      type: Boolean,
      value: !1,
    },
    familyParams: {
      type: Array,
      value: [],
    },
    searchId: {
      type: String,
      value: "",
    },
  },
  data: {
    isSelectedFamily: !1,
    filterOptions: [
      {
        mode: 1,
        title: "选择家族",
        ftitle: "",
        stitle: "",
        deviceProp: "",
        selectProp: "clusterCode",
        minProp: "",
        maxProp: "",
        otherProp: "",
        multiple: !0,
        options: [],
      },
      {
        mode: 2,
        title: "克重",
        ftitle: "克重偏差",
        stitle: "克重选择",
        deviceProp: "Deviation",
        selectProp: "gramWeight",
        minProp: "Min",
        maxProp: "Max",
        otherProp: "Other",
        multiple: !1,
        options: [],
        children: [],
      },
      {
        mode: 2,
        title: "幅宽",
        ftitle: "幅宽偏差",
        stitle: "幅宽选择",
        deviceProp: "Deviation",
        selectProp: "clothWidth",
        minProp: "Min",
        maxProp: "Max",
        otherProp: "Other",
        multiple: !1,
        options: [],
        children: [],
      },
      {
        mode: 2,
        title: "成分(可多选)",
        ftitle: "",
        stitle: "",
        deviceProp: "",
        selectProp: "material",
        minProp: "",
        maxProp: "",
        otherProp: "",
        multiple: !0,
        options: [],
      },
      {
        mode: 1,
        title: "后工艺",
        ftitle: "",
        stitle: "",
        deviceProp: "",
        selectProp: "process",
        minProp: "",
        maxProp: "",
        otherProp: "",
        multiple: !0,
        options: [],
      },
    ],
    filterOptionsComputed: [],
    filterParams: {},
    atFilterParams: {},
    platFilterParams: {},
    filterFormInline: {
      gramWeightMin: "",
      gramWeightMax: "",
      clothWidthMin: "",
      clothWidthMax: "",
      clothWidth: "",
      clothWidthOther: !1,
      clothWidthDeviation: "",
      deltaInterval: "0,3",
      gramWeight: "",
      gramWeightDeviation: "",
      gramWeightOther: !1,
      material: [],
      baiBuMaterial: [],
      process: [],
      clusterCode: [],
      region: "",
      searchId: "",
      page: 1,
      size: 10,
      totalPage: 0,
    },
    platStation: !0,
    icon: {
      delete: "".concat(app.config.imgHost, "/img/customer/duibuIcon/icon/del@2x.png"),
    },
  },
  methods: {
    onClose: function () {
      this.setData({
        show: !1,
      });
    },
    initFilterParam: function () {
      var t = {
        gramWeightMin: "",
        gramWeightMax: "",
        clothWidthMin: "",
        clothWidthMax: "",
        clothWidth: "",
        clothWidthOther: !1,
        clothWidthDeviation: "",
        deltaInterval: "0,3",
        gramWeight: "",
        gramWeightDeviation: "",
        duiBuCode: "",
        gramWeightOther: !1,
        material: [],
        baiBuMaterial: [],
        process: [],
        clusterCode: [],
        region: "",
        page: 1,
        size: 10,
        totalPage: 0,
        searchId: this.data.searchId,
      };
      this.setData({
        filterFormInline: t,
        isSelectedFamily: !1,
      });
    },
    onResetFilter: function () {
      (this.initFilterParam(), this.triggerEvent("reset"));
    },
    onConfirmFilter: function () {
      var t,
        ServicesSearch = this.data,
        notify = ServicesSearch.filterFormInline,
        app = ServicesSearch.platStation;
      if (!notify.gramWeightOther || notify.gramWeightMin || notify.gramWeightMax) {
        if (!notify.clothWidthOther || notify.clothWidthMin || notify.clothWidthMax) {
          if (
            notify.clothWidthMin &&
            notify.clothWidthMax &&
            Number(notify.clothWidthMin) > Number(notify.clothWidthMax)
          )
            toast.default.fail("最小幅宽不能大于最大幅宽");
          else if (
            notify.gramWeightMin &&
            notify.gramWeightMax &&
            Number(notify.gramWeightMin) > Number(notify.gramWeightMax)
          )
            toast.default.fail("最小克重不能大于最大克重");
          else {
            var l = notify.clothWidthOther
                ? (notify.clothWidthMin ? notify.clothWidthMin : "0") +
                  "," +
                  (notify.clothWidthMax ? notify.clothWidthMax : "999999999")
                : notify.clothWidth,
              o = notify.gramWeightOther
                ? (notify.gramWeightMin ? notify.gramWeightMin : "0") +
                  "," +
                  (notify.gramWeightMax ? notify.gramWeightMax : "999999999")
                : notify.gramWeight,
              n = {
                mode: app ? 1 : 0,
                page: 1,
                size: 10,
                totalPage: 0,
                clothWidth: l,
                clothWidthDeviation: notify.clothWidthDeviation,
                deltaInterval: notify.deltaInterval,
                gramWeight: o,
                gramWeightDeviation: notify.gramWeightDeviation,
                searchId: null === (t = this.data) || void 0 === t ? void 0 : t.searchId,
                material: notify.material.join(","),
              };
            (app && notify.process.length && (n.process = notify.process.join(",")),
              app && notify.region && (n.region = notify.region),
              app && notify.clusterCode.length && (n.clusterCode = notify.clusterCode.join(",")),
              this.data.isRestock &&
                ((n.material = []),
                notify.material.forEach(function (t) {
                  (n.material.push(t.name), n.material.push(t.enName));
                })),
              this.setData({
                show: !1,
              }),
              this.triggerEvent("confirm", n));
          }
        } else toast.default.fail("其他选项，幅宽至少填写一个");
      } else toast.default.fail("其他选项，克重至少填写一个");
    },
    onFilterInput: function (t) {
      var ServicesSearch = t.currentTarget.dataset,
        toast = ServicesSearch.prop,
        notify = ServicesSearch.inputarea;
      notify &&
        ((this.data.filterFormInline[notify] = ""),
        (this.data.filterFormInline[notify + "Other"] = !0));
      var app = t.detail.value;
      ((this.data.filterFormInline[toast] = app),
        this.setData({
          filterFormInline: this.data.filterFormInline,
        }));
    },
    onFamilyAllChecked: function (t) {
      var ServicesSearch = this.data,
        toast = ServicesSearch.filterFormInline,
        notify = ServicesSearch.filterOptionsComputed,
        app = t.detail;
      if (app)
        return (
          (toast.clusterCode = notify
            .find(function (t) {
              return "clusterCode" === t.selectProp;
            })
            .options.map(function (t) {
              return t.paramValue;
            })),
          void this.setData({
            filterFormInline: toast,
            isSelectedFamily: app,
          })
        );
      ((toast.clusterCode = []),
        this.setData({
          filterFormInline: toast,
          isSelectedFamily: app,
        }));
    },
    onTapSelectOtherData: function (t) {
      var ServicesSearch = this.data.filterFormInline,
        toast = t.currentTarget.dataset.item;
      if (
        ((ServicesSearch[toast.selectProp] = ""),
        (ServicesSearch[toast.selectProp + toast.minProp] = ""),
        (ServicesSearch[toast.selectProp + toast.maxProp] = ""),
        ServicesSearch[toast.selectProp + toast.otherProp])
      )
        return (
          (ServicesSearch[toast.selectProp + toast.otherProp] = !1),
          void this.setData({
            filterFormInline: ServicesSearch,
          })
        );
      ((ServicesSearch[toast.selectProp + toast.otherProp] = !0),
        this.setData({
          filterFormInline: ServicesSearch,
        }));
    },
    onTapSelectData: function (t) {
      var ServicesSearch = this.data.filterFormInline,
        toast = t.currentTarget.dataset,
        app = toast.schild,
        l = toast.item;
      if (l.multiple) {
        if ("baiBuMaterial" === l.selectProp) {
          var o = ServicesSearch[l.selectProp].findIndex(function (t) {
            return t.baiBuMaterialId === app.id;
          });
          if (o > -1)
            (ServicesSearch[l.selectProp].splice(o, 1),
              this.setData({
                filterFormInline: ServicesSearch,
              }));
          else {
            if (ServicesSearch[l.selectProp].length >= 5)
              return void (0, notify.default)({
                message: "百布成分视为最终筛选条件，且筛选条件不能超过五个",
                type: "warning",
              });
            (ServicesSearch[l.selectProp].push({
              name: app.paramLabel,
              baiBuMaterialId: app.id,
              percent: "",
            }),
              this.setData({
                filterFormInline: ServicesSearch,
              }));
          }
          return;
        }
        if ("material" === l.selectProp && this.data.isRestock) {
          var n = ServicesSearch[l.selectProp].findIndex(function (t) {
            return t.materialId === app.id;
          });
          return (
            n > -1
              ? ServicesSearch[l.selectProp].splice(n, 1)
              : ServicesSearch[l.selectProp].push({
                  name: app.paramLabel,
                  materialId: app.id,
                  enName: app.paramLabelEn,
                }),
            void this.setData({
              filterFormInline: ServicesSearch,
            })
          );
        }
        var s = ServicesSearch[l.selectProp].indexOf(app.paramValue);
        return (
          s > -1
            ? ServicesSearch[l.selectProp].splice(s, 1)
            : ServicesSearch[l.selectProp].push(app.paramValue),
          void this.setData({
            filterFormInline: ServicesSearch,
          })
        );
      }
      if (
        (l.otherProp &&
          ServicesSearch[l.selectProp + l.otherProp] &&
          ((ServicesSearch[l.selectProp + l.minProp] = ""),
          (ServicesSearch[l.selectProp + l.maxProp] = ""),
          (ServicesSearch[l.selectProp + l.otherProp] = !1),
          this.setData({
            filterFormInline: ServicesSearch,
          })),
        ServicesSearch[l.selectProp] === app.paramValue)
      )
        return (
          (ServicesSearch[l.selectProp] = ""),
          void this.setData({
            filterFormInline: ServicesSearch,
          })
        );
      ((ServicesSearch[l.selectProp] = app.paramValue),
        this.setData({
          filterFormInline: ServicesSearch,
        }));
    },
    onTapSelectChildData: function (t) {
      var ServicesSearch = this.data.filterFormInline,
        toast = t.currentTarget.dataset,
        notify = toast.schild,
        app = toast.item;
      if (ServicesSearch[app.selectProp + app.deviceProp] === notify.paramValue)
        return (
          (ServicesSearch[app.selectProp + app.deviceProp] = ""),
          void this.setData({
            filterFormInline: ServicesSearch,
          })
        );
      ((ServicesSearch[app.selectProp + app.deviceProp] = notify.paramValue),
        this.setData({
          filterFormInline: ServicesSearch,
        }));
    },
    setValueFilterConfig: function (t) {
      var ServicesSearch = this.data,
        toast = ServicesSearch.filterOptionsComputed,
        notify = ServicesSearch.platStation,
        app = ServicesSearch.familyParams;
      (toast.forEach(function (e) {
        (e.selectProp && (e.options = t[e.selectProp] || []),
          e.deviceProp && (e.children = t[e.selectProp + e.deviceProp] || []),
          "clusterCode" === e.selectProp && (e.options = notify ? app : []));
      }),
        this.setData({
          filterOptionsComputed: toast,
        }));
    },
    onInitParams: function () {
      var t = this;
      this.setData({
        filterParams: {},
      });
      var ServicesSearch = this.data.filterOptions.filter(function (e) {
        return (t.data.isAllStation ? 1 === e.mode : 0 === e.mode) || 2 === e.mode;
      });
      (this.setData({
        filterOptionsComputed: ServicesSearch,
      }),
        this.data.platStation ? this.getPlatSearchFilterParam() : this.getSearchFilterParam());
    },
    getSearchFilterParam: function () {
      var t = this;
      if (Object.keys(this.data.atFilterParams).length > 0)
        return (
          this.setValueFilterConfig(this.data.atFilterParams),
          void this.setData({
            filterParams: this.data.atFilterParams,
          })
        );
      ServicesSearch.ServicesSearch.getFilterParam()
        .then(function (e) {
          (t.setValueFilterConfig(e.data),
            t.setData({
              atFilterParams: e.data,
            }));
        })
        .catch(function (e) {
          (console.log(e), t.onClose());
        });
    },
    getPlatSearchFilterParam: function () {
      var t = this;
      if (Object.keys(this.data.platFilterParams).length > 0)
        return (
          this.setValueFilterConfig(this.data.platFilterParams),
          void this.setData({
            filterParams: this.data.platFilterParams,
          })
        );
      ServicesSearch.ServicesSearch.getPlatFilterParam()
        .then(function (e) {
          (t.setValueFilterConfig(e.data),
            t.setData({
              platFilterParams: e.data,
            }));
        })
        .catch(function (e) {
          (console.log(e), t.onClose());
        });
    },
  },
});
