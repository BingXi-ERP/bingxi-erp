var e = function () {
  return (
    (e =
      Object.assign ||
      function (e) {
        for (var t, i = 1, r = arguments.length; i < r; i++)
          for (var u in (t = arguments[i]))
            Object.prototype.hasOwnProperty.call(t, u) && (e[u] = t[u]);
        return e;
      }),
    e.apply(this, arguments)
  );
};
Object.defineProperty(exports, "__esModule", { value: !0 }),
  (exports.chooseFile = exports.isVideoFile = exports.isImageFile = void 0);
var t = require("../common/utils"),
  i = require("../common/validator");
function r(i) {
  return i.tempFiles.map(function (i) {
    return e(e({}, (0, t.pickExclude)(i, ["path"])), {
      type: "image",
      url: i.tempFilePath || i.path,
      thumb: i.tempFilePath || i.path,
    });
  });
}
(exports.isImageFile = function (e) {
  return null != e.isImage
    ? e.isImage
    : e.type
    ? "image" === e.type
    : !!e.url && (0, i.isImageUrl)(e.url);
}),
  (exports.isVideoFile = function (e) {
    return null != e.isVideo
      ? e.isVideo
      : e.type
      ? "video" === e.type
      : !!e.url && (0, i.isVideoUrl)(e.url);
  }),
  (exports.chooseFile = function (i) {
    var u = i.accept,
      a = i.multiple,
      o = i.capture,
      n = i.compressed,
      s = i.maxDuration,
      c = i.sizeType,
      p = i.camera,
      l = i.maxCount,
      m = i.mediaType,
      h = i.extension;
    return new Promise(function (i, f) {
      switch (u) {
        case "image":
          t.isPC || t.isWxWork
            ? wx.chooseImage({
                count: a ? Math.min(l, 9) : 1,
                sourceType: o,
                sizeType: c,
                success: function (e) {
                  return i(r(e));
                },
                fail: f,
              })
            : wx.chooseMedia({
                count: a ? Math.min(l, 9) : 1,
                mediaType: ["image"],
                sourceType: o,
                maxDuration: s,
                sizeType: c,
                camera: p,
                success: function (e) {
                  return i(r(e));
                },
                fail: f,
              });
          break;
        case "media":
          wx.chooseMedia({
            count: a ? Math.min(l, 9) : 1,
            mediaType: m,
            sourceType: o,
            maxDuration: s,
            sizeType: c,
            camera: p,
            success: function (r) {
              return i(
                (function (i) {
                  return i.tempFiles.map(function (i) {
                    return e(
                      e(
                        {},
                        (0, t.pickExclude)(i, [
                          "fileType",
                          "thumbTempFilePath",
                          "tempFilePath",
                        ])
                      ),
                      {
                        type: i.fileType,
                        url: i.tempFilePath,
                        thumb:
                          "video" === i.fileType
                            ? i.thumbTempFilePath
                            : i.tempFilePath,
                      }
                    );
                  });
                })(r)
              );
            },
            fail: f,
          });
          break;
        case "video":
          wx.chooseVideo({
            sourceType: o,
            compressed: n,
            maxDuration: s,
            camera: p,
            success: function (r) {
              return i(
                (function (i) {
                  return [
                    e(
                      e(
                        {},
                        (0, t.pickExclude)(i, [
                          "tempFilePath",
                          "thumbTempFilePath",
                          "errMsg",
                        ])
                      ),
                      {
                        type: "video",
                        url: i.tempFilePath,
                        thumb: i.thumbTempFilePath,
                      }
                    ),
                  ];
                })(r)
              );
            },
            fail: f,
          });
          break;
        default:
          wx.chooseMessageFile(
            e(e({ count: a ? l : 1, type: u }, h ? { extension: h } : {}), {
              success: function (r) {
                return i(
                  (function (i) {
                    return i.tempFiles.map(function (i) {
                      return e(e({}, (0, t.pickExclude)(i, ["path"])), {
                        url: i.path,
                      });
                    });
                  })(r)
                );
              },
              fail: f,
            })
          );
      }
    });
  });
