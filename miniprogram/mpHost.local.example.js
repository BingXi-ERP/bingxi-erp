// 本地主机配置模板。用法是把本文件复制为同目录的 mpHost.local.js 并填入真实主机，真值文件被 gitignore 排除，不进仓库。
// 存什么，存哪里，调用方，传给谁：存 bingxiHost 即本仓 Rust 后端的 https 主机地址，存于 miniprogram 目录下，由 envConfig.js 读取，传给 app.config.bingxiHost 供全部 bingxi 请求拼接。
module.exports = {
  // 此处填你们已备案域名的 https 地址，微信小程序真机只认备案域名。
  bingxiHost: "https://请替换为你们已备案的域名",
};
