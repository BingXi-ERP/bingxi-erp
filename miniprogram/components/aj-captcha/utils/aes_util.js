var aes = require("./aes.js");
module.exports = {
  AesEncrypt: function (n, r) {
    var t = aes.enc.Utf8.parse(r),
      c = aes.enc.Utf8.parse(n);
    return aes.AES.encrypt(c, t, {
      mode: aes.mode.ECB,
      padding: aes.pad.Pkcs7,
    }).toString();
  },
  AesDecrypt: function (n, r) {
    var t = aes.enc.Utf8.parse(r);
    return aes.AES.decrypt(n, t, {
      mode: aes.mode.ECB,
      padding: aes.pad.Pkcs7,
    })
      .toString(aes.enc.Utf8)
      .toString();
  },
  Base64Encode: function (n) {
    var r = aes.enc.Utf8.parse(n);
    return aes.enc.Base64.stringify(r);
  },
  Base64Decode: function (n) {
    return aes.enc.Base64.parse(n).toString(aes.enc.Utf8);
  },
};
