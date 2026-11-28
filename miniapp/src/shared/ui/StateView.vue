<template>
  <view class="state-view">
    <view v-if="status === 'loading'" class="state-view__hint">{{ t('stateView.loading') }}</view>
    <view v-else-if="status === 'empty'" class="state-view__hint">{{ emptyText }}</view>
    <view v-else-if="status === 'error'" class="state-view__error">
      <text class="state-view__hint">{{ errorText }}</text>
      <button v-if="retry" class="state-view__retry" size="mini" @click="onRetry">
        {{ t('stateView.retry') }}
      </button>
    </view>
    <slot v-else />
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { t } from '../i18n'

/**
 * 列表与详情的统一状态外壳：加载中、空态、错误态（带重试）与正常内容共用一个占位区域，
 * 页面只负责给出状态与文案，不再各自画一套空盒子。
 * 默认文案集中在这里，页面传入 message 时以页面文案为准。
 */
const props = withDefaults(
  defineProps<{
    status: 'loading' | 'empty' | 'error' | 'success'
    message?: string
    retry?: () => void
  }>(),
  {
    status: 'success',
    message: '',
    retry: undefined,
  },
)

const emptyText = computed(() => (props.message.length > 0 ? props.message : t('stateView.empty')))
const errorText = computed(() => (props.message.length > 0 ? props.message : t('stateView.error')))

function onRetry() {
  // 重试按钮只在 retry 存在时渲染，这里不需要再判一次存在性。
  props.retry?.()
}
</script>

<style scoped>
.state-view {
  align-items: center;
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: var(--space-4);
}

.state-view__hint {
  color: var(--color-text-secondary);
  font-size: var(--font-md);
}

.state-view__error {
  align-items: center;
  display: flex;
  flex-direction: column;
}

.state-view__retry {
  background: var(--color-primary);
  border-radius: var(--radius-sm);
  color: var(--color-surface);
  font-size: var(--font-sm);
  margin-top: var(--space-2);
  padding: var(--space-1) var(--space-3);
}

/* 微信原生 button 自带一圈伪元素边框，落在主色上会露白边，这里去掉。 */
.state-view__retry::after {
  border: none;
}
</style>
