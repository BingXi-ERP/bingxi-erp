<template>
  <DetailPageTemplate>
    <StateView :status="status" :message="message" :retry="load">
      <view v-if="product" class="catalog__detail">
        <view class="catalog__detail-title">
          <text class="catalog__name">{{ product.name }}</text>
          <StatusTag domain="product" :value="product.status" />
        </view>
        <view class="catalog__detail-row">
          <text>{{ t('catalog.productCode') }}</text>
          <text>{{ product.code }}</text>
        </view>
        <view v-if="product.specification" class="catalog__detail-row">
          <text>{{ t('catalog.specification') }}</text>
          <text>{{ product.specification }}</text>
        </view>
        <view v-if="product.standard_price" class="catalog__detail-row">
          <text>{{ t('catalog.standardPrice') }}</text>
          <MoneyText :value="product.standard_price" currency />
        </view>
        <view class="catalog__colors">
          <text class="catalog__section-title">{{ t('catalog.colors') }}</text>
          <view v-for="color in colors" :key="color.id" class="catalog__color">
            <text>{{ color.color_no }} {{ color.color_name }}</text>
            <MoneyText :value="color.extra_cost" currency />
          </view>
        </view>
      </view>
    </StateView>
  </DetailPageTemplate>
</template>

<script setup lang="ts">
import { onLoad } from '@dcloudio/uni-app'
import { ref } from 'vue'
import { logger } from '../../../../shared/api/logger'
import { isAppError } from '../../../../shared/api/response'
import { t } from '../../../../shared/i18n'
import MoneyText from '../../../../shared/ui/MoneyText.vue'
import StateView from '../../../../shared/ui/StateView.vue'
import StatusTag from '../../../../shared/ui/StatusTag.vue'
import DetailPageTemplate from '../../../../shared/ui/templates/DetailPageTemplate.vue'
import { productService } from '../../services/products'
import type { Product, ProductColor } from '../../types'

const product = ref<Product | null>(null)
const colors = ref<ProductColor[]>([])
const status = ref<'loading' | 'empty' | 'error' | 'success'>('loading')
const message = ref('')
const productId = ref(0)

onLoad((query) => {
  productId.value = Number(query?.id)
  void load()
})

async function load() {
  status.value = 'loading'
  message.value = ''
  try {
    const [loadedProduct, loadedColors] = await Promise.all([
      productService.detail(productId.value),
      productService.colors(productId.value),
    ])
    product.value = loadedProduct
    colors.value = loadedColors
    status.value = 'success'
  } catch (error) {
    product.value = null
    colors.value = []
    status.value = 'error'
    message.value = isAppError(error) ? error.message : t('catalog.loadFailed')
    logger.error('products.detail_failed', {
      code: isAppError(error) ? error.code : 'UNKNOWN_ERROR',
    })
  }
}
</script>

<style scoped>
.catalog__detail {
  background: var(--color-surface);
  border-radius: var(--radius-md);
  padding: var(--space-4);
}

.catalog__detail-title,
.catalog__detail-row,
.catalog__color {
  display: flex;
  gap: var(--space-3);
  justify-content: space-between;
}

.catalog__detail-title,
.catalog__color {
  align-items: center;
}

.catalog__detail-row,
.catalog__color {
  border-top: var(--hairline) solid var(--color-border);
  color: var(--color-text-secondary);
  padding: var(--space-3) 0;
}

.catalog__name {
  color: var(--color-text);
  font-size: var(--font-lg);
  font-weight: 600;
}

.catalog__colors {
  margin-top: var(--space-3);
}

.catalog__section-title {
  color: var(--color-text);
  font-weight: 600;
}
</style>
