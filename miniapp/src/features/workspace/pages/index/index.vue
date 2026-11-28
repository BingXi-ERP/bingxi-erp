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

        <view v-if="overview" class="workspace__metrics">
          <view class="workspace__metric" data-test="metric-orders">
            <text class="workspace__metric-label">{{ t('workspace.totalOrders') }}</text>
            <text class="workspace__metric-value">{{ overview.total_orders }}</text>
          </view>
          <view class="workspace__metric" data-test="metric-sales">
            <text class="workspace__metric-label">{{ t('workspace.totalSales') }}</text>
            <MoneyText :value="overview.total_sales" currency />
          </view>
          <view class="workspace__metric" data-test="metric-customers">
            <text class="workspace__metric-label">{{ t('workspace.totalCustomers') }}</text>
            <text class="workspace__metric-value">{{ overview.customer_count }}</text>
          </view>
          <view class="workspace__metric" data-test="metric-pending">
            <text class="workspace__metric-label">{{ t('workspace.pendingOrders') }}</text>
            <text class="workspace__metric-value">{{ overview.pending_orders }}</text>
          </view>
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
import { onMounted } from 'vue'
import { useSessionStore } from '../../../auth'
import { logger } from '../../../../shared/api/logger'
import { isAppError } from '../../../../shared/api/response'
import { t } from '../../../../shared/i18n'
import AppTabBar from '../../../../shared/ui/AppTabBar.vue'
import MoneyText from '../../../../shared/ui/MoneyText.vue'
import PermissionButton from '../../../../shared/ui/PermissionButton.vue'
import StateView from '../../../../shared/ui/StateView.vue'
import ListPageTemplate from '../../../../shared/ui/templates/ListPageTemplate.vue'
import { useDashboard } from '../../composables/useDashboard'

const session = useSessionStore()
const { status, message, overview, load: loadDashboard } = useDashboard()

function returnToLogin() {
  uni.reLaunch({ url: '/pages/login/index' })
}

async function load() {
  status.value = 'loading'
  message.value = ''
  try {
    const result = await session.verify()
    if (result === 'valid') {
      await loadDashboard()
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

.workspace__metrics {
  display: grid;
  gap: var(--space-3);
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.workspace__metric {
  background: var(--color-surface);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-card);
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  padding: var(--space-4);
}

.workspace__metric-label {
  color: var(--color-text-secondary);
  font-size: var(--font-sm);
}

.workspace__metric-value {
  color: var(--color-text);
  font-size: var(--font-lg);
  font-weight: 600;
}
</style>
