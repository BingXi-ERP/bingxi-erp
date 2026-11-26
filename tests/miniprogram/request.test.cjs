const { test, beforeEach, afterEach } = require('node:test');
const { assert, environment, installGlobals, loadMiniProgram } = require('./helpers.cjs');

const URL = 'https://erp.example.com/api/v1/erp/sales/orders';
const implementations = [
  ['主包', 'libs/services/request.js'],
  ['packageA', 'packageA/services/request.js'],
  ['packageB', 'packageB/libs/services/request.js'],
];
let env;
let restore;

beforeEach(() => {
  env = environment();
  restore = installGlobals(env);
});
afterEach(restore);

function requestFor(file) {
  return loadMiniProgram(file).request;
}

for (const [label, file] of implementations) {
  test(`${label} GET 归一化成功并适配 pageNum/pageSize`, async () => {
    const request = requestFor(file);
    const result = await request.GET(URL, { pageNum: 2, pageSize: 20 });
    assert.equal(result.code, 0);
    assert.deepEqual(env.calls.requests[0].data, { page: 2, page_size: 20 });
    assert.equal(env.calls.requests[0].method, 'GET');
    assert.equal(env.calls.requests[0].header.terminalSource, 6);
    assert.equal(env.calls.requests[0].header.terminalSourceV2, label === '主包' ? 81 : undefined);
    assert.equal(Object.hasOwn(env.calls.requests[0].header, 'Authorization'), false);
  });

  test(`${label} _POST 实际发送 POST 且保留自定义头`, async () => {
    const request = requestFor(file);
    await request._POST(URL, { name: 'fabric' }, { headers: { 'X-Trace': 'trace-1' } });
    const sent = env.calls.requests[0];
    assert.equal(sent.method, 'POST');
    assert.equal(sent.header['content-type'], 'application/json');
    assert.equal(sent.header['X-Trace'], 'trace-1');
  });

  test(`${label} GET 网络失败 reject 并显示原始错误`, async () => {
    const failure = new Error('request:fail offline');
    env.wx.request = spec => spec.fail(failure);
    await assert.rejects(requestFor(file).GET(URL), error => error === failure);
    assert.equal(env.calls.toasts.length, 1);
  });

  test(`${label} POST 网络失败同样 reject，不悬挂 Promise`, async () => {
    const failure = new Error('request:fail offline');
    env.wx.request = spec => spec.fail(failure);
    await assert.rejects(requestFor(file).POST(URL, {}), error => error === failure);
  });

  test(`${label} 401 回读 auth/me 成功后仅重发原请求一次`, async () => {
    const request = requestFor(file);
    env.wx.setStorageSync('bingxiSession', { id: 1, username: 'old' });
    env.wx.request = spec => {
      env.calls.requests.push(spec);
      if (spec.url.endsWith('/auth/me')) {
        spec.success({
          statusCode: 200,
          data: { code: 200, data: { id: 1, username: 'alice' } },
          header: {},
        });
      } else if (env.calls.requests.filter(item => item.method === 'POST').length === 1) {
        spec.success({
          statusCode: 401,
          data: { code: 'UNAUTHORIZED', message: 'expired' },
          header: {},
        });
      } else {
        spec.success({
          statusCode: 200,
          data: { code: 200, data: { ok: true } },
          header: {},
        });
      }
    };
    const result = await request.POST(URL, { id: 1 });
    assert.equal(result.code, 0);
    assert.equal(env.calls.requests.length, 3);
    assert.equal(env.calls.requests[0].method, 'POST');
    assert.equal(env.calls.requests[1].url, URL.replace('/sales/orders', '/auth/me'));
    assert.equal(env.calls.requests[2].method, 'POST');
  });

  test(`${label} 401 回读失败时返回原失败，不递归重发`, async () => {
    const request = requestFor(file);
    env.wx.setStorageSync('bingxiSession', { id: 1, username: 'old' });
    env.wx.request = spec => {
      env.calls.requests.push(spec);
      spec.success({
        statusCode: spec.url.endsWith('/auth/me') ? 503 : 401,
        data: {
          code: spec.url.endsWith('/auth/me') ? 'SERVICE_UNAVAILABLE' : 'UNAUTHORIZED',
          message: 'failed',
        },
        header: {},
      });
    };
    const result = await request.POST(URL, {});
    assert.equal(result.code, 401);
    assert.equal(env.calls.requests.filter(item => item.method === 'POST').length, 1);
  });

  test(`${label} CSRF 403 恢复后重放并合并新令牌`, async () => {
    const request = requestFor(file);
    env.wx.setStorageSync('bingxiCsrf', 'old');
    env.wx.request = spec => {
      env.calls.requests.push(spec);
      if (env.calls.requests.length === 1) {
        spec.success({
          statusCode: 403,
          data: { code: 'CSRF_TOKEN_INVALID', message: 'invalid' },
          header: { 'x-new-csrf-token': 'new' },
        });
      } else {
        spec.success({
          statusCode: 200,
          data: { code: 200, data: { ok: true } },
          header: {},
        });
      }
    };
    assert.equal((await request.PUT(URL, {})).code, 0);
    assert.equal(env.calls.requests.length, 2);
    assert.equal(env.calls.requests[0].header['x-csrf-token'], 'old');
    assert.equal(env.calls.requests[1].header['x-csrf-token'], 'new');
  });

  test(`${label} 非 bingxi 响应不归一化且不消费 CSRF`, async () => {
    const request = requestFor(file);
    env.wx.setStorageSync('bingxiCsrf', 'keep');
    env.wx.request = spec => {
      env.calls.requests.push(spec);
      spec.success({ statusCode: 200, data: { raw: true }, header: {} });
    };
    const result = await request.POST('https://other.example.com/upload', {
      pageNum: 1,
    });
    assert.deepEqual(result, { raw: true });
    assert.equal(result.__httpStatus, undefined);
    assert.equal(env.calls.requests[0].data.pageNum, 1);
    assert.equal(env.calls.requests[0].header['x-csrf-token'], undefined);
    assert.equal(env.wx.getStorageSync('bingxiCsrf'), 'keep');
  });
}

test('三份请求实现的方法集合与关键差异保持显式契约', () => {
  const sources = implementations.map(([, file]) =>
    require('node:fs').readFileSync(
      require('node:path').join(__dirname, '..', '..', 'miniprogram', file),
      'utf8'
    )
  );
  for (const source of sources) {
    assert.match(source, /var METHODS = \["GET", "POST", "_POST", "PUT", "DELETE"\]/);
    assert.match(source, /apiGateway\s*\.requestContract/);
  }
  assert.match(sources[0], /terminalSourceV2: 81/);
  assert.doesNotMatch(sources[1], /terminalSourceV2/);
  assert.doesNotMatch(sources[2], /terminalSourceV2/);
});
