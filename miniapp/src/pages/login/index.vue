<template>
  <view class="login-page">
    <view class="login-page__header">
      <view class="login-page__title">{{ t('app.name') }}</view>
      <view class="login-page__subtitle">{{ t('login.subtitle') }}</view>
    </view>

    <form class="login-page__form" @submit="onSubmit">
      <input
        v-model="username"
        class="login-page__input"
        name="username"
        autocomplete="username"
        :placeholder="t('login.usernamePlaceholder')"
      />
      <input
        v-model="password"
        class="login-page__input"
        name="password"
        password
        autocomplete="current-password"
        :placeholder="t('login.passwordPlaceholder')"
      />
      <WButton
        class="login-page__submit"
        native-type="submit"
        :disabled="wechatLoading"
        :loading="loading"
      >
        {{ t('login.submit') }}
      </WButton>
    </form>

    <button
      class="login-page__wechat"
      open-type="getPhoneNumber"
      data-action="wechat-login"
      :disabled="loading || wechatLoading"
      :loading="wechatLoading"
      @getphonenumber="onWeChatLogin"
    >
      {{ t('login.wechat') }}
    </button>

    <view v-if="errorMessage" class="login-page__error" data-test="login-error" role="alert">
      {{ errorMessage }}
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useSessionStore } from '../../features/auth'
import { logger } from '../../shared/api/logger'
import { isAppError } from '../../shared/api/response'
import { t } from '../../shared/i18n'
import WButton from '../../shared/ui/wot/WButton.vue'

const WORKSPACE_ROUTE = '/features/workspace/pages/index/index'
const session = useSessionStore()
const username = ref('')
const password = ref('')
const loading = ref(false)
const wechatLoading = ref(false)
const errorMessage = ref('')

function openWorkspace() {
  uni.reLaunch({ url: WORKSPACE_ROUTE })
}

function showFailure(method: 'password' | 'miniapp', error: unknown) {
  errorMessage.value = t('login.failed')
  logger.error('login.page_failed', {
    method,
    code: isAppError(error) ? error.code : 'UNKNOWN_ERROR',
  })
}

async function onSubmit() {
  if (loading.value || wechatLoading.value) return
  loading.value = true
  errorMessage.value = ''
  try {
    const result = await session.loginWithPassword({
      username: username.value,
      password: password.value,
    })
    if (result === 'valid') {
      openWorkspace()
      return
    }
    errorMessage.value = t('login.failed')
    logger.warn('login.password_not_verified', { result })
  } catch (error) {
    showFailure('password', error)
  } finally {
    loading.value = false
  }
}

async function onWeChatLogin(event: { detail: { code?: string } }) {
  if (loading.value || wechatLoading.value) return
  const phoneCode = event.detail.code
  if (!phoneCode) {
    errorMessage.value = t('login.phoneDenied')
    logger.warn('login.phone_authorization_missing')
    return
  }

  wechatLoading.value = true
  errorMessage.value = ''
  try {
    const loginResult = await uni.login()
    if (!loginResult.code) {
      errorMessage.value = t('login.wechatUnavailable')
      logger.warn('login.wechat_code_missing')
      return
    }
    const result = await session.loginWithMiniapp({
      code: loginResult.code,
      phone_code: phoneCode,
    })
    if (result === 'valid') {
      openWorkspace()
      return
    }
    errorMessage.value = t('login.failed')
    logger.warn('login.miniapp_not_verified', { result })
  } catch (error) {
    showFailure('miniapp', error)
  } finally {
    wechatLoading.value = false
  }
}
</script>

<style scoped>
.login-page {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  padding: var(--space-4);
}

.login-page__header {
  margin-bottom: var(--space-4);
}

.login-page__title {
  color: var(--color-text);
  font-size: var(--font-lg);
  font-weight: 600;
}

.login-page__subtitle {
  color: var(--color-text-secondary);
  font-size: var(--font-md);
  margin-top: var(--space-2);
}

.login-page__form {
  display: flex;
  flex-direction: column;
}

.login-page__input {
  background: var(--color-surface);
  border: var(--hairline) solid var(--color-border);
  border-radius: var(--radius-md);
  color: var(--color-text);
  font-size: var(--font-md);
  margin-bottom: var(--space-4);
  padding: var(--space-2) var(--space-4);
}

.login-page__submit {
  margin-top: var(--space-2);
}

.login-page__wechat {
  background: var(--color-surface);
  border: var(--hairline) solid var(--color-border);
  border-radius: var(--radius-md);
  color: var(--color-primary);
  font-size: var(--font-md);
  margin-top: var(--space-4);
}

.login-page__wechat::after {
  border: none;
}

.login-page__error {
  color: var(--color-danger);
  font-size: var(--font-sm);
  margin-top: var(--space-4);
}
</style>
