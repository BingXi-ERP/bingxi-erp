/**
 * 图片上传组件
 * ---------------------------------------------------------------
 * 功能：宿主页面选图并逐张上传，把可显示地址回抛给宿主的 uoloadImg 事件
 * 调用方：pages 与 packageB 里声明 <upload-img> 的页面（由各自 wxml 引入）
 * 入参：组件属性 uploadPiece 与 filePath 与 uploadType；uploadType 大于 -1 走图片件通道，否则走通用文件通道
 * 传给谁：libs/utils/uploadGateway.js 的 upload（内部由 apiGateway.requestContract 发出），
 *   不再直发 wx.uploadFile，也不自拼 Authorization 头——凭据是后端 httpOnly Cookie，
 *   由 wx 网络层自动维护，JS 侧读 storage 的 token 永远拿到空值，属凭据冒充登录态
 * 存什么：不存任何凭据，只在内存里维护已上传地址表
 * 存哪里：无（组件 data 与宿主页面事件载荷）
 */
var t,
  a,
  e,
  s,
  i,
  o,
  createForOfIteratorHelper = require("../../@babel/runtime/helpers/createForOfIteratorHelper"),
  util = require("../../libs/utils/util"),
  uploadGateway = require("../../libs/utils/uploadGateway.js"),
  app = getApp(),
  l = function (t) {
    return Math.floor((t / 750) * wx.getSystemInfoSync().windowWidth);
  };
Component({
  properties: {
    uploadBtnIcon: {
      type: String,
      value: "",
    },
    uploadBtnWord: {
      type: String,
      value: "",
    },
    uploadBtnRadius: {
      type: String,
      value: "0",
    },
    uploadBtnWidth: {
      type: String,
      value: "150",
    },
    uploadBtnHeight: {
      type: String,
      value: "150",
    },
    uploadBtnBg: {
      type: String,
      value: "#f5f5f9",
    },
    uploadBtnWordFontSize: {
      type: String,
      value: "22",
    },
    uploadBtnWordFontColor: {
      type: String,
      value: "#C7C8D8",
    },
    uploadBtnBorder: {
      type: String,
      value: "2rpx dashed #C7C8D8",
    },
    uploadMargin: {
      type: String,
      value: "0 16rpx 16rpx 0",
    },
    list: {
      type: Array,
      value: [],
      observer: function (t, a) {
        if (t.length > 0 && 0 == a.length) {
          var e,
            s = new Array(),
            i = createForOfIteratorHelper(t);
          try {
            for (i.s(); !(e = i.n()).done;) {
              var o = e.value;
              s.push({
                text: o,
              });
            }
          } catch (t) {
            i.e(t);
          } finally {
            i.f();
          }
          this.setData({
            showImgList: s,
          });
        }
      },
    },
    uploadPiece: {
      type: Number,
      value: 9,
    },
    uploadType: {
      type: Number,
      value: null,
    },
    filePath: {
      type: String,
      value: "/bdd/upload",
    },
  },
  data: {
    showImgList: [],
    current: -1,
    move_x: "",
    move_y: "",
    s_v: l(16),
    s_h: l(16),
    u_w: l(150),
    u_h: l(150),
    all_width: "",
    marginFixable: "",
  },
  methods: {
    getWidth: function () {
      var t = this;
      wx.getSystemInfo({
        success: function (a) {
          var e = (t.data.all_width = 0.98 * a.screenWidth),
            s = 0,
            i = 0,
            o = 0,
            createForOfIteratorHelper = [].concat(t.data.showImgList);
          (createForOfIteratorHelper.forEach(function (a, r) {
            ((a.left = (t.data.u_w + t.data.s_h) * i),
              (a.top = (t.data.u_h + t.data.s_v) * o),
              (a._left = a.left),
              (a._top = a.top),
              (s += t.data.u_w + t.data.s_h) + t.data.u_w + t.data.s_h > e
                ? ((s = 0), (i = 0), o++)
                : i++);
          }),
            console.log("getWidth----------", createForOfIteratorHelper),
            t.setData({
              showImgList: createForOfIteratorHelper,
            }));
        },
      });
    },
    chooseImg: function () {
      var t = this;
      wx.showActionSheet({
        itemList: ["从相册中选择", "拍照"],
        success: function (a) {
          a.cancel ||
            (0 == a.tapIndex
              ? t.chooseWxImage("album")
              : 1 == a.tapIndex && t.chooseWxImage("camera"));
        },
      });
    },
    chooseWxImage: function (t) {
      var a = this.properties,
        e = a.uploadPiece,
        s = a.filePath,
        i = a.uploadType,
        o = this.data.showImgList,
        l = e - o.length,
        u = this;
      setTimeout(function () {
        wx.showLoading({
          title: "上传中",
        });
      }, 500);
      var d =
        i && i > -1
          ? app.config.bingxiHost + "/app-api/oss/upload"
          : app.config.bingxiHost + "/app-api/file/upload";
      wx.chooseMedia({
        count: l,
        sizeType: ["original", "compressed"],
        mediaType: ["image"],
        sourceType: [t],
        success: function (t) {
          var files = t.tempFiles || [];
          setTimeout(function () {
            wx.showLoading({
              title: "上传中",
            });
          }, 500);
          var uploaded = 0;
          /** 全部文件处理完（成功或失败）后收起 loading，失败也计数，避免卡住不回落 */
          var settleOne = function () {
            uploaded += 1;
            if (uploaded === files.length) {
              setTimeout(function () {
                (console.log("上传完成"), wx.hideLoading());
              }, 500);
            }
          };
          /** 把当前 showImgList 的地址表回抛给宿主页面 */
          var emitList = function () {
            var list = u.data.showImgList,
              urls = [];
            for (var k = 0; k < list.length; k++) urls.push(list[k].text);
            u.triggerEvent("uoloadImg", {
              showImgList: urls,
            });
          };
          for (var pos = 0; pos < files.length; pos++) {
            (function (file) {
              uploadGateway
                .upload({
                  url: d,
                  filePath: file.tempFilePath,
                  name: "file",
                  header: {
                    terminalType: 81,
                  },
                  formData: {
                    type: i,
                    filePath: s,
                  },
                })
                .then(function (res) {
                  if (res && res.code === 0) {
                    (o.push({
                      text: util.utils.replImage(res.data),
                    }),
                      o.length > e && (o.length = e),
                      u.setData({
                        showImgList: o,
                      }));
                    emitList();
                  } else
                    wx.showToast({
                      title: (res && res.msg) || "上传失败",
                      icon: "none",
                    });
                  (u.getWidth(), settleOne());
                })
                .catch(function (err) {
                  wx.showToast({
                    title: (err && err.errMsg) || "上传失败",
                    icon: "none",
                  });
                  (u.getWidth(), settleOne());
                });
            })(files[pos]);
          }
        },
        fail: function () {
          wx.hideLoading();
        },
      });
    },
    delImg: function (t) {
      var a = t.currentTarget.dataset.index,
        e = this.data.showImgList;
      (e.splice(a, 1),
        this.setData({
          showImgList: e,
        }),
        this.getWidth());
      var s,
        i = [],
        o = createForOfIteratorHelper(this.data.showImgList);
      try {
        for (o.s(); !(s = o.n()).done;) {
          var util = s.value;
          i.push(util.text);
        }
      } catch (t) {
        o.e(t);
      } finally {
        o.f();
      }
      this.triggerEvent("delImg", {
        showImgList: i,
      });
    },
    imgTap: function (t) {
      var a = t.currentTarget.dataset.index,
        e = this.data.showImgList;
      console.log(this.data.showImgList);
      var s,
        i = [],
        o = createForOfIteratorHelper(e);
      try {
        for (o.s(); !(s = o.n()).done;) {
          var util = s.value;
          i.push(util.text);
        }
      } catch (t) {
        o.e(t);
      } finally {
        o.f();
      }
      wx.previewImage({
        current: i[a],
        urls: i,
      });
    },
    movestart: function (i) {
      ((t = i.touches[0].clientX),
        (a = i.touches[0].clientY),
        (e = i.currentTarget.offsetLeft),
        (s = i.currentTarget.offsetTop),
        this.setData({
          current: i.target.dataset.index,
          move_x: e,
          move_y: s,
        }));
    },
    move: function (r) {
      ((i = r.touches[0].clientX - t + e), (o = r.touches[0].clientY - a + s));
      var util = this.getCurrnetUnderIndex();
      if ((console.log(this.data.current, util), null != util && util != this.data.current)) {
        var app = [].concat(this.data.showImgList);
        (console.log(app),
          this.changeArrayData(app, util, this.data.current),
          this.setData({
            showImgList: app,
            current: util,
          }));
      }
      this.setData({
        move_x: i,
        move_y: o,
      });
    },
    moveend: function (t) {
      this.setData({
        current: -1,
      });
      var a,
        e = [],
        s = createForOfIteratorHelper(this.data.showImgList);
      try {
        for (s.s(); !(a = s.n()).done;) {
          var i = a.value;
          e.push(i.text);
        }
      } catch (t) {
        s.e(t);
      } finally {
        s.f();
      }
      this.triggerEvent("uoloadImg", {
        showImgList: e,
      });
    },
    getCurrnetUnderIndex: function (t, a) {
      ((t = i + this.data.u_w / 2), (a = o + this.data.u_h / 2));
      var e = !1,
        s = !1,
        createForOfIteratorHelper =
          ((this.data.all_width - this.data.s_h) / (this.data.s_h + this.data.u_w)) >> 0,
        util = ((a - this.data.s_v) / (this.data.u_h + this.data.s_v)) >> 0,
        app = this.data.s_v + util * (this.data.u_h + this.data.s_v),
        l = app + this.data.u_h;
      a > app && a < l && (e = !0);
      var u = ((t - this.data.s_h) / (this.data.u_w + this.data.s_h)) >> 0,
        d = this.data.s_h + u * (this.data.u_w + this.data.s_h),
        c = d + this.data.u_w;
      if ((t > d && t < c && (s = !0), e && s)) {
        var g = util * createForOfIteratorHelper + u;
        return g > this.data.showImgList.length - 1 ? null : g;
      }
      return null;
    },
    changeArrayData: function (t, a, e) {
      var s = t[a];
      ((t[a] = t[e]), (t[e] = s));
      var i = t[a]._left,
        o = t[a]._top;
      ((t[a]._left = t[e]._left), (t[a]._top = t[e]._top), (t[e]._left = i), (t[e]._top = o));
      var createForOfIteratorHelper = t[a].left,
        util = t[a].top;
      ((t[a].left = t[e].left),
        (t[a].top = t[e].top),
        (t[e].left = createForOfIteratorHelper),
        (t[e].top = util),
        this.setData({
          showImgList: t,
        }));
    },
  },
  ready: function () {
    switch ((console.log(app.globalData.mobileInfo), app.globalData.mobileInfo.screenWidth)) {
      case 360:
      case 375:
        this.setData({
          marginFixable: "20rpx 0 0 32rpx",
        });
        break;
      case 411:
      case 412:
      case 414:
        this.setData({
          marginFixable: "8rpx 0 0 8rpx",
        });
        break;
      case 768:
        this.setData({
          u_w: 180,
          u_h: 180,
          marginFixable: "20rpx 0 0 16rpx",
        });
        break;
      case 834:
        this.setData({
          u_w: 200,
          u_h: 200,
          marginFixable: "20rpx 0 0 26rpx",
        });
        break;
      case 1024:
        this.setData({
          u_w: 250,
          u_h: 250,
          marginFixable: "20rpx 0 0 22rpx",
        });
    }
  },
});
