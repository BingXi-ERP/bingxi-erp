module.exports = {
  envPage: "production",
  appVersion: "1.0.0",
  envList: {
      dev: {
        rootHost: "https://dshop.duibu.cn",
        // bingxi-erp 后端 (Rust/Axum) —— 统一指向 8.166.117.33
        bingxiHost: "https://8.166.117.33",
        imgHost: "https://oss.duibu.cn/duibu/shop",
        imgHostFile: "https://tfile.duibu.cn/luoxuan",
        imgOssHost: "https://oss.duibu.cn/",
        name: "开发 dev",
      },
      test: {
        rootHost: "https://tshop.duibu.cn",
        bingxiHost: "https://8.166.117.33",
        imgHost: "https://oss.duibu.cn/duibu/shop",
        imgHostFile: "https://tfile.duibu.cn/luoxuan",
        imgOssHost: "https://oss.duibu.cn/",
        name: "测试 test",
      },
      uat: {
        rootHost: "https://ushop.duibu.cn",
        bingxiHost: "https://8.166.117.33",
        imgHost: "https://img.duibu.cn/duibu/shop",
        imgHostFile: "https://ufile.duibu.cn/ushop",
        imgOssHost: "https://img.duibu.cn/",
        name: "产品 uat",
      },
      production: {
        rootHost: "https://shop.duibu.cn",
        bingxiHost: "https://8.166.117.33",
        imgHostFile: "https://img.duibu.cn/shop",
        imgHost: "https://img.duibu.cn/duibu/shop",
        imgOssHost: "https://img.duibu.cn/",
        name: "生产 product",
      },
  },
  version: "3.13.10",
  versionDesc: "3.13.10",
};
