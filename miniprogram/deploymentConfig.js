// 部署地址是首访手填并持久化的唯一主机来源，不随源码或发布包分发。
// 调用方：app.js 与服务器地址页。入参：用户填写或 wx.storage 回读的地址。
// 传给谁：app.config 的 rootHost、bingxiHost、imgHost、imgHostFile、imgOssHost。
// 存什么：规范化 HTTPS 源站。存哪里：wx.storage 的 bingxiDeploymentHost。
var STORAGE_KEY = 'bingxiDeploymentHost';

function normalizeHost(input) {
  if (typeof input !== 'string' || input.trim() === '') {
    throw new Error('服务器地址不能为空');
  }
  var parsed;
  try {
    parsed = new URL(input.trim());
  } catch (error) {
    throw new Error('服务器地址必须是完整的 http 或 https 地址');
  }
  if (parsed.protocol !== 'https:') {
    throw new Error('服务器地址必须使用 https');
  }
  if (parsed.username || parsed.password) {
    throw new Error('服务器地址不得包含用户名或密码');
  }
  if (parsed.pathname !== '/' || parsed.search || parsed.hash) {
    throw new Error('服务器地址只能填写源站，不得包含路径、查询参数或片段');
  }
  if (!parsed.hostname) {
    throw new Error('服务器地址缺少主机名');
  }
  return parsed.origin;
}

function emptyConfig() {
  return {
    rootHost: '',
    bingxiHost: '',
    imgHost: '',
    imgHostFile: '',
    imgOssHost: '',
  };
}

function configForHost(input) {
  var host = normalizeHost(input);
  return {
    rootHost: host,
    bingxiHost: host,
    imgHost: host,
    imgHostFile: host,
    imgOssHost: host + '/',
  };
}

function readHost(wx) {
  var stored = wx.getStorageSync(STORAGE_KEY);
  if (stored === '' || stored === undefined || stored === null) return '';
  return normalizeHost(stored);
}

function saveHost(wx, input) {
  var host = normalizeHost(input);
  wx.setStorageSync(STORAGE_KEY, host);
  var saved = readHost(wx);
  if (saved !== host) {
    throw new Error('服务器地址保存失败，请检查本地存储后重试');
  }
  return host;
}

module.exports = {
  STORAGE_KEY: STORAGE_KEY,
  normalizeHost: normalizeHost,
  emptyConfig: emptyConfig,
  configForHost: configForHost,
  readHost: readHost,
  saveHost: saveHost,
};
