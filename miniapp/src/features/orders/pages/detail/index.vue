<template>
  <DetailPageTemplate>
    <StateView :status="status" :message="message" :retry="load">
      <view v-if="order" class="orders__detail">
        <view class="orders__detail-title">
          <text class="orders__no">{{ order.order_no }}</text>
          <StatusTag domain="sales-order" :value="order.status" />
        </view>
        <view v-if="order.customer_name" class="orders__detail-row">
          <text>{{ t('orders.customer') }}</text>
          <text>{{ order.customer_name }}</text>
        </view>
        <view v-if="order.total_amount" class="orders__detail-row">
          <text>{{ t('orders.amount') }}</text>
          <MoneyText :value="order.total_amount" currency />
        </view>
        <view class="orders__items">
          <view v-for="item in order.items" :key="item.id" class="orders__item">
            <view>
              <text v-if="item.product_name || item.product_code">{{
                item.product_name ?? item.product_code
              }}</text>
              <text v-if="item.color_no"> {{ item.color_no }}</text>
            </view>
            <view>
              <text>{{ item.quantity }} × {{ item.unit_price }}</text>
              <MoneyText v-if="item.total_amount" :value="item.total_amount" currency />
            </view>
          </view>
        </view>
      </view>
    </StateView>

    <template #footer>
      <view v-if="order" class="orders__actions">
        <PermissionButton
          v-if="order.status === 'draft'"
          permission="orders:submit"
          :can="session.can"
          :loading="submitting"
          @click="submitOrder"
        >
          {{ t('orders.submit') }}
        </PermissionButton>
        <PermissionButton
          v-if="order.balance_amount"
          permission="payments:create"
          :can="session.can"
          @click="collectPayment"
        >
          {{ t('payments.title') }}
        </PermissionButton>
        <PermissionButton
          v-if="order.status === 'draft'"
          permission="orders:cancel"
          :can="session.can"
          @click="cancelOrder"
        >
          {{ t('orders.cancel') }}
        </PermissionButton>
      </view>
    </template>
  </DetailPageTemplate>
</template>

<script setup lang="ts">
import { onLoad } from '@dcloudio/uni-app'
import { ref } from 'vue'
import { useSessionStore } from '../../../auth'
import { logger } from '../../../../shared/api/logger'
import { isAppError } from '../../../../shared/api/response'
import { t } from '../../../../shared/i18n'
import MoneyText from '../../../../shared/ui/MoneyText.vue'
import PermissionButton from '../../../../shared/ui/PermissionButton.vue'
import StateView from '../../../../shared/ui/StateView.vue'
import StatusTag from '../../../../shared/ui/StatusTag.vue'
import DetailPageTemplate from '../../../../shared/ui/templates/DetailPageTemplate.vue'
import { orderService } from '../../services/orders'
import type { SalesOrder } from '../../types'

const session = useSessionStore()
const order = ref<SalesOrder | null>(null)
const status = ref<'loading' | 'empty' | 'error' | 'success'>('loading')
const message = ref('')
const submitting = ref(false)
const orderId = ref(0)

onLoad((query) => {
  orderId.value = Number(query?.id)
  void load()
})

async function load() {
  status.value = 'loading'
  message.value = ''
  try {
    order.value = await orderService.detail(orderId.value)
    status.value = 'success'
  } catch (error) {
    order.value = null
    status.value = 'error'
    message.value = isAppError(error) ? error.message : t('orders.loadFailed')
    logger.error('orders.detail_failed', {
      code: isAppError(error) ? error.code : 'UNKNOWN_ERROR',
    })
  }
}

async function submitOrder() {
  submitting.value = true
  try {
    order.value = await orderService.submit(orderId.value)
  } catch (error) {
    message.value = isAppError(error) ? error.message : t('orders.submitFailed')
    logger.error('orders.submit_action_failed', {
      code: isAppError(error) ? error.code : 'UNKNOWN_ERROR',
    })
  } finally {
    submitting.value = false
  }
}

function collectPayment() {
  if (!order.value?.balance_amount) return
  uni.navigateTo({
    url: `/features/payments/pages/collect/index?customer_id=${order.value.customer_id}&outstanding=${encodeURIComponent(order.value.balance_amount)}`,
  })
}

async function cancelOrder() {
  try {
    order.value = await orderService.cancel(orderId.value)
  } catch (error) {
    message.value = isAppError(error) ? error.message : t('orders.submitFailed')
    logger.error('orders.cancel_action_failed', {
      code: isAppError(error) ? error.code : 'UNKNOWN_ERROR',
    })
  }
}
</script>

<style scoped>
.orders__detail {
  background: var(--color-surface);
  border-radius: var(--radius-md);
  padding: var(--space-4);
}

.orders__detail-title,
.orders__detail-row,
.orders__item {
  display: flex;
  gap: var(--space-3);
  justify-content: space-between;
}

.orders__detail-title,
.orders__item {
  align-items: center;
}

.orders__detail-row,
.orders__item {
  border-top: var(--hairline) solid var(--color-border);
  color: var(--color-text-secondary);
  padding: var(--space-3) 0;
}

.orders__no {
  color: var(--color-text);
  font-size: var(--font-lg);
  font-weight: 600;
}

.orders__items {
  margin-top: var(--space-3);
}

.orders__actions {
  display: flex;
  gap: var(--space-2);
}
</style>
