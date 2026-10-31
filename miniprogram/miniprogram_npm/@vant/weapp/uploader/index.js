var e = function () {
  return (
    (e =
      Object.assign ||
      function (e) {
        for (var t, i = 1, a = arguments.length; i < a; i++)
          for (var n in (t = arguments[i]))
            Object.prototype.hasOwnProperty.call(t, n) && (e[n] = t[n]);
        return e;
      }),
    e.apply(this, arguments)
  );
};
Object.defineProperty(exports, "__esModule", { value: !0 });
var t = require("../common/component"),
  i = require("../common/validator"),
  a = require("./shared"),
  n = require("./utils");
(0, t.VantComponent)({
  props: e(
    e(
      e(
        e(
          {
            disabled: Boolean,
            multiple: Boolean,
            uploadText: String,
            useBeforeRead: Boolean,
            afterRead: null,
            beforeRead: null,
            previewSize: { type: null, value: 80 },
            name: { type: null, value: "" },
            accept: { type: String, value: "image" },
            fileList: { type: Array, value: [], observer: "formatFileList" },
            maxSize: { type: Number, value: Number.MAX_VALUE },
            maxCount: { type: Number, value: 100 },
            deletable: { type: Boolean, value: !0 },
            showUpload: { type: Boolean, value: !0 },
            previewImage: { type: Boolean, value: !0 },
            previewFullImage: { type: Boolean, value: !0 },
            videoFit: { type: String, value: "contain" },
            imageFit: { type: String, value: "scaleToFill" },
            uploadIcon: { type: String, value: "photograph" },
          },
          a.imageProps
        ),
        a.videoProps
      ),
      a.mediaProps
    ),
    a.messageFileProps
  ),
  data: { lists: [], isInCount: !0 },
  methods: {
    formatFileList: function () {
      var t = this.data,
        a = t.fileList,
        r = void 0 === a ? [] : a,
        o = t.maxCount,
        l = r.map(function (t) {
          return e(e({}, t), {
            isImage: (0, n.isImageFile)(t),
            isVideo: (0, n.isVideoFile)(t),
            deletable: !(0, i.isBoolean)(t.deletable) || t.deletable,
          });
        });
      this.setData({ lists: l, isInCount: l.length < o });
    },
    getDetail: function (e) {
      return {
        name: this.data.name,
        index: null == e ? this.data.fileList.length : e,
      };
    },
    startUpload: function () {
      var t = this,
        i = this.data,
        a = i.maxCount,
        r = i.multiple,
        o = i.lists;
      i.disabled ||
        (0, n.chooseFile)(e(e({}, this.data), { maxCount: a - o.length }))
          .then(function (e) {
            t.onBeforeRead(r ? e : e[0]);
          })
          .catch(function (e) {
            t.$emit("error", e);
          });
    },
    onBeforeRead: function (t) {
      var a = this,
        n = this.data,
        r = n.beforeRead,
        o = n.useBeforeRead,
        l = !0;
      "function" == typeof r && (l = r(t, this.getDetail())),
        o &&
          (l = new Promise(function (i, n) {
            a.$emit(
              "before-read",
              e(e({ file: t }, a.getDetail()), {
                callback: function (e) {
                  e ? i() : n();
                },
              })
            );
          })),
        l &&
          ((0, i.isPromise)(l)
            ? l.then(function (e) {
                return a.onAfterRead(e || t);
              })
            : this.onAfterRead(t));
    },
    onAfterRead: function (t) {
      var i = this.data,
        a = i.maxSize,
        n = i.afterRead;
      (
        Array.isArray(t)
          ? t.some(function (e) {
              return e.size > a;
            })
          : t.size > a
      )
        ? this.$emit("oversize", e({ file: t }, this.getDetail()))
        : ("function" == typeof n && n(t, this.getDetail()),
          this.$emit("after-read", e({ file: t }, this.getDetail())));
    },
    deleteItem: function (t) {
      var i = t.currentTarget.dataset.index;
      this.$emit(
        "delete",
        e(e({}, this.getDetail(i)), { file: this.data.fileList[i] })
      );
    },
    onPreviewImage: function (e) {
      if (this.data.previewFullImage) {
        var t = e.currentTarget.dataset.index,
          i = this.data,
          a = i.lists,
          r = i.showmenu,
          o = a[t];
        wx.previewImage({
          urls: a
            .filter(function (e) {
              return (0, n.isImageFile)(e);
            })
            .map(function (e) {
              return e.url;
            }),
          current: o.url,
          showmenu: r,
          fail: function () {
            wx.showToast({ title: "预览图片失败", icon: "none" });
          },
        });
      }
    },
    onPreviewVideo: function (t) {
      if (this.data.previewFullImage) {
        var i = t.currentTarget.dataset.index,
          a = this.data.lists,
          r = [],
          o = a.reduce(function (t, a, o) {
            return (0, n.isVideoFile)(a)
              ? (r.push(e(e({}, a), { type: "video" })), o < i && t++, t)
              : t;
          }, 0);
        wx.previewMedia({
          sources: r,
          current: o,
          fail: function () {
            wx.showToast({ title: "预览视频失败", icon: "none" });
          },
        });
      }
    },
    onPreviewFile: function (e) {
      if (this.data.previewFile) {
        var t = e.currentTarget.dataset.index;
        wx.openDocument({ filePath: this.data.lists[t].url, showMenu: !0 });
      }
    },
    onClickPreview: function (t) {
      var i = t.currentTarget.dataset.index,
        a = this.data.lists[i];
      this.$emit("click-preview", e(e({}, a), this.getDetail(i)));
    },
  },
});
