<template>
  <FormPageTemplate>
    <view class="customers__form">
      <WInput v-model="form.customer_name" :label="t('customers.name')" />
      <WInput v-if="!customerId" v-model="form.customer_code" :label="t('customers.code')" />
      <WInput v-model="form.contact_person" :label="t('customers.contact')" />
      <WInput v-model="form.contact_phone" :label="t('customers.phone')" type="tel" />
      <WSelect v-model="form.customer_type" :label="t('customers.type')" :options="typeOptions" />
      <WSelect v-model="form.status" :label="t('customers.status')" :options="statusOptions" />
      <WInput v-model="form.credit_limit" :label="t('customers.creditLimit')" type="digit" />
      <WInput v-model="form.address" :label="t('customers.address')" />
      <view v-if="error" class="customers__error" data-test="customer-form-error">{{ error }}</view>
    </view>

    <template #footer>
      <WButton block :loading="submitting" @click="submit">{{ t('customers.save') }}</WButton>
    </template>
  </FormPageTemplate>
</template>

<script setup lang="ts">
import { onLoad } from '@dcloudio/uni-app'
import { reactive, ref } from 'vue'
import { logger } from '../../../../shared/api/logger'
import { isAppError } from '../../../../shared/api/response'
import { t } from '../../../../shared/i18n'
import FormPageTemplate from '../../../../shared/ui/templates/FormPageTemplate.vue'
import WButton from '../../../../shared/ui/wot/WButton.vue'
import WInput from '../../../../shared/ui/wot/WInput.vue'
import WSelect from '../../../../shared/ui/wot/WSelect.vue'
import { customerService } from '../../services/customers'
import type { Customer, CustomerInput } from '../../types'

const form = reactive<CustomerInput>({
  customer_name: '',
  customer_code: '',
  contact_person: '',
  contact_phone: '',
  customer_type: 'other',
  status: 'active',
  credit_limit: '0.00',
  address: '',
})
const customerId = ref(0)
const submitting = ref(false)
const error = ref('')
const typeOptions = [
  { value: 'retail', label: t('customers.typeRetail') },
  { value: 'wholesale', label: t('customers.typeWholesale') },
  { value: 'distributor', label: t('customers.typeDistributor') },
  { value: 'manufacturer', label: t('customers.typeManufacturer') },
  { value: 'other', label: t('customers.typeOther') },
]
const statusOptions = [
  { value: 'active', label: t('customers.statusActive') },
  { value: 'inactive', label: t('customers.statusInactive') },
]

onLoad(async (query) => {
  if (!query?.id) return
  customerId.value = Number(query.id)
  try {
    const customer: Customer = await customerService.detail(customerId.value)
    form.customer_name = customer.customer_name
    form.contact_person = customer.contact_person ?? ''
    form.contact_phone = customer.contact_phone ?? ''
    form.customer_type = customer.customer_type
    form.status = customer.status === 'active' ? 'active' : 'inactive'
    form.credit_limit = customer.credit_limit ?? '0.00'
    form.address = customer.address ?? ''
  } catch (loadError) {
    error.value = isAppError(loadError) ? loadError.message : t('customers.loadFailed')
    logger.error('customers.form_load_failed', {
      code: isAppError(loadError) ? loadError.code : 'UNKNOWN_ERROR',
    })
  }
})

async function submit() {
  error.value = ''
  if (!form.customer_name.trim()) {
    error.value = t('customers.nameRequired')
    return
  }
  submitting.value = true
  try {
    if (customerId.value) {
      await customerService.update(customerId.value, form)
    } else {
      await customerService.create(form)
    }
    uni.navigateBack()
  } catch (submitError) {
    error.value = isAppError(submitError) ? submitError.message : t('customers.saveFailed')
    logger.error('customers.form_submit_failed', {
      code: isAppError(submitError) ? submitError.code : 'UNKNOWN_ERROR',
    })
  } finally {
    submitting.value = false
  }
}
</script>

<style scoped>
.customers__form {
  background: var(--color-surface);
  border-radius: var(--radius-md);
  padding: var(--space-3);
}

.customers__error {
  color: var(--color-danger);
  margin-top: var(--space-3);
}
</style>
