<template>
  <view class="page detail-page">
    <view class="detail-page__content">
      <slot />
    </view>
    <view v-if="$slots.footer" class="detail-page__footer">
      <slot name="footer" />
    </view>
  </view>
</template>

<script setup lang="ts">
/**
 * 详情页模板：主体是只读明细，审批、提交之类的行级操作放在底部操作区。
 * 操作区随权限决定是否渲染（由调用方控制 footer 插槽），模板自身不做权限判断。
 */
</script>

<style scoped>
.detail-page {
  display: flex;
  flex-direction: column;
  padding-bottom: 0;
}

.detail-page__content {
  flex: 1;
}

.detail-page__footer {
  background: var(--color-surface);
  border-top: var(--hairline) solid var(--color-border);
  display: flex;
  justify-content: space-between;
  padding: var(--space-2) var(--space-3);
}
</style>
