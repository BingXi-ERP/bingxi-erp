(Object.defineProperty(exports, "__esModule", {
  value: !0,
}),
  (exports.getAddressId = void 0));
var global = require("../../libs/services/global.js").getAddressIdList;
exports.getAddressId = function (s) {
  return !s || s.length < 1
    ? []
    : new Promise(function (t) {
        global({
          addressNames: s.join(","),
        }).then(function (e) {
          t(e.data.ids);
        });
      });
};
