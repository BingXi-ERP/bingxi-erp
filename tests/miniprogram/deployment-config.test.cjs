const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { assert, MP_ROOT, environment, loadAppDefinition, storageWx } = require('./helpers.cjs');

const deploymentPath = path.join(MP_ROOT, 'deploymentConfig.js');

function deployment() {
  return require(deploymentPath);
}

function loadServerPage(env, savedHost) {
  const source = fs.readFileSync(path.join(MP_ROOT, 'pages', 'server-config', 'index.js'), 'utf8');
  let definition;
  vm.runInNewContext(source, {
    Page(value) {
      definition = value;
    },
    wx: env.wx,
    getApp: () => env.app,
    require(request) {
      if (request === '../../deploymentConfig.js') return deployment();
      throw new Error('服务器地址页未声明依赖：' + request);
    },
    console,
  });
  if (savedHost !== undefined) env.wx.setStorageSync('bingxiDeploymentHost', savedHost);
  Object.assign(env.app, loadAppDefinition(env, {
    envPage: 'production', appVersion: '3.13.10', contacts: {},
    envList: { production: { name: '生产' } },
  }));
  const page = Object.assign({}, definition);
  page.data = structuredClone(definition.data);
  page.setData = function (patch) {
    Object.assign(this.data, patch);
  };
  return page;
}

test('首访地址只接受无路径、无凭据的 HTTPS 源站', () => {
  const config = deployment();
  assert.equal(config.normalizeHost(' https://erp.example.com/ '), 'https://erp.example.com');
  assert.equal(config.normalizeHost('https://ERP.example.com:443'), 'https://erp.example.com');
  for (const value of [
    '',
    'http://erp.example.com',
    'https://user:pass@erp.example.com',
    'https://erp.example.com/base',
    'https://erp.example.com/?token=secret',
    'https://erp.example.com/#fragment',
  ]) {
    assert.throws(() => config.normalizeHost(value), undefined, value);
  }
});

test('同一部署地址派生全部接口与资源主机，不保留第二域名来源', () => {
  const config = deployment().configForHost('https://erp.example.com/');
  assert.deepEqual(config, {
    rootHost: 'https://erp.example.com',
    bingxiHost: 'https://erp.example.com',
    imgHost: 'https://erp.example.com',
    imgHostFile: 'https://erp.example.com',
    imgOssHost: 'https://erp.example.com/',
  });
});

test('地址保存后回读校验，存储缺值不伪装成已配置', () => {
  const config = deployment();
  const wx = storageWx();
  assert.equal(config.readHost(wx), '');
  assert.equal(config.saveHost(wx, 'https://erp.example.com/'), 'https://erp.example.com');
  assert.equal(config.readHost(wx), 'https://erp.example.com');
  wx.setStorageSync('bingxiDeploymentHost', '');
  assert.equal(config.readHost(wx), '');
});

test('首次访问提交合法地址后持久化、即时应用并重进工作台', () => {
  const env = environment();
  const page = loadServerPage(env);
  page.data.host = 'https://erp.example.com/';
  page.onSubmit({ preventDefault() {} });
  assert.equal(env.wx.getStorageSync('bingxiDeploymentHost'), 'https://erp.example.com');
  assert.deepEqual(env.app.config, deployment().configForHost('https://erp.example.com'));
  assert.deepEqual(env.calls.relaunches, [{ url: '/pages/index/index' }]);
});

test('已有部署地址的启动直接进入工作台，不要求重复填写', () => {
  const env = environment();
  const page = loadServerPage(env, 'https://erp.example.com');
  page.onLoad();
  assert.equal(page.data.formVisible, false);
  assert.deepEqual(env.calls.relaunches, [{ url: '/pages/index/index' }]);
});

test('非法地址显式报错且不写存储、不重 Launch', () => {
  const env = environment();
  const page = loadServerPage(env);
  page.data.host = 'http://erp.example.com';
  page.onSubmit({ preventDefault() {} });
  assert.equal(env.wx.getStorageSync('bingxiDeploymentHost'), undefined);
  assert.equal(env.calls.relaunches.length, 0);
  assert.match(page.data.error, /域名|地址/);
});

test('更改服务器地址只清空表单，不静默删除已保存地址', () => {
  const env = environment();
  const page = loadServerPage(env, 'https://old.example.com');
  page.onChange();
  assert.equal(page.data.formVisible, true);
  assert.equal(page.data.host, '');
  assert.equal(env.wx.getStorageSync('bingxiDeploymentHost'), 'https://old.example.com');
});

test('输入与已保存进入按钮驱动同一地址状态机', () => {
  const env = environment();
  const page = loadServerPage(env, 'https://old.example.com');
  page.onLoad();
  env.calls.relaunches.length = 0;
  page.onHostInput({ detail: { value: 'https://new.example.com/' } });
  assert.equal(page.data.host, 'https://new.example.com/');
  page.onEnterSaved();
  assert.deepEqual(env.calls.relaunches, [{ url: '/pages/index/index' }]);
  assert.equal(env.app.config.bingxiHost, 'https://old.example.com');
});

test('应用启动从存储派生统一主机，缺地址时保持明确未配置', () => {
  const envConfig = {
    envPage: 'production',
    appVersion: '3.13.10',
    contacts: { customsPhoneNum: '13800000000' },
    envList: { production: { name: '生产' } },
  };
  const env = environment({ storage: { bingxiDeploymentHost: 'https://erp.example.com' } });
  const app = loadAppDefinition(env, envConfig);
  app.initEnv();
  assert.deepEqual(app.config, deployment().configForHost('https://erp.example.com'));
  const empty = loadAppDefinition(environment(), envConfig);
  empty.initEnv();
  assert.equal(empty.config.bingxiHost, '');
  assert.equal(empty.config.rootHost, '');
  empty.applyDeploymentHost('https://new.example.com/');
  assert.deepEqual(empty.config, deployment().configForHost('https://new.example.com'));
  assert.throws(() => empty.applyDeploymentHost('http://new.example.com'), /必须使用 https/);
});

test('保存新服务器成功后作废旧会话与令牌，取消编辑不作废', () => {
  const env = environment({ storage: {
    bingxiDeploymentHost: 'https://old.example.com',
    bingxiSession: { id: 7, username: 'old-user' },
    bingxiCsrf: 'old-csrf',
    id: 7,
    resCodeList: ['orders:read'],
  } });
  const page = loadServerPage(env, 'https://old.example.com');
  env.app.globalData.loginState = 'valid';
  env.app.globalData.userInfo = { id: 7, username: 'old-user' };
  page.onChange();
  assert.equal(env.wx.getStorageSync('bingxiCsrf'), 'old-csrf');
  page.data.host = 'https://new.example.com/';
  page.onSubmit({ preventDefault() {} });
  for (const key of ['bingxiSession', 'bingxiCsrf', 'id', 'resCodeList']) {
    assert.equal(env.wx.getStorageSync(key), undefined, key);
  }
  assert.equal(env.app.globalData.loginState, 'invalid');
  assert.deepEqual(JSON.parse(JSON.stringify(env.app.globalData.userInfo)), {});
  assert.deepEqual(env.calls.relaunches, [{ url: '/pages/index/index' }]);
});

test('服务器地址页是小程序启动入口', () => {
  const app = JSON.parse(fs.readFileSync(path.join(MP_ROOT, 'app.json'), 'utf8'));
  assert.equal(app.pages[0], 'pages/server-config/index');
});
