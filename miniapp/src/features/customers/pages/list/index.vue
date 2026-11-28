<template>
  <ListPageTemplate>
    <template #filter>
      <view class="customers__filter">
        <WInput v-model="filters.keyword" :placeholder="t('customers.searchPlaceholder')" />
        <WButton size="small" @click="load">{{ t('customers.search') }}</WButton>
      </view>
    </template>

    <StateView :status="status" :message="message" :retry="load">
      <view class="customers__list">
        <view
          v-for="customer in items"
          :key="customer.id"
          class="customers__card"
          data-test="customer-card"
          @click="openCustomer(customer)"
        >
          <view class="customers__card-main">
            <text class="customers__name">{{ customer.customer_name }}</text>
            <text class="customers__code">{{ customer.customer_code }}</text>
          </view>
          <view class="customers__meta">
            <text v-if="customer.contact_person">{{ customer.contact_person }}</text>
            <text v-if="customer.contact_phone">{{ customer.contact_phone }}</text>
            <StatusTag domain="customer" :value="customer.status" />
          </view>
        </view>
      </view>
      <WButton v-if="hasMore" block :loading="loading" @click="loadMore">
        {{ t('stateView.loading') }}
      </WButton>
    </StateView>

    <template #footer>
      <PermissionButton
        permission="customers:create"
        :can="session.can"
        block
        @click="createCustomer"
      >
        {{ t('customers.create') }}
      </PermissionButton>
    </template>
  </ListPageTemplate>
</template>

<script setup lang="ts">
import { onLoad, onReachBottom } from '@dcloudio/uni-app'
import { ref } from 'vue'
import { useSessionStore } from '../../../auth'
import { t } from '../../../../shared/i18n'
import PermissionButton from '../../../../shared/ui/PermissionButton.vue'
import StateView from '../../../../shared/ui/StateView.vue'
import StatusTag from '../../../../shared/ui/StatusTag.vue'
import ListPageTemplate from '../../../../shared/ui/templates/ListPageTemplate.vue'
import WButton from '../../../../shared/ui/wot/WButton.vue'
import WInput from '../../../../shared/ui/wot/WInput.vue'
import { useCustomers } from '../../composables/useCustomers'
import type { Customer } from '../../types'

const session = useSessionStore()
const { items, status, message, filters, loading, hasMore, load, loadMore } = useCustomers()
const mode = ref('')

onLoad((query) => {
  mode.value = query?.mode === 'select' ? 'select' : ''
  void load()
})
onReachBottom(() => void loadMore())

function openCustomer(customer: Customer) {
  if (mode.value === 'select') {
    uni.$emit('customer:selected', customer)
    uni.navigateBack()
    return
  }
  uni.navigateTo({ url: `/features/customers/pages/detail/index?id=${customer.id}` })
}

function createCustomer() {
  uni.navigateTo({ url: '/features/customers/pages/form/index' })
}
</script>

<style scoped>
.customers__filter {
  display: flex;
  gap: var(--space-2);
}

.customers__list {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.customers__card {
  background: var(--color-surface);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-card);
  padding: var(--space-4);
}

.customers__card-main,
.customers__meta {
  display: flex;
  gap: var(--space-2);
  justify-content: space-between;
}

.customers__meta {
  align-items: center;
  color: var(--color-text-secondary);
  margin-top: var(--space-2);
}

.customers__name {
  color: var(--color-text);
  font-size: var(--font-lg);
  font-weight: 600;
}

.customers__code {
  color: var(--color-text-secondary);
}
</style>
