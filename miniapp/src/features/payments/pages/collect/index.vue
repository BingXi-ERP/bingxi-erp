<template>
  <FormPageTemplate>
    <view class="payments__form">
      <CustomerPicker
        v-model="form.customerId.value"
        :label="t('payments.customer')"
        @change="selectCustomer"
      />
      <WInput v-model="form.amount.value" :label="t('payments.amount')" type="digit" />
      <WSelect v-model="form.method.value" :label="t('payments.method')" :options="methodOptions" />
      <WInput v-model="form.paymentDate.value" :label="t('payments.date')" />
      <WInput v-model="form.remark.value" :label="t('payments.remark')" />
      <view v-if="form.error.value" class="payments__error">{{ form.error.value }}</view>
    </view>

    <template #footer>
      <WButton block :loading="form.submitting.value" :disabled="!canSubmit" @click="submit">
        {{ t('payments.save') }}
      </WButton>
    </template>
  </FormPageTemplate>
</template>

<script setup lang="ts">
import { onLoad } from '@dcloudio/uni-app'
import { computed, ref } from 'vue'
import type { Customer } from '../../../customers'
import { t } from '../../../../shared/i18n'
import FormPageTemplate from '../../../../shared/ui/templates/FormPageTemplate.vue'
import WButton from '../../../../shared/ui/wot/WButton.vue'
import WInput from '../../../../shared/ui/wot/WInput.vue'
import WSelect from '../../../../shared/ui/wot/WSelect.vue'
import { usePaymentForm } from '../../composables/usePaymentForm'

const form = usePaymentForm()
const selectedCustomer = ref<Customer | null>(null)
const canSubmit = computed(() => form.customerId.value > 0 && form.outstanding.value.trim() !== '')
const methodOptions = [
  { value: 'wechat', label: t('payments.methodWechat') },
  { value: 'alipay', label: t('payments.methodAlipay') },
  { value: 'cash', label: t('payments.methodCash') },
  { value: 'card', label: t('payments.methodCard') },
  { value: 'bank_transfer', label: t('payments.methodBankTransfer') },
]

onLoad((query) => {
  const customerId = Number(query?.customer_id)
  const outstanding = query?.outstanding
  if (Number.isInteger(customerId) && customerId > 0 && outstanding) {
    form.setCustomer(customerId, outstanding)
  }
})

function selectCustomer(customer: Customer) {
  selectedCustomer.value = customer
  if (!form.outstanding.value) {
    form.error.value = t('payments.outstandingRequired')
  }
}

async function submit() {
  const payment = await form.submit()
  if (payment) uni.navigateBack()
}
</script>

<style scoped>
.payments__form {
  background: var(--color-surface);
  border-radius: var(--radius-md);
  padding: var(--space-3);
}

.payments__error {
  color: var(--color-danger);
  margin-top: var(--space-3);
}
</style>
