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
      dev: { rootHost: 'https://tshop.duibu.cn' },
      test: { rootHost: 'https://tshop.duibu.cn' },
      uat: { rootHost: 'https://ushop.duibu.cn' },
      production: { rootHost: 'https://shop.duibu.cn' },
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

test('dev/test 即使 rootHost 相同也保留不同 environment', () => {
  const env = environment({ storage: { envPage: 'dev' } });
  const app = loadAppDefinition(env, config());
  app.initEnv();
  assert.equal(app.config.rootHost, 'https://tshop.duibu.cn');
  assert.equal(app.environment, 'dev');
  env.wx.setStorageSync('envPage', 'test');
  app.initEnv();
  assert.equal(app.config.rootHost, 'https://tshop.duibu.cn');
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

test('envConfig 缺本地主机与空主机都显式失败', () => {
  const source = fs.readFileSync(path.join(MP_ROOT, 'envConfig.js'), 'utf8');
  const run = host =>
    vm.runInNewContext(source, {
      module: { exports: {} },
      require(request) {
        if (request === './version.js') return '3.13.10';
        if (request === './mpHost.local.js') {
          if (host === undefined) throw new Error('not found');
          return host;
        }
        throw new Error('unexpected require ' + request);
      },
    });
  assert.throws(() => run(undefined), /缺少本地主机配置/);
  assert.throws(() => run({ bingxiHost: '' }), /本地主机配置无效/);
});
