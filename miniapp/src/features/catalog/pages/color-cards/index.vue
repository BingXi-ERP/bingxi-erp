<template>
  <ListPageTemplate>
    <template #filter>
      <view class="catalog__filter">
        <WInput v-model="filters.keyword" :placeholder="t('catalog.colorCardSearch')" />
        <WButton size="small" @click="load">{{ t('catalog.search') }}</WButton>
      </view>
    </template>

    <StateView :status="status" :message="message" :retry="load">
      <view class="catalog__list">
        <view
          v-for="card in items"
          :key="card.id"
          class="catalog__card"
          data-test="color-card"
          @click="openCard(card.id)"
        >
          <view class="catalog__card-main">
            <text class="catalog__name">{{ card.card_name }}</text>
            <text class="catalog__code">{{ card.card_no }}</text>
          </view>
          <view class="catalog__meta">
            <text
              >{{ t('catalog.available') }} {{ card.stock_quantity - card.issued_quantity }}</text
            >
            <StatusTag domain="color-card" :value="card.status" />
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
import { t } from '../../../../shared/i18n'
import StateView from '../../../../shared/ui/StateView.vue'
import StatusTag from '../../../../shared/ui/StatusTag.vue'
import ListPageTemplate from '../../../../shared/ui/templates/ListPageTemplate.vue'
import WButton from '../../../../shared/ui/wot/WButton.vue'
import WInput from '../../../../shared/ui/wot/WInput.vue'
import { useColorCards } from '../../composables/useColorCards'

const { items, status, message, filters, loading, hasMore, load, loadMore } = useColorCards()

onLoad(() => void load())
onReachBottom(() => void loadMore())

function openCard(id: number) {
  uni.navigateTo({ url: `/features/catalog/pages/color-cards/detail?id=${id}` })
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
