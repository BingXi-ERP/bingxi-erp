<template>
  <wd-button
    v-bind="$attrs"
    :type="type"
    :disabled="disabled || loading"
    :loading="loading"
    @click="onClick"
  >
    <slot />
  </wd-button>
</template>

<script setup lang="ts">
/**
 * 按钮的唯一入口：业务代码只 import 本组件，不直接写 wd-button。
 * wd-* 组件通过 pages.json 的 easycom 规则按需引入（组件库官方接法），
 * 因此这里不出现对 wot-design-uni 的 import，业务侧的引用面永远只有 shared/ui/wot/*。
 * 其余组件库属性（size / block / plain / native-type 等）由 $attrs 透传。
 */
defineOptions({ inheritAttrs: false })

withDefaults(
  defineProps<{
    type?: 'primary' | 'success' | 'warning' | 'error' | 'info'
    disabled?: boolean
    loading?: boolean
  }>(),
  {
    type: 'primary',
    disabled: false,
    loading: false,
  },
)

const emit = defineEmits<{ click: [event: MouseEvent] }>()

function onClick(event: MouseEvent) {
  emit('click', event)
}
</script>
