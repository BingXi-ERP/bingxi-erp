import { ref, type Ref } from 'vue';
import {
  getPaymentChannels,
  getPaymentChannel,
  updatePaymentChannel,
  type PaymentChannel,
} from '@/api/payment-channel';
import { msg } from '@/utils/message';
import { logger } from '@/utils/logger';

export type PaymentChannelForm = Omit<PaymentChannel, 'api_key'> & {
  api_key: string;
  saving: boolean;
  saveFailed: boolean;
};

export function isValidCallbackUrl(value: string): boolean {
  if (value === '') return true;
  try {
    const url = new URL(value);
    const authority = value.split('://')[1]?.split(/[/?#]/)[0];
    return (
      url.protocol === 'https:' &&
      url.hostname !== '' &&
      authority !== undefined &&
      !authority.includes('@') &&
      !/[\s\\]/.test(value) &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}

function toForm(channel: PaymentChannel): PaymentChannelForm {
  return { ...channel, api_key: '', saving: false, saveFailed: false };
}

export function usePaymentChannels(canUpdate: Readonly<Ref<boolean>>) {
  const channels = ref<PaymentChannelForm[]>([]);
  const loading = ref(false);
  const failed = ref(false);
  async function load() {
    if (loading.value) return;
    loading.value = true;
    failed.value = false;
    try {
      const response = await getPaymentChannels();
      channels.value = response.data.map(toForm);
      logger.info('Payment channel configurations loaded');
    } catch {
      failed.value = true;
      logger.error('Payment channel configurations failed to load');
      msg.loadFail();
    } finally {
      loading.value = false;
    }
  }
  async function save(channel: PaymentChannelForm) {
    if (!canUpdate.value || channel.saving) return;
    if (!isValidCallbackUrl(channel.callback_url) || channel.api_key === '***') return;
    channel.saving = true;
    channel.saveFailed = false;
    try {
      await updatePaymentChannel(channel.channel_code, {
        enabled: channel.enabled,
        sandbox_mode: channel.sandbox_mode,
        app_id: channel.app_id,
        mch_id: channel.mch_id,
        callback_url: channel.callback_url,
        ...(channel.api_key !== '' ? { api_key: channel.api_key } : {}),
      });
      channel.api_key = '';
      const response = await getPaymentChannel(channel.channel_code);
      Object.assign(channel, toForm(response.data));
      logger.info('Payment channel configuration saved and read back');
      msg.saveOk();
    } catch {
      channel.saveFailed = true;
      // Never log request errors: Axios errors can contain the credential payload.
      logger.error('Payment channel save or readback failed');
      msg.saveFail();
    } finally {
      channel.saving = false;
    }
  }
  return { channels, loading, failed, load, save };
}
