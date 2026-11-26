const { test, beforeEach, afterEach } = require('node:test');
const { assert, environment, installGlobals, loadMiniProgram } = require('./helpers.cjs');

const URL = 'https://erp.example.com/api/v1/erp/files';
let env;
let restore;
let uploader;

beforeEach(() => {
  env = environment();
  restore = installGlobals(env);
  uploader = loadMiniProgram('libs/utils/uploadGateway.js');
});
afterEach(restore);

test('成功 JSON 字符串响应归一化并保留状态', () => {
  const result = uploader.parseUploadBody(
    {
      statusCode: 200,
      data: '{"code":200,"data":{"url":"/x.png"}}',
      header: {},
    },
    true
  );
  assert.equal(result.code, 0);
  assert.deepEqual(result.data, { url: '/x.png' });
  assert.equal(result.__httpStatus, 200);
});

test('网关 HTML 与标量响应显式失败，不静默当成功', () => {
  const html = uploader.parseUploadBody({ statusCode: 502, data: '<html>bad</html>' }, true);
  assert.equal(html.code, 502);
  assert.equal(html.msg, '上传响应无法解析');
  assert.equal(html.__raw, '<html>bad</html>');
  const scalar = uploader.parseUploadBody({ statusCode: 200, data: 'null' }, true);
  assert.equal(scalar.code, 200);
  assert.equal(scalar.msg, '上传响应形态异常');
});

test('第三方 JSON 响应不做 bingxi 信封归一化', () => {
  const body = { code: 200, data: { thirdParty: true } };
  const result = uploader.parseUploadBody({ statusCode: 200, data: body }, false);
  assert.equal(result.code, 200);
  assert.equal(result.data.thirdParty, true);
  assert.equal(result.__normalized, undefined);
});

test('缺少 URL 或 filePath 立即 reject', async () => {
  await assert.rejects(uploader.upload({ url: URL }), /url 或 filePath/);
  await assert.rejects(uploader.upload({ filePath: '/tmp/a.png' }), /url 或 filePath/);
  assert.equal(env.calls.uploads.length, 0);
});

test('上传合并上下文头与契约头，不自行生成 multipart boundary', async () => {
  const result = await uploader.upload({
    url: URL,
    filePath: '/tmp/a.png',
    name: 'image',
    formData: { kind: 'avatar' },
    header: { terminalSource: 88 },
    timeout: 1234,
  });
  assert.equal(result.code, 0);
  const sent = env.calls.uploads[0];
  assert.equal(sent.filePath, '/tmp/a.png');
  assert.equal(sent.name, 'image');
  assert.deepEqual(sent.formData, { kind: 'avatar' });
  assert.equal(sent.timeout, 1234);
  assert.equal(sent.header.terminalSource, 88);
  assert.equal(sent.header['x-csrf-token'], undefined);
  assert.equal(Object.hasOwn(sent.header, 'Authorization'), false);
  assert.equal(
    Object.keys(sent.header).some(key => key.toLowerCase() === 'content-type'),
    false
  );
});

test('CSRF 403 带恢复令牌时重放，文件参数保持不变', async () => {
  env.wx.setStorageSync('bingxiCsrf', 'old');
  env.wx.uploadFile = spec => {
    env.calls.uploads.push(spec);
    if (env.calls.uploads.length === 1) {
      spec.success({
        statusCode: 403,
        data: JSON.stringify({
          code: 'CSRF_TOKEN_INVALID',
          message: 'invalid',
        }),
        header: { 'x-new-csrf-token': 'new' },
      });
    } else {
      spec.success({
        statusCode: 200,
        data: '{"code":200,"data":{"ok":true}}',
        header: {},
      });
    }
  };
  const result = await uploader.upload({ url: URL, filePath: '/tmp/a.png' });
  assert.equal(result.code, 0);
  assert.equal(env.calls.uploads.length, 2);
  assert.equal(env.calls.uploads[0].header['x-csrf-token'], 'old');
  assert.equal(env.calls.uploads[1].header['x-csrf-token'], 'new');
  assert.equal(env.calls.uploads[1].filePath, '/tmp/a.png');
});

test('传输失败 reject 原错误，不返回伪造成功体', async () => {
  const failure = { errMsg: 'uploadFile:fail timeout' };
  env.wx.uploadFile = spec => spec.fail(failure);
  await assert.rejects(uploader.upload({ url: URL, filePath: '/tmp/a.png' }), error => {
    assert.equal(error, failure);
    return true;
  });
});

test('回调替身把归一化结果交给 success，把失败交给 fail', async () => {
  let callbackResult;
  await uploader.uploadFile({
    url: URL,
    filePath: '/tmp/a.png',
    success(result) {
      callbackResult = result;
    },
  });
  assert.equal(callbackResult.code, 0);
  const failure = new Error('offline');
  let callbackError;
  await uploader.uploadFile({
    url: URL,
    filePath: '/tmp/a.png',
    fail(error) {
      callbackError = error;
    },
  });
  // 默认传输成功，因此用真实传输失败替换后再验第二条回调。
  assert.equal(callbackError, undefined);
  env.wx.uploadFile = spec => spec.fail(failure);
  await uploader.uploadFile({
    url: URL,
    filePath: '/tmp/a.png',
    fail(error) {
      callbackError = error;
    },
  });
  assert.equal(callbackError, failure);
});
