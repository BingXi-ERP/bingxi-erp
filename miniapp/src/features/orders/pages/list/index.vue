<template>
  <ListPageTemplate>
    <template #filter>
      <view class="orders__filter">
        <WInput v-model="filters.order_no" :placeholder="t('orders.search')" />
        <WButton size="small" @click="load">{{ t('catalog.search') }}</WButton>
      </view>
    </template>

    <StateView :status="status" :message="message" :retry="load">
      <view class="orders__list">
        <view
          v-for="order in items"
          :key="order.id"
          class="orders__card"
          data-test="order-card"
          @click="openOrder(order.id)"
        >
          <view class="orders__card-main">
            <text class="orders__no">{{ order.order_no }}</text>
            <StatusTag domain="sales-order" :value="order.status" />
          </view>
          <view class="orders__meta">
            <text v-if="order.customer_name">{{ order.customer_name }}</text>
            <MoneyText v-if="order.total_amount" :value="order.total_amount" currency />
          </view>
        </view>
      </view>
      <WButton v-if="hasMore" block :loading="loading" @click="loadMore">
        {{ t('stateView.loading') }}
      </WButton>
    </StateView>

    <template #footer>
      <view class="orders__footer">
        <PermissionButton permission="orders:create" :can="session.can" block @click="createOrder">
          {{ t('orders.create') }}
        </PermissionButton>
        <AppTabBar />
      </view>
    </template>
  </ListPageTemplate>
</template>

<script setup lang="ts">
import { onLoad, onReachBottom } from '@dcloudio/uni-app'
import { useSessionStore } from '../../../auth'
import { t } from '../../../../shared/i18n'
import AppTabBar from '../../../../shared/ui/AppTabBar.vue'
import MoneyText from '../../../../shared/ui/MoneyText.vue'
import PermissionButton from '../../../../shared/ui/PermissionButton.vue'
import StateView from '../../../../shared/ui/StateView.vue'
import StatusTag from '../../../../shared/ui/StatusTag.vue'
import ListPageTemplate from '../../../../shared/ui/templates/ListPageTemplate.vue'
import WButton from '../../../../shared/ui/wot/WButton.vue'
import WInput from '../../../../shared/ui/wot/WInput.vue'
import { useOrders } from '../../composables/useOrders'

const session = useSessionStore()
const { items, status, message, filters, loading, hasMore, load, loadMore } = useOrders()

onLoad(() => void load())
onReachBottom(() => void loadMore())

function openOrder(id: number) {
  uni.navigateTo({ url: `/features/orders/pages/detail/index?id=${id}` })
}

function createOrder() {
  uni.navigateTo({ url: '/features/orders/pages/create/index' })
}
</script>

<style scoped>
.orders__filter {
  display: flex;
  gap: var(--space-2);
}

.orders__list {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.orders__card {
  background: var(--color-surface);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-card);
  padding: var(--space-4);
}

.orders__card-main,
.orders__meta {
  display: flex;
  gap: var(--space-2);
  justify-content: space-between;
}

.orders__card-main,
.orders__meta {
  align-items: center;
}

.orders__meta {
  color: var(--color-text-secondary);
  margin-top: var(--space-2);
}

.orders__no {
  color: var(--color-text);
  font-size: var(--font-lg);
  font-weight: 600;
}

.orders__footer {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}
</style>
