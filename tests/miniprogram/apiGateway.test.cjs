const { test, beforeEach, afterEach } = require('node:test');
const { assert, environment, installGlobals, loadMiniProgram } = require('./helpers.cjs');

const URL = 'https://erp.example.com/api/v1/erp/sales/orders';
let env;
let restore;
let gateway;

beforeEach(() => {
  env = environment();
  restore = installGlobals(env);
  gateway = loadMiniProgram('libs/utils/apiGateway.js');
});
afterEach(restore);

function normalized(status, body, header = {}, cookies = []) {
  return gateway.normalize(
    gateway.tagResponse({ statusCode: status, data: body, header, cookies }),
    true
  );
}

test('adapt 仅对 bingxi GET 复制并转换分页键，不修改调用方对象', () => {
  const input = { pageNum: 0, pageSize: 25, keyword: 'fabric' };
  const result = gateway.adapt(URL, 'get', input);
  assert.deepEqual(result.data, { page: 0, page_size: 25, keyword: 'fabric' });
  assert.deepEqual(input, { pageNum: 0, pageSize: 25, keyword: 'fabric' });
  assert.notEqual(result.data, input);
  assert.equal(result.method, 'GET');
  assert.equal(result.isBingxi, true);
});

test('adapt 保留已有权威分页键，非 GET 与第三方 URL 不改写', () => {
  const data = { page: 2, pageNum: 1, page_size: 50, pageSize: 10 };
  assert.deepEqual(gateway.adapt(URL, 'GET', data).data, {
    page: 2,
    page_size: 50,
  });
  assert.deepEqual(gateway.adapt(URL, 'POST', { pageNum: 1 }).data, {
    pageNum: 1,
  });
  assert.deepEqual(gateway.adapt('https://other.example.com/x', 'GET', { pageNum: 1 }).data, {
    pageNum: 1,
  });
  assert.equal(gateway.isBingxiUrl('https://erp.example.com.evil.test/api/v1/erp/x'), false);
  assert.equal(gateway.isBingxiUrl(URL + '?page=1'), true);
  assert.equal(gateway.isBingxiUrl(URL + '#detail'), true);
  assert.equal(gateway.isBingxiUrl('/api/v1/erp/x'), false);
});

test('请求头不含 Authorization，非安全方法才附加 CSRF', () => {
  assert.deepEqual(gateway.authHeaders(true, 'GET'), {
    'X-Requested-With': 'XMLHttpRequest',
  });
  assert.deepEqual(gateway.authHeaders(true, 'POST', ''), {
    'X-Requested-With': 'XMLHttpRequest',
  });
  assert.deepEqual(gateway.authHeaders(true, 'POST', 'one-time'), {
    'X-Requested-With': 'XMLHttpRequest',
    'x-csrf-token': 'one-time',
  });
  assert.deepEqual(gateway.authHeaders(false, 'POST', 'one-time'), {});
});

test('CSRF 消费范围排除安全方法、公开路径、认证专用路径与旧 /app-api', () => {
  assert.equal(gateway.consumesCsrf(URL, 'GET'), false);
  assert.equal(
    gateway.consumesCsrf('https://erp.example.com/api/v1/erp/auth/login', 'POST'),
    false
  );
  assert.equal(gateway.consumesCsrf('https://erp.example.com/api/v1/erp/auth/me', 'POST'), false);
  assert.equal(gateway.consumesCsrf('https://erp.example.com/app-api/oss/upload', 'POST'), false);
  assert.equal(gateway.consumesCsrf(URL + '?page=1', 'DELETE'), true);
});

test('成功信封与分页 total 归一化，并保留传输状态', () => {
  const result = normalized(200, { code: 200, data: { id: 1 }, total: 12 });
  assert.equal(result.code, 0);
  assert.deepEqual(result.data, { id: 1 });
  assert.equal(result.total, 12);
  assert.equal(result.__httpStatus, 200);
});

test('字符串错误码使用真实 HTTP 状态，trace_id 转 traceId', () => {
  const result = normalized(
    403,
    { code: 'CSRF_TOKEN_INVALID', message: 'invalid', trace_id: 'trace-1' },
    { 'x-new-csrf-token': 'next-token' }
  );
  assert.equal(result.code, 403);
  assert.equal(result.errCode, 'CSRF_TOKEN_INVALID');
  assert.equal(result.traceId, 'trace-1');
  assert.equal(result.msg, 'invalid');
  assert.equal(gateway.csrfFromResponse(result), 'next-token');
  assert.equal(gateway.isCsrfFailure(result), true);
});

test('Set-Cookie 中提取轮换令牌，恢复头优先', () => {
  const cookie = normalized(200, { code: 200, data: {} }, {}, [
    'session=abc; HttpOnly',
    'csrf_token=rotated; Path=/; HttpOnly',
  ]);
  assert.equal(gateway.csrfFromResponse(cookie), 'rotated');
  const header = normalized(
    403,
    { code: 'CSRF_TOKEN_MISSING', message: 'missing' },
    { 'x-new-csrf-token': 'header-token' },
    ['csrf_token=cookie-token']
  );
  assert.equal(gateway.csrfFromResponse(header), 'header-token');
});

test('写请求取用即删除旧令牌，成功轮换后回填新令牌', async () => {
  env.wx.setStorageSync('bingxiCsrf', 'old');
  const headers = [];
  const result = await gateway.requestContract({
    url: URL,
    method: 'POST',
    send(contractHeaders) {
      headers.push(contractHeaders['x-csrf-token']);
      assert.equal(env.wx.getStorageSync('bingxiCsrf'), undefined);
      return Promise.resolve(
        normalized(200, { code: 200, data: { ok: true } }, { 'set-cookie': ['csrf_token=new'] })
      );
    },
  });
  assert.equal(result.code, 0);
  assert.deepEqual(headers, ['old']);
  assert.equal(env.wx.getStorageSync('bingxiCsrf'), 'new');
});

test('可恢复 CSRF 403 仅重放一次，第二次失败不再重放', async () => {
  env.wx.setStorageSync('bingxiCsrf', 'old');
  const sent = [];
  const result = await gateway.requestContract({
    url: URL,
    method: 'POST',
    send(headers) {
      sent.push(headers['x-csrf-token']);
      return Promise.resolve(
        normalized(
          403,
          { code: 'CSRF_TOKEN_INVALID', message: 'invalid' },
          {
            'x-new-csrf-token': sent.length === 1 ? 'recovered' : 'recovered-again',
          }
        )
      );
    },
  });
  assert.deepEqual(sent, ['old', 'recovered']);
  assert.equal(result.code, 403);
  assert.equal(env.wx.getStorageSync('bingxiCsrf'), 'recovered-again');
});

test('绑定不匹配且无恢复令牌时不重放', async () => {
  env.wx.setStorageSync('bingxiCsrf', 'old');
  let attempts = 0;
  const result = await gateway.requestContract({
    url: URL,
    method: 'PUT',
    send() {
      attempts += 1;
      return Promise.resolve(
        normalized(403, {
          code: 'CSRF_TOKEN_BINDING_MISMATCH',
          message: 'mismatch',
        })
      );
    },
  });
  assert.equal(attempts, 1);
  assert.equal(result.errCode, 'CSRF_TOKEN_BINDING_MISMATCH');
  assert.equal(gateway.recoverCsrf(result), false);
});

test('401 未消费令牌时恢复原令牌', async () => {
  env.wx.setStorageSync('bingxiCsrf', 'still-valid');
  await gateway.requestContract({
    url: URL,
    method: 'POST',
    send: () => Promise.resolve(normalized(401, { code: 'UNAUTHORIZED', message: 'expired' })),
  });
  assert.equal(env.wx.getStorageSync('bingxiCsrf'), 'still-valid');
});

test('并发写请求串行，第二个请求在第一个完成后才取令牌', async () => {
  env.wx.setStorageSync('bingxiCsrf', 'first');
  const events = [];
  let releaseFirst;
  const firstGate = new Promise(resolve => {
    releaseFirst = resolve;
  });
  const first = gateway.requestContract({
    url: URL,
    method: 'POST',
    async send(headers) {
      events.push('first:start:' + headers['x-csrf-token']);
      await firstGate;
      events.push('first:end');
      return normalized(200, { code: 200, data: {} }, { 'set-cookie': ['csrf_token=second'] });
    },
  });
  const second = gateway.requestContract({
    url: URL,
    method: 'POST',
    send(headers) {
      events.push('second:start:' + headers['x-csrf-token']);
      return Promise.resolve(normalized(200, { code: 200, data: {} }));
    },
  });
  await Promise.resolve();
  assert.deepEqual(events, ['first:start:first']);
  releaseFirst();
  await Promise.all([first, second]);
  assert.deepEqual(events, ['first:start:first', 'first:end', 'second:start:second']);
});

test('一个写请求失败不阻断队列中的后续写请求', async () => {
  const events = [];
  const first = gateway.requestContract({
    url: URL,
    method: 'POST',
    send() {
      events.push('first');
      return Promise.reject(new Error('network'));
    },
  });
  const second = gateway.requestContract({
    url: URL,
    method: 'POST',
    send() {
      events.push('second');
      return Promise.resolve({ code: 0 });
    },
  });
  await assert.rejects(first, /network/);
  assert.equal((await second).code, 0);
  assert.deepEqual(events, ['first', 'second']);
});

test('verifySession 200 写会话快照，403 清会话，5xx 保留快照', async () => {
  env.wx.setStorageSync('bingxiSession', { id: 7, username: 'old' });
  let reply = {
    statusCode: 200,
    data: { code: 200, data: { id: 7, username: 'current' } },
    header: {},
  };
  env.wx.request = spec => spec.success(reply);
  assert.equal((await gateway.verifySession()).state, 'valid');
  assert.equal(env.wx.getStorageSync('bingxiSession').username, 'current');
  reply = {
    statusCode: 403,
    data: { code: 'FORBIDDEN', message: 'no' },
    header: {},
  };
  assert.equal((await gateway.verifySession()).state, 'invalid');
  assert.equal(env.wx.getStorageSync('bingxiSession'), undefined);
  env.wx.setStorageSync('bingxiSession', { id: 7, username: 'keep' });
  reply = {
    statusCode: 503,
    data: { code: 'SERVICE_UNAVAILABLE', message: 'down' },
    header: {},
  };
  assert.equal((await gateway.verifySession()).state, 'error');
  assert.equal(env.wx.getStorageSync('bingxiSession').username, 'keep');
});

test('adaptLogin 只落后端真实字段与权限，不伪造 token', () => {
  const result = gateway.adaptLogin(
    {
      code: 0,
      data: {
        csrf_token: 'csrf',
        permissions: ['orders:read'],
        password_expired: true,
        user: {
          id: 9,
          username: 'alice',
          phone: '13800000000',
          real_name: 'Alice',
        },
      },
    },
    true
  );
  assert.equal(result.code, 0);
  assert.equal(result.data.password_expired, true);
  assert.equal(env.wx.getStorageSync('bingxiCsrf'), 'csrf');
  assert.deepEqual(env.wx.getStorageSync('resCodeList'), ['orders:read']);
  assert.equal(env.wx.getStorageSync('mobile'), '13800000000');
  assert.equal(Object.hasOwn(result.data.user, 'token'), false);
});

test('clearLoginState 清除会话、令牌、档案并仅跳转一次登录页', () => {
  env.app.globalData = { userInfo: { id: 9 }, isLoginPage: false };
  env.wx.setStorageSync('bingxiSession', { id: 9 });
  env.wx.setStorageSync('bingxiCsrf', 'csrf');
  env.wx.setStorageSync('resCodeList', ['*:*']);
  gateway.clearLoginState();
  assert.equal(env.wx.getStorageSync('bingxiSession'), undefined);
  assert.equal(env.wx.getStorageSync('bingxiCsrf'), undefined);
  assert.deepEqual(env.wx.getStorageSync('resCodeList'), undefined);
  assert.deepEqual(env.app.globalData.userInfo, {});
  assert.equal(env.calls.relaunches.length, 1);
  gateway.clearLoginState();
  assert.equal(env.calls.relaunches.length, 1);
});
