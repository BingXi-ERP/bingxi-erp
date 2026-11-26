const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { assert, MP_ROOT, environment, loadAppDefinition } = require('./helpers.cjs');

function config() {
  return {
    envPage: 'production',
    appVersion: '3.13.10',
    contacts: { customsPhoneNum: '13800000000' },
    envList: {
      dev: { name: '开发 dev' },
      test: { name: '测试 test' },
      uat: { name: '产品 uat' },
      production: { name: '生产 product' },
    },
  };
}

for (const [stored, expected, envVersion] of [
  [undefined, 'production', 'release'],
  ['dev', 'dev', 'trial'],
  ['test', 'test', 'trial'],
  ['uat', 'uat', 'trial'],
]) {
  test(`initEnv 按 envPage=${String(stored)} 判定 ${expected}，不靠重复 rootHost`, () => {
    const env = environment({ storage: { envPage: stored } });
    const app = loadAppDefinition(env, config());
    app.initEnv();
    assert.equal(app.envPage, expected);
    assert.equal(app.environment, expected);
    assert.equal(app.envVersion, envVersion);
    assert.equal(app.appVersion, '3.13.10');
  });
}

test('dev/test 共用首访部署地址，environment 仍按 envPage 区分', () => {
  const env = environment({
    storage: { envPage: 'dev', bingxiDeploymentHost: 'https://erp.example.com' },
  });
  const app = loadAppDefinition(env, config());
  app.initEnv();
  assert.equal(app.config.rootHost, 'https://erp.example.com');
  assert.equal(app.environment, 'dev');
  env.wx.setStorageSync('envPage', 'test');
  app.initEnv();
  assert.equal(app.config.rootHost, 'https://erp.example.com');
  assert.equal(app.environment, 'test');
});

test('未知环境显式抛错，不静默沿用生产配置', () => {
  const env = environment({ storage: { envPage: 'staging' } });
  const app = loadAppDefinition(env, config());
  assert.throws(() => app.initEnv(), /未知小程序环境：staging/);
});

test('envConfig 所有版本字段统一来自 package.json', () => {
  const source = fs.readFileSync(path.join(MP_ROOT, 'envConfig.js'), 'utf8');
  const moduleBox = { exports: {} };
  vm.runInNewContext(source, {
    module: moduleBox,
    require(request) {
      if (request === './version.js') return require(path.join(MP_ROOT, 'version.js'));
      if (request === './mpHost.local.js') return { bingxiHost: 'https://erp.example.com' };
      throw new Error('unexpected require ' + request);
    },
  });
  const pkg = require(path.join(MP_ROOT, 'package.json'));
  assert.equal(moduleBox.exports.version, pkg.version);
  assert.equal(moduleBox.exports.versionDesc, pkg.version);
  assert.equal(moduleBox.exports.appVersion, pkg.version);
});

test('envConfig 不读取或声明本地主机文件', () => {
  const source = fs.readFileSync(path.join(MP_ROOT, 'envConfig.js'), 'utf8');
  const moduleBox = { exports: {} };
  vm.runInNewContext(source, {
    module: moduleBox,
    require(request) {
      if (request === './version.js') return require(path.join(MP_ROOT, 'version.js'));
      throw new Error('unexpected require ' + request);
    },
  });
  assert.doesNotMatch(source, /mpHost|bingxiHost|rootHost|imgHost/i);
  assert.equal(moduleBox.exports.envList.production.name, '生产 product');
  assert.deepEqual(Object.keys(moduleBox.exports.envList.production), ['name']);
});
