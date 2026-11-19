import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';
import { readFileSync } from 'node:fs';
import { usePaymentChannels, isValidCallbackUrl } from '@/composables/usePaymentChannels';
import { usePaymentMethods, paymentMethodLabel } from '@/composables/usePaymentMethods';
import {
  getPaymentChannels,
  getPaymentChannel,
  updatePaymentChannel,
  getPaymentMethodOptions,
  type PaymentChannel,
} from '@/api/payment-channel';

vi.mock('@/api/payment-channel', () => ({
  getPaymentChannels: vi.fn(),
  getPaymentChannel: vi.fn(),
  updatePaymentChannel: vi.fn(),
  getPaymentMethodOptions: vi.fn(),
}));
vi.mock('@/utils/message', () => ({
  msg: { loadFail: vi.fn(), saveFail: vi.fn(), saveOk: vi.fn() },
}));
vi.mock('@/utils/logger', () => ({ logger: { info: vi.fn(), error: vi.fn() } }));
vi.mock('@/i18n', () => ({ i18n: { global: { t: (key: string) => key } } }));

const channel = (): PaymentChannel => ({
  id: 1,
  channel_code: 'wechat_pay',
  channel_name: 'WeChat Pay',
  enabled: false,
  sandbox_mode: true,
  app_id: '',
  mch_id: '',
  api_key: '***',
  callback_url: '',
  created_at: new Date(0).toISOString(),
  updated_at: new Date(0).toISOString(),
  created_by: null,
});

beforeEach(() => vi.resetAllMocks());

describe('payment channel configuration', () => {
  it('starts with server values and empty credential fields, and refuses read-only writes', async () => {
    vi.mocked(getPaymentChannels).mockResolvedValue({ code: 200, data: [channel()] });
    const state = usePaymentChannels(ref(false));
    expect(state.channels.value).toEqual([]);
    await state.load();
    const form = state.channels.value[0];
    expect([form.app_id, form.mch_id, form.api_key, form.callback_url]).toEqual(['', '', '', '']);
    expect(form.enabled).toBe(false);
    await state.save(form);
    expect(updatePaymentChannel).not.toHaveBeenCalled();
  });

  it('does not overwrite a key with blank input and reads back server state', async () => {
    vi.mocked(getPaymentChannels).mockResolvedValue({ code: 200, data: [channel()] });
    vi.mocked(updatePaymentChannel).mockResolvedValue({ code: 200, data: channel() });
    vi.mocked(getPaymentChannel).mockResolvedValue({
      code: 200,
      data: { ...channel(), enabled: true },
    });
    const state = usePaymentChannels(ref(true));
    await state.load();
    const form = state.channels.value[0];
    await state.save(form);
    expect(vi.mocked(updatePaymentChannel).mock.calls[0][1]).not.toHaveProperty('api_key');
    expect(getPaymentChannel).toHaveBeenCalledWith('wechat_pay');
    expect(form.enabled).toBe(true);
    expect(form.api_key).toBe('');
  });

  it('preserves the form on failure and prevents concurrent saves', async () => {
    vi.mocked(getPaymentChannels).mockResolvedValue({ code: 200, data: [channel()] });
    let rejectSave!: (reason: Error) => void;
    vi.mocked(updatePaymentChannel).mockReturnValue(
      new Promise((_resolve, reject) => {
        rejectSave = reject;
      })
    );
    const state = usePaymentChannels(ref(true));
    await state.load();
    const form = state.channels.value[0];
    form.app_id = 'entered-app';
    form.api_key = 'entered-secret';
    const pending = state.save(form);
    await state.save(form);
    expect(updatePaymentChannel).toHaveBeenCalledTimes(1);
    rejectSave(new Error('failed'));
    await pending;
    expect(form.app_id).toBe('entered-app');
    expect(form.api_key).toBe('entered-secret');
    expect(form.saveFailed).toBe(true);
    expect(form.saving).toBe(false);
  });

  it.each([
    'http://example.com',
    'https://@example.com',
    'https://user@example.com',
    'https:example.com',
    'https://example.com\\path',
    'https://example.com\n',
  ])('rejects unsafe callback %s', value => {
    expect(isValidCallbackUrl(value)).toBe(false);
  });
  it('allows blank or HTTPS callbacks', () => {
    expect(isValidCallbackUrl('')).toBe(true);
    expect(isValidCallbackUrl('https://example.com/callback')).toBe(true);
  });
});

describe('ordinary payment method options', () => {
  it('appends enabled channels and removes disabled ones on refresh while keeping historical labels', async () => {
    vi.mocked(getPaymentMethodOptions)
      .mockResolvedValueOnce({
        code: 200,
        data: [{ channel_code: 'wechat_pay', channel_name: 'WeChat Pay' }],
      })
      .mockResolvedValueOnce({ code: 200, data: [] });
    const state = usePaymentMethods();
    expect(state.options.value.map(option => option.value)).toEqual([
      'bank_transfer',
      'cash',
      'check',
      'bill',
    ]);
    await state.refresh();
    expect(state.options.value.map(option => option.value)).toContain('wechat_pay');
    await state.refresh();
    expect(state.options.value.map(option => option.value)).not.toContain('wechat_pay');
    expect(paymentMethodLabel('wechat_pay')).toBe('paymentChannels.wechatPay');
    expect(paymentMethodLabel('alipay')).toBe('paymentChannels.alipay');
  });

  it('exposes failure, clears stale channel choices and supports retry', async () => {
    vi.mocked(getPaymentMethodOptions)
      .mockRejectedValueOnce(new Error('unavailable'))
      .mockResolvedValueOnce({ code: 200, data: [] });
    const state = usePaymentMethods();
    await state.refresh();
    expect(state.failed.value).toBe(true);
    expect(state.loading.value).toBe(false);
    await state.refresh();
    expect(state.failed.value).toBe(false);
  });

  it('retains historical request values and keeps the approved-request payment chain', () => {
    const request = readFileSync('src/views/ap/tabs/PaymentRequestTab.vue', 'utf8');
    const payment = readFileSync('src/views/ap/tabs/PaymentTab.vue', 'utf8');
    expect(request).toContain("form.payment_method = row.payment_method || ''");
    expect(request).toContain(':value="form.payment_method"');
    expect(request).toContain("form.payment_method = 'bank_transfer'");
    expect(request.match(/(?:await|void) refreshMethods\(\)/g)).toHaveLength(2);
    expect(payment).toContain('getPaymentMethodLabel(selectedRequest.payment_method');
    expect(payment).not.toContain('getPaymentChannels');
    expect(payment).not.toContain('v-model="paymentForm.payment_method"');
  });
});
