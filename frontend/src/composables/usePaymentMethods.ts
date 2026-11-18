import { computed, ref } from 'vue';
import { i18n } from '@/i18n';
import { getPaymentMethodOptions, type PaymentChannelOption } from '@/api/payment-channel';
import { msg } from '@/utils/message';
import { logger } from '@/utils/logger';

export const REGULAR_PAYMENT_METHODS = [
  { value: 'bank_transfer', labelKey: 'apModule.payment.methodBankTransfer' },
  { value: 'cash', labelKey: 'apModule.payment.methodCash' },
  { value: 'check', labelKey: 'apModule.payment.methodCheck' },
  { value: 'bill', labelKey: 'apModule.payment.methodBill' },
];
const CHANNEL_LABELS = [
  { value: 'wechat_pay', labelKey: 'paymentChannels.wechatPay' },
  { value: 'alipay', labelKey: 'paymentChannels.alipay' },
];

export function paymentMethodLabel(value: string): string {
  const entry = [...REGULAR_PAYMENT_METHODS, ...CHANNEL_LABELS].find(item => item.value === value);
  return entry ? i18n.global.t(entry.labelKey) : value;
}

export function usePaymentMethods() {
  const channels = ref<PaymentChannelOption[]>([]);
  const loading = ref(false);
  const failed = ref(false);
  let generation = 0;
  const options = computed(() => [
    ...REGULAR_PAYMENT_METHODS.map(item => ({
      value: item.value,
      label: paymentMethodLabel(item.value),
    })),
    ...channels.value.map(item => ({ value: item.channel_code, label: item.channel_name })),
  ]);
  async function refresh() {
    const current = ++generation;
    loading.value = true;
    failed.value = false;
    channels.value = [];
    try {
      const response = await getPaymentMethodOptions();
      if (current !== generation) return;
      channels.value = response.data;
      logger.info('Payment method options loaded');
    } catch {
      if (current !== generation) return;
      failed.value = true;
      logger.error('Payment method options failed to load');
      msg.loadFail(i18n.global.t('apModule.payment.paymentMethod'));
    } finally {
      if (current === generation) loading.value = false;
    }
  }
  return { options, loading, failed, refresh };
}
