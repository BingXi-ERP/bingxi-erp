const { test, beforeEach, afterEach } = require('node:test');
const { assert, environment, installGlobals, loadMiniProgram } = require('./helpers.cjs');

let env;
let restore;
let perm;

beforeEach(() => {
  env = environment();
  restore = installGlobals(env);
  perm = loadMiniProgram('libs/utils/perm.js');
});
afterEach(restore);

test('权限码在首个冒号处拆分，保留动作中的剩余冒号', () => {
  assert.deepEqual(perm.splitPermissionCode('orders:read:detail'), {
    resource: 'orders',
    action: 'read:detail',
  });
  assert.deepEqual(perm.splitPermissionCode('orders'), {
    resource: 'orders',
    action: '',
  });
  assert.deepEqual(perm.splitPermissionCode(':read'), {
    resource: ':read',
    action: '',
  });
});

test('动作等价仅覆盖 read/view、update/edit 与通配', () => {
  assert.equal(perm.actionEquivalent('read', 'view'), true);
  assert.equal(perm.actionEquivalent('view', 'read'), true);
  assert.equal(perm.actionEquivalent('update', 'edit'), true);
  assert.equal(perm.actionEquivalent('edit', 'update'), true);
  assert.equal(perm.actionEquivalent('*', 'delete'), true);
  assert.equal(perm.actionEquivalent('create', 'delete'), false);
});

test('资源与动作同时精确命中才放行', () => {
  assert.equal(perm.matchesCode('orders:read', ['orders:read']), true);
  assert.equal(perm.matchesCode('orders:read', ['orders:view']), true);
  assert.equal(perm.matchesCode('orders:read', ['customers:read']), false);
  assert.equal(perm.matchesCode('orders:delete', ['orders:read']), false);
  assert.equal(perm.matchesCode('orders:read', ['orders:*']), true);
  assert.equal(perm.matchesCode('orders:read', ['*:read']), true);
});

test('管理员 *:* 命中，空清单与畸形清单不放行', () => {
  assert.equal(perm.matchesCode('anything:delete', ['*:*']), true);
  assert.equal(perm.matchesCode('orders:read', []), false);
  assert.equal(perm.matchesCode('orders:read', [null, '']), false);
});

test('存储读取异常与非数组值按未登录处理', () => {
  env.wx.getStorageSync = () => {
    throw new Error('storage unavailable');
  };
  assert.deepEqual(perm.getPerms(), []);
  env.wx.getStorageSync = () => ({ permissions: ['*:*'] });
  assert.deepEqual(perm.getPerms(), []);
});

test('空 required 是公共入口，required 数组任一命中', () => {
  assert.equal(perm.hasPerm(undefined, []), true);
  assert.equal(perm.hasPerm(null, []), true);
  assert.equal(perm.hasPerm('', []), true);
  assert.equal(perm.hasPerm([], ['*:*']), false);
  assert.equal(perm.hasPerm(['orders:read', 'customers:read'], ['customers:read']), true);
});

test('buildAuthMap 使用权威映射，公共入口与无能力入口分别显式放行/隐藏', () => {
  const entries = loadMiniProgram('libs/utils/permEntries.js').ENTRY_PERMS;
  const publicKey = Object.keys(entries).find(key => entries[key].public);
  const emptyKey = Object.keys(entries).find(
    key => !entries[key].public && (!entries[key].codes || entries[key].codes.length === 0)
  );
  const map = perm.buildAuthMap(['*:*'], [publicKey, emptyKey, '__unregistered__']);
  assert.equal(map[publicKey], true);
  assert.equal(map[emptyKey], false);
  assert.equal(map.__unregistered__, false);
});
