<template>
  <view class="page form-page">
    <view class="form-page__content">
      <slot />
    </view>
    <view v-if="$slots.footer" class="form-page__footer">
      <slot name="footer" />
    </view>
  </view>
</template>

<script setup lang="ts">
/**
 * 表单页模板：表单分组在内容区滚动，提交与取消固定在底部操作区。
 * 操作区不传 footer 就不渲染，避免只有表单项却留一条空白底栏。
 */
</script>

<style scoped>
.form-page {
  display: flex;
  flex-direction: column;
  padding-bottom: 0;
}

.form-page__content {
  flex: 1;
}

.form-page__footer {
  background: var(--color-surface);
  border-top: var(--hairline) solid var(--color-border);
  display: flex;
  justify-content: space-between;
  padding: var(--space-2) var(--space-3);
}
</style>
