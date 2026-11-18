<template>
  <div v-loading="loading" class="payment-channels" data-testid="payment-channels">
    <h2>{{ t('paymentChannels.title') }}</h2>
    <el-alert :title="t('paymentChannels.description')" type="info" :closable="false" />
    <el-alert
      v-if="!canUpdate"
      :title="t('paymentChannels.readonly')"
      type="info"
      :closable="false"
    />
    <el-alert v-if="failed" :title="t('paymentChannels.loadFailed')" type="error" :closable="false">
      <el-button @click="load">{{ t('common.refresh') }}</el-button>
    </el-alert>
    <div class="channel-grid">
      <el-card
        v-for="channel in channels"
        :key="channel.channel_code"
        :data-testid="`channel-${channel.channel_code}`"
        shadow="never"
      >
        <template #header
          ><h3>{{ channel.channel_name }}</h3></template
        >
        <el-form
          label-position="top"
          :disabled="!canUpdate || channel.saving"
          :aria-label="channel.channel_name"
        >
          <el-form-item :label="t('paymentChannels.enabled')">
            <el-switch
              v-model="channel.enabled"
              :aria-label="t('paymentChannels.enabled')"
              data-testid="enabled"
            />
          </el-form-item>
          <el-form-item :label="t('paymentChannels.sandboxMode')">
            <el-switch
              v-model="channel.sandbox_mode"
              :aria-label="t('paymentChannels.sandboxMode')"
              data-testid="sandbox-mode"
            />
          </el-form-item>
          <el-form-item :label="t('paymentChannels.appId')">
            <el-input
              v-model="channel.app_id"
              :maxlength="128"
              autocomplete="off"
              data-testid="app-id"
            />
          </el-form-item>
          <el-form-item :label="t('paymentChannels.mchId')">
            <el-input
              v-model="channel.mch_id"
              :maxlength="128"
              autocomplete="off"
              data-testid="mch-id"
            />
          </el-form-item>
          <el-form-item
            :label="t('paymentChannels.apiKey')"
            :error="channel.api_key === '***' ? t('paymentChannels.validation.maskedKey') : ''"
          >
            <el-input
              v-model="channel.api_key"
              type="password"
              autocomplete="new-password"
              data-testid="api-key"
            />
            <span class="field-hint">{{ t('paymentChannels.keyHint') }}</span>
          </el-form-item>
          <el-form-item
            :label="t('paymentChannels.callbackUrl')"
            :error="
              !isValidCallbackUrl(channel.callback_url)
                ? t('paymentChannels.validation.httpsRequired')
                : ''
            "
          >
            <el-input
              v-model="channel.callback_url"
              :maxlength="2048"
              autocomplete="off"
              data-testid="callback-url"
            />
          </el-form-item>
          <el-alert
            v-if="channel.saveFailed"
            :title="t('paymentChannels.saveFailed')"
            type="error"
            :closable="false"
          />
          <el-button
            type="primary"
            :loading="channel.saving"
            :disabled="
              !canUpdate ||
              channel.saving ||
              !isValidCallbackUrl(channel.callback_url) ||
              channel.api_key === '***'
            "
            data-testid="save-channel"
            @click="save(channel)"
            >{{ t('common.save') }}</el-button
          >
        </el-form>
      </el-card>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { useUserStore } from '@/store/user';
import { hasRoutePermission } from '@/router';
import { PERMISSIONS } from '@/constants/permissions';
import { usePaymentChannels, isValidCallbackUrl } from '@/composables/usePaymentChannels';

const { t } = useI18n({ useScope: 'global' });
const userStore = useUserStore();
const canUpdate = computed(() => {
  const user = userStore.userInfo;
  return (
    !!user?.permissions && hasRoutePermission(PERMISSIONS.PAYMENT_CHANNELS_UPDATE, user.permissions)
  );
});
const { channels, loading, failed, load, save } = usePaymentChannels(canUpdate);
onMounted(load);
</script>

<style scoped>
.payment-channels {
  display: grid;
  gap: 16px;
  min-width: 0;
}
.channel-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 360px), 1fr));
  gap: 16px;
  min-width: 0;
}
.channel-grid > * {
  min-width: 0;
}
h2,
h3 {
  margin: 0;
  overflow-wrap: anywhere;
}
.field-hint {
  color: var(--el-text-color-secondary);
  font-size: var(--el-font-size-small);
  overflow-wrap: anywhere;
}
.el-form .el-alert {
  margin-bottom: 16px;
}
</style>
