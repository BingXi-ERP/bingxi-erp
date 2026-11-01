// bingxiHost 是本仓后端主机的单点配置，四环境共用同一值，真值不进仓库。
// 调用方：本文件。读取面：同目录的 mpHost.local.js（本地真值文件）。传给谁：app.js 的 initEnv 写入 app.config.bingxiHost。
// 缺文件时直接抛错点名，不静默回退。补法：复制 mpHost.local.example.js 为 mpHost.local.js 并填入真实主机。
var mpHost;
try {
  mpHost = require("./mpHost.local.js");
} catch (err) {
  throw new Error(
    "缺少本地主机配置，miniprogram 目录下没有可读取的 mpHost.local.js，请复制 mpHost.local.example.js 为 mpHost.local.js 并填入真实主机地址",
  );
}
if (
  !mpHost ||
  typeof mpHost.bingxiHost !== "string" ||
  mpHost.bingxiHost.length === 0
) {
  throw new Error(
    "本地主机配置无效，mpHost.local.js 的 bingxiHost 必须是非空的 https 主机地址",
  );
}
module.exports = {
  envPage: "production",
  appVersion: "1.0.0",
  // contacts 存对外客服号码，单点一份，改号只改这里。读取面：app.js 的 customsPhoneNum 与
  // packageB 打印帮助页展示的客服电话；传给谁：页面 data 与 wx.makePhoneCall 的号码入参。
  // 缺键即取不到号码，属配置缺失，不做静默回退。
  contacts: {
    customsPhoneNum: "13178852281",
    servicePhone: "13178852281",
  },
  envList: {
      dev: {
        rootHost: "https://dshop.duibu.cn",
        bingxiHost: mpHost.bingxiHost,
        imgHost: "https://oss.duibu.cn/duibu/shop",
        imgHostFile: "https://tfile.duibu.cn/luoxuan",
        imgOssHost: "https://oss.duibu.cn/",
        name: "开发 dev",
      },
      test: {
        rootHost: "https://tshop.duibu.cn",
        bingxiHost: mpHost.bingxiHost,
        imgHost: "https://oss.duibu.cn/duibu/shop",
        imgHostFile: "https://tfile.duibu.cn/luoxuan",
        imgOssHost: "https://oss.duibu.cn/",
        name: "测试 test",
      },
      uat: {
        rootHost: "https://ushop.duibu.cn",
        bingxiHost: mpHost.bingxiHost,
        imgHost: "https://img.duibu.cn/duibu/shop",
        imgHostFile: "https://ufile.duibu.cn/ushop",
        imgOssHost: "https://img.duibu.cn/",
        name: "产品 uat",
      },
      production: {
        rootHost: "https://shop.duibu.cn",
        bingxiHost: mpHost.bingxiHost,
        imgHostFile: "https://img.duibu.cn/shop",
        imgHost: "https://img.duibu.cn/duibu/shop",
        imgOssHost: "https://img.duibu.cn/",
        name: "生产 product",
      },
  },
  version: "3.13.10",
  versionDesc: "3.13.10",
};
