<template>
  <view class="app-tab-bar" role="tablist">
    <view
      v-for="item in items"
      :key="item.path"
      class="app-tab-bar__item"
      role="tab"
      :aria-selected="true"
      :data-route="item.path"
      @click="navigate(item.path)"
    >
      <text>{{ t(item.labelKey) }}</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { logger } from '../api/logger'
import { t, type MessageKey } from '../i18n'

interface TabItem {
  path: string
  labelKey: MessageKey
}

const items: TabItem[] = [
  { path: '/features/workspace/pages/index/index', labelKey: 'tabBar.workspace' },
  { path: '/features/orders/pages/list/index', labelKey: 'tabBar.orders' },
]

function navigate(path: string) {
  uni.switchTab({
    url: path,
    fail: (error) => {
      logger.error('tab.navigation_failed', { path, error: error.errMsg })
    },
  })
}
</script>

<style scoped>
.app-tab-bar {
  background: var(--color-surface);
  border-top: var(--hairline) solid var(--color-border);
  bottom: 0;
  left: 0;
  padding-bottom: env(safe-area-inset-bottom);
  position: fixed;
  right: 0;
  z-index: 10;
}

.app-tab-bar__item {
  align-items: center;
  color: var(--color-primary);
  display: flex;
  font-size: var(--font-md);
  justify-content: center;
  padding: var(--space-2) 0;
}
</style>
