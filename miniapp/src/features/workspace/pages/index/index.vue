<template>
  <ListPageTemplate>
    <template #filter>
      <view class="workspace__header">{{ t('workspace.title') }}</view>
    </template>

    <StateView :status="status" :message="message" :retry="load">
      <view class="workspace__content">
        <view class="workspace__user" data-test="workspace-user">
          <view class="workspace__user-label">{{ t('workspace.currentUser') }}</view>
          <view class="workspace__user-name">{{ session.user?.username }}</view>
        </view>
        <PermissionButton
          permission="orders:read"
          :can="session.can"
          data-permission="orders:read"
          block
        >
          {{ t('workspace.ordersRead') }}
        </PermissionButton>
        <PermissionButton
          permission="orders:create"
          :can="session.can"
          data-permission="orders:create"
          block
        >
          {{ t('workspace.ordersCreate') }}
        </PermissionButton>
      </view>
    </StateView>

    <template #footer><AppTabBar /></template>
  </ListPageTemplate>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useSessionStore } from '../../../auth'
import { logger } from '../../../../shared/api/logger'
import { isAppError } from '../../../../shared/api/response'
import { t } from '../../../../shared/i18n'
import AppTabBar from '../../../../shared/ui/AppTabBar.vue'
import PermissionButton from '../../../../shared/ui/PermissionButton.vue'
import StateView from '../../../../shared/ui/StateView.vue'
import ListPageTemplate from '../../../../shared/ui/templates/ListPageTemplate.vue'

const session = useSessionStore()
const status = ref<'loading' | 'empty' | 'error' | 'success'>('loading')
const message = ref('')

function returnToLogin() {
  uni.reLaunch({ url: '/pages/login/index' })
}

async function load() {
  status.value = 'loading'
  message.value = ''
  try {
    const result = await session.verify()
    if (result === 'valid') {
      status.value = 'success'
      logger.info('workspace.session_verified')
      return
    }
    if (result === 'none' || result === 'invalid') {
      status.value = 'empty'
      message.value = t('workspace.sessionInvalid')
      logger.warn('workspace.session_invalid', { result })
      returnToLogin()
      return
    }
    status.value = 'error'
    message.value = t('workspace.verifyFailed')
    logger.warn('workspace.session_verification_failed', { result })
  } catch (error) {
    status.value = 'error'
    message.value = t('workspace.verifyRejected')
    logger.error('workspace.session_verification_rejected', {
      code: isAppError(error) ? error.code : 'UNKNOWN_ERROR',
    })
  }
}

onMounted(load)
</script>

<style scoped>
.workspace__header {
  color: var(--color-text);
  font-size: var(--font-lg);
  font-weight: 600;
}

.workspace__content {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding-bottom: var(--space-4);
}

.workspace__user {
  background: var(--color-surface);
  border-radius: var(--radius-md);
  padding: var(--space-4);
}

.workspace__user-label {
  color: var(--color-text-secondary);
  font-size: var(--font-sm);
}

.workspace__user-name {
  color: var(--color-text);
  font-size: var(--font-lg);
  margin-top: var(--space-1);
}
</style>
