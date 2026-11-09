(Object.defineProperty(exports, "__esModule", {
  value: !0,
}),
  (exports.getDictData = void 0));
var ServicesBase = require("../services/ServicesBase.js").servicesBase;
exports.getDictData = function (t) {
  if (t)
    return new Promise(function (i) {
      ServicesBase.getDictDataByType({
        value: t,
      }).then(function (e) {
        i(e.data);
      });
    });
};
