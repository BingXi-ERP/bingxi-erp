const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const MP_ROOT = path.join(REPO_ROOT, 'miniprogram');
const mpRequire = Module.createRequire(path.join(MP_ROOT, 'package.json'));

function storageWx(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    values,
    getStorageSync(key) {
      return values.get(key);
    },
    setStorageSync(key, value) {
      values.set(key, value);
    },
    removeStorageSync(key) {
      values.delete(key);
    },
  };
}

function environment(options = {}) {
  const app = options.app || {
    config: { bingxiHost: 'https://erp.example.com' },
    globalData: { userInfo: {}, isLoginPage: false },
    AppUserAgent: 'test-agent',
    applyDeploymentHost(host) {
      this.config = require(path.join(MP_ROOT, 'deploymentConfig.js')).configForHost(host);
    },
  };
  const calls = { requests: [], uploads: [], toasts: [], relaunches: [] };
  const wx = Object.assign(storageWx(options.storage), {
    request(spec) {
      calls.requests.push(spec);
      const handler = options.request;
      if (handler) return handler(spec, calls.requests.length);
      spec.success({
        statusCode: 200,
        data: { code: 200, data: {} },
        header: {},
      });
    },
    uploadFile(spec) {
      calls.uploads.push(spec);
      const handler = options.upload;
      if (handler) return handler(spec, calls.uploads.length);
      spec.success({
        statusCode: 200,
        data: JSON.stringify({ code: 200, data: { ok: true } }),
        header: {},
      });
    },
    showToast(spec) {
      calls.toasts.push(spec);
    },
    hideLoading() {},
    reLaunch(spec) {
      calls.relaunches.push(JSON.parse(JSON.stringify(spec)));
      if (spec.success) spec.success();
    },
  });
  return { app, calls, wx };
}

function installGlobals(env) {
  const previous = {
    wx: Object.getOwnPropertyDescriptor(globalThis, 'wx'),
    getApp: Object.getOwnPropertyDescriptor(globalThis, 'getApp'),
  };
  globalThis.wx = env.wx;
  globalThis.getApp = () => env.app;
  return () => {
    for (const [name, descriptor] of Object.entries(previous)) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  };
}

function clearMiniProgramCache() {
  for (const key of Object.keys(require.cache)) {
    if (key.startsWith(MP_ROOT + path.sep)) delete require.cache[key];
  }
}

// 微信构建 npm 把 @babel/runtime 重写到工程根 @babel/runtime；Node 直接运行源码时没有这一步。
// 此适配只还原同版本 npm 包的模块解析，不替换请求、权限、上传或发布业务实现。
function loadMiniProgram(relativePath) {
  clearMiniProgramCache();
  const originalLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    const match = /(?:^|\/)@babel\/runtime\/(.+)$/.exec(request);
    if (match) return originalLoad.call(this, '@babel/runtime/' + match[1], parent, isMain);
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    return require(path.join(MP_ROOT, relativePath));
  } finally {
    Module._load = originalLoad;
  }
}

function loadAppDefinition(env, envConfig) {
  const source = fs.readFileSync(path.join(MP_ROOT, 'app.js'), 'utf8');
  let definition;
  const sandbox = {
    App(value) {
      definition = value;
    },
    wx: env.wx,
    console,
    require(request) {
      if (request.startsWith('@babel/runtime/')) return mpRequire(request);
      if (request === './envConfig') return envConfig;
      if (request === './deploymentConfig.js') {
        return require(path.join(MP_ROOT, 'deploymentConfig.js'));
      }
      if (request === './version.js') return require(path.join(MP_ROOT, 'version.js'));
      if (request === './libs/utils/apiGateway.js') {
        return { isLoggedIn: () => false };
      }
      throw new Error('app.js 未声明依赖：' + request);
    },
  };
  require('node:vm').runInNewContext(source, sandbox, { filename: 'app.js' });
  return definition;
}

function releaseScript() {
  return require(path.join(REPO_ROOT, 'scripts', 'ci', 'miniprogram-release.cjs'));
}

module.exports = {
  REPO_ROOT,
  MP_ROOT,
  assert,
  environment,
  installGlobals,
  loadMiniProgram,
  loadAppDefinition,
  releaseScript,
  storageWx,
};
