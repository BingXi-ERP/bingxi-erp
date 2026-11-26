var releaseVersion = require("./version.js");

module.exports = {
  envPage: "production",
  appVersion: releaseVersion,
  contacts: {
    customsPhoneNum: "13178852281",
    servicePhone: "13178852281",
  },
  account: {
    demoMobileNum: "13800000000",
  },
  printer: {
    hotspotSsid: "gc13800000000",
  },
  envList: {
    dev: { name: "开发 dev" },
    test: { name: "测试 test" },
    uat: { name: "产品 uat" },
    production: { name: "生产 product" },
  },
  version: releaseVersion,
  versionDesc: releaseVersion,
};
