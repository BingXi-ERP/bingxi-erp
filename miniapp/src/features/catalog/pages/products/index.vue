<template>
  <ListPageTemplate>
    <template #filter>
      <view class="catalog__filter">
        <WInput v-model="filters.search" :placeholder="t('catalog.productSearch')" />
        <WButton size="small" @click="load">{{ t('catalog.search') }}</WButton>
      </view>
    </template>

    <StateView :status="status" :message="message" :retry="load">
      <view class="catalog__list">
        <view
          v-for="product in items"
          :key="product.id"
          class="catalog__card"
          data-test="product-card"
          @click="openProduct(product)"
        >
          <view class="catalog__card-main">
            <text class="catalog__name">{{ product.name }}</text>
            <text class="catalog__code">{{ product.code }}</text>
          </view>
          <view class="catalog__meta">
            <text v-if="product.specification">{{ product.specification }}</text>
            <MoneyText v-if="product.standard_price" :value="product.standard_price" currency />
            <StatusTag domain="product" :value="product.status" />
          </view>
        </view>
      </view>
      <WButton v-if="hasMore" block :loading="loading" @click="loadMore">
        {{ t('stateView.loading') }}
      </WButton>
    </StateView>
  </ListPageTemplate>
</template>

<script setup lang="ts">
import { onLoad, onReachBottom } from '@dcloudio/uni-app'
import { ref } from 'vue'
import { t } from '../../../../shared/i18n'
import MoneyText from '../../../../shared/ui/MoneyText.vue'
import StateView from '../../../../shared/ui/StateView.vue'
import StatusTag from '../../../../shared/ui/StatusTag.vue'
import ListPageTemplate from '../../../../shared/ui/templates/ListPageTemplate.vue'
import WButton from '../../../../shared/ui/wot/WButton.vue'
import WInput from '../../../../shared/ui/wot/WInput.vue'
import { useProducts } from '../../composables/useProducts'
import type { Product } from '../../types'

const { items, status, message, filters, loading, hasMore, load, loadMore } = useProducts()
const mode = ref('')

onLoad((query) => {
  mode.value = query?.mode === 'select' ? 'select' : ''
  void load()
})
onReachBottom(() => void loadMore())

function openProduct(product: Product) {
  if (mode.value === 'select') {
    uni.$emit('product:selected', product)
    uni.navigateBack()
    return
  }
  uni.navigateTo({ url: `/features/catalog/pages/products/detail?id=${product.id}` })
}
</script>

<style scoped>
.catalog__filter {
  display: flex;
  gap: var(--space-2);
}

.catalog__list {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.catalog__card {
  background: var(--color-surface);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-card);
  padding: var(--space-4);
}

.catalog__card-main,
.catalog__meta {
  display: flex;
  gap: var(--space-2);
  justify-content: space-between;
}

.catalog__meta {
  align-items: center;
  color: var(--color-text-secondary);
  margin-top: var(--space-2);
}

.catalog__name {
  color: var(--color-text);
  font-size: var(--font-lg);
  font-weight: 600;
}

.catalog__code {
  color: var(--color-text-secondary);
}
</style>
