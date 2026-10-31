var t = require("../../../../@babel/runtime/helpers/interopRequireDefault").default,
  e = require("../../../../@babel/runtime/helpers/defineProperty"),
  pinyin = t(require("../../../../libs/utils/pinyin")),
  ServicesCard = require("../../../../libs/services/ServicesCard.js").servicesCard;
Page({
  data: {
    delBtnWidth: 220,
    isScroll: !0,
    windowHeight: 0,
    inputValue: "",
    toView: "",
    logs: [],
    scrollTop: 0,
    HOT_SINGER_LEN: 10,
    listHeight: [],
    currentIndex: 0,
    fixedTitle: "",
    fixedTop: 56,
    list: [],
    colorName: "",
    showAddColorName: !1,
    colorName: "",
    engColorName: "",
    checkId: "",
    checkItem: "",
    curHeight: 0,
    windowHeight: 0,
    navbarHeight: 0,
    headerHeight: 0,
    scrollViewHeight: 0,
  },
  onLoad: function () {
    (this.countHeight(), this.getColorItem());
    var t = wx.getStorageSync("colorColorItem");
    ((this.data.checkId = t.colorName),
      this.setData({
        checkId: this.data.checkId,
        checkItem: t,
      }),
      wx.removeStorageSync("colorColorItem"));
  },
  countHeight: function () {
    var t = this,
      e = this;
    wx.getSystemInfo({
      success: function (t) {
        e.setData({
          windowHeight: t.windowHeight,
        });
      },
    });
    var pinyin = wx.createSelectorQuery().in(this);
    (pinyin.select(".color-code-input").boundingClientRect(),
      pinyin.exec(function (e) {
        var pinyin = e[0].height,
          ServicesCard = t.data.windowHeight - pinyin;
        t.setData({
          scrollViewHeight: ServicesCard,
        });
      }));
  },
  getValue: function (t) {
    var e = t.detail.value;
    this.setData({
      inputValue: e,
    });
  },
  searchCancel: function () {
    (this.setData({
      inputValue: "",
    }),
      this.getColorItem());
  },
  scroll: function (t) {
    var e = t.detail.scrollTop + 6;
    this.scrollY(e);
  },
  scrollY: function (t) {
    var e = this.data.listHeight;
    if (0 == t || t < 0)
      this.setData({
        currentIndex: 0,
        fixedTitle: "",
      });
    else {
      for (var pinyin = 0; pinyin < e.length - 1; pinyin++) {
        var ServicesCard = e[pinyin],
          o = e[pinyin + 1];
        if (t >= ServicesCard && t < o)
          return void this.setData({
            currentIndex: pinyin,
            fixedTitle: this.data.logs[pinyin] ? this.data.logs[pinyin].letter : "",
          });
      }
      this.setData({
        currentIndex: e.length - 2,
        fixedTitle: this.data.logs[e.length - 2] ? this.data.logs[e.length - 2].letter : "",
      });
    }
  },
  fixedTt: function (t) {
    var e = t > 0 && t < TITLE_HEIGHT ? t - TITLE_HEIGHT : 0;
    this.data.fixedTop !== e &&
      this.setData({
        fixedTop: e,
      });
  },
  _calculateHeight: function () {
    var t = [],
      e = this,
      pinyin = 0;
    (t.push(pinyin),
      wx
        .createSelectorQuery()
        .selectAll(".list-group")
        .boundingClientRect(function (e) {
          for (var ServicesCard = e, o = ServicesCard.length, r = 0; r < o; r++)
            ((a += ServicesCard[r].height), t.push(pinyin));
        })
        .exec());
    var ServicesCard = setInterval(function () {
      t != [0] &&
        (e.setData({
          listHeight: t,
        }),
        clearInterval(ServicesCard));
    }, 1e3);
  },
  scrollToview: function (t) {
    var e = t.target.dataset.id;
    this.setData({
      toView: e,
    });
  },
  drawStart: function (t) {
    var e = this,
      pinyin = t.touches[0],
      ServicesCard = t.currentTarget.dataset.findex,
      o = t.currentTarget.dataset.index;
    (this.data.logs.forEach(function (t, a) {
      t.childer.forEach(function (t, r) {
        (a == ServicesCard && o == r) || (e.data.logs[a].childer[r].right = 0);
      });
    }),
      this.setData({
        logs: this.data.logs,
        startX: pinyin.clientX,
      }));
  },
  drawMove: function (t) {
    var e = t.currentTarget.dataset.findex,
      pinyin = t.currentTarget.dataset.index,
      ServicesCard = t.touches[0],
      o = this.data.logs[e].childer[pinyin],
      r = this.data.startX - ServicesCard.clientX;
    r >= 20
      ? (r > this.data.delBtnWidth && (r = this.data.delBtnWidth),
        (o.right = r),
        this.setData({
          isScroll: !1,
          logs: this.data.logs,
        }))
      : ((o.right = 0),
        this.setData({
          isScroll: !0,
          logs: this.data.logs,
        }));
  },
  drawEnd: function (t) {
    var e = t.currentTarget.dataset.findex,
      pinyin = t.currentTarget.dataset.index,
      ServicesCard = this.data.logs[e].childer[pinyin];
    ServicesCard.right >= this.data.delBtnWidth / 2
      ? ((ServicesCard.right = this.data.delBtnWidth),
        this.setData({
          isScroll: !0,
          logs: this.data.logs,
        }))
      : ((ServicesCard.right = 0),
        this.setData({
          isScroll: !0,
          logs: this.data.logs,
        }));
  },
  delItem: function (t) {
    var e = this,
      pinyin = t.currentTarget.dataset.id,
      o = t.currentTarget.dataset.colorname;
    wx.showModal({
      title: "提示",
      content: "确定删除".concat(o, "？"),
      success: function (t) {
        t.confirm
          ? ServicesCard.delColorCardName(pinyin).then(function (t) {
              0 == t.code
                ? (wx.showToast({
                    title: "删除成功",
                    icon: "none",
                  }),
                  e.getColorItem())
                : wx.showToast({
                    title: t.msg.result,
                    icon: "none",
                  });
            })
          : t.cancel;
      },
    });
  },
  getColorItem: function () {
    var t = this,
      e = this,
      o = this.data.inputValue;
    (wx.showLoading(),
      ServicesCard.listV2({
        searchField: o,
      }).then(function (i) {
        if (0 == i.code) {
          for (var o = i.data || [], r = {}, s = 0; s < o.length; s++) {
            o[s].pinyin = pinyin.default.pinyin.getFullChars(o[s].colorName);
            var n = o[s].pinyin.substr(0, 1).toUpperCase();
            ((o[s].initial = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".indexOf(n) > -1 ? n : "#"),
              r[n] || (r[n] = []),
              r[n].push(o[s]));
          }
          for (var l = Object.keys(r).sort(), c = [], d = 0; d < l.length; d++) {
            var h = l[d];
            ((c = r[h].sort(e.compare("Nicename"))), (r[h] = c));
          }
          var u = [];
          (l.forEach(function (t, e) {
            u.push({
              letter: t,
              childer: r[t],
            });
          }),
            t.setData({
              logs: u,
              totalNum: i.data.colorCount,
            }),
            t._calculateHeight(),
            wx.hideLoading());
        } else
          wx.showToast({
            title: i.msg.result,
            icon: "none",
          });
      }));
  },
  compare: function (t) {
    return function (e, a) {
      return [e[t], a[t]].sort()[0] != e[t] ? 1 : -1;
    };
  },
  colorNameAdd: function () {
    var t = this,
      e = this,
      pinyin = {
        colorName: e.data.colorName,
        engColorName: e.data.engColorName,
      };
    ServicesCard.addColorCardName(pinyin).then(function (a) {
      (t.setData({
        colorName: "",
        engColorName: "",
      }),
        0 === a.code
          ? (wx.hideLoading(),
            wx.showToast({
              title: "新增成功",
              icon: "success",
            }),
            e.getColorItem())
          : wx.showToast({
              title: a.msg.result,
              icon: "none",
            }));
    });
  },
  addColorNameModal: function () {
    this.setData({
      showAddColorName: !0,
    });
  },
  cancelAdd: function () {
    this.setData({
      showAddColorName: !1,
      colorName: "",
      engColorName: "",
    });
  },
  addColorName: function (t) {
    ((this.data.colorName = t.detail.value),
      this.setData({
        colorName: this.data.colorName,
      }));
  },
  addColorEngName: function (t) {
    var e = t.detail.value
      .toLowerCase()
      .split(/\s+/)
      .map(function (t, e) {
        return t.slice(0, 1).toUpperCase() + t.slice(1);
      })
      .join(" ");
    this.setData({
      engColorName: e,
    });
  },
  sureAddName: function () {
    (this.setData({
      showAddColorName: !1,
    }),
      this.colorNameAdd());
  },
  checkColorName: function (t) {
    ((this.data.checkId = t.currentTarget.dataset.item.colorName),
      (this.data.checkItem = t.currentTarget.dataset.item),
      this.setData({
        checkId: this.data.checkId,
        checkItem: this.data.checkItem,
      }),
      wx.setStorageSync("checkColorItem", this.data.checkItem),
      wx.navigateBack({
        delta: 1,
      }));
  },
});
