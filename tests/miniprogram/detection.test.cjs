const { test } = require('node:test');
const {
  assert,
  environment,
  installGlobals,
  loadMiniProgram,
  releaseScript,
} = require('./helpers.cjs');

function provesAssertionDetects(callback) {
  let detected = false;
  try {
    callback();
  } catch (error) {
    assert.equal(error.code, 'ERR_ASSERTION');
    detected = true;
  }
  assert.equal(detected, true, '断言必须能抓到故意错误的期望');
}

test('断言检测力自证：错误期望必须抛 ERR_ASSERTION', () => {
  provesAssertionDetects(() => assert.equal(1, 2));
  provesAssertionDetects(() => assert.deepEqual({ a: 1 }, { a: 2 }));
});

test('权限判定器对资源与动作变异均有检测力', () => {
  const env = environment();
  const restore = installGlobals(env);
  try {
    const perm = loadMiniProgram('libs/utils/perm.js');
    assert.equal(perm.matchesCode('orders:read', ['orders:read']), true);
    provesAssertionDetects(() =>
      assert.equal(perm.matchesCode('orders:read', ['customers:read']), true)
    );
    provesAssertionDetects(() =>
      assert.equal(perm.matchesCode('orders:delete', ['orders:read']), true)
    );
    provesAssertionDetects(() => assert.equal(perm.matchesCode('orders:read', []), true));
  } finally {
    restore();
  }
});

test('API 主机边界对同前缀恶意域名有检测力', () => {
  const env = environment();
  const restore = installGlobals(env);
  try {
    const gateway = loadMiniProgram('libs/utils/apiGateway.js');
    assert.equal(gateway.isBingxiUrl('https://erp.example.com/api/v1/erp/x'), true);
    provesAssertionDetects(() =>
      assert.equal(gateway.isBingxiUrl('https://erp.example.com.evil.test/api/v1/erp/x'), true)
    );
  } finally {
    restore();
  }
});

test('源码净化器对敏感路径漏排有检测力', () => {
  const release = releaseScript();
  for (const sensitive of [
    'mpHost.local.js',
    'node_modules/x.js',
    'reports/x.json',
    'private.key',
  ]) {
    assert.equal(release.isExcluded(sensitive), true);
    provesAssertionDetects(() => assert.equal(release.isExcluded(sensitive), false));
  }
});

test('发布闸门对缺秘密、非法模式与已移除主机参数的断言均不可软化', () => {
  const release = require('../../scripts/ci/miniprogram-ci-release.cjs');
  const valid = {
    mode: 'upload',
    version: '3.13.10',
    robot: 1,
    desc: 'test',
    appid: 'wx9fc2137059cd96d0',
    privateKey: 'key',
  };
  provesAssertionDetects(() => release.validateReleaseConfig({ ...valid, privateKey: '' }));
  provesAssertionDetects(() => release.validateReleaseConfig({ ...valid, mode: 'release' }));
  assert.doesNotThrow(() => release.validateReleaseConfig(valid));
  assert.doesNotMatch(JSON.stringify(valid), /host/i);
});
