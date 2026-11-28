<template>
  <view class="page list-page">
    <view v-if="$slots.filter" class="list-page__filter">
      <slot name="filter" />
    </view>
    <view class="list-page__content">
      <slot />
    </view>
    <view v-if="$slots.footer" class="list-page__footer">
      <slot name="footer" />
    </view>
  </view>
</template>

<script setup lang="ts">
/**
 * 列表页模板：筛选区在上、列表在中、合计或批量操作在底部吸住。
 * 三个区域都是插槽，页面不传就不渲染，避免出现空白的筛选条与底栏。
 */
</script>

<style scoped>
.list-page {
  display: flex;
  flex-direction: column;
  padding-bottom: 0;
}

.list-page__filter {
  background: var(--color-surface);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-card);
  margin-bottom: var(--space-3);
  padding: var(--space-2) var(--space-3);
}

.list-page__content {
  flex: 1;
}

.list-page__footer {
  background: var(--color-surface);
  border-top: var(--hairline) solid var(--color-border);
  padding: var(--space-2) var(--space-3);
}
</style>
