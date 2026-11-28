<template>
  <view class="product-picker" data-test="product-picker" @click="openPicker">
    <WInput
      :model-value="product?.name ?? ''"
      :label="label"
      :placeholder="placeholder || t('catalog.selectProduct')"
      readonly
    />
  </view>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { logger } from '../../../shared/api/logger'
import { isAppError } from '../../../shared/api/response'
import { t } from '../../../shared/i18n'
import WInput from '../../../shared/ui/wot/WInput.vue'
import { productService } from '../services/products'
import type { Product, ProductColor } from '../types'

const props = withDefaults(
  defineProps<{
    modelValue?: number | ''
    product?: Product
    colors?: ProductColor[]
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
const emit = defineEmits<{
  'update:modelValue': [value: number]
  change: [selection: { product: Product; colors: ProductColor[] }]
}>()
const loading = ref(false)

async function onSelected(product: Product) {
  loading.value = true
  try {
    const colors = await productService.colors(product.id)
    emit('update:modelValue', product.id)
    emit('change', { product, colors })
  } catch (error) {
    logger.error('products.picker_colors_failed', {
      code: isAppError(error) ? error.code : 'UNKNOWN_ERROR',
    })
  } finally {
    loading.value = false
  }
}

function openPicker() {
  if (props.disabled || loading.value) return
  uni.navigateTo({ url: '/features/catalog/pages/products/index?mode=select' })
}

onMounted(() => uni.$on('product:selected', onSelected))
onUnmounted(() => uni.$off('product:selected', onSelected))
</script>
