<template>
  <DetailPageTemplate>
    <StateView :status="status" :message="message" :retry="load">
      <view v-if="card" class="catalog__detail">
        <view class="catalog__detail-title">
          <text class="catalog__name">{{ card.card_name }}</text>
          <StatusTag domain="color-card" :value="card.status" />
        </view>
        <view class="catalog__detail-row">
          <text>{{ t('catalog.cardNo') }}</text>
          <text>{{ card.card_no }}</text>
        </view>
        <view class="catalog__detail-row">
          <text>{{ t('catalog.available') }}</text>
          <text>{{ card.stock_quantity - card.issued_quantity }}</text>
        </view>
        <view class="catalog__colors">
          <text class="catalog__section-title">{{ t('catalog.colors') }}</text>
          <view v-for="item in card.items" :key="item.id" class="catalog__color">
            <text>{{ item.color_code }} {{ item.color_name }}</text>
            <text>{{ item.hex_value }}</text>
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
import StateView from '../../../../shared/ui/StateView.vue'
import StatusTag from '../../../../shared/ui/StatusTag.vue'
import DetailPageTemplate from '../../../../shared/ui/templates/DetailPageTemplate.vue'
import { colorCardService } from '../../services/colorCards'
import type { ColorCardDetail } from '../../types'

const card = ref<ColorCardDetail | null>(null)
const status = ref<'loading' | 'empty' | 'error' | 'success'>('loading')
const message = ref('')
const cardId = ref(0)

onLoad((query) => {
  cardId.value = Number(query?.id)
  void load()
})

async function load() {
  status.value = 'loading'
  message.value = ''
  try {
    card.value = await colorCardService.detail(cardId.value)
    status.value = 'success'
  } catch (error) {
    card.value = null
    status.value = 'error'
    message.value = isAppError(error) ? error.message : t('catalog.loadFailed')
    logger.error('color_cards.detail_failed', {
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
