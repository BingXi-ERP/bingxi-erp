<template>
  <view class="customer-picker" data-test="customer-picker" @click="openPicker">
    <WInput
      :model-value="customer?.customer_name ?? ''"
      :label="label"
      :placeholder="placeholder || t('customers.selectPlaceholder')"
      readonly
    />
  </view>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { t } from '../../../shared/i18n'
import WInput from '../../../shared/ui/wot/WInput.vue'
import type { Customer } from '../types'

const props = withDefaults(
  defineProps<{
    modelValue?: number | ''
    customer?: Customer
    label?: string
    placeholder?: string
    disabled?: boolean
  }>(),
  {
    modelValue: '',
    label: '',
    placeholder: '',
    disabled: false,
  },
)
const emit = defineEmits<{ 'update:modelValue': [value: number]; change: [customer: Customer] }>()

function onSelected(customer: Customer) {
  emit('update:modelValue', customer.id)
  emit('change', customer)
}

function openPicker() {
  if (props.disabled) return
  uni.navigateTo({ url: '/features/customers/pages/list/index?mode=select' })
}

onMounted(() => uni.$on('customer:selected', onSelected))
onUnmounted(() => uni.$off('customer:selected', onSelected))
</script>
