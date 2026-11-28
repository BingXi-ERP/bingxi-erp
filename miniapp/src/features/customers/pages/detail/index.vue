<template>
  <DetailPageTemplate>
    <StateView :status="status" :message="message" :retry="load">
      <view v-if="customer" class="customers__detail">
        <view class="customers__detail-title">
          <text class="customers__detail-name">{{ customer.customer_name }}</text>
          <StatusTag domain="customer" :value="customer.status" />
        </view>
        <view v-if="customer.contact_person" class="customers__detail-row">
          <text>{{ t('customers.contact') }}</text>
          <text>{{ customer.contact_person }}</text>
        </view>
        <view v-if="customer.contact_phone" class="customers__detail-row">
          <text>{{ t('customers.phone') }}</text>
          <text>{{ customer.contact_phone }}</text>
        </view>
        <view class="customers__detail-row">
          <text>{{ t('customers.type') }}</text>
          <text>{{ customer.customer_type }}</text>
        </view>
        <view v-if="customer.credit_limit !== undefined" class="customers__detail-row">
          <text>{{ t('customers.creditLimit') }}</text>
          <MoneyText :value="customer.credit_limit" currency />
        </view>
      </view>
    </StateView>

    <template #footer>
      <PermissionButton
        v-if="customer"
        permission="customers:update"
        :can="session.can"
        block
        @click="editCustomer"
      >
        {{ t('customers.edit') }}
      </PermissionButton>
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
import { customerService } from '../../services/customers'
import type { Customer } from '../../types'

const session = useSessionStore()
const customer = ref<Customer | null>(null)
const status = ref<'loading' | 'empty' | 'error' | 'success'>('loading')
const message = ref('')
const customerId = ref(0)

onLoad((query) => {
  customerId.value = Number(query?.id)
  void load()
})

async function load() {
  status.value = 'loading'
  message.value = ''
  try {
    customer.value = await customerService.detail(customerId.value)
    status.value = 'success'
  } catch (error) {
    customer.value = null
    status.value = 'error'
    message.value = isAppError(error) ? error.message : t('customers.loadFailed')
    logger.error('customers.detail_failed', {
      code: isAppError(error) ? error.code : 'UNKNOWN_ERROR',
    })
  }
}

function editCustomer() {
  uni.navigateTo({ url: `/features/customers/pages/form/index?id=${customerId.value}` })
}
</script>

<style scoped>
.customers__detail {
  background: var(--color-surface);
  border-radius: var(--radius-md);
  padding: var(--space-4);
}

.customers__detail-title,
.customers__detail-row {
  display: flex;
  gap: var(--space-3);
  justify-content: space-between;
}

.customers__detail-title {
  align-items: center;
  margin-bottom: var(--space-3);
}

.customers__detail-row {
  border-top: var(--hairline) solid var(--color-border);
  color: var(--color-text-secondary);
  padding: var(--space-3) 0;
}

.customers__detail-name {
  color: var(--color-text);
  font-size: var(--font-lg);
  font-weight: 600;
}
</style>
