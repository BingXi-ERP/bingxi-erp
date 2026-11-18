/**
 * 支付通道后台配置与付款申请支付方式下拉的端到端契约验证。
 *
 * 走真实后端（不 mock 网络）：种子两通道的初值与密钥脱敏、启用配置的逐列回读、
 * 启用态驱动下拉选项、禁用态从下拉消失、非法回调地址与不存在通道的失败信封，
 * 结束后把 wechat_pay 复位到禁用且无商户凭证的种子态。
 *
 * 只读真实端点，路径取自路由快照在册组合（相对 baseURL='/api/v1/erp'）：
 * GET  /payment-channels                      通道配置列表
 * GET  /payment-channels/{channel_code}       单通道回读
 * PUT  /payment-channels/{channel_code}       单通道配置更新
 * GET  /ap/payment-requests/payment-methods   付款申请支付方式下拉
 *
 * 契约真相：列表与单通道回读均序列化 payment_channel_config::Model，键名 snake_case，
 * api_key 由 serialize_masked_key 恒定输出 '***'，明文/密文都不出网；PUT 载荷不写
 * api_key，本 E2E 不验证密钥写入路径（由 Rust unit 覆盖）。下拉选项由
 * PaymentChannelOption 仅带 channel_code 与 channel_name，且只收录 enabled=true 的
 * wechat_pay 与 alipay。回调地址只接受无 userinfo 的 HTTPS URL，违规一律
 * HTTP 400 / VALIDATION_ERROR；更新不存在的通道为 HTTP 404 / NOT_FOUND。
 */
import { test, expect, type Page } from '../diagnose-fixture';
import {
  APP_ERROR_CODES,
  apiCall,
  apiCallExpectFail,
  apiCallRaw,
  failureCode,
  loginViaUI,
} from './helpers';

const WECHAT = 'wechat_pay';
const ALIPAY = 'alipay';
const MASKED_KEY = '***';

interface PaymentChannel {
  id: number;
  channel_code: string;
  channel_name: string;
  enabled: boolean;
  sandbox_mode: boolean;
  app_id: string;
  mch_id: string;
  api_key: string;
  callback_url: string;
  created_at: string;
  updated_at: string;
  created_by: number | null;
}

interface PaymentMethodOption {
  channel_code: string;
  channel_name: string;
}

async function listChannels(page: Page): Promise<PaymentChannel[]> {
  const data = await apiCallRaw<PaymentChannel[]>(page, 'GET', '/payment-channels');
  if (!Array.isArray(data)) {
    throw new Error(`GET /payment-channels 应返回数组，实际 ${JSON.stringify(data)}`);
  }
  return data;
}

async function readChannel(page: Page, channelCode: string): Promise<PaymentChannel> {
  return apiCallRaw<PaymentChannel>(page, 'GET', `/payment-channels/${channelCode}`);
}

async function readMethods(page: Page): Promise<PaymentMethodOption[]> {
  const data = await apiCallRaw<PaymentMethodOption[]>(
    page,
    'GET',
    '/ap/payment-requests/payment-methods'
  );
  if (!Array.isArray(data)) {
    throw new Error(
      `GET /ap/payment-requests/payment-methods 应返回数组，实际 ${JSON.stringify(data)}`
    );
  }
  return data;
}

/**
 * 把 wechat_pay 复位到种子态：禁用、沙箱开启并清空可写凭证与回调。
 * PUT 载荷不写 api_key；后端按「空/缺省不覆盖」保留原值，出参恒为 '***'。
 */
async function resetWechatPay(page: Page): Promise<void> {
  await apiCall(page, 'PUT', `/payment-channels/${WECHAT}`, {
    enabled: false,
    sandbox_mode: true,
    app_id: '',
    mch_id: '',
    callback_url: '',
  });
}

/** 按 channel_code 取列表中的唯一一行，缺失或多行即判红，不拿空对象继续断言 */
function pickChannel(rows: PaymentChannel[], code: string, label: string): PaymentChannel {
  const hits = rows.filter(row => row.channel_code === code);
  expect(
    hits.length,
    `${label}：channel_code=${code} 应恰有一行，实际 ${JSON.stringify(rows)}`
  ).toBe(1);
  return hits[0];
}

test.describe.serial('支付通道配置与付款申请支付方式下拉契约链', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
    await resetWechatPay(page);
  });

  test.afterEach(async ({ page }) => {
    // 无论用例成败都把共享种子行留在禁用、无凭证态，避免污染后续分片重跑
    await resetWechatPay(page);
  });

  test('1xx-01 种子两通道各一条、禁用且凭证与回调为空、密钥恒脱敏', async ({ page }) => {
    const channels = await listChannels(page);
    const wechat = pickChannel(channels, WECHAT, '种子列表');
    const alipay = pickChannel(channels, ALIPAY, '种子列表');

    expect(wechat.channel_name, 'wechat_pay 种子名称').toBe('微信支付');
    expect(alipay.channel_name, 'alipay 种子名称').toBe('支付宝');
    for (const [code, row] of [
      [WECHAT, wechat],
      [ALIPAY, alipay],
    ] as const) {
      expect(row.enabled, `${code} 初始应禁用`).toBe(false);
      expect(row.sandbox_mode, `${code} 初始 sandbox_mode 应为 true`).toBe(true);
      expect(row.app_id, `${code} 初始 app_id 应为空`).toBe('');
      expect(row.mch_id, `${code} 初始 mch_id 应为空`).toBe('');
      expect(row.callback_url, `${code} 初始 callback_url 应为空`).toBe('');
      expect(row.api_key, `${code} 密钥出参恒为掩码`).toBe(MASKED_KEY);
    }
    // 单通道回读口与列表口同一行口径
    const single = await readChannel(page, WECHAT);
    expect(single.channel_code, '单通道回读 channel_code').toBe(WECHAT);
    expect(single.api_key, '单通道回读密钥仍脱敏').toBe(MASKED_KEY);
  });

  test('1xx-02 启用并配置 wechat_pay 后逐列回读，密钥仍为掩码', async ({ page }) => {
    const updated = await apiCallRaw<PaymentChannel>(page, 'PUT', `/payment-channels/${WECHAT}`, {
      enabled: true,
      sandbox_mode: false,
      app_id: 'wxtest',
      mch_id: 'mchtest',
      callback_url: 'https://example.com/callback',
    });
    expect(updated.enabled, 'PUT 响应 enabled').toBe(true);
    expect(updated.sandbox_mode, 'PUT 响应 sandbox_mode').toBe(false);
    expect(updated.app_id, 'PUT 响应 app_id 回显').toBe('wxtest');
    expect(updated.mch_id, 'PUT 响应 mch_id 回显').toBe('mchtest');
    expect(updated.callback_url, 'PUT 响应 callback_url 回显').toBe('https://example.com/callback');
    expect(
      updated.api_key,
      '本 E2E 不验证 api_key 写入路径（由 Rust unit 覆盖），仅验证出参恒为掩码'
    ).toBe(MASKED_KEY);

    // 独立 GET 回读，确认不是只在写响应里回显
    const reread = await readChannel(page, WECHAT);
    expect(reread.enabled, '回读 enabled').toBe(true);
    expect(reread.sandbox_mode, '回读 sandbox_mode').toBe(false);
    expect(reread.app_id, '回读 app_id').toBe('wxtest');
    expect(reread.mch_id, '回读 mch_id').toBe('mchtest');
    expect(reread.callback_url, '回读 callback_url').toBe('https://example.com/callback');
    expect(reread.api_key, '回读密钥仍为掩码；写入路径由 Rust unit 覆盖').toBe(MASKED_KEY);
  });

  test('1xx-03 启用后付款申请支付方式下拉含 wechat_pay 且只带通道标识与名称', async ({ page }) => {
    const config = await apiCallRaw<PaymentChannel>(page, 'PUT', `/payment-channels/${WECHAT}`, {
      enabled: true,
      callback_url: 'https://example.com/callback',
    });
    expect(config.enabled, '前置：wechat_pay 已启用').toBe(true);

    const options = await readMethods(page);
    const hits = options.filter(option => option.channel_code === WECHAT);
    expect(hits.length, `启用的 wechat_pay 应恰好出现一次，实际 ${JSON.stringify(options)}`).toBe(
      1
    );
    expect(hits[0].channel_name, '下拉通道名称应与后端种子一致').toBe(config.channel_name);
    expect(hits[0].channel_name, '下拉通道名称应为种子值').toBe('微信支付');
    // 未启用的 alipay 不进下拉
    expect(
      options.some(option => option.channel_code === ALIPAY),
      '未启用的 alipay 不应出现在下拉'
    ).toBe(false);
    // 下拉不含任何商户配置或凭证
    for (const option of options) {
      expect(Object.keys(option).sort(), '下拉行只含 channel_code 与 channel_name').toEqual([
        'channel_code',
        'channel_name',
      ]);
    }
  });

  test('1xx-04 从启用切回禁用后该通道不再出现在下拉', async ({ page }) => {
    await apiCall(page, 'PUT', `/payment-channels/${WECHAT}`, { enabled: true });
    const before = await readMethods(page);
    expect(
      before.some(option => option.channel_code === WECHAT),
      '启用态下拉应含 wechat_pay'
    ).toBe(true);

    await apiCall(page, 'PUT', `/payment-channels/${WECHAT}`, { enabled: false });
    const after = await readMethods(page);
    expect(
      after.some(option => option.channel_code === WECHAT),
      '禁用态下拉不应再含 wechat_pay'
    ).toBe(false);
  });

  test('1xx-05 非法回调地址（http 与非 URL）被拒 400 且不变动已存配置', async ({ page }) => {
    for (const bad of ['http://example.com/callback', 'not-a-url']) {
      const failure = await apiCallExpectFail(page, 'PUT', `/payment-channels/${WECHAT}`, {
        callback_url: bad,
      });
      expect(failure.status, `回调 ${bad} 应 400，实际 ${JSON.stringify(failure)}`).toBe(400);
      expect(failureCode(failure), `回调 ${bad} 机器码`).toBe(APP_ERROR_CODES.VALIDATION_ERROR);
    }
    const unchanged = await readChannel(page, WECHAT);
    expect(unchanged.callback_url, '被拒的回调地址不得落库').toBe('');
    expect(unchanged.enabled, '被拒请求不得改动 enabled').toBe(false);
  });

  test('1xx-06 更新不存在的渠道返回 404 NOT_FOUND', async ({ page }) => {
    const failure = await apiCallExpectFail(page, 'PUT', '/payment-channels/nonexistent', {
      enabled: true,
    });
    expect(failure.status, `不存在渠道应 404，实际 ${JSON.stringify(failure)}`).toBe(404);
    expect(failureCode(failure), '不存在渠道机器码').toBe(APP_ERROR_CODES.NOT_FOUND);
  });

  test('1xx-07 结尾复位 wechat_pay 为禁用、空凭证并回读确认', async ({ page }) => {
    // 先落一个含凭证的启用态，证明复位确实把它清回种子态而非依赖初始态
    await apiCall(page, 'PUT', `/payment-channels/${WECHAT}`, {
      enabled: true,
      sandbox_mode: false,
      app_id: 'wxtest',
      mch_id: 'mchtest',
      callback_url: 'https://example.com/callback',
    });
    await resetWechatPay(page);

    const restored = await readChannel(page, WECHAT);
    expect(restored.enabled, '复位后禁用').toBe(false);
    expect(restored.sandbox_mode, '复位后 sandbox_mode 为种子态 true').toBe(true);
    expect(restored.app_id, '复位后 app_id 空').toBe('');
    expect(restored.mch_id, '复位后 mch_id 空').toBe('');
    expect(restored.callback_url, '复位后 callback_url 空').toBe('');
    expect(restored.api_key, '复位后密钥仍为掩码').toBe(MASKED_KEY);
    const options = await readMethods(page);
    expect(
      options.some(option => option.channel_code === WECHAT),
      '复位后下拉不含 wechat_pay'
    ).toBe(false);
  });
});
